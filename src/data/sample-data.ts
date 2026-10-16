/**
 * Fictional sample data — not real customers or vendor pricing.
 *
 * ONE dataset for every site module and the demo video. Everything here is
 * invented: the shop, the people (555 phone numbers, .test emails), the
 * products (no real brands) and the prices. Leads carry a city only — never a
 * street address.
 *
 * Leads LD-051…LD-060 mirror the FloorLogic demo seed
 * (floorlogicdemo/scripts/demo-seed.mjs L171-180: names, project types,
 * values, sources, statuses, reps, survey/follow-up offsets, backdated
 * created_at at L580, sample SC-0235 for LD-056 at L486).
 *
 * All money is DERIVED through src/lib/logic (carton snaps, roll math,
 * quote totals, approval, due-now, job costing) — no hand-typed totals.
 * Dates are offsets from DEMO_TODAY so builds are deterministic.
 */
import {
  addDays,
  applyArea,
  approveQuote,
  cartonHint,
  computeDueNow,
  computeQuoteTotals,
  daysBetween,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_TAX,
  quoteDeposit,
  depositLabel,
  dueNowView,
  getTaxRateFromAddress,
  invoiceStatus,
  jobFinance,
  nextQuoteNumber,
  paymentFee,
  round2,
  sqYdFromLength,
  varianceView,
  woTransition,
  WO_LABELS,
  type DocCounters,
  type ISODate,
  type JobCostEntry,
  type Lead,
  type LeadType,
  type Payment,
  type QuoteLabor,
  type QuoteMaterial,
  type QuoteSection,
  type QuoteSelection,
  type WoEvent,
  type WoStatus,
} from '../lib/logic';

export type { Lead, LeadType } from '../lib/logic';

// ------------------------------------------------------------------ clock --

/** The "today" every sample date hangs off. */
export const DEMO_TODAY: ISODate = '2026-10-14';

/** DEMO_TODAY + `offset` days. */
export function demoDate(offset: number): ISODate {
  return addDays(DEMO_TODAY, offset);
}

/** A fixed instant (noon UTC) on a demo date — the clock for due-now maths. */
export function demoNowMs(iso: ISODate = DEMO_TODAY): number {
  return Date.parse(`${iso}T12:00:00Z`);
}

// ------------------------------------------------------------------- shop --

export const shop = {
  name: 'Pinyon Flooring Co.',
  address: '4120 Sierra Commerce Way',
  city: 'Reno, NV 89502',
  phone: '(775) 555-0140',
  email: 'office@pinyon.test',
} as const;

export interface Rep {
  id: string;
  name: string;
  initials: string;
  email: string;
  /** Commission, % of job profit (the app's default basis). Sample setting. */
  commissionRate: number;
}

export const reps: Rep[] = [
  { id: 'ct-rep-1', name: 'Dale Whitaker', initials: 'DW', email: 'dale@pinyon.test', commissionRate: 8 },
  { id: 'ct-rep-2', name: 'Marisol Vega', initials: 'MV', email: 'marisol@pinyon.test', commissionRate: 8 },
];

export interface Installer {
  id: string;
  name: string;
  trade: 'Installer';
}

export const installers: Installer[] = [
  { id: 'ct-ins-1', name: 'Ruben Ortiz', trade: 'Installer' },
  { id: 'ct-ins-2', name: 'Tanner Cole', trade: 'Installer' },
];

// ---------------------------------------------------------------- catalog --

export interface Product {
  id: string;
  tier?: 'good' | 'better' | 'best';
  matNum: string;
  name: string;
  category: string;
  vendor: string;
  /** How it is bought: Carton, Roll, SqYd, Linear Ft. */
  purchaseUOM: string;
  /** How it is priced: SqFt, SqYd, Linear Ft. */
  costUOM: string;
  /** SqFt per carton; 0 when not sold by the carton. */
  coverage: number;
  rollWidth?: number;
  cutCostPerSqYd?: number;
  rollCostPerSqYd?: number;
  /** Per costUOM. For roll goods this is the CUT cost, as the app uses (main L12413). */
  companyCost: number;
  retailPrice: number;
}

