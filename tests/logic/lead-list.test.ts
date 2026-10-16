import { describe, expect, it } from 'vitest';
import {
  agoLabel, bucketFilter, clearFilters, createLeadRecord, DEFAULT_LIST_FILTER, demoNoteInstant, filterLeads, findDuplicates, formatPhone, initials, keyNavTarget,
  lastTouch, listCtx, nextSort, noteByline, phoneLeadSub, phoneNextStep, phoneStageTap, pickSelected, pipelineStats, quickAddMissing, quickAddToast,
  quickAddValues, surveyQuickDays, whenDay, withNote, type ListLead,
} from '../../src/lib/logic';
import { heroIncoming, heroLeads, heroQuotes, heroState } from '../../src/data/hero-leads';

const TODAY = '2026-10-14';
const ctx = listCtx(TODAY, heroState.reps, heroQuotes);
const byNum = (n: string) => heroLeads.find((l) => l.number === n)!;

describe('the hero\'s Leads screen, as it opens', () => {
  it('the dataset\'s leads less the approved one (it became a customer); newest first', () => {
    expect(filterLeads(heroLeads, DEFAULT_LIST_FILTER, ctx).map((l) => l.number)).toEqual(['LD-051', 'LD-052', 'LD-053', 'LD-054', 'LD-055', 'LD-057', 'LD-056', 'LD-059', 'LD-058']);
    expect(heroLeads.some((l) => l.number === 'LD-060')).toBe(false);
    expect(pickSelected(filterLeads(heroLeads, DEFAULT_LIST_FILTER, ctx), null)?.name).toBe('Hannah Brooks');
  });
  it('QT-330 was emailed today: the Prasads sit in Follow-up, Quoted shows the stored total as sent', () => {
    const p = byNum('LD-056');
    expect([p.status, p.stageChangedAt]).toEqual(['follow_up', TODAY]);
    expect(heroQuotes).toEqual([{ id: 'qt-330', leadId: 'ld-16', number: 'QT-330', total: 7571.93, status: 'sent', createdAt: TODAY }]);
  });
  it('Meadowbrook\'s follow-up is two days late; the stats line', () => {
    expect(byNum('LD-059').followUpDate).toBe('2026-10-12');
    expect(pipelineStats(heroLeads, TODAY)).toEqual({ activeCount: 9, overdueFU: 1, stale: 0, avgDays: 1, winRate: 0, approved: 0, lost: 0, total: 9 });
  });
  it('the idle demo only types leads whose source the quick add bar offers; addresses are cities', () => {
    expect(heroIncoming.map((v) => [v.name, v.source])).toEqual([
      ['Priya & Sam Natarajan', 'Website'], ['Kestrel Ridge Physical Therapy', 'Referral'], ['Gary & Lynn Halvorsen', 'Google'],
      ['Lantern Peak Builders', 'Referral'], ['Marcus Bell', 'Facebook'], ['Basalt & Pine Café', 'Google'],
    ]);
    expect(heroLeads.every((l) => /^[A-Z][a-z]+( City)?, NV$/.test(l.address))).toBe(true);
    expect(heroState.user.name).toBe('Dale Whitaker');
  });
});

describe('quick add', () => {
  it('needs a name and a phone (the name first)', () => {
    expect(quickAddMissing(quickAddValues({}))).toBe('name');
    expect(quickAddMissing(quickAddValues({ name: ' Rosa ' }))).toBe('phone');
    expect(quickAddMissing(quickAddValues({ phone: '1' }))).toBe('name');
    expect(quickAddMissing(quickAddValues({ name: 'Rosa', phone: '1' }))).toBeNull();
  });
  it('the next number, New, today; it lands under Hannah (both 0 days old — the sort keeps the older record first)', () => {
    const r = createLeadRecord(quickAddValues({ name: ' Rosa Delgado ', phone: '(775) 555-0199', source: 'Referral' }), heroState.counters, TODAY, 'hl-1');
    expect([r.lead.number, r.lead.status, r.lead.createdAt, r.lead.type, r.counters.lead, r.activity]).toEqual(['LD-061', 'new', TODAY, 'Retail', 61, 'New lead LD-061 — Rosa Delgado']);
    expect(quickAddToast(r.lead)).toBe('✓ LD-061 added — Rosa Delgado');
    const list = filterLeads([...heroLeads, r.lead], DEFAULT_LIST_FILTER, ctx).map((l) => l.number);
    expect(list.slice(0, 3)).toEqual(['LD-051', 'LD-061', 'LD-052']);
  });
  it('a survey date on the way in makes it Site Survey Scheduled', () => {
    const r = createLeadRecord({ ...quickAddValues({ name: 'A', phone: '1' }), siteSurveyDate: '2026-10-19' }, { lead: 61 }, TODAY, 'x');
    expect([r.lead.number, r.lead.status, r.lead.siteSurveyDate]).toEqual(['LD-062', 'site_survey_scheduled', '2026-10-19']);
  });
  it('phone shaped as it is typed', () => {
    expect(['7', '7755', '7755550', '7755550199', '+1 775 555 0199 9'].map(formatPhone)).toEqual(['(7', '(775) 5', '(775) 555-0', '(775) 555-0199', '(177) 555-5019']);
  });
  it('who is already on file', () => {
    const d = findDuplicates({ name: 'hannah brooks', phone: '', email: '', address: 'Sparks, NV' }, heroLeads, []);
    expect(d.map((m) => [m.rec.id, m.reasons, m.strong])).toEqual([['ld-11', ['same name and address'], true]]);
    expect(findDuplicates({ name: 'Somebody', phone: '775.555.0506', email: '', address: '' }, heroLeads, [{ id: 'cu-ld-16', name: 'Dev & Anjali Prasad', phone: '(775) 555-0506', email: '', address: '' }]).map((m) => m.kind)).toEqual(['customer', 'lead']);
  });
});

