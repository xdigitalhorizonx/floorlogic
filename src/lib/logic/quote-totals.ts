/**
 * Quote money: line totals, sections (required / optional / "Pick One"),
 * materials-only tax, margin, and what an approval hands to the work order
 * and invoice.
 *
 * Source: main L11321-11406 (`qbFastRecalc`), L13897-13913 (`_mqTotals`),
 * L13013-13024 (`saveQuoteDraft` stored totals), L23236 (`_computeTotalsData`
 * totals rows), L9944-9984 (Pick One row keys), L10016-10101
 * (`qbChosenSectionsAndRows`, `qbFilterChosenItems`) and L10263-10313
 * (`approveQuote`); public page q L1000-1046 and L1404-1557.
 *
 * Rules (all verified against main):
 * - Material line = qty × retail, blank qty counts as 0.
 * - Labor line = qty × retail, but a blank OR ZERO labor qty counts as 1
 *   (`Number(l.quantity)||1`, main L11364) — app quirk, kept.
 * - Required sections always count. Optional sections count only when the
 *   customer adds them. A "Pick One" section counts only its chosen row
 *   (default: its first material, else its first labor row).
 * - Tax = materials × rate (never labor); 0 when exempt.
 *   total = materials + labor + tax.
 * - Rounding follows the app's STORED totals and invoices (`_mqTotals`
 *   main L13912-13914, `approveQuote` main L10293): tax is rounded to the
 *   cent first, then added, so Subtotal + Tax always equals Total and the
 *   quote total equals the invoice total the approval creates. The builder
 *   header instead adds UNROUNDED tax and can print a total 1¢ off its own
 *   Subtotal + Tax rows (e.g. $9,825.98 + $593.52 shown as $10,419.51);
 *   `raw.total` keeps that builder value for parity tests.
 * - The builder and q.html also FORMAT unrounded sums (toLocaleString), which
 *   at a half-cent tie can print 1¢ below Math.round — the app's own stored
 *   totals round the other way. To reproduce those screens to the cent,
 *   format `raw.*`. The sample dataset is tie-free (tested).
 */
import { addDays, type ISODate } from './dates';
import { formatDocNumber, num, round2 } from './money';
import { DEFAULT_TAX, materialsTax, taxLabel } from './tax';

export type SectionKind = 'required' | 'optional' | 'pickOne';
export type RowKey = `mat-${number}` | `lab-${number}`;

export interface QuoteMaterial {
  name: string;
  matNum?: string;
  style?: string;
  quantity: number | '' | null;
  retailPrice: number;
  companyCost: number;
  purchaseUOM?: string;
  costUOM?: string;
  coverageUOM?: string;
  coveragePerUOM?: number;
  rollWidth?: number;
  lengthFt?: number;
  lengthIn?: number;
}

export interface QuoteLabor {
  name: string;
  description?: string;
  uom: string;
  quantity: number | '' | null;
  retailPrice: number;
  companyCost: number;
}

export interface QuoteSection {
  title: string;
  kind: SectionKind;
  materials: QuoteMaterial[];
  labors: QuoteLabor[];
  /** Pick One only: the row the shop pre-selected (main L9957 `chosenRowKey`). */
  chosenRowKey?: RowKey | null;
}

export interface QuoteMoneyInput {
  sections: readonly QuoteSection[];
  taxRate: number;
  taxExempt?: boolean;
}

/** What the customer has picked on the live quote. */
export interface QuotePicks {
  /** Section index → chosen row, for Pick One sections. */
  pickOne?: Readonly<Record<number, RowKey>>;
  /** Indexes of optional sections the customer added. */
  optional?: readonly number[];
}

// ---------------------------------------------------------------- lines ----

export function materialLineTotal(m: Pick<QuoteMaterial, 'quantity' | 'retailPrice'>): number {
  return num(m.quantity) * num(m.retailPrice);
}
export function materialLineCost(m: Pick<QuoteMaterial, 'quantity' | 'companyCost'>): number {
  return num(m.quantity) * num(m.companyCost);
}
/** Labor qty: blank or 0 reads as 1 (main L11364). */
export function laborQty(l: Pick<QuoteLabor, 'quantity'>): number {
  return num(l.quantity) || 1;
}
export function laborLineTotal(l: Pick<QuoteLabor, 'quantity' | 'retailPrice'>): number {
  return laborQty(l) * num(l.retailPrice);
}
export function laborLineCost(l: Pick<QuoteLabor, 'quantity' | 'companyCost'>): number {
  return laborQty(l) * num(l.companyCost);
}

// -------------------------------------------------------- Pick One rows ----

