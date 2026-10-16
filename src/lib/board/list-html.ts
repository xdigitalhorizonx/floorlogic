// The hero's Leads screen — the app's List View — as HTML. One renderer for the build (Astro
// set:html) and the browser (every change redraws the parts it touches), so the two never drift.
// Faithful to the app's `_lcStatsHTML`, `_lcQuickAddHTML`, `_lcFiltersHTML`, `_lcTableHTML`,
// `_lcPanelHTML` and `_lcStageCardsHTML` (main L9381-9623, October build), with the app's icons in
// place of its emoji. Left out because they would leave this page in the app: the row
// checkboxes / Delete Selected, Call, Directions, Share, "Open ↗", "All fields…", the Details
// "Edit" form (its address box is Google's), Contacts, Open Tasks, Samples, Calls and the Lead
// Page links. Phone numbers and e-mail addresses are plain text here (the app links them to
// tel: / mailto:, which would dial or write to a fictional customer).
import { daysBetween, fmtDate } from '../logic/dates';
import { fmtMoney } from '../logic/money';
import { followUpState, isLeadStale, LEAD_AGE_BUCKETS, LEAD_LABELS, LEAD_STATUSES, leadAgeBucketKey, leadStageAgeDays, type ColumnBucket } from '../logic/lead-pipeline';
import { APP_SOLID, LEAD_STATUS_COLOR_NAMES, QUOTE_STATUS_COLOR_NAMES } from '../logic/status-colors';
import {
  agoLabel, CUSTOMER_TYPES, filtersOn, initials, isCustomerCompany, LC_QUICK_SOURCES, lastTouch, latestQuote, noteByline, pipelineStats,
  type ListCtx, type ListFilter, type ListLead, type ListRep, type SortCol,
} from '../logic/lead-list';
import { icon, type IconName } from './card-html';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const typeIcon = (t: string) => icon(isCustomerCompany(t || 'Retail') ? 'building' : 'user');
const stageColor = (s: string) => APP_SOLID[LEAD_STATUS_COLOR_NAMES[s as keyof typeof LEAD_STATUS_COLOR_NAMES] ?? 'gray'];
const pill = (s: string) => `<span class="badge-pill badge-${LEAD_STATUS_COLOR_NAMES[s as keyof typeof LEAD_STATUS_COLOR_NAMES] ?? 'gray'}">${esc(LEAD_LABELS[s as keyof typeof LEAD_LABELS] ?? s)}</span>`;
const avatar = (l: Pick<ListLead, 'name' | 'type'>, big = false) =>
  `<span class="lc-av${isCustomerCompany(l.type || 'Retail') ? ' biz' : ''}${big ? ' lg' : ''}" aria-hidden="true">${esc(initials(l.name))}</span>`;

/** The stats line under "Lead Pipeline" (`_lcStatsHTML`). The overdue count is a link when there is one. */
export function statsHTML(all: readonly ListLead[], today: string): string {
  if (!all.length) return '';
  const st = pipelineStats(all, today);
  const ovr = st.overdueFU > 0;
  const wr = st.winRate >= 50 ? 'lc-good' : st.winRate >= 25 ? 'lc-prim' : 'lc-bad';
  const overdue = `${icon('calendar')} <b${ovr ? ' class="lc-bad"' : ''}>${st.overdueFU}</b> Overdue Follow-ups <span class="lc-muted">· ${st.stale} stale stage</span>`;
  return `<span>${icon('folder')} <b>${st.activeCount}</b> Active Leads <span class="lc-muted">· ${st.total} total · ${st.approved} won · ${st.lost} lost</span></span>`
    + (ovr ? `<button type="button" class="lc-stat-link" data-act="overdue">${overdue}</button>` : `<span>${overdue}</span>`)
    + `<span>${icon('stopwatch')} Avg Age <b>${st.avgDays}d</b> <span class="lc-muted">in current stage</span></span>`
    + `<span>${icon('target')} Win Rate <b class="${wr}">${st.winRate}%</b> <span class="lc-muted">· ${st.approved} of ${st.approved + st.lost} closed</span></span>`;
}

