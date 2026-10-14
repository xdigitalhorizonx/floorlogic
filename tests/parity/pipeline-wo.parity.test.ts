/**
 * Lead board + work-order parity: the app's kanbanDrop, advanceLead,
 * approveLead, setLeadSurveyDate, completeJob, saveScheduleJob,
 * _matMaybeAdvance and _advanceJobToReady run in a sandbox against the site.
 */
import { describe, expect, it } from 'vitest';
import {
  approveLead, canDrop, cardPrimaryAction, completeToast, followUpState, isLeadStale, LEAD_LABELS, LEAD_STALE_DAYS, LEAD_STATUSES, markPaidToast,
  MARK_PAID_DISABLED_TITLE, MARK_PAID_TITLE, nextStatus, scheduleToast, SCHEDULE_TITLE, setSurveyDate, WO_BUCKETS, WO_LABELS, WO_PIPELINE,
  woPrimaryAction, woTransition, WO_STATUSES, type Lead, type LeadStatus, type WoStatus,
} from '../../src/lib/logic';
import { leads } from '../../src/data/sample-data';
import { code, sandbox } from './app-source';
import { fixedDate } from './helpers';

const noop = () => {};
const TODAY = '2026-10-14';
const NOW = Date.parse('2026-10-14T19:00:00Z');

/** Site lead → the app's lead record (address = the city, which is all the site keeps). */
const toApp = (l: Lead) => ({ ...l, address: l.city, notes: [], contacts: [] });

describe('lead constants', () => {
  const c = sandbox<Record<string, unknown>>('index', { consts: ['LEAD_STATUSES', 'LEAD_STATUS_LABELS', 'LEAD_STALE_DAYS'] });
  it('statuses, labels, stale days', () => {
    expect(c.LEAD_STATUSES).toEqual([...LEAD_STATUSES]);
    const { quote_sent: _a, ...labels } = c.LEAD_STATUS_LABELS as Record<string, string>;
    expect(labels).toEqual(LEAD_LABELS);
    const { quote_sent: _b, ...stale } = c.LEAD_STALE_DAYS as Record<string, number>;
    expect(stale).toEqual(LEAD_STALE_DAYS);
  });
});

describe('dropping a card (kanbanDrop)', () => {
  function appDrop(lead: Lead, to: string, answer: boolean) {
    const events: string[] = [];
    const app = toApp(lead);
    const win: { _kbDrag: { leadId: string } | null } = { _kbDrag: { leadId: lead.id } };
    const fns = sandbox<{ kanbanDrop: (ev: unknown, s: string) => void }>('index', { fns: ['kanbanDrop'] }, {
      window: win, document: { querySelectorAll: () => [], body: { classList: { remove: noop } } }, getLead: () => app,
      showToast: (t: string, k: string) => events.push(`toast:${k}:${t}`), confirm: (t: string) => { events.push(`confirm:${t}`); return answer; },
      approveLead: (id: string) => events.push(`approve:${id}`), changeLeadStatus: (id: string, s: string) => events.push(`change:${id}:${s}`),
    });
    fns.kanbanDrop({ preventDefault: noop }, to);
    return events;
  }

  it('every lead × every column × confirm yes/no', () => {
    for (const base of leads) for (const survey of [null, '2026-10-16']) for (const to of LEAD_STATUSES) for (const answer of [true, false]) {
      const lead = { ...base, siteSurveyDate: survey };
      const app = appDrop(lead, to, answer);
      const site = canDrop(lead, to as LeadStatus);
      const expected: string[] = [];
      if (!site.ok) { if (site.toast) expected.push(`toast:${site.toastKind}:${site.toast}`); }
      else {
        if (site.confirm) expected.push(`confirm:${site.confirm}`);
        if (!site.confirm || answer) expected.push(site.approves ? `approve:${lead.id}` : `change:${lead.id}:${to}`);
      }
      expect(app, `${lead.number} → ${to} (${answer})`).toEqual(expected);
    }
  });
});

