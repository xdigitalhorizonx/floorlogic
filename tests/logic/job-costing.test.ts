import { describe, expect, it } from 'vitest';
import {
  bucketDelta, CARD_FEE, commissionOwed, groupStatus, isCardPayment, isPrivateField, JC_SCOPES, jobCostAmount, jobCostBucket, jobCostingMetrics, jobFinance,
  jobPaidInFull, paymentFee, poTotal, PRIVACY_MODE, PRIVATE_FIELDS, rollupJobCosts, varianceView, type CostLine,
} from '../../src/lib/logic';

describe('card fees', () => {
  it('2.9% + $0.30 per card payment, rounded to the cent', () => {
    expect(CARD_FEE).toEqual({ pct: 2.9, fixed: 0.3 });
    expect(paymentFee({ amount: 4312.35, method: 'Credit Card (Stripe)' })).toBe(125.36);
    expect(paymentFee({ amount: 100, method: 'Card' })).toBe(3.2);
    expect(paymentFee({ amount: 100, method: 'Check' })).toBe(0);
    expect(paymentFee({ amount: 0, method: 'Card' })).toBe(0);
  });
  it('a fee stamped on the payment wins', () => {
    expect(paymentFee({ amount: 100, method: 'Card', processingFee: 2.5 })).toBe(2.5);
    expect(paymentFee({ amount: 100, method: 'Check', processingFee: 1 })).toBe(1);
  });
  it('card = "card" or "stripe" anywhere in the method', () => {
    expect(['Credit Card (Stripe)', 'stripe', 'CARD', 'Check', 'ACH / Transfer', ''].map((m) => isCardPayment(m))).toEqual([true, true, true, false, false, false]);
  });
});

describe('job cost entries', () => {
  it.each([
    [{ kind: 'contractor' }, 'labor'],
    [{ kind: 'supply' }, 'supply'],
    [{ kind: 'freight' }, 'material'],
    [{ kind: 'receipt', category: 'Materials' }, 'material'],
    [{ kind: 'receipt', category: 'Delivery' }, 'material'],
    [{ kind: 'receipt', category: 'Subcontractor' }, 'labor'],
    [{ kind: 'receipt', category: 'Supplies' }, 'other'],
    [{ kind: 'other', category: 'Equipment' }, 'other'],
  ] as const)('%j → %s', (entry, bucket) => expect(jobCostBucket(entry)).toBe(bucket));

  it('amount, else qty × unit cost; voids skipped', () => {
    expect(jobCostAmount({ kind: 'supply', amount: 0, quantity: 3, unitCost: 14.5 })).toBe(43.5);
    expect(jobCostAmount({ kind: 'supply', amount: 58, quantity: 4, unitCost: 14.5 })).toBe(58);
    expect(rollupJobCosts([
      { kind: 'contractor', amount: 1690, paid: true },
      { kind: 'freight', amount: 45, paid: false },
      { kind: 'supply', amount: 43.5, paid: true },
      { kind: 'other', amount: 999, status: 'void' },
    ])).toEqual({ labor: 1690, material: 45, supply: 43.5, other: 0, total: 1778.5, paid: 1733.5, unpaid: 45 });
  });
});

const materials: CostLine[] = [
  { quantity: 915.12, companyCost: 2.95, retailPrice: 4.9 },
  { quantity: 180, companyCost: 0.94, retailPrice: 1.85 },
];
const labors: CostLine[] = [
  { quantity: 912, companyCost: 1.35, retailPrice: 2.25 },
  { quantity: '', companyCost: 50, retailPrice: 80 }, // blank labor qty counts as 1
];

