import { describe, expect, it } from 'vitest';
import {
  applyRollDimensions, inchFraction, isRolled, lengthFromSqYd, lengthLabel, rollDimensionsFromQty, rollDimensionsPreview, rollDimsDialog, rollInchesFor,
  rollLengthFromQty, rollLengthSavedToast, rollQtyIsSqYd, rollWidthFor, rollWidthFromFtIn, rollWidthFt, rollWidthLabel, rollWidthLine, sqYdFromLength,
  type RollCatalog,
} from '../../src/lib/logic';

describe('roll goods: length → SqYd (unchanged)', () => {
  it("12' wide × 14' 6\" long = 19.33 SqYd", () => {
    expect(sqYdFromLength(14, 6, 12)).toEqual({ quantity: 19.33, linearFt: 14.5 });
  });

  it.each([
    // [ft, in, width, sqyd]
    [10, 0, 12, 13.33],
    [0, 18, 12, 2],
    [25, 3, 13.5, 37.88],
    [9, 9.5, 15, 16.32],
    [20, 6, 12, 27.33], // the app's own example
  ])("%s' %s\" on a %s' roll → %s SqYd", (ft, inches, w, sqyd) => {
    expect(sqYdFromLength(ft, inches, w)!.quantity).toBe(sqyd);
  });

  it('needs a width and some length', () => {
    expect(sqYdFromLength(14, 6, 0)).toBeNull();
    expect(sqYdFromLength(0, 0, 12)).toBeNull();
  });
});

