/**
 * Carton + roll parity: the app's setQBMaterialQty / qbRecalcRollQty /
 * _qbInchFrac / qbBuildQtyExtraHtml / applyAreaQty / "Round Labor Up?" run
 * in a sandbox against the site ports.
 *
 * The ONLY allowed difference is the app's exact-multiple float bug
 * (see src/lib/logic/cartons.ts): when the quantity is already a whole
 * number of cartons, the app can add one phantom carton. Every mismatch is
 * checked to be exactly that, and counted.
 */
import { describe, expect, it } from 'vitest';
import {
  applyArea, inchFraction, lengthFromSqYd, materialQtyFromInput, qtyExtra, ROUND_LABOR_COPY, round2, snapToCartons, sqYdFromLength,
} from '../../src/lib/logic';
import { sandbox } from './app-source';
import { stripTags } from './helpers';

type M = Record<string, unknown>;
const win: { _qb: { materials: M[]; labors: M[]; sections: M[] } } = { _qb: { materials: [], labors: [], sections: [{ title: 'Materials & Labor' }] } };
const noop = () => {};
const app = sandbox<{
  setQBMaterialQty: (i: number, v: unknown) => void;
  qbRecalcRollQty: (i: number) => void;
  _qbInchFrac: (d: unknown) => string;
  qbBuildQtyExtraHtml: (m: M, i: number) => string;
}>('index', { fns: ['setQBMaterialQty', 'qbRecalcRollQty', '_qbInchFrac', 'qbBuildQtyExtraHtml'] }, { window: win, qbFastRecalc: noop });

function appSetQty(m: M, value: unknown): M {
  win._qb.materials = [{ ...m }];
  app.setQBMaterialQty(0, value);
  return win._qb.materials[0]!;
}

const COVERAGES = [0, 1, 1.5, 10, 12.5, 19.69, 20, 21.33, 22.31, 22.32, 23.77, 24.5, 27.9, 31.52, 33.33];
function quantities(cov: number): number[] {
  const out = new Set<number>([912, 927.03, 0.5, 1, 99.99, 100, 2500]);
  for (let v = 3; v <= 3000; v += 37) out.add(v);
  if (cov > 1) for (let k = 1; k <= 120; k++) out.add(round2(k * cov)); // exact multiples, where the bug lives
  return [...out];
}

describe('typing a quantity (setQBMaterialQty)', () => {
  it('matches the site everywhere except documented exact-multiple cases', () => {
    let total = 0;
    const bugCases: string[] = [];
    const unexplained: string[] = [];
    for (const cov of COVERAGES) for (const v of quantities(cov)) {
      total++;
      const a = appSetQty({ coveragePerUOM: cov, purchaseUOM: 'Carton' }, v).quantity;
      const s = materialQtyFromInput(v, cov);
      if (a === s) continue;
      // Allowed only: v is already whole cartons and the app added exactly one more.
      const whole = Math.round(v / cov);
      const isMultiple = Math.abs(whole * cov - v) < 1e-6 && Math.abs(round2(whole * cov) - v) < 1e-9;
      if (isMultiple && s === v && a === round2((whole + 1) * cov)) bugCases.push(`${v}@${cov}`);
      else unexplained.push(`${v}@${cov}: app ${String(a)} site ${String(s)}`);
    }
    expect(unexplained).toEqual([]);
    expect(total).toBeGreaterThan(1500);
    // The bug is real and the documented example is among the cases.
    expect(bugCases).toContain('914.71@22.31');
    expect(bugCases.length).toBeGreaterThan(0);
    console.info(`setQBMaterialQty parity: ${total} quantity × coverage cases; ${bugCases.length} exact-multiple phantom-carton cases in the app (site fixed)`);
  });

  it('blank clears the line in both', () => {
    expect(appSetQty({ coveragePerUOM: 23.77 }, '').quantity).toBe('');
    expect(materialQtyFromInput('', 23.77)).toBe('');
  });
});

