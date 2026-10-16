/**
 * Roll goods (carpet sold off a roll): square yards ⇄ length on the roll.
 *
 *   SqYd = length × roll width ÷ 9
 *
 * Source (current app, demo main): main L13131-13270 — `ROLL_DEFAULT_WIDTH_FT`,
 * `_rollWidthFt`, `_isRolledLine`, `_rollQtyIsSqYd`, `_rollWidthFor`,
 * `_rollEnsureWidth`, `_rollInchesFor`, `_rollLengthFromQty`,
 * `_rollQtyExtraHtml`, `_rollDimsOpen`, `_rollDimsApply`, `setQBMaterialQty`,
 * `qbRecalcRollQty`, `qbApplyRollDimensions`; `_qbInchFrac` main L13401;
 * `_iuFmtFt` main L23314. App spec: scripts/carpet-length-from-yardage.test.js.
 *
 * Changed since the August app ("carpet length from yardage"):
 * - typing SqYd fills the length in WHOLE INCHES: inches = round(SqYd × 108 ÷
 *   width) → 79.12 SqYd on a 12' roll is 59' 4" (August: 59' 4.68" as
 *   decimal inches). The SqYd typed is never rewritten.
 * - only SqYd lines map to a length (cove base sold by the roll is Linear Ft);
 *   clearing the SqYd clears the length.
 * - the width comes from the line, then its inventory / catalog record (a
 *   number or a legacy {feet, inches} object), then a "15Ft 00In" width in the
 *   product name; carpet (RMAT number or a Carpet category) with none of those
 *   assumes 12' and the row says "× 12' roll (assumed)".
 * - the quote, invoice and work-order rows all show the same length chip
 *   (1/16" fractions) plus the width line.
 */
import { num, round2 } from './money';

/** A roll width as stored: feet as a number/string, or the legacy {feet, inches} object. */
export type RollWidthValue = number | string | { feet?: number | string | null; inches?: number | string | null } | null | undefined;

export interface RollishLine {
  rollWidth?: RollWidthValue;
  /** Set by the app when the 12' default was assumed (shown as "(assumed)"). */
  rollWidthAssumed?: boolean;
  purchaseUOM?: string | null;
  costUOM?: string | null;
  coverageUOM?: string | null;
  matNum?: string | null;
}

/** A rolled line as `_rollWidthFor` reads it. */
export interface RollLine extends RollishLine {
  quantity?: number | string | null;
  /** The product name on a quote line (`item`) — the app also reads productName and style. */
  item?: string | null;
  name?: string | null;
  productName?: string | null;
  style?: string | null;
  category?: string | { name?: string | null } | null;
  lengthFt?: number | string | null;
  lengthIn?: number | string | null;
}

/** An inventory / catalog record the width can come from (matched on matNum). */
export interface RollCatalogItem {
  matNum?: string | null;
  rollWidth?: RollWidthValue;
}

/** Where the app looks up a line's width: inventory first, then the product list. */
export interface RollCatalog {
  inventory?: readonly (RollCatalogItem | null | undefined)[];
  productList?: readonly (RollCatalogItem | null | undefined)[];
}

/** "Most carpet is 12' wide" (main L13131). */
export const ROLL_DEFAULT_WIDTH_FT = 12;

/** `_rollWidthFt` (main L13133): width in feet from 12, "12" or {feet, inches}; 0 when none. */
export function rollWidthFt(v: RollWidthValue): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'object') {
    const w = (Number(v.feet) || 0) + (Number(v.inches) || 0) / 12;
    return w > 0 ? w : 0;
  }
  const n = Number(v);
  return n > 0 ? n : 0;
}

/**
 * `_isRolledLine` (main L13134): a roll width, bought by the Roll, or a
 * material number starting with RMAT.
 */
export function isRolled(m: RollishLine | null | undefined): boolean {
  return (
    !!m &&
    (rollWidthFt(m.rollWidth) > 0 ||
      String(m.purchaseUOM || '').toLowerCase() === 'roll' ||
      String(m.matNum || '').toUpperCase().startsWith('RMAT'))
  );
}

/**
 * `_rollQtyIsSqYd` (main L13136): only a SqYd quantity maps to a length —
 * the line's cost UOM, else coverage UOM, else purchase UOM is blank or
 * "SqYd" / "Sq. Yd" / "sq y…".
 */
export function rollQtyIsSqYd(m: Pick<RollishLine, 'costUOM' | 'coverageUOM' | 'purchaseUOM'>): boolean {
  const u = String(m.costUOM || m.coverageUOM || m.purchaseUOM || '').trim();
  return !u || /^sq\.?\s*y/i.test(u);
}

export type RollWidthSource = 'line' | 'product' | 'name' | 'default' | '';

