/**
 * Job-costing parity: the app's _jobFinance (with its real helpers for
 * cost buckets, card fees and commission shares) against jobFinance, on the
 * sample's WO-330 and on random jobs.
 */
import { describe, expect, it } from 'vitest';
import { CARD_FEE, jobFinance, paymentFee, type CostInvoice, type CostLine, type JobCostEntry, type JobPO, type Payable } from '../../src/lib/logic';
import { reps, thread } from '../../src/data/sample-data';
import { code, sandbox } from './app-source';
import { money, pick, rng } from './helpers';

const FNS = ['_jobFinance', '_invPaidAmt', '_jcRollup', '_jcForJob', '_jcAll', '_jcAmount', '_jcBucket', '_jobRepShares', '_invProcessingFees', '_payProcessingFee', '_isCardPayment', '_cardFeeRate', '_jcEstimate', '_jcActual'];

interface Job {
  materials: CostLine[];
  labors: CostLine[];
  invoices: CostInvoice[];
  pos: JobPO[];
  costs: JobCostEntry[];
  payables: Payable[];
  reps: Array<{ id: string; name: string; rate: number }>;
  basis: 'profit' | 'revenue';
  taxRate: number;
}

function runApp(job: Job) {
  const j = {
    id: 'j1', number: 'WO-1', materials: job.materials, labors: job.labors, taxRate: job.taxRate,
    salesRepId: job.reps[0]?.id ?? '', salesRep: job.reps[0]?.name ?? '', salesRepId2: job.reps[1]?.id ?? '', salesRep2: job.reps[1]?.name ?? '',
  };
  const data = {
    invoices: job.invoices.map((i) => ({ ...i, jobId: 'j1' })),
    jobPOs: job.pos.map((p) => ({ ...p, jobId: 'j1' })),
    jobCosts: job.costs.map((c) => ({ ...c, jobId: 'j1' })),
    payables: job.payables.map((p) => ({ ...p, jobId: 'j1' })),
    contractors: job.reps.map((r) => ({ id: r.id, name: r.name, commissionRate: r.rate })),
    quotes: [],
  };
  const fns = sandbox<{ _jobFinance: (j: unknown) => Record<string, number>; _jcEstimate: (f: unknown) => number; _jcActual: (f: unknown) => number }>(
    'index', { consts: ['CARD_FEE_PCT_DEFAULT'], fns: FNS }, { data, getQuote: () => undefined, finSettings: () => ({ commissionBasis: job.basis }) },
  );
  const f = fns._jobFinance(j);
  return { f, estimate: fns._jcEstimate(f), actual: fns._jcActual(f) };
}

const FIELDS = ['revenue', 'retail', 'tax', 'invTotal', 'outstanding', 'matQuoted', 'matCost', 'poCost', 'laborQuoted', 'laborCost', 'otherCost', 'feeCost', 'commission', 'profit', 'margin', 'collected', 'quotedProfit'] as const;

function compare(job: Job) {
  const { f: a, estimate, actual } = runApp(job);
  const s = jobFinance({ ...job, reps: job.reps.map((r) => ({ name: r.name, rate: r.rate })), commissionBasis: job.basis });
  for (const k of FIELDS) expect(s[k], k).toBeCloseTo(a[k]!, 9);
  expect(s.matActual).toBe(a.matActual);
  expect(s.laborActual).toBe(a.laborActual);
  expect(s.estimate).toBeCloseTo(estimate, 9);
  expect(s.actual).toBeCloseTo(actual, 9);
}