describe('advancing (advanceLead) and the card button', () => {
  it('next status, approve path, and the button text in the card template', () => {
    for (const status of LEAD_STATUSES) {
      const events: string[] = [];
      const fns = sandbox<{ advanceLead: (id: string) => void }>('index', { fns: ['advanceLead'] }, {
        getLead: () => ({ id: 'x', status }), LEAD_STATUSES: [...LEAD_STATUSES],
        approveLead: (id: string) => events.push(`approve:${id}`), changeLeadStatus: (id: string, s: string) => events.push(`change:${id}:${s}`),
      });
      fns.advanceLead('x');
      const next = nextStatus(status);
      expect(events).toEqual(!next ? [] : next === 'approved' ? ['approve:x'] : [`change:x:${next}`]);
    }
    const tpl = code('index:text:lead-card-actions');
    expect(tpl).toContain("if(l.status==='new'){");
    expect(tpl).toContain("} else if(l.status==='site_survey_scheduled'){");
    expect(tpl).toContain('data-tip="Advance to ${LEAD_STATUS_LABELS[nextStatus]}"');
    expect(tpl).toContain('→ ${LEAD_STATUS_LABELS[nextStatus]}</button>');
    expect(tpl).toContain(`title="${(cardPrimaryAction({ status: 'new' }) as { tip: string }).tip}"`);
  });
});

describe('approving a lead (approveLead)', () => {
  it.each([[0, 0], [6, 9], [327, 324], [998, 999], [1000, 1200]])('counters job %s / invoice %s', (job, invoice) => {
    for (const l of leads.slice(0, 4)) {
      const toasts: string[] = [];
      const data = { counters: { job, invoice }, jobs: [] as Record<string, unknown>[], invoices: [] as Record<string, unknown>[], customers: [] as Record<string, unknown>[], leads: [toApp(l)] };
      const fns = sandbox<{ approveLead: (id: string) => void }>('index', { fns: ['approveLead', '_isoDay'] }, {
        data, getLead: (id: string) => data.leads.find((x) => x.id === id), addActivity: noop, showToast: (t: string) => toasts.push(t),
        saveData: noop, navigate: noop, _todayISO: () => TODAY, Date: fixedDate(NOW),
      });
      fns.approveLead(l.id);
      const s = approveLead(l, { job, invoice }, TODAY);
      const wo = data.jobs[0]!, inv = data.invoices[0]!, cu = data.customers[0]!;
      expect([wo.number, wo.status, wo.quoteId, wo.scheduledDate, wo.crew, wo.createdAt]).toEqual([s.workOrder.number, s.workOrder.status, null, '', '', TODAY]);
      expect([inv.number, inv.status, inv.tax, inv.dueDate, inv.payments]).toEqual([s.invoice.number, 'unpaid', 0, s.invoice.dueDate, []]);
      expect(Number(inv.subtotal)).toBe(s.invoice.subtotal);
      expect(Number(inv.total)).toBe(s.invoice.total);
      expect([cu.name, cu.type, cu.source, cu.salesRepId, cu.customerSince, cu.convertedFromLeadId]).toEqual([s.customer.name, s.customer.type, s.customer.source, s.customer.salesRepId, TODAY, l.id]);
      expect(data.counters).toEqual({ job: s.counters.job, invoice: s.counters.invoice });
      expect(data.leads).toEqual([]); // removed from the board
      expect(toasts).toEqual([s.toast]);
    }
  });
});

describe('survey date (setLeadSurveyDate)', () => {
  it('status move, toast and task match for every stage, set and cleared', () => {
    for (const status of LEAD_STATUSES) for (const date of ['2026-10-16', '']) {
      const lead: Lead = { ...leads[0]!, status, siteSurveyDate: status === 'site_survey_scheduled' ? '2026-10-15' : null };
      const app = toApp(lead) as Record<string, unknown>;
      const toasts: string[] = [];
      const tasks: Array<Record<string, unknown>> = [];
      const fns = sandbox<{ setLeadSurveyDate: (id: string, d: string) => void }>('index', { fns: ['setLeadSurveyDate', 'fmtDate'] }, {
        getLead: () => app, data: { tasks: [] }, addActivity: noop, saveData: noop, renderView: noop, refreshLeadKanban: noop,
        showToast: (t: string) => toasts.push(t), createTask: (t: Record<string, unknown>) => tasks.push(t), _todayISO: () => TODAY, Date: fixedDate(NOW),
      });
      fns.setLeadSurveyDate(lead.id, date);
      const s = setSurveyDate(lead, date || null, TODAY);
      expect(app.status, `${status} ${date}`).toBe(s.lead.status);
      expect(app.siteSurveyDate ?? null).toBe(s.lead.siteSurveyDate);
      expect(toasts).toEqual(s.toast ? [s.toast] : []);
      expect(tasks.map((t) => [t.title, t.description, t.priority])).toEqual(s.task ? [[s.task.title, s.task.description, s.task.priority]] : []);
      if (s.lead.status !== lead.status) expect(app.stageChangedAt).toBe(TODAY);
    }
  });
});

