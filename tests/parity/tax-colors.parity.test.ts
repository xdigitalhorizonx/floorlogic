/**
 * Tax lookup tables + getTaxRateFromAddress (whole-word towns since
 * October), the tax label / rate pill, and every colour the site claims is
 * the app's, read straight from the app's CSS and constants.
 */
import { describe, expect, it } from 'vitest';
import {
  APP_BADGE_TEXT, APP_BADGE_TINT, APP_SOLID, APP_THEME, DEFAULT_PAYMENT_TERMS, getTaxRateFromAddress, INVOICE_STATUS_COLOR_NAMES, JOB_STATUS_COLOR_NAMES,
  LEAD_STATUS_COLOR_NAMES, NV_CITY_COUNTY, NV_COUNTY_TAX, NV_ZIP3_COUNTY, NV_ZIP_COUNTY, PRIVACY_MODE, QUOTE_STATUS_COLOR_NAMES, taxLabel, taxRatePill,
} from '../../src/lib/logic';
import { code, sandbox } from './app-source';

type Tables = { NV_COUNTY_TAX: object; NV_CITY_COUNTY: object; NV_ZIP_COUNTY: object; NV_ZIP3_COUNTY: object; getTaxRateFromAddress: typeof getTaxRateFromAddress };
const app = sandbox<Tables>('index', {
  consts: ['NV_COUNTY_TAX', 'NV_CITY_COUNTY', 'NV_ZIP_COUNTY', 'NV_ZIP3_COUNTY'],
  fns: ['_nvTaxResult', '_nvCityHit', '_nvCityCounty', 'getTaxRateFromAddress'],
});

// Real-shaped addresses from the app's own spec (scripts/nv-tax-county.test.js).
const APP_SPEC_ADDRESSES = [
  '1 Main St, Jean, NV 89019', '1 Nowhere Rd, NV 89799', '11205 Vincent Ln, Reno, NV 89511', '1121 Monterra Drive, Minden, Nevada 89423',
  '1155 Renown Pkwy, Carson City, NV 89701', '12 Ruthledge Ave, Minden, NV 89423', '1200 Austin Ave, Reno, NV 89509',
  '1249 Manhattan Way, Gardnerville Ranchos, Nevada 89460', '1300 S Fox Glen Court, Reno, Nevada 89521', '136 Dayton Village Pkwy, Dayton, NV 89403',
  '139 Palmer Ct Dayton NV 89403', '1411 Arlen Ln, Gardnerville, NV 89410', '1471 highway 395, Gardnerville NV 89410', '1569 County Rd, Minden, NV 89423',
  '162 Irwin Drive A, Stateline, Nevada 89449', '1635 Mackland Avenue Minden, NV 89423', '1636 Oula St #1 Minden, NV 89423',
  '1751 Boundary Peak St, Carson City, NV 89701', '1770 Nichols Lane #102, Carson City, Nevada 89706', '1784 Maison Way, Carson City, Nevada 89703',
  '2085 East William Street, Carson City, Nevada 89701', '2200 E Long St, Carson City, NV 89706', '2300 Harvard Wy, Reno, NV 89502',
  '239 Smithridge Park, Reno, NV 89502', '253 Mill Race Loop, Douglas County, Nevada 89705', '2667 Michelangelo Ct, Sparks, NV 89434',
  '3 Crest Dr, Carson City, NV 89703', '300 Fallon St, Carson City, NV 89701', '305 Galaxy Ln, Stateline, NV 89449', '344 Sweetwater Cir, Dayton, NV 89403',
  '3579 US-50, Carson City, NV 89701', '4 Neely Rd, Gardnerville, NV 89410', '450 McFaul Way #17, Zephyr Cove, Nevada 89448', '500 Wellsville Way, Reno, NV 89509',
  '577 Yellow Jacket Road, Lyon County, Nevada 89403', '60 Jeanette Dr, Carson City, NV 89706', '60 Jeanette Drive, Carson City, Nevada 89706',
  '604 W King St Unit 14, Carson City, NV 89703', '61 Industrial Pkwy, Mound House, NV 89706', '704 Bonnie Court #A, Kingsbury, Nevada 89449',
  '80 Pinon Drive, Lyon County, Nevada 89444', '88 Minaret Ct, Sparks, NV 89434', '89701 Highway 395, NV 89423', '90 Artist View Rd, Wellington, NV 89444',
  '916 Harold Dr, Incline Village, NV 89451', '975 Adobe Dr, Carson City, NV 89705', '975 Adobe Dr, NV 89705', '9 Wells St, Reno, NV 89502',
  '12 Ely Ct, Sparks, NV 89434', 'North Las Vegas, NV 89030', 'Las Vegas', 'Jeanette Rd, Jean, NV', 'renovation, reno', 'Reno,NV', 'reno', 'RENO NV 89501',
];

