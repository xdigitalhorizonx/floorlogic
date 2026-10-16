/**
 * Job-costing parity: the app's _jobFinance (with its real helpers for
 * cost buckets, card fees, commission shares and PO totals incl. freight)
 * against jobFinance, on the sample's WO-330 and on random jobs; the payout
 * queue rules (_jcPaidInFull, _jcCommissionOwed); the job page's metric bar
 * and the list's Variance card; card fees.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_FEE, commissionOwed, fmtMoney, groupStatus, jobCostingMetrics, jobFinance, jobPaidInFull, paymentFee, poTotal, varianceView,
  type CostInvoice, type CostLine, type JobCostEntry, type JobPO, type Payable,
} from '../../src/lib/logic';
import { reps, thread } from '../../src/data/sample-data';
import { code, sandbox } from './app-source';
import { money, pick, rng } from './helpers';

const FNS = ['_jobFinance', '_invPaidAmt', '_jcRollup', '_jcForJob', '_jcAll', '_jcAmount', '_jcBucket', '_jobRepShares', '_invProcessingFees', '_payProcessingFee', '_isCardPayment', '_cardFeeRate', '_jcEstimate', '_jcActual', '_jpoTotal'];

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

const FIELDS = ['revenue', 'retail', 'tax', 'invTotal', 'outstanding', 'matQuoted', 'matCost', 'poCost', 'laborQuoted', 'laborCost', 'otherCost', 'feeCost', 'commission', 'preCommProfit', 'profit', 'margin', 'collected', 'quotedProfit'] as const;

function compare(job: Job) {
  const { f: a, estimate, actual } = runApp(job);
  const s = jobFinance({ ...job, reps: job.reps.map((r) => ({ name: r.name, rate: r.rate })), commissionBasis: job.basis });
  for (const k of FIELDS) expect(s[k], k).toBeCloseTo(a[k]!, 9);
  expect(s.matActual).toBe(a.matActual);
  expect(s.laborActual).toBe(a.laborActual);
  expect(s.estimate).toBeCloseTo(estimate, 9);
  expect(s.actual).toBeCloseTo(actual, 9);
  return s;
}

describe('job finance (_jobFinance)', () => {
  it('the sample WO-330', () => {
    const wo = thread.workOrder;
    const inv = thread.invoice;
    const rep = reps.find((r) => r.id === wo.salesRepId)!;
    const s = compare({
      materials: wo.materials, labors: wo.labors,
      invoices: [{ subtotal: inv.subtotal, tax: inv.tax, total: inv.total, payments: inv.payments, status: inv.status }],
      pos: thread.jobCosts.pos, costs: thread.jobCosts.entries, payables: [],
      reps: [{ id: rep.id, name: rep.name, rate: rep.commissionRate }], basis: 'profit', taxRate: inv.taxRate,
    });
    // margin is now before commission
    expect(s.margin).toBeCloseTo((s.preCommProfit / s.revenue) * 100, 9);
  });

  it('random jobs: quoted-only, actuals, PO freight, cancelled-PO bills, fees, one or two reps, both commission bases', () => {
    const r = rng(42);
    const kinds = ['contractor', 'receipt', 'freight', 'supply', 'other'] as const;
    const cats = ['', 'Materials', 'Labor', 'Freight', 'Supplies', 'Equipment', 'Subcontractor', 'Delivery'];
    const methods = ['Check', 'Card', 'Credit Card (Stripe)', 'ACH / Transfer', 'Cash'];
    let cancelledBills = 0;
    for (let n = 0; n < 500; n++) {
      const line = (): CostLine => ({ quantity: r() < 0.1 ? '' : money(r, 1500), companyCost: money(r, 15), retailPrice: money(r, 30) });
      const invoices: CostInvoice[] = Array.from({ length: Math.floor(r() * 3) }, () => {
        const subtotal = money(r, 20000);
        const tax = money(r, 1500);
        return {
          subtotal: r() < 0.2 ? null : subtotal, tax, total: subtotal + tax, status: r() < 0.1 ? 'void' : 'unpaid',
          payments: Array.from({ length: Math.floor(r() * 3) }, () => ({ amount: money(r, 9000), method: pick(r, methods), ...(r() < 0.2 ? { processingFee: money(r, 50) } : {}) })),
        };
      });
      const pos: JobPO[] = Array.from({ length: Math.floor(r() * 4) }, (_, i) => ({
        id: `po${i}`, totalCost: money(r, 5000), status: r() < 0.25 ? 'cancelled' : pick(r, ['ordered', 'received', 'pending']),
        ...(r() < 0.5 ? { freight: r() < 0.2 ? null : money(r, 150) } : {}),
      }));
      const payables: Payable[] = Array.from({ length: Math.floor(r() * 4) }, () => {
        const linked = pos.length && r() < 0.5 ? pick(r, pos) : null;
        if (linked?.status === 'cancelled') cancelledBills++;
        return {
          amount: money(r, 3000), category: pick(r, [...cats, 'Commission']), status: r() < 0.1 ? 'void' : 'open',
          ...(linked ? { poId: linked.id, source: 'po' } : { source: pick(r, [null, 'po', 'commission', 'manual']) }),
        };
      });
      compare({
        materials: Array.from({ length: Math.floor(r() * 4) }, line),
        labors: Array.from({ length: Math.floor(r() * 3) }, line),
        invoices,
        pos,
        costs: Array.from({ length: Math.floor(r() * 4) }, () => ({
          kind: pick(r, kinds), category: pick(r, cats), amount: r() < 0.2 ? 0 : money(r, 2000), quantity: Math.floor(r() * 5), unitCost: money(r, 20),
          paid: r() < 0.5, status: r() < 0.1 ? 'void' as const : 'active' as const,
        })),
        payables,
        reps: Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({ id: `rep-${i}`, name: `Rep ${i}`, rate: pick(r, [0, 5, 8, 10]) })),
        basis: r() < 0.3 ? 'revenue' : 'profit',
        taxRate: pick(r, [0.08265, 0.076, 0]),
      });
    }
    expect(cancelledBills).toBeGreaterThan(20); // the new cancelled-PO rule is exercised
  });

  it('PO total = goods + estimated freight (_jpoTotal)', () => {
    const fns = sandbox<{ _jpoTotal: (p: unknown) => number }>('index', { fns: ['_jpoTotal'] });
    for (const p of [null, {}, { totalCost: 372 }, { totalCost: 372, freight: 25 }, { totalCost: '10', freight: '2.5' }, { freight: 9 }, { totalCost: 1, freight: null }]) {
      expect(poTotal(p as JobPO)).toBe(fns._jpoTotal(p));
    }
  });
});

describe('payout queue (_jcPaidInFull / _jcCommissionOwed)', () => {
  const fns = sandbox<{ _jcPaidInFull: (f: unknown) => boolean; _jcCommissionOwed: (f: unknown) => boolean; _jcGroupStatus: (f: unknown) => string }>('index', {
    consts: ['PIPELINE_STAGES'], fns: ['_jcPaidInFull', '_jcGroupStatus', '_jcCommissionOwed'],
  });
  const STATUS_SETS = [['ready_to_be_paid'], ['final_invoice'], ['paid'], ['complete', 'ready_to_be_paid'], ['scheduled', 'paid'], ['on_hold'], ['final_invoice', 'ready_to_be_paid'], ['cancelled', 'paid']];
  it('paid in full: the balance when invoiced, the stage when not', () => {
    for (const statuses of STATUS_SETS) for (const invTotal of [0, 0.004, 100, 8624.7]) for (const outstanding of [0, 0.005, 0.006, 50]) {
      const members = statuses.map((status) => ({ status }));
      const fin = { invTotal, outstanding, members, parent: members[0] };
      expect(groupStatus(statuses)).toBe(fns._jcGroupStatus(fin));
      expect(jobPaidInFull({ invTotal, outstanding }, statuses), JSON.stringify(fin)).toBe(fns._jcPaidInFull(fin));
    }
  });
  it('commission owed: commission > ½¢ and a rep on a live rate not yet paid out', () => {
    for (const commission of [0, 0.005, 0.01, 248.89]) for (const paidAt of [null, '2026-10-20']) for (const rates of [[], [0], [8], [0, 10], ['5']]) for (const second of [false, true]) {
      const parts = [{ job: { commissionPaidAt: paidAt }, fin: { reps: rates.map((rate) => ({ rate })) } }];
      if (second) parts.push({ job: { commissionPaidAt: null }, fin: { reps: [{ rate: 0 }] } });
      const site = commissionOwed(commission, parts.map((p) => ({ commissionPaidAt: p.job.commissionPaidAt, repRates: p.fin.reps.map((x) => x.rate) })));
      expect(site, JSON.stringify({ commission, parts })).toBe(fns._jcCommissionOwed({ commission, parts }));
    }
  });
});

describe('what the Job Costing screens print', () => {
  it('the job page’s seven-figure bar (_jcMetricBar items)', () => {
    const tpl = code('index:text:jc-metric-bar');
    const list = tpl.replace(/^\$\{_jcMetricBar\(\[/, '[').replace(/\]\)\}$/, ']');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function('fin', 'est', 'act', 'recTot', 'fmt$', `return ${list};`) as (...a: unknown[]) => Array<Record<string, unknown>>;
    const appFmt = (n: unknown) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    for (const [est, act] of [[4883.7875, 5072.92], [1726, 1690], [100, 100], [100, 100.004], [100, 99.996], [0, 0], [10, 0.5]]) {
      for (const revSource of ['invoice', 'quoted'] as const) for (const margin of [35.0123, -4.2]) for (const profit of [2862.26, -250]) for (const rec of [{ count: 0 }, { count: 1 }, { count: 6, bills: 2 }]) {
        for (const isGroup of [false, true]) {
          const fin = { revenue: 8184.07, revSource, tax: 440.63, taxSource: revSource, margin, profit, estimate: est!, actual: act!, isGroup, members: isGroup ? [{}, {}] : [{}] };
          const a = run(fin, est, act, { n: rec.count, bills: rec.bills ?? 0 }, appFmt);
          const s = jobCostingMetrics(fin, rec, fin.members.length);
          expect(s.map((m) => [m.label, m.private ? `<span class="qb-private">${m.value}</span>` : m.value, m.tone ?? undefined, m.note, m.title]))
            .toEqual(a.map((m) => [m.label, m.value, m.tone, m.note, m.title]));
        }
      }
    }
    expect(jobCostingMetrics({ revenue: 1, revSource: 'invoice', tax: 0, taxSource: 'invoice', margin: 0, profit: 0, estimate: 1726, actual: 1690 }, { count: 1 })[3]!.value).toBe('−$36.00');
  });

  it('the list’s Variance card (_jcFullStats)', () => {
    const tpl = code('index:text:jc-list-variance').replace(/^\$\{/, '').replace(/\}$/, '');
    for (const v of [189.13, -83.79, 0, 0.004, -0.004, 0.006]) {
      let got: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function('variance', '_acctStatCard', 'fmt$', tpl)(v, (...args: string[]) => { got = args; }, fmtMoney);
      const s = varianceView(v, 0);
      expect([got[0], got[1], got[2], got[3]]).toEqual(['Variance', s.text, s.label, s.tone]);
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