describe('the list', () => {
  it('search by name, phone digits or note; filters; the bucket on a stage card', () => {
    const f = (patch: Partial<typeof DEFAULT_LIST_FILTER>) => filterLeads(heroLeads, { ...DEFAULT_LIST_FILTER, ...patch }, ctx).map((l) => l.number);
    expect(f({ q: 'VISTA' })).toEqual(['LD-053']);
    expect(f({ q: '775 555 0508' })).toEqual(['LD-058']);
    expect(f({ q: 'marisol' })).toEqual(['LD-051', 'LD-054', 'LD-056', 'LD-058']);
    expect(f({ status: 'follow_up' })).toEqual(['LD-056', 'LD-059', 'LD-058']);
    expect(f({ type: 'Commercial', rep: 'ct-rep-1' })).toEqual(['LD-053', 'LD-055', 'LD-057']);
    expect(f({ age: 'week' })).toEqual(['LD-051', 'LD-052', 'LD-053', 'LD-054', 'LD-055', 'LD-057']);
    expect(filterLeads(heroLeads, bucketFilter(DEFAULT_LIST_FILTER, 'new', 'today'), ctx).map((l) => l.number)).toEqual(['LD-051', 'LD-052']);
    const withNoteLead: ListLead = withNote(byNum('LD-052'), 'Wants a Saturday survey', '2026-10-14T19:00:00.000Z', 'Dale Whitaker');
    expect(filterLeads([withNoteLead], { ...DEFAULT_LIST_FILTER, q: 'saturday' }, ctx)).toHaveLength(1);
  });
  it('sorting: same column flips, a new one starts A→Z (names) or high→low (Last Touch, Age, Quoted)', () => {
    expect(nextSort(DEFAULT_LIST_FILTER, 'age')).toEqual({ sort: 'age', dir: 'desc' });
    expect(nextSort(DEFAULT_LIST_FILTER, 'name')).toEqual({ sort: 'name', dir: 'asc' });
    expect(nextSort({ sort: 'name', dir: 'asc' }, 'quoted')).toEqual({ sort: 'quoted', dir: 'desc' });
    const quoted = filterLeads(heroLeads, { ...DEFAULT_LIST_FILTER, sort: 'quoted', dir: 'desc' }, ctx);
    expect(quoted[0]!.number).toBe('LD-056');
  });
  it('clear keeps the sort; ↑ / ↓ stop at the ends', () => {
    expect(clearFilters({ ...DEFAULT_LIST_FILTER, q: 'x', status: 'new', sort: 'name', dir: 'desc' })).toEqual({ ...DEFAULT_LIST_FILTER, sort: 'name', dir: 'desc' });
    expect([keyNavTarget(['a', 'b'], 'a', 'ArrowDown'), keyNavTarget(['a', 'b'], 'b', 'ArrowDown'), keyNavTarget(['a', 'b'], 'a', 'ArrowUp'), keyNavTarget(['a', 'b'], null, 'ArrowUp')]).toEqual(['b', null, null, 'a']);
  });
  it('Last Touch, and the words for it', () => {
    expect(lastTouch(byNum('LD-051'))).toEqual({ day: TODAY, what: 'Created' });
    expect(lastTouch(byNum('LD-052'))).toEqual({ day: '2026-10-13', what: 'Created' }); // came in and changed stage the same day
    expect(lastTouch(byNum('LD-053'))).toEqual({ day: '2026-10-13', what: 'Stage changed' });
    expect(lastTouch(withNote(byNum('LD-052'), 'x', '2026-10-14', 'D'))).toEqual({ day: TODAY, what: 'Note logged' });
    expect(['2026-10-14', '2026-10-13', '2026-10-10', '2026-09-29', '2026-06-01', '2025-01-01', ''].map((d) => agoLabel(d, TODAY))).toEqual(['Today', 'Yesterday', '4d ago', '2w ago', '5mo ago', '1y ago', '—']);
    expect(['Dev & Anjali Prasad', 'Meadowbrook Villas HOA', '42', ''].map(initials)).toEqual(['DP', 'MH', '#', '#']);
  });
});

