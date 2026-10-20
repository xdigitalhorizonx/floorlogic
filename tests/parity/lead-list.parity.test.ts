/**
 * The Leads screen's List View and the phone app's Leads screens, run side by
 * side with the site's ports: the app's real functions (demo main 80be9ee =
 * landmark-flooring-app dd609d2, and mobile.js from the same build) in a
 * sandbox, and the site's src/lib/logic/lead-list + lead-phone on the same
 * records. Note bylines are checked against the 2026-10-15 build's
 * `_noteByline` (ad6cbeb), copied below verbatim. (The home hero's List View
 * and phone renderers were compared here too until the Caspar hero replaced
 * them on 2026-10-20.)
 */
import { describe, expect, it } from 'vitest';
import {
  agoLabel, bucketFilter, clearFilters, createLeadRecord, CUSTOMER_TYPES, DEFAULT_LIST_FILTER, demoNoteInstant, filterLeads, findDuplicates, FOLLOW_UP_PICKS,
  formatPhone, initials, isCustomerCompany, keyNavTarget, lastTouch, latestQuote, LC_QUICK_SOURCES, LEAD_STATUSES, listCtx, localDay, matchesSearch, nextSort,
  noteByline, overdueStatFilter, PHONE_LOST_CONFIRM, PHONE_NEED, PHONE_PIPE, PHONE_PROJECT_TYPES, PHONE_QUOTE_STATUS, PHONE_SOURCES, PHONE_STAGE, phoneAgo,
  phoneAddedToast, phoneInitials, phoneLeadList, phoneLeadSub, phoneLostText, phoneLostToast, phoneNextStep, phoneStageTap, pickSelected, pipelineStats,
  QUICK_ADD_REQUIRED_TOAST, quickAddMissing, quickAddPlaceholders, quickAddToast, quickAddValues, sortKey, streetOf, firstName, surveyQuickDays, whenDay, addDays,
  type AgeFilter, type ListCustomer, type ListFilter, type ListLead, type ListQuote, type LeadStatus, type PhoneSeg, type SortCol,
} from '../../src/lib/logic';
import { listLeads, listQuotes } from '../fixtures/sample-leads';
import { incomingLeads, leads, reps } from '../../src/data/sample-data';
import { code, sandbox } from './app-source';
import { fixedDate, pick, rng, stripTags } from './helpers';

const noop = () => {};
const TODAY = '2026-10-14';
const NOW = Date.parse('2026-10-14T19:00:00Z');
const isoOffset = (days: number) => addDays(TODAY, days);
const REPS = reps.map((r) => ({ id: r.id, name: r.name }));
const repById = Object.fromEntries(REPS.map((r) => [r.id, r]));

/** Every sample lead on the Leads list, plus the incoming ones, a lost one and some notes. */
const toList = (l: (typeof leads)[number]): ListLead => ({ ...l, address: l.city, notes: [] });
const ALL: ListLead[] = [
  ...listLeads,
  ...incomingLeads.map(toList),
  { ...toList(leads[9]!), id: 'ld-x1', number: 'LD-070', status: 'lost', name: 'Pat O’Neil-Hayes', type: 'Builder', source: '', salesRepId: '' },
  { ...toList(leads[2]!), id: 'ld-x2', number: 'LD-071', createdAt: isoOffset(-45), stageChangedAt: isoOffset(-20), notes: [{ text: 'Called, left a voicemail about Saturday', date: isoOffset(-3) }, { text: 'Wants walnut', date: '2026-10-13T22:40:00.000Z', userName: 'Dale Whitaker' }] },
  { ...toList(leads[4]!), id: 'ld-x3', number: 'LD-072', status: 'approved', createdAt: isoOffset(-400), stageChangedAt: isoOffset(-90), email: '' },
];
const QUOTES: ListQuote[] = [...listQuotes, { id: 'q-x', leadId: 'ld-x2', number: 'QT-331', total: 1234.5, status: 'draft', createdAt: isoOffset(-1) }, { id: 'q-y', leadId: 'ld-x2', number: 'QT-320', total: 99, status: 'sent', createdAt: isoOffset(-9) }];
const CTX = listCtx(TODAY, REPS, QUOTES);
/** A site lead as the app keeps it (address = the city, which is all the site has). */
const toApp = (l: ListLead) => ({ ...l, contacts: [] as unknown[] });
const appCtx = () => {
  const quotesByLead: Record<string, ListQuote[]> = {};
  for (const q of QUOTES) (quotesByLead[q.leadId] ||= []).push(q);
  return { today: TODAY, repById, quotesByLead, callTouch: {} };
};

// The app's helpers the List View calls, extracted once.
const LC_FNS = ['_lcLocalDay', '_lcLastTouch', '_lcAgo', '_lcLatestQuote', '_lcInitials', '_lcMatchesSearch', '_lcSortKey', '_lcFilterLeads', 'daysBetween', '_leadAgeBucketKey', 'fmtDate', 'fmt$', '_fesc'];
const LC_CONSTS = ['LEAD_STATUSES', 'LEAD_STATUS_LABELS', 'LEAD_STATUS_COLORS', 'LEAD_AGE_BUCKETS', 'LEAD_STALE_DAYS', 'QUOTE_STATUS_COLORS'];

