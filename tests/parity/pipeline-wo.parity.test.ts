/**
 * Lead board + work-order parity: the app's lead moves (kanbanDrop,
 * _leadTryMoveStage, advanceLead), survey dates, automatic moves
 * (_runLeadAutoTransitions, _onQuoteSentToCustomer), stage tasks, card
 * decorations and age buckets, lead → customer on quote approval; and the
 * work-order side — header template, completeJob, markJobPaid,
 * saveScheduleJob with start/end, _matMaybeAdvance, submitOrderMaterials,
 * _advanceJobToReady, the auto-advance sweep, Job Costing's Mark Paid /
 * Mark complete and the Archive bucket — run in a sandbox against the site.
 */
import { describe, expect, it } from 'vitest';
import {
  advanceLead, allInvoicesPaid, autoAdvance, canDrop, cardPrimaryAction, completeToast, convertLeadOnQuoteApproval, followUpState, installEnd,
  installRangeLabel, installSpan, isLeadStale, JOB_MAX_INSTALL_DAYS, LEAD_AGE_BUCKETS, leadAgeBucketDefaultOpen, leadAgeBucketKey, leadAgeBucketLabel,
  LEAD_LABELS, LEAD_STALE_DAYS, LEAD_STATUSES, leadStageAgeDays, markGroupComplete, markGroupPaid, markPaidToast, MARK_PAID_DISABLED_TITLE,
  MARK_PAID_TITLE, materialsAdvance, nextStatus, ORDER_NEEDS_PO_TOAST, orderMaterials, quoteSentToLead, saveSchedule, SCHEDULE_TITLE, setSurveyDate,
  stageTask, surveyDayReached, WO_BUCKETS, WO_CLOSED, WO_LABELS, WO_PIPELINE, woBucketKey, woPrimaryAction, woTransition, WO_STATUSES,
  type Lead, type LeadStatus, type WoMaterialLine, type WoStatus,
} from '../../src/lib/logic';
import { incomingLeads, leads } from '../../src/data/sample-data';
import { code, sandbox } from './app-source';
import { fixedDate } from './helpers';

const noop = () => {};
const TODAY = '2026-10-14';
const NOW = Date.parse('2026-10-14T19:00:00Z');
const ALL_LEADS = [...leads, ...incomingLeads];

/** Site lead → the app's lead record (address = the city, which is all the site keeps). */
const toApp = (l: Lead) => ({ ...l, address: l.city, notes: [], contacts: [] });
const isoOffset = (days: number) => new Date(Date.parse(TODAY) + days * 864e5).toISOString().slice(0, 10);

describe('lead constants', () => {
  const c = sandbox<Record<string, unknown>>('index', { consts: ['LEAD_STATUSES', 'LEAD_STATUS_LABELS', 'LEAD_STALE_DAYS', 'LEAD_AGE_BUCKETS'] });
  it('statuses, labels, stale days, age buckets', () => {
    expect(c.LEAD_STATUSES).toEqual([...LEAD_STATUSES]);
    const { quote_sent: _a, ...labels } = c.LEAD_STATUS_LABELS as Record<string, string>;
    expect(labels).toEqual(LEAD_LABELS);
    const { quote_sent: _b, ...stale } = c.LEAD_STALE_DAYS as Record<string, number>;
    expect(stale).toEqual(LEAD_STALE_DAYS);
    expect(c.LEAD_AGE_BUCKETS).toEqual(LEAD_AGE_BUCKETS);
  });
});

describe('moving a card by hand (kanbanDrop / _leadTryMoveStage)', () => {
  function appMove(lead: Lead, to: string, answer: boolean, from: 'card' | 'panel') {
    const events: string[] = [];
    const app = toApp(lead);
    const win: { _kbDrag: { leadId: string } | null } = { _kbDrag: { leadId: lead.id } };
    const fns = sandbox<{ kanbanDrop: (ev: unknown, s: string) => void; _leadTryMoveStage: (id: string, s: string, f: string) => boolean }>('index', { fns: ['kanbanDrop', '_leadTryMoveStage'] }, {
      window: win, document: { querySelectorAll: () => [], body: { classList: { remove: noop } } }, getLead: () => app,
      showToast: (t: string, k: string) => events.push(`toast:${k}:${t}`), confirm: (t: string) => { events.push(`confirm:${t}`); return answer; },
      changeLeadStatus: (id: string, s: string) => events.push(`change:${id}:${s}`),
    });
    let moved: boolean | undefined;
    if (from === 'card') fns.kanbanDrop({ preventDefault: noop }, to);
    else moved = fns._leadTryMoveStage(lead.id, to, 'panel');
    return { events, moved };
  }

  it('every lead × every column × survey date × confirm yes/no, from the board and the List View panel', () => {
    let n = 0;
    for (const base of ALL_LEADS) for (const survey of [null, '2026-10-16']) for (const to of LEAD_STATUSES) for (const answer of [true, false]) for (const from of ['card', 'panel'] as const) {
      const lead = { ...base, siteSurveyDate: survey };
      const app = appMove(lead, to, answer, from);
      const site = canDrop(lead, to as LeadStatus, from);
      const expected: string[] = [];
      let moved = false;
      if (!site.ok) { if (site.toast) expected.push(`toast:${site.toastKind}:${site.toast}`); }
      else {
        if (site.confirm) expected.push(`confirm:${site.confirm}`);
        if (!site.confirm || answer) { expected.push(`change:${lead.id}:${to}`); moved = true; }
      }
      expect(app.events, `${lead.number} → ${to} (${from}, ${answer})`).toEqual(expected);
      if (from === 'panel') expect(app.moved).toBe(moved);
      n++;
    }
    expect(n).toBe(ALL_LEADS.length * 2 * 6 * 2 * 2);
  });
});

