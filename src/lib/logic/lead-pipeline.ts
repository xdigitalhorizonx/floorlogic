/**
 * Lead pipeline board: statuses, labels, colours, drag-and-drop rules, the
 * card's primary action, survey dates and approving a lead.
 *
 * Source (main): L6006 `LEAD_STATUSES`; L6510-6511 labels + colour names;
 * L7730-7733 stale/follow-up helpers; L7738-7743 `advanceLead`; L7750-7751
 * `kanbanDrop`; L7779-7805 `setLeadSurveyDate`; L7948 board columns (every
 * status but Lost); L7976-8038 `leadKbCardHTML`; L8044 column buckets;
 * L8139 `saveLead` numbering; L8201 `changeLeadStatus`; L8225 `approveLead`.
 */
import { addDays, daysBetween, fmtDate, type ISODate } from './dates';
import { formatDocNumber } from './money';
import { LEAD_STATUS_COLOR_NAMES, appHex, siteHex } from './status-colors';

export const LEAD_STATUSES = ['new', 'site_survey_scheduled', 'send_quote', 'follow_up', 'approved', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Columns on the board: every status except Lost (main L7948). */
export const BOARD_STATUSES = LEAD_STATUSES.filter((s): s is Exclude<LeadStatus, 'lost'> => s !== 'lost');

/** main L6510 (the legacy `quote_sent` alias also reads "Send Quote"). */
export const LEAD_LABELS: Readonly<Record<LeadStatus, string>> = {
  new: 'New',
  site_survey_scheduled: 'Site Survey Scheduled',
  send_quote: 'Send Quote',
  follow_up: 'Follow-up',
  approved: 'Approved',
  lost: 'Lost',
};

/** Column header colours the app uses (main L6511 names → main L11-13 hex). White text sits on these. */
export const LEAD_COLORS_APP: Readonly<Record<LeadStatus, string>> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s, appHex(LEAD_STATUS_COLOR_NAMES[s])]),
) as Record<LeadStatus, string>;

/** Same hues, darkened so white header text passes WCAG AA (≥ 4.5:1) — asserted in tests. */
export const LEAD_COLORS: Readonly<Record<LeadStatus, string>> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s, siteHex(LEAD_STATUS_COLOR_NAMES[s])]),
) as Record<LeadStatus, string>;

export type LeadType = 'Retail' | 'Commercial' | 'Property Management' | 'Builder' | 'Designer' | 'Realtor';

export interface Lead {
  id: string;
  /** "LD-056" */
  number: string;
  name: string;
  phone: string;
  email?: string;
  /** City only, e.g. "Reno, NV" — the site never shows street addresses. */
  city: string;
  type: LeadType;
  projectType: string;
  source: string;
  status: LeadStatus;
  estimatedValue: number;
  salesRepId: string;
  siteSurveyDate: ISODate | null;
  followUpDate: ISODate | null;
  createdAt: ISODate;
  stageChangedAt: ISODate;
  /** Days in the current stage, as of the sample's DEMO_TODAY. */
  stageAgeDays: number;
  quoteCount: number;
  sampleCount: number;
}

/**
 * The next status (main L7738 / L7983): the following entry in LEAD_STATUSES,
 * null for Lost or anything unknown. App quirk kept: Approved → Lost.
 */
export function nextStatus(status: string): LeadStatus | null {
  const idx = (LEAD_STATUSES as readonly string[]).indexOf(status);
  if (idx < 0 || idx >= LEAD_STATUSES.length - 1) return null;
  return LEAD_STATUSES[idx + 1]!;
}

/** "→ Follow-up" (main L8032). */
export function advanceLabel(next: LeadStatus): string {
  return `→ ${LEAD_LABELS[next]}`;
}
/** Tooltip on the advance button (main L8032). */
export function advanceTip(next: LeadStatus): string {
  return `Advance to ${LEAD_LABELS[next]}`;
}

export type CardAction =
  | { kind: 'surveyPicker'; tip: string }
  | { kind: 'none' }
  | { kind: 'advance'; to: LeadStatus; label: string; tip: string; approves: boolean };

/**
 * The primary action on a card (main L8024-8036):
 * - New: the site-survey date picker IS the next step (no advance button);
 * - Site Survey Scheduled: nothing — the survey date moves it;
 * - otherwise "→ {Next}"; advancing into Approved runs approveLead.
 * App quirk kept: an Approved card still left on the board offers "→ Lost"
 * (approveLead removes leads from the board, so only seeded leads hit this).
 */
export function cardPrimaryAction(lead: Pick<Lead, 'status'>): CardAction {
  if (lead.status === 'new') {
    return { kind: 'surveyPicker', tip: 'Pick a site-survey date — auto-moves this lead to Site Survey Scheduled' };
  }
  if (lead.status === 'site_survey_scheduled') return { kind: 'none' };
  const next = nextStatus(lead.status);
  if (!next) return { kind: 'none' };
  return { kind: 'advance', to: next, label: advanceLabel(next), tip: advanceTip(next), approves: next === 'approved' };
}