describe('job finance', () => {
  it('estimate buckets come from the work order', () => {
    const f = jobFinance({ materials, labors });
    expect(f.matQuoted).toBeCloseTo(915.12 * 2.95 + 180 * 0.94, 9);
    expect(f.laborQuoted).toBeCloseTo(912 * 1.35 + 50, 9);
    expect(f.estimate).toBeCloseTo(f.matQuoted + f.laborQuoted, 9);
    // nothing recorded yet → actual buckets show the quoted numbers
    expect([f.matActual, f.laborActual, f.otherCost, f.feeCost]).toEqual([false, false, 0, 0]);
    expect(f.actual).toBeCloseTo(f.estimate, 9);
    expect(f.revSource).toBe('quoted');
  });

  it('actuals replace a bucket as soon as anything real lands in it', () => {
    const f = jobFinance({
      materials, labors,
      pos: [{ totalCost: 2699.6 }, { totalCost: 999, status: 'cancelled' }],
      costs: [{ kind: 'freight', amount: 45 }, { kind: 'contractor', amount: 1200 }, { kind: 'supply', amount: 43.5 }],
      payables: [{ amount: 100, category: 'Materials' }, { amount: 70, category: 'Disposal' }, { amount: 500, category: 'Materials', source: 'po' }],
    });
    expect(f.matCost).toBeCloseTo(2699.6 + 45 + 100, 9);
    expect(f.laborCost).toBe(1200);
    expect(f.otherCost).toBeCloseTo(43.5 + 70, 9);
  });

  it('revenue excludes tax; card fees, commission and profit', () => {
    const f = jobFinance({
      materials, labors,
      invoices: [{ subtotal: 5000, tax: 300, total: 5300, payments: [{ amount: 2650, method: 'Credit Card (Stripe)' }, { amount: 2650, method: 'Check' }] }],
      pos: [{ totalCost: 2000 }],
      costs: [{ kind: 'contractor', amount: 1000 }],
      reps: [{ name: 'Marisol Vega', rate: 8 }],
    });
    expect(f.revenue).toBe(5000);
    expect(f.tax).toBe(300);
    expect(f.feeCost).toBe(77.15); // 2650 × 2.9% + 0.30
    expect(f.commission).toBeCloseTo((5000 - 2000 - 1000 - 77.15) * 0.08, 9);
    expect(f.preCommProfit).toBeCloseTo(5000 - 2000 - 1000 - 77.15, 9);
    expect(f.profit).toBeCloseTo((5000 - 2000 - 1000 - 77.15) * 0.92, 9);
    // margin is taken BEFORE commission now (August: profit ÷ revenue)
    expect(f.margin).toBeCloseTo((f.preCommProfit / 5000) * 100, 9);
    expect(f.collected).toBe(5300);
    expect(f.outstanding).toBe(0);
  });

  it('a PO costs its goods plus estimated freight', () => {
    const f = jobFinance({ materials, labors, pos: [{ id: 'p1', totalCost: 372, freight: 25 }, { id: 'p2', totalCost: 100, status: 'cancelled', freight: 10 }] });
    expect(f.poCost).toBe(397);
    expect(f.matCost).toBe(397);
    expect(poTotal({ totalCost: 372, freight: 25 })).toBe(397);
  });

  it('a bill tied to a live PO mirrors it (left out); once the PO is cancelled the bill counts on its own', () => {
    const pos = [{ id: 'p1', totalCost: 372 }, { id: 'p2', totalCost: 500, status: 'cancelled' }];
    const f = jobFinance({ materials, labors, pos, payables: [{ amount: 372, category: 'Materials', poId: 'p1', source: 'po' }, { amount: 480, category: 'Materials', poId: 'p2', source: 'po' }] });
    expect(f.matCost).toBe(372 + 480);
    // a PO-sourced bill with no poId still mirrors a PO
    expect(jobFinance({ materials, labors, pos, payables: [{ amount: 99, category: 'Materials', source: 'po' }] }).matCost).toBe(372);
  });

  it('an invoice without a stored subtotal counts total − tax, never the tax', () => {
    expect(jobFinance({ materials, labors, invoices: [{ total: 1070, tax: 70, payments: [] }] }).revenue).toBe(1000);
  });

  it('two reps split the commission; a loss pays no commission', () => {
    const two = jobFinance({ materials: [], labors: [], invoices: [{ subtotal: 1000, total: 1000, payments: [] }], reps: [{ name: 'A', rate: 10 }, { name: 'B', rate: 10 }] });
    expect(two.reps.map((r) => r.amount)).toEqual([50, 50]);
    const loss = jobFinance({ materials: [], labors: [], invoices: [{ subtotal: 100, total: 100, payments: [] }], costs: [{ kind: 'contractor', amount: 500 }], reps: [{ name: 'A', rate: 10 }] });
    expect(loss.commission).toBe(0);
    expect(loss.profit).toBe(-400);
  });
});

