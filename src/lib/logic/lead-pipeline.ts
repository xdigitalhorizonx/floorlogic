/**
 * Lead pipeline board: statuses, labels, colours, drag-and-drop rules, the
 * card's primary action, survey dates, the automatic moves, the age buckets
 * inside a column, and what becomes of a lead when its quote is approved.
 *
 * Source (current app, demo main): main L7132 `LEAD_STATUSES`; L7621-7622
 * labels + colour names; L8894-8897 `LEAD_STALE_DAYS`, `getLeadStageAgeDays`,
 * `isLeadStale`, `getFollowUpState`; L8902 `advanceLead`; L8913 `kanbanDrop`;
 * L8917 `_leadTryMoveStage`; L8953 `setLeadSurveyDate`; L9038
 * `_onQuoteSentToCustomer`; L9058 `_ensureTaskForLeadStage`; L9076
 * `_runLeadAutoTransitions`; L9122 board columns (every status but Lost);
 * L9150-9213 `leadKbCardHTML`; L9216-9230 `LEAD_AGE_BUCKETS`,
 * `_leadAgeBucketKey`, `leadKbColumnBodyHTML`; L9803 `_createLeadRecord`
 * numbering; L9866 `changeLeadStatus`; L12301 `_resolveQuoteLeadToCustomer`;
 * L17786 `_convertLeadToCustomer`.
 *
 * Changed since the August app:
 * - A lead is never approved by hand. Dropping a card on Approved, or "→ Next"
 *   into Approved, only says "Approve the lead’s quote to move it to
 *   Approved." — a lead is won when one of its QUOTES is approved
 *   (`approveQuote`), which turns it into a customer and takes it off the
 *   pipeline. `approveLead` (WO/IN from the lead's estimated value) is gone.
 * - So a Follow-up card no longer offers "→ Approved" (no button at all).
 * - The age buckets inside a column are named constants now
 *   (`LEAD_AGE_BUCKETS`), same thresholds.
 * Unchanged and still ported: survey date → Site Survey Scheduled; survey
 * day reached → Send Quote; quote sent → Follow-up; stale + follow-up flags.
 */
import { addDays, daysBetween, fmtDate, type ISODate } from './dates';
import { formatDocNumber } from './money';
import { LEAD_STATUS_COLOR_NAMES, appHex, siteHex } from './status-colors';

