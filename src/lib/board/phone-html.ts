// The hero on phones: the app's own phone version (/mobile) — the Leads screen and a lead's page —
// as HTML, from the same records as the desktop List View. Faithful to mobile.js `scrLeads`,
// `leadRow`, `scrLead`, `notesSection` and the date / new-lead sheets (October build), with its
// Lucide icons. Left out because they would leave this page: the Call / Text / Email / Directions
// buttons, the call button on each row, Edit lead, Delete lead and the calls & texts history.
import { addDays } from '../logic/dates';
import { fmtMoney } from '../logic/money';
import { isLeadStale } from '../logic/lead-pipeline';
import { CUSTOMER_TYPES, noteByline, type DuplicateMatch, type ListCtx, type ListLead, type ListRep } from '../logic/lead-list';
import {
  FOLLOW_UP_PICKS, PHONE_PROJECT_TYPES, PHONE_QUOTE_STATUS, PHONE_SEGS, PHONE_SOURCES, PHONE_STAGE, phoneAgo, phoneInitials, phoneLeadList, phoneLeadSub,
  phoneNextStep, phonePipeState, phoneQuoteWhen, phoneSegCounts, streetOf, surveyQuickDays, whenDay, type PhoneSeg,
} from '../logic/lead-phone';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Lucide 1.34 (ISC), as mobile.js carries them — only the ones used here.
const LU = {
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  calendar: '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
  'calendar-check': '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="m9 15 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  'file-plus': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
  'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
} as const;
export type LuName = keyof typeof LU;
export const lu = (name: LuName) => `<svg class="m-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LU[name]}</svg>`;

const chip = (s: ListLead['status']) => `<span class="m-chip c-${PHONE_STAGE[s].color}">${esc(PHONE_STAGE[s].label)}</span>`;
const av = (name: string, color: string) => `<span class="m-av c-${color}" aria-hidden="true">${esc(phoneInitials(name))}</span>`;

/** One lead on the Leads screen (`leadRow`), without its call button. */
export function phoneRowHTML(l: ListLead, today: string): string {
  const stale = isLeadStale(l, today);
  return `<div class="m-row"><button type="button" class="m-row-main" data-open="${esc(l.id)}">${av(l.name, PHONE_STAGE[l.status].color)}`
    + `<span class="m-row-txt"><b><span class="m-row-n">${esc(l.name || 'Unnamed lead')}</span>${stale ? `<em class="m-stale" title="Sitting in this stage too long">${lu('flame')}<span class="sr-only">Stale</span></em>` : ''}</b><small>${esc(phoneLeadSub(l, today))}</small></span>${chip(l.status)}</button></div>`;
}

/** The list under the segments (`leadListHtml`), or its empty state. */
export function phoneListHTML(all: readonly ListLead[], seg: PhoneSeg, q: string, today: string): string {
  const list = phoneLeadList(all, seg, q);
  if (!list.length) {
    return q.trim()
      ? `<div class="m-empty">${lu('search')}<h3>No matches</h3><p>Nothing matches “${esc(q.trim().toLowerCase())}”.</p></div>`
      : `<div class="m-empty">${lu('inbox')}<h3>No leads here</h3><p>New leads from the website, calls and walk-ins land here.</p><button type="button" class="m-btn primary" data-act="m-new">${lu('user-plus')}Add a lead</button></div>`;
  }
  return list.map((l) => phoneRowHTML(l, today)).join('');
}

/** The segment row with counts (`segs`). */
export function phoneSegsHTML(all: readonly ListLead[], seg: PhoneSeg): string {
  const c = phoneSegCounts(all);
  return PHONE_SEGS.map((s) => `<button type="button" class="m-seg${s.k === seg ? ' on' : ''}" data-seg="${s.k}" aria-pressed="${s.k === seg}">${esc(s.label)}<i>${c[s.k]}</i></button>`).join('');
}

