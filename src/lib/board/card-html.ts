// One renderer for the hero board's cards, used at build time (Astro set:html) and in the
// browser (auto-flow, incoming leads), so the two can never drift apart.
// Faithful to the app's lead kanban card (October app, `leadKbCardHTML` main L9150): urgency strip
// (follow-up overdue / stale), colored left edge, follow-up dot + name + days-in-stage, quote and
// sample chips, phone / city / rep lines, then the action bar (survey date box on New, green
// "→ Follow-up" on Send Quote, nothing on Site Survey Scheduled or Follow-up, quote + view icons).
// The app hides the lead-type eyebrow and the "project · source" line by CSS, so they're left out.
// Icons are the app's own line icons (icons.js, 24px grid, 1.75 stroke) in place of its emoji.
import { cardPrimaryAction, followUpState, isLeadStale, LEAD_AGE_BUCKETS, type ColumnBucket, type Lead } from '../logic/lead-pipeline';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Paths copied from the app's icons.js (October build).
const PATHS = {
  phone: 'M22 17v3a2 2 0 0 1-2 2 19 19 0 0 1-17-17 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L8 10a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 1.8-.5l3 .5a2 2 0 0 1 1.7 2z',
  pin: 'M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  user: 'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM4 21a8 8 0 0 1 16 0',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  note: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM13 4v5h5M8 14l4-4 2 2-4 4H8z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  ruler: 'M19 19 5 19 19 5zM11 19v-4M14 19v-6M8 19v-2M17 9l-2 2',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 3v4M16 3v4',
  warning: 'M12 4 2.6 20.5h18.8L12 4zM12 10v5M12 18h.01',
  palette: 'M12 3a9 9 0 1 0 8 13c.5-1.2-.5-2.5-1.8-2.5h-1.7a3 3 0 0 1 0-6h.5C18.5 7.5 19 6 18 4.5A9 9 0 0 0 12 3zM7 11h.01M8 16h.01M13 17h.01M15 7h.01',
  tray: 'M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M7 11l5 5 5-5M12 3v13',
  folder: 'M3 8a2 2 0 0 1 2-2h4l1 2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 12h18',
  hammer: 'M14 4l6 6-2 2-2-2-9 9-3-3 9-9-2-2zM8 13l3 3',
  check: 'M5 12.5 10 17.5 19 7',
  mobile: 'M7 3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM11 19h2',
  chevron: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  sparkles: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
} as const;
export type IconName = keyof typeof PATHS;
export const icon = (name: IconName) =>
  `<svg class="lf-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;

const DOT: Record<string, string> = { overdue: 'kc-dot-red', today: 'kc-dot-amber', soon: 'kc-dot-green' };
const DOT_TIP: Record<string, string> = { overdue: 'Follow-up overdue', today: 'Follow-up today', soon: 'Follow-up this week' };

export function leadCardHTML(lead: Lead, repName: string, today: string): string {
  const action = cardPrimaryAction(lead);
  const fu = followUpState(lead.followUpDate, today);
  const stale = isLeadStale(lead, today);
  const overdue = fu === 'overdue';
  // Left edge signals urgency: red overdue > amber stale > none (app: 4px when either, else 3px).
  const edge = overdue ? 'kc-edge-red' : stale ? 'kc-edge-amber' : '';
  const dot = fu && DOT[fu] ? `<span class="kc-dot ${DOT[fu]}" title="${DOT_TIP[fu]}" aria-hidden="true"></span>` : '';
  const strip = overdue || stale
    ? `<div class="kc-urgency">${overdue ? `<span class="kc-pill kc-pill-red" title="A follow-up is overdue on this lead">${icon('calendar')} Follow-up overdue</span>` : ''}${stale ? `<span class="kc-pill kc-pill-amber" title="No stage change in ${esc(lead.stageAgeDays)} days">${icon('warning')} Stale ${esc(lead.stageAgeDays)}d</span>` : ''}</div>`
    : '';
  let primary = '<span class="kc-spacer"></span>';
  if (action.kind === 'surveyPicker') {
    primary = `<label class="kc-survey" title="${esc(action.tip)}">${icon('ruler')}<input type="date" data-act="survey" value="${esc(lead.siteSurveyDate ?? '')}" aria-label="Site survey date for ${esc(lead.name)}" /></label>`;
  } else if (action.kind === 'advance') {
    primary = `<button type="button" class="kc-adv" data-act="advance" tabindex="-1" title="${esc(action.tip)}">${icon('arrow')} ${esc(action.label.replace(/^→\s*/, ''))}</button>`;
  }
  const chips = (lead.quoteCount > 0 ? `<span class="kc-pill kc-pill-indigo" title="${esc(lead.quoteCount)} quote${lead.quoteCount === 1 ? '' : 's'}">${icon('note')} ${esc(lead.quoteCount)}</span>` : '')
    + (lead.sampleCount > 0 ? `<span class="kc-pill kc-pill-purple" title="${esc(lead.sampleCount)} active sample${lead.sampleCount === 1 ? '' : 's'}">${icon('palette')} ${esc(lead.sampleCount)}</span>` : '');
  return `<article class="kc ${edge}" data-id="${esc(lead.id)}" data-status="${esc(lead.status)}" tabindex="-1" aria-label="${esc(lead.name)}">`
    + strip
    + `<div class="kc-name-row"><div class="kc-name">${dot}${esc(lead.name)}</div><span class="kc-age" title="Days in current stage">${esc(lead.stageAgeDays)}d</span></div>`
    + (chips ? `<div class="kc-chips">${chips}</div>` : '')
    + `<div class="kc-meta"><div class="kc-line">${icon('phone')} ${esc(lead.phone)}</div>`
    + `<div class="kc-line kc-muted">${icon('pin')} ${esc(lead.city)}</div>`
    + (repName ? `<div class="kc-line kc-muted">${icon('user')} ${esc(repName)}</div>` : '')
    + `</div><div class="kc-actions">${primary}<span class="kc-ic kc-ic-primary" aria-hidden="true">${icon('note')}</span><span class="kc-ic" aria-hidden="true">${icon('eye')}</span></div></article>`;
}

/** Bucket header icons, as the app's emoji map them: 📥 Today · 📆 This Week · 📅 This Month · 🗂 Older. */
const BUCKET_ICON: Record<ColumnBucket, IconName> = { today: 'tray', week: 'calendar', month: 'calendar', older: 'folder' };
/** Plain labels (the app's LEAD_AGE_BUCKETS labels without their emoji). */
export const BUCKET_LABEL: Record<ColumnBucket, string> = Object.fromEntries(
  LEAD_AGE_BUCKETS.map((b) => [b.key, b.label.replace(/^\S+\s+/, '')]),
) as Record<ColumnBucket, string>;

/** One collapsible age group inside a column (`leadKbColumnBodyHTML`, main L9219). */
export function bucketHTML(key: ColumnBucket, cardsHTML: string, count: number, open: boolean): string {
  return `<div class="kb-bucket${open ? '' : ' is-closed'}" data-bucket="${key}"><button type="button" class="kb-bucket-h" data-bucket-toggle aria-expanded="${open}"><span class="kb-bucket-arrow" aria-hidden="true">${icon('chevron')}</span>${icon(BUCKET_ICON[key])} ${esc(BUCKET_LABEL[key])}<span class="kb-bucket-count" data-bucket-count>${count}</span></button><div class="kb-bucket-cards" data-bucket-cards>${cardsHTML}</div></div>`;
}

/** Work-order / invoice cards that pop out of a conversion (badge colors from the app). */
export function docCardHTML(kind: 'wo' | 'inv', number: string, line: string, badge: string, badgeClass: string): string {
  return `<div class="lb-doc lb-doc-${kind}" data-doc="${esc(number)}"><div class="lb-doc-top"><span class="lb-doc-num">${esc(number)}</span><span class="kc-pill ${esc(badgeClass)}">${esc(badge)}</span></div><div class="lb-doc-line">${esc(line)}</div></div>`;
}