/** The quick add bar (`_lcQuickAddHTML`), without "All fields…". */
export function quickAddHTML(reps: readonly ListRep[]): string {
  const types = CUSTOMER_TYPES.map((t) => `<option value="${esc(t)}">${isCustomerCompany(t) ? '🏢' : '👤'} ${esc(t)}</option>`).join('');
  const sources = LC_QUICK_SOURCES.map((s) => `<option value="${s}">${s}</option>`).join('');
  const repOpts = reps.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
  return `<form class="lc-quick-form" data-quick autocomplete="off" novalidate aria-label="Quick add a lead">`
    + `<select id="lcq-type" class="lc-q" aria-label="Lead Type" title="Lead Type">${types}</select>`
    + `<input id="lcq-name" class="lc-q" placeholder="Name *" aria-label="Name" aria-required="true">`
    + `<input id="lcq-phone" class="lc-q" placeholder="Phone *" aria-label="Phone" aria-required="true" inputmode="tel">`
    + `<input id="lcq-email" class="lc-q" placeholder="Email" aria-label="Email" inputmode="email">`
    + `<div class="lc-q-addr"><input id="lcq-address" class="lc-q" placeholder="Address" aria-label="Address"></div>`
    + `<select id="lcq-source" class="lc-q" aria-label="Source" title="Source"><option value="">Source</option>${sources}</select>`
    + `<select id="lcq-salesrep" class="lc-q" aria-label="Assigned Sales Rep" title="Assigned Sales Rep"><option value="">Sales Rep</option>${repOpts}</select>`
    + `<button type="submit" class="lc-btn lc-btn-primary">+ Add lead</button></form>`;
}

/** The filter bar under the search (`_lcFiltersHTML`): Status · Type · Source · Rep · Age, the bucket chip, Clear. */
export function filtersHTML(all: readonly ListLead[], st: ListFilter, reps: readonly ListRep[]): string {
  const sources = Array.from(new Set(all.map((l) => (l.source || '').trim()).filter(Boolean))).sort();
  const repsSorted = reps.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const opt = (v: string, label: string, on: boolean) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
  const sel = (key: string, label: string, active: boolean, activeLabel: string, opts: string) =>
    `<select data-filter="${key}" aria-label="${label}" title="${esc(active ? `Filter active — ${activeLabel}` : `Filter by ${label}`)}" class="lf-filter-sel${active ? ' lf-filter-sel-active' : ''}">${opts}</select>`;
  const statusOpts = opt('all', `Status${st.status === 'all' ? ` (${all.length})` : ''}`, st.status === 'all')
    + LEAD_STATUSES.map((s) => opt(s, `${LEAD_LABELS[s]} (${all.filter((l) => l.status === s).length})`, st.status === s)).join('');
  const typeOpts = opt('all', 'Type', st.type === 'all') + CUSTOMER_TYPES.map((t) => opt(t, t, st.type === t)).join('');
  const sourceOpts = opt('all', 'Source', st.source === 'all') + sources.map((s) => opt(s, s, st.source === s)).join('');
  const repOpts = opt('all', 'Rep', st.rep === 'all') + opt('', 'Unassigned', st.rep === '') + repsSorted.map((r) => opt(r.id, r.name, st.rep === r.id)).join('');
  const ageOpts = opt('all', 'Age', st.age === 'all') + opt('week', '≤ 1 week', st.age === 'week') + opt('month', '≤ 1 month', st.age === 'month') + opt('old', '> 1 month', st.age === 'old');
  const repName = st.rep === '' ? 'Unassigned' : (repsSorted.find((r) => r.id === st.rep)?.name ?? '');
  const bucket = st.bucket !== 'all' ? LEAD_AGE_BUCKETS.find((b) => b.key === st.bucket) : null;
  const chip = bucket
    ? `<span class="lc-chip" title="From the stage cards below">${bucketIcon(bucket.key)} ${esc(bucketText(bucket.key))}<button type="button" data-act="unbucket" title="Remove this filter" aria-label="Remove this filter">${icon('x')}</button></span>`
    : '';
  return sel('status', 'Status', st.status !== 'all', LEAD_LABELS[st.status as keyof typeof LEAD_LABELS] ?? '', statusOpts)
    + sel('type', 'Type', st.type !== 'all', st.type, typeOpts)
    + sel('source', 'Source', st.source !== 'all', st.source, sourceOpts)
    + sel('rep', 'Rep', st.rep !== 'all', repName, repOpts)
    + sel('age', 'Age', st.age !== 'all', st.age, ageOpts)
    + chip
    + (filtersOn(st) ? `<button type="button" class="lf-clear-btn" data-act="clear" title="Clear the search and all filters">${icon('x')} Clear</button>` : '');
}

