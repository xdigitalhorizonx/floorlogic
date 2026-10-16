// Single source for facts that appear in many places (copy, schema, meta).
// If a price or date changes, change it here only.

export const SITE = {
  name: 'FloorLogic',
  tagline: 'Flooring business software',
  url: 'https://floorlogic.vercel.app', // switch to the final domain in astro.config.mjs + here
  maker: { name: 'Digital Horizon', url: 'https://digitalhorizon.dev' },
  builtIn: { name: 'Landmark Flooring', city: 'Carson City', region: 'NV' },
  locality: 'Carson City',
  region: 'NV',
  country: 'US',
  phone: '(775) 237-8898',
  phoneHref: 'tel:+17752378898',
  email: 'brandon@digitalhorizon.dev',
} as const;

export const TRIAL = {
  days: 14,
  microcopy: '14 days free · No credit card · No setup fee',
  /** The signup backend is not wired yet (owner decision 2026-10-13). */
  open: false,
} as const;

export type Tier = {
  id: 'crew' | 'shop' | 'ledger';
  name: string;
  monthly: number;
  yearly: number;
  seats: string;
  recommended?: boolean;
  blurb: string;
  includes: string[];
};

// Prices approved by the owner 2026-08-16. Yearly = two months free. Feature lines re-checked
// against the current app 2026-10-15 (phone app, Caspar, calendar sync and Dialpad added at the
// owner's request; seats are packaging — the app does not enforce them).
export const TIERS: Tier[] = [
  {
    id: 'crew', name: 'Crew', monthly: 149, yearly: 1490, seats: 'Up to 3 users',
    blurb: 'For a small shop that quotes, installs and bills.',
    includes: [
      'Lead pipeline and follow-ups',
      'Quote builder with cartons and roll goods',
      'Live quote link with online approval',
      'Work orders with start and end dates',
      'Invoices with card payment',
      'Email quotes and invoices, text quote links',
      'Phone app for your reps',
    ],
  },
  {
    id: 'shop', name: 'Shop', monthly: 299, yearly: 2990, seats: 'Up to 10 users', recommended: true,
    blurb: 'For a showroom with reps, crews and stock.',
    includes: [
      'Everything in Crew',
      'Caspar: quotes by voice or from a photo',
      'Job costing: estimate vs actual',
      'Purchase orders and inventory',
      'Samples, projects and change orders',
      'Two reps per job and commissions',
      'Google Calendar sync and Dialpad call log',
    ],
  },
  {
    id: 'ledger', name: 'Ledger', monthly: 549, yearly: 5490, seats: 'Unlimited users',
    blurb: 'For the owner who wants the books in the same place.',
    includes: [
      'Everything in Shop',
      'Accounting: receivables and payables',
      'Bank statement import and reconciliation',
      'Auto-categorization rules',
      'Profit & loss and contractor payment reports',
      'PIN-locked finance screens',
      'Priority onboarding and data migration',
    ],
  },
];

/** Competitor census — flooring-native BUSINESS MANAGEMENT systems only. */
export const CENSUS = {
  firstChecked: '2026-08-15',
  lastChecked: '2026-10-14',
  /** Re-checked on their own websites 2026-10-13/14 (Pacific Solutions last checked 2026-08-15). */
  rechecked: ['FloorZap', 'QFloors', 'RFMS', 'RollMaster', 'Broadlume', 'Comp-U-Floor', 'Service Buddy'],
  nextDue: '2026-11-15',
  count: 8,
  vendors: ['FloorZap', 'QFloors', 'RFMS', 'RollMaster', 'Comp-U-Floor', 'Broadlume', 'Pacific Solutions', 'Service Buddy'],
} as const;

/** Landmark Flooring production figures — dated, never refreshed from the live database. */
export const PROOF = {
  asOf: '2026-08-14',
  quotes: 88,
  jobs: 34,
  invoices: 21,
  bankTxns: 992,
  catalogRows: 36188,
} as const;

export const NAV = [
  { href: '/#product', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'About' },
] as const;
