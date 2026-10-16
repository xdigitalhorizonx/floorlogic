/**
 * Carton + roll parity: the app's setQBMaterialQty (with the whole
 * _rollLengthFromQty chain), qbRecalcRollQty, _qbInchFrac,
 * qbBuildQtyExtraHtml / woBuildQtyExtraHtml, _coverageUnits, the Roll
 * Dimensions window (_rollDimsOpen / _rollDimsApply / qbApplyRollDimensions),
 * applyAreaQty and "Round Labor Up?" run in a sandbox against the site ports.
 *
 * Since the October app snaps with `Math.ceil(v / cov - 1e-9)` there are no
 * allowed differences any more: the August phantom-carton bug is fixed in
 * the app, and app and site must agree on every case.
 */
import { describe, expect, it } from 'vitest';
import {
  applyArea, applyRollDimensions, augustSnapToCartons, coverageUnitKey, coverageUnits, inchFraction, lineCoverage, lengthFromSqYd, materialQtyFromInput, qtyExtra,
  rollDimensionsFromQty, rollDimensionsPreview, rollDimsDialog, rollLengthFromQty, rollLengthSavedToast, rollWidthLabel, ROUND_LABOR_COPY, round2,
  snapToCartons, sqYdFromLength, woQtyExtra, type RollCatalog, type RollLine,
} from '../../src/lib/logic';
import { sandbox } from './app-source';
import { stripTags } from './helpers';

type M = Record<string, unknown>;
const noop = () => {};
const ROLL_FNS = ['_rollWidthFt', '_isRolledLine', '_rollQtyIsSqYd', '_rollWidthFor', '_rollEnsureWidth', '_rollInchesFor', '_rollLengthFromQty', '_rollQtyExtraHtml', '_qbInchFrac', '_iuFmtFt'];

// The catalog the width lookup reads (data.inventory, data.productList).
const CATALOG: Required<RollCatalog> = {
  inventory: [
    { matNum: 'RMAT-OBJ', rollWidth: { feet: 12, inches: 0 } },
    { matNum: 'RMAT-1350', rollWidth: '' },
    { matNum: 'RMAT-1506', rollWidth: { feet: 15, inches: 6 } },
  ],
  productList: [
    { matNum: 'RMAT-1350', rollWidth: 13.5 },
    { matNum: 'RMAT-0012', rollWidth: 12 },
    { matNum: 'RMAT-00494', rollWidth: '' },
    { matNum: 'MAT-PAD', rollWidth: 6 },
  ],
};
const data = { inventory: CATALOG.inventory.map((x) => ({ ...x })), productList: CATALOG.productList.map((x) => ({ ...x })) };

const win: { _qb: { materials: M[]; labors: M[]; sections: M[] } } = { _qb: { materials: [], labors: [], sections: [{ title: 'Materials & Labor' }] } };
const app = sandbox<{
  setQBMaterialQty: (i: number, v: unknown) => void;
  qbRecalcRollQty: (i: number) => void;
  _qbInchFrac: (d: unknown) => string;
  qbBuildQtyExtraHtml: (m: M, i: number) => string;
  woBuildQtyExtraHtml: (m: M, i: number) => string;
  _coverageUnits: (q: unknown, c: unknown) => number;
  _iuFmtFt: (ft: unknown) => string;
}>('index', { consts: ['ROLL_DEFAULT_WIDTH_FT'], fns: ['setQBMaterialQty', 'qbRecalcRollQty', 'qbBuildQtyExtraHtml', 'woBuildQtyExtraHtml', '_coverageUnits', ...ROLL_FNS] }, {
  window: win, qbFastRecalc: noop, data,
});

function appSetQty(m: M, value: unknown): M {
  win._qb.materials = [{ ...m }];
  app.setQBMaterialQty(0, value);
  return win._qb.materials[0]!;
}

/** What the site says the line becomes after typing `value`: carton snap, then the roll length. */
function siteSetQty(m: M, value: unknown): M {
  const q = materialQtyFromInput(value as number | string | null, Number(m.coveragePerUOM) || 0);
  const line: M = { ...m, quantity: q };
  const patch = rollLengthFromQty(line as RollLine, CATALOG);
  if (!patch) return line;
  const out: M = { ...line, ...patch };
  if (patch.rollWidthAssumed === false) delete out.rollWidthAssumed; // the app deletes the flag
  return out;
}

