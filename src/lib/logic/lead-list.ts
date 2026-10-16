/**
 * The Leads screen's List View (live in the app since 2026-10-14): the quick
 * add bar, the list (search, filters, sortable columns), the panel that works
 * the selected lead, the stats line and the stage cards with age buckets.
 *
 * Source (current app, demo main 80be9ee = landmark-flooring-app dd609d2):
 * main L9249 `_lcFilterState`, L9265 `_lcFiltersOn`, L9273 `_lcLocalDay`,
 * L9297 `_lcLastTouch`, L9305 `_lcAgo`, L9316 `_lcLatestQuote`, L9320
 * `_lcInitials`, L9327 `_lcMatchesSearch`, L9341 `_lcSortKey`, L9358
 * `_lcFilterLeads`, L9374 `_lcPickSelected`, L8901 `getPipelineStats`,
 * L9389-9432 quick add (`LC_QUICK_SOURCES`, `_lcQuickAdd`), L9801
 * `_createLeadRecord`, L7699 `formatPhoneInput`, L10169 `_findDuplicates`,
 * L9702 `_lcKeyNav`, L9739 `_lcOpenBucket`, L9789 `sortLeadsBy`, L8980
 * `clearLeadListFilters`, L9867 `updateLeadFollowUp`, L9881 `addLeadNote`.
 * Note bylines are the 2026-10-15 build's (landmark-flooring-app ad6cbeb,
 * `_newNoteEntry` / `_noteByline`): "Oct 15, 2026 · 9:42 AM · Name", Pacific.
 *
 * The site keeps a city where the app keeps a street address, and there is
 * no call log on the site, so "Last Touch" never says "Call".
 */
import { daysBetween, type ISODate } from './dates';
import { formatDocNumber } from './money';
import { LEAD_STATUSES, leadAgeBucketKey, leadStageAgeDays, isLeadStale, type ColumnBucket, type Lead, type LeadStatus, type LeadType } from './lead-pipeline';

/** A note on a lead: `date` is a bare day for old notes, an ISO instant for notes made since 2026-10-15. */
export interface LeadNote {
  text: string;
  date: string;
  userName?: string;
}

/** A lead as the List View holds it: the site's Lead, its address line and its notes. */
export interface ListLead extends Lead {
  /** The sample leads carry their city here (the site never shows a street address). */
  address: string;
  notes: LeadNote[];
}

export interface ListQuote {
  id: string;
  leadId: string;
  number: string;
  /** The stored total (the app's q.total). */
  total: number;
  status: 'draft' | 'sent' | 'approved' | 'declined' | 'archived';
  createdAt: ISODate;
}

export interface ListRep {
  id: string;
  name: string;
}

export interface ListCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}

/** `_lcCtx` (main L9267): lookups built once per draw. The site has no call log, so no call touches. */
export interface ListCtx {
  today: ISODate;
  repById: Readonly<Record<string, ListRep>>;
  quotesByLead: Readonly<Record<string, readonly ListQuote[]>>;
}

export function listCtx(today: ISODate, reps: readonly ListRep[], quotes: readonly ListQuote[]): ListCtx {
  const repById: Record<string, ListRep> = {};
  for (const r of reps) if (r && r.id) repById[r.id] = r;
  const quotesByLead: Record<string, ListQuote[]> = {};
  for (const q of quotes) if (q && q.leadId) (quotesByLead[q.leadId] ||= []).push(q);
  return { today, repById, quotesByLead };
}

// ------------------------------------------------------------- the filter --

export type SortCol = 'number' | 'name' | 'phone' | 'email' | 'status' | 'project' | 'source' | 'custType' | 'rep' | 'touch' | 'quoted' | 'age';
export type AgeFilter = 'all' | 'week' | 'month' | 'old';

/** `_lcFilterState` (main L9249), already normalised: `q` as typed (matching lower-cases and trims it). */
export interface ListFilter {
  q: string;
  status: 'all' | LeadStatus;
  /** Customer type, or 'all'. */
  type: string;
  source: string;
  /** 'all', '' (Unassigned) or a rep id. */
  rep: string;
  age: AgeFilter;
  bucket: 'all' | ColumnBucket;
  sort: SortCol;
  dir: 'asc' | 'desc';
}

