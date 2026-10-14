import { describe, expect, it } from 'vitest';
import {
  inchFraction, isRolled, lengthFromSqYd, lengthLabel, rollDimensionsPreview, rollWidthFromFtIn, sqYdFromLength,
} from '../../src/lib/logic';

describe('roll goods', () => {
  it("12' wide × 14' 6\" long = 19.33 SqYd", () => {
    expect(sqYdFromLength(14, 6, 12)).toEqual({ quantity: 19.33, linearFt: 14.5 });
  });

  it.each([
    // [ft, in, width, sqyd]
    [10, 0, 12, 13.33],
    [0, 18, 12, 2],
    [25, 3, 13.5, 37.88],
    [9, 9.5, 15, 16.32],
  ])("%s' %s\" on a %s' roll → %s SqYd", (ft, inches, w, sqyd) => {
    expect(sqYdFromLength(ft, inches, w)!.quantity).toBe(sqyd);
  });

  it('needs a width and some length', () => {
    expect(sqYdFromLength(14, 6, 0)).toBeNull();
    expect(sqYdFromLength(0, 0, 12)).toBeNull();
  });

  it('SqYd → feet + inches (floor feet, inches to 2 decimals)', () => {
    expect(lengthFromSqYd(19.33, 12)).toEqual({ lengthFt: 14, lengthIn: 5.97, linearFt: 14.5 });
    expect(lengthFromSqYd(20, 12)).toEqual({ lengthFt: 15, lengthIn: 0, linearFt: 15 });
    expect(lengthFromSqYd(19.33, 0)).toBeNull();
    expect(lengthFromSqYd(0, 12)).toBeNull();
  });

  it.each([
    [6, '6'],
    [5.97, '6'],
    [3.5, '3 1/2'],
    [0.0625, '1/16'],
    [0.03, ''],
    [10.25, '10 1/4'],
    [7.8125, '7 13/16'],
    [11.99, '12'],
    [0, ''],
  ])('inches %s → "%s" (nearest 1/16)', (dec, want) => expect(inchFraction(dec)).toBe(want));

  it('length chip', () => {
    expect(lengthLabel(14, 5.97)).toBe(`14' 6"`);
    expect(lengthLabel(14, 0)).toBe(`14'`);
    expect(lengthLabel(0, 8.5)).toBe(`0' 8 1/2"`);
    expect(lengthLabel('', '')).toBe('');
  });

  it('rolled = roll width, Roll purchase unit, or an RMAT number', () => {
    expect(isRolled({ rollWidth: 12 })).toBe(true);
    expect(isRolled({ purchaseUOM: 'ROLL' })).toBe(true);
    expect(isRolled({ matNum: 'rmat-001' })).toBe(true);
    expect(isRolled({ purchaseUOM: 'SqYd', matNum: 'ACC-PAD8' })).toBe(false);
  });

  it('roll width dialog and dimension preview', () => {
    expect(rollWidthFromFtIn(12, 0)).toBe(12);
    expect(rollWidthFromFtIn(13, 6)).toBe(13.5);
    expect(rollWidthFromFtIn(0, 0)).toBeNull();
    expect(rollDimensionsPreview(12, 0, 14, 6)).toBe(`📐 12' wide × 14' 6" = 19.33 SqYd`);
    expect(rollDimensionsPreview(12, 0, 0, 0)).toBe('Enter width and length to see SqYd');
  });
});
