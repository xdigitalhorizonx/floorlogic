/**
 * Due-now parity: q.html's own termRule / computeDueNow (the code the live
 * invoice runs) against the site port, over a large grid; the live invoice's
 * PAYMENT box against dueNowView; and the app's invoice-status rule.
 */
import { describe, expect, it } from 'vitest';
import { computeDueNow, dueNowView, invoiceStatus, termRule, type DueNowRow } from '../../src/lib/logic';
import { code, sandbox } from './app-source';
import { fixedDate, stripTags } from './helpers';

type AppDue = {
  termRule: typeof termRule;
  computeDueNow: typeof computeDueNow;
};
const app = sandbox<AppDue>('q', { fns: ['termRule', 'invoiceAgeDays', 'computeDueNow'] });

const NOW = Date.parse('2026-10-14T18:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

const TERMS: Array<string | null> = [
  'Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', '50% Deposit / 50% on Completion', 'Cash Before Delivery',
  'Net Upon Completion', '', null, 'DUE ON RECEIPT', 'net15', '  net   45  ', 'Net 0', 'Net 30 days', '2% 10 Net 30', 'Cash before delivery please',
];
const AGES: Array<string | null> = [null, 'not-a-date', ...[-5, 0, 1, 14, 15, 29, 30, 31, 44, 45, 59, 60, 61, 400].map(daysAgo), '2026-10-14', '2026-09-14'];
const PCTS: Array<number | string | null> = [null, 0, 25, 50, 100, 150, -10, '30', 'abc'];
const TOTALS = [0, 0.01, 173.94, 1000, 8624.7, 8624.696, 7571.9265];
const PAYS = (t: number) => [[], [{ amount: 0 }], [{ amount: 100 }], [{ amount: t / 2 }], [{ amount: t }], [{ amount: t + 1 }], [{ amount: '50' }], [null], [{ amount: t / 4 }, { amount: t / 4 }]];

describe('termRule parity', () => {
  it.each(TERMS)('%j', (t) => expect(termRule(t)).toEqual(app.termRule(t)));
});

describe('computeDueNow parity (grid)', () => {
  it('every combination of terms × age × pct × total × payments × final agrees', () => {
    let n = 0;
    const bad: string[] = [];
    for (const payment_terms of TERMS) for (const created_at of AGES) for (const down_payment_pct of PCTS) for (const total of TOTALS) {
      for (const payments of PAYS(total)) for (const final_invoice of [false, true]) {
        const row = { total, payments, down_payment_pct, payment_terms, created_at, final_invoice } as unknown as DueNowRow;
        const a = app.computeDueNow(row, NOW);
        const s = computeDueNow(row, NOW);
        n++;
        if (JSON.stringify(a) !== JSON.stringify(s)) bad.push(`${JSON.stringify(row)} app=${JSON.stringify(a)} site=${JSON.stringify(s)}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(100000);
  });
});

describe('live invoice PAYMENT box (q.html IIFE) vs dueNowView', () => {
  const qsrcFns = ['computeDueNow', 'termRule', 'invoiceAgeDays', 'fmt$', 'fmtDate', 'plusDays', 'esc'];
  function appBox(inv: { total: number; paid: number; terms: string; pct: number | null; final: boolean; createdAt: string }, nowMs: number): string {
    const body = `${qsrcFns.map((f) => code(`q:fn:${f}`)).join('\n')}\nreturn ${code('q:text:payment-box')};`;
    const run = new Function('INV_MODE', 'PDF_MODE', 'window', 'q', 'Date', body) as (...a: unknown[]) => string;
    const grand = inv.total;
    return run(true, false, { __invTotals: { grand, paid: inv.paid, bal: Math.round((grand - inv.paid) * 100) / 100 } },
      { total: grand, down_payment_pct: inv.pct, final_invoice: inv.final, payment_terms: inv.terms, created_at: inv.createdAt }, fixedDate(nowMs));
  }
  function siteText(v: ReturnType<typeof dueNowView>): string {
    if (v.kind === 'paid') return `PAYMENT ${v.title} ${v.meta}`;
    if (v.kind === 'none') return `PAYMENT ${v.text}`;
    return `PAYMENT ${v.label} ${v.amount} ${v.sub} Loading secure card form… ${v.button} 🔒 Secure card payment powered by Stripe`;
  }

  const cases: Array<{ total: number; paid: number; terms: string; pct: number | null; final: boolean; createdAt: string; at: string }> = [];
  for (const terms of ['50% Deposit / 50% on Completion', 'Due on Receipt', 'Net 30', 'Net 15', 'Net Upon Completion', 'Cash Before Delivery', '']) {
    for (const [paid, final] of [[0, false], [4312.35, false], [4312.35, true], [8624.7, true], [100, false]] as const) {
      for (const createdAt of ['2026-10-15', '2026-09-01']) {
        cases.push({ total: 8624.7, paid, terms, pct: 50, final, createdAt, at: '2026-10-15T12:00:00Z' });
      }
    }
  }
  cases.push({ total: 1000, paid: 0, terms: 'Net 30', pct: 0, final: false, createdAt: '2026-10-15', at: '2026-10-15T12:00:00Z' });
  cases.push({ total: 1000, paid: 0, terms: '', pct: 100, final: false, createdAt: '2026-10-15', at: '2026-10-15T12:00:00Z' });

  it.each(cases)('$terms · paid $paid · final $final · $createdAt', (c) => {
    const nowMs = Date.parse(c.at);
    const appText = stripTags(appBox(c, nowMs));
    const v = dueNowView({ total: c.total, paid: c.paid, terms: c.terms, downPaymentPct: c.pct, finalInvoice: c.final, createdAt: c.createdAt }, nowMs);
    expect(siteText(v)).toBe(appText);
  });
});

describe('invoice status after a payment (acctRecordInvPayment)', () => {
  it('paid ≥ total → paid, anything paid → deposit, else unpaid', () => {
    const totals = [0, 100, 8624.7, 8624.696];
    const amounts = [0.01, 50, 99.99, 100, 4312.35, 8624.7, 9000];
    for (const total of totals) for (const prior of [[], [{ amount: 50 }], [{ amount: 4312.35 }]]) for (const amt of amounts) {
      const inv = { number: 'IN-1', total, payments: prior.map((p) => ({ ...p })), status: 'unpaid', jobId: null };
      const vals: Record<string, string> = { 'acct-pay-amt': String(amt), 'acct-pay-method': 'Check', 'acct-pay-date': '2026-10-15' };
      const noop = () => {};
      const fns = sandbox<{ acctRecordInvPayment: (id: string) => void }>('index', { fns: ['acctRecordInvPayment'] }, {
        getInvoice: () => inv, document: { getElementById: (id: string) => ({ value: vals[id] }) }, _payWithCheckNo: (p: unknown) => p,
        _advanceJobToReady: noop, addActivity: noop, saveData: noop, closeModal: noop, showToast: noop, renderView: noop,
        fmt$: (n: number) => '$' + n, alert: noop,
      });
      fns.acctRecordInvPayment('IN-1');
      expect(inv.status).toBe(invoiceStatus(total, inv.payments));
    }
  });
});
