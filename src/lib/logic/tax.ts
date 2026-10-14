/**
 * Nevada sales tax: county lookup from an address, the label, and the rule
 * that tax applies to MATERIALS ONLY (labor is never taxed).
 *
 * Source: main L6518-6539 (`NV_COUNTY_TAX`, `NV_CITY_COUNTY`, `NV_ZIP_COUNTY`,
 * `NV_ZIP3_COUNTY`, `_nvTaxResult`, `getTaxRateFromAddress`), the totals rows
 * at main L23236 (label), and the money lines at main L11391 / L13024.
 */

/** Combined county rates the app ships (main L6518). */
export const NV_COUNTY_TAX: Readonly<Record<string, number>> = {
  clark: 0.08375,
  washoe: 0.08265,
  'carson city': 0.076,
  douglas: 0.071,
  lyon: 0.071,
  churchill: 0.076,
  storey: 0.076,
  elko: 0.0685,
  humboldt: 0.0685,
  lander: 0.0685,
  mineral: 0.0685,
  nye: 0.0685,
  pershing: 0.0685,
  eureka: 0.0685,
  esmeralda: 0.0685,
  lincoln: 0.0685,
  'white pine': 0.0685,
};

/**
 * Town → county (main L6519), in the app's order — order matters because the
 * lookup takes the FIRST town whose name appears anywhere in the address.
 * App data quirk kept as-is: 'crystal bay' maps to Douglas (it is in Washoe).
 */
export const NV_CITY_COUNTY: Readonly<Record<string, string>> = {
  'las vegas': 'clark', henderson: 'clark', 'north las vegas': 'clark', 'boulder city': 'clark', mesquite: 'clark',
  enterprise: 'clark', summerlin: 'clark', 'spring valley': 'clark', paradise: 'clark', whitney: 'clark',
  laughlin: 'clark', searchlight: 'clark', overton: 'clark', moapa: 'clark', 'blue diamond': 'clark',
  'indian springs': 'clark', jean: 'clark', nellis: 'clark', winchester: 'clark', 'sunrise manor': 'clark',
  'whitney ranch': 'clark', reno: 'washoe', sparks: 'washoe', 'incline village': 'washoe', 'sun valley': 'washoe',
  verdi: 'washoe', 'cold springs': 'washoe', 'lemmon valley': 'washoe', 'carson city': 'carson city',
  gardnerville: 'douglas', minden: 'douglas', stateline: 'douglas', 'zephyr cove': 'douglas', genoa: 'douglas',
  'topaz lake': 'douglas', glenbrook: 'douglas', 'crystal bay': 'douglas', fernley: 'lyon', yerington: 'lyon',
  dayton: 'lyon', 'silver springs': 'lyon', moundhouse: 'lyon', 'smith valley': 'lyon', wellington: 'lyon',
  fallon: 'churchill', 'virginia city': 'storey', 'gold hill': 'storey', elko: 'elko', 'spring creek': 'elko',
  carlin: 'elko', wells: 'elko', 'west wendover': 'elko', jackpot: 'elko', winnemucca: 'humboldt',
  orovada: 'humboldt', 'battle mountain': 'lander', austin: 'lander', hawthorne: 'mineral', mina: 'mineral',
  pahrump: 'nye', tonopah: 'nye', 'amargosa valley': 'nye', beatty: 'nye', gabbs: 'nye', lovelock: 'pershing',
  eureka: 'eureka', goldfield: 'esmeralda', pioche: 'lincoln', caliente: 'lincoln', ely: 'white pine',
  ruth: 'white pine', mcgill: 'white pine',
};