/** A lead's page (`scrLead`): who, the stage ribbon, the next step, details, quotes, notes, Mark lost. */
export function phoneLeadHTML(l: ListLead, ctx: ListCtx): string {
  const st = PHONE_STAGE[l.status];
  const today = ctx.today;
  const quotes = (ctx.quotesByLead[l.id] || []).slice();
  const ribbon = l.status === 'lost' || l.status === 'approved'
    ? `<div class="m-banner c-${st.color}">${lu(l.status === 'lost' ? 'circle-x' : 'check')}<span>This lead is <b>${esc(st.label.toLowerCase())}</b>.</span>${l.status === 'lost' ? '<button type="button" class="m-link" data-stage="new">Reopen</button>' : ''}</div>`
    : `<div class="m-pipe" role="group" aria-label="Stage">${phonePipeState(l.status).map((p) => {
      const s = PHONE_STAGE[p.s];
      return `<button type="button" class="m-pipe-s ${p.cls} c-${s.color}" data-stage="${p.s}"${p.cls === 'on' ? ' aria-current="step"' : ''}><i></i><span>${esc(s.short)}</span></button>`;
    }).join('')}</div>`;
  const ns = phoneNextStep(l, today, quotes);
  const next = ns
    ? `<div class="m-next${ns.late ? ' late' : ''}"><div class="m-next-hd">${lu(ns.icon)}<div><small>Next step</small><b>${esc(ns.title)}</b></div></div><p>${esc(ns.text)}</p><div class="m-btnrow">${ns.buttons.map((b) => `<button type="button" class="m-btn ${b.primary ? 'primary' : 'ghost'}" data-next="${b.act}">${lu(b.icon)}${esc(b.label)}</button>`).join('')}</div></div>`
    : '';
  const rep = l.salesRepId ? ctx.repById[l.salesRepId] : undefined;
  const kv = (k: string, v: string, always = false) => (v || always ? `<div class="m-kv"><span>${esc(k)}</span><b>${esc(v || '—')}</b></div>` : '');
  const info = `<div class="m-card m-kvs">${kv('Phone', l.phone)}${kv('Email', l.email || '')}${kv('Address', l.address)}${kv('Project', l.projectType)}${kv('Type', l.type)}${kv('Source', l.source)}${kv('Sales rep', rep ? rep.name : 'Unassigned', true)}${kv('Lead #', l.number)}${kv('Created', l.createdAt ? `${whenDay(l.createdAt, today)} (${phoneAgo(l.createdAt, today)})` : '')}</div>`;
  const qrows = quotes.length
    ? `<div class="m-list">${quotes.map((q) => {
      const [label, color] = PHONE_QUOTE_STATUS[q.status];
      const site = streetOf(l.address);
      return `<div class="m-qrow"><span class="m-qrow-top"><b>${esc(l.name)}</b><strong>${fmtMoney(q.total)}</strong></span><span class="m-qrow-bot"><small>${esc([q.number, site].filter(Boolean).join(' · '))}</small><span class="m-chip c-${color}">${esc(label)}</span></span><span class="m-qrow-when">${esc(phoneQuoteWhen(q, today))}</span></div>`;
    }).join('')}</div>`
    : '<p class="m-sub m-pad">No quotes yet.</p>';
  const sec = (title: string, body: string, count?: number | null) => `<section class="m-sec"><h3 class="m-sec-t">${title}${count ? `<span class="m-count">${count}</span>` : ''}</h3>${body}</section>`;
  const notes = (Array.isArray(l.notes) ? l.notes : []).slice().reverse();
  const noteList = notes.length ? `<ul class="m-notes">${notes.slice(0, 12).map((n) => `<li><p>${esc(n.text)}</p><small class="note-byline">${esc(noteByline(n))}</small></li>`).join('')}</ul>` : '';
  const notesSec = sec('Notes', `<div class="m-card"><div class="m-note-add"><textarea id="m-note-in" rows="1" placeholder="Add a note…" aria-label="Note for ${esc(l.name)}"></textarea><button type="button" class="m-btn primary sm" data-act="m-note">Add</button></div>${noteList}</div>`, notes.length || null);
  const danger = l.status !== 'lost' && l.status !== 'approved' ? `<div class="m-danger-zone"><button type="button" class="m-btn ghost" data-act="m-lost">${lu('circle-x')}Mark lost</button></div>` : '';
  return `<div class="m-hero">${av(l.name, st.color)}<div><h3 class="m-hero-name">${esc(l.name)}</h3><p>${chip(l.status)}<span>${esc([l.number, l.source].filter(Boolean).join(' · '))}</span></p></div></div>`
    + ribbon + next + info + sec('Quotes', qrows, quotes.length || null) + notesSec + danger;
}