/**
 * `_rollWidthFor` (main L13137): the width a line resolves to and where it
 * came from — the line (`'default'` again when it was an assumed 12'), its
 * inventory/catalog record by matNum, a "12Ft 06In" width in the name, the
 * 12' carpet default, or nothing.
 */
export function rollWidthFor(m: RollLine, catalog: RollCatalog = {}): { w: number; src: RollWidthSource } {
  const own = rollWidthFt(m.rollWidth);
  if (own > 0) return { w: own, src: m.rollWidthAssumed ? 'default' : 'line' };
  const mn = m.matNum;
  const hit = (a: RollCatalog['inventory']) => (a || []).find((x) => !!x && x.matNum === mn && rollWidthFt(x.rollWidth) > 0);
  const rec = mn ? hit(catalog.inventory) || hit(catalog.productList) : null;
  if (rec) return { w: rollWidthFt(rec.rollWidth), src: 'product' };
  const nm = /(\d{1,2})\s*Ft\.?\s*(\d{1,2})\s*In\b/i.exec([m.item ?? m.name, m.productName, m.style].filter(Boolean).join(' '));
  if (nm && Number(nm[1]) > 0) return { w: Number(nm[1]) + Number(nm[2]) / 12, src: 'name' };
  const cat = m.category && typeof m.category === 'object' ? m.category.name : m.category;
  if (String(m.matNum || '').toUpperCase().startsWith('RMAT') || /carpet/i.test(cat || '')) return { w: ROLL_DEFAULT_WIDTH_FT, src: 'default' };
  return { w: 0, src: '' };
}

/** `_rollInchesFor` (main L13151): SqYd → whole inches of length on a roll w feet wide (0 without both). */
export function rollInchesFor(sqyd: number, widthFt: number): number {
  return sqyd > 0 && widthFt > 0 ? Math.round((sqyd * 108) / widthFt + 1e-9) : 0;
}

export interface RollLength {
  /** Whole feet. */
  lengthFt: number;
  /** Leftover WHOLE inches (0–11). */
  lengthIn: number;
  /** Length in feet, rounded to 2 decimals. */
  linearFt: number;
}

/**
 * SqYd → length on the roll (`_rollLengthFromQty` arithmetic): whole inches
 * = round(SqYd × 108 ÷ width); feet = ⌊inches ÷ 12⌋, inches = the rest.
 * Null without a width or a quantity.
 */
export function lengthFromSqYd(sqyd: number, widthFt: number): RollLength | null {
  const n = rollInchesFor(num(sqyd), num(widthFt));
  if (!n) return null;
  return { lengthFt: Math.floor(n / 12), lengthIn: n % 12, linearFt: Math.round((n / 12) * 100) / 100 };
}

/**
 * What `_rollLengthFromQty` writes onto the line. Only the keys present are
 * written: a clear has just the three length keys; a width-only patch (the
 * SqYd is too small to make a whole inch) has just the two width keys.
 */
export interface RollLengthPatch {
  lengthFt?: number | '';
  lengthIn?: number | '';
  linearFt?: number | '';
  /** The resolved width the app stores on the line (rounded to 3 decimals). */
  rollWidth?: number;
  /** True when the 12' default was assumed; false = the app deletes the flag. */
  rollWidthAssumed?: boolean;
}

/**
 * `_rollLengthFromQty` (main L13153), the step that runs after every SqYd
 * edit (`setQBMaterialQty`, the invoice and work-order equivalents):
 * - not rolled, or not a SqYd line → null (nothing changes);
 * - blank / zero SqYd → the length is cleared;
 * - otherwise the width is resolved and stored (`_rollEnsureWidth`) and the
 *   length is filled from the SqYd; null when no width can be found. (A SqYd
 *   under half an inch of length still stores the width — the app resolves
 *   it before it finds there is no length to write.)
 */
export function rollLengthFromQty(m: RollLine, catalog: RollCatalog = {}): RollLengthPatch | null {
  if (!isRolled(m) || !rollQtyIsSqYd(m)) return null;
  const q = Number(m.quantity) || 0;
  if (!(q > 0)) return { lengthFt: '', lengthIn: '', linearFt: '' };
  const r = rollWidthFor(m, catalog);
  if (!(r.w > 0)) return null;
  const width = { rollWidth: Math.round(r.w * 1000) / 1000, rollWidthAssumed: r.src === 'default' };
  const n = rollInchesFor(q, r.w);
  if (!n) return width;
  return { ...width, lengthFt: Math.floor(n / 12), lengthIn: n % 12, linearFt: Math.round((n / 12) * 100) / 100 };
}

export interface RollQuantity {
  /** Square yards, rounded to 2 decimals — this becomes the line quantity. */
  quantity: number;
  linearFt: number;
}

