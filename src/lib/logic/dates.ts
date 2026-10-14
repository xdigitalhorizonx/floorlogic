/**
 * Date helpers matching the app's behaviour, written so they give the same
 * answer on any machine (no reliance on the host time zone for date-only
 * strings).
 *
 * Source: main L5847-5863 (`_isoDay`, `_todayISO`, `fmtDate`, `daysBetween`)
 * and q L574-575 (`fmtDate`, `plusDays`).
 */

/** A calendar date as the app stores it: 'YYYY-MM-DD'. */
export type ISODate = string;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `_isoDay` (main L5847): a Date's LOCAL calendar day as 'YYYY-MM-DD'. */
export function isoDay(d: Date): ISODate {
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
 * `plusDays` (q L575) for date-only strings: calendar arithmetic, so month and
 * year roll over correctly. Returns '' for an unusable input, like the app.
 */
export function addDays(iso: ISODate, days: number): ISODate {
  const p = parts(iso);
  if (!p) return '';
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * `daysBetween` (main L5863): whole days from a to b, rounded. For two
 * date-only strings this is an exact calendar-day difference.
 */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
}

/**
 * `fmtDate` (main L5862) for a date-only string: "Oct 16, 2026" — the
 * en-US short form the app gets from toLocaleDateString. Built by hand so it
 * never depends on the host's ICU data. Blank input gives "—" like the app.
 */
export function fmtDate(iso: ISODate | null | undefined): string {
  if (!iso) return '—';
  const p = parts(iso);
  if (!p) return '—';
  return `${MONTHS[p[1] - 1]} ${p[2]}, ${p[0]}`;
}
