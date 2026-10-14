/**
 * Roll goods (carpet sold off a roll): square yards <-> length on the roll.
 *
 * Source: main L10961-10975 (`setQBMaterialQty`, `qbRecalcRollQty`),
 * L10979 (`_qbPrefillRollLength`), L10981 (`qbApplyRollWidth`),
 * L11005 (`qbEditRollDimensions` preview) and L11183-11226
 * (`_qbInchFrac`, `qbBuildQtyExtraHtml`).
 */
import { num, round2 } from './money';

export interface RollishLine {
  rollWidth?: number | string | null;
  purchaseUOM?: string | null;
  matNum?: string | null;
}

/**
 * A line is "rolled" when it has a roll width, is bought by the Roll, or its
 * material number starts with RMAT (main L10967, repeated at L10979, L11210).
 */
export function isRolled(m: RollishLine): boolean {
  return (
    num(m.rollWidth) > 0 ||
    String(m.purchaseUOM || '').toLowerCase() === 'roll' ||
    String(m.matNum || '').toUpperCase().startsWith('RMAT')
  );
}

export interface RollLength {
  /** Whole feet: floor(linear feet). */
  lengthFt: number;
  /** Leftover inches, rounded to 2 decimals (not yet to 1/16). */
  lengthIn: number;
  /** Linear feet rounded to 2 decimals. */
  linearFt: number;
}

/**
 * SqYd typed on a rolled line → length on the roll (main L10968):
 * linear ft = qty × 9 / width; feet = floor; inches = round2(frac × 12).
 * Returns null when there is no width or no quantity (the app leaves the
 * length alone in that case).
 */
export function lengthFromSqYd(sqyd: number, widthFt: number): RollLength | null {
  const w = num(widthFt);
  const q = num(sqyd);
  if (!(w > 0 && q > 0)) return null;
  const linearFt = (q * 9) / w;
  const whole = Math.floor(linearFt);
  return { lengthFt: whole, lengthIn: round2((linearFt - whole) * 12), linearFt: round2(linearFt) };
}

export interface RollQuantity {
  /** Square yards, rounded to 2 decimals — this becomes the line quantity. */
  quantity: number;
  linearFt: number;
}

/**
 * Length typed on a rolled line → SqYd (`qbRecalcRollQty`, main L10975):
 * SqYd = round2((ft + in/12) × width / 9). Null when width is missing or both
 * length fields are empty/zero (the app keeps the old quantity then).
 */
export function sqYdFromLength(ft: number, inches: number, widthFt: number): RollQuantity | null {
  const f = num(ft);
  const i = num(inches);
  const w = num(widthFt);
  if (!(w > 0 && (f > 0 || i > 0))) return null;
  const lf = f + i / 12;
  return { quantity: round2((lf * w) / 9), linearFt: round2(lf) };
}

/**
 * Decimal inches → nearest 1/16 as text (`_qbInchFrac`, main L11183):
 * 6 → "6", 3.5 → "3 1/2", 0.0625 → "1/16", 0 → "".
 * Like the app, 11.99 rounds to "12" (it does not carry into the feet).
 */
export function inchFraction(dec: number | null | undefined): string {
  if (dec == null) return '';
  const sixteenths = Math.round(Number(dec) * 16);
  if (sixteenths <= 0) return '';
  const whole = Math.floor(sixteenths / 16);
  const frac = sixteenths - whole * 16;
  if (frac === 0) return whole > 0 ? String(whole) : '';
  let n = frac;
  let d = 16;
  while (n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return (whole > 0 ? whole + ' ' : '') + n + '/' + d;
}

/**
 * The length chip on a rolled quote line (main L11211-11218), e.g. `14' 6"`.
 * Empty string when no length is set — the app then shows "⚠ set length".
 * Note: the work-order row shows inches as a trimmed decimal instead of a
 * 1/16 fraction (main L11594), so the same line can read `14' 5.97"` there.
 */
export function lengthLabel(ft: number | string | null | undefined, inches: number | string | null | undefined): string {
  const lf = num(ft);
  const li = num(inches);
  if (!(lf > 0 || li > 0)) return '';
  const inDisp = inchFraction(li);
  return inDisp ? `${lf}' ${inDisp}"` : `${lf}'`;
}

/** Text the app shows on a rolled line with no length yet (main L11220). */
export const SET_LENGTH_HINT = '⚠ set length';

/** Roll width from the width dialog: ft + in/12, rounded to 3 decimals (main L10981). */
export function rollWidthFromFtIn(ft: number, inches: number): number | null {
  const width = num(ft) + num(inches) / 12;
  return width > 0 ? Math.round(width * 1000) / 1000 : null;
}

/**
 * Live preview in the Roll Dimensions dialog (main L10984-11005):
 * "📐 12' wide × 14' 6" = 19.33 SqYd", or the prompt when a side is missing.
 * Inches print as typed here (no 1/16 rounding), exactly like the dialog.
 */
export function rollDimensionsPreview(widthFt: number, widthIn: number, lengthFt: number, lengthIn: number): string {
  const wf = num(widthFt);
  const wi = num(widthIn);
  const lf = num(lengthFt);
  const li = num(lengthIn);
  const w = wf + wi / 12;
  const l = lf + li / 12;
  if (!(w > 0 && l > 0)) return 'Enter width and length to see SqYd';
  const sqyd = (w * l) / 9;
  const wd = wi > 0 ? `${wf}' ${wi}"` : `${wf}'`;
  const ld = li > 0 ? `${lf}' ${li}"` : `${lf}'`;
  return `📐 ${wd} wide × ${ld} = ${sqyd.toFixed(2)} SqYd`;
}