/**
 * Length typed on a rolled line → SqYd (`qbRecalcRollQty`, main L13228,
 * unchanged): SqYd = round2((ft + in/12) × width / 9). Null when width is
 * missing or both length fields are empty/zero (the app keeps the old
 * quantity then).
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
 * Decimal inches → nearest 1/16 as text (`_qbInchFrac`, main L13401):
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
 * The 📐 length chip on a rolled line (`_rollQtyExtraHtml`), e.g. `14' 6"`.
 * Empty string when no length is set — the app then shows "⚠ set length".
 * Quote, invoice and work-order rows all print it this way now.
 */
export function lengthLabel(ft: number | string | null | undefined, inches: number | string | null | undefined): string {
  const lf = num(ft);
  const li = num(inches);
  if (!(lf > 0 || li > 0)) return '';
  const inDisp = inchFraction(li);
  return inDisp ? `${lf}' ${inDisp}"` : `${lf}'`;
}

/** Text the app shows on a rolled line with no length yet (`_rollQtyExtraHtml`). */
export const SET_LENGTH_HINT = '⚠ set length';

/** `_iuFmtFt` (main L23314): 12 → `12'`, 13.5 → `13' 6"`, whole inches; '' for no width. */
export function rollWidthLabel(ft: number | string | null | undefined): string {
  const v = Number(ft) || 0;
  if (!(v > 0)) return '';
  let f = Math.floor(v);
  let i = Math.round((v - f) * 12);
  if (i === 12) {
    f++;
    i = 0;
  }
  return f + "'" + (i ? ' ' + i + '"' : '');
}

/**
 * The width line under a rolled line's length (`_rollQtyExtraHtml`):
 * "× 12' roll (assumed)" / "× 13' 6\" roll", with the app's tooltip. Null
 * when the line has no width.
 */
export function rollWidthLine(m: Pick<RollishLine, 'rollWidth' | 'rollWidthAssumed'>): { text: string; title: string } | null {
  const w = rollWidthFt(m.rollWidth);
  if (!(w > 0)) return null;
  const wD = rollWidthLabel(w);
  return {
    text: `× ${wD} roll${m.rollWidthAssumed ? ' (assumed)' : ''}`,
    title: m.rollWidthAssumed ? `No roll width on this product — ${wD} assumed. Click to change.` : 'Roll width — click to change',
  };
}

/** Roll width from the width dialog: ft + in/12, rounded to 3 decimals (`qbApplyRollWidth`, `_rollDimsApply`). */
export function rollWidthFromFtIn(ft: number, inches: number): number | null {
  const width = num(ft) + num(inches) / 12;
  return width > 0 ? Math.round(width * 1000) / 1000 : null;
}

// --------------------------------------------- the Roll Dimensions window --

/**
 * Live preview in the Roll Dimensions window (`_rollDimsOpen` update(), main
 * L13174) for a TYPED length: "📐 12' wide × 14' 6" = 19.33 SqYd", or the
 * prompt when a side is missing. Inches print as typed (no 1/16 rounding).
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

/**
 * The same window while the line has SqYd and no length has been typed yet:
 * the length inputs FOLLOW the SqYd (and any width change), and the preview
 * keeps the SqYd itself. 79.12 SqYd at 15' → 47' 6", "… = 79.12 SqYd".
 */
export function rollDimensionsFromQty(widthFt: number, widthIn: number, sqyd: number): { lengthFt: number | ''; lengthIn: number | ''; preview: string } {
  const wf = num(widthFt);
  const wi = num(widthIn);
  const q = num(sqyd);
  const w = wf + wi / 12;
  let lengthFt: number | '' = '';
  let lengthIn: number | '' = '';
  if (w > 0) {
    const n = rollInchesFor(q, w);
    lengthFt = n ? Math.floor(n / 12) : '';
    lengthIn = n ? n % 12 : '';
  }
  const lf = num(lengthFt);
  const li = num(lengthIn);
  if (!(w > 0 && lf + li / 12 > 0)) return { lengthFt, lengthIn, preview: 'Enter width and length to see SqYd' };
  const wd = wi > 0 ? `${wf}' ${wi}"` : `${wf}'`;
  const ld = li > 0 ? `${lf}' ${li}"` : `${lf}'`;
  return { lengthFt, lengthIn, preview: `📐 ${wd} wide × ${ld} = ${q.toFixed(2)} SqYd` };
}

/** What the Roll Dimensions window opens with (`_rollDimsOpen`). */
export interface RollDimsDialog {
  widthFt: number | '';
  widthIn: number | '';
  lengthFt: string;
  lengthIn: string;
  /** True while the length follows the line's SqYd. */
  fromQty: boolean;
  /** Intro sentence. */
  intro: string;
  /** The yellow note under the inputs ('' for none). */
  note: string;
}

