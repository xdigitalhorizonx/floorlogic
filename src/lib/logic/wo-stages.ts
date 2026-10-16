/**
 * Work-order stages: the status sequence, the one primary button per status,
 * the always-there "Order Materials / Manage POs" button, install start/end
 * dates, the automatic moves, and the Archive.
 *
 * Source (current app, demo main): main L7625-7626 colours + labels; L16832
 * "Mark as Paid…" gating; L16922 header buttons; L6187 `_ndMarkJobStarted`;
 * L19385-19409 `JOB_MAX_INSTALL_DAYS`, `_isoAddDays`, `_jobInstallSpan`,
 * `_installRangeLabel`; L19484 `saveScheduleJob`; L19526 `completeJob`;
 * L19552 `markJobPaid`; L19937 `_woGroupInvoice`; L21164 `submitOrderMaterials`;
 * L21237-21259 `PIPELINE_STAGES`, `PIPELINE_CLOSED`, `JOB_BUCKETS`; L21310
 * `_jobInstallEnd`; L21488 `_jobBucket`; L21513 `_matMaybeAdvance`; L21837
 * `_jobArchiveList`; L29482 `_advanceJobToReady`; L29498-29523
 * `_woGroupPaidInFull`, `_plAutoAdvanceSweep`; L29552-29583
 * `jcMarkGroupComplete`, `jcMarkGroupReady`, `jcMarkGroupPaid`.
 * App specs: scripts/pipeline-auto-move.test.js, pipeline-archive-tab.test.js,
 * schedule-start-end.test.js, order-materials-dates-freight.test.js.
 *
 * Changed since the August app (owner rules 2026-10-13):
 * - the materials gate is EVERY LINE ORDERED (was: every line received):
 *   Order Materials that covers every line goes straight to Ready to Schedule
 *   (Scheduled when the job already has a date), and a PO on a scheduled job
 *   no longer knocks it back to Materials Ordered;
 * - an install has a START and an END (stored as `durationDays`); the
 *   schedule dialog refuses a missing or backwards end, and toasts read
 *   "Nov 10, 2026 → Nov 12, 2026 (3 days)";
 * - the day after the install END the job completes itself (Final Invoice,
 *   or Ready to be Paid when an invoice is already paid); every invoice on
 *   the job paid in full moves it to Costing & Payout — swept on load and
 *   every 10 minutes, no click needed;
 * - Paid work orders leave the board for an Archive tab (no Done column);
 *   Job Costing's "💰 Mark Paid" closes a job out.
 */
import { addDays, fmtDate, fmtWeekdayShort, localDateOnly, type ISODate } from './dates';
import { JOB_STATUS_COLOR_NAMES, appHex, siteHex } from './status-colors';

export const WO_STATUSES = [
  'order_materials', 'materials_ordered', 'ready_to_schedule', 'scheduled', 'in_progress',
  'final_invoice', 'ready_to_be_paid', 'paid', 'complete', 'on_hold', 'cancelled',
] as const;
export type WoStatus = (typeof WO_STATUSES)[number];

/** Active stages, left → right, as the job board orders them (main L21237). */
export const WO_PIPELINE: readonly WoStatus[] = [
  'order_materials', 'materials_ordered', 'ready_to_schedule', 'scheduled', 'in_progress', 'final_invoice', 'ready_to_be_paid',
];

/** Closed statuses: off the board, listed on the Archive tab (main L21238). */
export const WO_CLOSED: readonly WoStatus[] = ['paid', 'complete'];

/** The happy path a sold job walks, ending at Paid (installer paid out). */
export const WO_SEQUENCE: readonly WoStatus[] = [...WO_PIPELINE, 'paid'];