const COVERAGES = [0, 1, 1.5, 10, 12.5, 19.69, 20, 21.33, 22.31, 22.32, 23.77, 24.5, 27.9, 31.52, 33.33];
function quantities(cov: number): number[] {
  const out = new Set<number>([912, 927.03, 0.5, 1, 99.99, 100, 2500, 914.71, 522.94]);
  for (let v = 3; v <= 3000; v += 37) out.add(v);
  if (cov > 1) for (let k = 1; k <= 120; k++) out.add(round2(k * cov)); // exact multiples, where the August bug lived
  return [...out];
}

describe('typing a quantity on a carton product (setQBMaterialQty)', () => {
  it('app and site agree on every quantity × coverage — the phantom carton is gone from the app', () => {
    let total = 0;
    let augustBugCases = 0;
    const bad: string[] = [];
    for (const cov of COVERAGES) for (const v of quantities(cov)) {
      total++;
      const a = appSetQty({ coveragePerUOM: cov, purchaseUOM: 'Carton' }, v).quantity;
      const s = materialQtyFromInput(v, cov);
      if (a !== s) bad.push(`${v}@${cov}: app ${String(a)} site ${String(s)}`);
      const aug = augustSnapToCartons(v, cov);
      if (aug && aug.quantity !== s) augustBugCases++;
    }
    expect(bad).toEqual([]);
    expect(total).toBeGreaterThan(1500);
    // The cases the August app got wrong are still in the grid, and now pass.
    expect(augustBugCases).toBeGreaterThan(0);
    expect(appSetQty({ coveragePerUOM: 22.31, purchaseUOM: 'Carton' }, 914.71).quantity).toBe(914.71);
    expect(appSetQty({ coveragePerUOM: 23.77, purchaseUOM: 'Carton' }, 522.94).quantity).toBe(522.94);
    console.info(`setQBMaterialQty parity: ${total} quantity × coverage cases, all equal (${augustBugCases} would have hit the August phantom carton)`);
  });

  it('blank clears the line in both', () => {
    expect(appSetQty({ coveragePerUOM: 23.77 }, '').quantity).toBe('');
    expect(materialQtyFromInput('', 23.77)).toBe('');
  });

  it('which coverage a line takes from its product (_covUnitKey / _lineCoverage)', () => {
    const fns = sandbox<{ _covUnitKey: (u: unknown) => string; _lineCoverage: (it: unknown) => number }>('index', { fns: ['_covUnitKey', '_lineCoverage'] });
    const units = ['', null, 'SqFt', 'Sq Ft', 'sq. ft.', 'SF', 'square feet', 'Square Foot', 'SqYd', 'SY', 'square yards', 'Linear Ft', 'LF', 'lin ft', 'linear feet',
      'ft', 'Feet', 'Each', 'ea', 'PCS', 'Piece', 'Inches', 'in', 'Carton', 'Box', 'Roll', 'Gallon'];
    for (const u of units) expect(coverageUnitKey(u as string), String(u)).toBe(fns._covUnitKey(u));
    for (const coverage of [0, 1, 1.5, 16, 23.4, 94, '22.32', '', null, -3]) for (const coverageUOM of units) for (const costUOM of ['SqFt', 'Linear Ft', 'Each', '', 'SqYd', 'LF']) {
      const it = { coverage, coverageUOM, costUOM };
      expect(lineCoverage(it as Parameters<typeof lineCoverage>[0]), JSON.stringify(it)).toBe(fns._lineCoverage(it));
    }
    expect(fns._lineCoverage(null)).toBe(lineCoverage(null));
    // The app's own examples (scripts/line-coverage.test.js): trim held in inches never snaps.
    expect(lineCoverage({ coverage: 94, coverageUOM: 'Inches', costUOM: 'SqFt' })).toBe(0);
    expect(lineCoverage({ coverage: 16, coverageUOM: 'LF', costUOM: 'Linear Ft' })).toBe(16);
    expect(lineCoverage({ coverage: 20, coverageUOM: 'Sq Ft', costUOM: 'SqFt' })).toBe(20);
    expect(lineCoverage({ coverage: 20, coverageUOM: 'SqFt', costUOM: '' })).toBe(20);
  });

  it('_coverageUnits (inventory a work order needs) agrees', () => {
    for (const cov of [...COVERAGES, '', null, '23.77']) for (const q of [0, -3, '', null, 1, 914.71, 927.03, 912, 19.33, '45.5']) {
      expect(coverageUnits(q as number, cov as number), `${q}@${cov}`).toBe(app._coverageUnits(q, cov));
    }
  });
});

