import { describe, expect, it } from 'vitest';
import {
  appSnapToCartons, applyArea, cartonCount, cartonHint, cartonUnitLabel, materialQtyFromInput, MISSING_COVERAGE_HINT, qtyExtra,
  ROUND_LABOR_COPY, snapToCartons,
} from '../../src/lib/logic';

describe('carton snapping', () => {
  it('912 SqFt at 23.77 SqFt/carton → 39 cartons = 927.03 SqFt', () => {
    expect(snapToCartons(912, 23.77)).toEqual({ cartons: 39, quantity: 927.03 });
  });

  it.each([
    // [area, coverage, cartons, quantity]
    [912, 22.32, 41, 915.12],
    [912, 19.69, 47, 925.43],
    [100, 20, 5, 100],
    [100.01, 20, 6, 120],
    [1, 23.77, 1, 23.77],
  ])('snap %s @ %s → %s cartons = %s', (area, cov, cartons, quantity) => {
    expect(snapToCartons(area, cov)).toEqual({ cartons, quantity });
  });

  it('does not snap when coverage ≤ 1 or the quantity is not positive (app: cov>1&&v>0)', () => {
    expect(snapToCartons(912, 1)).toBeNull();
    expect(snapToCartons(912, 0)).toBeNull();
    expect(snapToCartons(0, 23.77)).toBeNull();
    expect(snapToCartons(-5, 23.77)).toBeNull();
  });

  it('documents the app’s exact-multiple bug and the site fix', () => {
    // 41 × 22.31 = 914.71, but 914.71 / 22.31 = 41.00000000000001 in floating point.
    expect(914.71 / 22.31).toBeGreaterThan(41);
    expect(appSnapToCartons(914.71, 22.31)).toEqual({ cartons: 42, quantity: 937.02 });
    expect(snapToCartons(914.71, 22.31)).toEqual({ cartons: 41, quantity: 914.71 });
  });

  it('materialQtyFromInput: blank stays blank, carton products snap, others keep the typed value', () => {
    expect(materialQtyFromInput('', 23.77)).toBe('');
    expect(materialQtyFromInput(null, 23.77)).toBe('');
    expect(materialQtyFromInput(912, 23.77)).toBe(927.03);
    expect(materialQtyFromInput('180', 0)).toBe(180);
    expect(materialQtyFromInput(19.33, 0)).toBe(19.33);
  });
});

describe('carton hint', () => {
  it('reads "39 Cartons = 927.03 SqFt"', () => {
    const h = cartonHint({ quantity: 927.03, coveragePerUOM: 23.77, purchaseUOM: 'Carton', costUOM: 'SqFt' });
    expect(h).toEqual({ cartons: 39, count: '39 Cartons', equals: '= 927.03 SqFt', text: '39 Cartons = 927.03 SqFt' });
  });

  it.each([
    [1, 'Carton', 'Carton'],
    [2, 'Carton', 'Cartons'],
    [1, 'Box', 'Box'],
    [3, 'Box', 'Boxes'],
    [3, 'box', 'boxes'],
    [2, null, 'units'],
    [1, undefined, 'unit'],
  ])('%s × %s → %s', (count, uom, want) => expect(cartonUnitLabel(count, uom)).toBe(want));

  it('falls back to the coverage unit, then SqFt', () => {
    expect(cartonHint({ quantity: 50, coveragePerUOM: 25, purchaseUOM: 'Box', coverageUOM: 'SqYd' })!.text).toBe('2 Boxes = 50.00 SqYd');
    expect(cartonHint({ quantity: 50, coveragePerUOM: 25, purchaseUOM: 'Box' })!.text).toBe('2 Boxes = 50.00 SqFt');
  });

  it('no hint without cartons', () => {
    expect(cartonHint({ quantity: 180, coveragePerUOM: 0 })).toBeNull();
    expect(cartonHint({ quantity: '', coveragePerUOM: 23.77 })).toBeNull();
    expect(cartonCount(927.03, 23.77)).toBe(39);
  });

  it('qtyExtra: rolled lines show their length (or a warning) before any carton text', () => {
    expect(qtyExtra({ quantity: 19.33, rollWidth: 12, lengthFt: 14, lengthIn: 6, coveragePerUOM: 0 })).toEqual({ kind: 'roll', text: `14' 6"` });
    expect(qtyExtra({ quantity: 19.33, purchaseUOM: 'Roll' })).toEqual({ kind: 'roll-missing', text: '⚠ set length' });
    expect(qtyExtra({ quantity: 927.03, coveragePerUOM: 23.77, purchaseUOM: 'Carton', costUOM: 'SqFt' })).toEqual({
      kind: 'cartons', hint: { cartons: 39, count: '39 Cartons', equals: '= 927.03 SqFt', text: '39 Cartons = 927.03 SqFt' },
    });
    expect(qtyExtra({ quantity: 180, coveragePerUOM: 0, purchaseUOM: 'Linear Ft' })).toBeNull();
    expect(MISSING_COVERAGE_HINT).toBe('⚠ Set coverage / unit to auto-count boxes');
  });
});