describe('roll goods', () => {
  it('SqYd typed on a rolled line → feet/inches (setQBMaterialQty roll branch)', () => {
    for (const w of [6, 12, 12.5, 13.167, 13.5, 15]) for (let q = 0.5; q <= 120; q += 1.37) {
      const v = round2(q);
      const a = appSetQty({ rollWidth: w, purchaseUOM: 'Roll', coveragePerUOM: 0 }, v);
      const s = lengthFromSqYd(v, w)!;
      expect([a.lengthFt, a.lengthIn, a.linearFt, a.quantity]).toEqual([s.lengthFt, s.lengthIn, s.linearFt, v]);
    }
  });

  it('length typed → SqYd (qbRecalcRollQty)', () => {
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

  it('inches to the nearest 1/16 (_qbInchFrac)', () => {
    for (let d = -1; d <= 14; d += 0.01) expect(inchFraction(d)).toBe(app._qbInchFrac(d));
    for (const d of [null, undefined, 0, 5.97, 11.99, 0.03125]) expect(inchFraction(d as number)).toBe(app._qbInchFrac(d));
  });
});

describe('quantity hint under a line (qbBuildQtyExtraHtml)', () => {
  const lines: M[] = [];
  for (const cov of [19.69, 22.31, 22.32, 23.77, 24.5]) for (const k of [1, 2, 39, 41, 47, 60]) for (const uom of ['Carton', 'Box', 'box', '']) {
    lines.push({ quantity: round2(k * cov), coveragePerUOM: cov, purchaseUOM: uom, costUOM: 'SqFt' });
    lines.push({ quantity: round2(k * cov) - 3, coveragePerUOM: cov, purchaseUOM: uom, coverageUOM: 'SqYd' });
  }
  lines.push({ quantity: 19.33, rollWidth: 12, lengthFt: 14, lengthIn: 6 });
  lines.push({ quantity: 19.33, rollWidth: 12, lengthFt: 14, lengthIn: 5.97 });
  lines.push({ quantity: 19.33, purchaseUOM: 'Roll' });
  lines.push({ quantity: 0, matNum: 'RMAT-1', lengthFt: 0, lengthIn: 8.5 });
  lines.push({ quantity: 180, coveragePerUOM: 0, purchaseUOM: 'Linear Ft' });

  it('same text, except the phantom carton on exact multiples', () => {
    let bug = 0;
    for (const m of lines) {
      const appText = stripTags(app.qbBuildQtyExtraHtml(m, 0));
      const x = qtyExtra(m as unknown as Parameters<typeof qtyExtra>[0]);
      const siteText = !x ? '' : x.kind === 'cartons' ? `📦 ${x.hint.text}` : x.kind === 'roll' ? `📐 ${x.text}` : x.text;
      if (appText === siteText) continue;
      // documented bug: app counts one carton more for an exact multiple
      const q = Number(m.quantity), cov = Number(m.coveragePerUOM);
      expect(x?.kind).toBe('cartons');
      expect(Math.ceil(q / cov)).toBe(snapToCartons(q, cov)!.cartons + 1);
      bug++;
    }
    expect(bug).toBeGreaterThan(0); // e.g. 41 × 22.31 = 914.71 reads "42 Cartons" in the app
    console.info(`quantity hint parity: ${lines.length} lines; ${bug} phantom-carton hints in the app`);
  });
});

describe('apply job area + "Round Labor Up?" (applyAreaQty)', () => {
  type Prompt = { applied: number; maxMat: number; uom: string } | null;
  function runApp(area: number, uom: string, materials: M[], labors: M[]) {
    const toasts: string[] = [];
    let prompt: Prompt = null;
    const w = { _qb: { sections: [{ title: 'S' }], materials: materials.map((m): M => ({ ...m, _section: 0 })), labors: labors.map((l): M => ({ ...l, _section: 0 })) } };
    const fns = sandbox<{ applyAreaQty: (u: string, s: number) => void }>('index', { fns: ['applyAreaQty'] }, {
      window: w, document: { getElementById: () => ({ value: String(area) }) }, _qbActiveSec: () => 0,
      showToast: (t: string) => toasts.push(t), renderView: noop, alert: (t: string) => toasts.push(`alert:${t}`),
      setTimeout: (fn: () => void) => fn(), openLaborRoundupModal: (applied: number, maxMat: number, u: string) => { prompt = { applied, maxMat, uom: u }; },
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
    { costUOM: 'SqFt', coveragePerUOM: 0 },
  ];
  const LABS: M[] = [{ uom: 'SqFt' }, { uom: 'SqYd' }, { uom: 'Each' }, { uom: ' SqFt ' }];

  it('toasts, quantities and the prompt agree over a grid of sections', () => {
    let n = 0;
    for (let mask = 0; mask < 1 << MATS.length; mask += 3) for (let lmask = 0; lmask < 1 << LABS.length; lmask++) {
      const mats = MATS.filter((_, i) => mask & (1 << i));
      const labs = LABS.filter((_, i) => lmask & (1 << i));
      for (const area of [912, 100, 25.5, 47.38]) for (const uom of ['SqFt', 'SqYd']) {
        const a = runApp(area, uom, mats, labs);
        const s = applyArea(area, uom, mats, labs)!;
        expect(a.toasts).toEqual([s.toast]);
        expect(a.prompt).toEqual(s.roundLabor);
        expect(a.materials).toEqual(mats.map((m, i) => s.materialQty[i] ?? m.quantity));
        expect(a.labors).toEqual(labs.map((l, i) => s.laborQty[i] ?? l.quantity));
        n++;
      }
    }
    expect(n).toBeGreaterThan(300);
  });

  it('an area that is already whole cartons: the app adds a phantom carton (documented bug)', () => {
    const area = round2(41 * 22.31); // 914.71
    const a = runApp(area, 'SqFt', [{ costUOM: 'SqFt', coveragePerUOM: 22.31 }], [{ uom: 'SqFt' }]);
    const s = applyArea(area, 'SqFt', [{ costUOM: 'SqFt', coveragePerUOM: 22.31 }], [{ uom: 'SqFt' }])!;
    expect(a.materials).toEqual([937.02]);
    expect(a.prompt).toEqual({ applied: 914.71, maxMat: 937.02, uom: 'SqFt' }); // app asks to round labor up for nothing
    expect(s.materialQty).toEqual([914.71]);
    expect(s.roundLabor).toBeNull();
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