/**
 * Carton sizes are chosen so the app's snap and the site's agree for every
 * sample quantity (tests/logic/sample-data.test.ts proves it). The brief's
 * 22.31 SqFt for "Better" hits the app's exact-multiple bug at 912 SqFt
 * (41 cartons = 914.71, which the app re-counts as 42), so Better uses 22.32.
 */
export const products: Product[] = [
  {
    id: 'p-lvp-good', tier: 'good', matNum: 'LVP-SUM-DWO', name: 'Summit Rigid Core LVP — Driftwood Oak', category: 'LVP',
    vendor: 'Basin Floor Supply', purchaseUOM: 'Carton', costUOM: 'SqFt', coverage: 23.77, companyCost: 2.74, retailPrice: 4.55,
  },
  {
    id: 'p-lvp-better', tier: 'better', matNum: 'LVP-SUMXL-SHK', name: 'Summit XL Rigid Core — Smoked Hickory', category: 'LVP',
    vendor: 'Basin Floor Supply', purchaseUOM: 'Carton', costUOM: 'SqFt', coverage: 22.32, companyCost: 2.95, retailPrice: 4.9,
  },
  {
    id: 'p-hw-best', tier: 'best', matNum: 'HW-HER7-NAT', name: 'Heritage Engineered Oak 7in — Natural', category: 'Hardwood',
    vendor: 'Basin Floor Supply', purchaseUOM: 'Carton', costUOM: 'SqFt', coverage: 19.69, companyCost: 4.55, retailPrice: 7.4,
  },
  {
    id: 'p-carpet-sandbar', matNum: 'RMAT-SANDBAR-12', name: 'Sandbar Nylon Broadloom', category: 'Carpet',
    vendor: 'High Desert Carpet Supply', purchaseUOM: 'Roll', costUOM: 'SqYd', coverage: 0, rollWidth: 12,
    cutCostPerSqYd: 12.85, rollCostPerSqYd: 11.2, companyCost: 12.85, retailPrice: 22.4,
  },
  {
    id: 'p-pad-8lb', matNum: 'ACC-PAD8', name: '8 lb Rebond Pad', category: 'Underlayment',
    vendor: 'High Desert Carpet Supply', purchaseUOM: 'SqYd', costUOM: 'SqYd', coverage: 0, companyCost: 2.1, retailPrice: 4.2,
  },
  {
    id: 'p-base-325', matNum: 'ACC-BASE325', name: 'Primed MDF Base 3¼ in', category: 'Trim/Transition',
    vendor: 'Basin Floor Supply', purchaseUOM: 'Linear Ft', costUOM: 'Linear Ft', coverage: 0, companyCost: 0.94, retailPrice: 1.85,
  },
];

export interface LaborItem {
  id: string;
  name: string;
  description?: string;
  /** From the app's unit list (main L4593 systemCostUOMs). */
  uom: 'SqFt' | 'SqYd' | 'Each' | 'Linear Ft';
  companyCost: number;
  retailPrice: number;
}

export const labor: LaborItem[] = [
  { id: 'l-lvp-install', name: 'LVP Installation', uom: 'SqFt', companyCost: 1.35, retailPrice: 2.25 },
  { id: 'l-demo-carpet', name: 'Demo & haul-off — carpet', uom: 'SqFt', companyCost: 0.4, retailPrice: 0.65 },
  { id: 'l-carpet-pad', name: 'Carpet install with pad', uom: 'SqYd', companyCost: 4.1, retailPrice: 6.5 },
  { id: 'l-stair', name: 'Stair install', description: 'Per step', uom: 'Each', companyCost: 10, retailPrice: 16 },
];