describe('List View: the columns (_lcAgo, _lcInitials, _lcLocalDay, _lcLastTouch, _lcLatestQuote, _lcSortKey)', () => {
  const app = sandbox<Record<string, (...a: unknown[]) => unknown>>('index', { fns: LC_FNS, consts: LC_CONSTS }, { _todayISO: () => TODAY });

  it('"Today / Yesterday / 3d ago / 2w ago / 4mo ago / 1y ago"', () => {
    for (let d = -3; d <= 800; d++) expect(agoLabel(isoOffset(-d), TODAY), String(d)).toBe(app._lcAgo!(isoOffset(-d), TODAY));
    expect(agoLabel('', TODAY)).toBe(app._lcAgo!('', TODAY));
  });

  it('avatar initials', () => {
    for (const n of [...ALL.map((l) => l.name), '', '   ', '123', '#5 Unit', 'O’Brien & Sons Co.', 'mesa grove townhomes hoa', 'Ana', '  Lee   Chu  ', 'Élan Café', '42 Main LLC']) {
      expect(initials(n), n).toBe(app._lcInitials!(n));
    }
  });

  it('local day of a stored day or a timestamp', () => {
    for (const v of ['', null, '2026-10-14', '2026-10-14T03:00:00Z', '2026-10-13T23:59:59-07:00', 'garbage-but-long-enough', '2026-02-30', new Date(NOW).toISOString()]) {
      expect(localDay(v), String(v)).toBe(app._lcLocalDay!(v));
    }
  });

  it('last touch: created, stage changed, note logged', () => {
    for (const l of ALL) expect(lastTouch(l), l.number).toEqual(app._lcLastTouch!(toApp(l), appCtx()));
  });

  it('latest quote, and every sort key', () => {
    const cols: SortCol[] = ['number', 'name', 'phone', 'email', 'status', 'project', 'source', 'custType', 'rep', 'touch', 'quoted', 'age'];
    for (const l of ALL) {
      expect(latestQuote(l, CTX)?.id ?? null, l.number).toBe((app._lcLatestQuote!(toApp(l), appCtx()) as ListQuote | null)?.id ?? null);
      for (const c of cols) expect(sortKey(l, c, CTX), `${l.number} ${c}`).toEqual(app._lcSortKey!(toApp(l), c, appCtx()));
    }
  });
});