describe('card decorations', () => {
  it('stale + follow-up state', () => {
    const fns = sandbox<{ isLeadStale: (l: unknown) => boolean; getFollowUpState: (l: unknown) => string | null }>('index', {
      consts: ['LEAD_STALE_DAYS'], fns: ['isLeadStale', 'getLeadStageAgeDays', 'getFollowUpState', 'daysBetween'],
    }, { _todayISO: () => TODAY });
    for (const status of LEAD_STATUSES) for (let age = 0; age <= 20; age++) {
      const changed = new Date(Date.parse(TODAY) - age * 864e5).toISOString().slice(0, 10);
      expect(isLeadStale({ status, stageAgeDays: age })).toBe(fns.isLeadStale({ status, stageChangedAt: changed }));
    }
    for (let d = -3; d <= 10; d++) {
      const fu = new Date(Date.parse(TODAY) + d * 864e5).toISOString().slice(0, 10);
      expect(followUpState(fu, TODAY)).toBe(fns.getFollowUpState({ followUpDate: fu }));
    }
    expect(followUpState(null, TODAY)).toBe(fns.getFollowUpState({}));
  });
});

// ------------------------------------------------------------- work orders --

describe('work-order constants and header buttons', () => {
  const c = sandbox<Record<string, unknown>>('index', { consts: ['PIPELINE_STAGES', 'JOB_STATUS_LABELS', 'JOB_BUCKETS'] });
  it('stages, labels, board buckets', () => {
    expect(c.PIPELINE_STAGES).toEqual([...WO_PIPELINE]);
    expect(c.JOB_STATUS_LABELS).toEqual(WO_LABELS);
    expect((c.JOB_BUCKETS as Array<Record<string, unknown>>).map((b) => [b.key, b.label, b.icon, b.color, b.statuses])).toEqual(WO_BUCKETS.map((b) => [b.key, b.label, b.icon, b.color, [...b.statuses]]));
  });

  it('every label/title the site shows is in the app’s header template, keyed to the same status', () => {
    const tpl = code('index:text:wo-header-buttons');
    const ctx = { hasLinkedInvoice: true, anyInvoicePaid: true };
    const cond: Partial<Record<WoStatus, string>> = {
      order_materials: "j.status==='order_materials'", materials_ordered: "j.status==='materials_ordered'", ready_to_schedule: "j.status==='ready_to_schedule'",
      scheduled: "j.status==='scheduled'||j.status==='in_progress'", final_invoice: "j.status==='final_invoice'&&linkedInvoice", paid: "j.status==='paid'",
    };
    for (const s of WO_STATUSES) {
      const a = woPrimaryAction(s, ctx);
      if (!a || s === 'ready_to_be_paid' || s === 'in_progress') continue;
      const at = tpl.indexOf(cond[s]!);
      expect(at, s).toBeGreaterThanOrEqual(0);
      expect(tpl.indexOf(a.label, at), `${s}: ${a.label}`).toBeGreaterThan(at);
    }
    expect(tpl).toContain("${j.status==='ready_to_be_paid'?_woMarkPaidBtn:''}");
    expect(tpl).toContain(`title="${SCHEDULE_TITLE}">✅ Ready to Schedule`);
    expect(tpl).toContain(`title="${SCHEDULE_TITLE}">📅 Schedule Install`);
    expect(tpl).toContain('title="Open the materials order window again">📦 Manage POs');
    const btn = code('index:text:wo-mark-paid-btn');
    expect(btn).toContain(`title="${MARK_PAID_TITLE}">💰 Mark as Paid…`);
    expect(btn).toContain(`title="${MARK_PAID_DISABLED_TITLE}"`);
    // enabled only when an invoice on this work order is Paid
    expect(btn).toContain("const _woAnyInvPaid=(data.invoices||[]).some(i=>i.jobId===j.id&&i.status==='paid');");
  });
});