describe('advancing (advanceLead) and the card button', () => {
  it('next status, the refusal into Approved, and the button in the card template', () => {
    for (const status of [...LEAD_STATUSES, 'quote_sent']) {
      const events: string[] = [];
      sandbox<{ advanceLead: (id: string) => void }>('index', { fns: ['advanceLead'] }, {
        getLead: () => ({ id: 'x', status }), LEAD_STATUSES: [...LEAD_STATUSES],
        showToast: (t: string, k: string) => events.push(`toast:${k}:${t}`), changeLeadStatus: (id: string, s: string) => events.push(`change:${id}:${s}`),
      }).advanceLead('x');
      const r = advanceLead({ status: status as LeadStatus });
      expect(events, status).toEqual(r.kind === 'none' ? [] : r.kind === 'refuse' ? [`toast:${r.toastKind}:${r.toast}`] : [`change:x:${r.to}`]);
    }
  });

  it('the card’s primary action is the template’s, status by status', () => {
    const tpl = code('index:text:lead-card-actions');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function('l', 'nextStatus', 'LEAD_STATUS_LABELS', `${tpl}\nreturn primaryHTML;`) as (l: unknown, n: string | null, labels: unknown) => string;
    const labels = { ...LEAD_LABELS, quote_sent: 'Send Quote' };
    for (const status of LEAD_STATUSES) {
      const html = run({ id: 'x', status, siteSurveyDate: '' }, nextStatus(status), labels);
      const a = cardPrimaryAction({ status });
      if (a.kind === 'surveyPicker') expect(html).toContain(`title="${a.tip}"`);
      else if (a.kind === 'advance') expect(html).toContain(`data-tip="${a.tip}" onclick="advanceLead('x')">${a.label}</button>`);
      else expect(html, status).toBe('<span style="flex:1"></span>');
      expect(html.includes('kc-survey-picker'), status).toBe(a.kind === 'surveyPicker');
    }
    expect(tpl).toContain("} else if(nextStatus&&nextStatus!=='approved'){");
  });
});

describe('survey date (setLeadSurveyDate)', () => {
  it('status move, toast and task match for every stage, set and cleared', () => {
    for (const status of LEAD_STATUSES) for (const date of ['2026-10-16', '']) {
      const lead: Lead = { ...leads[0]!, status, siteSurveyDate: status === 'site_survey_scheduled' ? '2026-10-15' : null };
      const app = toApp(lead) as Record<string, unknown>;
      const toasts: string[] = [];
      const tasks: Array<Record<string, unknown>> = [];
      sandbox<{ setLeadSurveyDate: (id: string, d: string) => void }>('index', { fns: ['setLeadSurveyDate', 'fmtDate'] }, {
        getLead: () => app, data: { tasks: [] }, addActivity: noop, saveData: noop, renderView: noop, refreshLeadKanban: noop,
        showToast: (t: string) => toasts.push(t), createTask: (t: Record<string, unknown>) => tasks.push(t), _todayISO: () => TODAY, Date: fixedDate(NOW),
      }).setLeadSurveyDate(lead.id, date);
      const s = setSurveyDate(lead, date || null, TODAY);
      expect(app.status, `${status} ${date}`).toBe(s.lead.status);
      expect(app.siteSurveyDate ?? null).toBe(s.lead.siteSurveyDate);
      expect(toasts).toEqual(s.toast ? [s.toast] : []);
      expect(tasks.map((t) => [t.title, t.description, t.priority])).toEqual(s.task ? [[s.task.title, s.task.description, s.task.priority]] : []);
      if (s.lead.status !== lead.status) expect(app.stageChangedAt).toBe(TODAY);
    }
  });
});