describe('List View: search, filters, sort, selection', () => {
  const app = sandbox<Record<string, (...a: unknown[]) => unknown>>('index', { fns: LC_FNS, consts: LC_CONSTS }, { _todayISO: () => TODAY });

  it('search: name, phone (digits however typed), email, city, project, source, number, type, rep, note text', () => {
    const qs = ['', 'hannah', 'reno', 'sparks', 'ld-05', 'ld-07', 'marisol', 'dale', 'referral', 'commercial', 'property', 'lvp', '555', '7755550506', '(775) 555', '555-05', '0506', '12', 'example.test', 'walnut', 'voicemail', 'zzz', 'retail', 'home show', '& anjali'];
    for (const l of ALL) for (const q of qs) expect(matchesSearch(l, q, CTX), `${l.number} "${q}"`).toBe(app._lcMatchesSearch!(toApp(l), q, appCtx()));
  });

  it('the filtered, sorted list for 600 random filter states', () => {
    const r = rng(20261016);
    const statuses = ['all', ...LEAD_STATUSES] as const;
    const types = ['all', ...CUSTOMER_TYPES];
    const sources = ['all', 'Google', 'Referral', 'Website', 'Phone', 'Home Show', 'Facebook', ''];
    const repsF = ['all', '', 'ct-rep-1', 'ct-rep-2'];
    const ages: AgeFilter[] = ['all', 'week', 'month', 'old'];
    const buckets = ['all', 'today', 'week', 'month', 'older'] as const;
    const sorts: SortCol[] = ['number', 'name', 'phone', 'email', 'status', 'project', 'source', 'custType', 'rep', 'touch', 'quoted', 'age'];
    const qs = ['', '', '', 'r', 'reno', '555', 'dale', 'lvp', 'ld-06', 'xyz'];
    for (let i = 0; i < 600; i++) {
      const st: ListFilter = {
        q: pick(r, qs), status: pick(r, statuses), type: pick(r, types), source: pick(r, sources), rep: pick(r, repsF), age: pick(r, ages),
        bucket: pick(r, buckets), sort: pick(r, sorts), dir: r() < 0.5 ? 'asc' : 'desc',
      };
      const site = filterLeads(ALL, st, CTX).map((l) => l.id);
      const appOut = (app._lcFilterLeads!(ALL.map(toApp), { ...st, q: st.q.trim().toLowerCase() }, appCtx()) as ListLead[]).map((l) => l.id);
      expect(site, JSON.stringify(st)).toEqual(appOut);
    }
  });

  it('the panel always works a lead on the list (_lcPickSelected)', () => {
    for (const sel of [null, 'ld-11', 'ld-16', 'ld-nope']) for (const list of [ALL, ALL.slice(3, 6), []]) {
      const viewState: Record<string, unknown> = { leadSel: sel };
      const win: Record<string, unknown> = { _lcEditId: null };
      const got = sandbox<{ _lcPickSelected: (f: unknown[]) => { id: string } | null }>('index', { fns: ['_lcPickSelected'] }, { viewState, window: win })._lcPickSelected(list);
      expect(pickSelected(list, sel)?.id ?? null).toBe(got?.id ?? null);
      expect(viewState.leadSel).toBe(got?.id ?? null);
    }
  });

  it('column headers: same column flips, a new one starts in its own direction (sortLeadsBy)', () => {
    const cols: SortCol[] = ['name', 'custType', 'status', 'phone', 'source', 'rep', 'touch', 'age', 'quoted'];
    for (const cur of [...cols, null]) for (const dir of ['asc', 'desc', null]) for (const col of cols) {
      let next: Record<string, unknown> = {};
      const viewState: Record<string, unknown> = { leadSort: cur ?? undefined, leadSortDir: dir ?? undefined, leadQ: 'x' };
      sandbox<{ sortLeadsBy: (c: string) => void }>('index', { fns: ['sortLeadsBy', '_lcFilterState'] }, { viewState, navigate: (_v: string, s: Record<string, unknown>) => { next = s; } }).sortLeadsBy(col);
      const st = sandbox<{ _lcFilterState: () => ListFilter }>('index', { fns: ['_lcFilterState'] }, { viewState })._lcFilterState();
      expect(nextSort({ sort: st.sort, dir: st.dir }, col), `${cur} ${dir} → ${col}`).toEqual({ sort: next.leadSort, dir: next.leadSortDir });
      expect(next.leadQ).toBe('x'); // the search and filters stay
    }
    // The default when nothing is chosen: Age, oldest last (newest first).
    const st = sandbox<{ _lcFilterState: () => ListFilter }>('index', { fns: ['_lcFilterState'] }, { viewState: {} })._lcFilterState();
    expect({ ...DEFAULT_LIST_FILTER }).toEqual({ ...st, rep: 'all' });
  });

  it('↑ / ↓ in the search box (_lcKeyNav)', () => {
    const lists = [[], ['a'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e']];
    for (const ids of lists) for (const sel of [null, 'a', 'c', 'e', 'zz']) for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'x']) {
      let picked: string | null = null;
      let prevented = false;
      const rows = ids.map((id) => ({ getAttribute: () => id }));
      sandbox<{ _lcKeyNav: (e: unknown) => void }>('index', { fns: ['_lcKeyNav'] }, {
        document: { querySelectorAll: () => rows }, viewState: { leadSel: sel }, _lcSelect: (id: string) => { picked = id; }, _lcRevealSelected: noop,
      })._lcKeyNav({ key, preventDefault: () => { prevented = true; } });
      expect(keyNavTarget(ids, sel, key), `${ids} ${sel} ${key}`).toBe(picked);
      if (picked) expect(prevented).toBe(true);
    }
  });

  it('Clear, the stage cards\' buckets and the overdue link reset the same things', () => {
    const base: ListFilter = { q: 'reno', status: 'new', type: 'Retail', source: 'Google', rep: '', age: 'week', bucket: 'today', sort: 'name', dir: 'desc' };
    const vs = () => ({ leadQ: base.q, leadStatus: base.status, leadCustType: base.type, leadSource: base.source, leadSalesRep: base.rep, leadAgeBucket: base.age, leadBucket: base.bucket, leadSort: base.sort, leadSortDir: base.dir, leadSel: 'ld-11' });
    const asFilter = (v: Record<string, unknown>) => sandbox<{ _lcFilterState: () => ListFilter }>('index', { fns: ['_lcFilterState'] }, { viewState: v })._lcFilterState();
    let v: Record<string, unknown> = vs();
    sandbox<{ clearLeadListFilters: () => void }>('index', { fns: ['clearLeadListFilters'] }, { viewState: v, renderView: noop }).clearLeadListFilters();
    expect(clearFilters(base)).toEqual(asFilter(v));
    for (const stage of ['new', 'follow_up'] as const) for (const bucket of ['today', 'month'] as const) {
      v = vs();
      sandbox<{ _lcOpenBucket: (s: string, b: string) => void }>('index', { fns: ['_lcOpenBucket'] }, { viewState: v, window: {}, renderView: noop, document: { querySelector: () => null } })._lcOpenBucket(stage, bucket);
      expect(bucketFilter(base, stage, bucket)).toEqual(asFilter(v));
      expect(v.leadSel).toBeNull();
    }
    // The red overdue count: navigate('leads',{leadView:'list',leadSort:'age',leadSortDir:'desc'}) — a fresh view.
    const stats = code('index:fn:_lcStatsHTML');
    expect(stats).toContain(`onclick="navigate('leads',{leadView:'list',leadSort:'age',leadSortDir:'desc'})"`);
    expect(overdueStatFilter()).toEqual(asFilter({ leadView: 'list', leadSort: 'age', leadSortDir: 'desc' }));
  });
});