describe('work-order transitions', () => {
  it('Mark Job Complete (completeJob): Final Invoice, or Ready to be Paid when an invoice is already paid', () => {
    for (const anyInvoicePaid of [false, true]) for (const status of ['scheduled', 'in_progress'] as WoStatus[]) {
      const toasts: string[] = [];
      const job = { id: 'j1', number: 'WO-330', status, materials: [] };
      const fns = sandbox<{ completeJob: (id: string) => void }>('index', { consts: ['JOB_STATUS_LABELS'], fns: ['completeJob', '_coverageUnits'] }, {
        getJob: () => job, data: { invoices: anyInvoicePaid ? [{ jobId: 'j1', status: 'paid' }] : [{ jobId: 'j1', status: 'deposit' }], inventory: [] },
        _todayISO: () => TODAY, addActivity: noop, showToast: (t: string) => toasts.push(t), saveData: noop, navigate: noop,
      });
      fns.completeJob('j1');
      const next = woTransition(status, { type: 'complete', anyInvoicePaid });
      expect(job.status).toBe(next);
      expect(toasts).toEqual([completeToast('WO-330', next)]);
    }
  });

  it('Mark as Paid (markJobPaid)', () => {
    const toasts: string[] = [];
    const job = { id: 'j1', number: 'WO-330', status: 'ready_to_be_paid' };
    sandbox<{ markJobPaid: (id: string) => void }>('index', { fns: ['markJobPaid'] }, {
      getJob: () => job, _todayISO: () => TODAY, addActivity: noop, showToast: (t: string) => toasts.push(t), saveData: noop, navigate: noop,
    }).markJobPaid('j1');
    expect(job.status).toBe(woTransition('ready_to_be_paid', { type: 'markPaid' }));
    expect(toasts).toEqual([markPaidToast('WO-330')]);
  });

  it('schedule dialog (saveScheduleJob) over every status × date/installer', () => {
    for (const status of WO_STATUSES) for (const date of ['', '2026-10-21']) for (const installer of ['', 'ct-ins-1']) {
      const toasts: string[] = [];
      const job = { id: 'j1', number: 'WO-330', status, scheduledDate: '', crew: '' };
      const vals: Record<string, string> = { 'sched-date': date, 'sched-installer': installer };
      sandbox<{ saveScheduleJob: (id: string) => void }>('index', { fns: ['saveScheduleJob', 'fmtDate'] }, {
        getJob: () => job, document: { getElementById: (id: string) => ({ value: vals[id] }) }, data: { contractors: [{ id: 'ct-ins-1', name: 'Ruben Ortiz' }] },
        addActivity: noop, saveData: noop, closeModal: noop, updateBadges: noop, renderView: noop, showToast: (t: string) => toasts.push(t),
      }).saveScheduleJob('j1');
      const next = woTransition(status, { type: 'schedule', date: date || null, installer: installer || null });
      expect(job.status, `${status} ${date} ${installer}`).toBe(next);
      expect(toasts).toEqual([scheduleToast('WO-330', date || null, installer ? 'Ruben Ortiz' : null)]);
    }
  });

  it('materials ordered / all in (_matMaybeAdvance)', () => {
    const fns = sandbox<{ _matMaybeAdvance: (j: unknown) => boolean }>('index', { fns: ['_matMaybeAdvance', '_jobMatState', '_jobMatLines', '_matLineOrdered', '_matLineIn'] }, { addActivity: noop });
    for (const status of WO_STATUSES) for (const lines of ['none-ordered', 'some-ordered', 'all-in'] as const) for (const scheduledDate of ['', '2026-10-21']) {
      const mk = (ordered: boolean, inn: boolean) => ({ productName: 'X', quantity: 5, ...(ordered ? { matOrderedAt: TODAY } : {}), ...(inn ? { matReceivedAt: TODAY } : {}) });
      const materials = lines === 'none-ordered' ? [mk(false, false), mk(false, false)] : lines === 'some-ordered' ? [mk(true, false), mk(false, false)] : [mk(true, true), mk(true, true)];
      const job = { number: 'WO-1', status, scheduledDate, materials };
      fns._matMaybeAdvance(job);
      const want = lines === 'all-in' ? woTransition(status, { type: 'materialsIn', scheduledDate: scheduledDate || null })
        : lines === 'some-ordered' ? woTransition(status, { type: 'materialsOrdered' }) : status;
      expect(job.status, `${status} ${lines} ${scheduledDate}`).toBe(want);
    }
  });

  it('invoice paid in full moves Final Invoice → Ready to be Paid (_advanceJobToReady)', () => {
    for (const status of WO_STATUSES) {
      const job = { id: 'j1', number: 'WO-1', status };
      sandbox<{ _advanceJobToReady: (id: string) => void }>('index', { fns: ['_advanceJobToReady'] }, {
        getJob: () => job, _woGroupParent: (j: unknown) => j, _woGroupJobs: (j: unknown) => [j], addActivity: noop,
      })._advanceJobToReady('j1');
      expect(job.status).toBe(woTransition(status, { type: 'invoicePaid' }));
    }
  });
});