describe('automatic lead moves', () => {
  it('survey day reached → Send Quote (_runLeadAutoTransitions)', () => {
    for (const status of LEAD_STATUSES) for (const survey of [null, isoOffset(-3), TODAY, isoOffset(1)]) {
      const lead: Lead = { ...leads[3]!, status, siteSurveyDate: survey };
      const app = toApp(lead) as Record<string, unknown>;
      const surveyTask = { linkType: 'lead', linkId: lead.id, status: 'pending', title: `Site survey: ${lead.name}` };
      const data = { leads: [app], tasks: [surveyTask] as Array<Record<string, unknown>> };
      const acts: string[] = [];
      const made: Array<Record<string, unknown>> = [];
      sandbox<{ _runLeadAutoTransitions: () => void }>('index', { fns: ['_runLeadAutoTransitions', 'fmtDate'] }, {
        data, addActivity: (t: string) => acts.push(t), createTask: (t: Record<string, unknown>) => { made.push(t); return t; }, saveData: noop,
        _todayISO: () => TODAY, Date: fixedDate(NOW),
      })._runLeadAutoTransitions();
      const s = surveyDayReached(lead, TODAY);
      expect(app.status, `${status} ${survey}`).toBe(s ? s.lead.status : status);
      expect(acts).toEqual(s ? [s.activity] : []);
      expect(made.map((t) => [t.title, t.description, t.priority, t.dueDate])).toEqual(
        s && s.task ? [[s.task.title, s.task.description, s.task.priority, new Date(NOW + 2 * 864e5).toISOString()]] : [],
      );
      expect(surveyTask.status === 'completed').toBe(!!s?.completesSurveyTasks);
      if (s) expect(app.stageChangedAt).toBe(TODAY);
    }
  });

  it('a quote emailed or texted → Follow-up (_onQuoteSentToCustomer)', () => {
    for (const status of LEAD_STATUSES) for (const channel of ['email', 'SMS', 'link'] as const) for (const existing of [false, true]) {
      const lead: Lead = { ...leads[5]!, status };
      const app = toApp(lead) as Record<string, unknown>;
      const acts: string[] = [];
      const made: Array<Record<string, unknown>> = [];
      const tasks = existing ? [{ linkType: 'lead', linkId: lead.id, status: 'pending', title: `Follow up with ${lead.name} on quote QT-330`, description: 'Quote QT-330 was sent via email.' }] : [];
      sandbox<{ _onQuoteSentToCustomer: (q: unknown, c: string) => void }>('index', { fns: ['_onQuoteSentToCustomer'] }, {
        getLead: () => app, data: { tasks }, addActivity: (t: string) => acts.push(t), createTask: (t: Record<string, unknown>) => made.push(t),
        _todayISO: () => TODAY, Date: fixedDate(NOW),
      })._onQuoteSentToCustomer({ leadId: lead.id, number: 'QT-330' }, channel);
      const s = quoteSentToLead(lead, 'QT-330', channel, TODAY, existing);
      expect(app.status, `${status} ${channel}`).toBe(s ? s.lead.status : status);
      expect(acts).toEqual(s && s.activity ? [s.activity] : []);
      expect(made.map((t) => [t.title, t.description, t.priority, t.dueDate])).toEqual(
        s && s.task ? [[s.task.title, s.task.description, s.task.priority, new Date(NOW + 3 * 864e5).toISOString()]] : [],
      );
    }
  });

  it('the task a manual move adds (_ensureTaskForLeadStage)', () => {
    for (const status of LEAD_STATUSES) for (const survey of [null, '2026-10-16']) {
      const lead: Lead = { ...leads[0]!, siteSurveyDate: survey };
      const made: Array<Record<string, unknown>> = [];
      sandbox<{ _ensureTaskForLeadStage: (l: unknown, s: string) => void }>('index', { fns: ['_ensureTaskForLeadStage'] }, {
        data: { tasks: [] }, createTask: (t: Record<string, unknown>) => made.push(t), Date: fixedDate(NOW),
      })._ensureTaskForLeadStage(toApp(lead), status);
      const t = stageTask({ ...lead, address: lead.city }, status);
      const due = !t ? null : 'date' in t.due ? new Date(t.due.date + 'T17:00:00').toISOString() : new Date(NOW + t.due.inDays * 864e5).toISOString();
      expect(made.map((x) => [x.title, x.description, x.priority, x.dueDate]), `${status} ${survey}`).toEqual(t ? [[t.title, t.description, t.priority, due]] : []);
    }
  });
});