/** Default Pick One row: first material, else first labor (main L9944). */
export function defaultRowKey(section: Pick<QuoteSection, 'materials' | 'labors'>): RowKey | null {
  if (section.materials.length) return 'mat-0';
  if (section.labors.length) return 'lab-0';
  return null;
}

function rowExists(section: QuoteSection, key: RowKey): boolean {
  const m = /^(mat|lab)-(\d+)$/.exec(key);
  if (!m) return false;
  const i = Number(m[2]);
  return m[1] === 'mat' ? i < section.materials.length : i < section.labors.length;
}

/**
 * The live row of a Pick One section: the customer's pick, else the shop's
 * pre-selected row, else the default. A key pointing at a missing row falls
 * back to the default (q.html does this, q L1053; the builder would count
 * nothing in that case).
 */
export function chosenRowKey(section: QuoteSection, sectionIndex: number, picks?: QuotePicks): RowKey | null {
  if (section.kind !== 'pickOne') return null;
  for (const key of [picks?.pickOne?.[sectionIndex], section.chosenRowKey]) {
    if (key && rowExists(section, key)) return key;
  }
  return defaultRowKey(section);
}

// ---------------------------------------------------------------- totals ---

export interface QuoteRowTotal {
  key: RowKey;
  name: string;
  total: number;
  cost: number;
  /** False only for the unchosen rows of a Pick One section. */
  included: boolean;
}

export interface QuoteSectionTotal {
  index: number;
  title: string;
  kind: SectionKind;
  /** Whether this section is inside the quote total right now. */
  counted: boolean;
  chosenRowKey: RowKey | null;
  /** Unrounded section figures, chosen rows only. */
  materials: number;
  labor: number;
  tax: number;
  total: number;
  rows: QuoteRowTotal[];
}

export interface QuoteFigures {
  materials: number;
  labor: number;
  subtotal: number;
  tax: number;
  total: number;
}

export interface QuoteTotals extends QuoteFigures {
  /** Unrounded figures as the builder holds them (raw.total uses unrounded tax). */
  raw: QuoteFigures;
  /**
   * The total the app stores on the invoice an approval creates: UNROUNDED
   * subtotal + tax in cents (main L10293). Deposits and "Due Now" are figured
   * from this, so use it (via `quoteDeposit`) for money the customer pays.
   */
  invoiceTotal: number;
  /** Company cost of everything counted (unrounded). */
  cost: { materials: number; labor: number; total: number };
  taxRate: number;
  taxExempt: boolean;
  /** "Tax (8.27%)" / "Tax (Exempt)". */
  taxLabel: string;
  sections: QuoteSectionTotal[];
  /** Builder's "if everything is added" total: counted + every optional section, with tax (main L11397), rounded. */
  totalIfAll: number;
  /** Site margin: (subtotal − cost) ÷ subtotal. Tax is NOT revenue. */
  margin: { profit: number; pct: number };
  /**
   * APP QUIRK: the quote builder's Margin row (main L23236) divides by the
   * grand total INCLUDING tax and counts the tax as profit. Kept for parity
   * tests only — the site shows `margin`.
   */
  appMargin: { profit: number; pct: number };
}