/** main L7626 */
export const WO_LABELS: Readonly<Record<WoStatus, string>> = {
  order_materials: 'Order Materials',
  materials_ordered: 'Materials Ordered',
  ready_to_schedule: 'Ready to Schedule',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  final_invoice: 'Final Invoice',
  ready_to_be_paid: 'Ready to be Paid',
  paid: 'Paid',
  complete: 'Complete',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

export const WO_COLORS_APP: Readonly<Record<WoStatus, string>> = Object.fromEntries(
  WO_STATUSES.map((s) => [s, appHex(JOB_STATUS_COLOR_NAMES[s])]),
) as Record<WoStatus, string>;
export const WO_COLORS: Readonly<Record<WoStatus, string>> = Object.fromEntries(
  WO_STATUSES.map((s) => [s, siteHex(JOB_STATUS_COLOR_NAMES[s])]),
) as Record<WoStatus, string>;

/**
 * Job board columns (main L21252). No "Done" column any more — paid and
 * complete jobs are on the Archive tab. On Hold only shows when something is
 * on hold (`optional`).
 */
export const WO_BUCKETS = [
  { key: 'materials', label: 'Materials', icon: '🧱', color: 'purple', statuses: ['order_materials', 'materials_ordered'], sub: 'order or assign from stock', optional: false },
  { key: 'schedule', label: 'Ready to Schedule', icon: '🗓️', color: 'amber', statuses: ['ready_to_schedule'], sub: 'materials ordered — needs a date', optional: false },
  { key: 'scheduled', label: 'Scheduled', icon: '📅', color: 'blue', statuses: ['scheduled', 'in_progress'], sub: 'installers pull materials day-of', optional: false },
  { key: 'final_invoice', label: 'Final Invoice', icon: '🧾', color: 'orange', statuses: ['final_invoice'], sub: 'installed — collect the balance', optional: false },
  { key: 'costing', label: 'Costing & Payout', icon: '🧮', color: 'amber', statuses: ['ready_to_be_paid'], sub: 'paid in full — cost it, pay commissions', optional: false },
  { key: 'on_hold', label: 'On Hold', icon: '⏸️', color: 'gray', statuses: ['on_hold'], sub: '', optional: true },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: string; color: string; statuses: readonly WoStatus[]; sub: string; optional: boolean }>;

export type WoBucketKey = (typeof WO_BUCKETS)[number]['key'] | 'archive';

/** `_jobBucket` (main L21488): 'archive' for Paid/Complete, else the column; unknown → 'materials'. */
export function woBucketKey(status: string): WoBucketKey {
  if ((WO_CLOSED as readonly string[]).includes(status)) return 'archive';
  const b = WO_BUCKETS.find((x) => (x.statuses as readonly string[]).includes(status));
  return b ? b.key : 'materials';
}

/** Hub bar above the job board (main L15381), left → right. */
export const WO_HUB_TABS = [
  { key: 'board', icon: '🗂️', label: 'Pipeline' },
  { key: 'projects', icon: '📁', label: 'Projects' },
  { key: 'jobs', icon: '🔨', label: 'All Jobs' },
  { key: 'quotes', icon: '📝', label: 'Quotes' },
  { key: 'archive', icon: '🗄️', label: 'Archive' },
] as const;

// --------------------------------------------------------- header buttons --

export const SCHEDULE_TITLE = 'Pick an install date and assign an installer';
export const MARK_PAID_TITLE = 'Record payment for this WO (and optionally bundle other WOs in the same payment)';
export const MARK_PAID_DISABLED_TITLE = 'Disabled — the linked invoice must be marked Paid first';

export interface WoActionContext {
  /** An invoice is linked to this work order (its own, or its split group's). */
  hasLinkedInvoice: boolean;
  /** At least one invoice on this work order (or its split group's) has status 'paid'. */
  anyInvoicePaid: boolean;
}

export type WoAction = 'orderMaterials' | 'schedule' | 'complete' | 'viewFinalInvoice' | 'markPaid';

export type WoPrimary =
  | { kind: 'button'; action: WoAction; label: string; variant: 'primary' | 'success' | 'warning'; enabled: boolean; title: string | null }
  | { kind: 'text'; label: string }
  | null;

/**
 * The single status-driven control in the work-order header (main L16922,
 * unchanged): 📦 Order Materials → ✅ Ready to Schedule → 📅 Schedule Install
 * → ✅ Mark Job Complete → 📄 View Final Invoice → 💰 Mark as Paid… →
 * "✅ Paid in Full" (plain text). "Mark as Paid…" pays the installer and is
 * disabled until an invoice on the job is Paid. (With every-line-ordered now
 * advancing on its own, "✅ Ready to Schedule" is only seen while some lines
 * are still to order.)
 */
export function woPrimaryAction(status: WoStatus, ctx: WoActionContext): WoPrimary {
  switch (status) {
    case 'order_materials':
      return { kind: 'button', action: 'orderMaterials', label: '📦 Order Materials', variant: 'primary', enabled: true, title: null };
    case 'materials_ordered':
      return { kind: 'button', action: 'schedule', label: '✅ Ready to Schedule', variant: 'primary', enabled: true, title: SCHEDULE_TITLE };
    case 'ready_to_schedule':
      return { kind: 'button', action: 'schedule', label: '📅 Schedule Install', variant: 'primary', enabled: true, title: SCHEDULE_TITLE };
    case 'scheduled':
    case 'in_progress':
      return { kind: 'button', action: 'complete', label: '✅ Mark Job Complete', variant: 'success', enabled: true, title: null };
    case 'final_invoice':
      return ctx.hasLinkedInvoice
        ? { kind: 'button', action: 'viewFinalInvoice', label: '📄 View Final Invoice', variant: 'warning', enabled: true, title: null }
        : null;
    case 'ready_to_be_paid':
      return {
        kind: 'button', action: 'markPaid', label: '💰 Mark as Paid…', variant: 'success',
        enabled: ctx.anyInvoicePaid, title: ctx.anyInvoicePaid ? MARK_PAID_TITLE : MARK_PAID_DISABLED_TITLE,
      };
    case 'paid':
      return { kind: 'text', label: '✅ Paid in Full' };
    default:
      return null;
  }
}

/** "📦 Manage POs" (outline) shows on every status except Order Materials (main L16922). */
export function showsManagePOs(status: WoStatus): boolean {
  return status !== 'order_materials';
}
export const MANAGE_POS = { label: '📦 Manage POs', title: 'Open the materials order window again' } as const;

// ------------------------------------------------------- install dates --

/** `JOB_MAX_INSTALL_DAYS` (main L19385): a span longer than this is refused. */
export const JOB_MAX_INSTALL_DAYS = 365;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `_isoDayDiff` for date-only strings: whole calendar days from a to b; null when unreadable. */
function dayDiff(a: string, b: string): number | null {
  const pa = DATE_ONLY.exec(a);
  const pb = DATE_ONLY.exec(b);
  if (!pa || !pb) return null;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / 864e5);
}