/** Supply items (the seed's list, L125-132) used by job costing. */
export const supplies = [
  { id: 'sup-3', name: 'Transition strips', unitCost: 14.5, uom: 'Each' },
  { id: 'sup-2', name: 'Seam tape', unitCost: 9.75, uom: 'Roll' },
] as const;

function product(id: string): Product {
  const p = products.find((x) => x.id === id);
  if (!p) throw new Error(`sample-data: unknown product ${id}`);
  return p;
}
function laborItem(id: string): LaborItem {
  const l = labor.find((x) => x.id === id);
  if (!l) throw new Error(`sample-data: unknown labor ${id}`);
  return l;
}

// ------------------------------------------------------------------ leads --

const leadEmail = (name: string): string => `${name.split(' ')[0]!.toLowerCase().replace(/[^a-z]/g, '')}@example.test`;

function makeLead(
  id: string, number: string, name: string, phone: string, city: string, type: LeadType, projectType: string,
  status: Lead['status'], estimatedValue: number, source: string, salesRepId: string,
  opts: { createdAt: number; stageChangedAt: number; siteSurveyDate?: number; followUpDate?: number; quoteCount?: number; sampleCount?: number },
): Lead {
  const stageChangedAt = demoDate(opts.stageChangedAt);
  return {
    id, number, name, phone, email: leadEmail(name), city, type, projectType, source, status, estimatedValue, salesRepId,
    siteSurveyDate: opts.siteSurveyDate == null ? null : demoDate(opts.siteSurveyDate),
    followUpDate: opts.followUpDate == null ? null : demoDate(opts.followUpDate),
    createdAt: demoDate(opts.createdAt),
    stageChangedAt,
    stageAgeDays: daysBetween(stageChangedAt, DEMO_TODAY),
    quoteCount: opts.quoteCount ?? 0,
    sampleCount: opts.sampleCount ?? 0,
  };
}

/**
 * The board as of DEMO_TODAY — the seed's ten leads. `type` is not in the
 * seed (it leaves lead type blank); the business leads are typed here.
 * Stage clocks follow the seed (stage changed "yesterday", LD-051 today).
 * LD-056's quote (QT-330, below) is drafted today, so it shows 1 quote and
 * 1 sample out (SC-0235).
 */
export const leads: Lead[] = [
  makeLead('ld-11', 'LD-051', 'Hannah Brooks', '(775) 555-0501', 'Sparks, NV', 'Retail', 'LVP — main floor (~900 SqFt)', 'new', 5200, 'Phone', 'ct-rep-2', { createdAt: 0, stageChangedAt: 0 }),
  makeLead('ld-12', 'LD-052', 'Tom & Reyna Castillo', '(775) 555-0502', 'Reno, NV', 'Retail', 'Carpet — whole house', 'new', 12400, 'Website', 'ct-rep-1', { createdAt: -1, stageChangedAt: -1 }),
  makeLead('ld-13', 'LD-053', 'Vista Ridge Dental', '(775) 555-0503', 'Reno, NV', 'Commercial', 'Commercial LVT — operatories', 'new', 21000, 'Referral', 'ct-rep-1', { createdAt: -2, stageChangedAt: -1 }),
  makeLead('ld-14', 'LD-054', 'Marcy Templeton', '(775) 555-0504', 'Reno, NV', 'Retail', 'Hardwood — bedrooms', 'site_survey_scheduled', 7800, 'Google', 'ct-rep-2', { createdAt: -4, stageChangedAt: -1, siteSurveyDate: 2, followUpDate: 2 }),
  makeLead('ld-15', 'LD-055', 'Orchard House Senior Living', '(775) 555-0505', 'Reno, NV', 'Commercial', 'Carpet tile — corridors (3 floors)', 'site_survey_scheduled', 46500, 'Referral', 'ct-rep-1', { createdAt: -6, stageChangedAt: -1, siteSurveyDate: 4, followUpDate: 4 }),
  makeLead('ld-16', 'LD-056', 'Dev & Anjali Prasad', '(775) 555-0506', 'Reno, NV', 'Retail', 'LVP — great room + kitchen', 'send_quote', 9600, 'Home Show', 'ct-rep-2', { createdAt: -8, stageChangedAt: -1, siteSurveyDate: -2, followUpDate: 1, quoteCount: 1, sampleCount: 1 }),
  makeLead('ld-17', 'LD-057', 'Copper Canyon Coffee', '(775) 555-0507', 'Reno, NV', 'Commercial', 'LVT — dining floor', 'send_quote', 6400, 'Facebook', 'ct-rep-1', { createdAt: -7, stageChangedAt: -1, siteSurveyDate: -3, followUpDate: 2 }),
  makeLead('ld-18', 'LD-058', 'Bill Hargrove', '(775) 555-0508', 'Reno, NV', 'Retail', 'Laminate — rental refresh', 'follow_up', 3900, 'Google', 'ct-rep-2', { createdAt: -12, stageChangedAt: -1, followUpDate: 1 }),
  makeLead('ld-19', 'LD-059', 'Meadowbrook Villas HOA', '(775) 555-0509', 'Sparks, NV', 'Property Management', 'Carpet — common areas', 'follow_up', 28800, 'Referral', 'ct-rep-1', { createdAt: -10, stageChangedAt: -1, followUpDate: 3 }),
  makeLead('ld-20', 'LD-060', 'Janet Okafor', '(775) 555-0510', 'Sparks, NV', 'Retail', 'LVP — kitchen + baths', 'approved', 8900, 'Referral', 'ct-rep-2', { createdAt: -5, stageChangedAt: -1, followUpDate: 1 }),
];

