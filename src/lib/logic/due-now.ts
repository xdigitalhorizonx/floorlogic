/**
 * Payment terms → how much the live invoice asks for right now, plus the
 * invoice status after a payment and how a payment is labelled.
 *
 * `termRule`, `invoiceAgeDays` and `computeDueNow` are line-for-line ports of
 * q.html (q L620-658, unchanged since August), which the app keeps
 * byte-identical to the server copy that Stripe actually charges
 * (api/public-invoice-intent.js). The parity test runs the real q.html
 * functions against these over a grid.
 *
 * Changed since the August app:
 * - the live invoice's "due Nov 14, 2026" (Net terms) is DocumentDates.addDays
 *   on the invoice's document day (q L1699) — a UTC-midnight created_at keeps
 *   its day instead of slipping to the evening before in Pacific;
 * - the badge, counts and filters read the BALANCE (`invoiceDisplayStatus`,
 *   0.005 tolerance), not the stored status, and Take Payment shows while the
 *   balance is over half a cent (`canTakePayment`);
 * - payments show their card ("Visa ••••4242") or check number ("#1042").
 *
 *   Due on Receipt / Cash Before Delivery → 100% of the balance, now
 *   Net <n>      → the deposit portion until the invoice is n days old, then 100%
 *   anything else ("Net Upon Completion", "50% Deposit / 50% on Completion",
 *   blank)       → the deposit portion; 100% once the office marks it final
 *
 * "Net Upon Completion" has no day count, so it must NOT read as Net 0.
 */
import { fmtDate } from './dates';
import { addCalendarDays } from './document-dates';
import { fmtMoney, num } from './money';

/** The app's built-in payment terms (main L5372, L4640). */
export const DEFAULT_PAYMENT_TERMS = [
  'Due on Receipt',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  '50% Deposit / 50% on Completion',
] as const;

export type TermRule = { kind: 'default' } | { kind: 'immediate' } | { kind: 'net'; days: number };

/** q L620 */
export function termRule(terms: string | null | undefined): TermRule {
  const s = String(terms == null ? '' : terms).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return { kind: 'default' };
  if (s.indexOf('due on receipt') >= 0 || s.indexOf('cash before delivery') >= 0) return { kind: 'immediate' };
  const m = s.match(/\bnet\s*(\d+)\b/);
  if (m) return { kind: 'net', days: Math.max(0, parseInt(m[1]!, 10)) };
  return { kind: 'default' };
}

/** q L631: whole days since the invoice was raised; null when the date is unusable. */
export function invoiceAgeDays(createdAt: string | null | undefined, nowMs: number): number | null {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((nowMs - t) / 86400000);
}

export interface DueNowRow {
  total: number | string | null | undefined;
  payments?: ReadonlyArray<{ amount?: number | string | null } | null> | null;
  down_payment_pct?: number | string | null;
  final_invoice?: boolean | null;
  payment_terms?: string | null;
  created_at?: string | null;
}

export type DueNowBasis = 'final' | 'immediate' | 'net-due' | 'net-pending' | 'deposit';

export interface DueNow {
  grand: number;
  paid: number;
  bal: number;
  pct: number;
  dueNow: number;
  basis: DueNowBasis;
  netDays: number | null;
}

/** q L637 */
export function computeDueNow(row: DueNowRow, nowMs: number): DueNow {
  const grand = Number(row.total) || 0;
  const paid = (Array.isArray(row.payments) ? row.payments : []).reduce((a, p) => a + (Number(p && p.amount) || 0), 0);
  const bal = Math.round((grand - paid) * 100) / 100;
  const pctRaw = Number(row.down_payment_pct);
  const pct = row.down_payment_pct != null && Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : 50;
  const rule = termRule(row.payment_terms);
  let target: number;
  let basis: DueNowBasis;
  if (row.final_invoice) { target = grand; basis = 'final'; }
  else if (rule.kind === 'immediate') { target = grand; basis = 'immediate'; }
  else if (rule.kind === 'net') {
    const age = invoiceAgeDays(row.created_at, nowMs);
    if (age != null && age >= rule.days) { target = grand; basis = 'net-due'; }
    else { target = (grand * pct) / 100; basis = 'net-pending'; }
  } else { target = (grand * pct) / 100; basis = 'deposit'; }
  // Both clamps floor at zero — an overpaid invoice reads as nothing due.
  const dueNow = Math.round(Math.min(Math.max(target - paid, 0), Math.max(bal, 0)) * 100) / 100;
  return { grand, paid, bal, pct, dueNow, basis, netDays: rule.kind === 'net' ? rule.days : null };
}

export type InvoiceStatus = 'unpaid' | 'deposit' | 'paid';

/**
 * The STORED status after recording a payment (`recordPayment` main L21005,
 * `acctRecordInvPayment` L29952, bank match L33077 — unchanged): paid ≥ total
 * exactly → 'paid', anything paid → 'deposit', else 'unpaid'. (The card
 * charge and the pay-link webhook use paid ≥ total − 0.01 instead, and the
 * screens show `invoiceDisplayStatus` — see the app bugs in
 * docs/logic-changes-2026-10.md.)
 */
export function invoiceStatus(total: number, payments: ReadonlyArray<{ amount?: number | string | null }>): InvoiceStatus {
  const tp = payments.reduce((a, p) => a + num(p.amount), 0);
  return tp >= num(total) ? 'paid' : tp > 0 ? 'deposit' : 'unpaid';
}

/**
 * The status every badge, count and filter shows (`_invDisplayStatus`, main
 * L7634, new): read off the balance — paid ≥ total − 0.005 → 'paid', paid
 * over half a cent → 'deposit', else 'unpaid'. Void stays void; a zero-value
 * invoice with nothing paid keeps whatever was stored.
 */