export type InstallSpan = { days: number; error?: undefined } | { error: string; days?: undefined };

/**
 * `_jobInstallSpan` (main L19390): {days} on site for a start/end pair
 * (same day = 1), or {error} saying what to fix — the exact toasts.
 */
export function installSpan(start: unknown, end: unknown): InstallSpan {
  const s = localDateOnly(start);
  const e = localDateOnly(end);
  if (!s) return { error: e ? 'Pick a start date — the end date counts from it.' : 'Pick a start date.' };
  if (!e) return { error: 'Pick an end date — the same day as the start for a one-day job.' };
  const diff = dayDiff(s, e);
  if (diff == null) return { error: 'That date could not be read.' };
  if (diff < 0) return { error: `The end date (${fmtDate(e)}) is before the start (${fmtDate(s)}).` };
  if (diff + 1 > JOB_MAX_INSTALL_DAYS) return { error: `That is ${diff + 1} days on site — ${JOB_MAX_INSTALL_DAYS} at most. Check the year.` };
  return { days: diff + 1 };
}

/** `_jobInstallEnd` (main L21310): the last day on site — start + max(1, days) − 1; null with no start. */
export function installEnd(start: unknown, durationDays: number | null | undefined): ISODate | null {
  const s = localDateOnly(start);
  if (!s) return null;
  const days = Math.max(1, Number(durationDays) || 1);
  return addDays(s, days - 1);
}