describe('carpet length from yardage (new): SqYd → whole feet + inches', () => {
  it.each([
    // the app's examples (scripts/carpet-length-from-yardage.test.js): [sqyd, width, ft, in]
    [79.12, 12, 59, 4],
    [50, 13.5, 33, 4],
    [20, 12, 15, 0],
    [30, 12, 22, 6],
    [25, 15, 15, 0],
    [10.97, 12, 8, 3],
    [25, 13.5, 16, 8],
    [79.12, 15, 47, 6],
    [45, 12, 33, 9],
    [60, 12, 45, 0],
  ])('%s SqYd on a %s\' roll → %s\' %s"', (q, w, ft, inches) => {
    expect(lengthFromSqYd(q, w)).toMatchObject({ lengthFt: ft, lengthIn: inches });
  });

  it('whole inches, rounded: SqYd × 108 ÷ width', () => {
    expect(rollInchesFor(19.33, 12)).toBe(174); // 173.97 → 174 = 14' 6"
    expect(lengthFromSqYd(19.33, 12)).toEqual({ lengthFt: 14, lengthIn: 6, linearFt: 14.5 });
    expect(lengthFromSqYd(19.33, 0)).toBeNull();
    expect(lengthFromSqYd(0, 12)).toBeNull();
  });

  const CATALOG: RollCatalog = {
    inventory: [{ matNum: 'RMAT-OBJ', rollWidth: { feet: 12, inches: 0 } }],
    productList: [{ matNum: 'RMAT-1350', rollWidth: 13.5 }, { matNum: 'RMAT-0012', rollWidth: 12 }],
  };

  it('width: the line, then inventory / catalog, then "15Ft 00In" in the name, then 12\' for carpet', () => {
    expect(rollWidthFor({ rollWidth: 13.5 }, CATALOG)).toEqual({ w: 13.5, src: 'line' });
    expect(rollWidthFor({ rollWidth: 12, rollWidthAssumed: true }, CATALOG)).toEqual({ w: 12, src: 'default' });
    expect(rollWidthFor({ matNum: 'RMAT-1350', rollWidth: '' }, CATALOG)).toEqual({ w: 13.5, src: 'product' });
    expect(rollWidthFor({ matNum: 'RMAT-OBJ' }, CATALOG)).toEqual({ w: 12, src: 'product' });
    expect(rollWidthFor({ name: 'Refined Saga I 15Ft 00In A', purchaseUOM: 'Roll' }, CATALOG)).toEqual({ w: 15, src: 'name' });
    expect(rollWidthFor({ matNum: 'RMAT-00494', name: 'Shoreline' }, CATALOG)).toEqual({ w: 12, src: 'default' });
    expect(rollWidthFor({ matNum: 'MAT-1', category: 'Carpet' }, CATALOG)).toEqual({ w: 12, src: 'default' });
    expect(rollWidthFor({ matNum: 'MAT-0038', category: 'Pad/Cushion', purchaseUOM: 'Roll' }, CATALOG)).toEqual({ w: 0, src: '' });
    expect([rollWidthFt(12), rollWidthFt('13.5'), rollWidthFt({ feet: 13, inches: 6 }), rollWidthFt(''), rollWidthFt(-1)]).toEqual([12, 13.5, 13.5, 0, 0]);
  });

  it('typing SqYd fills the length and stores the width — "(assumed)" for the 12\' default', () => {
    expect(rollLengthFromQty({ matNum: 'RMAT-00494', name: 'Shoreline', costUOM: 'SqYd', category: 'Carpet', quantity: 79.12 }, CATALOG)).toEqual({
      rollWidth: 12, rollWidthAssumed: true, lengthFt: 59, lengthIn: 4, linearFt: 59.33,
    });
    expect(rollLengthFromQty({ matNum: 'RMAT-1350', costUOM: 'SqYd', quantity: 50 }, CATALOG)).toEqual({
      rollWidth: 13.5, rollWidthAssumed: false, lengthFt: 33, lengthIn: 4, linearFt: 33.33,
    });
    // clearing the SqYd clears the length
    expect(rollLengthFromQty({ matNum: 'RMAT-1350', costUOM: 'SqYd', quantity: '' }, CATALOG)).toEqual({ lengthFt: '', lengthIn: '', linearFt: '' });
    // only SqYd lines: cove base sold by the roll is in Linear Ft
    expect(rollLengthFromQty({ matNum: 'RMAT-COVE', rollWidth: 0.5, costUOM: 'Linear Ft', quantity: 120 }, CATALOG)).toBeNull();
    // pad with no width anywhere: nothing to work out
    expect(rollLengthFromQty({ matNum: 'MAT-0038', purchaseUOM: 'Roll', costUOM: 'SqYd', category: 'Pad/Cushion', quantity: 79.12 }, CATALOG)).toBeNull();
    expect([rollQtyIsSqYd({ costUOM: 'Sq. Yd' }), rollQtyIsSqYd({}), rollQtyIsSqYd({ coverageUOM: 'SqFt' })]).toEqual([true, true, false]);
  });

  it('inches to the nearest 1/16 for the length chip', () => {
    for (const [dec, want] of [[6, '6'], [5.97, '6'], [3.5, '3 1/2'], [0.0625, '1/16'], [0.03, ''], [10.25, '10 1/4'], [7.8125, '7 13/16'], [11.99, '12'], [0, '']] as const) {
      expect(inchFraction(dec)).toBe(want);
    }
  });

  it('length chip and width line', () => {
    expect(lengthLabel(59, 4)).toBe(`59' 4"`);
    expect(lengthLabel(14, 0)).toBe(`14'`);
    expect(lengthLabel(0, 8.5)).toBe(`0' 8 1/2"`);
    expect(lengthLabel('', '')).toBe('');
    expect(rollWidthLine({ rollWidth: 13.5 })).toEqual({ text: `× 13' 6" roll`, title: 'Roll width — click to change' });
    expect(rollWidthLine({ rollWidth: 12, rollWidthAssumed: true })!.text).toBe("× 12' roll (assumed)");
    expect(rollWidthLine({ rollWidth: '' })).toBeNull();
    expect([rollWidthLabel(12), rollWidthLabel(13.5), rollWidthLabel(13.167), rollWidthLabel(12.99), rollWidthLabel(0)]).toEqual(["12'", `13' 6"`, `13' 2"`, "13'", '']);
  });

  it('rolled = roll width (number or {feet, inches}), Roll purchase unit, or an RMAT number', () => {
    expect(isRolled({ rollWidth: 12 })).toBe(true);
    expect(isRolled({ rollWidth: { feet: 12, inches: 0 } })).toBe(true);
    expect(isRolled({ purchaseUOM: 'ROLL' })).toBe(true);
    expect(isRolled({ matNum: 'rmat-001' })).toBe(true);
    expect(isRolled({ purchaseUOM: 'SqYd', matNum: 'ACC-PAD8' })).toBe(false);
    expect(isRolled(null)).toBe(false);
  });
});

