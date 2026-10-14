// One renderer for the hero board's cards, used at build time (Astro set:html) and in the
// browser (auto-flow, incoming leads), so the two can never drift apart.
// Faithful to the app's lead kanban card (demo main: leadKbCardHTML ~line 7976) in its "roomy"
// density, with the app's own line icons (icons.js, 24px grid, 1.75 stroke): follow-up dot +
// name + days-in-stage, project · source, quote/sample chips, phone / city / rep lines, then the
// action bar (survey picker on New, green "→ Next" advance, quote + view icon buttons).
import { cardPrimaryAction, followUpState, type Lead } from '../logic/lead-pipeline';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Paths copied from the app's icons.js (main).
const PATHS = {
  phone: 'M22 17v3a2 2 0 0 1-2 2 19 19 0 0 1-17-17 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L8 10a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 1.8-.5l3 .5a2 2 0 0 1 1.7 2z',
  pin: 'M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  user: 'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM4 21a8 8 0 0 1 16 0',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  note: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM13 4v5h5M8 14l4-4 2 2-4 4H8z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  building: 'M4 3h16v18H4zM9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-4h4v4',
  ruler: 'M19 19 5 19 19 5zM11 19v-4M14 19v-6M8 19v-2M17 9l-2 2',
  tools: 'M14 4l6 6-2 2-6-6zM12 6l-9 9 3 3 9-9M9 13l3 3',
} as const;
export const icon = (name: keyof typeof PATHS) =>
  `<svg class="lf-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;

const DOT: Record<string, string> = { overdue: 'kc-dot-red', today: 'kc-dot-amber', soon: 'kc-dot-green' };

export function leadCardHTML(lead: Lead, repName: string, today: string): string {
  const biz = !!lead.type && lead.type !== 'Retail';
  const action = cardPrimaryAction(lead);
  const fu = followUpState(lead.followUpDate, today);
  const dot = fu && DOT[fu] ? `<span class="kc-dot ${DOT[fu]}" aria-hidden="true"></span>` : '';
  let primary = '<span class="kc-spacer"></span>';
  if (action.kind === 'surveyPicker') {
    primary = `<button type="button" class="kc-survey" data-act="survey" tabindex="-1" title="${esc(action.tip)}">${icon('ruler')} Set survey date</button>`;
  } else if (action.kind === 'advance' && lead.status !== 'approved') {
    primary = `<button type="button" class="kc-adv" data-act="advance" tabindex="-1" title="${esc(action.tip)}">${icon('arrow')} ${esc(action.label.replace(/^→\s*/, ''))}</button>`;
  }
  const chips = (lead.quoteCount > 0 ? `<span class="kc-pill kc-pill-indigo">${icon('note')} ${esc(lead.quoteCount)}</span>` : '')
    + (lead.sampleCount > 0 ? `<span class="kc-pill kc-pill-purple">● ${esc(lead.sampleCount)}</span>` : '');
  return `<article class="kc" data-id="${esc(lead.id)}" data-status="${esc(lead.status)}" tabindex="-1" aria-label="${esc(lead.name)}">`
    + (biz ? `<div class="kc-cat">${icon('building')} ${esc(lead.type)}</div>` : '')
    + `<div class="kc-name-row"><div class="kc-name">${dot}${esc(lead.name)}</div><span class="kc-age" title="Days in current stage">${esc(lead.stageAgeDays)}d</span></div>`
    + `<div class="kc-tags"><span>${icon('tools')} ${esc(lead.projectType)}</span><span class="kc-sep" aria-hidden="true">·</span><span>${esc(lead.source)}</span></div>`
    + (chips ? `<div class="kc-chips">${chips}</div>` : '')
    + `<div class="kc-meta"><div class="kc-line">${icon('phone')} ${esc(lead.phone)}</div>`
    + `<div class="kc-line kc-muted">${icon('pin')} ${esc(lead.city)}</div>`
    + (repName ? `<div class="kc-line kc-muted">${icon('user')} ${esc(repName)}</div>` : '')
    + `</div><div class="kc-actions">${primary}<span class="kc-ic kc-ic-primary" aria-hidden="true">${icon('note')}</span><span class="kc-ic" aria-hidden="true">${icon('eye')}</span></div></article>`;
}

/** Work-order / invoice cards that pop out of an approval (badge colors from the app). */
export function docCardHTML(kind: 'wo' | 'inv', number: string, line: string, badge: string, badgeClass: string): string {
  return `<div class="lb-doc lb-doc-${kind}" data-doc="${esc(number)}"><div class="lb-doc-top"><span class="lb-doc-num">${esc(number)}</span><span class="kc-pill ${esc(badgeClass)}">${esc(badge)}</span></div><div class="lb-doc-line">${esc(line)}</div></div>`;
}