/**
 * Leads the board's autoplay feeds in as "new lead arrived", in order. Their
 * numbers continue the seed (LD-061…LD-068): bump `counters.lead` by one per
 * arrival (nextLeadNumber) to stay in step.
 */
export const incomingLeads: Lead[] = [
  makeLead('ld-21', 'LD-061', 'Priya & Sam Natarajan', '(775) 555-0511', 'Reno, NV', 'Retail', 'Tile — two baths', 'new', 7400, 'Website', 'ct-rep-2', { createdAt: 0, stageChangedAt: 0 }),
  makeLead('ld-22', 'LD-062', 'Kestrel Ridge Physical Therapy', '(775) 555-0512', 'Carson City, NV', 'Commercial', 'Commercial LVT — clinic + hallway', 'new', 14800, 'Referral', 'ct-rep-1', { createdAt: 0, stageChangedAt: 0 }),
  makeLead('ld-23', 'LD-063', 'Gary & Lynn Halvorsen', '(775) 555-0513', 'Minden, NV', 'Retail', 'LVP — basement', 'new', 6100, 'Google', 'ct-rep-2', { createdAt: 0, stageChangedAt: 0 }),
  makeLead('ld-24', 'LD-064', 'Mesa Grove Townhomes HOA', '(775) 555-0514', 'Sparks, NV', 'Property Management', 'Carpet — clubhouse + halls', 'new', 11200, 'Phone', 'ct-rep-1', { createdAt: 0, stageChangedAt: 0 }),
  makeLead('ld-25', 'LD-065', 'Elena Ruiz', '(775) 555-0515', 'Gardnerville, NV', 'Retail', 'Hardwood — living + dining', 'new', 9800, 'Home Show', 'ct-rep-2', { createdAt: 0, stageChangedAt: 0 }),
  makeLead('ld-26', 'LD-066', 'Lantern Peak Builders', '(775) 555-0516', 'Carson City, NV', 'Builder', 'New construction — LVP package', 'new', 23500, 'Referral', 'ct-rep-1', { createdAt: 0, stageChangedAt: 0 }),
  makeLead('ld-27', 'LD-067', 'Marcus Bell', '(775) 555-0517', 'Reno, NV', 'Retail', 'Carpet — stairs + hall', 'new', 3200, 'Facebook', 'ct-rep-2', { createdAt: 0, stageChangedAt: 0 }),
  makeLead('ld-28', 'LD-068', 'Basalt & Pine Café', '(775) 555-0518', 'Minden, NV', 'Commercial', 'LVT — café floor', 'new', 8700, 'Google', 'ct-rep-1', { createdAt: 0, stageChangedAt: 0 }),
];

