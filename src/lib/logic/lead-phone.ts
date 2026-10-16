/**
 * The phone app's Leads screens (/mobile, live since 2026-10-07): the list
 * with its search and stage segments, the lead page (stage ribbon, next step,
 * details, quotes, notes) and the survey / follow-up date sheets. The phone
 * app draws its own screens but every change goes through the desktop's
 * functions (setLeadSurveyDate, changeLeadStatus, _createLeadRecord…), so the
 * rules are the List View's.
 *
 * Source (current app, demo main 80be9ee): mobile.js L32 `dayNum`, L40 `ago`,
 * L46 `whenDay`, L54 `initials`, L160-171 `STAGE` / `PIPE` / `stageChip`,
 * L172 `QST`, L541 `leadRow`, L633 `scrLeads`, L655 `leadListHtml`, L668
 * `scrLead` (next step), L728 `M.leadStage`, L739 `M.surveyDate`, L766
 * `M.followUpDate`, L777 `M.leadLost`, L796 `M.addNote`, L860 `SOURCES` /
 * `PROJECT_TYPES`, L887 `need`, L904 `M.newLead`. The phone's "today" is the
 * sample's DEMO_TODAY here, passed in.
 */
import { addDays, fmtWeekdayShort, type ISODate } from './dates';
import type { Lead, LeadStatus } from './lead-pipeline';
import type { ListLead, ListQuote } from './lead-list';

export type PhoneColor = 'blue' | 'indigo' | 'amber' | 'pink' | 'green' | 'gray';

/** `STAGE` (mobile.js L160): the phone app's own stage names. */
export const PHONE_STAGE: Readonly<Record<LeadStatus, { label: string; short: string; color: PhoneColor }>> = {
  new: { label: 'New', short: 'New', color: 'blue' },
  site_survey_scheduled: { label: 'Site survey', short: 'Survey', color: 'indigo' },
  send_quote: { label: 'Send quote', short: 'Quote', color: 'amber' },
  follow_up: { label: 'Follow-up', short: 'Follow-up', color: 'pink' },
  approved: { label: 'Approved', short: 'Won', color: 'green' },
  lost: { label: 'Lost', short: 'Lost', color: 'gray' },
};

/** The stage ribbon on a lead (mobile.js L169): Approved and Lost are not steps. */
export const PHONE_PIPE = ['new', 'site_survey_scheduled', 'send_quote', 'follow_up'] as const;

/** `QST` (mobile.js L172): quote status chips. */
export const PHONE_QUOTE_STATUS: Readonly<Record<ListQuote['status'], [string, PhoneColor | 'red' | 'purple']>> = {
  draft: ['Draft', 'gray'], sent: ['Sent', 'blue'], approved: ['Approved', 'green'], declined: ['Declined', 'red'], archived: ['Archived', 'purple'],
};

/** The phone's new-lead sheet choices (mobile.js L860-861). */
export const PHONE_SOURCES = ['Google', 'Referral', 'Facebook', 'Website', 'Other'] as const;
export const PHONE_PROJECT_TYPES = ['LVP', 'Carpet', 'Tile', 'Hardwood'] as const;

/** `dayNum` (mobile.js L32): whole days since the epoch for a 'YYYY-MM-DD…' value. */
export function dayNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  }
  return Math.floor(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) / 864e5);
}

