/**
 * Date helpers matching the app's behaviour, written so they give the same
 * answer on any machine (no reliance on the host time zone for date-only
 * strings).
 *
 * Source: main L6973-6989 (`_isoDay`, `_todayISO`, `_dateOnly`, `fmtDate`,
 * `daysBetween`) and q L576 (`fmtDate`). (Quote/invoice dates now go through
 * DocumentDates — see document-dates.ts.)
 */

/** A calendar date as the app stores it: 'YYYY-MM-DD'. */
export type ISODate = string;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `_isoDay` (main L6973): a Date's LOCAL calendar day as 'YYYY-MM-DD'. */
export function isoDay(d: Date): ISODate {
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * `_dateOnly` (main L6982): a bare 'YYYY-MM-DD' passes through untouched;
 * anything else is read as an instant and turned into its LOCAL calendar
 * day; '' when blank or unreadable. (Documents use `dateOnly` in
 * document-dates.ts instead, which reads instants on the Pacific calendar.)
 */
export function localDateOnly(v: unknown): ISODate {
  if (!v) return '';
  const str = String(v);
  if (DATE_ONLY.test(str)) return str;
  return isoDay(new Date(str));
}

/** Today's local calendar day — the only clock read in the logic library. */
export function todayISO(): ISODate {
  return isoDay(new Date());
}

function parts(iso: string): [number, number, number] | null {
  const m = DATE_ONLY.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * n days after a date-only string: calendar arithmetic, so month and year
 * roll over correctly (what the August q.html `plusDays` and the current
 * `DocumentDates.addDays` both do for a bare day). Returns '' for an
 * unusable input, like the app.
 */
export function addDays(iso: ISODate, days: number): ISODate {
  const p = parts(iso);
  if (!p) return '';
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * `daysBetween` (main L6989): whole days from a to b, rounded. For two
 * date-only strings this is an exact calendar-day difference.
 */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
}

/**
 * `fmtDate` (main L6988) for a date-only string: "Oct 16, 2026" — the
 * en-US short form the app gets from toLocaleDateString. Built by hand so it
 * never depends on the host's ICU data. Blank input gives "—" like the app.
 */
export function fmtDate(iso: ISODate | null | undefined): string {
  if (!iso) return '—';
  const p = parts(iso);
  if (!p) return '—';
  return `${MONTHS[p[1] - 1]} ${p[2]}, ${p[0]}`;
}