describe('Nevada tax', () => {
  it('tables are identical, in the same order', () => {
    expect(JSON.stringify(Object.entries(NV_COUNTY_TAX))).toBe(JSON.stringify(Object.entries(app.NV_COUNTY_TAX)));
    expect(JSON.stringify(Object.entries(NV_CITY_COUNTY))).toBe(JSON.stringify(Object.entries(app.NV_CITY_COUNTY)));
    expect(NV_ZIP_COUNTY).toEqual(app.NV_ZIP_COUNTY);
    expect(NV_ZIP3_COUNTY).toEqual(app.NV_ZIP3_COUNTY);
  });

  it('lookup agrees over towns, ZIPs, counties, street-name traps and junk', () => {
    const addrs: Array<string | null> = [null, '', 'Nowhere', 'Sacramento, CA 95814', '123 Renova Ct, Elko, NV', 'Reno, NV', 'Minden, NV', 'Gardnerville, NV', ...APP_SPEC_ADDRESSES];
    for (const city of Object.keys(NV_CITY_COUNTY)) addrs.push(city, `${city.toUpperCase()}, NV`, `12 Main St, ${city}, NV 89999`, `1 ${city} Ave, Reno, NV`, `x${city}y, NV 89701`);
    for (const z of Object.keys(NV_ZIP_COUNTY)) addrs.push(`1 Ranch Rd, NV ${z}`, `${z} Hwy 50, NV`);
    for (const z3 of Object.keys(NV_ZIP3_COUNTY)) addrs.push(`77 Elm St, NV ${z3}12`, `NV ${z3}99 and ${z3}00`);
    for (const county of Object.keys(NV_COUNTY_TAX)) addrs.push(`Somewhere in ${county} county`, `${county} County, NV 89501`);
    addrs.push('89501 Desert Way, Pahrump, NV 89048', 'Box 12, NV 88901', 'Lake Tahoe, NV', 'Incline Village, NV 89451', 'Crystal Bay, NV');
    for (const a of addrs) expect(getTaxRateFromAddress(a), String(a)).toEqual(app.getTaxRateFromAddress(a as string));
    expect(addrs.length).toBeGreaterThan(600);
  });

  it('the app’s own headline cases', () => {
    expect(getTaxRateFromAddress('60 Jeanette Dr, Carson City, NV 89706')?.label).toBe('Carson City County'); // was Clark ("Jean")
    expect(getTaxRateFromAddress('975 Adobe Dr, Carson City, NV 89705')?.label).toBe('Carson City County'); // town beats a straddling ZIP
    expect(getTaxRateFromAddress('975 Adobe Dr, NV 89705')?.label).toBe('Douglas County');
    expect(getTaxRateFromAddress('1200 Austin Ave, Reno, NV 89509')?.label).toBe('Washoe County'); // a street named after a town
    expect(getTaxRateFromAddress('North Las Vegas, NV 89030')?.label).toBe('Clark County');
  });

  it('tax label (3 decimals, every totals box) and the builder’s rate pill', () => {
    const rows = code('index:fn:_computeTotalsData');
    expect(rows).toContain("{label:qb.taxExempt?'Tax (Exempt)':`Tax (${+(taxRate*100).toFixed(3)}%)`");
    expect(rows).toContain("{label:`Tax (${+(taxRate*100).toFixed(3)}%)`");
    for (const rate of [0.08265, 0.076, 0.071, 0.08375, 0.0685, 0, 0.1, 0.0827, 0.08255, 1 / 3]) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const appLabel = new Function('taxRate', 'return `Tax (${+(taxRate*100).toFixed(3)}%)`;')(rate) as string;
      expect(taxLabel(rate)).toBe(appLabel);
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const pill = (exempt: boolean) => new Function('exempt', 'qb', `${code('index:text:tax-rate-pill')}\nreturn pct;`)(exempt, { taxRate: rate }) as string;
      expect(taxRatePill(rate, false)).toBe(pill(false));
      expect(taxRatePill(rate, true)).toBe(pill(true));
    }
    expect(taxLabel(0.08265)).toBe('Tax (8.265%)');
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

  it('app bug documented: there is still no --orange, so Final Invoice’s solid fill is empty', () => {
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