/** Newest leads first unless a column header says otherwise: Age, ascending. */
export const DEFAULT_LIST_FILTER: Readonly<ListFilter> = {
  q: '', status: 'all', type: 'all', source: 'all', rep: 'all', age: 'all', bucket: 'all', sort: 'age', dir: 'asc',
};

/** `_lcFiltersOn` (main L9265): a search or any filter (the sort does not count). */
export function filtersOn(st: ListFilter): boolean {
  return !!(st.q.trim() || st.status !== 'all' || st.type !== 'all' || st.source !== 'all' || st.rep !== 'all' || st.age !== 'all' || st.bucket !== 'all');
}

/** `clearLeadListFilters` (main L8980): the search and every filter go; the sort stays. */
export function clearFilters(st: ListFilter): ListFilter {
  return { ...DEFAULT_LIST_FILTER, sort: st.sort, dir: st.dir };
}

/** Columns that sort A→Z first (`sortLeadsBy`, main L9789); the rest (Last Touch, Age, Quoted) start high→low. */
export const DEFAULT_ASC_COLS: readonly SortCol[] = ['name', 'number', 'phone', 'email', 'project', 'source', 'status', 'custType', 'rep'];

/** `sortLeadsBy` (main L9789): the same column flips direction, a new one starts in its default direction. */
export function nextSort(st: Pick<ListFilter, 'sort' | 'dir'>, col: SortCol): { sort: SortCol; dir: 'asc' | 'desc' } {
  if (st.sort === col) return { sort: col, dir: st.dir === 'asc' ? 'desc' : 'asc' };
  return { sort: col, dir: DEFAULT_ASC_COLS.includes(col) ? 'asc' : 'desc' };
}

/**
 * A bucket on the stage cards (`_lcOpenBucket`, main L9739): the list shows that
 * stage and age group only — search and the other filters cleared, sort kept —
 * and the selection goes to the first lead.
 */
export function bucketFilter(st: ListFilter, stage: LeadStatus, bucket: ColumnBucket | 'all'): ListFilter {
  return { ...DEFAULT_LIST_FILTER, sort: st.sort, dir: st.dir, status: stage, bucket };
}

/**
 * The red "Overdue Follow-ups" count on the stats line (main L9386):
 * `navigate('leads',{leadView:'list',leadSort:'age',leadSortDir:'desc'})` —
 * a fresh view (search, filters and selection gone) sorted by Age, oldest first.
 */
export function overdueStatFilter(): ListFilter {
  return { ...DEFAULT_LIST_FILTER, sort: 'age', dir: 'desc' };
}

// ------------------------------------------------------------ the columns --