describe('List View: the stats line (getPipelineStats)', () => {
  it('the same numbers as the app for every set of leads', () => {
    for (const set of [listLeads, ALL, ALL.filter((l) => l.status !== 'lost'), [ALL[17]!], []]) {
      expect(pipelineStats(set, TODAY)).toEqual(JSON.parse(JSON.stringify(sandbox<{ getPipelineStats: () => unknown }>('index', { fns: ['getPipelineStats', 'isLeadStale', 'getLeadStageAgeDays', 'daysBetween'], consts: ['LEAD_STALE_DAYS'] }, { _todayISO: () => TODAY, data: { leads: set.map(toApp) } }).getPipelineStats())));
    }
  });
});

describe('quick add (_lcQuickAdd → _createLeadRecord)', () => {
  function runApp(vals: Record<string, string>, dups: unknown[] = []) {
    const toasts: Array<[string, string]> = [];
    const focused: string[] = [];
    const els: Record<string, { value: string; focus: () => void }> = {};
    for (const id of ['lcq-type', 'lcq-name', 'lcq-phone', 'lcq-email', 'lcq-address', 'lcq-source', 'lcq-salesrep']) els[id] = { value: vals[id] ?? '', focus: () => focused.push(id) };
    const data = { counters: { lead: 60 }, leads: [] as Array<Record<string, unknown>>, systemCustomerTypes: undefined };
    const viewState: Record<string, unknown> = { leadSort: 'name', leadSortDir: 'desc', leadQ: 'x', leadStatus: 'new', leadBucket: 'week' };
    const acts: string[] = [];
    const g = sandbox<{ _lcQuickAdd: () => void }>('index', { fns: ['_lcQuickAdd', '_lcQuickVals', '_createLeadRecord', 'isCustomerCompany'] }, {
      document: { getElementById: (id: string) => els[id] ?? null }, showToast: (t: string, k = 'success') => toasts.push([t, k]), window: {},
      _findDuplicates: () => dups, _dupGuardPrompt: () => toasts.push(['dup', 'prompt']), data, _todayISO: () => TODAY, addActivity: (t: string) => acts.push(t),
      createTask: noop, saveData: noop, renderView: noop, viewState, Date: fixedDate(NOW),
    });
    g._lcQuickAdd();
    return { toasts, focused, lead: data.leads[0], viewState, acts, counter: data.counters.lead };
  }

  it('name and phone are both needed: the app\'s words, the cursor in the first empty one', () => {
    for (const [name, phone] of [['', ''], ['Rosa', ''], ['', '(775) 555-0199'], ['  ', ' ']]) {
      const a = runApp({ 'lcq-name': name, 'lcq-phone': phone });
      const miss = quickAddMissing(quickAddValues({ name, phone }));
      expect(a.toasts).toEqual([[QUICK_ADD_REQUIRED_TOAST, 'warning']]);
      expect(a.focused).toEqual([miss === 'name' ? 'lcq-name' : 'lcq-phone']);
      expect(a.lead).toBeUndefined();
    }
  });

  it('a duplicate goes to the app\'s prompt first', () => {
    const a = runApp({ 'lcq-name': 'Hannah Brooks', 'lcq-phone': '(775) 555-0501' }, [{ kind: 'lead' }]);
    expect(a.toasts).toEqual([['dup', 'prompt']]);
    expect(a.lead).toBeUndefined();
  });

  it('the new lead: number, fields, New, today, selected, search and filters cleared (sort kept), toast', () => {
    for (const type of ['Retail', 'Commercial', 'Property Management', 'Builder']) for (const source of ['', 'Referral', 'Other']) {
      const vals = { 'lcq-type': type, 'lcq-name': '  Rosa Delgado ', 'lcq-phone': '(775) 555-0199', 'lcq-email': ' rosa@example.test', 'lcq-address': 'Carson City, NV', 'lcq-source': source, 'lcq-salesrep': 'ct-rep-2' };
      const a = runApp(vals);
      const v = quickAddValues({ type, name: vals['lcq-name'], phone: vals['lcq-phone'], email: vals['lcq-email'], address: vals['lcq-address'], source, salesRepId: 'ct-rep-2' });
      const s = createLeadRecord(v, { lead: 60 }, TODAY, String(a.lead!.id));
      for (const k of ['number', 'name', 'phone', 'email', 'address', 'projectType', 'source', 'status', 'salesRepId', 'type', 'siteSurveyDate', 'followUpDate', 'createdAt', 'stageChangedAt', 'notes'] as const) {
        expect(s.lead[k], `${type} ${source} ${k}`).toEqual(a.lead![k]);
      }
      expect(s.counters.lead).toBe(a.counter);
      expect(a.acts).toEqual([s.activity]);
      expect(a.toasts).toEqual([[quickAddToast(s.lead), 'success']]);
      expect(a.viewState).toMatchObject({ leadQ: '', leadStatus: 'all', leadCustType: 'all', leadSource: 'all', leadSalesRep: 'all', leadAgeBucket: 'all', leadBucket: 'all', leadSel: a.lead!.id, leadSort: 'name', leadSortDir: 'desc' });
    }
  });

  it('a survey date and a note on the way in (the phone\'s new-lead sheet)', () => {
    const data = { counters: { lead: 64 }, leads: [] as Array<Record<string, unknown>> };
    const made = sandbox<{ _createLeadRecord: (v: unknown) => Record<string, unknown> }>('index', { fns: ['_createLeadRecord', 'isCustomerCompany'] }, {
      data, _todayISO: () => TODAY, addActivity: noop, createTask: noop, saveData: noop, Date: fixedDate(NOW),
    })._createLeadRecord({ name: 'A', phone: '1', siteSurveyDate: '2026-10-19', projectType: 'Tile', noteText: ' Two baths ', type: 'Designer' });
    const s = createLeadRecord({ ...quickAddValues({ name: 'A', phone: '1', type: 'Designer' }), siteSurveyDate: '2026-10-19', projectType: 'Tile' }, { lead: 64 }, TODAY, 'x', { text: ' Two baths ', date: TODAY });
    for (const k of ['number', 'status', 'siteSurveyDate', 'projectType', 'type'] as const) expect(s.lead[k], k).toEqual(made[k]);
    expect(s.lead.notes.map((n) => n.text)).toEqual((made.notes as Array<{ text: string }>).map((n) => n.text));
  });

  it('placeholders by lead type (_lcQuickType) and the bar\'s choices', () => {
    for (const t of [...CUSTOMER_TYPES, 'individual']) {
      const els: Record<string, { placeholder: string }> = { 'lcq-name': { placeholder: '' }, 'lcq-phone': { placeholder: '' }, 'lcq-email': { placeholder: '' }, 'lcq-address': { placeholder: '' } };
      sandbox<{ _lcQuickType: (t: string) => void }>('index', { fns: ['_lcQuickType', 'isCustomerCompany'] }, { document: { getElementById: (id: string) => els[id] } })._lcQuickType(t);
      const p = quickAddPlaceholders(t);
      expect([p.name, p.phone, p.email, p.address], t).toEqual([els['lcq-name']!.placeholder, els['lcq-phone']!.placeholder, els['lcq-email']!.placeholder, els['lcq-address']!.placeholder]);
      expect(isCustomerCompany(t)).toBe(sandbox<{ isCustomerCompany: (t: string) => boolean }>('index', { fns: ['isCustomerCompany'] }).isCustomerCompany(t));
    }
    expect([...LC_QUICK_SOURCES]).toEqual(sandbox<{ LC_QUICK_SOURCES: string[] }>('index', { consts: ['LC_QUICK_SOURCES'] }).LC_QUICK_SOURCES);
    expect([...CUSTOMER_TYPES]).toEqual(sandbox<{ getCustomerTypes: () => string[] }>('index', { fns: ['getCustomerTypes'] }, { data: {} }).getCustomerTypes());
  });

  it('phone shaped while typing (formatPhoneInput)', () => {
    const fmt = sandbox<{ formatPhoneInput: (el: { value: string }) => void }>('index', { fns: ['formatPhoneInput'] });
    for (const raw of ['', '7', '77', '775', '7755', '775555', '7755550', '7755550199', '77555501999', '(775) 555-01', '+1 775 555 0199', 'abc', '775-555-0199 x12']) {
      const el = { value: raw };
      fmt.formatPhoneInput(el);
      expect(formatPhone(raw), raw).toBe(el.value);
    }
  });

  it('who is already on file (_findDuplicates)', () => {
    const customers: ListCustomer[] = [{ id: 'cu-ld-16', name: 'Dev & Anjali Prasad', phone: '(775) 555-0506', email: 'dev@example.test', address: 'Reno, NV' }];
    const finder = sandbox<{ _findDuplicates: (v: unknown) => Array<{ kind: string; rec: { id: string }; reasons: string[]; strong: boolean }> }>('index', {
      fns: ['_findDuplicates', '_dupPhone', '_dupEmail', '_dupText', '_commsPhoneNorm'],
    }, { data: { customers, leads: ALL.map(toApp) } });
    const cases = [
      { name: 'Hannah Brooks', phone: '', email: '', address: '' },
      { name: 'hannah  brooks!', phone: '', email: '', address: 'Sparks, NV' },
      { name: 'X', phone: '+1 (775) 555-0501', email: '', address: '' },
      { name: 'X', phone: '', email: 'DEV@example.test ', address: '' },
      { name: 'Dev & Anjali Prasad', phone: '7755550506', email: 'dev@example.test', address: 'Reno, NV' },
      { name: 'Nobody', phone: '7755550000', email: 'no@example.test', address: 'Elko, NV' },
      { name: '', phone: '', email: '', address: '' },
    ];
    for (const v of cases) {
      const a = finder._findDuplicates(v).map((m) => [m.kind, m.rec.id, m.reasons, m.strong]);
      const s = findDuplicates(v, ALL, customers).map((m) => [m.kind, m.rec.id, m.reasons, m.strong]);
      expect(s, JSON.stringify(v)).toEqual(a);
    }
  });
});