/** `_rollDimsOpen` (main L13174): prefilled width, length and the explanatory copy. */
export function rollDimsDialog(m: RollLine, catalog: RollCatalog = {}): RollDimsDialog {
  const r = rollWidthFor(m, catalog);
  const cw = r.w;
  const q = Number(m.quantity) || 0;
  const fromQty = q > 0 && rollQtyIsSqYd(m);
  return {
    widthFt: cw > 0 ? Math.floor(cw) : '',
    widthIn: cw > 0 ? Math.round((cw - Math.floor(cw)) * 12 * 100) / 100 : '',
    lengthFt: m.lengthFt != null && m.lengthFt !== '' ? String(m.lengthFt) : '',
    lengthIn: m.lengthIn != null && m.lengthIn !== '' ? String(m.lengthIn) : '',
    fromQty,
    intro: `Set the roll's width and the length of carpet needed. SqYd = length × width / 9${fromQty ? ` — the length is worked out from the ${q} SqYd on the line until you type one.` : '.'}`,
    note:
      r.src === 'default'
        ? `No roll width on this product — ${rollWidthLabel(cw)} is assumed (most carpet is 12' wide). Change it if this roll is different.`
        : r.src === 'name'
          ? 'Width read from the product name.'
          : '',
  };
}

export interface RollDimsInput {
  widthFt: number | string | null | undefined;
  widthIn: number | string | null | undefined;
  lengthFt: number | string | null | undefined;
  lengthIn: number | string | null | undefined;
  /** True once someone typed in a length box. */
  typed: boolean;
}

export interface RollDimsResult {
  /** Fields to write onto the line (`rollWidthAssumed: false` = delete the flag). */
  patch: Partial<Pick<RollLengthPatch, 'lengthFt' | 'lengthIn' | 'linearFt' | 'rollWidth' | 'rollWidthAssumed'>> & { quantity?: number };
  /** 'qty' when the length was worked out from the line's SqYd. */
  from: 'qty' | 'length';
  /**
   * Quote builder only: a typed length (ft, 3 decimals) saved back as the
   * product's roll length when the line has a matNum; null otherwise.
   */
  rollLength: number | null;
}

/**
 * Save the Roll Dimensions window onto a quote line (`_rollDimsApply` +
 * `qbApplyRollDimensions`, main L13204 / L13239): a width > 0 is stored (and
 * stops being "assumed"); with SqYd and no typed length the length is worked
 * out from the SqYd; otherwise the typed length is stored and sets SqYd.
 */
export function applyRollDimensions(m: RollLine, input: RollDimsInput, catalog: RollCatalog = {}): RollDimsResult {
  const w = num(input.widthFt) + num(input.widthIn) / 12;
  const lf = num(input.lengthFt);
  const li = num(input.lengthIn);
  const patch: RollDimsResult['patch'] = {};
  let line: RollLine = m;
  if (w > 0) {
    patch.rollWidth = Math.round(w * 1000) / 1000;
    patch.rollWidthAssumed = false;
    line = { ...m, rollWidth: patch.rollWidth, rollWidthAssumed: false };
  }
  if (!input.typed && Number(m.quantity) > 0 && rollQtyIsSqYd(m)) {
    const fromQty = rollLengthFromQty(line, catalog);
    if (fromQty && fromQty.lengthFt !== undefined) return { patch: { ...patch, ...fromQty }, from: 'qty', rollLength: null };
    // No whole inch of length to write — the width it resolved is still stored.
    if (fromQty) Object.assign(patch, fromQty);
  }
  patch.lengthFt = lf > 0 ? lf : '';
  patch.lengthIn = li > 0 ? li : '';
  // qbRecalcRollQty reads Number(m.rollWidth): a legacy {feet,inches} width left untouched reads as 0.
  const width = Number(patch.rollWidth ?? m.rollWidth) || 0;
  const ft = Number(patch.lengthFt) || 0;
  const inches = Number(patch.lengthIn) || 0;
  if (width > 0 && (ft > 0 || inches > 0)) {
    const len = ft + inches / 12;
    patch.quantity = Math.round(((len * width) / 9) * 100) / 100;
    patch.linearFt = Math.round(len * 100) / 100;
  }
  const typedLen = lf + li / 12;
  return { patch, from: 'length', rollLength: typedLen > 0 && m.matNum ? Math.round(typedLen * 1000) / 1000 : null };
}

/** Toast after a typed length is saved back to the product (`qbApplyRollDimensions`). */
export function rollLengthSavedToast(rollLengthFt: number): string {
  return '📐 Roll length ' + rollLengthFt.toFixed(2) + ' ft saved to the product for next time';
}