/** `_lcLocalDay` (main L9273): a stored day stays as it is; a timestamp becomes the LOCAL day. */
export function localDay(v: unknown): string {
  const s = String(v || '');
  if (!s) return '';
  if (s.length <= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type TouchKind = 'Created' | 'Stage changed' | 'Note logged';

/**
 * `_lcLastTouch` (main L9297): the last thing the app records about a lead —
 * it came in, it changed stage, or a note was logged (the app also counts
 * calls from its call log, which the site does not have).
 */
export function lastTouch(l: Pick<ListLead, 'createdAt' | 'stageChangedAt' | 'notes'>): { day: string; what: TouchKind } {
  let day = localDay(l.createdAt);
  let what: TouchKind = 'Created';
  const take = (d: unknown, w: TouchKind) => {
    const ld = localDay(d);
    if (ld && (!day || ld > day)) { day = ld; what = w; }
  };
  take(l.stageChangedAt, 'Stage changed');
  for (const n of Array.isArray(l.notes) ? l.notes : []) take(n && n.date, 'Note logged');
  return { day, what };
}

/** `_lcAgo` (main L9305): Today, Yesterday, 3d ago, 2w ago, 4mo ago, 1y ago. */
export function agoLabel(day: string, today: ISODate): string {
  if (!day) return '—';
  const d = daysBetween(day, today);
  if (Number.isNaN(d)) return '—';
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 60) return `${Math.round(d / 7)}w ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

/** `_lcLatestQuote` (main L9316): the lead's newest quote by createdAt. */
export function latestQuote(l: Pick<Lead, 'id'>, ctx: ListCtx): ListQuote | null {
  const qs = ctx.quotesByLead[l.id] || [];
  if (!qs.length) return null;
  return qs.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0]!;
}

/** `_lcInitials` (main L9320): first + last word's first letters; '#' when there are no letters. */
export function initials(name: string | null | undefined): string {
  const s = String(name || '').trim();
  if (!/[A-Za-z]/.test(s)) return '#';
  const w = s.split(/\s+/).map((x) => x.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
  return ((w[0] || '').charAt(0) + (w.length > 1 ? w[w.length - 1]!.charAt(0) : '')).toUpperCase() || '#';
}

/** `getCustomerTypes` (main L10153) with no custom list saved. */
export const CUSTOMER_TYPES: readonly LeadType[] = ['Retail', 'Property Management', 'Contractor', 'Builder', 'Commercial', 'Designer', 'Realtor'];

/** `isCustomerCompany` (main L10154): every type but Retail is a business (🏢), Retail is a person (👤). */
export function isCustomerCompany(type: string | null | undefined): boolean {
  return !!type && type !== 'Retail' && type !== 'individual';
}

/**
 * `_lcMatchesSearch` (main L9327): name, phone, email, address, project,
 * source, number, type, rep, note text. Digits find a phone however it was
 * typed: "7755550506" finds "(775) 555-0506".
 */
export function matchesSearch(l: ListLead, q: string, ctx: ListCtx): boolean {
  if (!q) return true;
  const rep = l.salesRepId ? ctx.repById[l.salesRepId] : undefined;
  const notes = Array.isArray(l.notes) ? l.notes : [];
  const hay: unknown[] = [l.name, l.phone, l.email, l.address, undefined, l.projectType, l.source, l.number, l.type, undefined, rep && rep.name, ...notes.map((n) => n && n.text)];
  if (hay.some((v) => v && String(v).toLowerCase().includes(q))) return true;
  const qd = q.replace(/\D/g, '');
  if (qd.length >= 3 && /^[\d\s().+-]+$/.test(q)) return String(l.phone || '').replace(/\D/g, '').includes(qd);
  return false;
}

/** `_lcSortKey` (main L9341). */
export function sortKey(l: ListLead, col: SortCol, ctx: ListCtx): string | number {
  switch (col) {
    case 'number': return String(l.number || '').toLowerCase();
    case 'name': return String(l.name || '').toLowerCase();
    case 'phone': return String(l.phone || '').toLowerCase();
    case 'email': return String(l.email || '').toLowerCase();
    case 'status': { const i = (LEAD_STATUSES as readonly string[]).indexOf(l.status); return i < 0 ? 999 : i; }
    case 'project': return String(l.projectType || '').toLowerCase();
    case 'source': return String(l.source || '').toLowerCase();
    case 'custType': return String(l.type || '').toLowerCase();
    case 'rep': { const r = l.salesRepId ? ctx.repById[l.salesRepId] : undefined; return r ? String(r.name || '').toLowerCase() : '~'; }
    case 'touch': return lastTouch(l).day || '';
    case 'quoted': { const q = latestQuote(l, ctx); return q ? Number(q.total) || 0 : -1; }
    case 'age': return daysBetween(l.createdAt, ctx.today);
    default: return '';
  }
}

/**
 * `_lcFilterLeads` (main L9358): stage, type, source, rep, age, the stage
 * cards' bucket, then the search; sorted by the chosen column. The sort is
 * stable, so ties keep the leads' own order (a lead added today sits under
 * the older ones from today).
 */
export function filterLeads<L extends ListLead>(all: readonly L[], st: ListFilter, ctx: ListCtx): L[] {
  const q = st.q.trim().toLowerCase();
  const out = all.filter((l) => {
    if (st.status !== 'all' && l.status !== st.status) return false;
    if (st.type !== 'all' && (l.type || '') !== st.type) return false;
    if (st.source !== 'all' && (l.source || '') !== st.source) return false;
    if (st.rep !== 'all' && (l.salesRepId || '') !== st.rep) return false;
    if (st.age !== 'all') {
      const d = daysBetween(l.createdAt, ctx.today);
      if (st.age === 'week' && d > 7) return false;
      if (st.age === 'month' && d > 30) return false;
      if (st.age === 'old' && d <= 30) return false;
    }
    if (st.bucket !== 'all' && leadAgeBucketKey(l.createdAt, ctx.today) !== st.bucket) return false;
    return matchesSearch(l, q, ctx);
  });
  out.sort((a, b) => {
    const av = sortKey(a, st.sort, ctx);
    const bv = sortKey(b, st.sort, ctx);
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else if (av < bv) cmp = -1;
    else if (av > bv) cmp = 1;
    return st.dir === 'asc' ? cmp : -cmp;
  });
  return out;
}

/** `_lcPickSelected` (main L9374): the selection is always a lead in the list — else the top row. */
export function pickSelected<L extends Pick<Lead, 'id'>>(filtered: readonly L[], selId: string | null | undefined): L | null {
  return (selId ? filtered.find((x) => x.id === selId) : undefined) || filtered[0] || null;
}

/**
 * `_lcKeyNav` (main L9702): ↑ / ↓ in the search box walk the selection
 * through the rows on screen. Returns the id to select, or null for no change.
 */
export function keyNavTarget(ids: readonly string[], selId: string | null, key: string): string | null {
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
  if (!ids.length) return null;
  const i = selId ? ids.indexOf(selId) : -1;
  const n = key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
  const id = ids[n];
  return id && id !== selId ? id : null;
}

// ------------------------------------------------------------- stats line --

export interface PipelineStats {
  activeCount: number;
  overdueFU: number;
  stale: number;
  avgDays: number;
  winRate: number;
  approved: number;
  lost: number;
  total: number;
}

/**
 * `getPipelineStats` (main L8901), counted over the leads on the list. Since
 * October a lead whose quote is approved becomes a customer and leaves the
 * list, so "won" only counts leads still marked Approved.
 */
export function pipelineStats(leads: readonly Lead[], today: ISODate): PipelineStats {
  const active = leads.filter((l) => l.status !== 'approved' && l.status !== 'lost');
  const overdueFU = active.filter((l) => l.followUpDate && l.followUpDate < today).length;
  const stale = active.filter((l) => isLeadStale(l, today)).length;
  const avgDays = active.length ? Math.round(active.reduce((s, l) => s + leadStageAgeDays(l, today), 0) / active.length) : 0;
  const approved = leads.filter((l) => l.status === 'approved').length;
  const lost = leads.filter((l) => l.status === 'lost').length;
  const closed = approved + lost;
  const winRate = closed > 0 ? Math.round((approved / closed) * 100) : 0;
  return { activeCount: active.length, overdueFU, stale, avgDays, winRate, approved, lost, total: leads.length };
}

// -------------------------------------------------------------- quick add --

/** The quick add bar's Source choices (main L9389). */
export const LC_QUICK_SOURCES = ['Google', 'Referral', 'Facebook', 'Website', 'Other'] as const;

/** `_lcQuickAdd` (main L9423): both are needed; the app warns and puts the cursor in the first empty one. */
export const QUICK_ADD_REQUIRED_TOAST = 'Name and phone are required to add a lead.';

export interface QuickAddValues {
  type: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  salesRepId: string;
}

/** `_lcQuickVals` (main L9414): trimmed text, Retail when no type. */
export function quickAddValues(raw: Partial<Record<keyof QuickAddValues, string>>): QuickAddValues {
  const s = (v: string | undefined) => String(v || '');
  return {
    type: s(raw.type) || 'Retail', name: s(raw.name).trim(), phone: s(raw.phone).trim(), email: s(raw.email).trim(),
    address: s(raw.address).trim(), source: s(raw.source), salesRepId: s(raw.salesRepId),
  };
}

/** Which required field is empty (the app focuses the name when both are), or null. */
export function quickAddMissing(v: Pick<QuickAddValues, 'name' | 'phone'>): 'name' | 'phone' | null {
  if (!v.name || !v.phone) return v.name ? 'phone' : 'name';
  return null;
}

/** Placeholder text by lead type (`_lcQuickType`, main L9406 — the New Lead form's wording for a company). */
export function quickAddPlaceholders(type: string): { name: string; phone: string; email: string; address: string } {
  const biz = isCustomerCompany(type);
  return {
    name: biz ? (type === 'Property Management' ? 'Company / PM Name *' : 'Company Name *') : 'Name *',
    phone: biz ? 'Main Phone *' : 'Phone *',
    email: biz ? 'Billing Email' : 'Email',
    address: biz ? 'Billing Address' : 'Address',
  };
}

/**
 * `_createLeadRecord` (main L9801; the first note stamped as in ad6cbeb): the
 * next LD number; New, or Site Survey Scheduled when a survey date comes with
 * it (the phone's new-lead sheet has one, the quick add bar does not);
 * created and stage-changed today; no follow-up date. The activity line is
 * the app's.
 */
export function createLeadRecord<C extends { lead: number }>(
  v: QuickAddValues & { projectType?: string; siteSurveyDate?: string },
  counters: C,
  today: ISODate,
  id: string,
  firstNote?: LeadNote | null,
): { lead: ListLead; counters: C; activity: string } {
  const n = counters.lead + 1;
  const number = formatDocNumber('LD-', n);
  const survey = String(v.siteSurveyDate || '').slice(0, 10) || null;
  const lead: ListLead = {
    id, number, name: v.name, phone: v.phone, email: v.email, address: v.address,
    // The site's Lead keeps a city; a new lead has whatever was typed as its address.
    city: v.address,
    type: (v.type || 'Retail') as LeadType, projectType: v.projectType || '', source: v.source || '', status: survey ? 'site_survey_scheduled' : 'new',
    estimatedValue: 0, salesRepId: v.salesRepId || '', siteSurveyDate: survey, followUpDate: null, createdAt: today, stageChangedAt: today,
    stageAgeDays: 0, quoteCount: 0, sampleCount: 0, notes: firstNote && firstNote.text.trim() ? [{ ...firstNote, text: firstNote.text.trim() }] : [],
  };
  return { lead, counters: { ...counters, lead: n }, activity: `New lead ${number} — ${v.name}` };
}

/** The toast after a quick add (main L9430). */
export function quickAddToast(l: Pick<Lead, 'number' | 'name'>): string {
  return `✓ ${l.number} added — ${l.name}`;
}

/** `formatPhoneInput` (main L7699): digits only, ten at most, shaped "(775) 555-0123" while typing. */
export function formatPhone(raw: string): string {
  let v = String(raw || '').replace(/\D/g, '').slice(0, 10);
  if (v.length > 6) v = `(${v.slice(0, 3)}) ${v.slice(3, 6)}-${v.slice(6)}`;
  else if (v.length > 3) v = `(${v.slice(0, 3)}) ${v.slice(3)}`;
  else if (v.length) v = `(${v}`;
  return v;
}

// ------------------------------------------------------------- duplicates --

const dupPhone = (s: unknown) => { const d = String(s || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
const dupEmail = (s: unknown) => String(s || '').trim().toLowerCase();
const dupText = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface DuplicateMatch {
  kind: 'customer' | 'lead';
  rec: { id: string; name: string; phone: string; email?: string; address?: string };
  reasons: string[];
  strong: boolean;
}

/**
 * `_findDuplicates` (main L10169): anyone already on file with the same
 * phone, the same email, or the same name (and address). Customers first in
 * the scan, strong matches first in the result, six at most.
 */
export function findDuplicates(
  vals: Pick<QuickAddValues, 'name' | 'phone' | 'email' | 'address'>,
  leads: readonly ListLead[],
  customers: readonly ListCustomer[],
  skipId?: string,
): DuplicateMatch[] {
  const ph = dupPhone(vals.phone), em = dupEmail(vals.email);
  const nm = dupText(vals.name), ad = dupText(vals.address);
  const out: DuplicateMatch[] = [];
  const scan = (list: ReadonlyArray<DuplicateMatch['rec']>, kind: DuplicateMatch['kind']) => {
    for (const r of list) {
      if (!r || !r.id || r.id === skipId) continue;
      const reasons: string[] = [];
      if (ph && dupPhone(r.phone) === ph) reasons.push('same phone');
      if (em && dupEmail(r.email) === em) reasons.push('same email');
      const sameName = !!nm && dupText(r.name) === nm;
      if (sameName && ad && dupText(r.address) === ad) reasons.push('same name and address');
      else if (sameName) reasons.push('same name');
      if (!reasons.length) continue;
      out.push({ kind, rec: r, reasons, strong: reasons.some((x) => x !== 'same name') });
    }
  };
  scan(customers, 'customer');
  scan(leads, 'lead');
  return out.sort((a, b) => (b.strong ? 1 : 0) - (a.strong ? 1 : 0)).slice(0, 6);
}

// ------------------------------------------------------------------ notes --

const PACIFIC = 'America/Los_Angeles';

/**
 * `_noteByline` (ad6cbeb): "Oct 14, 2026 · 3:07 PM · Dale Whitaker" in Pacific
 * time; an old day-only note shows just its day. Author from the note.
 */
export function noteByline(n: Partial<LeadNote> | null | undefined): string {
  if (!n || typeof n !== 'object') return '';
  const raw = String(n.date || '').trim();
  let when = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const p = raw.split('-').map(Number);
    when = new Date(Date.UTC(p[0]!, p[1]! - 1, p[2]!, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  } else if (raw) {
    const t = new Date(raw);
    if (!Number.isNaN(t.getTime())) {
      when = t.toLocaleDateString('en-US', { timeZone: PACIFIC, month: 'short', day: 'numeric', year: 'numeric' })
        + ' · ' + t.toLocaleTimeString('en-US', { timeZone: PACIFIC, hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ');
    }
  }
  return [when, String(n.userName || '').trim()].filter(Boolean).join(' · ');
}

/**
 * The instant a note added now carries on the sample's day: the sample shop
 * lives on DEMO_TODAY, so the note gets that day with the real time of day
 * in Pacific time (the shop's zone), as an ISO string with its offset.
 * Oct–Nov 1 2026 is daylight time, so the offset is computed, not assumed.
 */
export function demoNoteInstant(demoDay: ISODate, now: Date): string {
  const wall = (t: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: PACIFIC, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(t);
    const get = (k: string) => parts.find((p) => p.type === k)?.value || '00';
    return { day: `${get('year')}-${get('month')}-${get('day')}`, h: Number(get('hour')), mi: Number(get('minute')), s: Number(get('second')) };
  };
  const w = wall(now);
  const [y, m, d] = demoDay.split('-').map(Number) as [number, number, number];
  // The same Pacific wall time on the demo day, as UTC: daylight time is UTC-7, standard UTC-8.
  for (const off of [7, 8]) {
    const utc = new Date(Date.UTC(y, m - 1, d, w.h + off, w.mi, w.s));
    const back = wall(utc);
    if (back.day === demoDay && back.h === w.h && back.mi === w.mi) return utc.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d, w.h + 7, w.mi, w.s)).toISOString();
}

/** `addLeadNote` with `_newNoteEntry` (ad6cbeb): the note goes on the end; lists show newest first. */
export function withNote<L extends ListLead>(l: L, text: string, at: string, userName: string): L {
  const t = text.trim();
  if (!t) return l;
  return { ...l, notes: [...(Array.isArray(l.notes) ? l.notes : []), { text: t, date: at, userName }] };
}
