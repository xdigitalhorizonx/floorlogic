import { describe, expect, it } from 'vitest';
import {
  APP_SOLID, APP_THEME, contrastRatio, INVOICE_STATUS_COLOR_NAMES, JOB_STATUS_COLOR_NAMES, LEAD_STATUS_COLOR_NAMES, QUOTE_STATUS_COLOR_NAMES,
  relativeLuminance, SITE_SOLID, SITE_THEME, type ColorName,
} from '../../src/lib/logic';

const WHITE = '#FFFFFF';
const names = Object.keys(SITE_SOLID) as ColorName[];

describe('WCAG maths', () => {
  it('known reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(() => relativeLuminance('blue')).toThrow();
  });
});

describe('site colours carry white text at AA (≥ 4.5:1)', () => {
  it.each(names)('%s', (name) => {
    expect(contrastRatio(SITE_SOLID[name], WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('every status in every map resolves to an AA solid', () => {
    const maps = [LEAD_STATUS_COLOR_NAMES, JOB_STATUS_COLOR_NAMES, INVOICE_STATUS_COLOR_NAMES, QUOTE_STATUS_COLOR_NAMES];
    for (const map of maps) for (const name of Object.values(map)) expect(contrastRatio(SITE_SOLID[name as ColorName], WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('theme roles used under white text pass too', () => {
    for (const hex of Object.values(SITE_THEME)) expect(contrastRatio(hex, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('site variants are darker versions of the app hue', () => {
    for (const name of names) expect(relativeLuminance(SITE_SOLID[name])).toBeLessThanOrEqual(relativeLuminance(APP_SOLID[name]));
  });

  it('why: the app’s own solids mostly fail with white text', () => {
    const failing = names.filter((n) => contrastRatio(APP_SOLID[n], WHITE) < 4.5);
    expect(failing.sort()).toEqual(['amber', 'blue', 'green', 'indigo', 'orange', 'pink', 'purple']);
    expect(contrastRatio(APP_THEME.success, WHITE)).toBeLessThan(4.5);
    expect(contrastRatio(APP_THEME.danger, WHITE)).toBeLessThan(4.5);
    expect(contrastRatio(APP_THEME.primary, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('the requested variants', () => {
    expect([SITE_SOLID.blue, SITE_SOLID.indigo, SITE_SOLID.amber, SITE_SOLID.pink, SITE_SOLID.green]).toEqual(['#2563EB', '#4F46E5', '#B45309', '#BE185D', '#047857']);
  });
});