export const LEAD_STATUSES = ['new', 'site_survey_scheduled', 'send_quote', 'follow_up', 'approved', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Columns on the board: every status except Lost (main L9122). */
export const BOARD_STATUSES = LEAD_STATUSES.filter((s): s is Exclude<LeadStatus, 'lost'> => s !== 'lost');

/** main L7621 (the legacy `quote_sent` alias also reads "Send Quote"). */
export const LEAD_LABELS: Readonly<Record<LeadStatus, string>> = {
  new: 'New',
  site_survey_scheduled: 'Site Survey Scheduled',
  send_quote: 'Send Quote',
  follow_up: 'Follow-up',
  approved: 'Approved',
  lost: 'Lost',
};

/** Column header colours the app uses (main L7622 names → :root hex). White text sits on these. */
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
 * The next status (`advanceLead` / `leadKbCardHTML`): the following entry in
 * LEAD_STATUSES, null for Lost or anything unknown. App quirk kept:
 * Approved → Lost.
 */
export function nextStatus(status: string): LeadStatus | null {
  const idx = (LEAD_STATUSES as readonly string[]).indexOf(status);
  if (idx < 0 || idx >= LEAD_STATUSES.length - 1) return null;
  return LEAD_STATUSES[idx + 1]!;
}

/** "→ Follow-up" (the card's advance button). */
export function advanceLabel(next: LeadStatus): string {
  return `→ ${LEAD_LABELS[next]}`;
}
/** Tooltip on the advance button. */
export function advanceTip(next: LeadStatus): string {
  return `Advance to ${LEAD_LABELS[next]}`;
}

/** Tooltip on the New card's survey date picker. */
export const SURVEY_PICKER_TIP = 'Pick a site-survey date — auto-moves this lead to Site Survey Scheduled';

export type CardAction =
  | { kind: 'surveyPicker'; tip: string }
  | { kind: 'none' }
  | { kind: 'advance'; to: LeadStatus; label: string; tip: string; approves: boolean };

/**
 * The primary action on a card (`leadKbCardHTML`, main L9197-9210):
 * - New: the site-survey date picker IS the next step;
 * - Site Survey Scheduled: nothing — the survey date moves it;
 * - Follow-up: nothing (since October: approval happens on the quote);
 * - otherwise "→ {Next}" — Send Quote offers "→ Follow-up", and (app quirk,
 *   unchanged) an Approved card still left on the board offers "→ Lost".
 * `approves` is always false now; kept for the August shape.
 */
export function cardPrimaryAction(lead: Pick<Lead, 'status'>): CardAction {
  if (lead.status === 'new') return { kind: 'surveyPicker', tip: SURVEY_PICKER_TIP };
  if (lead.status === 'site_survey_scheduled') return { kind: 'none' };
  const next = nextStatus(lead.status);
  if (!next || next === 'approved') return { kind: 'none' };
  return { kind: 'advance', to: next, label: advanceLabel(next), tip: advanceTip(next), approves: false };
}

// ------------------------------------------------------------- moving by hand --

/** Toast when a card is dropped on Site Survey Scheduled without a date (`_leadTryMoveStage`, board). */
export const SURVEY_DATE_REQUIRED_TOAST = '📐 Set a site-survey date on the card first — that auto-moves it here.';
/** The same refusal from the List View panel's stage buttons. */
export const SURVEY_DATE_REQUIRED_PANEL_TOAST = '📐 Set a site-survey date first — that auto-moves it here.';
/** Refusal for any manual move into Approved (`_leadTryMoveStage`, `advanceLead`). Note the ’ (U+2019). */
export const APPROVE_VIA_QUOTE_TOAST = 'Approve the lead’s quote to move it to Approved.';

/**
 * AUGUST app only — the confirm a drop on Approved used to ask. The current
 * app refuses that move (`APPROVE_VIA_QUOTE_TOAST`); kept for old imports.
 * @deprecated
 */
export function approveConfirmText(lead: Pick<Lead, 'name'>): string {
  return `Move ${lead.name} to Approved? This will convert the lead to a customer and create a work order + invoice.`;
}
/** Confirm before a move to Lost (`_leadTryMoveStage`). */
export function lostConfirmText(lead: Pick<Lead, 'name'>): string {
  return `Mark ${lead.name} as Lost?`;
}

export type DropResult =
  | { ok: true; to: LeadStatus; confirm: string | null; approves: false }
  | { ok: false; reason: 'same-status' | 'needs-survey-date' | 'approve-via-quote'; toast: string | null; toastKind: 'warning' | null };

/**
 * A manual move to another stage (`_leadTryMoveStage`, main L8917 — shared by
 * the board's drag-and-drop, `from: 'card'`, and the List View panel's stage
 * buttons, `from: 'panel'`): same column → nothing; Site Survey Scheduled
 * without a date → refused with a warning; Approved → refused ("approve the
 * lead’s quote"); Lost → confirm first; anything else moves straight away
 * (backwards too).
 */
export function canDrop(lead: Pick<Lead, 'status' | 'siteSurveyDate' | 'name'>, to: LeadStatus, from: 'card' | 'panel' = 'card'): DropResult {
  if (lead.status === to) return { ok: false, reason: 'same-status', toast: null, toastKind: null };
  if (to === 'site_survey_scheduled' && !lead.siteSurveyDate) {
    return { ok: false, reason: 'needs-survey-date', toast: from === 'panel' ? SURVEY_DATE_REQUIRED_PANEL_TOAST : SURVEY_DATE_REQUIRED_TOAST, toastKind: 'warning' };
  }
  if (to === 'approved') return { ok: false, reason: 'approve-via-quote', toast: APPROVE_VIA_QUOTE_TOAST, toastKind: 'warning' };
  if (to === 'lost') return { ok: true, to, confirm: lostConfirmText(lead), approves: false };
  return { ok: true, to, confirm: null, approves: false };
}

export type AdvanceResult =
  | { kind: 'move'; to: LeadStatus }
  | { kind: 'refuse'; toast: string; toastKind: 'warning' }
  | { kind: 'none' };

/**
 * `advanceLead` (main L8902), the card's "→ Next": the next status, except
 * that the step into Approved is refused with `APPROVE_VIA_QUOTE_TOAST`.
 * (No confirm on the Approved card's "→ Lost" — app behaviour.)
 */
export function advanceLead(lead: Pick<Lead, 'status'>): AdvanceResult {
  const next = nextStatus(lead.status);
  if (!next) return { kind: 'none' };
  if (next === 'approved') return { kind: 'refuse', toast: APPROVE_VIA_QUOTE_TOAST, toastKind: 'warning' };
  return { kind: 'move', to: next };
}

/** `changeLeadStatus` (main L9866) for an ordinary move: new status, stage clock restarts. */
export function changeStatus<L extends Lead>(lead: L, to: LeadStatus, today: ISODate): L {
  return { ...lead, status: to, stageChangedAt: today, stageAgeDays: 0 };
}

/** Activity line `changeLeadStatus` writes when the status really changes. */
export function statusChangeActivity(lead: Pick<Lead, 'number'>, to: LeadStatus): string {
  return `Lead ${lead.number} → ${LEAD_LABELS[to]}`;
}

export interface LeadTask {
  title: string;
  description: string;
  priority: 'high' | 'medium';
  /** A fixed day (survey day), or days from now. */
  due: { date: ISODate } | { inDays: number };
}

/**
 * The task a manual move adds when the lead has no open one like it
 * (`_ensureTaskForLeadStage`, main L9058). Approved and Lost add none. The
 * app writes the street address; the site passes the city.
 */
export function stageTask(lead: Pick<Lead, 'name' | 'siteSurveyDate'> & { address?: string | null }, status: LeadStatus): LeadTask | null {
  const addr = lead.address || '(no address)';
  switch (status) {
    case 'site_survey_scheduled':
      return {
        title: `Site survey: ${lead.name}`,
        description: lead.siteSurveyDate ? `Visit ${addr} to measure and assess the site.` : `Confirm a survey date with the customer and visit ${addr}.`,
        priority: 'high',
        due: lead.siteSurveyDate ? { date: lead.siteSurveyDate } : { inDays: 1 },
      };
    case 'send_quote':
      return { title: `Send quote to ${lead.name}`, description: `Build and send the quote to ${lead.name}.`, priority: 'high', due: { inDays: 2 } };
    case 'follow_up':
      return { title: `Follow up with ${lead.name}`, description: 'Check in on the quote — confirm receipt, answer questions, push for a decision.', priority: 'medium', due: { inDays: 3 } };
    case 'new':
      return { title: `Schedule site survey with ${lead.name}`, description: 'No survey date set on this lead — call to book the visit.', priority: 'high', due: { inDays: 1 } };
    default:
      return null;
  }
}

// ------------------------------------------------------------- survey date --

/** Task the app creates for a survey: "Site survey: Dev & Anjali Prasad". */
export function surveyTaskTitle(lead: Pick<Lead, 'name'>): string {
  return `Site survey: ${lead.name}`;
}
/** Task description. The app puts the street address here; the site passes the city. */
export function surveyTaskDescription(address: string | null | undefined): string {
  return `Visit ${address || '(no address)'} to measure and assess the site.`;
}
/**
 * Toast after picking a survey date (`setLeadSurveyDate`):
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
 * `setLeadSurveyDate` (main L8953, unchanged). Setting a date on a New (or
 * already scheduled) lead moves it to Site Survey Scheduled and restarts its
 * stage clock; other stages keep their status but still get the date, task
 * and toast. Clearing the date sends a scheduled lead back to New (no toast).
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

// ---------------------------------------------------------- automatic moves --

export interface AutoMove<L> {
  lead: L;
  /** The activity-log line the app writes. */
  activity: string;
  /** The task the app adds (`null` when an open one already covers it). */
  task: LeadTask | null;
  /** Open "Site survey:" tasks the app closes at the same time. */
  completesSurveyTasks: boolean;
}