/** `_installRangeLabel` (main L19409): "Oct 13, 2026", or "Oct 13, 2026 → Oct 15, 2026 (3 days)". */
export function installRangeLabel(start: ISODate, days?: number | null): string {
  const d = Math.max(1, Number(days) || 1);
  return d > 1 ? `${fmtDate(start)} → ${fmtDate(addDays(start, d - 1))} (${d} days)` : fmtDate(start);
}

export type InstallRangeHint =
  | { kind: 'empty'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'span'; days: number; icon: '📅'; label: string; rest: string; text: string };

/**
 * The line under the Schedule Install window's End date (`_rangeHintHTML`,
 * main L19431): "No install dates yet.", "⚠ <what to fix>", or
 * "📅 2-day install · Wed, Oct 21 → Thu, Oct 22" (the app bolds the label).
 */
export function installRangeHint(start: ISODate | null | undefined, end: ISODate | null | undefined): InstallRangeHint {
  if (!start && !end) return { kind: 'empty', text: 'No install dates yet.' };
  const sp = installSpan(start, end);
  if (sp.error !== undefined) return { kind: 'error', text: '⚠ ' + sp.error };
  const label = sp.days === 1 ? 'One-day install' : `${sp.days}-day install`;
  const rest = ` · ${fmtWeekdayShort(start)}${sp.days > 1 ? ` → ${fmtWeekdayShort(end)}` : ''}`;
  return { kind: 'span', days: sp.days, icon: '📅', label, rest, text: `📅 ${label}${rest}` };
}

/**
 * `_rangeStartChanged` (main L19418): moving the start carries the end with
 * it — the same number of days on site (1 for a fresh window).
 */
export function endFollowingStart(start: ISODate | null | undefined, days: number | null | undefined): ISODate | '' {
  return start ? installEnd(start, days) ?? '' : '';
}

// ------------------------------------------------------------ transitions --

export type WoEvent =
  /**
   * Material lines were ordered (Order Materials, a PO marked ordered, a tick).
   * `allOrdered`: every material line is now ordered — the job then moves on
   * to Ready to Schedule (Scheduled when it has a date) by itself.
   */
  | { type: 'materialsOrdered'; allOrdered?: boolean; scheduledDate?: ISODate | null }
  /** Every material line is in (received / from stock) — so also all ordered. */
  | { type: 'materialsIn'; scheduledDate?: ISODate | null }
  /** Schedule dialog saved (`saveScheduleJob`); `end` is the install end date. */
  | { type: 'schedule'; date?: ISODate | null; installer?: string | null; end?: ISODate | null }
  /** "▶️ Mark In Progress" — main L6187. */
  | { type: 'start' }
  /** "Mark Job Complete", or the install END passing — main L19526. */
  | { type: 'complete'; anyInvoicePaid: boolean }
  /** Every invoice on the job paid in full — main L29482. */
  | { type: 'invoicePaid' }
  /** Installer paid out ("Mark as Paid…") or Job Costing's "💰 Mark Paid" — main L19552 / L29577. */
  | { type: 'markPaid' };

/**
 * Where a work order goes on an event; unchanged when the event does not
 * apply. Order Materials = `submitOrderMaterials` + `_matMaybeAdvance`: Order
 * Materials → Materials Ordered, then on to Ready to Schedule / Scheduled when
 * every line is ordered; a job past Materials Ordered stays where it is.
 */