// ------------------------------------------------------------- drag & drop --

/** Toast when a card is dropped on Site Survey Scheduled without a date (main L7751). */
export const SURVEY_DATE_REQUIRED_TOAST = '📐 Set a site-survey date on the card first — that auto-moves it here.';

/** main L7751 */
export function approveConfirmText(lead: Pick<Lead, 'name'>): string {
  return `Move ${lead.name} to Approved? This will convert the lead to a customer and create a work order + invoice.`;
}
/** main L7751 */
export function lostConfirmText(lead: Pick<Lead, 'name'>): string {
  return `Mark ${lead.name} as Lost?`;
}

export type DropResult =
  | { ok: true; to: LeadStatus; confirm: string | null; approves: boolean }
  | { ok: false; reason: 'same-status' | 'needs-survey-date'; toast: string | null; toastKind: 'warning' | null };

/**
 * What happens when a card is dropped on a column (`kanbanDrop`, main L7750-7751):
 * same column → nothing; Site Survey Scheduled without a date → refused with
 * a warning toast; Approved → confirm, then approveLead; Lost → confirm;
 * anything else moves straight away.
 */
export function canDrop(lead: Pick<Lead, 'status' | 'siteSurveyDate' | 'name'>, to: LeadStatus): DropResult {
  if (lead.status === to) return { ok: false, reason: 'same-status', toast: null, toastKind: null };
  if (to === 'site_survey_scheduled' && !lead.siteSurveyDate) {
    return { ok: false, reason: 'needs-survey-date', toast: SURVEY_DATE_REQUIRED_TOAST, toastKind: 'warning' };
  }
  if (to === 'approved') return { ok: true, to, confirm: approveConfirmText(lead), approves: true };
  if (to === 'lost') return { ok: true, to, confirm: lostConfirmText(lead), approves: false };
  return { ok: true, to, confirm: null, approves: false };
}

/** `changeLeadStatus` (main L8201) for non-approval moves: new status, stage clock restarts. */
export function changeStatus<L extends Lead>(lead: L, to: LeadStatus, today: ISODate): L {
  return { ...lead, status: to, stageChangedAt: today, stageAgeDays: 0 };
}

// ------------------------------------------------------------- survey date --

/** Task the app creates for a survey (main L7802): "Site survey: Dev & Anjali Prasad". */
export function surveyTaskTitle(lead: Pick<Lead, 'name'>): string {
  return `Site survey: ${lead.name}`;
}
/** Task description (main L7802). The app puts the street address here; the site passes the city. */
export function surveyTaskDescription(address: string | null | undefined): string {
  return `Visit ${address || '(no address)'} to measure and assess the site.`;
}
/**
 * Toast after picking a survey date (main L7804):
 * "📐 Survey set for Oct 16, 2026 · Dev & Anjali Prasad → Site Survey Scheduled".
 * (The app shows the same words even when the lead is past that stage.)
 */
export function surveyToast(lead: Pick<Lead, 'name'>, iso: ISODate): string {
  return `📐 Survey set for ${fmtDate(iso)} · ${lead.name} → Site Survey Scheduled`;
}

export interface SurveyTask {
  title: string;
  description: string;
  priority: 'high';
  /** The app sets 5 pm on the survey day. */
  dueDate: ISODate;
}

export interface SurveyResult<L> {
  lead: L;
  toast: string | null;
  task: SurveyTask | null;
}

/**
 * `setLeadSurveyDate` (main L7779-7805). Setting a date on a New (or already
 * scheduled) lead moves it to Site Survey Scheduled and restarts its stage
 * clock; other stages keep their status but still get the date, task and
 * toast. Clearing the date sends a scheduled lead back to New (no toast).
 */
export function setSurveyDate<L extends Lead>(lead: L, iso: ISODate | null, today: ISODate): SurveyResult<L> {
  const d = (iso || '').slice(0, 10);
  if (!d) {
    const back = lead.status === 'site_survey_scheduled';
    return {
      lead: { ...lead, siteSurveyDate: null, ...(back ? { status: 'new' as const, stageChangedAt: today, stageAgeDays: 0 } : {}) },
      toast: null,
      task: null,
    };
  }
  const moves = lead.status === 'new' || lead.status === 'site_survey_scheduled';
  return {
    lead: { ...lead, siteSurveyDate: d, ...(moves ? { status: 'site_survey_scheduled' as const, stageChangedAt: today, stageAgeDays: 0 } : {}) },
    toast: surveyToast(lead, d),
    task: { title: surveyTaskTitle(lead), description: surveyTaskDescription(lead.city), priority: 'high', dueDate: d },
  };
}

// ----------------------------------------------------------------- approve --

export interface ApprovalCounters {
  job: number;
  invoice: number;
}