// The app's column widths (main L9473), less its 34px checkbox column.
const COLS: ReadonlyArray<{ col: SortCol; label: string; cls?: string; width: string }> = [
  // Widths re-balanced for the hero's narrower card (no checkbox column): rep names and
  // "Yesterday" fit whole at 1440px; long names and e-mails take the ellipsis instead.
  { col: 'name', label: 'Name', width: '19%' },
  { col: 'custType', label: 'Customer Type', cls: 'lc-th-wrap', width: '11%' },
  { col: 'status', label: 'Status', width: '15%' },
  { col: 'phone', label: 'Phone · Email', width: '15.5%' },
  { col: 'source', label: 'Source', width: '8%' },
  { col: 'rep', label: 'Rep', width: '10%' },
  { col: 'touch', label: 'Last Touch', cls: 'lc-th-wrap', width: '8.5%' },
  { col: 'age', label: 'Age', cls: 'lc-num', width: '5%' },
  { col: 'quoted', label: 'Quoted', cls: 'lc-num', width: '8%' },
];

const FU_TIP: Record<string, string> = { overdue: 'Follow-up overdue', today: 'Follow-up today', soon: 'Follow-up this week' };

/** One row of the list (`_lcTableHTML`'s row, without the checkbox). The name cell is the row's button. */
export function rowHTML(l: ListLead, selected: boolean, ctx: ListCtx): string {
  const fu = followUpState(l.followUpDate, ctx.today);
  const stale = isLeadStale(l, ctx.today);
  const rep = l.salesRepId ? ctx.repById[l.salesRepId] : undefined;
  const touch = lastTouch(l);
  const q = latestQuote(l, ctx);
  const days = daysBetween(l.createdAt, ctx.today);
  const dot = fu && FU_TIP[fu] ? `<span class="lc-fu lc-fu-${fu}" title="${FU_TIP[fu]}"><span class="sr-only">${FU_TIP[fu]}: </span></span>` : '';
  const ct = l.type || '';
  return `<tr class="lc-row${selected ? ' lc-row-sel' : ''}" data-id="${esc(l.id)}">`
    + `<td><button type="button" class="lc-namecell" data-sel tabindex="${selected ? 0 : -1}" aria-current="${selected}" aria-controls="lc-panel">${avatar(l)}<span class="lc-nm"><span class="lc-nm1">${dot}${esc(l.name)}</span><span class="lc-nm2">${esc(l.number || '—')}</span></span></button></td>`
    + `<td class="lc-muted"><div class="lc-clip" title="${esc(ct)}">${ct ? `${typeIcon(ct)} ${esc(ct)}` : '—'}</div></td>`
    + `<td>${pill(l.status)}${stale ? `<span class="lc-stale" title="Stale — no stage change in ${leadStageAgeDays(l, ctx.today)} days">${icon('warning')}<span class="sr-only"> Stale</span></span>` : ''}</td>`
    + `<td><div class="lc-clip">${l.phone ? esc(l.phone) : '<span class="lc-muted">—</span>'}</div>${l.email ? `<div class="lc-sub" title="${esc(l.email)}">${esc(l.email)}</div>` : ''}</td>`
    + `<td class="lc-muted"><div class="lc-clip" title="${esc(l.source || '')}">${esc(l.source || '—')}</div></td>`
    + `<td class="lc-muted"><div class="lc-clip" title="${rep ? esc(rep.name) : 'Unassigned'}">${rep ? esc(rep.name) : '—'}</div></td>`
    + `<td title="${esc(touch.what + (touch.day ? ` · ${fmtDate(touch.day)}` : ''))}">${agoLabel(touch.day, ctx.today)}</td>`
    + `<td class="lc-num lc-muted">${Number.isNaN(days) ? '—' : `${days}d`}</td>`
    + `<td class="lc-num">${q ? fmtMoney(Number(q.total) || 0) : '<span class="lc-muted">—</span>'}</td></tr>`;
}

