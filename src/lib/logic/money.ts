/**
 * Money, number and document-number helpers.
 *
 * Source of truth: the FloorLogic demo `main` branch, exported to
 * demo-main-index.html (cited as "main L<n>") and demo-main-q.html
 * (cited as "q L<n>").
 */

/**
 * The app's universal coercion: `Number(v) || 0`. Blank, null, undefined and
 * NaN all read as 0 (main L11348 and nearly every money line in the app).
 */
export function num(v: unknown): number {
  return Number(v) || 0;
}

/**
 * Round to cents the way the app does: `Math.round(n * 100) / 100`
 * (main L10966, L13912 `r2`, q L616).
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The app's `fmt$` (main L5842): "$" + en-US grouping with exactly two
 * decimals. Negative values keep the app's "$-1,234.50" shape.
 */
export function fmtMoney(n: unknown): string {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Signed money for variance cells (main L26475 / L26500): "—" when the
 * difference is under half a cent, otherwise "+$x" or "−$x" (U+2212 minus).
 */
export function fmtSignedMoney(v: number): string {
  if (Math.abs(v) < 0.005) return '—';
  return (v > 0 ? '+' : '−') + fmtMoney(Math.abs(v));
}

/** Quote-builder quantity cell (`_qbFmtQty`, main L11165): two decimals, blank stays blank. */
export function fmtQty(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isNaN(n) ? '' : n.toFixed(2);
}

/** q.html `fmtNum` (q L572): whole numbers without decimals, others up to 2. */
export function fmtNum(n: unknown): string {
  const v = Number(n) || 0;
  return v % 1 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toLocaleString('en-US');
}

/**
 * Document numbers: prefix + counter padded to 3 digits — 'QT-' (main L13024),
 * 'WO-' / 'IN-' (main L8225), 'LD-' (main L8139). Longer numbers are not cut.
 */
export function formatDocNumber(prefix: string, n: number): string {
  return prefix + String(n).padStart(3, '0');
}

/** The numeric part of a document number ("QT-330" → 330). NaN when there is none. */
export function docNumberSuffix(docNumber: string): number {
  const m = /(\d+)\s*$/.exec(String(docNumber));
  return m ? parseInt(m[1]!, 10) : Number.NaN;
}