export function invoiceDisplayStatus(inv: {
  status?: string | null;
  total?: number | string | null;
  payments?: ReadonlyArray<{ amount?: number | string | null } | null> | null;
} | null | undefined): InvoiceStatus | 'void' | string {
  if (!inv) return 'unpaid';
  if (inv.status === 'void') return 'void';
  const total = Number(inv.total) || 0;
  const paid = (inv.payments || []).reduce((a, p) => a + (Number(p && p.amount) || 0), 0);
  if (total <= 0 && paid <= 0.005) return inv.status || 'unpaid';
  if (paid >= total - 0.005) return 'paid';
  if (paid > 0.005) return 'deposit';
  return 'unpaid';
}

/** `_ibCanTakePayment` (main L20864): "💰 Take Payment" shows while the balance is over half a cent. */
export function canTakePayment(balance: number | string | null | undefined): boolean {
  return (Number(balance) || 0) > 0.005;
}

/** `_invBalAmt` (main L29212): what is still owed, never below 0. */
export function invoiceBalance(inv: { total?: number | string | null; payments?: ReadonlyArray<{ amount?: number | string | null }> | null }): number {
  return Math.max(0, (Number(inv.total) || 0) - (inv.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0));
}

// ------------------------------------------------------- payment labels --

/** Card brands as the app names them (`CARD_BRANDS`, q L584 / `_CARD_BRANDS` main L29192). */
export const CARD_BRANDS: Readonly<Record<string, string>> = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay', eftpos_au: 'Eftpos', link: 'Link',
};

/** `cardBrandName`: 'Card' for none/'unknown', the app's name, else the token capitalised. */
export function cardBrandName(brand: string | null | undefined): string {
  const k = String(brand == null ? '' : brand).toLowerCase().trim();
  if (!k || k === 'unknown') return 'Card';
  return CARD_BRANDS[k] || k.charAt(0).toUpperCase() + k.slice(1);
}

export interface PaymentLabelled {
  method?: string | null;
  type?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | number | null;
  checkNumber?: string | number | null;
}

/** `payCardLine`: "Visa ••••4242" when the payment carries its last 4, else ''. */
export function paymentCardLine(p: PaymentLabelled | null | undefined): string {
  const l = p && p.cardLast4;
  return l ? cardBrandName(p!.cardBrand) + ' ••••' + String(l) : '';
}

/**
 * How a payment reads on the customer's invoice (`payTypeLabel`, q L594):
 * "Credit Card (Stripe) · Visa ••••4242", "Check #1042", or just the method.
 */
export function paymentTypeLabel(p: PaymentLabelled | null | undefined): string {
  const m = (p && (p.method || p.type)) || 'Payment';
  const c = paymentCardLine(p);
  if (c) return m + ' · ' + c;
  const n = p && p.checkNumber ? '#' + String(p.checkNumber) : '';
  return n ? m + ' ' + n : m;
}

// ------------------------------------------------- live-invoice payment box --

export type DueNowView =
  | { kind: 'paid'; title: string; meta: string }
  | { kind: 'none'; text: string }
  | { kind: 'due'; label: string; dueNow: number; amount: string; sub: string; button: string };

/**
 * The PAYMENT box on the customer’s live invoice (q L1679-1731), as data.
 * `createdAt` is the invoice's created_at — a day or a timestamp — used for
 * "due Nov 13, 2026" on Net terms (DocumentDates.addDays).
 */
export function dueNowView(
  invoice: { total: number; paid: number; terms?: string | null; downPaymentPct?: number | null; finalInvoice?: boolean; createdAt: string },
  nowMs: number,
): DueNowView {
  const due = computeDueNow(
    {
      total: invoice.total,
      payments: [{ amount: invoice.paid }],
      down_payment_pct: invoice.downPaymentPct ?? null,
      final_invoice: !!invoice.finalInvoice,
      payment_terms: invoice.terms ?? '',
      created_at: invoice.createdAt,
    },
    nowMs,
  );
  const bal = Math.round((num(invoice.total) - num(invoice.paid)) * 100) / 100;
  const dueDay = due.netDays != null ? addCalendarDays(invoice.createdAt, due.netDays) : '';
  const netDueOn = dueDay ? fmtDate(dueDay) : '';
  if (bal <= 0.005) {
    return { kind: 'paid', title: '✓ Paid in Full', meta: 'Thank you — no balance remains on this invoice.' };
  }
  if (due.dueNow < 0.5) {
    const when = due.basis === 'net-pending' && netDueOn ? 'is due ' + netDueOn : 'will be due upon completion';
    return { kind: 'none', text: `No payment is due right now. The remaining balance of ${fmtMoney(bal)} ${when}.` };
  }
  const remainAfter = Math.round((bal - due.dueNow) * 100) / 100;
  const termTxt = String(invoice.terms || '').trim();
  const depositLbl =
    due.pct < 100
      ? due.pct + '% deposit' + (remainAfter > 0.005 ? ' — remaining ' + fmtMoney(remainAfter) + ' due upon completion' : '')
      : 'Balance due';
  const sub =
    due.basis === 'final' ? 'Final invoice — full remaining balance'
      : due.basis === 'immediate' ? (termTxt || 'Due on receipt') + ' — full balance due now'
        : due.basis === 'net-due' ? termTxt + ' — full balance due' + (netDueOn ? ' as of ' + netDueOn : '')
          : due.basis === 'net-pending' ? depositLbl.replace('due upon completion', netDueOn ? 'due ' + netDueOn : 'due upon completion')
            : depositLbl;
  return { kind: 'due', label: 'Due Now', dueNow: due.dueNow, amount: fmtMoney(due.dueNow), sub, button: `💳 Pay ${fmtMoney(due.dueNow)} by Card` };
}
