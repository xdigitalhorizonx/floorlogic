import { describe, expect, it } from 'vitest';
import {
  completeToast, MANAGE_POS, markPaidToast, scheduleToast, showsManagePOs, startedToast, WO_COLORS, WO_COLORS_APP, WO_LABELS, WO_PIPELINE,
  WO_SEQUENCE, WO_STATUSES, woPrimaryAction, woTransition, type WoEvent, type WoStatus,
} from '../../src/lib/logic';

const paid = { hasLinkedInvoice: true, anyInvoicePaid: true };
const unpaid = { hasLinkedInvoice: true, anyInvoicePaid: false };

describe('work-order stages', () => {
  it('sequence and labels', () => {
    expect(WO_PIPELINE).toEqual(['order_materials', 'materials_ordered', 'ready_to_schedule', 'scheduled', 'in_progress', 'final_invoice', 'ready_to_be_paid']);
    expect(WO_SEQUENCE.map((s) => WO_LABELS[s])).toEqual([
      'Order Materials', 'Materials Ordered', 'Ready to Schedule', 'Scheduled', 'In Progress', 'Final Invoice', 'Ready to be Paid', 'Paid',
    ]);
  });

  it('one primary control per status', () => {
    const label = (s: WoStatus, ctx = unpaid) => {
      const a = woPrimaryAction(s, ctx);
      return a ? a.label : null;
    };
    expect(WO_SEQUENCE.map((s) => label(s))).toEqual([
      '📦 Order Materials', '✅ Ready to Schedule', '📅 Schedule Install', '✅ Mark Job Complete', '✅ Mark Job Complete',
      '📄 View Final Invoice', '💰 Mark as Paid…', '✅ Paid in Full',
    ]);
    expect(woPrimaryAction('paid', unpaid)).toEqual({ kind: 'text', label: '✅ Paid in Full' });
    expect(woPrimaryAction('final_invoice', { hasLinkedInvoice: false, anyInvoicePaid: false })).toBeNull();
    expect(['complete', 'on_hold', 'cancelled'].map((s) => woPrimaryAction(s as WoStatus, paid))).toEqual([null, null, null]);
  });

  it('"Mark as Paid…" (installer payout) is disabled until the linked invoice is paid', () => {
    expect(woPrimaryAction('ready_to_be_paid', unpaid)).toEqual({
      kind: 'button', action: 'markPaid', label: '💰 Mark as Paid…', variant: 'success', enabled: false,
      title: 'Disabled — the linked invoice must be marked Paid first',
    });
    expect(woPrimaryAction('ready_to_be_paid', paid)).toMatchObject({
      enabled: true, title: 'Record payment for this WO (and optionally bundle other WOs in the same payment)',
    });
  });

  it('"Manage POs" sits beside every status after Order Materials', () => {
    expect(WO_STATUSES.filter((s) => showsManagePOs(s))).toEqual(WO_STATUSES.filter((s) => s !== 'order_materials'));
    expect(MANAGE_POS).toEqual({ label: '📦 Manage POs', title: 'Open the materials order window again' });
  });

  it('events walk a job through every stage', () => {
    const events: WoEvent[] = [
      { type: 'materialsOrdered' },
      { type: 'materialsIn', scheduledDate: null },
      { type: 'schedule', date: '2026-10-21', installer: 'ct-ins-1' },
      { type: 'start' },
      { type: 'complete', anyInvoicePaid: false },
      { type: 'invoicePaid' },
      { type: 'markPaid' },
    ];
    const seen: WoStatus[] = ['order_materials'];
    for (const e of events) seen.push(woTransition(seen[seen.length - 1]!, e));
    expect(seen).toEqual(WO_SEQUENCE);
  });

  it('transition edge cases match the app', () => {
    expect(woTransition('order_materials', { type: 'materialsIn', scheduledDate: '2026-10-21' })).toBe('scheduled');
    expect(woTransition('scheduled', { type: 'materialsOrdered' })).toBe('scheduled');
    expect(woTransition('materials_ordered', { type: 'schedule', installer: 'ct-ins-1' })).toBe('ready_to_schedule');
    expect(woTransition('ready_to_schedule', { type: 'schedule', installer: 'ct-ins-1' })).toBe('ready_to_schedule');
    expect(woTransition('order_materials', { type: 'schedule', date: '2026-10-21' })).toBe('scheduled');
    expect(woTransition('scheduled', { type: 'complete', anyInvoicePaid: true })).toBe('ready_to_be_paid');
    expect(woTransition('scheduled', { type: 'invoicePaid' })).toBe('scheduled');
  });

  it('toasts', () => {
    expect(completeToast('WO-330', 'final_invoice')).toBe('Job WO-330 marked complete — Status: Final Invoice');
    expect(markPaidToast('WO-330')).toBe('Job WO-330 marked as Paid');
    expect(startedToast('WO-330')).toBe('▶️ WO-330 marked in progress');
    expect(scheduleToast('WO-330', '2026-10-21', 'Ruben Ortiz')).toBe('📅 WO-330 scheduled for Oct 21, 2026 · Ruben Ortiz');
    expect(scheduleToast('WO-330', '2026-10-21', null)).toBe('📅 WO-330 scheduled for Oct 21, 2026');
    expect(scheduleToast('WO-330', null, 'Ruben Ortiz')).toBe('👷 WO-330: Ruben Ortiz assigned (no date yet)');
    expect(scheduleToast('WO-330', null, null)).toBe('Pick a date or assign an installer');
  });

  it('badge colours: app hues and site AA variants', () => {
    expect(WO_COLORS_APP.order_materials).toBe('#8B5CF6');
    expect(WO_COLORS.order_materials).toBe('#7C3AED');
    expect(WO_COLORS.final_invoice).toBe('#C2410C');
    expect(WO_COLORS.paid).toBe('#047857');
  });
});