/** `ago` (mobile.js L40): 'today', '1d', '9d', '3w', '4mo' ('' when unknown). */
export function phoneAgo(s: string | null | undefined, today: ISODate): string {
  const n = dayNum(s);
  if (n == null) return '';
  const d = dayNum(today)! - n;
  if (d <= 0) return 'today';
  if (d === 1) return '1d';
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)}w`;
  return `${Math.round(d / 30)}mo`;
}

/** `whenDay` (mobile.js L46): Today / Tomorrow / Yesterday, else "Fri, Oct 16" (with the year when > 180 days away). */
export function whenDay(s: string | null | undefined, today: ISODate): string {
  const n = dayNum(s);
  if (n == null) return '';
  const diff = n - dayNum(today)!;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = new Date(n * 864e5);
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (Math.abs(diff) > 180) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

/** `initials` (mobile.js L54): first + last word's first characters, '?' when empty. */
export function phoneInitials(name: string | null | undefined): string {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0]![0] || '') + (p.length > 1 ? p[p.length - 1]![0] : '')).toUpperCase();
}

/** `firstName` (mobile.js L59). */
export function firstName(name: string | null | undefined): string {
  return String(name || '').trim().split(/[\s@]+/)[0] || '';
}

/** `streetOf` (mobile.js L74): the first part of an address. */
export function streetOf(a: string | null | undefined): string {
  return String(a || '').split(',')[0]!.trim();
}

/**
 * The line under a lead's name (`leadRow`, mobile.js L541): "Survey Fri,
 * Oct 16 · Reno" on a scheduled lead, "Follow up Tomorrow · LVP …" on a
 * follow-up, else project · source · "today" / "9d ago".
 */
export function phoneLeadSub(l: Pick<ListLead, 'status' | 'createdAt' | 'projectType' | 'source' | 'siteSurveyDate' | 'followUpDate' | 'address'>, today: ISODate): string {
  const a = phoneAgo(l.createdAt, today);
  let bits = [l.projectType, l.source, a && (a === 'today' ? 'today' : `${a} ago`)].filter(Boolean) as string[];
  if (l.status === 'site_survey_scheduled' && l.siteSurveyDate) bits = [`Survey ${whenDay(l.siteSurveyDate, today)}`, streetOf(l.address)].filter(Boolean);
  else if (l.status === 'follow_up' && l.followUpDate) bits = [`Follow up ${whenDay(l.followUpDate, today)}`, ...(l.projectType ? [l.projectType] : [])];
  return bits.join(' · ');
}

export type PhoneSeg = 'active' | 'new' | 'site_survey_scheduled' | 'send_quote' | 'follow_up' | 'lost';

/** The segment row (mobile.js L633): Active · New · Survey · Quote · Follow-up · Lost, with counts. */
export const PHONE_SEGS: ReadonlyArray<{ k: PhoneSeg; label: string }> = [
  { k: 'active', label: 'Active' }, { k: 'new', label: 'New' }, { k: 'site_survey_scheduled', label: 'Survey' },
  { k: 'send_quote', label: 'Quote' }, { k: 'follow_up', label: 'Follow-up' }, { k: 'lost', label: 'Lost' },
];

export function phoneSegCounts(all: ReadonlyArray<Pick<Lead, 'status'>>): Record<PhoneSeg, number> {
  const c: Record<PhoneSeg, number> = { active: 0, new: 0, site_survey_scheduled: 0, send_quote: 0, follow_up: 0, lost: 0 };
  for (const l of all) {
    if (l.status !== 'approved' && l.status !== 'lost') c.active++;
    if (l.status in c) c[l.status as PhoneSeg]++;
  }
  return c;
}

/**
 * `leadListHtml` (mobile.js L655): the segment's leads matching the search
 * (name, phone, email, address, number, source, project), newest first.
 */
export function phoneLeadList<L extends ListLead>(all: readonly L[], seg: PhoneSeg, q: string): L[] {
  const qq = q.trim().toLowerCase();
  return all.filter((l) => {
    if (seg === 'active') { if (l.status === 'approved' || l.status === 'lost') return false; }
    else if (l.status !== seg) return false;
    if (!qq) return true;
    return [l.name, l.phone, l.email, l.address, l.number, l.source, l.projectType].join(' ').toLowerCase().indexOf(qq) >= 0;
  }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.number || '').localeCompare(String(a.number || ''), 'en', { numeric: true }));
}

export type StageTap =
  | { kind: 'none' }
  | { kind: 'surveySheet' }
  | { kind: 'clearSurvey'; toast: 'Moved back to New' }
  | { kind: 'move'; to: LeadStatus; toast: string };

/**
 * A tap on the stage ribbon (`M.leadStage`, mobile.js L728): Survey opens the
 * date sheet (the date is what moves it); back to New from a scheduled
 * survey clears the date; anything else moves straight away.
 */
export function phoneStageTap(l: Pick<Lead, 'status' | 'siteSurveyDate' | 'name'>, s: LeadStatus): StageTap {
  if (s === 'site_survey_scheduled') return { kind: 'surveySheet' };
  if (l.status === s) return { kind: 'none' };
  if (s === 'new' && l.siteSurveyDate && l.status === 'site_survey_scheduled') return { kind: 'clearSurvey', toast: 'Moved back to New' };
  return { kind: 'move', to: s, toast: `${l.name} → ${PHONE_STAGE[s].label}` };
}

/** The ribbon's steps around the current stage: done / on / ahead. */
export function phonePipeState(status: LeadStatus): Array<{ s: (typeof PHONE_PIPE)[number]; cls: 'done' | 'on' | '' }> {
  const cur = (PHONE_PIPE as readonly string[]).indexOf(status);
  return PHONE_PIPE.map((s, i) => ({ s, cls: i < cur ? 'done' : i === cur ? 'on' : '' }));
}

/** `M.leadLost` (mobile.js L777). */
export const PHONE_LOST_CONFIRM = { title: 'Mark as lost?', yes: 'Mark lost' } as const;
export const phoneLostText = (name: string) => `${name} moves to Lost. You can reopen it later.`;
export const phoneLostToast = (name: string) => `${name} marked lost`;

/** The survey sheet's seven quick days (`M.surveyDate`, mobile.js L739): today, then the weekday names. */
export function surveyQuickDays(today: ISODate): Array<{ iso: ISODate; small: string; big: number }> {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const iso = addDays(today, i);
    return { iso, small: i === 0 ? 'Today' : fmtWeekdayShort(iso).slice(0, 3), big: Number(iso.slice(8, 10)) };
  });
}

/** `M.followUpDate` (mobile.js L766): the quick picks. */
export const FOLLOW_UP_PICKS: ReadonlyArray<[number, string]> = [[1, 'Tomorrow'], [3, 'In 3 days'], [7, 'Next week'], [14, 'In 2 weeks']];
export const phoneFollowUpToast = (d: string, today: ISODate) => (d ? `Follow up ${whenDay(d, today)}` : 'Follow-up date cleared');

export interface NextStep {
  icon: 'calendar' | 'calendar-check' | 'ruler' | 'clock';
  title: string;
  text: string;
  late: boolean;
  /** survey = Pick a date / Reschedule; quote = Start quote / Build quote / Open QT-…; followUp = Change date / Set date. */
  buttons: Array<{ act: 'survey' | 'quote' | 'followUp'; label: string; icon: 'calendar' | 'file-plus' | 'send'; primary: boolean }>;
}

/**
 * The "Next step" card on a lead (`scrLead`, mobile.js L686-707), without the
 * Call buttons (a phone call leaves this page). Null for Approved / Lost.
 */
export function phoneNextStep(l: Pick<ListLead, 'status' | 'siteSurveyDate' | 'followUpDate' | 'name' | 'address'>, today: ISODate, quotes: readonly ListQuote[]): NextStep | null {
  const t = dayNum(today)!;
  if (l.status === 'new') {
    return {
      icon: 'calendar', title: 'Schedule the site survey', late: false,
      text: l.siteSurveyDate ? `Planned ${whenDay(l.siteSurveyDate, today)}` : `Call ${firstName(l.name)} and pick a day to measure.`,
      buttons: [{ act: 'survey', label: 'Pick a date', icon: 'calendar', primary: true }],
    };
  }
  if (l.status === 'site_survey_scheduled') {
    const dd = l.siteSurveyDate ? dayNum(l.siteSurveyDate)! - t : null;
    return {
      icon: 'calendar-check', late: false,
      title: l.siteSurveyDate ? `Site survey ${whenDay(l.siteSurveyDate, today)}` : 'Site survey — no date',
      text: dd != null && dd < 0 ? 'That date has passed. Done measuring? Start the quote.' : (l.address ? l.address : 'No address on file yet.'),
      buttons: [{ act: 'quote', label: 'Start quote', icon: 'file-plus', primary: true }, { act: 'survey', label: 'Reschedule', icon: 'calendar', primary: false }],
    };
  }
  if (l.status === 'send_quote') {
    const drafts = quotes.filter((q) => q.status === 'draft');
    return {
      icon: 'ruler', late: false,
      title: drafts.length ? 'Finish and send the quote' : 'Build the quote',
      text: drafts.length ? `${drafts[0]!.number} is a draft — send it when it is ready.` : 'Survey is done. Put the numbers together.',
      buttons: [drafts.length ? { act: 'quote', label: `Open ${drafts[0]!.number}`, icon: 'send', primary: true } : { act: 'quote', label: 'Build quote', icon: 'file-plus', primary: true }],
    };
  }
  if (l.status === 'follow_up') {
    const fu = l.followUpDate;
    const late = !!fu && dayNum(fu)! <= t;
    return {
      icon: 'clock', late,
      title: fu ? (late ? `Follow up — due ${whenDay(fu, today)}` : `Follow up ${whenDay(fu, today)}`) : 'Follow up',
      text: 'Check in on the quote and answer questions.',
      // The app's primary button here is "Call now" (left out); the date button stays the secondary one.
      buttons: [{ act: 'followUp', label: fu ? 'Change date' : 'Set date', icon: 'calendar', primary: false }],
    };
  }
  return null;
}

/** A quote row's line under the name (`quoteRow`, mobile.js L569): "Sent today" / "Approved Tomorrow" / "Created …". */
export function phoneQuoteWhen(q: Pick<ListQuote, 'status' | 'createdAt'> & { sentAt?: string; approvedAt?: string }, today: ISODate): string {
  if (q.status === 'sent') { const a = phoneAgo(q.sentAt || q.createdAt, today); return `Sent ${a === 'today' ? 'today' : `${a} ago`}`; }
  if (q.status === 'approved') return `Approved ${q.approvedAt ? whenDay(q.approvedAt, today) : ''}`;
  return `Created ${whenDay(q.createdAt, today)}`;
}

/** `need` (mobile.js L887) messages and the add toast (`M.newLead`, L928). */
export const PHONE_NEED = { name: 'Name is required', phone: 'Phone is required' } as const;
export const phoneAddedToast = (l: Pick<Lead, 'number'>) => `Lead ${l.number} added`;
