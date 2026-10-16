/**
 * Carton (box) snapping, the per-line quantity hint, "apply job area" and the
 * "Round Labor Up?" prompt.
 *
 * Source (current app, demo main): main L13214 (`setQBMaterialQty`), L13425
 * (`qbBuildQtyExtraHtml`), L13807 (`woBuildQtyExtraHtml`), L12234
 * (`_coverageUnits`), L14989 (`applyAreaQty`), L14991
 * (`openLaborRoundupModal`), L14992 (`roundupLaborQty`).
 *
 * FIXED IN THE APP (was an August bug): the app now snaps with
 * `Math.ceil(v / cov - 1e-9)`, exactly the site's rule, so an exact carton
 * multiple (914.71 = 41 × 22.31, which divides to 41.00000000000001) no
 * longer gains a phantom 42nd carton — in the quantity, the hint, the
 * job-area fill and the work order's inventory need (`_coverageUnits`).
 *
 * Also new: "Apply area" skips trim, transitions, moulding and nosing
 * (category /trim|transition|mou?lding|nosing/i) — those are counted by the
 * piece, not by the area.
 */
import { num, round2 } from './money';
import { isRolled, lengthLabel, rollWidthLine, SET_LENGTH_HINT, type RollishLine } from './roll';

export const CARTON_EPSILON = 1e-9;

export interface CartonSnap {
  cartons: number;
  /** Snapped quantity in the coverage unit (SqFt), rounded to cents like the app. */
  quantity: number;
}

/**
 * Snap an area to whole cartons: ceil(v / cov − 1e-9) cartons × coverage,
 * rounded to cents. Null when the app would not snap: coverage ≤ 1 (not sold
 * by the carton) or a non-positive quantity (`if(cov>1&&v>0)`).
 */
export function snapToCartons(qty: number, coverage: number): CartonSnap | null {
  const v = Number(qty);
  const cov = num(coverage);
  if (!(cov > 1 && v > 0)) return null;
  const cartons = Math.ceil(v / cov - CARTON_EPSILON);
  return { cartons, quantity: round2(cartons * cov) };
}

/**
 * The app's snap. Since the October app it carries the same 1e-9 epsilon as
 * `snapToCartons`, so the two always agree; kept as an alias for existing
 * imports. The August phantom-carton rule lives on as `augustSnapToCartons`.
 */
export function appSnapToCartons(qty: number, coverage: number): CartonSnap | null {
  return snapToCartons(qty, coverage);
}

/**
 * The AUGUST app's snap (no epsilon) — documentation only: 914.71 @ 22.31
 * gave 42 cartons = 937.02. The current app does not do this any more.
 */
export function augustSnapToCartons(qty: number, coverage: number): CartonSnap | null {
  const v = Number(qty);
  const cov = num(coverage);
  if (!(cov > 1 && v > 0)) return null;
  const cartons = Math.ceil(v / cov);
  return { cartons, quantity: Math.round(cartons * cov * 100) / 100 };
}

/**
 * Quantity a material line ends up with after the user types `value`
 * (`setQBMaterialQty`): blank stays blank, carton products snap up to whole
 * cartons, everything else is kept as typed. (A rolled SqYd line also gets
 * its length filled — see `rollLengthFromQty` in roll.ts.)
 */
export function materialQtyFromInput(value: number | string | null | undefined, coverage: number): number | '' {
  if (value === '' || value == null) return '';
  const v = Number(value);
  const snap = snapToCartons(v, coverage);
  return snap ? snap.quantity : v;
}

/** Carton count shown in the hint: `cov>1 ? ceil(qty/cov − 1e-9) : 0`. */
export function cartonCount(qty: number, coverage: number): number {
  const cov = num(coverage);
  return cov > 1 ? Math.ceil(num(qty) / cov - CARTON_EPSILON) : 0;
}

/**
 * `_covUnitKey` (main L12218): a unit name reduced to one key so different
 * spellings compare equal — "Sq. Ft"/"SF" → 'sqft', "SY" → 'sqyd',
 * "Linear Ft"/"LF"/"ft" → 'lf', "ea"/"pcs" → 'each', "inches" → 'in';
 * anything else lowercased without spaces or dots.
 */
export function coverageUnitKey(u: string | null | undefined): string {
  const s = String(u || '').toLowerCase().replace(/[\s.]/g, '');
  if (!s) return '';
  if (/^(sqft|sf|squarefe?e?t|squarefoot)$/.test(s)) return 'sqft';
  if (/^(sqyd|sy|squareyards?)$/.test(s)) return 'sqyd';
  if (/^(lf|linft|linearf(ee|oo)?t|linearfoot|ft|feet|foot)$/.test(s)) return 'lf';
  if (/^(ea|each|pc|pcs|piece|pieces)$/.test(s)) return 'each';
  if (/^(in|ins|inch|inches)$/.test(s)) return 'in';
  return s;
}