export function woTransition(status: WoStatus, event: WoEvent): WoStatus {
  switch (event.type) {
    case 'materialsOrdered': {
      const s = status === 'order_materials' ? 'materials_ordered' : status;
      if (event.allOrdered && s === 'materials_ordered') return event.scheduledDate ? 'scheduled' : 'ready_to_schedule';
      return s;
    }
    case 'materialsIn':
      if (status !== 'order_materials' && status !== 'materials_ordered') return status;
      return event.scheduledDate ? 'scheduled' : 'ready_to_schedule';
    case 'schedule':
      if (event.date) {
        return status === 'ready_to_schedule' || status === 'materials_ordered' || status === 'order_materials' ? 'scheduled' : status;
      }
      return event.installer && status === 'materials_ordered' ? 'ready_to_schedule' : status;
    case 'start':
      return 'in_progress';
    case 'complete':
      return event.anyInvoicePaid ? 'ready_to_be_paid' : 'final_invoice';
    case 'invoicePaid':
      return status === 'final_invoice' ? 'ready_to_be_paid' : status;
    case 'markPaid':
      return 'paid';
  }
}

/** Material lines as the gate counts them (`_jobMatLines` / `_matLineOrdered` / `_matLineIn`, main L21500-21502). */
export interface WoMaterialLine {
  hidden?: boolean;
  quantity?: number | string | null;
  productName?: string | null;
  item?: string | null;
  matOrderedAt?: string | null;
  matReceivedAt?: string | null;
  poCreated?: boolean;
  allocatedFromInventory?: boolean;
}

/** A line the gate looks at: not hidden, and with a quantity or a name. */
export function countsAsMaterialLine(m: WoMaterialLine | null | undefined): boolean {
  return !!m && !m.hidden && ((Number(m.quantity) || 0) > 0 || !!m.productName || !!m.item);
}
/** Ordered = a PO, an order tick, received, or assigned from stock. */
export function materialLineOrdered(m: WoMaterialLine): boolean {
  return !!(m.matOrderedAt || m.matReceivedAt || m.poCreated || m.allocatedFromInventory);
}
/** In = received, or assigned from stock. */
export function materialLineIn(m: WoMaterialLine): boolean {
  return !!(m.matReceivedAt || m.allocatedFromInventory);
}

/**
 * `_matMaybeAdvance` (main L21513): every line ordered → Ready to Schedule
 * (Scheduled when dated); some ordered and still at Order Materials →
 * Materials Ordered. Only from Order Materials / Materials Ordered.
 */
export function materialsAdvance(
  status: WoStatus,
  lines: readonly (WoMaterialLine | null | undefined)[],
  scheduledDate: ISODate | null | undefined,
  woNumber = '',
): { status: WoStatus; activity: string | null } {
  if (status !== 'order_materials' && status !== 'materials_ordered') return { status, activity: null };
  const real = lines.filter(countsAsMaterialLine) as WoMaterialLine[];
  const ordered = real.filter(materialLineOrdered).length;
  if (real.length && ordered === real.length) {
    return scheduledDate
      ? { status: 'scheduled', activity: `Job ${woNumber} → Scheduled (materials ordered, date already set)` }
      : { status: 'ready_to_schedule', activity: `Job ${woNumber} → Ready to Schedule (all materials ordered)` };
  }
  if (ordered > 0 && status === 'order_materials') return { status: 'materials_ordered', activity: null };
  return { status, activity: null };
}

/**
 * Toast after Order Materials → Finish (`submitOrderMaterials`):
 * "✓ 4 POs marked as ordered — WO-330 → Ready to Schedule" (the tail only
 * when the job moved past Materials Ordered).
 */
export function orderMaterialsToast(poCount: number, woNumber: string, movedTo: WoStatus | null): string {
  return `✓ ${poCount} PO${poCount === 1 ? '' : 's'} marked as ordered${movedTo ? ` — ${woNumber} → ${WO_LABELS[movedTo]}` : ''}`;
}

/**
 * Order Materials → Finish (`submitOrderMaterials`, main L21164) after the
 * ticked lines got their POs: a job at Order Materials becomes Materials
 * Ordered, then `_matMaybeAdvance` carries it on when every line is ordered.
 * `linesAfter` are the work order's material lines with the new POs marked.
 * Refused when nothing was ticked; after that check the app refuses a ticked
 * line without a PO # (`ORDER_NEEDS_PO_TOAST` — this function only gets the
 * count, so the caller checks PO numbers).
 */
