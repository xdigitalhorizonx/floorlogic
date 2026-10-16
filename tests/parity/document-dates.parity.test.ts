/**
 * Document dates parity: the app's own document-dates.js (DocumentDates,
 * loaded by index.html and q.html) against the site port, over date-only
 * values, UTC-midnight timestamps, real instants either side of Pacific
 * midnight, month ends, leap years and junk; plus q.html's Issued /
 * Valid-until lines and approveQuote's invoice due date.
 */
import { describe, expect, it } from 'vitest';
import { addCalendarDays, addMonths, dateOnly, documentValidUntil, invoiceDueDate, QUOTE_VALID_DAYS } from '../../src/lib/logic';
import { appDocumentDates, code } from './app-source';

const app = appDocumentDates();

const VALUES: unknown[] = [
  null, undefined, '', 0, 'not-a-date', '2026-13-45T10:00:00Z',
  '2026-10-13', '2026-01-31', '2026-02-28', '2028-02-29', '2026-12-31', '2027-03-31', '2026-05-31', '0999-06-15',
  '2026-10-13T00:00:00Z', '2026-10-13T00:00:00.000Z', '2026-10-13 00:00:00+00', '2026-10-13T00:00:00+00:00', '2026-10-13T00:00:00+0000',
  '2026-10-13T06:59:59Z', '2026-10-13T07:00:00Z', '2026-10-14T03:30:00Z', '2026-11-01T08:30:00Z', '2026-03-08T09:59:00Z', '2026-03-08T10:00:00Z',
  '2026-10-13T17:45:00-07:00', '2026-10-13T23:59:59-07:00', '2026-12-31T23:30:00-08:00',
  Date.UTC(2026, 9, 14, 6, 0), Date.UTC(2026, 9, 14, 8, 0), new Date(Date.UTC(2026, 0, 31, 12)),
];
const STEPS = [-400, -31, -1, 0, 1, 7, 14, 15, 28, 29, 30, 31, 45, 60, 90, 365, 366];
const MONTHS = [-13, -1, 0, 1, 2, 11, 12, 13, 25];

describe('DocumentDates (document-dates.js) vs the site port', () => {
  it('dateOnly', () => {
    for (const v of VALUES) expect(dateOnly(v), String(v)).toBe(app.dateOnly(v));
  });
  it('addDays', () => {
    for (const v of VALUES) for (const n of STEPS) expect(addCalendarDays(v, n), `${String(v)} + ${n}`).toBe(app.addDays(v, n));
  });
  it('addMonths (clamps to the month end)', () => {
    for (const v of VALUES) for (const n of MONTHS) expect(addMonths(v, n), `${String(v)} + ${n}mo`).toBe(app.addMonths(v, n));
  });
  it('invoiceDueDate: the same day next month', () => {
    for (const v of VALUES) expect(invoiceDueDate(v), String(v)).toBe(app.invoiceDueDate(v));
    expect(invoiceDueDate('2026-10-13')).toBe('2026-11-13');
    expect(invoiceDueDate('2026-01-31')).toBe('2026-02-28');
    expect(invoiceDueDate('2028-01-31')).toBe('2028-02-29');
  });
});

describe('where the app uses them', () => {
  it('q.html: Issued is the document day; Valid until falls back to invoice = next month, quote = +30', () => {
    const src = code('q:text:doc-dates');
    expect(src).toContain('const issued = q.created_at ? fmtDate(DocumentDates.dateOnly(q.created_at)) : \'\';');
    expect(src).toContain('q.expiration_date ? fmtDate(DocumentDates.dateOnly(q.expiration_date))');
    expect(src).toContain(`(INV_MODE ? DocumentDates.invoiceDueDate(q.created_at) : DocumentDates.addDays(q.created_at, ${QUOTE_VALID_DAYS}))`);
    const run = (q: Record<string, unknown>, INV_MODE: boolean) =>
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function('q', 'INV_MODE', 'DocumentDates', 'fmtDate', `${src}\nreturn validUntil;`)(q, INV_MODE, app, (s: string) => s) as string;
    for (const createdAt of ['2026-10-13', '2026-10-13T00:00:00Z', '2026-01-31T21:00:00Z', null]) {
      for (const expirationDate of [null, '2026-12-01', '2026-12-01T00:00:00Z']) {
        for (const inv of [true, false]) {
          expect(documentValidUntil({ createdAt, expirationDate }, inv), `${createdAt} ${expirationDate} ${inv}`)
            .toBe(run({ created_at: createdAt, expiration_date: expirationDate }, inv));
        }
      }
    }
  });

  it('approveQuote dates the invoice with DocumentDates.invoiceDueDate', () => {
    expect(code('index:fn:approveQuote')).toContain('dueDate:DocumentDates.invoiceDueDate(_todayISO())');
  });

  it('the live invoice names the Net-terms due day with DocumentDates.addDays', () => {
    expect(code('q:text:payment-box')).toContain('fmtDate(DocumentDates.addDays(q.created_at, due.netDays))');
  });
});
