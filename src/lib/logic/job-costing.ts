/**
 * Job costing: estimate vs actual by bucket, card fees, revenue (tax kept
 * out), commission, profit, margin, the payout queue — and what Privacy Mode
 * hides.
 *
 * Source (current app, demo main): main L29175-29205 card fees; L29236-29343
 * job-cost kinds, amounts, buckets, rollup; L29357 `_jobRepShares`; L29379
 * `_jobFinance`; L22550 `_jpoTotal`; L31872-31873 estimate/actual; L31914
 * `_jcPaidInFull`; L31925 `_jcCommissionOwed`; L32021 list Variance card;
 * L32132 bucket Δ cells; L32171-32177 detail metric bar; L3592 + L4227
 * Privacy Mode.
 *
 * Changed since the August app:
 * - a PO costs the job its goods PLUS its estimated freight (`poTotal`);
 * - a bill (payable) tied to a CANCELLED PO counts on its own — while the PO
 *   is live the bill mirrors it and is left out, so nothing counts twice;
 * - Margin is taken BEFORE the sales commission (preCommProfit ÷ revenue);
 *   Profit stays the bottom line after commission;
 * - the job's own page shows a seven-figure bar whose Variance reads
 *   "+$x over" / "−$x under" (`jobCostingMetrics`), and the Job Costing list
 *   opens on a payout queue: paid in full AND commission still owed
 *   (`jobPaidInFull`, `commissionOwed`).
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

/** The app's default processor rate (main L29175). */
export const CARD_FEE: CardFeeRate = { pct: 2.9, fixed: 0.3 };

export interface Payment {
  amount: number;
  method?: string;
  date?: string;
  /** Fee stamped when the payment was taken; wins over the calculation. */
  processingFee?: number | null;
  note?: string;
}

/** Card or Stripe payments carry a fee (main L29183). */
export function isCardPayment(method: string | null | undefined): boolean {
  return /card|stripe/i.test(String(method || ''));
}

/** `_payProcessingFee` (main L29196): stamped fee, else round2(amt × pct% + fixed) on card payments. */
export function paymentFee(pay: Payment, rate: CardFeeRate = CARD_FEE): number {
  if (pay.processingFee != null && Number.isFinite(Number(pay.processingFee))) return Math.max(0, Number(pay.processingFee));
  if (!isCardPayment(pay.method)) return 0;
  const amt = num(pay.amount);
  if (amt <= 0) return 0;
  return round2((amt * rate.pct) / 100 + rate.fixed);
}

// ------------------------------------------------------- job cost entries --

export type JobCostKind = 'contractor' | 'receipt' | 'freight' | 'supply' | 'other';

/** `JC_KINDS` (main L29236) */
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

/** `_jcAmount` (main L29303): the amount, else qty × unit cost. */
export function jobCostAmount(c: JobCostEntry): number {
  const amt = Number(c.amount);
  if (Number.isFinite(amt) && amt !== 0) return amt;
  return num(c.quantity) * num(c.unitCost);
}

/** `_jcBucket` (main L29312). Freight answers to materials. */
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

/** `_jcRollup` (main L29343), voided entries skipped. */
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
  /** Needed to tell which bills mirror this PO (a bill's `poId`). */
  id?: string;
  status?: string;
  /** qty × unit cost. */
  totalCost: number;
  /** Estimated freight on the PO (new since August) — counts toward materials cost. */
  freight?: number | null;
}

/** `_jpoTotal` (main L22550): what a PO costs the job — goods plus estimated freight. */
export function poTotal(p: Pick<JobPO, 'totalCost' | 'freight'> | null | undefined): number {
  return (Number(p && p.totalCost) || 0) + (Number(p && p.freight) || 0);
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
  /** Up to two reps split the commission evenly (main L29357). */
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
  /** Revenue − every cost, BEFORE the sales commission. */
  preCommProfit: number;
  /** The bottom line: preCommProfit − commission. */
  profit: number;
  /**
   * Percent of revenue, taken BEFORE commission (preCommProfit ÷ revenue) —
   * changed in the October app: margin measures how well the job was run,
   * and the commission is a share of that result. (August: profit ÷ revenue.)
   */
  margin: number;
  quotedProfit: number;
  /** matQuoted + laborQuoted (main L31872). */
  estimate: number;
  /** matCost + laborCost + otherCost + feeCost (main L31873). */
  actual: number;
  /** actual − estimate. */
  variance: number;
}

