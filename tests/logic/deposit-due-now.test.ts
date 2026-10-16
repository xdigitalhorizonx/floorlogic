import { describe, expect, it } from 'vitest';
import {
  canTakePayment, computeDueNow, DEFAULT_PAYMENT_TERMS, depositAmount, depositLabel, downPaymentPct, dueNowView, invoiceBalance, invoiceDisplayStatus, invoiceStatus, paymentTypeLabel, quoteDeposit, termRule,
  type DueNowRow,
} from '../../src/lib/logic';

describe('deposit', () => {
  it('(subtotal + tax) × pct, default 50%', () => {
    expect(depositAmount(8624.7)).toBe(4312.35);
    expect(depositAmount(1000, 30)).toBe(300);
    expect(depositAmount(1000, 0)).toBe(0);
  });
  it('percent: missing → 50, clamped 0..100', () => {
    expect([downPaymentPct(null), downPaymentPct(undefined), downPaymentPct('x'), downPaymentPct(150), downPaymentPct(-5), downPaymentPct(25)]).toEqual([50, 50, 50, 100, 0, 25]);
  });
  it('quote deposits use the invoice total the approval will create', () => {
    // Good, no stairs: $7,571.93 on screen, $7,571.9265 on the invoice → $3,785.96, the app's figure.
    expect(quoteDeposit({ invoiceTotal: 7195.7865 + 376.14 })).toBe(3785.96);
    expect(depositAmount(7571.93)).toBe(3785.97);
  });
  it('builder label', () => {
    expect(depositLabel(4312.35)).toBe('→ $4312.35 due upfront');
  });
});

