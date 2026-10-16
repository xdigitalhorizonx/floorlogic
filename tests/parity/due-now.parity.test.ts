/**
 * Due-now parity: q.html's own termRule / computeDueNow (the code the live
 * invoice runs) against the site port, over a large grid; the live invoice's
 * PAYMENT box (with the app's real DocumentDates) against dueNowView; how a
 * payment is labelled; and the app's invoice-status rules — the stored one a
 * payment writes and the balance-based one every badge shows.
 */
import { describe, expect, it } from 'vitest';
import {
  canTakePayment, cardBrandName, computeDueNow, dueNowView, invoiceBalance, invoiceDisplayStatus, invoiceStatus, paymentCardLine, paymentTypeLabel, termRule,
  type DueNowRow,
} from '../../src/lib/logic';
import { appDocumentDates, code, sandbox } from './app-source';
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
  const qsrcFns = ['computeDueNow', 'termRule', 'invoiceAgeDays', 'fmt$', 'fmtDate', 'esc'];
  const DocumentDates = appDocumentDates();
  function appBox(inv: { total: number; paid: number; terms: string; pct: number | null; final: boolean; createdAt: string }, nowMs: number): string {
    const body = `${qsrcFns.map((f) => code(`q:fn:${f}`)).join('\n')}\nreturn ${code('q:text:payment-box')};`;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function('INV_MODE', 'PDF_MODE', 'window', 'q', 'Date', 'DocumentDates', body) as (...a: unknown[]) => string;
    const grand = inv.total;
    return run(true, false, { __invTotals: { grand, paid: inv.paid, bal: Math.round((grand - inv.paid) * 100) / 100 } },
      { total: grand, down_payment_pct: inv.pct, final_invoice: inv.final, payment_terms: inv.terms, created_at: inv.createdAt }, fixedDate(nowMs), DocumentDates);
  }
  function siteText(v: ReturnType<typeof dueNowView>): string {
    if (v.kind === 'paid') return `PAYMENT ${v.title} ${v.meta}`;
    if (v.kind === 'none') return `PAYMENT ${v.text}`;
    return `PAYMENT ${v.label} ${v.amount} ${v.sub} Loading secure card form… ${v.button} 🔒 Secure card payment powered by Stripe`;
  }

  const cases: Array<{ total: number; paid: number; terms: string; pct: number | null; final: boolean; createdAt: string; at: string }> = [];
  for (const terms of ['50% Deposit / 50% on Completion', 'Due on Receipt', 'Net 30', 'Net 15', 'Net Upon Completion', 'Cash Before Delivery', '']) {
    for (const [paid, final] of [[0, false], [4312.35, false], [4312.35, true], [8624.7, true], [100, false]] as const) {
      // date-only, UTC midnight (how Postgres returns a date-only write), a real instant, and junk
      for (const createdAt of ['2026-10-15', '2026-09-01', '2026-09-01T00:00:00+00:00', '2026-10-13T03:30:00Z', 'nope']) {
        cases.push({ total: 8624.7, paid, terms, pct: 50, final, createdAt, at: '2026-10-15T12:00:00Z' });
      }
    }
  }
  cases.push({ total: 1000, paid: 0, terms: 'Net 30', pct: 0, final: false, createdAt: '2026-10-15', at: '2026-10-15T12:00:00Z' });
  cases.push({ total: 1000, paid: 0, terms: '', pct: 100, final: false, createdAt: '2026-10-15', at: '2026-10-15T12:00:00Z' });
  cases.push({ total: 100, paid: 99.7, terms: 'Due on Receipt', pct: 50, final: false, createdAt: '2026-10-15', at: '2026-10-15T12:00:00Z' });

  it.each(cases)('$terms · paid $paid · final $final · $createdAt', (c) => {
    const nowMs = Date.parse(c.at);
    const appText = stripTags(appBox(c, nowMs));
    const v = dueNowView({ total: c.total, paid: c.paid, terms: c.terms, downPaymentPct: c.pct, finalInvoice: c.final, createdAt: c.createdAt }, nowMs);
    expect(siteText(v)).toBe(appText);
  });
});