/** `_jobFinance` (main L29379) for one work order. */
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
  // the WHOLE retail × rate, labor included (main L29391).
  const woTax = num(input.woTax) || (num(input.woSubtotal) || retail) * num(input.taxRate);
  const tax = invs.length ? invTax : woTax;
  const invRevenue = invs.reduce((s, i) => s + (num(i.subtotal) || Math.max(0, num(i.total) - num(i.tax))), 0);
  const revenue = invs.length ? invRevenue : retail;
  const invTotal = invs.reduce((s, i) => s + num(i.total), 0);
  const laborQuoted = laborCost;
  const pos = (input.pos ?? []).filter((p) => p.status !== 'cancelled');
  const poCost = pos.reduce((s, p) => s + poTotal(p), 0);
  const costs = rollupJobCosts(input.costs ?? []);
  // A PO-sourced bill mirrors its PO (already counted above) — until that PO is
  // cancelled: then the bill is the only record of the money and counts on its own.
  const cancelledPOIds = new Set((input.pos ?? []).filter((p) => p.status === 'cancelled' && p.id).map((p) => p.id));
  const mirrorsPO = (p: Payable) => (p.poId ? !cancelledPOIds.has(p.poId) : p.source === 'po');
  const jobPayables = (input.payables ?? []).filter(
    (p) => p.status !== 'void' && !mirrorsPO(p) && p.source !== 'commission' && (p.category || '') !== 'Commission',
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
    commission, reps, preCommProfit, profit, margin: revenue > 0 ? (preCommProfit / revenue) * 100 : 0,
    quotedProfit: retail - matQuoted - laborQuoted,
    estimate, actual, variance: actual - estimate,
  };
}

// ------------------------------------------------------------ payout queue --

const PIPELINE_ORDER = ['order_materials', 'materials_ordered', 'ready_to_schedule', 'scheduled', 'in_progress', 'final_invoice', 'ready_to_be_paid'];

/**
 * `_jcGroupStatus` (main L29538): a split job is as far along as its LEAST
 * advanced sheet (statuses off the pipeline — paid, complete, on hold —
 * count as furthest along).
 */
