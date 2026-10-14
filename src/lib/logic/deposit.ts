/**
 * Down payment (deposit) on a quote or invoice.
 *
 * Source: main L11307-11320 (`qbRefreshDownPaymentAmt`): amount =
 * (subtotal + tax) × pct / 100, pct defaults to 50; the builder prints
 * "→ $X due upfront". The invoice side asks for the same portion through
 * `computeDueNow` (due-now.ts).
 */
import { round2 } from './money';

export const DEFAULT_DOWN_PAYMENT_PCT = 50;

/**
 * Normalise a stored percentage the way the live invoice does (q L617-618):
 * missing → 50, otherwise clamped to 0..100.
 */
export function downPaymentPct(raw: unknown): number {
  const n = Number(raw);
  return raw != null && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : DEFAULT_DOWN_PAYMENT_PCT;
}

/**
 * Deposit on a grand total (subtotal + tax), rounded to cents — the same
 * arithmetic as the live invoice's deposit basis (q L628 + L631). For a quote,
 * prefer `quoteDeposit`. The builder's own "→ $X due upfront" multiplies its
 * unrounded-tax total (main L11317) and can read 1¢ different in rare cases.
 */
export function depositAmount(grandTotal: number, pct: number = DEFAULT_DOWN_PAYMENT_PCT): number {
  return round2(grandTotal * (downPaymentPct(pct) / 100));
}

/**
 * The deposit a quote will actually charge: pct of the invoice total its
 * approval creates (unrounded subtotal + tax in cents — QuoteTotals.invoiceTotal),
 * which is what the live invoice's `computeDueNow` asks for. Example: Good
 * without stairs totals $7,571.93 on screen but $7,571.9265 on the invoice, so
 * 50% is $3,785.96 (the app's figure), not round2(7571.93 / 2) = $3,785.97.
 */
export function quoteDeposit(totals: { invoiceTotal: number }, pct: number = DEFAULT_DOWN_PAYMENT_PCT): number {
  return depositAmount(totals.invoiceTotal, pct);
}

/** Builder line under the percentage (main L11319): "→ $4312.35 due upfront" — no thousands separator. */
export function depositLabel(amount: number): string {
  return '→ $' + amount.toFixed(2) + ' due upfront';
}