describe('the Roll Dimensions window', () => {
  it('width dialog and typed-length preview', () => {
    expect(rollWidthFromFtIn(12, 0)).toBe(12);
    expect(rollWidthFromFtIn(13, 6)).toBe(13.5);
    expect(rollWidthFromFtIn(0, 0)).toBeNull();
    expect(rollDimensionsPreview(12, 0, 14, 6)).toBe(`📐 12' wide × 14' 6" = 19.33 SqYd`);
    expect(rollDimensionsPreview(12, 0, 20, 6)).toBe(`📐 12' wide × 20' 6" = 27.33 SqYd`);
    expect(rollDimensionsPreview(12, 0, 0, 0)).toBe('Enter width and length to see SqYd');
  });

  it('while the line has SqYd, the length follows the width and the SqYd is kept', () => {
    expect(rollDimensionsFromQty(15, 0, 79.12)).toEqual({ lengthFt: 47, lengthIn: 6, preview: `📐 15' wide × 47' 6" = 79.12 SqYd` });
    expect(rollDimensionsFromQty(12, 0, 10.97)).toEqual({ lengthFt: 8, lengthIn: 3, preview: `📐 12' wide × 8' 3" = 10.97 SqYd` });
    expect(rollDimensionsFromQty(0, 0, 10.97).preview).toBe('Enter width and length to see SqYd');
  });

  it('opens with the resolved width, the length and the "assumed" note', () => {
    const d = rollDimsDialog({ matNum: 'RMAT-00494', costUOM: 'SqYd', category: 'Carpet', quantity: 10.97 });
    expect(d).toMatchObject({ widthFt: 12, widthIn: 0, lengthFt: '', lengthIn: '', fromQty: true });
    expect(d.note).toBe("No roll width on this product — 12' is assumed (most carpet is 12' wide). Change it if this roll is different.");
    expect(d.intro).toBe("Set the roll's width and the length of carpet needed. SqYd = length × width / 9 — the length is worked out from the 10.97 SqYd on the line until you type one.");
    expect(rollDimsDialog({ name: 'Refined Saga I 15Ft 00In A', purchaseUOM: 'Roll', costUOM: 'SqYd', quantity: '' }).note).toBe('Width read from the product name.');
  });

  it('Save: a width change keeps the SqYd and re-works the length; a typed length sets the SqYd', () => {
    const line = { matNum: 'RMAT-00494', costUOM: 'SqYd', category: 'Carpet', quantity: 79.12, rollWidth: 12, rollWidthAssumed: true, lengthFt: 59, lengthIn: 4 };
    expect(applyRollDimensions(line, { widthFt: 15, widthIn: '', lengthFt: 59, lengthIn: 4, typed: false })).toEqual({
      patch: { rollWidth: 15, rollWidthAssumed: false, lengthFt: 47, lengthIn: 6, linearFt: 47.5 }, from: 'qty', rollLength: null,
    });
    expect(applyRollDimensions({ ...line, rollWidthAssumed: false }, { widthFt: 12, widthIn: '', lengthFt: 20, lengthIn: 6, typed: true })).toEqual({
      patch: { rollWidth: 12, rollWidthAssumed: false, lengthFt: 20, lengthIn: 6, quantity: 27.33, linearFt: 20.5 }, from: 'length', rollLength: 20.5,
    });
    expect(rollLengthSavedToast(20.5)).toBe('📐 Roll length 20.50 ft saved to the product for next time');
  });
});