export interface ApprovedLead<C extends ApprovalCounters> {
  lead: Lead;
  customer: {
    id: string;
    type: LeadType;
    name: string;
    phone: string;
    email: string;
    city: string;
    source: string;
    salesRepId: string;
    customerSince: ISODate;
    convertedFromLeadId: string;
  };
  workOrder: {
    id: string;
    number: string;
    customerId: string;
    leadId: string;
    quoteId: null;
    status: 'order_materials';
    scheduledDate: '';
    crew: '';
    createdAt: ISODate;
  };
  invoice: {
    id: string;
    number: string;
    customerId: string;
    jobId: string;
    leadId: string;
    quoteId: null;
    subtotal: number;
    tax: 0;
    total: number;
    payments: [];
    status: 'unpaid';
    createdAt: ISODate;
    dueDate: ISODate;
  };
  counters: C;
  /** The lead leaves the board after approval (main L8225). */
  removedFromBoard: true;
  toast: string;
}

/** Success toast (main L8225): "Lead LD-059 approved! Work Order WO-328 & Invoice IN-325 created." */
export function approveToast(leadNumber: string, woNumber: string, invNumber: string): string {
  return `Lead ${leadNumber} approved! Work Order ${woNumber} & Invoice ${invNumber} created.`;
}

/**
 * `approveLead` (main L8225): bumps the job and invoice counters
 * (WO-### / IN-###, padded to 3), creates the work order at Order Materials
 * and an unpaid invoice whose subtotal/total is the lead's estimated value
 * (no tax, due in 30 days), converts the lead to a customer, and removes the
 * lead from the board. Ids here are deterministic (the app uses Date.now()).
 */
export function approveLead<C extends ApprovalCounters>(lead: Lead, counters: C, today: ISODate): ApprovedLead<C> {
  const job = counters.job + 1;
  const inv = counters.invoice + 1;
  const woNumber = formatDocNumber('WO-', job);
  const inNumber = formatDocNumber('IN-', inv);
  const customerId = `cu-${lead.id}`;
  const jobId = `wo-${woNumber}`;
  const value = Number(lead.estimatedValue) || 0;
  return {
    lead: { ...lead, status: 'approved' },
    customer: {
      id: customerId,
      type: lead.type || 'Retail',
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? '',
      city: lead.city,
      source: lead.source,
      salesRepId: lead.salesRepId || '',
      customerSince: today,
      convertedFromLeadId: lead.id,
    },
    workOrder: {
      id: jobId, number: woNumber, customerId, leadId: lead.id, quoteId: null,
      status: 'order_materials', scheduledDate: '', crew: '', createdAt: today,
    },
    invoice: {
      id: `in-${inNumber}`, number: inNumber, customerId, jobId, leadId: lead.id, quoteId: null,
      subtotal: value, tax: 0, total: value, payments: [], status: 'unpaid', createdAt: today, dueDate: addDays(today, 30),
    },
    counters: { ...counters, job, invoice: inv },
    removedFromBoard: true,
    toast: approveToast(lead.number, woNumber, inNumber),
  };
}

/** Next lead number (main L8139): "LD-061" from counter 60. */
export function nextLeadNumber<C extends { lead: number }>(counters: C): { number: string; counters: C } {
  const n = counters.lead + 1;
  return { number: formatDocNumber('LD-', n), counters: { ...counters, lead: n } };
}

// ------------------------------------------------------- card decorations --

/** Days in stage before a card is flagged stale (main L7730). */
export const LEAD_STALE_DAYS: Readonly<Record<LeadStatus, number>> = {
  new: 7, site_survey_scheduled: 14, send_quote: 7, follow_up: 14, approved: 999, lost: 999,
};

/** `isLeadStale` (main L7732). */
export function isLeadStale(lead: Pick<Lead, 'status' | 'stageAgeDays'>): boolean {
  if (lead.status === 'approved' || lead.status === 'lost') return false;
  return lead.stageAgeDays >= (LEAD_STALE_DAYS[lead.status] || 14);
}

export type FollowUpState = 'overdue' | 'today' | 'soon' | 'scheduled' | null;

/** `getFollowUpState` (main L7733). */
export function followUpState(followUpDate: ISODate | null, today: ISODate): FollowUpState {
  if (!followUpDate) return null;
  if (followUpDate < today) return 'overdue';
  if (followUpDate === today) return 'today';
  return daysBetween(today, followUpDate) <= 7 ? 'soon' : 'scheduled';
}

export type ColumnBucket = 'today' | 'week' | 'month' | 'older';

/** Group inside a column by lead age (main L8044): ≤1 day today, ≤7 week, ≤30 month. */
export function columnBucket(createdAt: ISODate, today: ISODate): ColumnBucket {
  const d = daysBetween(createdAt, today);
  return d <= 1 ? 'today' : d <= 7 ? 'week' : d <= 30 ? 'month' : 'older';
}
