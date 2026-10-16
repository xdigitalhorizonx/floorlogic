/**
 * Document dates: issue day, invoice due date, quote validity and "n days
 * after" — a line-for-line port of the app's shared `DocumentDates` helper
 * (document-dates.js, loaded by both index.html and q.html since 2026-10).
 *
 * Quote/invoice dates are calendar days. A date-only value — or the UTC
 * midnight Postgres hands back for one ('2026-10-13T00:00:00Z' /
 * '…+00:00') — keeps its day. Any other instant is read on the store's
 * Pacific calendar (America/Los_Angeles), whatever the viewer's time zone.
 *
 * Changes vs the August app this replaces:
 * - invoice due date = the SAME DAY NEXT MONTH (Oct 13 → Nov 13; Jan 31 →
 *   Feb 28/29), not issued + 30 days (`approveQuote` main L12367,
 *   q.html "Due" line q L884-889);
 * - q.html's `plusDays` is gone; the live invoice's "due Nov 14, 2026"
 *   (Net terms) is `addCalendarDays(created_at, n)` (q L1699).
 */
import type { ISODate } from './dates';

const CALENDAR = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** A bare date, or a date with a UTC-midnight time (how Postgres returns a date-only write). */
const DAY_OR_UTC_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})(?:[T ]00:00:00(?:\.0+)?(?:Z|\+00(?::?00)?))?$/;

/**
 * `DocumentDates.dateOnly`: the calendar day a stored value stands for, as
 * 'YYYY-MM-DD'; '' when blank or unreadable.
 */
export function dateOnly(value: unknown): ISODate {
  if (!value) return '';
  if (typeof value === 'string') {
    const day = value.match(DAY_OR_UTC_MIDNIGHT);
    if (day) return day[1]!;
  }
  const instant = new Date(value as string | number | Date);
  if (Number.isNaN(instant.getTime())) return '';
  const parts = Object.fromEntries(CALENDAR.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * `DocumentDates.addDays`: calendar arithmetic on the document's day (no
 * daylight-saving drift). '' when the value is unusable.
 */
export function addCalendarDays(value: unknown, days: number): ISODate {
  const day = dateOnly(value);
  if (!day) return '';
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * `DocumentDates.addMonths`: same day of the month, n months on; a day the
 * target month lacks clamps to its last day (Jan 31 + 1 → Feb 28, or Feb 29
 * in a leap year).
 */
export function addMonths(value: unknown, months: number): ISODate {
  const day = dateOnly(value);
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = idx - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * `DocumentDates.invoiceDueDate`: the default invoice due date — the same
 * day next month (issued Oct 13 → due Nov 13).
 */
export function invoiceDueDate(issued: unknown): ISODate {
  return addMonths(issued, 1);
}

/** A quote is valid for 30 days when it has no expiration date (q L888-889). */
export const QUOTE_VALID_DAYS = 30;

/**
 * The "Valid until" / "Due" date the customer page prints (q L884-889): the
 * stored expiration/due date, else an invoice's default due date (same day
 * next month) or a quote's issue day + 30. Date-only; '' when unknown.
 */
export function documentValidUntil(doc: { createdAt?: unknown; expirationDate?: unknown }, isInvoice: boolean): ISODate {
  if (doc.expirationDate) return dateOnly(doc.expirationDate);
  if (!doc.createdAt) return '';
  return isInvoice ? invoiceDueDate(doc.createdAt) : addCalendarDays(doc.createdAt, QUOTE_VALID_DAYS);
}
