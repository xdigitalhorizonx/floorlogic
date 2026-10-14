/**
 * Job costing: estimate vs actual by bucket, card fees, revenue (tax kept
 * out), commission, profit, margin — and what Privacy Mode hides.
 *
 * Source (main): L24517-24536 card fees; L24567-24625 job-cost kinds,
 * amounts, buckets, rollup; L24627-24647 `_jobRepShares`; L24649-24718
 * `_jobFinance`; L26416-26417 estimate/actual; L26455 + L26532 variance
 * cards; L26500 bucket Δ cells; L2989-2992 + L3621 Privacy Mode.
 *
 * NOTE (app quirk, not copied): the QUOTE builder's Margin row divides by a
 * grand total that includes sales tax (see quote-totals.ts `appMargin`). Job
 * costing — and the whole site — keeps tax out of revenue, as here.
 */
import { fmtMoney, num, round2 } from './money';

// ------------------------------------------------------------- card fees --

export interface CardFeeRate {
  /** Percent of the payment, e.g. 2.9 */
  pct: number;
  /** Fixed dollars per payment, e.g. 0.30 */
  fixed: number;
}

/** The app's default processor rate (main L24517). */
export const CARD_FEE: CardFeeRate = { pct: 2.9, fixed: 0.3 };

export interface Payment {
  amount: number;
  method?: string;
  date?: string;
  /** Fee stamped when the payment was taken; wins over the calculation. */
  processingFee?: number | null;
  note?: string;
}

/** Card or Stripe payments carry a fee (main L24525). */
export function isCardPayment(method: string | null | undefined): boolean {
  return /card|stripe/i.test(String(method || ''));
}

/** `_payProcessingFee` (main L24527): stamped fee, else round2(amt × pct% + fixed) on card payments. */
export function paymentFee(pay: Payment, rate: CardFeeRate = CARD_FEE): number {
  if (pay.processingFee != null && Number.isFinite(Number(pay.processingFee))) return Math.max(0, Number(pay.processingFee));
  if (!isCardPayment(pay.method)) return 0;
  const amt = num(pay.amount);
  if (amt <= 0) return 0;
  return round2((amt * rate.pct) / 100 + rate.fixed);
}

// ------------------------------------------------------- job cost entries --

export type JobCostKind = 'contractor' | 'receipt' | 'freight' | 'supply' | 'other';

/** main L24567 */
export const JOB_COST_KINDS: ReadonlyArray<{ key: JobCostKind; label: string; icon: string; cat: string }> = [
  { key: 'contractor', label: 'Contractor payment', icon: '👷', cat: 'Labor' },
  { key: 'receipt', label: 'Receipt / purchase', icon: '🧾', cat: 'Materials' },
  { key: 'freight', label: 'Freight / delivery', icon: '🚚', cat: 'Freight' },
  { key: 'supply', label: 'Misc supply item', icon: '🔩', cat: 'Supplies' },
  { key: 'other', label: 'Other cost', icon: '📎', cat: 'Job Costs' },
];

export interface JobCostEntry {
  number?: string;
  kind: JobCostKind;
  category?: string;
  description?: string;
  amount?: number | null;
  quantity?: number | null;
  unitCost?: number | null;
  paid?: boolean;
  status?: 'active' | 'void';
}

export type CostBucket = 'material' | 'labor' | 'supply' | 'other';

/** `_jcAmount` (main L24592): the amount, else qty × unit cost. */
export function jobCostAmount(c: JobCostEntry): number {
  const amt = Number(c.amount);
  if (Number.isFinite(amt) && amt !== 0) return amt;
  return num(c.quantity) * num(c.unitCost);
}

/** `_jcBucket` (main L24601). Freight answers to materials. */
export function jobCostBucket(c: Pick<JobCostEntry, 'kind' | 'category'>): CostBucket {
  if (c.kind === 'contractor') return 'labor';
  if (c.kind === 'supply') return 'supply';
  if (c.kind === 'freight') return 'material';
  const cat = String(c.category || '').toLowerCase();
  if (cat === 'materials' || cat === 'material' || cat === 'freight' || cat === 'delivery') return 'material';
  if (cat === 'labor' || cat === 'subcontractor') return 'labor';
  return 'other';
}

export interface CostRollup {
  labor: number;
  material: number;
  supply: number;
  other: number;
  total: number;
  paid: number;
  unpaid: number;
}