describe('notes since 2026-10-15: date · time · who', () => {
  it('old day-only notes show the day; new ones the Pacific time and the author', () => {
    expect(noteByline({ text: 'x', date: '2026-02-28' })).toBe('Feb 28, 2026');
    expect(noteByline({ text: 'x', date: '2026-10-14T22:07:00.000Z', userName: 'Dale Whitaker' })).toBe('Oct 14, 2026 · 3:07 PM · Dale Whitaker');
    expect(noteByline({ text: 'x', date: '2026-10-14T22:07:00.000Z' })).toBe('Oct 14, 2026 · 3:07 PM');
  });
  it('a note added now gets the sample\'s day at the shop\'s time of day', () => {
    expect(demoNoteInstant(TODAY, new Date('2026-10-16T22:07:30Z'))).toBe('2026-10-14T22:07:30.000Z'); // 3:07 PM PDT
    expect(demoNoteInstant(TODAY, new Date('2026-12-20T06:30:00Z'))).toBe('2026-10-15T05:30:00.000Z'); // 10:30 PM PST → 10:30 PM PDT on Oct 14
    expect(noteByline({ text: 'x', date: demoNoteInstant(TODAY, new Date('2026-12-20T06:30:00Z')), userName: 'D' })).toBe('Oct 14, 2026 · 10:30 PM · D');
  });
  it('the note goes on the end; an empty one is not added', () => {
    const l = withNote(withNote(byNum('LD-051'), 'first', '2026-10-14', 'D'), '  ', '2026-10-14', 'D');
    expect(l.notes.map((n) => n.text)).toEqual(['first']);
  });
});

describe('the phone app\'s Leads screens', () => {
  it('the line under a name', () => {
    expect(phoneLeadSub(byNum('LD-051'), TODAY)).toBe('LVP — main floor (~900 SqFt) · Phone · today');
    expect(phoneLeadSub(byNum('LD-054'), TODAY)).toBe('Survey Fri, Oct 16 · Reno');
    expect(phoneLeadSub(byNum('LD-056'), TODAY)).toBe('Follow up Tomorrow · LVP — great room + kitchen');
    expect(phoneLeadSub(byNum('LD-059'), TODAY)).toBe('Follow up Mon, Oct 12 · Carpet — common areas');
  });
  it('the ribbon: Survey opens the date sheet; back to New from a scheduled survey clears it', () => {
    expect(phoneStageTap(byNum('LD-051'), 'site_survey_scheduled')).toEqual({ kind: 'surveySheet' });
    expect(phoneStageTap(byNum('LD-054'), 'new')).toEqual({ kind: 'clearSurvey', toast: 'Moved back to New' });
    expect(phoneStageTap(byNum('LD-051'), 'send_quote')).toEqual({ kind: 'move', to: 'send_quote', toast: 'Hannah Brooks → Send quote' });
    expect(phoneStageTap(byNum('LD-051'), 'new')).toEqual({ kind: 'none' });
  });
  it('the next step by stage', () => {
    expect(phoneNextStep(byNum('LD-051'), TODAY, [])).toMatchObject({ title: 'Schedule the site survey', text: 'Call Hannah and pick a day to measure.', buttons: [{ label: 'Pick a date', primary: true }] });
    expect(phoneNextStep(byNum('LD-054'), TODAY, [])).toMatchObject({ title: 'Site survey Fri, Oct 16', text: 'Reno, NV', buttons: [{ label: 'Start quote' }, { label: 'Reschedule' }] });
    expect(phoneNextStep(byNum('LD-057'), TODAY, [])).toMatchObject({ title: 'Build the quote', buttons: [{ label: 'Build quote' }] });
    expect(phoneNextStep(byNum('LD-059'), TODAY, [])).toMatchObject({ title: 'Follow up — due Mon, Oct 12', late: true, buttons: [{ label: 'Change date', primary: false }] });
    expect(phoneNextStep({ ...byNum('LD-059'), status: 'lost' }, TODAY, [])).toBeNull();
  });
  it('the survey sheet\'s week and whenDay', () => {
    expect(surveyQuickDays(TODAY).map((d) => `${d.small} ${d.big}`)).toEqual(['Today 14', 'Thu 15', 'Fri 16', 'Sat 17', 'Sun 18', 'Mon 19', 'Tue 20']);
    expect(['2026-10-14', '2026-10-15', '2026-10-13', '2026-10-20', '2027-06-01'].map((d) => whenDay(d, TODAY))).toEqual(['Today', 'Tomorrow', 'Yesterday', 'Tue, Oct 20', 'Tue, Jun 1, 2027']);
  });
});