/** Totals for a quote as the customer currently has it picked. */
export function computeQuoteTotals(quote: QuoteMoneyInput, picks?: QuotePicks): QuoteTotals {
  const rate = num(quote.taxRate);
  const exempt = !!quote.taxExempt;
  const picked = new Set(picks?.optional ?? []);
  let mat = 0, lab = 0, matCost = 0, labCost = 0;

  const sections = quote.sections.map((s, index): QuoteSectionTotal => {
    const key = chosenRowKey(s, index, picks);
    const rows: QuoteRowTotal[] = [
      ...s.materials.map((m, i): QuoteRowTotal => ({
        key: `mat-${i}`, name: m.name, total: materialLineTotal(m), cost: materialLineCost(m),
        included: s.kind !== 'pickOne' || key === `mat-${i}`,
      })),
      ...s.labors.map((l, i): QuoteRowTotal => ({
        key: `lab-${i}`, name: l.name, total: laborLineTotal(l), cost: laborLineCost(l),
        included: s.kind !== 'pickOne' || key === `lab-${i}`,
      })),
    ];
    const counted = s.kind !== 'optional' || picked.has(index);
    let sm = 0, sl = 0;
    // Add line by line, in order, straight into the quote sums — the same
    // sequence of additions as the app's recalc, so the floats match exactly.
    for (const r of rows) {
      if (!r.included) continue;
      const isMat = r.key.startsWith('mat-');
      if (isMat) sm += r.total; else sl += r.total;
      if (!counted) continue;
      if (isMat) { mat += r.total; matCost += r.cost; } else { lab += r.total; labCost += r.cost; }
    }
    const tax = materialsTax(sm, rate, exempt);
    return { index, title: s.title, kind: s.kind, counted, chosenRowKey: key, materials: sm, labor: sl, tax, total: sm + sl + tax, rows };
  });

  const subtotal = mat + lab;
  const tax = materialsTax(mat, rate, exempt);
  const total = subtotal + tax;
  const taxCents = round2(tax);
  const cost = matCost + labCost;
  // Optional sections already picked are inside `total`; totalIfAll adds the rest.
  const unpickedOptional = sections.filter((s) => s.kind === 'optional' && !s.counted).reduce((a, s) => a + s.total, 0);
  const appProfit = total - cost;
  return {
    materials: round2(mat), labor: round2(lab), subtotal: round2(subtotal), tax: taxCents, total: round2(subtotal + taxCents),
    raw: { materials: mat, labor: lab, subtotal, tax, total },
    invoiceTotal: subtotal + taxCents,
    cost: { materials: matCost, labor: labCost, total: cost },
    taxRate: rate, taxExempt: exempt, taxLabel: taxLabel(rate, exempt),
    sections,
    totalIfAll: round2(total + unpickedOptional),
    margin: { profit: subtotal - cost, pct: subtotal > 0 ? ((subtotal - cost) / subtotal) * 100 : 0 },
    appMargin: { profit: appProfit, pct: total > 0 ? (appProfit / total) * 100 : 0 },
  };
}

/**
 * Totals the app STORES when a selection is applied or quotes are merged
 * (`_mqTotals`, main L13897): optional sections stay out, tax rounded first,
 * then total = round2(subtotal + tax).
 */
export function storedQuoteTotals(quote: QuoteMoneyInput): { subtotal: number; tax: number; total: number } {
  const t = computeQuoteTotals(quote);
  return { subtotal: t.subtotal, tax: t.tax, total: t.total };
}

// ------------------------------------------------------------- numbering ---

export interface DocCounters {
  lead: number;
  quote: number;
  job: number;
  invoice: number;
}

/** New quote number: counter + 1, padded (main L13024). */
export function nextQuoteNumber<C extends Pick<DocCounters, 'quote'>>(counters: C): { number: string; counters: C } {
  const n = counters.quote + 1;
  return { number: formatDocNumber('QT-', n), counters: { ...counters, quote: n } };
}

// -------------------------------------------------------------- approval ---

/** What the customer submitted with "Approve" on the live quote (q L748-770). */
export interface QuoteSelection {
  pickOne?: Readonly<Record<number, RowKey>>;
  optional?: readonly number[];
}

export interface ChosenLine<T> {
  sectionIndex: number;
  line: T;
}

/**
 * Which lines go to the work order + invoice (`qbChosenSectionsAndRows` +
 * `qbFilterChosenItems`, main L10016-10101). Exactly the app's rules:
 * - required sections: always;
 * - optional sections: only when picked — but when NO selection was captured
 *   at all (the shop approved by hand) every optional section goes in;
 * - Pick One: only the picked row — and with no pick captured, EVERY row of
 *   the section goes in (the app leaves it to the office to delete extras).
 */
export function chosenItems(
  sections: readonly QuoteSection[],
  selection: QuoteSelection | null,
): { materials: ChosenLine<QuoteMaterial>[]; labors: ChosenLine<QuoteLabor>[] } {
  const optional = new Set(selection?.optional ?? []);
  const mc = selection?.pickOne ?? {};
  const noSel = !selection || (optional.size === 0 && Object.keys(mc).length === 0);
  const materials: ChosenLine<QuoteMaterial>[] = [];
  const labors: ChosenLine<QuoteLabor>[] = [];
  // APP ORDER QUIRK (main L10081-10085): sections are visited in the order
  // they first appear in the flat materials list, then the labor list, then
  // the rest — so a section with labor but no materials is visited after
  // every section that has materials, and its labor lands later on the work
  // order and invoice.
  const order: number[] = [];
  const visit = (i: number) => { if (!order.includes(i)) order.push(i); };
  sections.forEach((s, i) => { if (s.materials.length) visit(i); });
  sections.forEach((s, i) => { if (s.labors.length) visit(i); });
  sections.forEach((_, i) => visit(i));
  order.forEach((sectionIndex) => {
    const s = sections[sectionIndex]!;
    if (s.kind === 'optional' && !(optional.has(sectionIndex) || noSel)) return;
    const key = s.kind === 'pickOne' ? mc[sectionIndex] : undefined;
    if (key) {
      const m = /^(mat|lab)-(\d+)$/.exec(key);
      if (!m) return;
      const i = Number(m[2]);
      if (m[1] === 'mat' && s.materials[i]) materials.push({ sectionIndex, line: s.materials[i]! });
      if (m[1] === 'lab' && s.labors[i]) labors.push({ sectionIndex, line: s.labors[i]! });
      return;
    }
    s.materials.forEach((line) => materials.push({ sectionIndex, line }));
    s.labors.forEach((line) => labors.push({ sectionIndex, line }));
  });
  return { materials, labors };
}