// --------------------------------------------------------------- counters --

/** Highest numbers in the demo seed: LD-060, QT-329, WO-327, IN-324. */
const SEED_COUNTERS: DocCounters = { lead: 60, quote: 329, job: 327, invoice: 324 };

const quoteNo = nextQuoteNumber(SEED_COUNTERS);

/**
 * Board counters as of DEMO_TODAY (next number = counter + 1, as the app
 * does): the next lead is LD-061, the next quote QT-331 (QT-330 is LD-056's,
 * drafted today), the next lead approved on the board makes WO-328 + IN-325.
 * Approving QT-330 itself makes WO-330 / IN-330 — the app numbers a quote's
 * work order and invoice after the quote (main L10293), not the counters.
 */
export const counters: DocCounters = quoteNo.counters;

// ----------------------------------------------------------- the thread ---

const D = demoDate;
const JOB_AREA_SQFT = 912;

function matLine(p: Product, quantity: number | '', extra: Partial<QuoteMaterial> = {}): QuoteMaterial {
  return {
    name: p.name, matNum: p.matNum, quantity, retailPrice: p.retailPrice, companyCost: p.companyCost,
    purchaseUOM: p.purchaseUOM, costUOM: p.costUOM, coverageUOM: p.costUOM, coveragePerUOM: p.coverage,
    ...(p.rollWidth ? { rollWidth: p.rollWidth } : {}),
    ...extra,
  };
}
function labLine(l: LaborItem, quantity: number | ''): QuoteLabor {
  return { name: l.name, ...(l.description ? { description: l.description } : {}), uom: l.uom, quantity, retailPrice: l.retailPrice, companyCost: l.companyCost };
}

// Section 1 — the floor itself, Good / Better / Best. Measured at 912 SqFt and
// applied with "apply job area", which snaps each to whole cartons.
const tiers = [product('p-lvp-good'), product('p-lvp-better'), product('p-hw-best')];
const floorApply = applyArea(JOB_AREA_SQFT, 'SqFt', tiers.map((p) => matLine(p, '')), [])!;
const floorSection: QuoteSection = {
  title: 'Great room + kitchen — LVP',
  kind: 'pickOne',
  chosenRowKey: null,
  materials: tiers.map((p, i) => matLine(p, floorApply.materialQty[i] ?? '')),
  labors: [],
};

// Section 2 — install & prep. Base is typed in linear feet; the 912 SqFt area
// is applied to the section's SqFt labor.
const base = matLine(product('p-base-325'), 180);
const installLabor = [labLine(laborItem('l-lvp-install'), ''), labLine(laborItem('l-demo-carpet'), '')];
const installApply = applyArea(JOB_AREA_SQFT, 'SqFt', [base], installLabor)!;
const installSection: QuoteSection = {
  title: 'Install & prep',
  kind: 'required',
  materials: [base],
  labors: installLabor.map((l, i) => ({ ...l, quantity: installApply.laborQty[i] ?? l.quantity })),
};

// Section 3 — optional stair carpet: a 12' roll cut 14' 6" long → SqYd.
const STAIR_CUT = { widthFt: 12, lengthFt: 14, lengthIn: 6 } as const;
const stairCut = sqYdFromLength(STAIR_CUT.lengthFt, STAIR_CUT.lengthIn, STAIR_CUT.widthFt)!;
const stairsSection: QuoteSection = {
  title: 'Stairs — carpet',
  kind: 'optional',
  materials: [
    matLine(product('p-carpet-sandbar'), stairCut.quantity, { lengthFt: STAIR_CUT.lengthFt, lengthIn: STAIR_CUT.lengthIn }),
    matLine(product('p-pad-8lb'), stairCut.quantity),
  ],
  labors: [labLine(laborItem('l-stair'), 13)],
};