/** The site-survey sheet (`M.surveyDate`): this week's days, any date, Save (and Clear when one is set). */
export function surveySheetHTML(l: ListLead, today: string): string {
  const cur = l.siteSurveyDate ? String(l.siteSurveyDate).slice(0, 10) : '';
  return `<p class="m-sub">Pick the day you will measure at ${esc(l.address ? l.address.split(',')[0] : 'the site')}.</p>`
    + `<div class="m-days">${surveyQuickDays(today).map((d) => `<button type="button" class="m-day${d.iso === cur ? ' on' : ''}" data-day="${d.iso}"><small>${d.small}</small><b>${d.big}</b></button>`).join('')}</div>`
    + `<label class="m-field"><span>Or choose a date</span><input type="date" id="m-survey-d" value="${esc(cur)}"></label>`
    + `<div class="m-btnrow">${cur ? '<button type="button" class="m-btn ghost danger" data-act="m-survey-clear">Clear date</button>' : ''}<button type="button" class="m-btn primary" data-act="m-survey-save">Save</button></div>`;
}

/** The follow-up sheet (`M.followUpDate`). */
export function followUpSheetHTML(l: ListLead, today: string): string {
  return `<div class="m-chips">${FOLLOW_UP_PICKS.map(([n, label]) => `<button type="button" class="m-chipbtn" data-day="${addDays(today, n)}">${label}</button>`).join('')}</div>`
    + `<label class="m-field"><span>Date</span><input type="date" id="m-fu-d" value="${esc(l.followUpDate || '')}"></label>`
    + `<div class="m-btnrow"><button type="button" class="m-btn primary" data-act="m-fu-save">Save</button></div>`;
}

/** The new-lead sheet (`M.newLead`), without the address search (Google's) and the unit line. */
export function newLeadSheetHTML(reps: readonly ListRep[]): string {
  const chips = (name: string, label: string, values: readonly string[]) =>
    `<fieldset class="m-field"><legend>${esc(label)}</legend><div class="m-chips" data-chips="${name}">${values.map((v) => `<button type="button" class="m-chipbtn" data-v="${esc(v)}" aria-pressed="false">${esc(v)}</button>`).join('')}</div><input type="hidden" name="${name}" value=""></fieldset>`;
  return `<form class="m-form" data-m-form novalidate>`
    + `<label class="m-field"><span>Name *</span><input name="name" autocomplete="off" autocapitalize="words" required></label>`
    + `<label class="m-field"><span>Phone *</span><input name="phone" type="tel" inputmode="tel" autocomplete="off" required></label>`
    + `<label class="m-field"><span>Email</span><input name="email" type="email" inputmode="email" autocomplete="off" autocapitalize="off"></label>`
    + `<label class="m-field"><span>Address</span><input name="address" autocomplete="off"></label>`
    + chips('projectType', 'Project', PHONE_PROJECT_TYPES) + chips('source', 'How they found us', PHONE_SOURCES)
    + `<div class="m-2col"><label class="m-field"><span>Customer type</span><select name="type">${CUSTOMER_TYPES.map((t) => `<option value="${esc(t)}"${t === 'Retail' ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`
    + `<label class="m-field"><span>Sales rep</span><select name="salesRepId"><option value="">Unassigned</option>${reps.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label></div>`
    + `<label class="m-field"><span>Site survey date</span><input name="siteSurveyDate" type="date"></label>`
    + `<label class="m-field"><span>Note</span><textarea name="noteText" rows="2" placeholder="What do they need?"></textarea></label>`
    + `<button type="submit" class="m-btn primary block">${lu('check')}Save lead</button></form>`;
}

/** "Already on file?" (`dupCheck`): open the one on file, or make the new one anyway. */
export function dupSheetHTML(matches: readonly DuplicateMatch[]): string {
  return `<p class="m-sub">These look like the same person. Open one instead of making a copy?</p><div class="m-list">${matches.map((m) =>
    `<button type="button" class="m-dup" data-k="${m.kind}" data-id="${esc(m.rec.id)}">${av(m.rec.name, m.kind === 'customer' ? 'teal' : 'blue')}<span class="m-row-txt"><b><span class="m-row-n">${esc(m.rec.name)}</span> <em>${m.kind === 'customer' ? 'Customer' : 'Lead'}</em></b><small>${esc(m.reasons.join(', '))}</small></span>${lu('chevron-right')}</button>`).join('')}</div>`
    + `<div class="m-btnrow"><button type="button" class="m-btn ghost" data-act="m-dup-go">Create lead anyway</button></div>`;
}

/** A yes / no sheet (`confirmSheet`). */
export function confirmSheetHTML(text: string, yes: string, danger: boolean): string {
  return `<p class="m-confirm-t">${esc(text)}</p><div class="m-btnrow"><button type="button" class="m-btn ghost" data-act="m-no">Cancel</button><button type="button" class="m-btn ${danger ? 'danger' : 'primary'}" data-act="m-yes">${esc(yes)}</button></div>`;
}