// ---------------------------------------------------------------- note bylines --
// landmark-flooring-app ad6cbeb (2026-10-15), index.html L6840 + L6844, verbatim.
const AD6CBEB_NOTE_BYLINE = `
function _noteAuthorName(n){if(!n||typeof n!=='object')return '';const own=String(n.userName||n.authorName||'').trim();if(own)return own;const id=n.userId||n.authorUserId;if(!id)return '';const nm=_userRecordName(id);if(nm)return nm;const rep=(typeof data!=='undefined'&&data&&Array.isArray(data.systemSalesReps))?data.systemSalesReps.find(r=>r&&r.id===id):null;return rep?String(rep.name||'').trim():'';}
function _noteByline(n){if(!n||typeof n!=='object')return '';const raw=String(n.date||n.createdAt||'').trim();let when='';if(/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)){const p=raw.split('-').map(Number);when=new Date(Date.UTC(p[0],p[1]-1,p[2],12)).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'});}else if(raw){const t=new Date(raw);if(!isNaN(t.getTime()))when=t.toLocaleDateString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',year:'numeric'})+' · '+t.toLocaleTimeString('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit'}).replace(/\\s/g,' ');}return [when,_noteAuthorName(n)].filter(Boolean).join(' · ');}
return _noteByline;`;

