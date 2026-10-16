import { describe, expect, it } from 'vitest';
import { countyFromTown, DEFAULT_TAX, getTaxRateFromAddress, materialsTax, taxLabel, taxRatePill, WASHOE_TAX } from '../../src/lib/logic';

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

  it('towns match on whole words, after the street line, longest name first (changed since August)', () => {
    // August: "Renova" contained "reno" → Washoe. Now the town after the comma decides.
    expect(getTaxRateFromAddress('123 Renova Ct, Elko, NV')?.label).toBe('Elko County');
    // "Jeanette" no longer reads as Jean (Clark County).
    expect(getTaxRateFromAddress('60 Jeanette Dr, Carson City, NV 89706')).toEqual({ rate: 0.076, label: 'Carson City County' });
    // A street named after a town does not move the tax.
    expect(getTaxRateFromAddress('1200 Austin Ave, Reno, NV 89509')?.label).toBe('Washoe County');
    // A written town beats a ZIP that straddles two counties; the ZIP decides when no town is written.
    expect(getTaxRateFromAddress('975 Adobe Dr, Carson City, NV 89705')?.label).toBe('Carson City County');
    expect(getTaxRateFromAddress('975 Adobe Dr, NV 89705')?.label).toBe('Douglas County');
    expect(countyFromTown('north las vegas, nv')).toBe('clark');
    expect(countyFromTown('61 industrial pkwy, mound house, nv 89706')).toBeNull(); // the table spells it "moundhouse"
  });

  it('nothing recognisable → null; the builder then uses Carson City', () => {
    expect(getTaxRateFromAddress('')).toBeNull();
    expect(getTaxRateFromAddress('Sacramento, CA 95814')).toBeNull();
    expect(DEFAULT_TAX).toEqual({ rate: 0.076, label: 'Carson City County' });
    expect(WASHOE_TAX).toEqual(getTaxRateFromAddress('Reno, NV'));
  });

  it('labels keep up to 3 decimals: "Tax (8.265%)" for Washoe, "Tax (Exempt)" when exempt', () => {
    expect(taxLabel(0.08265)).toBe('Tax (8.265%)');
    expect(taxLabel(0.076)).toBe('Tax (7.6%)');
    expect(taxLabel(0.08375)).toBe('Tax (8.375%)');
    expect(taxLabel(0)).toBe('Tax (0%)');
    expect(taxLabel(0.08265, true)).toBe('Tax (Exempt)');
    expect([taxRatePill(0.08265), taxRatePill(0.076), taxRatePill(0.08265, true), taxRatePill(null)]).toEqual(['8.265%', '7.600%', '0.000%', '0.000%']);
  });

  it('tax is on materials only and zero when exempt', () => {
    expect(materialsTax(5331.266, 0.08265)).toBeCloseTo(440.6291349, 6);
    expect(materialsTax(5331.266, 0.08265, true)).toBe(0);
  });
});