describe('how a payment is labelled (q.html payTypeLabel / main _payCardLine)', () => {
  const q = sandbox<{ payTypeLabel: (p: unknown) => string; payCardLine: (p: unknown) => string; cardBrandName: (b: unknown) => string }>('q', {
    consts: ['CARD_BRANDS'], fns: ['payTypeLabel', 'payCardLine', 'payCheckNo', 'cardBrandName'],
  });
  const main = sandbox<{ _payCardLine: (p: unknown) => string }>('index', { consts: ['_CARD_BRANDS'], fns: ['_payCardLine', '_cardBrandName'] });
  it('method, card brand + last 4, check number', () => {
    const PAYS: Array<Record<string, unknown> | null> = [null, {}, { method: 'Check' }, { method: 'Check', checkNumber: '1042' }, { method: 'Check', checkNumber: 1042 },
      { type: 'Cash' }, { method: 'Credit Card (Stripe)', cardBrand: 'visa', cardLast4: '4242' }, { method: 'Credit Card (Online)', cardBrand: 'AMEX', cardLast4: 1005 },
      { method: 'Card', cardBrand: 'unknown', cardLast4: '0001' }, { method: 'Card', cardBrand: 'cartes_bancaires', cardLast4: '7777' }, { method: 'Card', cardLast4: '' },
      { method: 'Card', cardBrand: 'eftpos_au', cardLast4: '1234', checkNumber: '9' }, { method: '', type: '', checkNumber: '55' }];
    for (const p of PAYS) {
      expect(paymentTypeLabel(p), JSON.stringify(p)).toBe(q.payTypeLabel(p));
      expect(paymentCardLine(p)).toBe(q.payCardLine(p));
      if (p) expect(paymentCardLine(p)).toBe(main._payCardLine(p));
    }
    for (const b of [null, '', 'unknown', 'visa', 'MasterCard', ' jcb ', 'link', 'zip']) expect(cardBrandName(b)).toBe(q.cardBrandName(b));
    expect(paymentTypeLabel({ method: 'Credit Card (Stripe)', cardBrand: 'visa', cardLast4: '4242' })).toBe('Credit Card (Stripe) · Visa ••••4242');
  });
});

describe('invoice status', () => {
  const noop = () => {};
  it('stored status after a payment (acctRecordInvPayment / recordPayment): exact paid ≥ total', () => {
    const totals = [0, 100, 8624.7, 8624.696, 202.00499999999997];
    const amounts = [0.01, 50, 99.99, 100, 202, 4312.35, 8624.7, 9000];
    for (const total of totals) for (const prior of [[], [{ amount: 50 }], [{ amount: 4312.35 }]]) for (const amt of amounts) {
      for (const path of ['acct', 'record'] as const) {
        const inv = { id: 'i1', number: 'IN-1', total, payments: prior.map((p) => ({ ...p })), status: 'unpaid', jobId: null };
        const vals: Record<string, string> = { 'acct-pay-amt': String(amt), 'acct-pay-method': 'Check', 'acct-pay-date': '2026-10-15', 'pay-amt': String(amt), 'pay-method': 'Check', 'pay-date': '2026-10-15' };
        const globals = {
          getInvoice: () => inv, data: { invoices: [inv] }, document: { getElementById: (id: string) => ({ value: vals[id] }) }, _payWithCheckNo: (p: unknown) => p,
          _advanceJobToReady: noop, addActivity: noop, saveData: noop, closeModal: noop, showToast: noop, renderView: noop, navigate: noop,
          fmt$: (n: number) => '$' + n, alert: noop, _todayISO: () => '2026-10-15', updateBadges: noop,
        };
        if (path === 'acct') sandbox<{ acctRecordInvPayment: (id: string) => void }>('index', { fns: ['acctRecordInvPayment'] }, globals).acctRecordInvPayment('IN-1');
        else sandbox<{ recordPayment: (id: string) => void }>('index', { fns: ['recordPayment'] }, globals).recordPayment('i1');
        expect(inv.status, `${path} ${total} ${JSON.stringify(prior)} +${amt}`).toBe(invoiceStatus(total, inv.payments));
      }
    }
  });

  it('what every badge shows (_invDisplayStatus), the balance and the Take Payment gate', () => {
    const fns = sandbox<{ _invDisplayStatus: (i: unknown) => string; _invBalAmt: (i: unknown) => number; _ibCanTakePayment: (b: unknown) => boolean; _invPaidAmt: (i: unknown) => number }>('index', {
      fns: ['_invDisplayStatus', '_invBalAmt', '_ibCanTakePayment', '_invPaidAmt'],
    });
    for (const status of ['unpaid', 'deposit', 'paid', 'void', 'sent', undefined]) for (const total of [0, -5, 100, 202.00499999999997, 850, '850']) {
      for (const payments of [[], [{ amount: 0 }], [{ amount: 0.004 }], [{ amount: 50 }], [{ amount: 99.996 }], [{ amount: 202 }], [{ amount: 850 }], [{ amount: '850' }], [{ amount: 900 }]]) {
        const inv = { status, total, payments };
        expect(invoiceDisplayStatus(inv as Parameters<typeof invoiceDisplayStatus>[0]), JSON.stringify(inv)).toBe(fns._invDisplayStatus(inv));
        expect(invoiceBalance(inv as Parameters<typeof invoiceBalance>[0])).toBe(fns._invBalAmt(inv));
      }
    }
    expect(invoiceDisplayStatus(null)).toBe(fns._invDisplayStatus(null));
    for (const b of [0, 0.004, 0.005, 0.0051, 0.01, 1, -3, '', null, '12']) expect(canTakePayment(b as number)).toBe(fns._ibCanTakePayment(b));
    // IN-5791: $850 of $850 collected but stored "unpaid" — the badge says paid.
    expect(invoiceDisplayStatus({ status: 'unpaid', total: 850, payments: [{ amount: 850 }] })).toBe('paid');
  });
});