describe('payout queue', () => {
  it('paid in full: the balance when invoiced, else the stage', () => {
    expect(jobPaidInFull({ invTotal: 8624.7, outstanding: 0 }, ['final_invoice'])).toBe(true);
    expect(jobPaidInFull({ invTotal: 8624.7, outstanding: 0.01 }, ['ready_to_be_paid'])).toBe(false);
    expect(jobPaidInFull({ invTotal: 0, outstanding: 0 }, ['ready_to_be_paid'])).toBe(true);
    expect(jobPaidInFull({ invTotal: 0, outstanding: 0 }, ['final_invoice', 'paid'])).toBe(false); // the least advanced sheet decides
    expect(groupStatus(['paid', 'scheduled', 'final_invoice'])).toBe('scheduled');
  });
  it('commission owed until every sheet with a paid rep is stamped', () => {
    expect(commissionOwed(248.89, [{ commissionPaidAt: null, repRates: [8] }])).toBe(true);
    expect(commissionOwed(248.89, [{ commissionPaidAt: '2026-10-20', repRates: [8] }])).toBe(false);
    expect(commissionOwed(248.89, [{ commissionPaidAt: null, repRates: [0] }])).toBe(false);
    expect(commissionOwed(0.004, [{ commissionPaidAt: null, repRates: [8] }])).toBe(false);
    expect(JC_SCOPES[0]).toEqual({ key: 'payout', label: 'Commission due' });
  });
});

describe('variance', () => {
  it('over: red, "over estimate"; under: green, "under estimate"', () => {
    expect(varianceView(5072.92, 4883.7875)).toEqual({ amount: 5072.92 - 4883.7875, text: '+$189.13', label: 'over estimate', tone: 'red' });
    expect(varianceView(4800, 4883.79)).toMatchObject({ text: '$83.79', label: 'under estimate', tone: 'green' });
  });
  it('the list card: label and colour both flip above 0', () => {
    expect(varianceView(100.004, 100)).toMatchObject({ label: 'over estimate', tone: 'red' });
    expect(varianceView(100.006, 100)).toMatchObject({ label: 'over estimate', tone: 'red' });
    expect(varianceView(100, 100)).toMatchObject({ label: 'under estimate', tone: 'green' });
  });
  it('the job page’s metric bar: "+$x over", "−$x under", Margin before / Profit after commission', () => {
    const fin = { revenue: 8184.07, revSource: 'invoice' as const, tax: 440.63, taxSource: 'invoice' as const, margin: 38.03, profit: 2862.26, estimate: 4883.7875, actual: 5072.92 };
    const m = jobCostingMetrics(fin, { count: 6 });
    expect(m.map((x) => [x.label, x.value, x.note])).toEqual([
      ['Revenue', '$8,184.07', 'invoiced'], ['Estimated', '$4,883.79', 'quoted cost'], ['Actual', '$5,072.92', '6 recorded'], ['Variance', '+$189.13', 'over'],
      ['Margin', '38.0%', 'before commission'], ['Profit', '$2,862.26', 'after commission'], ['Sales Tax', '$440.63', 'invoiced'],
    ]);
    expect(m.filter((x) => x.private).map((x) => x.label)).toEqual(['Margin', 'Profit']);
    expect(jobCostingMetrics({ ...fin, estimate: 1726, actual: 1690 }, { count: 1 })[3]).toMatchObject({ value: '−$36.00', tone: 'green', note: 'under' });
    expect(jobCostingMetrics({ ...fin, estimate: 100, actual: 100.004 }, { count: 1 })[3]).toMatchObject({ value: '$0.00', tone: 'green', note: 'under' });
  });
  it('bucket Δ cells', () => {
    expect(bucketDelta(3157.7875, 3214.06)).toEqual({ text: '+$56.27', tone: 'danger' });
    expect(bucketDelta(1726, 1690)).toEqual({ text: '−$36.00', tone: 'success' });
    expect(bucketDelta(null, 43.5)).toEqual({ text: '—', tone: 'gray' });
    expect(bucketDelta(10, 10.004)).toEqual({ text: '—', tone: 'gray' });
  });
});

describe('privacy mode', () => {
  it('hides cost, margin and profit (blurred, hover to peek)', () => {
    expect(PRIVACY_MODE.filter).toBe('blur(6px)');
    expect(PRIVACY_MODE.revealOnHover).toBe(true);
    expect(PRIVATE_FIELDS).toEqual(expect.arrayContaining(['companyCost', 'margin', 'profit']));
    expect(['companyCost', 'margin', 'profit', 'commission', 'retailPrice', 'total'].map(isPrivateField)).toEqual([true, true, true, true, false, false]);
  });
});
