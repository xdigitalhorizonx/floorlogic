import { describe, expect, it } from 'vitest';
import { DEFAULT_TAX, getTaxRateFromAddress, materialsTax, taxLabel, WASHOE_TAX } from '../../src/lib/logic';

describe('Nevada tax lookup', () => {
  it.each([
    ['Reno, NV', 0.08265, 'Washoe County'],
    ['Sparks, NV 89431', 0.08265, 'Washoe County'],
    ['Carson City, NV', 0.076, 'Carson City County'],
    ['Minden, NV', 0.071, 'Douglas County'],
    ['Gardnerville, NV', 0.071, 'Douglas County'],
    ['Las Vegas, NV 89101', 0.08375, 'Clark County'],
    ['80 Pinon Drive, NV 89444', 0.071, 'Lyon County'], // exact ZIP map
    ['12 Some Rd, NV 89503', 0.08265, 'Washoe County'], // 3-digit prefix 895
    ['Ranch road, Lyon County', 0.071, 'Lyon County'], // explicit county wins
  ])('%s → %s (%s)', (addr, rate, label) => {
    expect(getTaxRateFromAddress(addr)).toEqual({ rate, label });
  });

  it('town names match anywhere in the text, first table entry wins (app behaviour)', () => {
    // "Renova" contains "reno": the app's substring match calls it Washoe.
    expect(getTaxRateFromAddress('123 Renova Ct, Elko, NV')?.label).toBe('Washoe County');
  });

  it('nothing recognisable → null; the builder then uses Carson City', () => {
    expect(getTaxRateFromAddress('')).toBeNull();
    expect(getTaxRateFromAddress('Sacramento, CA 95814')).toBeNull();
    expect(DEFAULT_TAX).toEqual({ rate: 0.076, label: 'Carson City County' });
    expect(WASHOE_TAX).toEqual(getTaxRateFromAddress('Reno, NV'));
  });

  it('labels: "Tax (8.27%)" for Washoe, "Tax (Exempt)" when exempt', () => {
    expect(taxLabel(0.08265)).toBe('Tax (8.27%)');
    expect(taxLabel(0.076)).toBe('Tax (7.60%)');
    expect(taxLabel(0.08375)).toBe('Tax (8.38%)');
    expect(taxLabel(0.08265, true)).toBe('Tax (Exempt)');
  });

  it('tax is on materials only and zero when exempt', () => {
    expect(materialsTax(5331.266, 0.08265)).toBeCloseTo(440.6291349, 6);
    expect(materialsTax(5331.266, 0.08265, true)).toBe(0);
  });
});