export interface InvoiceLine {
  desc: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface QuoteForApproval extends QuoteMoneyInput {
  number: string;
  paymentTerms?: string;
  downPaymentPct?: number | null;
}

export interface ApprovedQuote {
  workOrder: {
    number: string;
    status: 'order_materials';
    materials: ChosenLine<QuoteMaterial>[];
    labors: ChosenLine<QuoteLabor>[];
    createdAt: ISODate;
  };
  invoice: {
    number: string;
    status: 'unpaid';
    lines: InvoiceLine[];
    /** Rounded to cents; `raw` keeps the app's unrounded figures. */
    subtotal: number;
    tax: number;
    total: number;
    raw: { subtotal: number; materials: number; tax: number; total: number };
    taxRate: number;
    paymentTerms: string;
    downPaymentPct: number;
    createdAt: ISODate;
    dueDate: ISODate;
  };
  counters: { job: number; invoice: number };
  toast: string;
}

/**
 * `approveQuote` (main L10263-10313), money and numbering only:
 * - WO and invoice numbers come from the QUOTE number: QT-330 → WO-330 / IN-330,
 *   and the job/invoice counters move up to at least 330. (A lead approved
 *   from the board uses the counters instead — see lead-pipeline.ts — so the
 *   two schemes can in theory hand out the same number; app behaviour.)
 * - Invoice: subtotal = Σ line amounts, tax = round2(materials × rate),
 *   total = subtotal + tax; due 30 days after creation.
 *   The app does not look at taxExempt here — an exempt quote already carries
 *   rate 0 (main L12667). The site applies the exempt flag explicitly.
 */
export function approveQuote(
  quote: QuoteForApproval,
  selection: QuoteSelection | null,
  counters: Pick<DocCounters, 'job' | 'invoice'>,
  today: ISODate,
): ApprovedQuote {
  const suffix = String(quote.number).replace('QT-', '');
  const n = parseInt(suffix, 10) || 0;
  const woNumber = 'WO-' + suffix;
  const inNumber = 'IN-' + suffix;
  const chosen = chosenItems(quote.sections, selection);
  const lines: InvoiceLine[] = [];
  let matSub = 0;
  let labSub = 0;
  for (const { line: m } of chosen.materials) {
    // The app uses the row's qty × retail (its `totalPrice`) as the amount.
    const amount = materialLineTotal(m);
    matSub += amount;
    lines.push({ desc: [m.name, m.style].filter(Boolean).join(' | ') || 'Material', qty: num(m.quantity), rate: num(m.retailPrice), amount });
  }
  for (const { line: l } of chosen.labors) {
    const amount = laborLineTotal(l);
    labSub += amount;
    lines.push({ desc: (l.name || 'Labor') + (l.description ? ' | ' + l.description : ''), qty: laborQty(l), rate: num(l.retailPrice), amount });
  }
  // Right after creating the invoice the app re-totals it as Σ materials +
  // Σ labor (`snapInv`, main L10293) — that is the stored subtotal.
  const sub = matSub + labSub;
  const rate = quote.taxExempt ? 0 : (quote.taxRate ?? DEFAULT_TAX.rate);
  const tax = round2(matSub * rate);
  const total = sub + tax;
  return {
    workOrder: { number: woNumber, status: 'order_materials', materials: chosen.materials, labors: chosen.labors, createdAt: today },
    invoice: {
      number: inNumber,
      status: 'unpaid',
      lines,
      subtotal: round2(sub),
      tax,
      total: round2(total),
      raw: { subtotal: sub, materials: matSub, tax, total },
      taxRate: rate,
      paymentTerms: quote.paymentTerms || '',
      downPaymentPct: quote.downPaymentPct != null ? quote.downPaymentPct : 50,
      createdAt: today,
      dueDate: addDays(today, 30),
    },
    counters: { job: Math.max(counters.job, n), invoice: Math.max(counters.invoice, n) },
    toast: `Quote ${quote.number} approved! Work Order ${woNumber} & Invoice ${inNumber} created.`,
  };
}
