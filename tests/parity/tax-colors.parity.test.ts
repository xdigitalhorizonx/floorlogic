/**
 * Tax lookup tables + getTaxRateFromAddress, and every colour the site
 * claims is the app's, read straight from the app's CSS and constants.
 */
import { describe, expect, it } from 'vitest';
import {
  APP_BADGE_TEXT, APP_BADGE_TINT, APP_SOLID, APP_THEME, DEFAULT_PAYMENT_TERMS, getTaxRateFromAddress, INVOICE_STATUS_COLOR_NAMES, JOB_STATUS_COLOR_NAMES,
  LEAD_STATUS_COLOR_NAMES, NV_CITY_COUNTY, NV_COUNTY_TAX, NV_ZIP3_COUNTY, NV_ZIP_COUNTY, PRIVACY_MODE, QUOTE_STATUS_COLOR_NAMES,
} from '../../src/lib/logic';
import { code, sandbox } from './app-source';

type Tables = { NV_COUNTY_TAX: object; NV_CITY_COUNTY: object; NV_ZIP_COUNTY: object; NV_ZIP3_COUNTY: object; getTaxRateFromAddress: typeof getTaxRateFromAddress };
const app = sandbox<Tables>('index', {
  consts: ['NV_COUNTY_TAX', 'NV_CITY_COUNTY', 'NV_ZIP_COUNTY', 'NV_ZIP3_COUNTY'],
  fns: ['_nvTaxResult', 'getTaxRateFromAddress'],
});

describe('Nevada tax', () => {
  it('tables are identical, in the same order (order decides town matches)', () => {
    expect(JSON.stringify(Object.entries(NV_COUNTY_TAX))).toBe(JSON.stringify(Object.entries(app.NV_COUNTY_TAX)));
    expect(JSON.stringify(Object.entries(NV_CITY_COUNTY))).toBe(JSON.stringify(Object.entries(app.NV_CITY_COUNTY)));
    expect(NV_ZIP_COUNTY).toEqual(app.NV_ZIP_COUNTY);
    expect(NV_ZIP3_COUNTY).toEqual(app.NV_ZIP3_COUNTY);
  });

  it('lookup agrees over towns, ZIPs, counties and junk', () => {
    const addrs: Array<string | null> = [null, '', 'Nowhere', 'Sacramento, CA 95814', '123 Renova Ct, Elko, NV', 'Reno, NV', 'Minden, NV', 'Gardnerville, NV'];
    for (const city of Object.keys(NV_CITY_COUNTY)) addrs.push(city, `${city.toUpperCase()}, NV`, `12 Main St, ${city}, NV 89999`);
    for (const z of Object.keys(NV_ZIP_COUNTY)) addrs.push(`1 Ranch Rd, NV ${z}`, `${z} Hwy 50, NV`);
    for (const z3 of Object.keys(NV_ZIP3_COUNTY)) addrs.push(`77 Elm St, NV ${z3}12`, `NV ${z3}99 and ${z3}00`);
    for (const county of Object.keys(NV_COUNTY_TAX)) addrs.push(`Somewhere in ${county} county`, `${county} County, NV 89501`);
    addrs.push('89501 Desert Way, Pahrump, NV 89048', 'Box 12, NV 88901', 'Lake Tahoe, NV', 'Incline Village, NV 89451', 'Crystal Bay, NV');
    for (const a of addrs) expect(getTaxRateFromAddress(a), String(a)).toEqual(app.getTaxRateFromAddress(a as string));
  });

  it('default payment terms are the app’s', () => {
    expect(code('index:text:default-payment-terms')).toBe(`systemPaymentTerms:${JSON.stringify(DEFAULT_PAYMENT_TERMS).replace(/"/g, "'")}`);
  });
});

describe('colours', () => {
  const root = code('index:text:root-css');
  const cssVar = (name: string) => {
    const m = new RegExp(`--${name}:(#[0-9A-Fa-f]{6})`).exec(root);
    return m ? m[1]!.toUpperCase() : null;
  };

  it(':root theme values are the app’s', () => {
    const map: Record<keyof typeof APP_THEME, string> = {
      primary: 'primary', primaryDark: 'primary-dark', success: 'success', warning: 'warning', danger: 'danger', gray: 'gray', light: 'light',
      white: 'white', black: 'black', border: 'border', blue: 'blue', purple: 'purple', amber: 'amber', indigo: 'indigo', pink: 'pink',
      green: 'green', darkGreen: 'dark-green', red: 'red', lightGray: 'light-gray',
    };
    for (const [k, v] of Object.entries(map)) expect(APP_THEME[k as keyof typeof APP_THEME], k).toBe(cssVar(v));
    for (const n of ['blue', 'indigo', 'amber', 'pink', 'green', 'gray', 'purple', 'red'] as const) expect(APP_SOLID[n]).toBe(cssVar(n));
  });

  it('app bug documented: there is no --orange, so Final Invoice’s solid fill is empty', () => {
    expect(cssVar('orange')).toBeNull();
    expect(code('index:const:JOB_STATUS_COLORS')).toContain("final_invoice:'orange'");
  });

  it('badge tints and text colours are the app’s', () => {
    const css = code('index:text:badge-css');
    const custom = cssVar('custom-price-fg');
    for (const m of css.matchAll(/\.badge-([a-z]+)\{background:([^;]+);color:([^}]+)\}/g)) {
      const name = m[1] as keyof typeof APP_BADGE_TINT;
      expect(APP_BADGE_TINT[name], name).toBe(m[2]);
      const color = m[3] === 'var(--custom-price-fg)' ? custom : m[3]!.toUpperCase();
      expect(APP_BADGE_TEXT[name], name).toBe(color);
    }
  });

  it('status → colour maps are the app’s', () => {
    const consts = sandbox<Record<string, Record<string, string>>>('index', {
      consts: ['LEAD_STATUS_COLORS', 'QUOTE_STATUS_COLORS', 'JOB_STATUS_COLORS', 'INV_STATUS_COLORS'],
    });
    const { quote_sent: _alias, ...lead } = consts.LEAD_STATUS_COLORS!;
    expect(lead).toEqual(LEAD_STATUS_COLOR_NAMES);
    expect(consts.QUOTE_STATUS_COLORS).toEqual(QUOTE_STATUS_COLOR_NAMES);
    expect(consts.JOB_STATUS_COLORS).toEqual(JOB_STATUS_COLOR_NAMES);
    expect(consts.INV_STATUS_COLORS).toEqual(INVOICE_STATUS_COLOR_NAMES);
  });

  it('privacy mode: blur on .qb-private with hover to peek, and the toggle’s wording', () => {
    const css = code('index:text:privacy-css');
    expect(css).toContain(`[data-privacy="on"] .qb-private,[data-privacy="on"] .comp-cost-header,[data-privacy="on"] .comp-cost-cell{filter:${PRIVACY_MODE.filter}`);
    expect(css).toContain('.qb-private:hover');
    expect(code('index:text:privacy-tooltip')).toBe(`data-tip="${PRIVACY_MODE.tooltip}"`);
  });
});