export function orderMaterials(
  status: WoStatus,
  woNumber: string,
  linesAfter: readonly (WoMaterialLine | null | undefined)[],
  scheduledDate: ISODate | null | undefined,
  poCount: number,
): { ok: true; status: WoStatus; toast: string; activity: string[] } | { ok: false; toast: string; toastKind: 'warning' } {
  if (!(poCount > 0)) return { ok: false, toast: 'Tick at least one line to mark as ordered', toastKind: 'warning' };
  const s0: WoStatus = status === 'order_materials' ? 'materials_ordered' : status;
  const adv = materialsAdvance(s0, linesAfter, scheduledDate, woNumber);
  const moved = adv.status !== s0;
  return {
    ok: true,
    status: adv.status,
    toast: orderMaterialsToast(poCount, woNumber, moved ? adv.status : null),
    activity: [`Work Order ${woNumber}: ${poCount} PO${poCount === 1 ? '' : 's'} marked as ordered`, ...(adv.activity ? [adv.activity] : [])],
  };
}

/** Refusal when a ticked line has no PO # (`submitOrderMaterials`). */
export const ORDER_NEEDS_PO_TOAST = 'Every selected line needs a PO #';

/** Refusal when nothing was ticked (`submitOrderMaterials`). */
export const ORDER_NOTHING_TICKED_TOAST = 'Tick at least one line to mark as ordered';

/**
 * What a line opens with in the Order Materials window
 * (`openOrderMaterialsModal`, main L21032): PO # "WO-330-1" (the work order
 * number + the line's place), Order Date today, Est. Delivery two weeks out,
 * Est. Freight blank.
 */
export function orderMaterialsLineDefaults(woNumber: string, index: number, today: ISODate): { poNumber: string; orderDate: ISODate; estimatedDelivery: ISODate; freight: '' } {
  return { poNumber: `${woNumber}-${index + 1}`, orderDate: today, estimatedDelivery: addDays(today, 14), freight: '' };
}

/**
 * `_nextJobPONumber` (main L21030): each purchase order Finish creates gets
 * the next "JPO-0000" record number (the vendor-facing PO # stays the
 * line's "WO-330-1").
 */
export function nextJobPONumber(counter: number): { number: string; counter: number } {
  const n = (Number(counter) || 0) + 1;
  return { number: 'JPO-' + String(n).padStart(4, '0'), counter: n };
}

/** The window's "💡 How this works" copy (main L21115): still to order, and everything done. */
export const ORDER_MATERIALS_INFO = {
  todo: "Tick the checkbox on each line you've placed an order for. PO #s are auto-numbered (editable). Order Date defaults to today; Est. Delivery defaults to two weeks out (editable, not required). Pressing Finish creates the selected POs in the Ordered tab. Unticked lines stay here for next time. Rows already allocated or PO'd show as locked — a PO'd row's dates and est. freight can still change and save to its PO.",
  done: "Every material line is either allocated from on-hand inventory or already has a PO. Rows are shown for reference — a PO'd row's dates and est. freight can still change and save to its PO.",
} as const;

/** Toast after a PO'd line's date or freight is changed in the window (`_omUpdatePO`, main L21160). */
export function poFieldSavedToast(poNumber: string, field: 'orderDate' | 'estimatedDelivery' | 'freight'): string {
  const label = field === 'orderDate' ? 'order date' : field === 'estimatedDelivery' ? 'est. delivery' : 'est. freight';
  return `✓ ${poNumber} ${label} saved`;
}

/** The confirm Order Materials asks on a work order with no material lines. */
export function noMaterialsConfirm(hasDate: boolean): { text: string; to: WoStatus } {
  return {
    text: `This work order has no materials. Mark materials ordered and move it to ${hasDate ? 'Scheduled' : 'Ready to Schedule'}?`,
    to: hasDate ? 'scheduled' : 'ready_to_schedule',
  };
}