// ------------------------------------------------------------- roll goods --

const WIDTHS: unknown[] = [12, 13.5, '15', 13.167, { feet: 12, inches: 0 }, { feet: 13, inches: 2 }, { feet: 0, inches: 0 }, '', null, 0, -4];
const LINES: M[] = [];
for (const rollWidth of WIDTHS) for (const [uomKey, uom] of [['costUOM', 'SqYd'], ['costUOM', ''], ['costUOM', 'Sq. Yd'], ['coverageUOM', 'sq yd'], ['costUOM', 'Linear Ft'], ['purchaseUOM', 'Roll'], ['costUOM', 'SqFt']] as const) {
  LINES.push({ item: 'Sandbar Nylon Broadloom', matNum: 'RMAT-0001', rollWidth, [uomKey]: uom, coveragePerUOM: 1, category: 'Carpet' });
}
// Width resolution beyond the line: catalog (number / object / blank), name, carpet default, nothing.
LINES.push(
  { item: 'Grand Plush', matNum: 'RMAT-1350', rollWidth: '', costUOM: 'SqYd' },
  { item: 'Object Width Carpet', matNum: 'RMAT-OBJ', rollWidth: '', costUOM: 'SqYd' },
  { item: 'Fifteen-six', matNum: 'RMAT-1506', rollWidth: '', costUOM: 'SqYd' },
  { item: 'Cat Twelve', matNum: 'RMAT-0012', rollWidth: '', costUOM: 'SqYd' },
  { item: 'Shoreline', matNum: 'RMAT-00494', rollWidth: '', costUOM: 'SqYd', category: 'Carpet' },
  { item: 'Refined Saga I 15Ft 00In A', matNum: 'X-15', purchaseUOM: 'Roll', costUOM: 'SqYd' },
  { item: 'Tweed', productName: 'Tweed 13 Ft. 6 In', matNum: 'X-136', purchaseUOM: 'Roll', costUOM: 'SqYd' },
  { item: 'Loop', style: 'Width 12ft 02in', matNum: 'X-12', purchaseUOM: 'Roll' },
  { item: '0Ft 06In mat', matNum: 'X-0', purchaseUOM: 'Roll', costUOM: 'SqYd' },
  { item: 'Shoreline', matNum: 'MAT-77', purchaseUOM: 'Roll', costUOM: 'SqYd', category: 'Carpet' },
  { item: 'Shoreline', matNum: 'MAT-78', purchaseUOM: 'Roll', costUOM: 'SqYd', category: { name: 'Carpet Tile' } },
  { item: '7/16" 6lb Pad', matNum: 'MAT-0038', purchaseUOM: 'Roll', costUOM: 'SqYd', category: 'Pad/Cushion' },
  { item: 'Pad by product width', matNum: 'MAT-PAD', purchaseUOM: 'Roll', costUOM: 'SqYd' },
  { item: 'Assumed earlier', matNum: 'RMAT-9', rollWidth: 12, rollWidthAssumed: true, costUOM: 'SqYd' },
  { item: 'Cove base', matNum: 'RMAT-COVE', rollWidth: 0.333, purchaseUOM: 'Roll', costUOM: 'Linear Ft' },
  { item: 'LVP', matNum: 'MAT-1', coveragePerUOM: 23.77, purchaseUOM: 'Carton', costUOM: 'SqFt' },
);
const SQYD: unknown[] = ['', null, 0, -2, 0.01, 1, 10.97, 19.33, 20, 25, 27.33, 30, 50, 79.12, 100, 333.33, '45.5'];