/**
 * `_lineCoverage` (main L12227, new since August): the pack size a line
 * rounds up to, taken from its product when it is added or swapped. Only a
 * coverage held in the PRICE's own unit counts — a trim piece whose 94"
 * length sits in coverage (priced per piece or per SqFt) gets 0, so a
 * quantity of 1 stays 1 instead of snapping to a "carton" of 94.
 */
export function lineCoverage(item: { coverage?: number | string | null; coverageUOM?: string | null; costUOM?: string | null } | null | undefined): number {
  if (!item) return 0;
  const cov = Number(item.coverage) || 0;
  if (!(cov > 1)) return cov;
  const cu = coverageUnitKey(item.coverageUOM);
  const pu = coverageUnitKey(item.costUOM);
  if (cu === 'in') return 0;
  if (cu && pu && cu !== pu) return 0;
  return cov;
}

/**
 * `_coverageUnits` (main L12234): purchase units a quantity needs — whole
 * cartons for carton products, the quantity itself otherwise. Used for the
 * inventory a work order allocates and consumes.
 */
export function coverageUnits(qty: number | string | null | undefined, coverage: number | string | null | undefined): number {
  const c = Number(coverage) || 0;
  const q = Number(qty) || 0;
  return c > 1 && q > 0 ? Math.ceil(q / c - CARTON_EPSILON) : q;
}

/** Purchase-unit label with the app's plural rule: Carton/Cartons, Box/Boxes. */
export function cartonUnitLabel(count: number, purchaseUOM?: string | null): string {
  const uomLbl = purchaseUOM || 'unit';
  if (count === 1) return uomLbl;
  return /box$/i.test(uomLbl) ? uomLbl + 'es' : uomLbl + 's';
}

export interface CartonLine {
  quantity: number | string | null | undefined;
  coveragePerUOM?: number | string | null;
  purchaseUOM?: string | null;
  costUOM?: string | null;
  coverageUOM?: string | null;
}

export interface CartonHint {
  cartons: number;
  /** "39 Cartons" */
  count: string;
  /** "= 927.03 SqFt" */
  equals: string;
  /** "39 Cartons = 927.03 SqFt" — the app prefixes the count with 📦. */
  text: string;
}

/** The carton hint under a line's quantity (`qbBuildQtyExtraHtml`). Null when no cartons. */
export function cartonHint(m: CartonLine): CartonHint | null {
  const cartons = cartonCount(num(m.quantity), num(m.coveragePerUOM));
  if (!(cartons > 0)) return null;
  const count = `${cartons} ${cartonUnitLabel(cartons, m.purchaseUOM)}`;
  const equals = `= ${num(m.quantity).toFixed(2)} ${m.costUOM || m.coverageUOM || 'SqFt'}`;
  return { cartons, count, equals, text: `${count} ${equals}` };
}

/**
 * Work-order rows only (`woBuildQtyExtraHtml`): a Box/Carton product with no
 * coverage set gets this nudge instead of a count.
 */
export const MISSING_COVERAGE_HINT = '⚠ Set coverage / unit to auto-count boxes';

export type QtyExtra =
  | {
      kind: 'roll';
      /** The 📐 length, e.g. `59' 4"`. */
      text: string;
      /** "× 12' roll (assumed)" line under it; null when the line has no width. */
      width: { text: string; title: string } | null;
    }
  | { kind: 'roll-missing'; text: string }
  | { kind: 'cartons'; hint: CartonHint }
  | { kind: 'missing-coverage'; text: string }
  | null;

type QtyExtraLine = CartonLine & RollishLine & { lengthFt?: number | string | null; lengthIn?: number | string | null };

/**
 * Everything the quote builder prints under a material quantity
 * (`qbBuildQtyExtraHtml` → `_rollQtyExtraHtml`): rolled lines show their
 * length and width (or "⚠ set length"); carton lines show the carton hint;
 * anything else shows nothing. Rolled wins over cartons.
 */
export function qtyExtra(m: QtyExtraLine): QtyExtra {
  if (isRolled(m)) {
    const label = lengthLabel(m.lengthFt, m.lengthIn);
    return label ? { kind: 'roll', text: label, width: rollWidthLine(m) } : { kind: 'roll-missing', text: SET_LENGTH_HINT };
  }
  const hint = cartonHint(m);
  return hint ? { kind: 'cartons', hint } : null;
}

/**
 * The work-order row's version (`woBuildQtyExtraHtml`, main L13807): the same
 * as the quote's, plus the missing-coverage nudge on Box/Carton products.
 */
export function woQtyExtra(m: QtyExtraLine): QtyExtra {
  const x = qtyExtra(m);
  if (x) return x;
  return /^(box|carton)$/i.test((m.purchaseUOM || '').trim()) ? { kind: 'missing-coverage', text: MISSING_COVERAGE_HINT } : null;
}

