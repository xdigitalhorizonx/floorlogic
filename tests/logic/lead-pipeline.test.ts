import { describe, expect, it } from 'vitest';
import {
  advanceLabel, advanceTip, approveConfirmText, approveLead, approveToast, BOARD_STATUSES, canDrop, cardPrimaryAction, changeStatus,
  columnBucket, followUpState, isLeadStale, LEAD_COLORS, LEAD_COLORS_APP, LEAD_LABELS, LEAD_STATUSES, lostConfirmText, nextLeadNumber,
  nextStatus, setSurveyDate, SURVEY_DATE_REQUIRED_TOAST, surveyTaskTitle, surveyToast, type Lead,
} from '../../src/lib/logic';

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'ld-16', number: 'LD-056', name: 'Dev & Anjali Prasad', phone: '(775) 555-0506', email: 'dev@example.test', city: 'Reno, NV',
  type: 'Retail', projectType: 'LVP — great room + kitchen', source: 'Home Show', status: 'send_quote', estimatedValue: 9600,
  salesRepId: 'ct-rep-2', siteSurveyDate: '2026-10-12', followUpDate: '2026-10-15', createdAt: '2026-10-06',
  stageChangedAt: '2026-10-13', stageAgeDays: 1, quoteCount: 1, sampleCount: 1, ...over,
});

describe('statuses, labels, colours', () => {
  it('order, labels and board columns match the app', () => {
    expect(LEAD_STATUSES).toEqual(['new', 'site_survey_scheduled', 'send_quote', 'follow_up', 'approved', 'lost']);
    expect(BOARD_STATUSES).toEqual(['new', 'site_survey_scheduled', 'send_quote', 'follow_up', 'approved']);
    expect(LEAD_LABELS).toEqual({ new: 'New', site_survey_scheduled: 'Site Survey Scheduled', send_quote: 'Send Quote', follow_up: 'Follow-up', approved: 'Approved', lost: 'Lost' });
  });
  it('app colours are blue / indigo / amber / pink / green (+ gray), site colours are their AA variants', () => {
    expect(LEAD_COLORS_APP).toEqual({ new: '#3B82F6', site_survey_scheduled: '#6366F1', send_quote: '#F59E0B', follow_up: '#EC4899', approved: '#10B981', lost: '#6B7280' });
    expect(LEAD_COLORS).toEqual({ new: '#2563EB', site_survey_scheduled: '#4F46E5', send_quote: '#B45309', follow_up: '#BE185D', approved: '#047857', lost: '#4B5563' });
  });
});

describe('advancing', () => {
  it.each([
    ['new', 'site_survey_scheduled'],
    ['site_survey_scheduled', 'send_quote'],
    ['send_quote', 'follow_up'],
    ['follow_up', 'approved'],
    ['approved', 'lost'], // app quirk
    ['lost', null],
    ['quote_sent', null],
  ])('nextStatus(%s) = %s', (from, to) => expect(nextStatus(from)).toBe(to));

  it('card primary action per status', () => {
    expect(cardPrimaryAction({ status: 'new' })).toEqual({ kind: 'surveyPicker', tip: 'Pick a site-survey date — auto-moves this lead to Site Survey Scheduled' });
    expect(cardPrimaryAction({ status: 'site_survey_scheduled' })).toEqual({ kind: 'none' });
    expect(cardPrimaryAction({ status: 'send_quote' })).toEqual({ kind: 'advance', to: 'follow_up', label: '→ Follow-up', tip: 'Advance to Follow-up', approves: false });
    expect(cardPrimaryAction({ status: 'follow_up' })).toEqual({ kind: 'advance', to: 'approved', label: '→ Approved', tip: 'Advance to Approved', approves: true });
    expect(cardPrimaryAction({ status: 'approved' })).toMatchObject({ kind: 'advance', to: 'lost', label: '→ Lost' });
    expect(cardPrimaryAction({ status: 'lost' })).toEqual({ kind: 'none' });
    expect([advanceLabel('send_quote'), advanceTip('send_quote')]).toEqual(['→ Send Quote', 'Advance to Send Quote']);
  });
});