/** `_jcRollup` (main L24613), voided entries skipped. */
export function rollupJobCosts(costs: readonly JobCostEntry[]): CostRollup {
  const out: CostRollup = { labor: 0, material: 0, supply: 0, other: 0, total: 0, paid: 0, unpaid: 0 };
  for (const c of costs) {
    if (!c || c.status === 'void') continue;
    const amt = jobCostAmount(c);
    out[jobCostBucket(c)] += amt;
    out.total += amt;
    if (c.paid) out.paid += amt;
    else out.unpaid += amt;
  }
  return out;
}

// ------------------------------------------------------------ the finance --

export interface CostLine {
  quantity: number | '' | null;
  companyCost: number;
  retailPrice: number;
}

export interface CostInvoice {
  subtotal?: number | null;
  tax?: number | null;
  total: number;
  payments: Payment[];
  status?: string;
}

export interface JobPO {
  status?: string;
  totalCost: number;
}

export interface Payable {
  amount: number;
  category?: string;
  poId?: string | null;
  source?: string | null;
  status?: string;
}

export interface RepRate {
  name: string;
  /** Commission percent of the basis, e.g. 10 */
  rate: number;
}

export interface JobFinanceInput {
  materials: readonly CostLine[];
  labors: readonly CostLine[];
  invoices?: readonly CostInvoice[];
  pos?: readonly JobPO[];
  costs?: readonly JobCostEntry[];
  payables?: readonly Payable[];
  /** Up to two reps split the commission evenly (main L24627). */
  reps?: readonly RepRate[];
  commissionBasis?: 'profit' | 'revenue';
  /** Work order's own tax figures, used only before an invoice exists. */
  woTax?: number;
  woSubtotal?: number;
  taxRate?: number;
  cardFee?: CardFeeRate;
}

export interface JobFinance {
  /** Invoice subtotals (tax excluded); the quoted retail before any invoice. */
  revenue: number;
  revSource: 'invoice' | 'quoted';
  retail: number;
  /** Sales tax — tracked beside revenue, never inside it. */
  tax: number;
  taxSource: 'invoice' | 'quoted';
  invTotal: number;
  collected: number;
  outstanding: number;
  /** Estimate buckets (from the work order). */
  matQuoted: number;
  laborQuoted: number;
  /** Actual buckets — fall back to the estimate until something real is recorded. */
  matCost: number;
  matActual: boolean;
  poCost: number;
  laborCost: number;
  laborActual: boolean;
  /** Supplies & other — never estimated (shows "—" in the estimate column). */
  otherCost: number;
  feeCost: number;
  costs: CostRollup;
  commission: number;
  reps: Array<RepRate & { share: number; basisAmt: number; amount: number }>;
  profit: number;
  /** Percent, profit ÷ revenue. */
  margin: number;
  quotedProfit: number;
  /** matQuoted + laborQuoted (main L26416). */
  estimate: number;
  /** matCost + laborCost + otherCost + feeCost (main L26417). */
  actual: number;
  /** actual − estimate. */
  variance: number;
}