describe('job finance (_jobFinance)', () => {
  it('the sample WO-330', () => {
    const wo = thread.workOrder;
    const inv = thread.invoice;
    const rep = reps.find((r) => r.id === wo.salesRepId)!;
    compare({
      materials: wo.materials, labors: wo.labors,
      invoices: [{ subtotal: inv.subtotal, tax: inv.tax, total: inv.total, payments: inv.payments, status: inv.status }],
      pos: thread.jobCosts.pos, costs: thread.jobCosts.entries, payables: [],
      reps: [{ id: rep.id, name: rep.name, rate: rep.commissionRate }], basis: 'profit', taxRate: inv.taxRate,
    });
  });

  it('random jobs: quoted-only, actuals, payables, fees, one or two reps, both commission bases', () => {
    const r = rng(42);
    const kinds = ['contractor', 'receipt', 'freight', 'supply', 'other'] as const;
    const cats = ['', 'Materials', 'Labor', 'Freight', 'Supplies', 'Equipment', 'Subcontractor', 'Delivery'];
    const methods = ['Check', 'Card', 'Credit Card (Stripe)', 'ACH / Transfer', 'Cash'];
    for (let n = 0; n < 400; n++) {
      const line = (): CostLine => ({ quantity: r() < 0.1 ? '' : money(r, 1500), companyCost: money(r, 15), retailPrice: money(r, 30) });
      const invoices: CostInvoice[] = Array.from({ length: Math.floor(r() * 3) }, () => {
        const subtotal = money(r, 20000);
        const tax = money(r, 1500);
        return {
          subtotal: r() < 0.2 ? null : subtotal, tax, total: subtotal + tax, status: r() < 0.1 ? 'void' : 'unpaid',
          payments: Array.from({ length: Math.floor(r() * 3) }, () => ({ amount: money(r, 9000), method: pick(r, methods), ...(r() < 0.2 ? { processingFee: money(r, 50) } : {}) })),
        };
      });
      compare({
        materials: Array.from({ length: Math.floor(r() * 4) }, line),
        labors: Array.from({ length: Math.floor(r() * 3) }, line),
        invoices,
        pos: Array.from({ length: Math.floor(r() * 3) }, () => ({ totalCost: money(r, 5000), status: r() < 0.15 ? 'cancelled' : 'ordered' })),
        costs: Array.from({ length: Math.floor(r() * 4) }, () => ({
          kind: pick(r, kinds), category: pick(r, cats), amount: r() < 0.2 ? 0 : money(r, 2000), quantity: Math.floor(r() * 5), unitCost: money(r, 20),
          paid: r() < 0.5, status: r() < 0.1 ? 'void' as const : 'active' as const,
        })),
        payables: Array.from({ length: Math.floor(r() * 3) }, () => ({ amount: money(r, 3000), category: pick(r, [...cats, 'Commission']), source: pick(r, [null, 'po', 'commission', 'manual']), status: r() < 0.1 ? 'void' : 'open' })),
        reps: Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({ id: `rep-${i}`, name: `Rep ${i}`, rate: pick(r, [0, 5, 8, 10]) })),
        basis: r() < 0.3 ? 'revenue' : 'profit',
        taxRate: pick(r, [0.08265, 0.076, 0]),
      });
    }
  });
});

describe('card fees (_payProcessingFee)', () => {
  const fns = sandbox<{ _payProcessingFee: (p: unknown) => number }>('index', { consts: ['CARD_FEE_PCT_DEFAULT'], fns: ['_payProcessingFee', '_isCardPayment', '_cardFeeRate'] }, { finSettings: () => ({}) });
  it('same fee for every amount × method, stamped or not', () => {
    for (const method of ['Card', 'Credit Card (Stripe)', 'stripe', 'Check', '', 'Visa card']) for (let amt = -10; amt <= 12000; amt += 13.37) {
      const p = { amount: Math.round(amt * 100) / 100, method };
      expect(paymentFee(p)).toBe(fns._payProcessingFee(p));
      expect(paymentFee({ ...p, processingFee: 1.23 })).toBe(fns._payProcessingFee({ ...p, processingFee: 1.23 }));
    }
  });
  it('default rate is 2.9% + $0.30', () => {
    expect(code('index:const:CARD_FEE_PCT_DEFAULT')).toBe(`const CARD_FEE_PCT_DEFAULT=${CARD_FEE.pct}, CARD_FEE_FIXED_DEFAULT=0.30;`);
  });
});