export function groupStatus(statuses: readonly string[]): string | undefined {
  const rank = (st: string) => {
    const i = PIPELINE_ORDER.indexOf(st);
    return i < 0 ? 99 : i;
  };
  return statuses.slice().sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * `_jcPaidInFull` (main L31914): with an invoice, the balance is the test
 * (≤ half a cent outstanding); with none, the stage someone moved it to
 * (Ready to be Paid, Paid or Complete).
 */
export function jobPaidInFull(fin: Pick<JobFinance, 'invTotal' | 'outstanding'>, memberStatuses: readonly string[]): boolean {
  if (fin.invTotal > 0.005) return fin.outstanding <= 0.005;
  return ['ready_to_be_paid', 'paid', 'complete'].includes(groupStatus(memberStatuses) as string);
}

/**
 * `_jcCommissionOwed` (main L31925): there is commission (> ½¢) and some
 * sheet with a rep on a non-zero rate has not been stamped commission-paid.
 */
export function commissionOwed(
  commission: number,
  sheets: ReadonlyArray<{ commissionPaidAt?: string | null; repRates: readonly (number | string | null | undefined)[] }>,
): boolean {
  if (!(commission > 0.005)) return false;
  return sheets.some((p) => !p.commissionPaidAt && p.repRates.some((r) => (Number(r) || 0) > 0));
}

/** Job Costing's list scopes (`_jcScopeLabel`, main L31907); the payout queue is the default. */
export const JC_SCOPES = [
  { key: 'payout', label: 'Commission due' },
  { key: 'paidfull', label: 'Paid in full' },
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Paid / Complete' },
  { key: 'costed', label: 'Has costs' },
  { key: 'all', label: 'All' },
] as const;

// ------------------------------------------------------- variance display --

export interface VarianceView {
  amount: number;
  /** "+$291.04" (no sign when under) */
  text: string;
  label: 'over estimate' | 'under estimate';
  tone: 'red' | 'green';
}

/**
 * The Variance card on the Job Costing LIST (`_jcFullStats`, main L32021):
 * "+$189.13 over estimate" in red, "$83.79 under estimate" in green — label
 * and colour both flip at > 0 (no sign on an under). August's per-job card
 * coloured at > 0.005; the job's own page now shows `jobCostingMetrics`.
 */
export function varianceView(actual: number, estimate: number): VarianceView {
  const v = actual - estimate;
  return {
    amount: v,
    text: (v > 0 ? '+' : '') + fmtMoney(Math.abs(v)),
    label: v > 0 ? 'over estimate' : 'under estimate',
    tone: v > 0 ? 'red' : 'green',
  };
}

export interface JobMetric {
  label: 'Revenue' | 'Estimated' | 'Actual' | 'Variance' | 'Margin' | 'Profit' | 'Sales Tax';
  /** As printed. Margin and Profit sit in `.qb-private` in the app (blurred in Privacy Mode). */
  value: string;
  tone: 'blue' | 'red' | 'green' | 'amber' | null;
  note: string;
  title: string;
  private: boolean;
}

/**
 * The seven-figure bar on a job's Job Costing page (main L32171-32177, new):
 * Revenue · Estimated · Actual · Variance ("+$189.13 over" / "−$36.00 under" /
 * "$0.00 under") · Margin (before commission) · Profit (after commission) ·
 * Sales Tax. `recorded` = costs recorded (+ bills entered in Accounting).
 */
export function jobCostingMetrics(
  fin: Pick<JobFinance, 'revenue' | 'revSource' | 'tax' | 'taxSource' | 'margin' | 'profit' | 'estimate' | 'actual'>,
  recorded: { count: number; bills?: number },
  memberCount = 1,
): JobMetric[] {
  const est = fin.estimate;
  const act = fin.actual;
  const v = act - est;
  const n = recorded.count;
  return [
    {
      label: 'Revenue', value: fmtMoney(fin.revenue), tone: 'blue', note: fin.revSource === 'invoice' ? 'invoiced' : 'quoted', private: false,
      title: fin.revSource === 'invoice' ? 'From the invoices on this job, tax excluded' : "The work order's quoted retail — nothing invoiced yet",
    },
    { label: 'Estimated', value: fmtMoney(est), tone: null, note: 'quoted cost', private: false, title: 'Quoted materials + labor' + (memberCount > 1 ? ` across ${memberCount} work orders` : '') },
    {
      label: 'Actual', value: fmtMoney(act), tone: null, note: n + ' recorded', private: false,
      title: n + ' recorded cost' + (n === 1 ? '' : 's') + (recorded.bills ? ` · ${recorded.bills} entered in Accounting` : ''),
    },
    {
      label: 'Variance', value: (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + fmtMoney(Math.abs(v)), tone: v > 0.005 ? 'red' : 'green',
      note: v > 0.005 ? 'over' : 'under', private: false, title: 'Actual cost against the quote',
    },
    {
      label: 'Margin', value: fin.margin.toFixed(1) + '%', tone: fin.margin >= 0 ? 'blue' : 'red', note: 'before commission', private: true,
      title: 'Revenue less cost, before the sales commission — how well the job itself ran',
    },
    {
      label: 'Profit', value: fmtMoney(fin.profit), tone: fin.profit >= 0 ? 'green' : 'red', note: 'after commission', private: true,
      title: 'Revenue less cost and commission — the bottom line on this job',
    },
    {
      label: 'Sales Tax', value: fmtMoney(fin.tax), tone: 'amber', note: fin.taxSource === 'invoice' ? 'invoiced' : 'quoted', private: false,
      title: fin.taxSource === 'invoice' ? 'Invoiced and held for the state — never revenue' : 'Quoted on the work order — held for the state, never revenue',
    },
  ];
}

/** A bucket row’s Δ cell (`cmp`, main L32132, unchanged): "—" when no estimate or |Δ| < ½¢. */
export function bucketDelta(estimate: number | null, actual: number): { text: string; tone: 'danger' | 'success' | 'gray' } {
  if (estimate == null) return { text: '—', tone: 'gray' };
  const v = actual - estimate;
  if (Math.abs(v) < 0.005) return { text: '—', tone: 'gray' };
  return { text: (v > 0 ? '+' : '−') + fmtMoney(Math.abs(v)), tone: v > 0.005 ? 'danger' : 'success' };
}

// ----------------------------------------------------------- privacy mode --

/**
 * Privacy Mode (main L3592, toggle tooltip L4227, unchanged): everything marked
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
