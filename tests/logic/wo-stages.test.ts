import { describe, expect, it } from 'vitest';
import {
  allInvoicesPaid, autoAdvance, completeToast, installEnd, installRangeLabel, installSpan, MANAGE_POS, markGroupComplete, markGroupPaid, markPaidToast,
  materialsAdvance, noMaterialsConfirm, orderMaterials, orderMaterialsToast, saveSchedule, scheduleToast, showsManagePOs, startedToast, WO_BUCKETS, WO_CLOSED,
  WO_COLORS, WO_COLORS_APP, WO_HUB_TABS, WO_LABELS, WO_PIPELINE, WO_SEQUENCE, WO_STATUSES, woBucketKey, woPrimaryAction, woTransition,
  type WoEvent, type WoStatus,
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

  it('board columns: no Done column — Paid / Complete live on the Archive tab', () => {
    expect(WO_BUCKETS.map((b) => b.key)).toEqual(['materials', 'schedule', 'scheduled', 'final_invoice', 'costing', 'on_hold']);
    expect(WO_BUCKETS[0]!.sub).toBe('order or assign from stock');
    expect(WO_BUCKETS[1]!.sub).toBe('materials ordered — needs a date');
    expect(WO_BUCKETS.filter((b) => b.optional).map((b) => b.key)).toEqual(['on_hold']);
    expect(WO_CLOSED).toEqual(['paid', 'complete']);
    expect(['paid', 'complete', 'scheduled', 'in_progress', 'nonsense'].map(woBucketKey)).toEqual(['archive', 'archive', 'scheduled', 'scheduled', 'materials']);
    expect(WO_HUB_TABS.map((t) => t.label)).toEqual(['Pipeline', 'Projects', 'All Jobs', 'Quotes', 'Archive']);
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

  it('"Mark as Paid…" (installer payout) is disabled until an invoice on the job is paid', () => {
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
});

describe('transitions', () => {
  it('events walk a job through every stage (ordering lines one at a time)', () => {
    const events: WoEvent[] = [
      { type: 'materialsOrdered' },
      { type: 'materialsIn', scheduledDate: null },
      { type: 'schedule', date: '2026-10-21', end: '2026-10-22', installer: 'ct-ins-1' },
      { type: 'start' },
      { type: 'complete', anyInvoicePaid: false },
      { type: 'invoicePaid' },
      { type: 'markPaid' },
    ];
    const seen: WoStatus[] = ['order_materials'];
    for (const e of events) seen.push(woTransition(seen[seen.length - 1]!, e));
    expect(seen).toEqual(WO_SEQUENCE);
  });

  it('every line ordered moves the job on by itself (new owner rule)', () => {
    expect(woTransition('order_materials', { type: 'materialsOrdered', allOrdered: true })).toBe('ready_to_schedule');
    expect(woTransition('order_materials', { type: 'materialsOrdered', allOrdered: true, scheduledDate: '2026-10-21' })).toBe('scheduled');
    expect(woTransition('materials_ordered', { type: 'materialsOrdered', allOrdered: true })).toBe('ready_to_schedule');
    expect(woTransition('scheduled', { type: 'materialsOrdered', allOrdered: false })).toBe('scheduled'); // a PO no longer knocks it back
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

  it('materials gate: lines that count, ordered vs in', () => {
    const lines = [{ productName: 'A', quantity: 5, poCreated: true }, { productName: 'B', quantity: 3 }, { quantity: 0 }, { productName: 'C', hidden: true }];
    expect(materialsAdvance('order_materials', lines, null, 'WO-1')).toEqual({ status: 'materials_ordered', activity: null });
    expect(materialsAdvance('materials_ordered', [lines[0]!, { ...lines[1]!, allocatedFromInventory: true }], null, 'WO-1'))
      .toEqual({ status: 'ready_to_schedule', activity: 'Job WO-1 → Ready to Schedule (all materials ordered)' });
    expect(materialsAdvance('order_materials', [lines[0]!], '2026-10-21', 'WO-1'))
      .toEqual({ status: 'scheduled', activity: 'Job WO-1 → Scheduled (materials ordered, date already set)' });
    expect(materialsAdvance('scheduled', [lines[0]!], null).status).toBe('scheduled');
    expect(materialsAdvance('order_materials', [], null).status).toBe('order_materials');
  });

  it('Order Materials → Finish', () => {
    const all = [{ productName: 'A', quantity: 5, poCreated: true }, { productName: 'B', quantity: 3, poCreated: true }];
    expect(orderMaterials('order_materials', 'WO-330', all, null, 2)).toEqual({
      ok: true, status: 'ready_to_schedule', toast: '✓ 2 POs marked as ordered — WO-330 → Ready to Schedule',
      activity: ['Work Order WO-330: 2 POs marked as ordered', 'Job WO-330 → Ready to Schedule (all materials ordered)'],
    });
    expect(orderMaterials('order_materials', 'WO-330', [all[0]!, { productName: 'B', quantity: 3 }], null, 1)).toMatchObject({ status: 'materials_ordered', toast: '✓ 1 PO marked as ordered' });
    expect(orderMaterials('scheduled', 'WO-330', all, '2026-10-21', 1)).toMatchObject({ status: 'scheduled', toast: '✓ 1 PO marked as ordered' });
    expect(orderMaterials('order_materials', 'WO-330', all, null, 0)).toEqual({ ok: false, toast: 'Tick at least one line to mark as ordered', toastKind: 'warning' });
    expect(orderMaterialsToast(4, 'WO-330', 'scheduled')).toBe('✓ 4 POs marked as ordered — WO-330 → Scheduled');
    expect(noMaterialsConfirm(false)).toEqual({ text: 'This work order has no materials. Mark materials ordered and move it to Ready to Schedule?', to: 'ready_to_schedule' });
  });
});

describe('install dates (start + end)', () => {
  it('a span is start → end inclusive; bad ranges are refused with the app’s words', () => {
    expect(installSpan('2026-11-10', '2026-11-10')).toEqual({ days: 1 });
    expect(installSpan('2026-11-10', '2026-11-12')).toEqual({ days: 3 });
    expect(installSpan('2026-10-31', '2026-11-02')).toEqual({ days: 3 }); // across the clock change
    expect(installSpan('2026-11-12', '2026-11-10')).toEqual({ error: 'The end date (Nov 10, 2026) is before the start (Nov 12, 2026).' });
    expect(installSpan('', '2026-11-10')).toEqual({ error: 'Pick a start date — the end date counts from it.' });
    expect(installSpan('', '')).toEqual({ error: 'Pick a start date.' });
    expect(installSpan('2026-11-10', '')).toEqual({ error: 'Pick an end date — the same day as the start for a one-day job.' });
    expect(installSpan('2026-11-10', '2027-11-11')).toEqual({ error: 'That is 367 days on site — 365 at most. Check the year.' });
    expect(installSpan('2026-11-10', '2027-11-09')).toEqual({ days: 365 });
  });

  it('end day and the range label', () => {
    expect(installEnd('2026-11-10', 3)).toBe('2026-11-12');
    expect(installEnd('2026-11-10', 0)).toBe('2026-11-10');
    expect(installEnd('', 3)).toBeNull();
    expect(installRangeLabel('2026-11-10', 3)).toBe('Nov 10, 2026 → Nov 12, 2026 (3 days)');
    expect(installRangeLabel('2026-11-10', 1)).toBe('Nov 10, 2026');
  });

  it('the schedule dialog saves start + end + installer', () => {
    expect(saveSchedule('ready_to_schedule', 'WO-330', { start: '2026-10-21', end: '2026-10-22', installerId: 'ct-ins-1', installerName: 'Ruben Ortiz' })).toEqual({
      ok: true, status: 'scheduled', durationDays: 2, toast: '📅 WO-330 scheduled for Oct 21, 2026 → Oct 22, 2026 (2 days) · Ruben Ortiz',
    });
    expect(saveSchedule('materials_ordered', 'WO-330', { installerId: 'ct-ins-1', installerName: 'Ruben Ortiz' })).toEqual({
      ok: true, status: 'ready_to_schedule', durationDays: null, toast: '👷 WO-330: Ruben Ortiz assigned (no date yet)',
    });
    expect(saveSchedule('ready_to_schedule', 'WO-330', { start: '2026-10-21' })).toEqual({ ok: false, toast: 'Pick an end date — the same day as the start for a one-day job.', toastKind: 'warning' });
    expect(saveSchedule('ready_to_schedule', 'WO-330', {})).toEqual({ ok: false, toast: 'Pick the install dates or assign an installer', toastKind: 'warning' });
  });
});

describe('automatic moves (the sweep)', () => {
  it('the day after the install END → completed as of the end date', () => {
    const job = { number: 'WO-7', status: 'scheduled' as WoStatus, scheduledDate: '2026-10-10', durationDays: 3 };
    expect(autoAdvance(job, '2026-10-14', { anyPaid: false, allPaid: false })).toEqual({
      status: 'final_invoice', completedAt: '2026-10-12', activity: ['Job WO-7 → Final Invoice (install ended Oct 12, 2026)'],
    });
    expect(autoAdvance(job, '2026-10-12', { anyPaid: false, allPaid: false })).toBeNull(); // last day on site
    expect(autoAdvance({ ...job, status: 'in_progress' }, '2026-10-14', { anyPaid: true, allPaid: false })).toMatchObject({ status: 'ready_to_be_paid' });
    expect(autoAdvance({ ...job, scheduledDate: '' }, '2026-10-14', { anyPaid: false, allPaid: false })).toBeNull();
  });
  it('every invoice paid in full → Ready to be Paid', () => {
    expect(autoAdvance({ number: 'WO-7', status: 'final_invoice' }, '2026-10-14', { anyPaid: true, allPaid: true })).toEqual({
      status: 'ready_to_be_paid', completedAt: null, activity: ['Job WO-7 → Ready to be Paid (invoice paid in full)'],
    });
    expect(allInvoicesPaid([{ status: 'paid' }, { status: 'void' }])).toBe(true);
    expect(allInvoicesPaid([{ status: 'paid' }, { status: 'deposit' }])).toBe(false);
    expect(allInvoicesPaid([])).toBe(false);
  });
});

describe('Job Costing closes a job out', () => {
  it('Mark Paid: every sheet at Ready to be Paid goes to Paid and the Archive', () => {
    expect(markGroupPaid([{ number: 'WO-5', status: 'ready_to_be_paid' }], true)).toEqual({
      ok: true, to: 'paid', members: ['WO-5'],
      confirm: 'Mark WO-5 Paid?\n\nThis closes the job out: it leaves the Pipeline board and moves to Projects → Archive.\n\nThe commission has not been paid out yet — it stays listed under Commission due.',
      toast: '💰 WO-5 marked Paid — moved to the Archive', activity: ['Job WO-5 → Paid (marked in Job Costing)'],
    });
    expect(markGroupPaid([{ number: 'WO-5', status: 'ready_to_be_paid' }, { number: 'WO-5-2', status: 'final_invoice' }]))
      .toEqual({ ok: false, toast: 'Not ready — WO-5-2 still at Final Invoice', toastKind: 'error' });
    expect(markGroupPaid([{ number: 'WO-5', status: 'paid' }])).toEqual({ ok: false, toast: 'Already paid', toastKind: 'info' });
    expect(markGroupPaid([{ number: 'WO-5', status: 'ready_to_be_paid' }, { number: 'WO-5-2', status: 'ready_to_be_paid' }])).toMatchObject({
      toast: '💰 2 work orders on this job marked Paid — moved to the Archive',
    });
  });
  it('Mark complete', () => {
    expect(markGroupComplete([{ number: 'WO-5', status: 'scheduled' }])).toMatchObject({ ok: true, to: 'final_invoice', toast: '✅ WO-5 marked complete — now at Final Invoice' });
    expect(markGroupComplete([{ number: 'WO-5', status: 'final_invoice' }])).toEqual({ ok: false, toast: 'Already complete', toastKind: 'info' });
  });
});

describe('toasts and colours', () => {
  it('toasts', () => {
    expect(completeToast('WO-330', 'final_invoice')).toBe('Job WO-330 marked complete — Status: Final Invoice');
    expect(markPaidToast('WO-330')).toBe('Job WO-330 marked as Paid');
    expect(startedToast('WO-330')).toBe('▶️ WO-330 marked in progress');
    expect(scheduleToast('WO-330', '2026-10-21', 'Ruben Ortiz')).toBe('📅 WO-330 scheduled for Oct 21, 2026 · Ruben Ortiz');
    expect(scheduleToast('WO-330', '2026-10-21', 'Ruben Ortiz', 3)).toBe('📅 WO-330 scheduled for Oct 21, 2026 → Oct 23, 2026 (3 days) · Ruben Ortiz');
    expect(scheduleToast('WO-330', '2026-10-21', null)).toBe('📅 WO-330 scheduled for Oct 21, 2026');
    expect(scheduleToast('WO-330', null, 'Ruben Ortiz')).toBe('👷 WO-330: Ruben Ortiz assigned (no date yet)');
    expect(scheduleToast('WO-330', null, null)).toBe('Pick the install dates or assign an installer');
  });

  it('badge colours: app hues and site AA variants', () => {
    expect(WO_COLORS_APP.order_materials).toBe('#8B5CF6');
    expect(WO_COLORS.order_materials).toBe('#7C3AED');
    expect(WO_COLORS.final_invoice).toBe('#C2410C');
    expect(WO_COLORS.paid).toBe('#047857');
  });
});

describe('schedule window and Order Materials helpers (site modules)', () => {
  it('span line under the End date (_rangeHintHTML)', async () => {
    const { installRangeHint, endFollowingStart } = await import('../../src/lib/logic');
    expect(installRangeHint('', '')).toEqual({ kind: 'empty', text: 'No install dates yet.' });
    expect(installRangeHint('2026-10-21', '2026-10-21')).toMatchObject({ kind: 'span', days: 1, label: 'One-day install', text: '📅 One-day install · Wed, Oct 21' });
    expect(installRangeHint('2026-10-21', '2026-10-22')).toMatchObject({ kind: 'span', days: 2, label: '2-day install', rest: ' · Wed, Oct 21 → Thu, Oct 22' });
    expect(installRangeHint('2026-10-22', '2026-10-21')).toEqual({ kind: 'error', text: '⚠ The end date (Oct 21, 2026) is before the start (Oct 22, 2026).' });
    expect(installRangeHint('', '2026-10-21')).toEqual({ kind: 'error', text: '⚠ Pick a start date — the end date counts from it.' });
    // Moving the start carries the end with it, same number of days.
    expect(endFollowingStart('2026-10-21', 1)).toBe('2026-10-21');
    expect(endFollowingStart('2026-10-28', 2)).toBe('2026-10-29');
    expect(endFollowingStart('', 2)).toBe('');
  });

  it('Order Materials line defaults, JPO numbers, freight toast', async () => {
    const { orderMaterialsLineDefaults, nextJobPONumber, poFieldSavedToast, ORDER_MATERIALS_INFO, ORDER_NOTHING_TICKED_TOAST } = await import('../../src/lib/logic');
    expect(orderMaterialsLineDefaults('WO-330', 0, '2026-10-15')).toEqual({ poNumber: 'WO-330-1', orderDate: '2026-10-15', estimatedDelivery: '2026-10-29', freight: '' });
    expect(orderMaterialsLineDefaults('WO-330', 3, '2026-10-30').estimatedDelivery).toBe('2026-11-13');
    expect(nextJobPONumber(1192)).toEqual({ number: 'JPO-1193', counter: 1193 });
    expect(nextJobPONumber(7).number).toBe('JPO-0008');
    expect(poFieldSavedToast('WO-330-2', 'freight')).toBe('✓ WO-330-2 est. freight saved');
    expect(poFieldSavedToast('WO-330-2', 'estimatedDelivery')).toBe('✓ WO-330-2 est. delivery saved');
    expect(ORDER_MATERIALS_INFO.todo).toContain('Pressing Finish creates the selected POs in the Ordered tab.');
    expect(ORDER_NOTHING_TICKED_TOAST).toBe('Tick at least one line to mark as ordered');
  });
});