describe('drag and drop', () => {
  it('same column does nothing', () => {
    expect(canDrop(lead(), 'send_quote')).toEqual({ ok: false, reason: 'same-status', toast: null, toastKind: null });
  });
  it('Site Survey Scheduled needs a survey date first', () => {
    expect(canDrop(lead({ status: 'new', siteSurveyDate: null }), 'site_survey_scheduled')).toEqual({
      ok: false, reason: 'needs-survey-date', toast: '📐 Set a site-survey date on the card first — that auto-moves it here.', toastKind: 'warning',
    });
    expect(SURVEY_DATE_REQUIRED_TOAST).toBe('📐 Set a site-survey date on the card first — that auto-moves it here.');
    expect(canDrop(lead({ status: 'new', siteSurveyDate: '2026-10-16' }), 'site_survey_scheduled')).toEqual({ ok: true, to: 'site_survey_scheduled', confirm: null, approves: false });
  });
  it('Approved asks the exact confirm and approves', () => {
    const r = canDrop(lead(), 'approved');
    expect(r).toEqual({
      ok: true, to: 'approved', approves: true,
      confirm: 'Move Dev & Anjali Prasad to Approved? This will convert the lead to a customer and create a work order + invoice.',
    });
    expect(approveConfirmText({ name: 'X' })).toBe('Move X to Approved? This will convert the lead to a customer and create a work order + invoice.');
  });
  it('Lost asks to confirm; other columns move straight away', () => {
    expect(canDrop(lead(), 'lost')).toEqual({ ok: true, to: 'lost', confirm: 'Mark Dev & Anjali Prasad as Lost?', approves: false });
    expect(lostConfirmText({ name: 'Bill Hargrove' })).toBe('Mark Bill Hargrove as Lost?');
    expect(canDrop(lead(), 'follow_up')).toEqual({ ok: true, to: 'follow_up', confirm: null, approves: false });
    expect(canDrop(lead(), 'new')).toEqual({ ok: true, to: 'new', confirm: null, approves: false });
  });
  it('changeStatus restarts the stage clock', () => {
    expect(changeStatus(lead(), 'follow_up', '2026-10-14')).toMatchObject({ status: 'follow_up', stageChangedAt: '2026-10-14', stageAgeDays: 0 });
  });
});

describe('survey date', () => {
  it('setting a date on a New card moves it to Site Survey Scheduled, with the app’s toast and task', () => {
    const r = setSurveyDate(lead({ status: 'new', siteSurveyDate: null, stageAgeDays: 3 }), '2026-10-16', '2026-10-14');
    expect(r.lead).toMatchObject({ status: 'site_survey_scheduled', siteSurveyDate: '2026-10-16', stageChangedAt: '2026-10-14', stageAgeDays: 0 });
    expect(r.toast).toBe('📐 Survey set for Oct 16, 2026 · Dev & Anjali Prasad → Site Survey Scheduled');
    expect(r.task).toEqual({ title: 'Site survey: Dev & Anjali Prasad', description: 'Visit Reno, NV to measure and assess the site.', priority: 'high', dueDate: '2026-10-16' });
    expect(surveyTaskTitle({ name: 'Hannah Brooks' })).toBe('Site survey: Hannah Brooks');
    expect(surveyToast({ name: 'Hannah Brooks' }, '2026-10-17')).toBe('📐 Survey set for Oct 17, 2026 · Hannah Brooks → Site Survey Scheduled');
  });
  it('later stages keep their status (the app still shows the same toast)', () => {
    const r = setSurveyDate(lead({ status: 'follow_up' }), '2026-10-20', '2026-10-14');
    expect(r.lead.status).toBe('follow_up');
    expect(r.toast).toBe('📐 Survey set for Oct 20, 2026 · Dev & Anjali Prasad → Site Survey Scheduled');
  });
  it('clearing the date sends a scheduled lead back to New', () => {
    const r = setSurveyDate(lead({ status: 'site_survey_scheduled' }), null, '2026-10-14');
    expect(r.lead).toMatchObject({ status: 'new', siteSurveyDate: null, stageChangedAt: '2026-10-14' });
    expect(r.toast).toBeNull();
    expect(setSurveyDate(lead({ status: 'follow_up' }), '', '2026-10-14').lead.status).toBe('follow_up');
  });
});