describe('card decorations and age buckets', () => {
  const fns = sandbox<{
    isLeadStale: (l: unknown) => boolean; getLeadStageAgeDays: (l: unknown) => number; getFollowUpState: (l: unknown) => string | null;
    _leadAgeBucketKey: (l: unknown, t: string) => string; _leadAgeBucketLabel: (k: string) => string;
  }>('index', {
    consts: ['LEAD_STALE_DAYS', 'LEAD_AGE_BUCKETS'], fns: ['isLeadStale', 'getLeadStageAgeDays', 'getFollowUpState', 'daysBetween', '_leadAgeBucketKey', '_leadAgeBucketLabel'],
  }, { _todayISO: () => TODAY });

  it('stage age (stageChangedAt, else createdAt), stale and follow-up state', () => {
    for (const status of LEAD_STATUSES) for (let age = 0; age <= 20; age++) {
      const changed = isoOffset(-age);
      expect(isLeadStale({ status, stageAgeDays: age })).toBe(fns.isLeadStale({ status, stageChangedAt: changed }));
      expect(isLeadStale({ status, stageChangedAt: changed }, TODAY)).toBe(fns.isLeadStale({ status, stageChangedAt: changed }));
      expect(isLeadStale({ status, stageChangedAt: '', createdAt: changed }, TODAY)).toBe(fns.isLeadStale({ status, createdAt: changed }));
      expect(leadStageAgeDays({ stageChangedAt: null, createdAt: changed }, TODAY)).toBe(fns.getLeadStageAgeDays({ createdAt: changed }));
    }
    expect(leadStageAgeDays({}, TODAY)).toBe(fns.getLeadStageAgeDays({}));
    for (let d = -3; d <= 10; d++) expect(followUpState(isoOffset(d), TODAY)).toBe(fns.getFollowUpState({ followUpDate: isoOffset(d) }));
    expect(followUpState(null, TODAY)).toBe(fns.getFollowUpState({}));
  });

  it('age buckets and their labels (_leadAgeBucketKey / _leadAgeBucketLabel)', () => {
    for (let d = -2; d <= 45; d++) expect(leadAgeBucketKey(isoOffset(-d), TODAY)).toBe(fns._leadAgeBucketKey({ createdAt: isoOffset(-d) }, TODAY));
    for (const k of ['today', 'week', 'month', 'older', 'nope']) expect(leadAgeBucketLabel(k)).toBe(fns._leadAgeBucketLabel(k));
  });

  it('which buckets start open (leadKbColumnBodyHTML)', () => {
    const body = sandbox<{ leadKbColumnBodyHTML: (k: string, l: unknown[], q: string) => string }>('index', {
      consts: ['LEAD_AGE_BUCKETS'], fns: ['leadKbColumnBodyHTML', '_leadAgeBucketKey', '_leadAgeBucketLabel', 'daysBetween'],
    }, { _todayISO: () => TODAY, viewState: {}, leadKbCardHTML: () => '' });
    for (const counts of [[1, 1, 1, 1], [0, 3, 0, 2], [10, 4, 2, 1], [0, 16, 1, 0], [6, 6, 6, 6], [0, 0, 0, 17]]) {
      const list = counts.flatMap((n, i) => Array.from({ length: n }, () => ({ createdAt: isoOffset(-[0, 3, 20, 60][i]!) })));
      const html = body.leadKbColumnBodyHTML('new', list, '');
      LEAD_AGE_BUCKETS.forEach((b, i) => {
        if (!counts[i]) return;
        const open = new RegExp(`kb-bucket open"><div class="kb-bucket-h" onclick="toggleLeadKbBucket\\('new','${b.key}'`).test(html);
        expect(open, `${b.key} of ${counts.join('/')}`).toBe(leadAgeBucketDefaultOpen(b.key, list.length, counts[0]!));
      });
    }
  });
});

describe('a lead is won through its quote (_resolveQuoteLeadToCustomer → _convertLeadToCustomer)', () => {
  it('customer type, rep, property label; the lead leaves the pipeline', () => {
    for (const l of ALL_LEADS) for (const quoteRep of ['', 'ct-rep-9']) for (const leadRep of [l.salesRepId, '']) {
      const lead = { ...toApp(l), salesRepId: leadRep };
      const data = { leads: [lead], customers: [] as Array<Record<string, unknown>> };
      const acts: string[] = [];
      const q = { id: 'q1', leadId: l.id, customerId: '', salesRepId: quoteRep };
      sandbox<{ _resolveQuoteLeadToCustomer: (q: unknown) => string }>('index', { fns: ['_resolveQuoteLeadToCustomer', '_convertLeadToCustomer', '_carryLeadNotes', 'isCustomerCompany'] }, {
        data, getLead: (id: string) => data.leads.find((x) => x.id === id), getCustomer: (id: string) => data.customers.find((c) => c.id === id),
        addActivity: (t: string) => acts.push(t), _todayISO: () => TODAY, Date: fixedDate(NOW),
      })._resolveQuoteLeadToCustomer(q);
      const s = convertLeadOnQuoteApproval({ ...l, salesRepId: leadRep }, TODAY, quoteRep);
      const cu = data.customers[0]!;
      expect([cu.type, cu.name, cu.phone, cu.email, cu.source, cu.salesRepId, cu.customerSince, cu.convertedFromLeadId], `${l.number} ${quoteRep} ${leadRep}`)
        .toEqual([s.customer.type, s.customer.name, s.customer.phone, s.customer.email, s.customer.source, s.customer.salesRepId, TODAY, l.id]);
      expect((cu.properties as Array<{ label: string }>)[0]!.label).toBe(s.customer.propertyLabel);
      expect(data.leads).toEqual([]); // off the pipeline
      expect(q.leadId).toBeNull();
      // The conversion already took the lead off, so the "removed from pipeline" line is not written again.
      expect(acts).toEqual(s.activity);
    }
  });
});

// ------------------------------------------------------------- work orders --