describe('carpet length from yardage (setQBMaterialQty → _rollLengthFromQty)', () => {
  it('the whole line agrees after every SqYd × width source × unit', () => {
    let n = 0;
    for (const line of LINES) for (const v of SQYD) {
      const a = appSetQty(line, v);
      const s = siteSetQty(line, v);
      expect(s, `${JSON.stringify(line)} ← ${String(v)}`).toEqual(a);
      n++;
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('the app’s own examples (scripts/carpet-length-from-yardage.test.js)', () => {
    const cases: Array<[number, number, number, number]> = [
      [79.12, 12, 59, 4], [50, 13.5, 33, 4], [20, 12, 15, 0], [30, 12, 22, 6], [25, 15, 15, 0], [10.97, 12, 8, 3], [25, 13.5, 16, 8], [79.12, 15, 47, 6],
    ];
    for (const [q, w, ft, inches] of cases) {
      expect(lengthFromSqYd(q, w)).toMatchObject({ lengthFt: ft, lengthIn: inches });
      const a = appSetQty({ item: 'C', matNum: 'RMAT-1', rollWidth: w, costUOM: 'SqYd' }, q);
      expect([a.lengthFt, a.lengthIn, a.quantity]).toEqual([ft, inches, q]);
    }
    // No width anywhere on a carpet line → 12' assumed.
    const a = appSetQty({ item: 'Shoreline', matNum: 'RMAT-00494', rollWidth: '', costUOM: 'SqYd', category: 'Carpet' }, 79.12);
    expect([a.rollWidth, a.rollWidthAssumed, a.lengthFt, a.lengthIn]).toEqual([12, true, 59, 4]);
    expect(rollLengthFromQty({ item: 'Shoreline', matNum: 'RMAT-00494', rollWidth: '', costUOM: 'SqYd', category: 'Carpet', quantity: 79.12 }, CATALOG))
      .toEqual({ rollWidth: 12, rollWidthAssumed: true, lengthFt: 59, lengthIn: 4, linearFt: 59.33 });
  });

  it('length typed → SqYd (qbRecalcRollQty, unchanged)', () => {
    for (const w of [6, 12, 12.5, 13.167, 13.5, 15]) for (let ft = 0; ft <= 40; ft++) for (const inches of [0, 0.5, 3, 6, 9.25, 11.99]) {
      win._qb.materials = [{ lengthFt: ft, lengthIn: inches, rollWidth: w, quantity: 'unchanged' }];
      app.qbRecalcRollQty(0);
      const a = win._qb.materials[0]!;
      const s = sqYdFromLength(ft, inches, w);
      if (!s) expect(a.quantity).toBe('unchanged');
      else expect([a.quantity, a.linearFt]).toEqual([s.quantity, s.linearFt]);
    }
    win._qb.materials = [{ lengthFt: 14, lengthIn: 6, rollWidth: 12 }];
    app.qbRecalcRollQty(0);
    expect(win._qb.materials[0]!.quantity).toBe(19.33);
  });

  it('inches to the nearest 1/16 (_qbInchFrac) and widths as feet + inches (_iuFmtFt)', () => {
    for (let d = -1; d <= 14; d += 0.01) expect(inchFraction(d)).toBe(app._qbInchFrac(d));
    for (const d of [null, undefined, 0, 5.97, 11.99, 0.03125]) expect(inchFraction(d as number)).toBe(app._qbInchFrac(d));
    for (const w of [0, -1, '', null, 'x', 12, 13.5, 13.167, 12.99, 11.96, 15, '15', 0.333, 6.0417]) expect(rollWidthLabel(w as number), String(w)).toBe(app._iuFmtFt(w));
  });
});

describe('quantity hint under a line (qbBuildQtyExtraHtml / woBuildQtyExtraHtml)', () => {
  const lines: M[] = [];
  for (const cov of [19.69, 22.31, 22.32, 23.77, 24.5]) for (const k of [1, 2, 39, 41, 47, 60]) for (const uom of ['Carton', 'Box', 'box', '']) {
    lines.push({ quantity: round2(k * cov), coveragePerUOM: cov, purchaseUOM: uom, costUOM: 'SqFt' });
    lines.push({ quantity: round2(k * cov) - 3, coveragePerUOM: cov, purchaseUOM: uom, coverageUOM: 'SqYd' });
  }
  lines.push(
    { quantity: 19.33, rollWidth: 12, lengthFt: 14, lengthIn: 6 },
    { quantity: 19.33, rollWidth: 12, lengthFt: 14, lengthIn: 5.97 },
    { quantity: 79.12, rollWidth: 12, rollWidthAssumed: true, lengthFt: 59, lengthIn: 4 },
    { quantity: 50, rollWidth: { feet: 13, inches: 6 }, lengthFt: 33, lengthIn: 4 },
    { quantity: 19.33, purchaseUOM: 'Roll' },
    { quantity: 0, matNum: 'RMAT-1', lengthFt: 0, lengthIn: 8.5 },
    { quantity: 180, coveragePerUOM: 0, purchaseUOM: 'Linear Ft' },
    { quantity: 180, coveragePerUOM: 0, purchaseUOM: 'Box' },
    { quantity: 180, coveragePerUOM: 1, purchaseUOM: ' carton ' },
  );
  const siteText = (x: ReturnType<typeof qtyExtra>) =>
    !x ? '' : x.kind === 'cartons' ? `📦 ${x.hint.text}` : x.kind === 'roll' ? `📐 ${x.text}${x.width ? ' ' + x.width.text : ''}` : x.text;
  const title = (html: string) => {
    const m = /class="roll-width"[^>]*title="([^"]*)"/.exec(html);
    return m ? m[1]!.replace(/&quot;/g, '"') : null;
  };

  it('same text and width tooltip on the quote and the work order — no phantom cartons', () => {
    for (const m of lines) {
      const qb = app.qbBuildQtyExtraHtml(m, 0);
      const x = qtyExtra(m as unknown as Parameters<typeof qtyExtra>[0]);
      expect(siteText(x), JSON.stringify(m)).toBe(stripTags(qb));
      expect(x?.kind === 'roll' && x.width ? x.width.title : null).toBe(title(qb));
      const wo = app.woBuildQtyExtraHtml(m, 0);
      expect(siteText(woQtyExtra(m as unknown as Parameters<typeof woQtyExtra>[0])), JSON.stringify(m)).toBe(stripTags(wo));
    }
    // 41 × 22.31 = 914.71 used to read "42 Cartons" in the August app.
    expect(stripTags(app.qbBuildQtyExtraHtml({ quantity: 914.71, coveragePerUOM: 22.31, purchaseUOM: 'Carton' }, 0))).toBe('📦 41 Cartons = 914.71 SqFt');
  });
});

// -------------------------------------------------- Roll Dimensions window --

interface FakeEl { id: string; value: string; textContent: string; dataset: Record<string, string>; listeners: Record<string, Array<() => void>>; addEventListener: (t: string, f: () => void) => void }
function fakeEl(id: string, value = ''): FakeEl {
  const el: FakeEl = { id, value, textContent: '', dataset: {}, listeners: {}, addEventListener: (t, f) => { (el.listeners[t] ??= []).push(f); } };
  return el;
}
const fire = (el: FakeEl, type: string) => (el.listeners[type] ?? []).forEach((f) => f());

/** Open the app's window on `line`: returns its elements (built from the modal HTML) and its copy. */
function openAppDims(line: M) {
  const els = new Map<string, FakeEl>();
  let html = '';
  let later: (() => void) | null = null;
  const fns = sandbox<{ _rollDimsOpen: (p: string, i: number, m: M) => void }>('index', { consts: ['ROLL_DEFAULT_WIDTH_FT'], fns: ['_rollDimsOpen', ...ROLL_FNS] }, {
    data, openModal: (h: string) => { html = h; }, setTimeout: (f: () => void) => { later = f; }, document: { getElementById: (id: string) => els.get(id) ?? null },
  });
  fns._rollDimsOpen('qb', 0, { ...line });
  for (const m of html.matchAll(/<input type="number" id="([^"]+)" (?:step="[^"]*" )?value="([^"]*)"/g)) els.set(m[1]!, fakeEl(m[1]!, m[2]!));
  els.set('qb-rd-preview', fakeEl('qb-rd-preview'));
  (later as unknown as () => void)();
  const note = /<div id="qb-rd-note"[^>]*>([^<]*)<\/div>/.exec(html);
  const intro = /<div class="modal-body"><div[^>]*>([\s\S]*?)<\/div>/.exec(html)![1]!.replace(/<\/?em>/g, '');
  return { els, note: note ? note[1]! : '', intro };
}

