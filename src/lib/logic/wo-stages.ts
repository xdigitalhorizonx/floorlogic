/**
 * Work-order stages: the status sequence, the one primary button per status,
 * the always-there "Manage POs" button, and how events move a work order.
 *
 * Source (main): L6514-6515 colours + labels; L14476-14483 "Mark as Paid…"
 * gating; L14572 header buttons; L5066 `_ndMarkJobStarted`; L16882-16910
 * `saveScheduleJob`; L16915-16940 `completeJob`; L16941 `markJobPaid`;
 * L18554 `PIPELINE_STAGES`; L18567-18575 `JOB_BUCKETS`; L18814-18825
 * `_matMaybeAdvance`; L24743-24750 `_advanceJobToReady` (run when the linked
 * invoice is paid in full, main L18355 / L25156).
 */
import { fmtDate, type ISODate } from './dates';
import { JOB_STATUS_COLOR_NAMES, appHex, siteHex } from './status-colors';

export const WO_STATUSES = [
  'order_materials', 'materials_ordered', 'ready_to_schedule', 'scheduled', 'in_progress',
  'final_invoice', 'ready_to_be_paid', 'paid', 'complete', 'on_hold', 'cancelled',
] as const;
export type WoStatus = (typeof WO_STATUSES)[number];

/** Active stages, left → right, as the job board orders them (main L18554). */
export const WO_PIPELINE: readonly WoStatus[] = [
  'order_materials', 'materials_ordered', 'ready_to_schedule', 'scheduled', 'in_progress', 'final_invoice', 'ready_to_be_paid',
];

/** The happy path a sold job walks, ending at Paid (installer paid out). */
export const WO_SEQUENCE: readonly WoStatus[] = [...WO_PIPELINE, 'paid'];

/** main L6515 */
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

/** Job board columns (main L18567-18575). */
export const WO_BUCKETS = [
  { key: 'materials', label: 'Materials', icon: '🧱', color: 'purple', statuses: ['order_materials', 'materials_ordered'], sub: 'order / assign, then receive' },
  { key: 'schedule', label: 'Ready to Schedule', icon: '🗓️', color: 'amber', statuses: ['ready_to_schedule'], sub: 'materials in — needs a date' },
  { key: 'scheduled', label: 'Scheduled', icon: '📅', color: 'blue', statuses: ['scheduled', 'in_progress'], sub: 'installers pull materials day-of' },
  { key: 'final_invoice', label: 'Final Invoice', icon: '🧾', color: 'orange', statuses: ['final_invoice'], sub: 'installed — collect the balance' },
  { key: 'costing', label: 'Costing & Payout', icon: '🧮', color: 'amber', statuses: ['ready_to_be_paid'], sub: 'paid in full — cost it, pay commissions' },
  { key: 'on_hold', label: 'On Hold', icon: '⏸️', color: 'gray', statuses: ['on_hold'], sub: '' },
  { key: 'done', label: 'Done', icon: '✅', color: 'green', statuses: ['paid', 'complete'], sub: '' },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: string; color: string; statuses: readonly WoStatus[]; sub: string }>;

// --------------------------------------------------------- header buttons --

export const SCHEDULE_TITLE = 'Pick an install date and assign an installer';
export const MARK_PAID_TITLE = 'Record payment for this WO (and optionally bundle other WOs in the same payment)';
export const MARK_PAID_DISABLED_TITLE = 'Disabled — the linked invoice must be marked Paid first';

export interface WoActionContext {
  /** An invoice is linked to this work order. */
  hasLinkedInvoice: boolean;
  /** At least one invoice on this work order has status 'paid'. */
  anyInvoicePaid: boolean;
}

export type WoAction = 'orderMaterials' | 'schedule' | 'complete' | 'viewFinalInvoice' | 'markPaid';

export type WoPrimary =
  | { kind: 'button'; action: WoAction; label: string; variant: 'primary' | 'success' | 'warning'; enabled: boolean; title: string | null }
  | { kind: 'text'; label: string }
  | null;

/**
 * The single status-driven control in the work-order header (main L14572):
 * 📦 Order Materials → ✅ Ready to Schedule → 📅 Schedule Install →
 * ✅ Mark Job Complete → 📄 View Final Invoice → 💰 Mark as Paid… →
 * "✅ Paid in Full" (plain text). "Mark as Paid…" pays the installer and is
 * disabled until an invoice on the job is Paid.
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

/** "📦 Manage POs" (outline) shows on every status except Order Materials (main L14572). */
export function showsManagePOs(status: WoStatus): boolean {
  return status !== 'order_materials';
}
export const MANAGE_POS = { label: '📦 Manage POs', title: 'Open the materials order window again' } as const;

// ------------------------------------------------------------ transitions --

export type WoEvent =
  /** A material line was ordered (PO or a tap) — main L18823. */
  | { type: 'materialsOrdered' }
  /** Every material line is in — main L18818-18821. */
  | { type: 'materialsIn'; scheduledDate?: ISODate | null }
  /** Schedule dialog saved — main L16893-16898. */
  | { type: 'schedule'; date?: ISODate | null; installer?: string | null }
  /** "Mark in progress" — main L5066. */
  | { type: 'start' }
  /** "Mark Job Complete" — main L16935. */
  | { type: 'complete'; anyInvoicePaid: boolean }
  /** The linked invoice was paid in full — main L24743. */
  | { type: 'invoicePaid' }
  /** Installer paid out ("Mark as Paid…") — main L16941. */
  | { type: 'markPaid' };

/** Where a work order goes on an event; unchanged when the event does not apply. */
export function woTransition(status: WoStatus, event: WoEvent): WoStatus {
  switch (event.type) {
    case 'materialsOrdered':
      return status === 'order_materials' ? 'materials_ordered' : status;
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

// ----------------------------------------------------------------- toasts --

/** main L16939 */
export function completeToast(woNumber: string, newStatus: WoStatus): string {
  return `Job ${woNumber} marked complete — Status: ${WO_LABELS[newStatus]}`;
}
/** main L16941 */
export function markPaidToast(woNumber: string): string {
  return `Job ${woNumber} marked as Paid`;
}
/** main L5066 */
export function startedToast(woNumber: string): string {
  return `▶️ ${woNumber} marked in progress`;
}
/**
 * main L16906-16909 (and the refusal at L16888). Returns the warning text
 * when neither a date nor an installer was given.
 */
export function scheduleToast(woNumber: string, date: ISODate | null, installerName: string | null): string {
  if (!date && !installerName) return 'Pick a date or assign an installer';
  if (date && installerName) return `📅 ${woNumber} scheduled for ${fmtDate(date)} · ${installerName}`;
  if (date) return `📅 ${woNumber} scheduled for ${fmtDate(date)}`;
  return `👷 ${woNumber}: ${installerName} assigned (no date yet)`;
}