/**
 * `_runLeadAutoTransitions` (main L9076, run every time the Leads screen
 * renders): a Site Survey Scheduled lead whose survey day has come (today or
 * earlier) moves to Send Quote, its stage clock restarts, its "Site survey:"
 * task is completed and a "Send quote to …" task is added. No toast.
 * Null when the rule does not apply.
 */
export function surveyDayReached<L extends Lead>(lead: L, today: ISODate): AutoMove<L> | null {
  if (lead.status !== 'site_survey_scheduled' || !lead.siteSurveyDate || lead.siteSurveyDate > today) return null;
  return {
    lead: { ...lead, status: 'send_quote', stageChangedAt: today, stageAgeDays: 0 },
    activity: `Lead ${lead.number || lead.name} auto-moved to Send Quote (survey date passed)`,
    task: {
      title: `Send quote to ${lead.name}`,
      description: `Site survey on ${fmtDate(lead.siteSurveyDate)} is complete. Build and send the quote.`,
      priority: 'high',
      due: { inDays: 2 },
    },
    completesSurveyTasks: true,
  };
}

export type QuoteSendChannel = 'email' | 'SMS' | 'link';

export interface QuoteSentMove<L> {
  lead: L;
  /** null when the lead was already at Follow-up (nothing logged). */
  activity: string | null;
  /** null when an open follow-up task already names the quote. */
  task: LeadTask | null;
}