describe('the Roll Dimensions window', () => {
  const dialogLines: M[] = [
    { item: 'Shoreline', matNum: 'RMAT-00494', rollWidth: '', costUOM: 'SqYd', category: 'Carpet', quantity: 10.97 },
    { item: 'Cat Twelve', matNum: 'RMAT-0012', rollWidth: 12, costUOM: 'SqYd', quantity: 30, lengthFt: 22, lengthIn: 6 },
    { item: 'Refined Saga I 15Ft 00In A', matNum: 'X-15', purchaseUOM: 'Roll', costUOM: 'SqYd', quantity: 25 },
    { item: 'Grand Plush', matNum: 'RMAT-1350', rollWidth: '', costUOM: 'SqYd', quantity: '' },
    { item: 'Shoreline', matNum: 'RMAT-1', rollWidth: 12, rollWidthAssumed: true, costUOM: 'SqYd', quantity: 79.12, lengthFt: 59, lengthIn: 4 },
    { item: '7/16" 6lb Pad', matNum: 'MAT-0038', purchaseUOM: 'Roll', costUOM: 'SqYd', quantity: 79.12 },
    { item: 'Cove', matNum: 'RMAT-COVE', rollWidth: 0.5, purchaseUOM: 'Roll', costUOM: 'Linear Ft', quantity: 120 },
    { item: 'Sliver', matNum: 'RMAT-T', rollWidth: '', costUOM: 'SqYd', category: 'Carpet', quantity: 0.01 },
    { item: 'Legacy width', matNum: 'RMAT-L', rollWidth: { feet: 12, inches: 0 }, costUOM: 'SqYd', quantity: 20 },
  ];

  it('opens with the same width, length, copy and live preview', () => {
    for (const line of dialogLines) {
      const a = openAppDims(line);
      const s = rollDimsDialog(line as RollLine, CATALOG);
      const v = (k: string) => String(a.els.get(`qb-rd-${k}`)!.value); // a browser input turns what is written into text
      expect([v('wft'), v('win')], JSON.stringify(line)).toEqual([String(s.widthFt), String(s.widthIn)]);
      expect(a.note).toBe(s.note);
      expect(a.intro).toBe(s.intro);
      const preview = a.els.get('qb-rd-preview')!.textContent;
      if (s.fromQty) {
        const f = rollDimensionsFromQty(Number(s.widthFt) || 0, Number(s.widthIn) || 0, Number(line.quantity));
        expect(preview).toBe(f.preview);
        expect([v('lft'), v('lin')]).toEqual([String(f.lengthFt), String(f.lengthIn)]);
      } else {
        expect([v('lft'), v('lin')]).toEqual([s.lengthFt, s.lengthIn]);
        expect(preview).toBe(rollDimensionsPreview(Number(s.widthFt) || 0, Number(s.widthIn) || 0, Number(s.lengthFt) || 0, Number(s.lengthIn) || 0));
      }
    }
  });

  it('a width change re-works the length from the SqYd; a typed length wins', () => {
    const line = dialogLines[4]!; // 79.12 SqYd, 12' assumed
    const a = openAppDims(line);
    const w = a.els.get('qb-rd-wft')!;
    w.value = '15';
    fire(w, 'input');
    const f = rollDimensionsFromQty(15, 0, 79.12);
    expect([a.els.get('qb-rd-lft')!.value, a.els.get('qb-rd-lin')!.value].map(String)).toEqual([String(f.lengthFt), String(f.lengthIn)]);
    expect(a.els.get('qb-rd-preview')!.textContent).toBe(f.preview);
    expect(f.preview).toBe(`📐 15' wide × 47' 6" = 79.12 SqYd`);
    const lft = a.els.get('qb-rd-lft')!;
    lft.value = '20';
    a.els.get('qb-rd-lin')!.value = '6';
    fire(lft, 'input');
    expect(a.els.get('qb-rd-preview')!.textContent).toBe(rollDimensionsPreview(15, 0, 20, 6));
  });

  it('Save (qbApplyRollDimensions) writes the same line, roll length and toast', () => {
    const inputs: Array<{ wft: string; win: string; lft: string; lin: string; typed: boolean }> = [
      { wft: '12', win: '', lft: '', lin: '', typed: false },
      { wft: '15', win: '', lft: '47', lin: '6', typed: false },
      { wft: '12', win: '', lft: '20', lin: '6', typed: true },
      { wft: '13', win: '6', lft: '9', lin: '', typed: true },
      { wft: '', win: '', lft: '14', lin: '6', typed: true },
      { wft: '', win: '', lft: '', lin: '', typed: false },
      { wft: '0', win: '0', lft: '0', lin: '0', typed: true },
    ];
    let n = 0;
    for (const line of dialogLines) for (const inp of inputs) {
      const toasts: string[] = [];
      const els = new Map<string, FakeEl>(Object.entries({ wft: inp.wft, win: inp.win, lft: inp.lft, lin: inp.lin }).map(([k, v]) => [`qb-rd-${k}`, fakeEl(`qb-rd-${k}`, v)]));
      if (inp.typed) els.get('qb-rd-lft')!.dataset.typed = '1';
      const d = { productList: [{ matNum: line.matNum, rollLength: 0 }], inventory: [] as M[] };
      const w = { _qb: { materials: [{ ...line }] } };
      sandbox<{ qbApplyRollDimensions: (i: number) => void }>('index', { consts: ['ROLL_DEFAULT_WIDTH_FT'], fns: ['qbApplyRollDimensions', '_rollDimsApply', 'qbRecalcRollQty', ...ROLL_FNS] }, {
        window: w, data: d, document: { getElementById: (id: string) => els.get(id) ?? null }, showToast: (t: string) => toasts.push(t), saveData: noop, closeModal: noop, renderView: noop,
      }).qbApplyRollDimensions(0);
      const r = applyRollDimensions(line as RollLine, { widthFt: inp.wft, widthIn: inp.win, lengthFt: inp.lft, lengthIn: inp.lin, typed: inp.typed }, {});
      const site: M = { ...line, ...r.patch };
      if (r.patch.rollWidthAssumed === false) delete site.rollWidthAssumed;
      if (r.rollLength != null) site.rollLength = r.rollLength;
      expect(site, `${JSON.stringify(line)} ${JSON.stringify(inp)}`).toEqual(w._qb.materials[0]);
      expect(toasts).toEqual(r.rollLength != null ? [rollLengthSavedToast(r.rollLength)] : []);
      n++;
    }
    expect(n).toBe(dialogLines.length * inputs.length);
  });
});