/** `_jobFinance` (main L24649-24718) for one work order. */
export function jobFinance(input: JobFinanceInput): JobFinance {
  const rate = input.cardFee ?? CARD_FEE;
  const invs = (input.invoices ?? []).filter((i) => i.status !== 'void');
  let matQuoted = 0, laborCost = 0, retail = 0;
  for (const m of input.materials) {
    const q = num(m.quantity);
    matQuoted += q * num(m.companyCost);
    retail += q * num(m.retailPrice);
  }
  for (const l of input.labors) {
    const q = num(l.quantity) || 1;
    laborCost += q * num(l.companyCost);
    retail += q * num(l.retailPrice);
  }
  const invTax = invs.reduce((s, i) => s + num(i.tax), 0);
  // APP QUIRK (kept): before an invoice exists the work-order tax estimate is
  // the WHOLE retail × rate, labor included (main L24661).
  const woTax = num(input.woTax) || (num(input.woSubtotal) || retail) * num(input.taxRate);
  const tax = invs.length ? invTax : woTax;
  const invRevenue = invs.reduce((s, i) => s + (num(i.subtotal) || Math.max(0, num(i.total) - num(i.tax))), 0);
  const revenue = invs.length ? invRevenue : retail;
  const invTotal = invs.reduce((s, i) => s + num(i.total), 0);
  const laborQuoted = laborCost;
  const pos = (input.pos ?? []).filter((p) => p.status !== 'cancelled');
  const poCost = pos.reduce((s, p) => s + num(p.totalCost), 0);
  const costs = rollupJobCosts(input.costs ?? []);
  const jobPayables = (input.payables ?? []).filter(
    (p) => p.status !== 'void' && !p.poId && p.source !== 'po' && p.source !== 'commission' && (p.category || '') !== 'Commission',
  );
  let matPayCost = 0, laborPayCost = 0, otherPayCost = 0;
  for (const p of jobPayables) {
    const b = jobCostBucket({ category: p.category || '', kind: 'other' });
    if (b === 'material') matPayCost += num(p.amount);
    else if (b === 'labor') laborPayCost += num(p.amount);
    else otherPayCost += num(p.amount);
  }
  const otherCost = otherPayCost + costs.supply + costs.other;
  const feeCost = invs.reduce((s, i) => s + i.payments.reduce((a, p) => a + paymentFee(p, rate), 0), 0);
  const matActual = pos.length > 0 || costs.material > 0 || matPayCost > 0;
  const matCost = matActual ? poCost + costs.material + matPayCost : matQuoted;
  const laborActual = costs.labor > 0 || laborPayCost > 0;
  if (laborActual) laborCost = costs.labor + laborPayCost;
  const preCommProfit = revenue - matCost - laborCost - otherCost - feeCost;
  const basisAmt = input.commissionBasis === 'revenue' ? revenue : preCommProfit;
  const repList = input.reps ?? [];
  const share = repList.length ? 1 / repList.length : 0;
  const reps = repList.map((r) => ({ ...r, share, basisAmt: basisAmt * share, amount: Math.max(0, basisAmt * share * (r.rate / 100)) }));
  const commission = reps.reduce((s, r) => s + r.amount, 0);
  const profit = preCommProfit - commission;
  const collected = invs.reduce((s, i) => s + i.payments.reduce((a, p) => a + num(p.amount), 0), 0);
  const estimate = matQuoted + laborQuoted;
  const actual = matCost + laborCost + otherCost + feeCost;
  return {
    revenue, revSource: invs.length ? 'invoice' : 'quoted', retail, tax, taxSource: invs.length ? 'invoice' : 'quoted',
    invTotal, collected, outstanding: Math.max(0, invTotal - collected),
    matQuoted, laborQuoted, matCost, matActual, poCost, laborCost, laborActual, otherCost, feeCost, costs,
    commission, reps, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    quotedProfit: retail - matQuoted - laborQuoted,
    estimate, actual, variance: actual - estimate,
  };
}

// ------------------------------------------------------- variance display --

export interface VarianceView {
  amount: number;
  /** "+$291.04" (no sign when under) */
  text: string;
  label: 'over estimate' | 'under estimate';
  tone: 'red' | 'green';
}

/**
 * The Variance stat card (main L26532): label flips at > 0, colour at
 * > 0.005 — so +$0.004 reads "over estimate" in green, as in the app.
 */
export function varianceView(actual: number, estimate: number): VarianceView {
  const v = actual - estimate;
  return {
    amount: v,
    text: (v > 0 ? '+' : '') + fmtMoney(Math.abs(v)),
    label: v > 0 ? 'over estimate' : 'under estimate',
    tone: v > 0.005 ? 'red' : 'green',
  };
}

/** A bucket row’s Δ cell (main L26500): "—" when no estimate or |Δ| < ½¢. */
export function bucketDelta(estimate: number | null, actual: number): { text: string; tone: 'danger' | 'success' | 'gray' } {
  if (estimate == null) return { text: '—', tone: 'gray' };
  const v = actual - estimate;
  if (Math.abs(v) < 0.005) return { text: '—', tone: 'gray' };
  return { text: (v > 0 ? '+' : '−') + fmtMoney(Math.abs(v)), tone: v > 0.005 ? 'danger' : 'success' };
}

// ----------------------------------------------------------- privacy mode --

/**
 * Privacy Mode (main L2989-2992, toggle tooltip L3621): everything marked
 * `.qb-private` is BLURRED (6px, hover to peek), not removed. In the app that
 * covers company cost on every line, the Margin row of every totals box, job
 * profit / margin, commissions, card fees and pipeline dollar values.
 */
export const PRIVACY_MODE = {
  tooltip: 'Privacy Mode — hides company cost, margins, and profit from view (handy when a customer is looking over your shoulder)',
  filter: 'blur(6px)',
  revealOnHover: true,
} as const;

export const PRIVATE_FIELDS = ['companyCost', 'lineCost', 'margin', 'profit', 'commission', 'cardFees', 'pipelineValue'] as const;
export type PrivateField = (typeof PRIVATE_FIELDS)[number];

export function isPrivateField(field: string): field is PrivateField {
  return (PRIVATE_FIELDS as readonly string[]).includes(field);
}