describe('work-order constants and header buttons', () => {
  const c = sandbox<Record<string, unknown>>('index', { consts: ['PIPELINE_STAGES', 'PIPELINE_CLOSED', 'JOB_STATUS_LABELS', 'JOB_BUCKETS', 'JOB_MAX_INSTALL_DAYS'] });
  it('stages, closed statuses, labels, board buckets (no Done column)', () => {
    expect(c.PIPELINE_STAGES).toEqual([...WO_PIPELINE]);
    expect(c.PIPELINE_CLOSED).toEqual([...WO_CLOSED]);
    expect(c.JOB_STATUS_LABELS).toEqual(WO_LABELS);
    expect(c.JOB_MAX_INSTALL_DAYS).toBe(JOB_MAX_INSTALL_DAYS);
    expect((c.JOB_BUCKETS as Array<Record<string, unknown>>).map((b) => [b.key, b.label, b.icon, b.color, b.statuses, b.sub ?? '', !!b.optional]))
      .toEqual(WO_BUCKETS.map((b) => [b.key, b.label, b.icon, b.color, [...b.statuses], b.sub, b.optional]));
  });

  it('_jobBucket: closed jobs go to the Archive', () => {
    const fns = sandbox<{ _jobBucket: (s: string) => string }>('index', { consts: ['JOB_BUCKETS', 'PIPELINE_CLOSED'], fns: ['_jobBucket'] });
    for (const s of [...WO_STATUSES, 'nonsense']) expect(woBucketKey(s), s).toBe(fns._jobBucket(s));
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
    // enabled only when an invoice on this work order (or its split group) is Paid
    expect(btn).toContain("const _woAnyInvPaid=!!_woGroupInvoice(j,i=>i.status==='paid');");
  });
});

const GROUP_FNS = ['_woGroupInvoice', '_woGroupParent', '_woGroupJobs'];