describe('notes: "Oct 14, 2026 · 3:07 PM · Dale Whitaker" (ad6cbeb `_noteByline`)', () => {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const appByline = new Function('data', '_userRecordName', AD6CBEB_NOTE_BYLINE)({ systemSalesReps: [] }, () => '') as (n: unknown) => string;
  it('day-only notes, stamped notes, every hour of the demo day, no author', () => {
    const cases: unknown[] = [null, {}, { date: '2026-10-14' }, { date: '2026-02-28', userName: 'Marisol Vega' }, { date: 'nope', userName: 'X' }, { text: 'a', date: '' }];
    for (let h = 0; h < 24; h++) for (const m of [0, 7, 59]) cases.push({ text: 't', date: new Date(Date.UTC(2026, 9, 14, h, m)).toISOString(), userName: 'Dale Whitaker' });
    cases.push({ date: '2026-12-01T18:30:00Z', userName: ' Dale Whitaker ' });
    for (const c of cases) expect(noteByline(c as never), JSON.stringify(c)).toBe(appByline(c));
  });
  it('a note added now carries the demo day at the shop\'s time of day', () => {
    for (const nowIso of ['2026-10-16T19:07:00Z', '2026-10-16T06:59:00Z', '2026-12-20T23:15:00Z', '2027-07-01T15:00:00Z']) {
      const now = new Date(nowIso);
      const at = demoNoteInstant(TODAY, now);
      const wall = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
      expect(appByline({ date: at, userName: 'Dale Whitaker' }), nowIso).toBe(`Oct 14, 2026 · ${wall(now).replace(/\s/g, ' ')} · Dale Whitaker`);
    }
  });
});

// ------------------------------------------------------------- the phone app --