const sections: QuoteSection[] = [floorSection, installSection, stairsSection];
const tax = getTaxRateFromAddress('Reno, NV') ?? DEFAULT_TAX;
const PAYMENT_TERMS = DEFAULT_PAYMENT_TERMS[5]; // '50% Deposit / 50% on Completion'
const DOWN_PAYMENT_PCT = 50;

/** What the Prasads clicked before "Approve": Better, plus the stairs. */
const selection: QuoteSelection = { pickOne: { 0: 'mat-1' }, optional: [2] };

const quoteMoney = { sections, taxRate: tax.rate, taxExempt: false };
const totalsAtSend = computeQuoteTotals(quoteMoney);
const totals = computeQuoteTotals(quoteMoney, selection);

/** "Round Labor Up?" as it fires when floor and labor share a section (Good at 912 → 927.03). */
const roundLaborExample = applyArea(JOB_AREA_SQFT, 'SqFt', [matLine(tiers[0]!, '')], [labLine(laborItem('l-lvp-install'), '')])!;

const quote = {
  id: 'qt-330',
  number: quoteNo.number,
  leadId: 'ld-16',
  customerName: 'Dev & Anjali Prasad',
  salesRepId: 'ct-rep-2',
  /** Final state. On DEMO_TODAY the quote is "sent" (LD-056 sits in Send Quote on the board). */
  status: 'approved' as const,
  history: [
    { status: 'draft' as const, date: D(0) },
    { status: 'sent' as const, date: D(0) },
    { status: 'approved' as const, date: D(1) },
  ],
  createdAt: D(0),
  sentAt: D(0),
  approvedAt: D(1),
  expirationDate: D(20),
  siteCity: 'Reno, NV',
  taxRate: tax.rate,
  taxCounty: tax.label,
  taxExempt: false,
  paymentTerms: PAYMENT_TERMS,
  downPaymentPct: DOWN_PAYMENT_PCT,
  jobArea: { value: JOB_AREA_SQFT, uom: 'SqFt' as const },
  stairCut: { ...STAIR_CUT, sqyd: stairCut.quantity },
  sections,
  /** "Apply job area" on section 1 and section 2 — the app's toasts included. */
  measure: { floor: floorApply, install: installApply },
  /** Carton hints per tier, e.g. "39 Cartons = 927.03 SqFt". */
  cartonHints: floorSection.materials.map((m) => cartonHint(m)),
  roundLaborExample,
  /** As sent: default pick (Good), stairs not added. */
  totalsAtSend,
  depositAtSend: quoteDeposit(totalsAtSend, DOWN_PAYMENT_PCT),
  /** The customer's picks at approval. */
  selection,
  totals,
  deposit: quoteDeposit(totals, DOWN_PAYMENT_PCT),
  depositLabel: depositLabel(quoteDeposit(totals, DOWN_PAYMENT_PCT)),
};

// Approval → WO-330 + IN-330 (numbered after the quote).
const approval = approveQuote(
  { number: quote.number, sections, taxRate: tax.rate, taxExempt: false, paymentTerms: PAYMENT_TERMS, downPaymentPct: DOWN_PAYMENT_PCT },
  selection,
  counters,
  D(1),
);

// ---- invoice IN-330: deposit online by card, balance by check ----
const inv = approval.invoice;
const dueRow = { total: inv.total, down_payment_pct: inv.downPaymentPct, payment_terms: inv.paymentTerms, created_at: inv.createdAt };
const depositDue = computeDueNow({ ...dueRow, payments: [] }, demoNowMs(D(1)));
const CARD = 'Credit Card (Stripe)';
const depositPayment: Payment = {
  amount: depositDue.dueNow, method: CARD, date: D(1), note: 'Deposit — paid on the live invoice',
  processingFee: paymentFee({ amount: depositDue.dueNow, method: CARD }),
};
const finalDue = computeDueNow({ ...dueRow, payments: [depositPayment], final_invoice: true }, demoNowMs(D(9)));
const finalPayment: Payment = { amount: finalDue.dueNow, method: 'Check', date: D(9), note: 'Check 2318 — balance' };
const payments = [depositPayment, finalPayment];