describe('apply job area + "Round Labor Up?"', () => {
  const good = { costUOM: 'SqFt', purchaseUOM: 'Carton', coveragePerUOM: 23.77 };
  const base = { costUOM: 'Linear Ft', purchaseUOM: 'Linear Ft', coveragePerUOM: 0 };
  const lvpInstall = { uom: 'SqFt' };

  it('snaps materials, fills labor, and prompts when materials pass the area', () => {
    const r = applyArea(912, 'SqFt', [good, base], [lvpInstall])!;
    expect(r.materialQty).toEqual([927.03, null]);
    expect(r.laborQty).toEqual([912]);
    expect(r.toast).toBe('✓ Applied 912 SqFt to 1 material + 1 labor item');
    expect(r.roundLabor).toEqual({ applied: 912, maxMat: 927.03, uom: 'SqFt' });
  });

  it('no prompt without labor in the section, or when nothing rounded up', () => {
    expect(applyArea(912, 'SqFt', [good], [])!.roundLabor).toBeNull();
    expect(applyArea(912, 'SqFt', [{ costUOM: 'SqFt' }], [lvpInstall])!.roundLabor).toBeNull();
  });

  it('pluralises and reports no matches like the app', () => {
    expect(applyArea(912, 'SqFt', [good, good, good], [])!.toast).toBe('✓ Applied 912 SqFt to 3 materials');
    expect(applyArea(912, 'SqFt', [], [lvpInstall, lvpInstall])!.toast).toBe('✓ Applied 912 SqFt to 2 labor items');
    expect(applyArea(912, 'SqYd', [good], [lvpInstall])!.toast).toBe('No materials or labor items with UOM "SqYd" found in this section.');
    expect(applyArea(0, 'SqFt', [good], [])).toBeNull();
  });

  it('matches materials on cost UOM, then coverage UOM, then purchase UOM', () => {
    const r = applyArea(10, 'SqYd', [{ coverageUOM: 'SqYd' }, { purchaseUOM: 'SqYd' }, { costUOM: 'SqFt', purchaseUOM: 'SqYd' }], [])!;
    expect(r.materialQty).toEqual([10, 10, null]);
  });

  it('exact dialog copy', () => {
    expect(ROUND_LABOR_COPY.title).toBe('📐 Round Labor Up?');
    expect(ROUND_LABOR_COPY.body(912, 'SqFt')).toBe(
      'Materials rounded up past the job area you entered because of box / carton coverage. Labor is still at the original 912 SqFt. Do you want to round labor up to match the highest material quantity?',
    );
    expect(ROUND_LABOR_COPY.keepButton(912)).toBe('Keep labor at 912');
    expect(ROUND_LABOR_COPY.roundButton(927.03)).toBe('Round labor to 927.03');
    expect(ROUND_LABOR_COPY.doneToast(927.03, 'SqFt', 2)).toBe('✓ Labor rounded up to 927.03 SqFt on 2 items');
    expect(ROUND_LABOR_COPY.doneToast(927.03, 'SqFt', 1)).toBe('✓ Labor rounded up to 927.03 SqFt on 1 item');
  });
});