describe('approving a lead from the board', () => {
  it('bumps job + invoice counters, pads to 3 digits, value becomes the invoice', () => {
    const r = approveLead(lead({ number: 'LD-059', name: 'Meadowbrook Villas HOA', estimatedValue: 28800, type: 'Property Management' }),
      { lead: 60, quote: 330, job: 327, invoice: 324 }, '2026-10-14');
    expect(r.workOrder).toMatchObject({ number: 'WO-328', status: 'order_materials', quoteId: null, scheduledDate: '', crew: '', createdAt: '2026-10-14' });
    expect(r.invoice).toMatchObject({ number: 'IN-325', subtotal: 28800, tax: 0, total: 28800, payments: [], status: 'unpaid', dueDate: '2026-11-13' });
    expect(r.counters).toEqual({ lead: 60, quote: 330, job: 328, invoice: 325 });
    expect(r.customer).toMatchObject({ name: 'Meadowbrook Villas HOA', type: 'Property Management', customerSince: '2026-10-14', convertedFromLeadId: 'ld-16' });
    expect(r.invoice.customerId).toBe(r.customer.id);
    expect(r.invoice.jobId).toBe(r.workOrder.id);
    expect(r.lead.status).toBe('approved');
    expect(r.removedFromBoard).toBe(true);
    expect(r.toast).toBe('Lead LD-059 approved! Work Order WO-328 & Invoice IN-325 created.');
    expect(approveToast('LD-1', 'WO-001', 'IN-001')).toBe('Lead LD-1 approved! Work Order WO-001 & Invoice IN-001 created.');
  });
  it('small counters still pad', () => {
    expect(approveLead(lead(), { job: 6, invoice: 9 }, '2026-10-14').toast).toBe('Lead LD-056 approved! Work Order WO-007 & Invoice IN-010 created.');
  });
  it('next lead number', () => {
    expect(nextLeadNumber({ lead: 60 })).toEqual({ number: 'LD-061', counters: { lead: 61 } });
  });
});

describe('card decorations', () => {
  it('stale thresholds per stage', () => {
    expect(isLeadStale({ status: 'new', stageAgeDays: 7 })).toBe(true);
    expect(isLeadStale({ status: 'new', stageAgeDays: 6 })).toBe(false);
    expect(isLeadStale({ status: 'follow_up', stageAgeDays: 13 })).toBe(false);
    expect(isLeadStale({ status: 'approved', stageAgeDays: 500 })).toBe(false);
  });
  it('follow-up state', () => {
    expect(followUpState(null, '2026-10-14')).toBeNull();
    expect(followUpState('2026-10-13', '2026-10-14')).toBe('overdue');
    expect(followUpState('2026-10-14', '2026-10-14')).toBe('today');
    expect(followUpState('2026-10-21', '2026-10-14')).toBe('soon');
    expect(followUpState('2026-10-22', '2026-10-14')).toBe('scheduled');
  });
  it('column buckets by lead age', () => {
    expect(['2026-10-14', '2026-10-13', '2026-10-07', '2026-09-14', '2026-09-13'].map((d) => columnBucket(d, '2026-10-14'))).toEqual(['today', 'today', 'week', 'month', 'older']);
  });
});