// ----------------------------------------------- automatic moves (sweep) --

export interface SweepJob {
  number: string;
  status: WoStatus;
  scheduledDate?: ISODate | null;
  durationDays?: number | null;
}

export interface SweepResult {
  status: WoStatus;
  /** The completion date the app stamps (the install END, not today). */
  completedAt: ISODate | null;
  activity: string[];
}

/**
 * One work order through `_plAutoAdvanceSweep` (main L29503), run on load and
 * every 10 minutes: (1) Scheduled / In Progress whose install END is before
 * today → completed as of the end date (Final Invoice, or Ready to be Paid
 * when any invoice on the job is paid); (2) Final Invoice whose every
 * non-void invoice is paid → Ready to be Paid. No toast. Null when nothing
 * moves (including a job open in an editor, which waits for the next pass).
 */
export function autoAdvance(
  job: SweepJob,
  today: ISODate,
  invoices: { anyPaid: boolean; allPaid: boolean },
): SweepResult | null {
  let status = job.status;
  let completedAt: ISODate | null = null;
  const activity: string[] = [];
  if (status === 'scheduled' || status === 'in_progress') {
    const end = installEnd(job.scheduledDate, job.durationDays);
    if (end && end < today) {
      status = invoices.anyPaid ? 'ready_to_be_paid' : 'final_invoice';
      completedAt = end;
      activity.push(`Job ${job.number} → ${WO_LABELS[status]} (install ended ${fmtDate(end)})`);
    }
  }
  if (status === 'final_invoice' && invoices.allPaid) {
    status = 'ready_to_be_paid';
    activity.push(`Job ${job.number} → Ready to be Paid (invoice paid in full)`);
  }
  return activity.length ? { status, completedAt, activity } : null;
}

/** `_woGroupPaidInFull` (main L29498): at least one non-void invoice, and every one of them paid. */
export function allInvoicesPaid(invoices: ReadonlyArray<{ status?: string | null }>): boolean {
  const live = invoices.filter((i) => i && i.status !== 'void');
  return live.length > 0 && live.every((i) => i.status === 'paid');
}

// ------------------------------------------------ Job Costing lifecycle --

export interface GroupMember {
  number: string;
  status: WoStatus;
}

export type GroupStep =
  | { ok: true; to: WoStatus; members: string[]; confirm: string | null; toast: string; activity: string[] }
  | { ok: false; toast: string; toastKind: 'error' | 'info' };

const groupLabel = (numbers: string[]) => (numbers.length > 1 ? `${numbers.length} work orders on this job` : numbers[0]!);

/**
 * Job Costing's "💰 Mark Paid" (`jcMarkGroupPaid`, main L29577): every sheet
 * of the job must be at Ready to be Paid (or already closed); the waiting
 * ones go to Paid together, are stamped `paidAt`, and leave the board for the
 * Archive. `commissionOwed` adds the app's reminder to the confirm.
 */
export function markGroupPaid(members: readonly GroupMember[], commissionOwed = false): GroupStep {
  const early = members.filter((m) => !['ready_to_be_paid', 'paid', 'complete'].includes(m.status));
  if (early.length) return { ok: false, toast: `Not ready — ${early.map((m) => m.number).join(', ')} still at ${WO_LABELS[early[0]!.status]}`, toastKind: 'error' };
  const waiting = members.filter((m) => m.status === 'ready_to_be_paid').map((m) => m.number);
  if (!waiting.length) return { ok: false, toast: 'Already paid', toastKind: 'info' };
  const label = groupLabel(waiting);
  return {
    ok: true,
    to: 'paid',
    members: waiting,
    confirm: `Mark ${label} Paid?\n\nThis closes the job out: it leaves the Pipeline board and moves to Projects → Archive.${commissionOwed ? '\n\nThe commission has not been paid out yet — it stays listed under Commission due.' : ''}`,
    toast: `💰 ${label} marked Paid — moved to the Archive`,
    activity: waiting.map((n) => `Job ${n} → Paid (marked in Job Costing)`),
  };
}