// Fixed clock so "days old" cases are deterministic (same as the app's own parity test).
const NOW = Date.parse('2026-08-12T18:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();
const T = 1000;

describe('due now (truth table from the app’s due-now parity cases)', () => {
  const cases: Array<[string, DueNowRow, number, string]> = [
    ['Due on Receipt, day 0', { total: T, payment_terms: 'Due on Receipt', created_at: daysAgo(0), down_payment_pct: 50 }, 1000, 'immediate'],
    ['Cash Before Delivery', { total: T, payment_terms: 'Cash Before Delivery', created_at: daysAgo(0), down_payment_pct: 50 }, 1000, 'immediate'],
    ['Due on Receipt beats a 0% deposit', { total: T, payment_terms: 'Due on Receipt', created_at: daysAgo(0), down_payment_pct: 0 }, 1000, 'immediate'],
    ['Due on Receipt, part paid', { total: T, payment_terms: 'Due on Receipt', created_at: daysAgo(0), down_payment_pct: 50, payments: [{ amount: 250 }] }, 750, 'immediate'],
    ['Net 15 @ day 14', { total: T, payment_terms: 'Net 15', created_at: daysAgo(14), down_payment_pct: 50 }, 500, 'net-pending'],
    ['Net 15 @ day 15', { total: T, payment_terms: 'Net 15', created_at: daysAgo(15), down_payment_pct: 50 }, 1000, 'net-due'],
    ['Net 30 @ day 29', { total: T, payment_terms: 'Net 30', created_at: daysAgo(29), down_payment_pct: 50 }, 500, 'net-pending'],
    ['Net 30 @ day 30', { total: T, payment_terms: 'Net 30', created_at: daysAgo(30), down_payment_pct: 50 }, 1000, 'net-due'],
    ['net15 (no space)', { total: T, payment_terms: 'net15', created_at: daysAgo(20), down_payment_pct: 50 }, 1000, 'net-due'],
    ['Net 15 pending, 0% deposit', { total: T, payment_terms: 'Net 15', created_at: daysAgo(1), down_payment_pct: 0 }, 0, 'net-pending'],
    ['Net Upon Completion is NOT Net 0', { total: T, payment_terms: 'Net Upon Completion', created_at: daysAgo(999), down_payment_pct: 50 }, 500, 'deposit'],
    ['Net Upon Completion, final', { total: T, payment_terms: 'Net Upon Completion', created_at: daysAgo(999), down_payment_pct: 50, final_invoice: true }, 1000, 'final'],
    ['50/50 deposit', { total: T, payment_terms: '50% Deposit / 50% on Completion', created_at: daysAgo(0), down_payment_pct: 50 }, 500, 'deposit'],
    ['blank terms', { total: T, payment_terms: '', created_at: daysAgo(3), down_payment_pct: 50 }, 500, 'deposit'],
    ['null pct → 50', { total: T, payment_terms: '', created_at: daysAgo(3), down_payment_pct: null }, 500, 'deposit'],
    ['final beats Net 15 pending', { total: T, payment_terms: 'Net 15', created_at: daysAgo(1), down_payment_pct: 50, final_invoice: true }, 1000, 'final'],
    ['Net 15, junk date', { total: T, payment_terms: 'Net 15', created_at: 'not-a-date', down_payment_pct: 50 }, 500, 'net-pending'],
    ['overpaid never negative', { total: T, payment_terms: 'Due on Receipt', created_at: daysAgo(0), down_payment_pct: 50, payments: [{ amount: 1200 }] }, 0, 'immediate'],
    ['deposit already covered', { total: T, payment_terms: '', created_at: daysAgo(0), down_payment_pct: 50, payments: [{ amount: 500 }] }, 0, 'deposit'],
    ['deposit part paid', { total: T, payment_terms: '', created_at: daysAgo(0), down_payment_pct: 50, payments: [{ amount: 200 }] }, 300, 'deposit'],
    ['cents round to 2dp', { total: 173.94, payment_terms: '', created_at: daysAgo(0), down_payment_pct: 50 }, 86.97, 'deposit'],
    ['sample IN-330 deposit', { total: 8624.7, payment_terms: '50% Deposit / 50% on Completion', created_at: '2026-10-15', down_payment_pct: 50 }, 4312.35, 'deposit'],
  ];
  it.each(cases)('%s', (_label, row, due, basis) => {
    const r = computeDueNow(row, NOW);
    expect(r.dueNow).toBe(due);
    expect(r.basis).toBe(basis);
  });

  it('every default term resolves to the rule it means', () => {
    expect(DEFAULT_PAYMENT_TERMS).toEqual(['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', '50% Deposit / 50% on Completion']);
    expect(DEFAULT_PAYMENT_TERMS.map((t) => termRule(t))).toEqual([
      { kind: 'immediate' }, { kind: 'net', days: 15 }, { kind: 'net', days: 30 }, { kind: 'net', days: 45 }, { kind: 'net', days: 60 }, { kind: 'default' },
    ]);
    expect(termRule('Net Upon Completion')).toEqual({ kind: 'default' });
    expect(termRule('Cash Before Delivery')).toEqual({ kind: 'immediate' });
  });
});

describe('invoice status after payments', () => {
  it.each([
    [1000, [], 'unpaid'],
    [1000, [{ amount: 0 }], 'unpaid'],
    [1000, [{ amount: 500 }], 'deposit'],
    [1000, [{ amount: 500 }, { amount: 499.99 }], 'deposit'],
    [1000, [{ amount: 500 }, { amount: 500 }], 'paid'],
    [1000, [{ amount: 1200 }], 'paid'],
  ] as const)('total %s, payments %j → %s', (total, pays, want) => {
    expect(invoiceStatus(total, pays)).toBe(want);
  });
});

describe('live-invoice payment box', () => {
  const base = { total: 8624.7, terms: '50% Deposit / 50% on Completion', downPaymentPct: 50, createdAt: '2026-10-15' };
  const at = Date.parse('2026-10-15T12:00:00Z');
  it('asks for the deposit first', () => {
    expect(dueNowView({ ...base, paid: 0 }, at)).toEqual({
      kind: 'due', label: 'Due Now', dueNow: 4312.35, amount: '$4,312.35',
      sub: '50% deposit — remaining $4,312.35 due upon completion', button: '💳 Pay $4,312.35 by Card',
    });
  });
  it('then nothing until completion', () => {
    expect(dueNowView({ ...base, paid: 4312.35 }, at)).toEqual({
      kind: 'none', text: 'No payment is due right now. The remaining balance of $4,312.35 will be due upon completion.',
    });
  });
  it('then the balance once marked final, then paid in full', () => {
    expect(dueNowView({ ...base, paid: 4312.35, finalInvoice: true }, at)).toMatchObject({ kind: 'due', dueNow: 4312.35, sub: 'Final invoice — full remaining balance' });
    expect(dueNowView({ ...base, paid: 8624.7, finalInvoice: true }, at)).toEqual({ kind: 'paid', title: '✓ Paid in Full', meta: 'Thank you — no balance remains on this invoice.' });
  });
  it('Net terms name the day the balance falls due', () => {
    const v = dueNowView({ total: 1000, paid: 0, terms: 'Net 30', downPaymentPct: 50, createdAt: '2026-10-15' }, at);
    expect(v).toMatchObject({ kind: 'due', dueNow: 500, sub: '50% deposit — remaining $500.00 due Nov 14, 2026' });
    const due = dueNowView({ total: 1000, paid: 0, terms: 'Net 30', downPaymentPct: 50, createdAt: '2026-09-01' }, at);
    expect(due).toMatchObject({ kind: 'due', dueNow: 1000, sub: 'Net 30 — full balance due as of Oct 1, 2026' });
  });
});

describe('the Net-terms due day follows the document day (DocumentDates)', () => {
  const at = Date.parse('2026-10-15T12:00:00Z');
  it('a UTC-midnight created_at keeps its day (no slip to the evening before)', () => {
    const v = dueNowView({ total: 1000, paid: 0, terms: 'Net 30', downPaymentPct: 50, createdAt: '2026-10-13T00:00:00+00:00' }, at);
    expect(v).toMatchObject({ kind: 'due', sub: '50% deposit — remaining $500.00 due Nov 12, 2026' });
  });
  it('an unreadable created_at leaves the day out, like the app', () => {
    const v = dueNowView({ total: 1000, paid: 0, terms: 'Net 30', downPaymentPct: 50, createdAt: 'nope' }, at);
    expect(v).toMatchObject({ kind: 'due', sub: '50% deposit — remaining $500.00 due upon completion' });
  });
});

describe('what the screens show for an invoice', () => {
  it('the badge follows the balance (0.005 tolerance); the stored status is exact', () => {
    expect(invoiceDisplayStatus({ status: 'unpaid', total: 850, payments: [{ amount: 850 }] })).toBe('paid');
    expect(invoiceDisplayStatus({ status: 'unpaid', total: 202.00499999999997, payments: [{ amount: 202 }] })).toBe('paid');
    expect(invoiceStatus(202.00499999999997, [{ amount: 202 }])).toBe('deposit');
    expect(invoiceDisplayStatus({ status: 'paid', total: 1120, payments: [{ amount: 1000 }] })).toBe('deposit');
    expect(invoiceDisplayStatus({ status: 'void', total: 100, payments: [{ amount: 100 }] })).toBe('void');
    expect(invoiceDisplayStatus({ status: 'sent', total: 0, payments: [] })).toBe('sent');
  });
  it('Take Payment shows while more than half a cent is owed', () => {
    expect([canTakePayment(0), canTakePayment(0.005), canTakePayment(0.01), canTakePayment(4312.35)]).toEqual([false, false, true, true]);
    expect(invoiceBalance({ total: 8624.7, payments: [{ amount: 4312.35 }] })).toBe(4312.35);
    expect(invoiceBalance({ total: 100, payments: [{ amount: 150 }] })).toBe(0);
  });
  it('payments show their card or check number', () => {
    expect(paymentTypeLabel({ method: 'Credit Card (Stripe)', cardBrand: 'visa', cardLast4: '4242' })).toBe('Credit Card (Stripe) · Visa ••••4242');
    expect(paymentTypeLabel({ method: 'Check', checkNumber: '1042' })).toBe('Check #1042');
    expect(paymentTypeLabel({ method: 'Cash' })).toBe('Cash');
    expect(paymentTypeLabel({})).toBe('Payment');
  });
});
