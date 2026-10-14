/**
 * Carton (box) snapping, the per-line quantity hint, "apply job area" and the
 * "Round Labor Up?" prompt.
 *
 * Source: main L10961-10972 (`setQBMaterialQty`), L11207-11229
 * (`qbBuildQtyExtraHtml`), L11585-11611 (`woBuildMatRowHtml`), L12662
 * (`applyAreaQty`), L12664 (`openLaborRoundupModal`), L12665 (`roundupLaborQty`).
 *
 * APP BUG (exact multiples): the app snaps with `Math.ceil(v / cov)`. When the
 * typed or recomputed quantity is already a whole number of cartons, float
 * error can push v / cov a hair above the integer (914.71 / 22.31 =
 * 41.00000000000001), so the app adds a phantom carton — the hint then reads
 * "42 Cartons = 914.71 SqFt" and re-typing 914.71 grows the line to 937.02.
 * The site subtracts 1e-9 before the ceil, the same fix Landmark shipped.
 * The app's own inventory healer already does this with 1e-6 (main L4475).
 */
import { num, round2 } from './money';
import { isRolled, lengthLabel, SET_LENGTH_HINT, type RollishLine } from './roll';

export const CARTON_EPSILON = 1e-9;

export interface CartonSnap {
  cartons: number;
  /** Snapped quantity in the coverage unit (SqFt), rounded to cents like the app. */
  quantity: number;
}

/**
 * Snap an area to whole cartons — the SITE rule (with the epsilon).
 * Null when the app would not snap: coverage ≤ 1 (not sold by the carton) or
 * a non-positive quantity (main L10966 `if(cov>1&&v>0)`).
 */
export function snapToCartons(qty: number, coverage: number): CartonSnap | null {
  const v = Number(qty);
  const cov = num(coverage);
  if (!(cov > 1 && v > 0)) return null;
  const cartons = Math.ceil(v / cov - CARTON_EPSILON);
  return { cartons, quantity: round2(cartons * cov) };
}

/** The app's exact snap (no epsilon) — kept only to measure/document the bug. */
export function appSnapToCartons(qty: number, coverage: number): CartonSnap | null {
  const v = Number(qty);
  const cov = num(coverage);
  if (!(cov > 1 && v > 0)) return null;
  const cartons = Math.ceil(v / cov);
  return { cartons, quantity: Math.round(cartons * cov * 100) / 100 };
}

/**
 * Quantity a material line ends up with after the user types `value`
 * (`setQBMaterialQty`): blank stays blank, carton products snap up to whole
 * cartons, everything else is kept as typed.
 */
export function materialQtyFromInput(value: number | string | null | undefined, coverage: number): number | '' {
  if (value === '' || value == null) return '';
  const v = Number(value);
  const snap = snapToCartons(v, coverage);
  return snap ? snap.quantity : v;
}

/** Carton count shown in the hint (`cov>1 ? ceil(qty/cov) : 0`, main L11209) — site rule. */
export function cartonCount(qty: number, coverage: number): number {
  const cov = num(coverage);
  return cov > 1 ? Math.ceil(num(qty) / cov - CARTON_EPSILON) : 0;
}

/** Purchase-unit label with the app's plural rule (main L11223): Carton/Cartons, Box/Boxes. */
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

/** The carton hint under a line's quantity (main L11221-11227). Null when no cartons. */
export function cartonHint(m: CartonLine): CartonHint | null {
  const cartons = cartonCount(num(m.quantity), num(m.coveragePerUOM));
  if (!(cartons > 0)) return null;
  const count = `${cartons} ${cartonUnitLabel(cartons, m.purchaseUOM)}`;
  const equals = `= ${num(m.quantity).toFixed(2)} ${m.costUOM || m.coverageUOM || 'SqFt'}`;
  return { cartons, count, equals, text: `${count} ${equals}` };
}

/**
 * Work-order rows only (main L11608-11609): a Box/Carton product with no
 * coverage set gets this nudge instead of a count.
 */
export const MISSING_COVERAGE_HINT = '⚠ Set coverage / unit to auto-count boxes';

export type QtyExtra =
  | { kind: 'roll'; text: string }
  | { kind: 'roll-missing'; text: string }
  | { kind: 'cartons'; hint: CartonHint }
  | null;

/**
 * Everything the app prints under a material quantity (`qbBuildQtyExtraHtml`):
 * rolled lines show their length (or "⚠ set length"); carton lines show the
 * carton hint; anything else shows nothing. Rolled wins over cartons.
 */
export function qtyExtra(m: CartonLine & RollishLine & { lengthFt?: number | string | null; lengthIn?: number | string | null }): QtyExtra {
  if (isRolled(m)) {
    const label = lengthLabel(m.lengthFt, m.lengthIn);
    return label ? { kind: 'roll', text: label } : { kind: 'roll-missing', text: SET_LENGTH_HINT };
  }
  const hint = cartonHint(m);
  return hint ? { kind: 'cartons', hint } : null;
}

// ---------------------------------------------------------------------------
// Apply a job area to a section, and the "Round Labor Up?" prompt
// ---------------------------------------------------------------------------

export interface AreaMaterial {
  costUOM?: string | null;
  coverageUOM?: string | null;
  purchaseUOM?: string | null;
  coveragePerUOM?: number | string | null;
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
  /** New quantity per material row, or null where the row's unit did not match. */
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

/** Unit a material row is matched on: cost UOM, else coverage UOM, else purchase UOM (main L12662). */
export function materialAreaUom(m: AreaMaterial): string {
  return String(m.costUOM || m.coverageUOM || m.purchaseUOM || '').trim();
}

/**
 * `applyAreaQty` (main L12662) for ONE section: every material whose unit is
 * `uom` gets the area snapped to whole cartons, every labor row in that unit
 * gets the area as typed. When a carton snap pushes a material past the area
 * and the section also has matching labor, the app asks "Round Labor Up?".
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

/** Exact copy of the "Round Labor Up?" dialog (main L12664) and its follow-up toast (main L12665). */
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