const STAGE_DONE: readonly WoStatus[] = ['final_invoice', 'ready_to_be_paid', 'paid', 'complete'];

/**
 * Job Costing's "Mark complete" (`jcMarkGroupComplete`, main L29552): every
 * sheet not yet complete is completed together (Final Invoice).
 */
export function markGroupComplete(members: readonly GroupMember[]): GroupStep {
  const todo = members.filter((m) => !STAGE_DONE.includes(m.status)).map((m) => m.number);
  if (!todo.length) return { ok: false, toast: 'Already complete', toastKind: 'info' };
  const label = groupLabel(todo);
  return {
    ok: true,
    to: 'final_invoice',
    members: todo,
    confirm: `Mark ${label} complete?\n\nThis consumes any allocated inventory and moves the job to Final Invoice. It goes to Ready to be Paid once the final invoice is paid in full.`,
    toast: `✅ ${label} marked complete — now at Final Invoice`,
    activity: [],
  };
}

// ----------------------------------------------------------------- toasts --

/** `completeJob` toast (main L19526). */
export function completeToast(woNumber: string, newStatus: WoStatus): string {
  return `Job ${woNumber} marked complete — Status: ${WO_LABELS[newStatus]}`;
}
/** `markJobPaid` toast (main L19552). */
export function markPaidToast(woNumber: string): string {
  return `Job ${woNumber} marked as Paid`;
}
/** `_ndMarkJobStarted` toast (main L6187). */
export function startedToast(woNumber: string): string {
  return `▶️ ${woNumber} marked in progress`;
}
/** Warning when the schedule dialog is saved empty (main L19492). */
export const SCHEDULE_EMPTY_TOAST = 'Pick the install dates or assign an installer';
/**
 * `saveScheduleJob` toasts (main L19484): with a start date the install range
 * (`days` on site, default 1) — "📅 WO-330 scheduled for Oct 21, 2026 →
 * Oct 22, 2026 (2 days) · Ruben Ortiz" — else the installer-only line, or
 * the empty warning when neither a date nor an installer was given.
 */
export function scheduleToast(woNumber: string, date: ISODate | null, installerName: string | null, days?: number | null): string {
  if (!date && !installerName) return SCHEDULE_EMPTY_TOAST;
  const when = date ? installRangeLabel(date, days) : '';
  if (date && installerName) return `📅 ${woNumber} scheduled for ${when} · ${installerName}`;
  if (date) return `📅 ${woNumber} scheduled for ${when}`;
  return `👷 ${woNumber}: ${installerName} assigned (no date yet)`;
}

export type ScheduleSave =
  | { ok: true; status: WoStatus; durationDays: number | null; toast: string }
  | { ok: false; toast: string; toastKind: 'warning' };

/**
 * The schedule dialog's Save (`saveScheduleJob`, main L19484): start + end
 * are a pair — a start needs its end and a bad range is refused before
 * anything changes; an installer alone moves Materials Ordered to Ready to
 * Schedule; a start date moves the job to Scheduled.
 */
export function saveSchedule(
  status: WoStatus,
  woNumber: string,
  input: { start?: ISODate | null; end?: ISODate | null; installerId?: string | null; installerName?: string | null },
): ScheduleSave {
  const date = input.start || '';
  const end = input.end || '';
  const installer = input.installerId || '';
  if (!date && !end && !installer) return { ok: false, toast: SCHEDULE_EMPTY_TOAST, toastKind: 'warning' };
  const span = date || end ? installSpan(date, end) : null;
  if (span && span.error !== undefined) return { ok: false, toast: span.error, toastKind: 'warning' };
  const next = woTransition(status, { type: 'schedule', date: date || null, installer: installer || null, end: end || null });
  const days = span ? span.days! : null;
  return {
    ok: true,
    status: next,
    durationDays: days,
    toast: scheduleToast(woNumber, date || null, installer ? input.installerName || installer : null, days),
  };
}