// ------------------------------------------------------------ apply area --

describe('apply job area + "Round Labor Up?" (applyAreaQty)', () => {
  type Prompt = { applied: number; maxMat: number; uom: string } | null;
  function runApp(area: number, uom: string, materials: M[], labors: M[]) {
    const toasts: string[] = [];
    let prompt: Prompt = null;
    const w = { _qb: { sections: [{ title: 'S' }], materials: materials.map((m): M => ({ ...m, _section: 0 })), labors: labors.map((l): M => ({ ...l, _section: 0 })) } };
    const fns = sandbox<{ applyAreaQty: (u: string, s: number) => void }>('index', { fns: ['applyAreaQty'] }, {
      window: w, document: { getElementById: () => ({ value: String(area) }) }, _qbActiveSec: () => 0,
      showToast: (t: string) => toasts.push(t), renderView: noop, alert: (t: string) => toasts.push(`alert:${t}`),
      setTimeout: (f: () => void) => f(), openLaborRoundupModal: (applied: number, maxMat: number, u: string) => { prompt = { applied, maxMat, uom: u }; },
    });
    fns.applyAreaQty(uom, 0);
    return { toasts, prompt: prompt as Prompt, materials: w._qb.materials.map((m) => m.quantity), labors: w._qb.labors.map((l) => l.quantity) };
  }

  const MATS: M[] = [
    { costUOM: 'SqFt', purchaseUOM: 'Carton', coveragePerUOM: 23.77 },
    { costUOM: 'SqFt', purchaseUOM: 'Carton', coveragePerUOM: 22.32 },
    { coverageUOM: 'SqFt', purchaseUOM: 'Box', coveragePerUOM: 19.69 },
    { costUOM: 'Linear Ft', purchaseUOM: 'Linear Ft' },
    { purchaseUOM: 'SqYd', coveragePerUOM: 0 },
    { costUOM: 'SqFt', coveragePerUOM: 0, category: 'Trim/Transition' },
    { costUOM: 'SqFt', coveragePerUOM: 0, category: 'Stair Nosing' },
    { costUOM: 'SqFt', coveragePerUOM: 0, category: 'Molding' },
    { costUOM: 'SqFt', coveragePerUOM: 22.31, category: 'LVP' },
  ];
  const LABS: M[] = [{ uom: 'SqFt' }, { uom: 'SqYd' }, { uom: 'Each' }, { uom: ' SqFt ' }];

  it('toasts, quantities and the prompt agree over a grid of sections (trim and nosing skipped)', () => {
    let n = 0;
    for (let mask = 0; mask < 1 << MATS.length; mask += 7) for (let lmask = 0; lmask < 1 << LABS.length; lmask++) {
      const mats = MATS.filter((_, i) => mask & (1 << i));
      const labs = LABS.filter((_, i) => lmask & (1 << i));
      for (const area of [912, 100, 25.5, 47.38, 914.71]) for (const uom of ['SqFt', 'SqYd']) {
        const a = runApp(area, uom, mats, labs);
        const s = applyArea(area, uom, mats, labs)!;
        expect(a.toasts).toEqual([s.toast]);
        expect(a.prompt).toEqual(s.roundLabor);
        expect(a.materials).toEqual(mats.map((m, i) => s.materialQty[i] ?? m.quantity));
        expect(a.labors).toEqual(labs.map((l, i) => s.laborQty[i] ?? l.quantity));
        n++;
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it('an area that is already whole cartons no longer asks to round labor up (fixed since August)', () => {
    const area = round2(41 * 22.31); // 914.71
    const a = runApp(area, 'SqFt', [{ costUOM: 'SqFt', coveragePerUOM: 22.31 }], [{ uom: 'SqFt' }]);
    expect(a.materials).toEqual([914.71]);
    expect(a.prompt).toBeNull();
    expect(snapToCartons(area, 22.31)).toEqual({ cartons: 41, quantity: 914.71 });
    expect(augustSnapToCartons(area, 22.31)).toEqual({ cartons: 42, quantity: 937.02 });
  });

  it('the dialog copy is the app’s', () => {
    let html = '';
    const fns = sandbox<{ openLaborRoundupModal: (a: number, m: number, u: string) => void }>('index', { fns: ['openLaborRoundupModal'] }, { openModal: (h: string) => { html = h; } });
    fns.openLaborRoundupModal(912, 927.03, 'SqFt');
    expect(html).toContain(`<h2>${ROUND_LABOR_COPY.title}</h2>`);
    expect(html).toContain(ROUND_LABOR_COPY.body(912, 'SqFt'));
    expect(html).toContain(`>${ROUND_LABOR_COPY.currentLabel}<`);
    expect(html).toContain(`>${ROUND_LABOR_COPY.matchLabel}<`);
    expect(html).toContain(`>${ROUND_LABOR_COPY.keepButton(912)}</button>`);
    expect(html).toContain(`>${ROUND_LABOR_COPY.roundButton(927.03)}</button>`);
  });

  it('the follow-up toast (roundupLaborQty)', () => {
    for (const n of [1, 2]) {
      const toasts: string[] = [];
      const w = { _qb: { labors: Array.from({ length: n }, () => ({ uom: 'SqFt', quantity: 912 })) } as Record<string, unknown> };
      const fns = sandbox<{ roundupLaborQty: (q: number, u: string) => void }>('index', { fns: ['roundupLaborQty'] }, {
        window: w, closeModal: noop, showToast: (t: string) => toasts.push(t), renderView: noop,
      });
      fns.roundupLaborQty(927.03, 'SqFt');
      expect(toasts).toEqual([ROUND_LABOR_COPY.doneToast(927.03, 'SqFt', n)]);
    }
  });
});