// ---------------------------------------------------------------------------
// Apply a job area to a section, and the "Round Labor Up?" prompt
// ---------------------------------------------------------------------------

export interface AreaMaterial {
  costUOM?: string | null;
  coverageUOM?: string | null;
  purchaseUOM?: string | null;
  coveragePerUOM?: number | string | null;
  /** Trim, transitions, moulding and nosing are skipped (counted by the piece). */
  category?: string | null;
}
export interface AreaLabor {
  uom?: string | null;
}

export interface RoundLaborPrompt {
  /** The area that was typed (labor still sits here). */
  applied: number;
  /** The highest snapped material quantity. */
  maxMat: number;
  uom: string;
}

export interface AreaApplyResult {
  /** New quantity per material row, or null where the row was skipped (unit, or trim category). */
  materialQty: (number | null)[];
  /** New quantity per labor row, or null where the row's unit did not match. */
  laborQty: (number | null)[];
  matFilled: number;
  labFilled: number;
  maxMatQty: number;
  /** The toast the app shows after applying. */
  toast: string;
  /** Non-null when the app would open "Round Labor Up?". */
  roundLabor: RoundLaborPrompt | null;
}

/** Unit a material row is matched on: cost UOM, else coverage UOM, else purchase UOM. */
export function materialAreaUom(m: AreaMaterial): string {
  return String(m.costUOM || m.coverageUOM || m.purchaseUOM || '').trim();
}

/** Materials "Apply area" never fills (main L14989). */
export const AREA_SKIP_CATEGORY = /trim|transition|mou?lding|nosing/i;

/** True when "Apply area" leaves this material alone because of its category. */
export function areaSkipsMaterial(m: Pick<AreaMaterial, 'category'>): boolean {
  return AREA_SKIP_CATEGORY.test(m.category || '');
}

/**
 * `applyAreaQty` (main L14989) for ONE section: every material whose unit is
 * `uom` — except trim / transition / moulding / nosing — gets the area
 * snapped to whole cartons, every labor row in that unit gets the area as
 * typed. When a carton snap pushes a material past the area and the section
 * also has matching labor, the app asks "Round Labor Up?".
 * Returns null for a zero/blank area (the app alerts "Enter a value first.").
 */
export function applyArea(
  area: number,
  uom: string,
  materials: readonly AreaMaterial[],
  labors: readonly AreaLabor[],
): AreaApplyResult | null {
  const qty = num(area);
  if (!qty) return null;
  let matFilled = 0;
  let labFilled = 0;
  let maxMatQty = qty;
  const materialQty = materials.map((m) => {
    if (areaSkipsMaterial(m)) return null;
    if (materialAreaUom(m) !== uom) return null;
    const snap = snapToCartons(qty, num(m.coveragePerUOM));
    const finalQty = snap ? snap.quantity : qty;
    if (finalQty > maxMatQty) maxMatQty = finalQty;
    matFilled++;
    return finalQty;
  });
  const laborQty = labors.map((l) => {
    if (String(l.uom || '').trim() !== uom) return null;
    labFilled++;
    return qty;
  });
  let toast: string;
  if (matFilled + labFilled === 0) {
    toast = `No materials or labor items with UOM "${uom}" found in this section.`;
  } else {
    const parts: string[] = [];
    if (matFilled) parts.push(`${matFilled} material${matFilled === 1 ? '' : 's'}`);
    if (labFilled) parts.push(`${labFilled} labor item${labFilled === 1 ? '' : 's'}`);
    toast = `✓ Applied ${qty} ${uom} to ${parts.join(' + ')}`;
  }
  const roundLabor = matFilled > 0 && labFilled > 0 && maxMatQty > qty ? { applied: qty, maxMat: maxMatQty, uom } : null;
  return { materialQty, laborQty, matFilled, labFilled, maxMatQty, toast, roundLabor };
}

/** Exact copy of the "Round Labor Up?" dialog (main L14991) and its follow-up toast (main L14992). */
export const ROUND_LABOR_COPY = {
  title: '📐 Round Labor Up?',
  body: (applied: number, uom: string): string =>
    `Materials rounded up past the job area you entered because of box / carton coverage. Labor is still at the original ${applied} ${uom}. Do you want to round labor up to match the highest material quantity?`,
  currentLabel: 'Labor (Current)',
  matchLabel: 'Match Materials',
  keepButton: (applied: number): string => `Keep labor at ${applied}`,
  roundButton: (maxMat: number): string => `Round labor to ${maxMat}`,
  doneToast: (newQty: number, uom: string, updated: number): string =>
    `✓ Labor rounded up to ${newQty} ${uom} on ${updated} item${updated === 1 ? '' : 's'}`,
} as const;