/** The list (`_lcTableHTML`): sortable headers, one row per lead, or the app's empty state. */
export function tableHTML(filtered: readonly ListLead[], st: ListFilter, selId: string | null, ctx: ListCtx): string {
  if (!filtered.length) {
    const on = filtersOn(st);
    return `<div class="lc-table-empty"><div class="icon">${icon('bookmark')}</div><h3>${on ? 'No leads match your filters' : 'No leads yet'}</h3><p>${on ? 'Try clearing one or more filters.' : 'Add your first lead in the bar above.'}</p>`
      + (on ? `<button type="button" class="lc-btn lc-btn-outline lc-btn-sm" data-act="clear">Clear Filters</button>` : `<button type="button" class="lc-btn lc-btn-primary lc-btn-sm" data-act="focus-add">+ Add a lead</button>`) + `</div>`;
  }
  const head = `<colgroup>${COLS.map((c) => `<col style="width:${c.width}">`).join('')}</colgroup><thead><tr>`
    + COLS.map((c) => {
      const on = st.sort === c.col;
      const ind = on ? icon(st.dir === 'asc' ? 'caretUp' : 'caretDown') : icon('swap');
      return `<th scope="col" class="lc-th-sort${c.cls ? ` ${c.cls}` : ''}"${on ? ` aria-sort="${st.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${c.col}" title="Sort by ${c.label}">${c.label}<span class="lc-sort${on ? ' on' : ''}" aria-hidden="true">${ind}</span></button></th>`;
    }).join('') + `</tr></thead>`;
  return `<table class="lc-table" aria-label="Leads">${head}<tbody>${filtered.map((l) => rowHTML(l, l.id === selId, ctx)).join('')}</tbody></table>`;
}

const STAGE_TIP_AUTO = 'Reached automatically when one of this lead’s quotes is approved';

/** The panel beside the list (`_lcPanelHTML`) for the selected lead. */
export function panelHTML(l: ListLead | null, ctx: ListCtx): string {
  if (!l) return `<div class="lc-p-empty"><div class="icon">${icon('note')}</div><h3>No lead selected</h3><p>Pick a lead in the list to work it here.</p></div>`;
  const ct = l.type || '';
  const daysLead = daysBetween(l.createdAt, ctx.today);
  const daysStage = leadStageAgeDays(l, ctx.today);
  const stale = isLeadStale(l, ctx.today);
  const fu = followUpState(l.followUpDate, ctx.today);
  const rep = l.salesRepId ? ctx.repById[l.salesRepId] : undefined;
  const notes = Array.isArray(l.notes) ? l.notes : [];
  const quotes = (ctx.quotesByLead[l.id] || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const dash = '<span class="lc-muted">—</span>';
  const sec = (cls: string, title: string, count: number | null, body: string) =>
    `<div class="lc-sec ${cls}"><h4 class="lc-sec-h"><span>${title}${count != null ? `<span class="lc-sec-n">${count}</span>` : ''}</span></h4>${body}</div>`;

  const head = `<div class="lc-p-head">${avatar(l, true)}<div class="lc-p-title"><h3 class="lc-p-name" id="lc-p-name">${esc(l.name)}</h3><div class="lc-p-sub">${esc(l.number || '')}${ct ? ` · ${typeIcon(ct)} ${esc(ct)}` : ''}</div></div></div>`;
  const flags = (fu === 'overdue' ? `<span class="badge-pill badge-red" title="A follow-up is overdue on this lead">${icon('calendar')} Follow-up overdue</span>` : '')
    + (stale ? `<span class="badge-pill badge-amber" title="No stage change in ${daysStage} days">${icon('warning')} Stale ${daysStage}d</span>` : '');
  const stageLine = `<div class="lc-p-stage">${pill(l.status)}<span class="lc-muted">${daysStage}d in stage · ${Number.isNaN(daysLead) ? '—' : `${daysLead}d`} as lead</span>${flags}</div>`;
  const contact = `<div class="lc-p-contact">${l.email ? `<span>${icon('envelope')} ${esc(l.email)}</span>` : `<span class="lc-muted">${icon('envelope')} No email</span>`}<span class="lc-muted" aria-hidden="true">·</span>${l.phone ? `<span>${icon('phone')} ${esc(l.phone)}</span>` : `<span class="lc-muted">${icon('phone')} No phone</span>`}</div>`;
  // "New Quote" opens the quote builder in the app; here it goes to the working quote builder below.
  const actions = `<div class="lc-p-actions"><a class="lc-btn lc-btn-outline lc-btn-sm" href="#product" data-act="new-quote" title="Try the quote builder below">${icon('note')} New Quote</a></div>`;

  // Approved is shown but is not a button: a lead gets there when one of its quotes is approved.
  const stageBtns = LEAD_STATUSES.map((s) => {
    const on = l.status === s;
    const style = `style="--c:${stageColor(s)}"`;
    if (s === 'approved') return `<span class="lc-stage-btn lc-stage-auto${on ? ' on' : ''}" data-stage="${s}" ${style} title="${on ? 'Current stage — reached when a quote was approved' : STAGE_TIP_AUTO}">${LEAD_LABELS[s]}<span class="sr-only"> (${STAGE_TIP_AUTO.toLowerCase()})</span></span>`;
    const tip = on ? 'Current stage' : s === 'site_survey_scheduled' && !l.siteSurveyDate ? 'Set a site-survey date below — that moves it here' : `Move to ${LEAD_LABELS[s]}`;
    return `<button type="button" class="lc-stage-btn${on ? ' on' : ''}" data-stage="${s}" ${style} aria-pressed="${on}" title="${esc(tip)}">${LEAD_LABELS[s]}</button>`;
  }).join('');
  const dates = `<div class="lc-dates"><label class="lc-date"><span>${icon('ruler')} Site Survey Date</span><input type="date" id="lc-survey-date" data-act="survey" value="${esc(l.siteSurveyDate || '')}" title="Setting a date moves a New lead to Site Survey Scheduled; it moves on to Send Quote once the date passes"></label>`
    + `<label class="lc-date"><span>${icon('calendar')} Follow-up Date</span><input type="date" id="lc-followup-date" data-act="followup" value="${esc(l.followUpDate || '')}" title="Surfaces this lead in your Follow-Up Queue on that day"></label></div>`;
  const stageSec = sec('lc-sec-stage', 'Stage', null, `<div class="lc-stage-btns" role="group" aria-label="Stage">${stageBtns}</div>${dates}`);

  const noteList = notes.length
    ? notes.slice().reverse().map((n) => `<div class="lc-note"><div class="lc-note-d note-byline">${esc(noteByline(n))}</div><div class="lc-note-t">${esc(n.text)}</div></div>`).join('')
    : '<div class="lc-empty">No notes yet — log your first touch.</div>';
  const notesSec = sec('lc-sec-notes', 'Notes', notes.length,
    `<textarea id="lead-note-input" class="lc-note-in" rows="2" placeholder="Called, emailed, what they said… (Ctrl+Enter to add)" aria-label="Note for ${esc(l.name)}"></textarea><div class="lc-note-btns"><button type="button" class="lc-btn lc-btn-primary lc-btn-sm" data-act="note">Add note</button></div><div class="lc-notes">${noteList}</div>`);

  const row = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;
  const detailsSec = sec('lc-sec-details', 'Details', null, `<dl class="lc-dl">`
    + row('Lead Type', ct ? `${typeIcon(ct)} ${esc(ct)}` : dash)
    + row('Address', l.address ? esc(l.address) : dash)
    + row('Suite / Unit / Apt', dash)
    + row('Access Details', dash)
    + row('Project Type', l.projectType ? esc(l.projectType) : dash)
    + row('Source', l.source ? esc(l.source) : dash)
    + row('Assigned Sales Rep', rep ? esc(rep.name) : '<span class="lc-muted">Unassigned</span>')
    + row('Created', l.createdAt ? esc(fmtDate(l.createdAt)) : dash)
    + `</dl>`);

  const quoteBody = quotes.length
    ? quotes.map((q) => `<div class="lc-qrow"><span class="lc-q-n">${esc(q.number)}</span><span class="lc-muted">${esc(fmtDate(q.createdAt))}</span><span class="lc-q-t">${fmtMoney(Number(q.total) || 0)}</span><span class="badge-pill badge-${QUOTE_STATUS_COLOR_NAMES[q.status] ?? 'gray'}">${esc(q.status)}</span></div>`).join('')
    : '<div class="lc-empty">No quotes yet.</div>';
  const quotesSec = sec('lc-sec-quotes', 'Quotes', quotes.length, quoteBody);

  return head + stageLine + contact + actions + stageSec + notesSec + detailsSec + quotesSec;
}

const BUCKET_ICON: Record<ColumnBucket, IconName> = { today: 'tray', week: 'calendar', month: 'calendar', older: 'folder' };
const bucketIcon = (k: ColumnBucket) => icon(BUCKET_ICON[k]);
/** The bucket's words without the app's emoji (which its icon replaces). */
const bucketText = (k: ColumnBucket) => (LEAD_AGE_BUCKETS.find((b) => b.key === k)?.label ?? k).replace(/^\S+\s+/, '');

/** The stage cards under the list (`_lcStageCardsHTML`): one per stage but Lost, split into age buckets. */
export function stageCardsHTML(all: readonly ListLead[], st: ListFilter, today: string): string {
  return LEAD_STATUSES.filter((s) => s !== 'lost').map((s) => {
    const arr = all.filter((l) => l.status === s);
    const n: Record<ColumnBucket, number> = { today: 0, week: 0, month: 0, older: 0 };
    for (const l of arr) n[leadAgeBucketKey(l.createdAt, today)]++;
    const rows = LEAD_AGE_BUCKETS.filter((b) => n[b.key] > 0).map((b) => {
      const on = st.status === s && st.bucket === b.key;
      return `<button type="button" class="lc-bucket${on ? ' on' : ''}" data-stage="${s}" data-bucket="${b.key}" aria-pressed="${on}" title="Show these leads in the list"><span class="lbl"><span class="sr-only">${LEAD_LABELS[s]}, </span>${bucketIcon(b.key)} ${esc(bucketText(b.key))}</span><span class="n">${n[b.key]}</span><span class="chev" aria-hidden="true">›</span></button>`;
    }).join('');
    return `<div class="lc-card lc-stage-card" data-stage="${s}" style="--c:${stageColor(s)}"><div class="lc-stage-h"><span class="lc-stage-name">${LEAD_LABELS[s]}</span><span class="lc-stage-n">${arr.length}</span></div>${rows || '<div class="lc-empty">Empty</div>'}</div>`;
  }).join('');
}