/**
 * `_onQuoteSentToCustomer` (main L9038), after a quote is emailed or texted:
 * the lead moves to Follow-up from ANY earlier stage (even New), unless it is
 * Approved or Lost; the stage clock restarts only when it actually moves.
 * A "Follow up with … on quote QT-…" task is added unless an open follow-up
 * task already names that quote (`hasOpenTaskForQuote`). Desktop "📤 Mark
 * Sent" does not do this — only a real send. Null when nothing happens.
 */
export function quoteSentToLead<L extends Lead>(
  lead: L,
  quoteNumber: string,
  channel: QuoteSendChannel,
  today: ISODate,
  hasOpenTaskForQuote = false,
): QuoteSentMove<L> | null {
  if (lead.status === 'approved' || lead.status === 'lost') return null;
  const moves = lead.status !== 'follow_up';
  return {
    lead: moves ? { ...lead, status: 'follow_up', stageChangedAt: today, stageAgeDays: 0 } : lead,
    activity: moves ? `Lead ${lead.number || lead.name} → Follow-up (quote ${quoteNumber || ''} sent via ${channel})` : null,
    task: hasOpenTaskForQuote
      ? null
      : {
          title: `Follow up with ${lead.name} on quote ${quoteNumber || ''}`,
          description: `Quote ${quoteNumber || ''} was sent via ${channel}. Reach out to confirm receipt and answer questions.`,
          priority: 'medium',
          due: { inDays: 3 },
        },
  };
}

// ------------------------------------------------- won: the quote is approved --

export interface ConvertedCustomer {
  id: string;
  /** Property Management, Builder and Commercial carry over; anything else becomes Retail. */
  type: 'Retail' | 'Commercial' | 'Property Management' | 'Builder';
  name: string;
  phone: string;
  email: string;
  city: string;
  source: string;
  salesRepId: string;
  customerSince: ISODate;
  convertedFromLeadId: string;
  /** The default property the app makes from the address: "Main Office" for a company, else "Home". */
  propertyLabel: 'Main Office' | 'Home';
}

/** `_convertLeadToCustomer` type rule (main L17786). */
export function customerTypeFromLead(type: string | null | undefined): ConvertedCustomer['type'] {
  return type === 'Property Management' || type === 'Builder' || type === 'Commercial' ? type : 'Retail';
}

/**
 * What approving one of the lead's quotes does to the lead
 * (`_resolveQuoteLeadToCustomer` → `_convertLeadToCustomer`, main
 * L12301 / L17786): the lead becomes a customer (contacts, notes and the
 * address as its first property carried over; the quote's rep fills an
 * empty one) and is REMOVED from the pipeline — it never sits in the
 * Approved column. Ids here are deterministic (the app uses Date.now()).
 */
export function convertLeadOnQuoteApproval(
  lead: Pick<Lead, 'id' | 'number' | 'name' | 'phone' | 'email' | 'city' | 'source' | 'salesRepId' | 'type'>,
  today: ISODate,
  quoteSalesRepId = '',
): { customer: ConvertedCustomer; removedFromPipeline: true; activity: string[] } {
  const type = customerTypeFromLead(lead.type);
  return {
    customer: {
      id: `cu-${lead.id}`,
      type,
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      city: lead.city,
      source: lead.source || '',
      salesRepId: lead.salesRepId || quoteSalesRepId || '',
      customerSince: today,
      convertedFromLeadId: lead.id,
      propertyLabel: type !== 'Retail' ? 'Main Office' : 'Home',
    },
    removedFromPipeline: true,
    activity: [`Lead ${lead.number || lead.name} converted to customer`],
  };
}

// --------------------------------------------- AUGUST lead approval (gone) --

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
  /** The lead leaves the board after approval. */
  removedFromBoard: true;
  toast: string;
}

/**
 * AUGUST app only: "Lead LD-059 approved! Work Order WO-328 & Invoice IN-325
 * created." The current app approves quotes, not leads (see `approveQuote`).
 */
export function approveToast(leadNumber: string, woNumber: string, invNumber: string): string {
  return `Lead ${leadNumber} approved! Work Order ${woNumber} & Invoice ${invNumber} created.`;
}