const invoiceView = (paid: number, finalInvoice: boolean, at: ISODate) =>
  dueNowView({ total: inv.total, paid, terms: inv.paymentTerms, downPaymentPct: inv.downPaymentPct, finalInvoice, createdAt: inv.createdAt }, demoNowMs(at));

const invoice = {
  id: 'in-330',
  ...inv,
  jobId: 'wo-330',
  quoteId: quote.id,
  customerName: quote.customerName,
  finalInvoice: true,
  payments,
  status: invoiceStatus(inv.total, payments),
  /** What the live invoice asks for at each point in the story. */
  dueNow: [
    { at: 'Approved', date: D(1), due: depositDue, view: invoiceView(0, false, D(1)), status: invoiceStatus(inv.total, []) },
    { at: 'Deposit paid', date: D(1), due: computeDueNow({ ...dueRow, payments: [depositPayment] }, demoNowMs(D(1))), view: invoiceView(depositPayment.amount, false, D(1)), status: invoiceStatus(inv.total, [depositPayment]) },
    { at: 'Marked final', date: D(8), due: computeDueNow({ ...dueRow, payments: [depositPayment], final_invoice: true }, demoNowMs(D(8))), view: invoiceView(depositPayment.amount, true, D(8)), status: invoiceStatus(inv.total, [depositPayment]) },
    { at: 'Paid in full', date: D(9), due: computeDueNow({ ...dueRow, payments, final_invoice: true }, demoNowMs(D(9))), view: invoiceView(depositPayment.amount + finalPayment.amount, true, D(9)), status: invoiceStatus(inv.total, payments) },
  ],
};

// ---- work order WO-330: every stage, driven by the app's transitions ----
const INSTALL_DATE = D(7);
const INSTALL_END = D(8);
const woEvents: Array<{ date: ISODate; event: WoEvent; note: string }> = [
  { date: D(1), event: { type: 'materialsOrdered', allOrdered: true, scheduledDate: null }, note: 'JPO-1193…JPO-1196 marked ordered' },
  { date: D(2), event: { type: 'schedule', date: INSTALL_DATE, end: INSTALL_END, installer: 'ct-ins-1' }, note: 'Install booked with Ruben Ortiz, 2 days' },
  { date: D(7), event: { type: 'start' }, note: 'Crew on site' },
  { date: D(9), event: { type: 'complete', anyInvoicePaid: false }, note: 'Install ended — moved to Final Invoice' },
  { date: D(9), event: { type: 'invoicePaid' }, note: 'Balance paid by check' },
  { date: D(12), event: { type: 'markPaid' }, note: 'Ruben Ortiz paid out' },
];
const woHistory: Array<{ status: WoStatus; label: string; date: ISODate; note: string }> = [
  { status: 'order_materials', label: WO_LABELS.order_materials, date: D(1), note: approval.toast },
];
for (const e of woEvents) {
  const prev = woHistory[woHistory.length - 1]!.status;
  const next = woTransition(prev, e.event);
  if (next !== prev) woHistory.push({ status: next, label: WO_LABELS[next], date: e.date, note: e.note });
}

const woMaterials = approval.workOrder.materials.map((c) => c.line);
const woLabors = approval.workOrder.labors.map((c) => c.line);

const workOrder = {
  id: 'wo-330',
  number: approval.workOrder.number,
  quoteId: quote.id,
  invoiceId: invoice.id,
  customerName: quote.customerName,
  city: quote.siteCity,
  salesRepId: quote.salesRepId,
  installerId: 'ct-ins-1',
  scheduledDate: INSTALL_DATE,
  scheduledEndDate: INSTALL_END,
  createdAt: approval.workOrder.createdAt,
  materials: woMaterials,
  labors: woLabors,
  status: woHistory[woHistory.length - 1]!.status,
  history: woHistory,
};