/** Exact ZIP → county (main L6524). */
export const NV_ZIP_COUNTY: Readonly<Record<string, string>> = {
  '89001': 'lincoln', '89003': 'nye', '89008': 'lincoln', '89010': 'esmeralda', '89013': 'esmeralda',
  '89017': 'lincoln', '89020': 'nye', '89041': 'nye', '89042': 'lincoln', '89043': 'lincoln', '89045': 'nye',
  '89047': 'esmeralda', '89048': 'nye', '89049': 'nye', '89060': 'nye', '89061': 'nye', '89310': 'lander',
  '89314': 'nye', '89316': 'eureka', '89402': 'washoe', '89403': 'lyon', '89404': 'humboldt', '89405': 'washoe',
  '89406': 'churchill', '89407': 'churchill', '89408': 'lyon', '89409': 'nye', '89410': 'douglas',
  '89411': 'douglas', '89412': 'washoe', '89413': 'douglas', '89414': 'humboldt', '89415': 'mineral',
  '89418': 'pershing', '89419': 'pershing', '89420': 'mineral', '89421': 'humboldt', '89422': 'mineral',
  '89423': 'douglas', '89424': 'washoe', '89425': 'humboldt', '89426': 'humboldt', '89427': 'mineral',
  '89428': 'lyon', '89429': 'lyon', '89430': 'lyon', '89431': 'washoe', '89432': 'washoe', '89433': 'washoe',
  '89434': 'washoe', '89435': 'washoe', '89436': 'washoe', '89438': 'humboldt', '89439': 'washoe',
  '89440': 'storey', '89441': 'washoe', '89442': 'washoe', '89444': 'lyon', '89445': 'humboldt',
  '89446': 'humboldt', '89447': 'lyon', '89448': 'douglas', '89449': 'douglas', '89450': 'washoe',
  '89451': 'washoe', '89452': 'washoe', '89460': 'douglas', '89704': 'washoe', '89705': 'douglas',
  '89820': 'lander', '89821': 'eureka',
};

/** 3-digit ZIP prefix → county fallback (main L6525). */
export const NV_ZIP3_COUNTY: Readonly<Record<string, string>> = {
  '889': 'clark', '890': 'clark', '891': 'clark', '893': 'white pine', '895': 'washoe', '897': 'carson city', '898': 'elko',
};

export interface TaxResult {
  rate: number;
  /** e.g. "Washoe County" (the app also says "Carson City County"). */
  label: string;
}

/** `_nvTaxResult` (main L6526). */
function countyResult(county: string): TaxResult | null {
  const rate = NV_COUNTY_TAX[county];
  if (rate == null) return null;
  const label = county.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' County';
  return { rate, label };
}

/**
 * `getTaxRateFromAddress` (main L6527): an explicit "X County" wins, then the
 * first known town found in the text, then the last NV ZIP (exact, then
 * 3-digit prefix). Null when nothing matches.
 */
export function getTaxRateFromAddress(address: string | null | undefined): TaxResult | null {
  if (!address) return null;
  const lower = address.toLowerCase();
  for (const county of Object.keys(NV_COUNTY_TAX)) {
    if (county !== 'carson city' && lower.includes(county + ' county')) return countyResult(county);
  }
  for (const [city, county] of Object.entries(NV_CITY_COUNTY)) {
    if (lower.includes(city)) return countyResult(county);
  }
  const zips = lower.match(/\b8[89]\d{3}\b/g) || [];
  for (let i = zips.length - 1; i >= 0; i--) {
    const z = zips[i]!;
    const county = NV_ZIP_COUNTY[z] || NV_ZIP3_COUNTY[z.slice(0, 3)];
    if (county) return countyResult(county);
  }
  return null;
}

/**
 * What the quote builder falls back to when the address gives no county
 * (main L12667 `selectQBClient`; `qb.taxRate??0.076` at main L11324).
 */
export const DEFAULT_TAX: TaxResult = { rate: 0.076, label: 'Carson City County' };

/** Tax-exempt customers get rate 0 and this county label (main L12667). */
export const TAX_EXEMPT_COUNTY = 'Tax Exempt';

/** Washoe County (Reno/Sparks) — the sample shop's county. */
export const WASHOE_TAX: TaxResult = { rate: 0.08265, label: 'Washoe County' };

/**
 * Totals-row label (main L23236): "Tax (8.27%)" — rate × 100 to 2 decimals —
 * or "Tax (Exempt)".
 */
export function taxLabel(rate: number, exempt = false): string {
  return exempt ? 'Tax (Exempt)' : `Tax (${(rate * 100).toFixed(2)}%)`;
}

/**
 * Sales tax on a materials subtotal, unrounded (the app rounds only when it
 * stores or prints). Labor is never part of the base.
 */
export function materialsTax(materialsSubtotal: number, rate: number, exempt = false): number {
  return exempt ? 0 : materialsSubtotal * rate;
}