describe('phone app: dates, names, the lead rows and the list (mobile.js)', () => {
  // STAGE / PIPE / QST live in vars; evaluate them on their own.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const vars = new Function(`${code('mobile:text:STAGE')}\n${code('mobile:text:PIPE')}\n${code('mobile:text:QST')}\n${code('mobile:text:SOURCES')}\n${code('mobile:text:PROJECT_TYPES')}\nreturn { STAGE, PIPE, QST, SOURCES, PROJECT_TYPES };`)() as Record<string, unknown>;

  it('the stage names, the ribbon, quote chips, sources and project types', () => {
    const { quote_sent: _q, ...stage } = vars.STAGE as Record<string, unknown>;
    expect(PHONE_STAGE).toEqual(stage);
    expect([...PHONE_PIPE]).toEqual(vars.PIPE);
    expect(Object.fromEntries(Object.entries(PHONE_QUOTE_STATUS))).toEqual(vars.QST);
    expect([...PHONE_SOURCES]).toEqual(vars.SOURCES);
    expect([...PHONE_PROJECT_TYPES]).toEqual(vars.PROJECT_TYPES);
  });

  // The phone code reads STAGE through stage(); rebuild with it in scope.
  const withStage = sandbox<Record<string, (...a: unknown[]) => string>>('mobile', {
    fns: ['esc', 'js', 'localISO', 'dayNum', 'todayNum', 'daysSince', 'ago', 'whenDay', 'initials', 'firstName', 'streetOf', 'stage', 'stageChip', 'avatar', 'leadRow'],
  }, { Date: fixedDate(Date.parse('2026-10-14T19:00:00Z')), STAGE: vars.STAGE, ic: (n: string) => `[${n}]`, isLeadStale: (l: ListLead) => l.number === 'LD-071', telHref: (p: string) => `tel:${p}` });

  it('ago, whenDay, initials, first name, street', () => {
    for (let d = -400; d <= 400; d += 1) {
      const iso = isoOffset(d);
      expect(phoneAgo(iso, TODAY), iso).toBe(withStage.ago!(iso));
      expect(whenDay(iso, TODAY), iso).toBe(withStage.whenDay!(iso));
    }
    for (const v of ['', null, '2026-10-14T23:30:00Z']) { expect(phoneAgo(v as string, TODAY)).toBe(withStage.ago!(v)); expect(whenDay(v as string, TODAY)).toBe(withStage.whenDay!(v)); }
    for (const n of [...ALL.map((l) => l.name), '', '  a  b  ', 'Élan', 'x@y.test']) {
      expect(phoneInitials(n), n).toBe(withStage.initials!(n));
      expect(firstName(n), n).toBe(withStage.firstName!(n));
    }
    for (const a of ['Reno, NV', '', '12 Main St, Reno, NV', 'Sparks']) expect(streetOf(a)).toBe(withStage.streetOf!(a));
  });

  it('a lead row: the line under the name and the stage chip', () => {
    for (const l of ALL) {
      const html = withStage.leadRow!(toApp(l));
      expect(phoneLeadSub(l, TODAY), l.number).toBe(stripTags(/<small>([\s\S]*?)<\/small>/.exec(html)![1]!));
      expect(PHONE_STAGE[l.status].label).toBe(stripTags(/<span class="m-chip[^"]*">([^<]*)<\/span>/.exec(html)![1]!));
    }
  });

  it('the list for each segment and search (leadListHtml)', () => {
    const segs: PhoneSeg[] = ['active', 'new', 'site_survey_scheduled', 'send_quote', 'follow_up', 'lost'];
    for (const seg of segs) for (const q of ['', 'reno', 'ld-06', 'lvp', 'zzz', '555-05']) {
      const ui = { leadQ: q, leadFilter: seg };
      const html = sandbox<{ leadListHtml: () => string }>('mobile', { fns: ['leadListHtml'] }, {
        ui, myLeads: () => ALL.map(toApp), leadRow: (l: ListLead) => `<row ${l.id}>`, empty: () => '<empty>', esc: (s: string) => s, ic: () => '',
      }).leadListHtml();
      const ids = [...html.matchAll(/<row ([^>]+)>/g)].map((x) => x[1]);
      expect(phoneLeadList(ALL, seg, q).map((l) => l.id), `${seg} "${q}"`).toEqual(ids);
    }
  });
});

describe('phone app: the stage ribbon, the next step, the sheets', () => {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const STAGE = (new Function(`${code('mobile:text:STAGE')}\nreturn STAGE;`)()) as Record<string, { label: string }>;

  it('a tap on the ribbon (M.leadStage)', () => {
    for (const l of ALL) for (const to of [...PHONE_PIPE, 'lost', 'approved'] as LeadStatus[]) for (const survey of [null, '2026-10-16']) {
      const lead = { ...l, siteSurveyDate: survey };
      const ev: string[] = [];
      const M: Record<string, (...a: unknown[]) => void> = { surveyDate: (id) => ev.push(`sheet:${id}`) };
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function('M', 'getLead', 'setLeadSurveyDate', 'changeLeadStatus', 'toast', 'stage', code('mobile:text:M.leadStage'))(
        M, () => lead, (id: string, d: string) => ev.push(`survey:${id}:${d}`), (id: string, s: string) => ev.push(`change:${id}:${s}`), (t: string) => ev.push(`toast:${t}`), (s: string) => STAGE[s],
      );
      M.leadStage!(lead.id, to);
      const t = phoneStageTap(lead, to);
      const want = t.kind === 'surveySheet' ? [`sheet:${lead.id}`] : t.kind === 'none' ? [] : t.kind === 'clearSurvey' ? [`survey:${lead.id}:`, `toast:${t.toast}`] : [`change:${lead.id}:${t.to}`, `toast:${t.toast}`];
      expect(ev, `${lead.number} ${lead.status} → ${to} (${survey})`).toEqual(want);
    }
  });

  it('the lead page: its next-step card (scrLead)', () => {
    const vars = new Function(`${code('mobile:text:STAGE')}\n${code('mobile:text:PIPE')}\nreturn { STAGE, PIPE };`)() as { STAGE: unknown; PIPE: string[] };
    for (const l of [...ALL, { ...ALL[3]!, siteSurveyDate: isoOffset(-1) }, { ...ALL[7]!, followUpDate: TODAY }, { ...ALL[7]!, followUpDate: null }, { ...ALL[5]!, address: '' }]) {
      const quotes = QUOTES.filter((q) => q.leadId === l.id);
      const page = sandbox<{ scrLead: (id: string) => { body: string } }>('mobile', {
        fns: ['scrLead', 'nextCard', 'kv', 'section', 'esc', 'js', 'localISO', 'dayNum', 'todayNum', 'daysSince', 'ago', 'whenDay', 'initials', 'firstName', 'stage', 'stageChip', 'avatar'],
      }, {
        Date: fixedDate(NOW), STAGE: vars.STAGE, PIPE: vars.PIPE, ic: (n: string) => `[${n}]`, getLead: () => toApp(l), data: { quotes: quotes.map((q) => ({ ...q })) },
        missing: () => ({ body: '' }), contactBar: () => '', quoteRow: () => '<q>', notesSection: () => '', commsSection: () => '', telHref: (p: string) => `tel:${p}`,
        addr1: (a: string, b: string) => [a, b].filter(Boolean).join(', '), repName: (id: string) => repById[id]?.name ?? '', loadComms: noop,
      }).scrLead(l.id);
      const body = page.body;
      const ns = phoneNextStep(l, TODAY, quotes);
      const card = /<div class="m-next([^"]*)">([\s\S]*?)<\/div><\/div>(?=<div class="m-card m-kvs">)/.exec(body);
      if (!ns) { expect(card, l.number).toBeNull(); continue; }
      expect(card, l.number).not.toBeNull();
      expect(card![1]!.includes('late')).toBe(ns.late);
      expect(stripTags(/<b>([\s\S]*?)<\/b>/.exec(card![2]!)![1]!)).toBe(ns.title);
      expect(stripTags(/<p>([\s\S]*?)<\/p>/.exec(card![2]!)![1]!)).toBe(ns.text);
      // The app's buttons less "Call" (a phone call leaves the page).
      const appBtns = [...card![2]!.matchAll(/<(?:button|a) [^>]*class="m-btn (primary|ghost)"[^>]*>\[([a-z-]+)\]([^<]*)<\/(?:button|a)>/g)].filter((b) => !/^Call/.test(b[3]!)).map((b) => [b[3], b[2], b[1] === 'primary']);
      expect(ns.buttons.map((b) => [b.label, b.icon, b.primary]), l.number).toEqual(appBtns);
    }
  });

  it('the survey sheet\'s days, the follow-up picks, Mark lost and the new-lead words', () => {
    let html = '';
    const sheet = (h: string) => { html = h; return { querySelectorAll: () => [], querySelector: () => ({ onclick: null, value: '' }) }; };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const M: Record<string, (...a: unknown[]) => void> = {};
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('M', 'getLead', 'sheet', 'esc', 'localISO', 'streetOf', 'Date', code('mobile:text:M.surveyDate'))(
      M, () => ({ siteSurveyDate: null, address: 'Sparks, NV' }), sheet, (s: string) => s, (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, (a: string) => a.split(',')[0], fixedDate(Date.parse('2026-10-14T19:00:00Z')),
    );
    M.surveyDate!('x');
    const days = [...html.matchAll(/data-d="([^"]+)"><small>([^<]+)<\/small><b>(\d+)<\/b>/g)].map((d) => ({ iso: d[1], small: d[2], big: Number(d[3]) }));
    expect(surveyQuickDays(TODAY)).toEqual(days);
    expect(html).toContain('Pick the day you will measure at Sparks.');

    new Function('M', 'getLead', 'sheet', 'esc', 'localISO', 'Date', code('mobile:text:M.followUpDate'))(
      M, () => ({ followUpDate: null }), sheet, (s: string) => s, (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, fixedDate(Date.parse('2026-10-14T19:00:00Z')),
    );
    M.followUpDate!('x');
    const picks = [...html.matchAll(/data-d="([^"]+)">([^<]+)<\/button>/g)].map((p) => [p[1], p[2]]);
    expect(FOLLOW_UP_PICKS.map(([n, label]) => [addDays(TODAY, n), label])).toEqual(picks);

    const lost: string[] = [];
    new Function('M', 'getLead', 'confirmSheet', 'esc', code('mobile:text:M.leadLost'))(M, () => ({ name: 'Hannah Brooks' }), (t: string, x: string, y: string) => lost.push(t, x, y), (s: string) => s);
    M.leadLost!('x');
    expect([PHONE_LOST_CONFIRM.title, phoneLostText('Hannah Brooks'), PHONE_LOST_CONFIRM.yes]).toEqual(lost);
    expect(code('mobile:text:M.leadLost')).toContain(`toast(l.name + ' marked lost')`);
    expect(phoneLostToast('Hannah Brooks')).toBe('Hannah Brooks marked lost');

    const nl = code('mobile:text:M.newLead');
    expect(nl).toContain(`need(form, 'name', '${PHONE_NEED.name}')`);
    expect(nl).toContain(`need(form, 'phone', '${PHONE_NEED.phone}')`);
    expect(nl).toContain(`toast('Lead ' + l.number + ' added')`);
    expect(phoneAddedToast({ number: 'LD-061' })).toBe('Lead LD-061 added');
  });
});