// ---- job costing for WO-330: POs, freight, one supply run, the installer ----
const better = product('p-lvp-better');
const betterLine = woMaterials.find((m) => m.matNum === better.matNum)!;
const carpetLine = woMaterials.find((m) => m.matNum === 'RMAT-SANDBAR-12')!;
const padLine = woMaterials.find((m) => m.matNum === 'ACC-PAD8')!;
const BASE_STICKS = 12; // base ships in 16 ft lengths: 12 × 16 = 192 LF for a 180 LF run
const po = (number: string, vendor: string, p: Product, qty: number, note: string, freight = 0) => ({
  id: number.toLowerCase(), number, jobNumber: workOrder.number, vendor, productName: p.name, matNum: p.matNum, uom: p.costUOM, qty,
  cost: p.companyCost, totalCost: round2(qty * p.companyCost), freight, status: 'received' as const, orderedAt: D(1), receivedAt: D(5), note,
});
const pos = [
  po('JPO-1193', better.vendor, better, Number(betterLine.quantity), cartonHint(betterLine)?.text ?? ''),
  po('JPO-1194', 'Basin Floor Supply', product('p-base-325'), BASE_STICKS * 16, `${BASE_STICKS} × 16 ft lengths`, 45),
  po('JPO-1195', 'High Desert Carpet Supply', product('p-carpet-sandbar'), Number(carpetLine.quantity), `12' × 14' 6" cut`),
  po('JPO-1196', 'High Desert Carpet Supply', product('p-pad-8lb'), Number(padLine.quantity), 'Cut to the carpet'),
];
const transitionStrips = supplies[0];
const costEntries: Array<JobCostEntry & { date: ISODate; vendor?: string; contractorId?: string; contractorName?: string; method?: string; paidDate?: ISODate }> = [
  {
    number: 'JC-015', kind: 'supply', category: 'Supplies', description: transitionStrips.name, quantity: 3, unitCost: transitionStrips.unitCost,
    amount: round2(3 * transitionStrips.unitCost), paid: true, date: D(7), method: 'Card',
  },
  {
    number: 'JC-016', kind: 'contractor', category: 'Labor', description: 'Install — LVP, base + 13 stair steps (2 days)', amount: 1690, paid: true,
    date: D(8), paidDate: D(12), contractorId: 'ct-ins-1', contractorName: 'Ruben Ortiz', method: 'Check',
  },
];
const marisol = reps.find((r) => r.id === quote.salesRepId)!;
const finance = jobFinance({
  materials: woMaterials,
  labors: woLabors,
  invoices: [{ subtotal: invoice.subtotal, tax: invoice.tax, total: invoice.total, payments, status: invoice.status }],
  pos,
  costs: costEntries,
  reps: [{ name: marisol.name, rate: marisol.commissionRate }],
});

const jobCosts = {
  workOrderId: workOrder.id,
  pos,
  entries: costEntries,
  finance,
  variance: varianceView(finance.actual, finance.estimate),
};

/**
 * The story the site and the video tell, end to end:
 * LD-056 (Home Show) → QT-330 (Pick One + optional stairs, Washoe tax,
 * 50% deposit) → the customer approves online with Better + stairs → the
 * office clicks "Create WO & Invoice" → WO-330 / IN-330 → deposit by card,
 * install (start + end date), balance by check → job costing for WO-330.
 */
export const thread = {
  lead: leads.find((l) => l.number === 'LD-056')!,
  sample: { number: 'SC-0235', productName: better.name, checkedOutAt: D(-7), expectedReturn: D(0) },
  quote,
  approval: { date: D(1), toast: approval.toast, counters: { ...counters, ...approval.counters } },
  workOrder,
  invoice,
  jobCosts,
};