describe('work-order transitions', () => {
  it('Mark Job Complete (completeJob): Final Invoice, or Ready to be Paid when an invoice on the job or its parent is paid', () => {
    for (const paidOn of ['none', 'own', 'parent', 'deposit'] as const) for (const status of ['scheduled', 'in_progress'] as WoStatus[]) {
      const toasts: string[] = [];
      const parent = { id: 'p1', number: 'WO-330', status: 'scheduled' };
      const job = { id: 'j1', number: 'WO-330-2', status, materials: [], parentJobId: 'p1' };
      const invoices = paidOn === 'own' ? [{ jobId: 'j1', status: 'paid' }] : paidOn === 'parent' ? [{ jobId: 'p1', status: 'paid' }] : paidOn === 'deposit' ? [{ jobId: 'j1', status: 'deposit' }] : [];
      sandbox<{ completeJob: (id: string) => void }>('index', { consts: ['JOB_STATUS_LABELS'], fns: ['completeJob', '_coverageUnits', ...GROUP_FNS] }, {
        getJob: (id: string) => (id === 'p1' ? parent : job), data: { invoices, inventory: [], jobs: [parent, job] },
        _todayISO: () => TODAY, addActivity: noop, showToast: (t: string) => toasts.push(t), saveData: noop, navigate: noop, fmtDate: (d: string) => d,
      }).completeJob('j1');
      const next = woTransition(status, { type: 'complete', anyInvoicePaid: paidOn === 'own' || paidOn === 'parent' });
      expect(job.status, `${paidOn} ${status}`).toBe(next);
      expect(toasts).toEqual([completeToast('WO-330-2', next)]);
    }
  });

  it('Mark as Paid (markJobPaid) stamps paidAt', () => {
    const toasts: string[] = [];
    const job: Record<string, unknown> = { id: 'j1', number: 'WO-330', status: 'ready_to_be_paid' };
    sandbox<{ markJobPaid: (id: string) => void }>('index', { fns: ['markJobPaid'] }, {
      getJob: () => job, _todayISO: () => TODAY, addActivity: noop, showToast: (t: string) => toasts.push(t), saveData: noop, navigate: noop,
    }).markJobPaid('j1');
    expect(job.status).toBe(woTransition('ready_to_be_paid', { type: 'markPaid' }));
    expect(job.paidAt).toBe(TODAY);
    expect(toasts).toEqual([markPaidToast('WO-330')]);
  });

  it('schedule dialog (saveScheduleJob): start + end as a pair, every status × dates × installer', () => {
    const DATES: Array<[string, string]> = [['', ''], ['2026-10-21', ''], ['', '2026-10-22'], ['2026-10-21', '2026-10-21'], ['2026-10-21', '2026-10-23'],
      ['2026-10-23', '2026-10-21'], ['2026-10-31', '2026-11-02'], ['2026-11-10', '2027-11-11'], ['2026-11-10', '2027-11-09']];
    let n = 0;
    for (const status of WO_STATUSES) for (const [date, end] of DATES) for (const installer of ['', 'ct-ins-1', 'ct-gone']) {
      const toasts: string[] = [];
      const job: Record<string, unknown> = { id: 'j1', number: 'WO-330', status, scheduledDate: '2026-10-01', durationDays: 2, crew: '' };
      const vals: Record<string, string> = { 'sched-date': date, 'sched-end': end, 'sched-installer': installer };
      sandbox<{ saveScheduleJob: (id: string) => void }>('index', {
        consts: ['JOB_MAX_INSTALL_DAYS'], fns: ['saveScheduleJob', '_jobInstallSpan', '_installRangeLabel', '_isoParts', '_isoAddDays', '_isoDayDiff', '_dateOnly', '_isoDay', 'fmtDate'],
      }, {
        getJob: () => job, document: { getElementById: (id: string) => ({ value: vals[id] }) }, data: { contractors: [{ id: 'ct-ins-1', name: 'Ruben Ortiz' }] },
        addActivity: noop, saveData: noop, closeModal: noop, updateBadges: noop, renderView: noop, showToast: (t: string, k?: string) => toasts.push(k ? `${k}:${t}` : t),
      }).saveScheduleJob('j1');
      const s = saveSchedule(status, 'WO-330', { start: date, end, installerId: installer, installerName: installer === 'ct-ins-1' ? 'Ruben Ortiz' : null });
      const label = `${status} ${date}→${end} ${installer}`;
      if (!s.ok) {
        expect(toasts, label).toEqual([`${s.toastKind}:${s.toast}`]);
        expect(job.status, label).toBe(status); // untouched
      } else {
        expect(job.status, label).toBe(s.status);
        expect(toasts, label).toEqual([s.toast]);
        if (s.durationDays != null) expect(job.durationDays, label).toBe(s.durationDays);
      }
      n++;
    }
    expect(n).toBe(WO_STATUSES.length * DATES.length * 3);
  });

  it('install span, end and range label (_jobInstallSpan / _jobInstallEnd / _installRangeLabel)', () => {
    const fns = sandbox<{ _jobInstallSpan: (s: unknown, e: unknown) => unknown; _jobInstallEnd: (j: unknown) => string | null; _installRangeLabel: (s: string, d: unknown) => string }>('index', {
      consts: ['JOB_MAX_INSTALL_DAYS'], fns: ['_jobInstallSpan', '_jobInstallEnd', '_installRangeLabel', '_isoParts', '_isoAddDays', '_isoDayDiff', '_dateOnly', '_isoDay', 'fmtDate'],
    });
    const dates = ['', null, 'junk', '2026-10-13', '2026-10-15', '2026-10-31', '2026-11-02', '2026-03-13', '2026-03-15', '2027-01-01', '2026-12-31', '2027-10-13', '2027-10-14'];
    for (const a of dates) for (const b of dates) expect(installSpan(a, b), `${a} → ${b}`).toEqual(fns._jobInstallSpan(a, b));
    for (const start of dates) for (const days of [undefined, null, 0, 1, 2, 3, 30, 365, -2, '4']) {
      expect(installEnd(start, days as number), `${start} + ${days}`).toBe(fns._jobInstallEnd({ scheduledDate: start, durationDays: days }));
      if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) expect(installRangeLabel(start, days as number)).toBe(fns._installRangeLabel(start, days));
    }
    expect(installRangeLabel('2026-11-10', 3)).toBe('Nov 10, 2026 → Nov 12, 2026 (3 days)');
  });

  it('materials ordered / in (_matMaybeAdvance): every line ORDERED moves the job on', () => {
    const mk = (o: Partial<WoMaterialLine>): WoMaterialLine => ({ productName: 'X', quantity: 5, ...o });
    const SETS: Record<string, WoMaterialLine[]> = {
      none: [mk({}), mk({})],
      some: [mk({ matOrderedAt: TODAY }), mk({})],
      allOrdered: [mk({ poCreated: true }), mk({ matOrderedAt: TODAY })],
      allIn: [mk({ matOrderedAt: TODAY, matReceivedAt: TODAY }), mk({ allocatedFromInventory: true })],
      hiddenRest: [mk({ poCreated: true }), mk({ hidden: true })],
      blankRest: [mk({ poCreated: true }), { quantity: 0 }],
      empty: [],
    };
    for (const status of WO_STATUSES) for (const [name, lines] of Object.entries(SETS)) for (const scheduledDate of ['', '2026-10-21']) {
      const acts: string[] = [];
      const job = { number: 'WO-1', status, scheduledDate, materials: lines.map((l) => ({ ...l })) };
      sandbox<{ _matMaybeAdvance: (j: unknown) => boolean }>('index', { fns: ['_matMaybeAdvance', '_jobMatState', '_jobMatLines', '_matLineOrdered', '_matLineIn'] }, {
        addActivity: (t: string) => acts.push(t),
      })._matMaybeAdvance(job);
      const s = materialsAdvance(status, lines, scheduledDate || null, 'WO-1');
      expect(job.status, `${status} ${name} ${scheduledDate}`).toBe(s.status);
      expect(acts).toEqual(s.activity ? [s.activity] : []);
      // and the event form agrees
      const ordered = lines.filter((l) => !l.hidden && ((Number(l.quantity) || 0) > 0 || l.productName)).every((l) => l.matOrderedAt || l.matReceivedAt || l.poCreated || l.allocatedFromInventory);
      if (name === 'allOrdered' || name === 'allIn') expect(woTransition(status === 'order_materials' ? 'materials_ordered' : status, { type: 'materialsOrdered', allOrdered: ordered, scheduledDate: scheduledDate || null })).toBe(s.status);
    }
  });

  it('Order Materials → Finish (submitOrderMaterials): status, toast, PO total + freight', () => {
    const base = (): Array<Record<string, unknown>> => [
      { productName: 'Summit XL', quantity: 915.12, matNum: 'MAT-1' },
      { productName: 'MDF Base', quantity: 180, matNum: 'MAT-2' },
      { productName: 'Sandbar Carpet', quantity: 19.33, matNum: 'RMAT-1' },
      { productName: 'Stock pad', quantity: 19.33, allocatedFromInventory: true },
    ];
    for (const status of ['order_materials', 'materials_ordered', 'ready_to_schedule', 'scheduled'] as WoStatus[]) for (const pick of [[], [0], [0, 1], [0, 1, 2], [2]]) {
      for (const scheduledDate of ['', '2026-10-21']) for (const missingPo of [false, true]) {
        const materials = base();
        const job = { id: 'j1', number: 'WO-330', status, scheduledDate, customerId: 'c1', materials };
        const lines = materials.map((m, idx) => ({ idx, selected: pick.includes(idx), qty: Number(m.quantity), cost: 2.5, poNumber: missingPo && idx === pick[pick.length - 1] ? '' : `WO-330-${idx + 1}`,
          productName: m.productName, matNum: m.matNum, uom: 'SqFt', freight: idx === 0 ? '45.678' : '', orderDate: '', estimatedDelivery: '' }));
        const toasts: string[] = [];
        const acts: string[] = [];
        const data = { jobPOs: [] as Array<Record<string, unknown>>, inventory: [{ matNum: 'MAT-2', pOs: [] }], counters: {} };
        let poSeq = 0;
        sandbox<{ submitOrderMaterials: () => void }>('index', { consts: ['JOB_STATUS_LABELS'], fns: ['submitOrderMaterials', '_matMaybeAdvance', '_jobMatState', '_jobMatLines', '_matLineOrdered', '_matLineIn', '_isoDay'] }, {
          window: { _omState: { jobId: 'j1', lines } }, getJob: () => job, getCustomer: () => ({ id: 'c1', name: 'Dev & Anjali Prasad' }), data,
          _ensureJobPOs: noop, _nextJobPONumber: () => `JPO-${String(++poSeq).padStart(4, '0')}`, _todayISO: () => TODAY, Date: fixedDate(NOW),
          addActivity: (t: string) => acts.push(t), saveData: noop, closeModal: noop, renderView: noop, showToast: (t: string, k?: string) => toasts.push(k ? `${k}:${t}` : t),
        }).submitOrderMaterials();
        const label = `${status} [${pick}] ${scheduledDate} ${missingPo}`;
        if (missingPo && pick.length) { expect(toasts, label).toEqual([`warning:${ORDER_NEEDS_PO_TOAST}`]); continue; }
        const after = base().map((m, idx) => (pick.includes(idx) ? { ...m, poCreated: true } : m));
        const s = orderMaterials(status, 'WO-330', after, scheduledDate || null, pick.length);
        if (!s.ok) { expect(toasts, label).toEqual([`${s.toastKind}:${s.toast}`]); expect(job.status).toBe(status); continue; }
        expect(job.status, label).toBe(s.status);
        expect(toasts, label).toEqual([s.toast]);
        expect(acts, label).toEqual(s.activity);
        expect(data.jobPOs.map((p) => [p.totalCost, p.freight])).toEqual(pick.map((idx) => [Number(base()[idx]!.quantity) * 2.5, idx === 0 ? 45.68 : 0]));
      }
    }
  });

  it('invoice paid in full moves the whole split group Final Invoice → Ready to be Paid (_advanceJobToReady)', () => {
    for (const status of WO_STATUSES) {
      const parent = { id: 'p1', number: 'WO-1', status };
      const kid = { id: 'k1', number: 'WO-1-2', status: 'final_invoice', parentJobId: 'p1' };
      const jobs = [parent, kid];
      sandbox<{ _advanceJobToReady: (id: string) => void }>('index', { fns: ['_advanceJobToReady', '_woGroupParent', '_woGroupJobs'] }, {
        getJob: (id: string) => jobs.find((j) => j.id === id), data: { jobs }, addActivity: noop,
      })._advanceJobToReady('p1');
      expect(parent.status).toBe(woTransition(status, { type: 'invoicePaid' }));
      expect(kid.status).toBe('ready_to_be_paid');
    }
  });

  it('the auto-advance sweep (_plAutoAdvanceSweep): install ended → complete; all invoices paid → Ready to be Paid', () => {
    const STARTS = ['', '2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
    let n = 0;
    for (const status of WO_STATUSES) for (const start of STARTS) for (const days of [undefined, 1, 2, 3]) for (const inv of ['none', 'deposit', 'paid', 'onePaidOneOpen', 'void+paid'] as const) {
      const job: Record<string, unknown> = { id: 'j1', number: 'WO-7', status, scheduledDate: start, durationDays: days, materials: [] };
      const invoices = inv === 'none' ? [] : inv === 'deposit' ? [{ jobId: 'j1', status: 'deposit' }] : inv === 'paid' ? [{ jobId: 'j1', status: 'paid' }]
        : inv === 'onePaidOneOpen' ? [{ jobId: 'j1', status: 'paid' }, { jobId: 'j1', status: 'unpaid' }] : [{ jobId: 'j1', status: 'void' }, { jobId: 'j1', status: 'paid' }];
      const acts: string[] = [];
      const data = { jobs: [job], invoices, inventory: [] };
      sandbox<{ _plAutoAdvanceSweep: () => number }>('index', {
        consts: ['JOB_STATUS_LABELS'],
        fns: ['_plAutoAdvanceSweep', '_jobInstallEnd', '_woGroupPaidInFull', '_advanceJobToReady', 'completeJob', '_coverageUnits', '_dateOnly', '_isoDay', 'fmtDate', ...GROUP_FNS],
      }, {
        data, getJob: (id: string) => data.jobs.find((j) => j.id === id), _liveEditingId: () => null, saveData: noop, navigate: noop, showToast: noop,
        addActivity: (t: string) => acts.push(t), _todayISO: () => TODAY,
      })._plAutoAdvanceSweep();
      const s = autoAdvance({ number: 'WO-7', status, scheduledDate: start, durationDays: days ?? null }, TODAY, {
        anyPaid: invoices.some((i) => i.status === 'paid'), allPaid: allInvoicesPaid(invoices),
      });
      const label = `${status} ${start}+${days} ${inv}`;
      expect(job.status, label).toBe(s ? s.status : status);
      expect(acts, label).toEqual(s ? s.activity : []);
      if (s?.completedAt) expect(job.completedAt, label).toBe(s.completedAt);
      n++;
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('Job Costing lifecycle: Mark Paid (jcMarkGroupPaid) and Mark complete (jcMarkGroupComplete)', () => {
    const SETS: WoStatus[][] = [['ready_to_be_paid'], ['ready_to_be_paid', 'ready_to_be_paid'], ['ready_to_be_paid', 'final_invoice'], ['paid'], ['paid', 'ready_to_be_paid'],
      ['complete'], ['scheduled'], ['in_progress', 'scheduled'], ['final_invoice'], ['order_materials', 'final_invoice']];
    for (const statuses of SETS) for (const owed of [false, true]) for (const answer of [true, false]) {
      for (const which of ['paid', 'complete'] as const) {
        const members = statuses.map((st, i) => ({ id: `j${i}`, number: i ? `WO-5-${i + 1}` : 'WO-5', status: st as string, paidAt: undefined as string | undefined, materials: [] }));
        const toasts: string[] = [];
        const confirms: string[] = [];
        const acts: string[] = [];
        const fns = sandbox<{ jcMarkGroupPaid: (id: string) => void; jcMarkGroupComplete: (id: string) => void }>('index', {
          consts: ['JOB_STATUS_LABELS', '_JC_STAGE_DONE'], fns: ['jcMarkGroupPaid', 'jcMarkGroupComplete'],
        }, {
          getJob: () => members[0], _woGroupParent: (j: unknown) => j, _jobGroupFinance: () => ({ members, invs: [], outstanding: 0 }), _jcCommissionOwed: () => owed,
          confirm: (t: string) => { confirms.push(t); return answer; }, showToast: (t: string, k?: string) => toasts.push(k ? `${k}:${t}` : t), addActivity: (t: string) => acts.push(t),
          saveData: noop, renderView: noop, _todayISO: () => TODAY,
          completeJob: (id: string) => { const m = members.find((x) => x.id === id)!; m.status = 'final_invoice'; },
        });
        if (which === 'paid') fns.jcMarkGroupPaid('j0'); else fns.jcMarkGroupComplete('j0');
        const s = which === 'paid' ? markGroupPaid(statuses.map((st, i) => ({ number: i ? `WO-5-${i + 1}` : 'WO-5', status: st })), owed)
          : markGroupComplete(statuses.map((st, i) => ({ number: i ? `WO-5-${i + 1}` : 'WO-5', status: st })));
        const label = `${which} ${statuses} ${owed} ${answer}`;
        if (!s.ok) { expect(toasts, label).toEqual([`${s.toastKind}:${s.toast}`]); expect(confirms).toEqual([]); continue; }
        expect(confirms, label).toEqual([s.confirm]);
        if (!answer) { expect(toasts).toEqual([]); continue; }
        expect(toasts, label).toEqual([s.toast]);
        expect(acts, label).toEqual(s.activity);
        expect(members.filter((m) => s.members.includes(m.number)).every((m) => m.status === s.to)).toBe(true);
        if (which === 'paid') expect(members.filter((m) => s.members.includes(m.number)).every((m) => m.paidAt === TODAY)).toBe(true);
      }
    }
  });
});