/**
 * AUGUST app only — `approveLead` (August main L8225) is GONE from the
 * current app: a lead can no longer be approved from the board. It bumped
 * the job/invoice counters (WO-###, IN-###), made a work order at Order
 * Materials and an untaxed invoice for the lead's estimated value (due in 30
 * days), converted the lead and removed it from the board. Kept so existing
 * imports keep compiling; the current path is `approveQuote` (quote-totals.ts)
 * with `convertLeadOnQuoteApproval`.
 * @deprecated
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

/** Next lead number (`_createLeadRecord`, main L9803): "LD-061" from counter 60. */
export function nextLeadNumber<C extends { lead: number }>(counters: C): { number: string; counters: C } {
  const n = counters.lead + 1;
  return { number: formatDocNumber('LD-', n), counters: { ...counters, lead: n } };
}

// ------------------------------------------------------- card decorations --

/** Days in stage before a card is flagged stale (main L8894). */
export const LEAD_STALE_DAYS: Readonly<Record<LeadStatus, number>> = {
  new: 7, site_survey_scheduled: 14, send_quote: 7, follow_up: 14, approved: 999, lost: 999,
};

/**
 * `getLeadStageAgeDays` (main L8895): whole days since `stageChangedAt`,
 * else `createdAt`, else 0.
 */
export function leadStageAgeDays(lead: { stageChangedAt?: ISODate | null; createdAt?: ISODate | null }, today: ISODate): number {
  const ref = lead.stageChangedAt || lead.createdAt || today;
  return daysBetween(ref, today);
}

/**
 * `isLeadStale` (main L8896): days in stage ≥ the stage's threshold (14 when
 * unknown); never for Approved or Lost. With `today` the age is computed from
 * the dates like the app; without it the lead's `stageAgeDays` is used.
 */
export function isLeadStale(
  lead: Pick<Lead, 'status'> & { stageAgeDays?: number; stageChangedAt?: ISODate | null; createdAt?: ISODate | null },
  today?: ISODate,
): boolean {
  if (lead.status === 'approved' || lead.status === 'lost') return false;
  const age = today ? leadStageAgeDays(lead, today) : Number(lead.stageAgeDays) || 0;
  return age >= (LEAD_STALE_DAYS[lead.status] || 14);
}

export type FollowUpState = 'overdue' | 'today' | 'soon' | 'scheduled' | null;

/** `getFollowUpState` (main L8897): overdue / today / within 7 days ("soon") / later. */
export function followUpState(followUpDate: ISODate | null | undefined, today: ISODate): FollowUpState {
  if (!followUpDate) return null;
  if (followUpDate < today) return 'overdue';
  if (followUpDate === today) return 'today';
  return daysBetween(today, followUpDate) <= 7 ? 'soon' : 'scheduled';
}

export type ColumnBucket = 'today' | 'week' | 'month' | 'older';

/** Groups inside a column, by how old the LEAD is (createdAt), main L9216. */
export const LEAD_AGE_BUCKETS: ReadonlyArray<{ key: ColumnBucket; label: string }> = [
  { key: 'today', label: '📥 Today' },
  { key: 'week', label: '📆 This Week' },
  { key: 'month', label: '📅 This Month' },
  { key: 'older', label: '🗂 Older' },
];

/** `_leadAgeBucketKey` (main L9217): ≤1 day today, ≤7 week, ≤30 month, else older. */
export function leadAgeBucketKey(createdAt: ISODate, today: ISODate): ColumnBucket {
  const d = daysBetween(createdAt, today);
  return d <= 1 ? 'today' : d <= 7 ? 'week' : d <= 30 ? 'month' : 'older';
}

/** Same rule under its August name. */
export const columnBucket = leadAgeBucketKey;

/** `_leadAgeBucketLabel` (main L9218): "📆 This Week"; an unknown key comes back as is. */
export function leadAgeBucketLabel(key: string): string {
  const b = LEAD_AGE_BUCKETS.find((x) => x.key === key);
  return b ? b.label : key;
}

/**
 * Whether a bucket starts open (`leadKbColumnBodyHTML`, main L9219): Today
 * always; This Week unless the column is big (> 15 leads) and has Today
 * leads; This Month unless big; Older starts closed. Empty buckets are not
 * drawn at all.
 */
export function leadAgeBucketDefaultOpen(key: ColumnBucket, columnSize: number, todayCount: number): boolean {
  const big = columnSize > 15;
  if (key === 'today') return true;
  if (key === 'week') return !big || todayCount === 0;
  if (key === 'month') return !big;
  return false;
}
