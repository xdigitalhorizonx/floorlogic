// The hero on desktop: the app's Leads screen in its List View (live in the app since 2026-10-14).
// Quick add, the list's search / filters / sorting, row selection (mouse and keyboard), the panel's
// stage buttons (`_leadTryMoveStage`), survey and follow-up dates, notes, the stage cards' buckets,
// and — until the visitor takes over — an idle demo made only of real moves. Loaded only on screens
// 900px and wider; the records and the story live in living-board.ts.
import { addDays } from '../lib/logic/dates';
import { canDrop, type ColumnBucket, type LeadStatus } from '../lib/logic/lead-pipeline';
import {
  bucketFilter, clearFilters, DEFAULT_LIST_FILTER, filterLeads, findDuplicates, formatPhone, keyNavTarget, listCtx, nextSort, overdueStatFilter,
  pickSelected, QUICK_ADD_REQUIRED_TOAST, quickAddMissing, quickAddPlaceholders, quickAddToast, quickAddValues,
  type ListFilter, type QuickAddValues, type SortCol,
} from '../lib/logic/lead-list';
import { filtersHTML, panelHTML, stageCardsHTML, statsHTML, tableHTML } from '../lib/board/list-html';
import type { HeroApi, HeroView } from './hero-api';

export function mountListView(api: HeroApi, pauseBtns: HTMLButtonElement[]): HeroView {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => api.root.querySelector<T>(sel)!;
  const plane = $('[data-plane]');
  const statsEl = $('[data-stats]');
  const quickForm = $<HTMLFormElement>('[data-quick]');
  const searchEl = $<HTMLInputElement>('[data-search]');
  const countEl = $('[data-count]');
  const filtersEl = $('[data-filters]');
  const tableEl = $('[data-table]');
  const panelEl = $('[data-lc-panel]');
  const stagesEl = $('[data-stages]');
  const TODAY = api.today;

  let filter: ListFilter = { ...DEFAULT_LIST_FILTER };
  let selId: string | null = panelEl.dataset.lead || null;
  const ctx = () => listCtx(TODAY, api.reps, api.quotes());

  // ------------------------------------------------------------------ drawing --
  let lastSig = '';
  const sig = () => JSON.stringify([filter.q.trim().toLowerCase(), filter.status, filter.type, filter.source, filter.rep, filter.age, filter.bucket, filter.sort, filter.dir]);
  /** Where focus was, so a redraw can put it back on the same control. */
  function focusKey(): string | null {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !plane.contains(a)) return null;
    const row = a.closest<HTMLElement>('tr[data-id]');
    if (a.matches('[data-sel]') && row) return `[data-sel]@${row.dataset.id}`;
    const q = (v: string | undefined) => JSON.stringify(v ?? '');
    if (a.matches('[data-bucket]')) return `.lc-bucket[data-stage=${q(a.dataset.stage)}][data-bucket=${q(a.dataset.bucket)}]`;
    if (a.matches('.lc-stage-btn')) return `.lc-stage-btn[data-stage=${q(a.dataset.stage)}]`;
    for (const attr of ['data-sort', 'data-filter', 'data-act']) {
      const v = a.getAttribute(attr);
      if (v != null) return `[${attr}=${q(v)}]`;
    }
    return a.id ? `#${CSS.escape(a.id)}` : null;
  }
  function restoreFocus(key: string | null) {
    if (!key) return;
    let el: HTMLElement | null;
    if (key.startsWith('[data-sel]@')) {
      const id = key.slice(11);
      el = tableEl.querySelector<HTMLElement>(`tr[data-id="${CSS.escape(id)}"] [data-sel]`) ?? tableEl.querySelector<HTMLElement>('tr.lc-row-sel [data-sel]');
    } else el = plane.querySelector<HTMLElement>(key);
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }
  /** Keep the selected row in sight inside the list's own scroll box (`_lcRevealSelected`). */
  function revealSelected() {
    const row = tableEl.querySelector<HTMLElement>('tr.lc-row-sel');
    if (!row) return;
    const wr = tableEl.getBoundingClientRect(), rr = row.getBoundingClientRect();
    if (!wr.height) return;
    const scale = tableEl.clientHeight / wr.height || 1;
    const th = tableEl.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    if (rr.top < wr.top + th || rr.bottom > wr.bottom) tableEl.scrollTop += (rr.top - wr.top - th - Math.max(0, (wr.height - th - rr.height) / 2)) * scale;
  }
  /** renderView for the Leads screen: stats, list, filters, panel and stage cards, keeping scroll places and focus. */
  function draw(opts: { keepFocus?: boolean } = {}) {
    const fk = opts.keepFocus === false ? null : focusKey();
    const c = ctx();
    const leads = api.leads();
    const filtered = filterLeads(leads, filter, c);
    const sel = pickSelected(filtered, selId);
    selId = sel?.id ?? null;
    const s = sig();
    const listTop = s === lastSig ? tableEl.scrollTop : 0;
    const samePanel = panelEl.dataset.lead === (selId ?? '');
    const panelTop = panelEl.scrollTop;
    statsEl.innerHTML = statsHTML(leads, TODAY);
    filtersEl.innerHTML = filtersHTML(leads, filter, api.reps);
    tableEl.innerHTML = tableHTML(filtered, filter, selId, c);
    countEl.innerHTML = `<b>${filtered.length}</b>/${leads.length}<span class="sr-only"> leads shown</span>`;
    panelEl.innerHTML = panelHTML(sel, c);
    panelEl.dataset.lead = selId ?? '';
    stagesEl.innerHTML = stageCardsHTML(leads, filter, TODAY);
    tableEl.scrollTop = listTop;
    panelEl.scrollTop = samePanel ? panelTop : 0;
    lastSig = s;
    revealSelected();
    restoreFocus(fk);
  }
  /** `_lcRefreshList`: typing in the search redraws the rows, the count and the filter bar; the panel only if the selection moved. */
  function refreshList() {
    const c = ctx();
    const leads = api.leads();
    const filtered = filterLeads(leads, filter, c);
    const before = selId;
    const sel = pickSelected(filtered, selId);
    selId = sel?.id ?? null;
    tableEl.innerHTML = tableHTML(filtered, filter, selId, c);
    filtersEl.innerHTML = filtersHTML(leads, filter, api.reps);
    countEl.innerHTML = `<b>${filtered.length}</b>/${leads.length}<span class="sr-only"> leads shown</span>`;
    tableEl.scrollTop = 0;
    lastSig = sig();
    if (selId !== before || panelEl.dataset.lead !== (selId ?? '')) { panelEl.innerHTML = panelHTML(sel, c); panelEl.dataset.lead = selId ?? ''; panelEl.scrollTop = 0; }
    api.announce(`${filtered.length} of ${leads.length} leads shown`);
  }
  function select(id: string, focus = false) {
    if (!api.getLead(id)) return;
    selId = id;
    draw({ keepFocus: !focus });
    if (focus) tableEl.querySelector<HTMLElement>(`tr[data-id="${CSS.escape(id)}"] [data-sel]`)?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ the moves --
  /** `_leadTryMoveStage(id, s, 'panel')`: a survey date first, never Approved by hand, Lost asks. */
  function moveStage(id: string, to: LeadStatus) {
    const l = api.getLead(id);
    if (!l || l.status === to) return;
    const r = canDrop(l, to, 'panel');
    if (!r.ok) { if (r.toast) api.toast(r.toast, 'warning'); return; }
    const apply = () => { api.setStage(id, to); api.track('hero_stage', { to }); };
    if (r.confirm) api.askConfirm({ body: r.confirm, yes: 'OK', onYes: apply });
    else apply();
  }
  function quickVals(): QuickAddValues {
    const g = (id: string) => quickForm.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? '';
    return quickAddValues({ type: g('lcq-type'), name: g('lcq-name'), phone: g('lcq-phone'), email: g('lcq-email'), address: g('lcq-address'), source: g('lcq-source'), salesRepId: g('lcq-salesrep') });
  }
  function applyPlaceholders(type: string) {
    const ph = quickAddPlaceholders(type);
    const set = (id: string, t: string) => { const el = quickForm.querySelector<HTMLInputElement>(`#${id}`); if (el) el.placeholder = t; };
    set('lcq-name', ph.name); set('lcq-phone', ph.phone); set('lcq-email', ph.email); set('lcq-address', ph.address);
  }
  function resetQuick() {
    quickForm.reset();
    applyPlaceholders('Retail');
    quickForm.querySelectorAll('.is-auto').forEach((e) => e.classList.remove('is-auto'));
  }
  function markNew(id: string) {
    if (!api.reduce.matches) tableEl.querySelector(`tr[data-id="${CSS.escape(id)}"]`)?.classList.add('is-new');
  }
  /** `_lcQuickAdd`: name and phone, the duplicate check, then the new lead on screen and selected. */
  function quickAdd(byDemo = false, dupOk = false): boolean {
    const v = quickVals();
    const miss = quickAddMissing(v);
    if (miss) {
      api.toast(QUICK_ADD_REQUIRED_TOAST, 'warning');
      if (!byDemo) quickForm.querySelector<HTMLInputElement>(miss === 'name' ? '#lcq-name' : '#lcq-phone')?.focus();
      return false;
    }
    if (!dupOk) {
      const d = findDuplicates(v, api.leads(), api.customers());
      if (d.length) {
        // "Use this one": the app opens that lead; on the Leads screen that is selecting it.
        api.askDuplicate(d, () => quickAdd(byDemo, true), (id) => { filter = clearFilters(filter); searchEl.value = ''; select(id, true); });
        return false;
      }
    }
    const lead = api.createLead(v);
    filter = clearFilters(filter);
    searchEl.value = '';
    selId = lead.id;
    resetQuick();
    api.toast(quickAddToast(lead));
    api.draw({ keepFocus: false });
    markNew(lead.id);
    if (!byDemo) { quickForm.querySelector<HTMLInputElement>('#lcq-name')?.focus({ preventScroll: true }); api.track('hero_quick_add', {}); }
    return true;
  }

  // ------------------------------------------------------------------- input --
  let searchTimer = 0;
  plane.addEventListener('submit', (e) => {
    if ((e.target as HTMLElement).closest('[data-quick]')) { e.preventDefault(); api.userTouched(); quickAdd(); }
  });
  plane.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'lcq-phone') t.value = formatPhone(t.value);
    if (t.matches('[data-search]')) {
      filter = { ...filter, q: t.value };
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(refreshList, 150);
    }
  });
  /** A date box that is still being typed (Chrome reports "0002-10-16" after the first year digit). */
  const partialDate = (v: string) => !!v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number(v.slice(0, 4)) < 2000);
  plane.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.id === 'lcq-type') { applyPlaceholders(t.value); return; }
    const key = t.getAttribute('data-filter') as keyof ListFilter | null;
    if (key) {
      // setLeadListFilter: one filter changes and the screen redraws (the selection moves to the top row if hidden).
      filter = { ...filter, [key]: t.value } as ListFilter;
      api.draw();
      api.track('hero_filter', { key });
      return;
    }
    const act = t.getAttribute('data-act');
    if ((act === 'survey' || act === 'followup') && selId) {
      if (partialDate(t.value)) return;
      if (act === 'survey') api.survey(selId, t.value); else api.followUp(selId, t.value);
      api.track('hero_date', { kind: act });
    }
  });
  plane.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.lc-quick, [data-search]')) return;
    const sortBtn = t.closest<HTMLElement>('[data-sort]');
    if (sortBtn) {
      // sortLeadsBy: the same column flips, a new one starts in its own direction.
      filter = { ...filter, ...nextSort(filter, sortBtn.dataset.sort as SortCol) };
      api.draw();
      api.track('hero_sort', { col: sortBtn.dataset.sort! });
      return;
    }
    const bucket = t.closest<HTMLElement>('[data-bucket]');
    if (bucket) {
      // _lcOpenBucket: that stage and age group only; the first lead gets the panel.
      filter = bucketFilter(filter, bucket.dataset.stage as LeadStatus, bucket.dataset.bucket as ColumnBucket);
      searchEl.value = '';
      selId = null;
      api.draw();
      api.track('hero_bucket', {});
      return;
    }
    const stageBtn = t.closest<HTMLButtonElement>('button[data-stage]');
    if (stageBtn && selId) { moveStage(selId, stageBtn.dataset.stage as LeadStatus); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'clear') { filter = clearFilters(filter); searchEl.value = ''; api.draw(); return; }
    if (act === 'unbucket') { filter = { ...filter, bucket: 'all' }; api.draw(); return; }
    if (act === 'overdue') { filter = overdueStatFilter(); searchEl.value = ''; selId = null; api.draw(); return; }
    if (act === 'focus-add') { quickForm.querySelector<HTMLInputElement>('#lcq-name')?.focus(); return; }
    if (act === 'note' && selId) {
      const ta = panelEl.querySelector<HTMLTextAreaElement>('#lead-note-input');
      if (!ta || !ta.value.trim()) { ta?.focus(); return; }
      api.addNote(selId, ta.value);
      panelEl.querySelector<HTMLTextAreaElement>('#lead-note-input')?.focus({ preventScroll: true });
      return;
    }
    if (act === 'new-quote') {
      // The app opens the quote builder; here the working quote builder is the first tab of the tour below.
      document.getElementById('tab-quote')?.click();
      api.track('hero_new_quote', {});
      return;
    }
    const row = t.closest<HTMLElement>('tr[data-id]');
    if (row && !t.closest('a')) select(row.dataset.id!);
  });
  plane.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('[data-search]')) {
      // _lcKeyNav: ↑ / ↓ in the search box walk the selection.
      const ids = Array.from(tableEl.querySelectorAll<HTMLElement>('tr[data-id]')).map((r) => r.dataset.id!);
      const to = keyNavTarget(ids, selId, e.key);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.preventDefault();
      if (to) { selId = to; draw(); }
      return;
    }
    if (t.matches('#lead-note-input') && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (selId && (t as HTMLTextAreaElement).value.trim()) { api.addNote(selId, (t as HTMLTextAreaElement).value); panelEl.querySelector<HTMLElement>('#lead-note-input')?.focus({ preventScroll: true }); }
      return;
    }
    if (t.matches('[data-sel]')) {
      // The rows are one tab stop; ↑ / ↓ (and Home / End) move the selection, like the search box.
      const ids = Array.from(tableEl.querySelectorAll<HTMLElement>('tr[data-id]')).map((r) => r.dataset.id!);
      let to: string | null = null;
      if (e.key === 'Home') to = ids[0] ?? null;
      else if (e.key === 'End') to = ids[ids.length - 1] ?? null;
      else to = keyNavTarget(ids, selId, e.key);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') e.preventDefault();
      if (to && to !== selId) select(to, true);
    }
  });

  // --------------------------------------------------------------- the idle demo --
  // Until the visitor takes over, the screen works by itself, one real move at a time: a new lead is
  // typed into the quick add bar and added, then a New lead gets its site-survey date. QT-330's
  // lead is the visitor's, so the demo never touches it. Any click or key on the screen or the
  // story card hands it over (Play brings the demo back). No demo with reduced motion.
  let paused = false;
  let visible = true;
  let demoOn = false;
  let demoToken = 0;
  let demoTimer = 0;
  let demoStep = 0;
  let pendingAdd: QuickAddValues | null = null;
  const ABORT = Symbol('abort');
  const dlgOpen = () => !!api.root.querySelector('dialog[open]');
  const wait = (ms: number, token: number) => new Promise<void>((res, rej) => window.setTimeout(() => (token === demoToken ? res() : rej(ABORT)), ms));
  const canDemo = () => api.desktop.matches && !api.reduce.matches && !paused && visible && !document.hidden && !dlgOpen();
  function setPaused(p: boolean) {
    paused = p;
    pauseBtns.forEach((x) => { x.setAttribute('aria-pressed', String(p)); x.textContent = p ? 'Play' : 'Pause'; });
  }
  async function typeInto(el: HTMLInputElement, text: string, token: number, phoneFmt = false) {
    el.classList.add('is-auto');
    for (let i = 1; i <= text.length; i++) {
      el.value = phoneFmt ? formatPhone(text.slice(0, i)) : text.slice(0, i);
      await wait(phoneFmt ? 45 : 38, token);
    }
  }
  async function demoQuickAdd(v: QuickAddValues, token: number) {
    const f = (id: string) => quickForm.querySelector<HTMLInputElement & HTMLSelectElement>(`#${id}`)!;
    f('lcq-type').value = v.type; applyPlaceholders(v.type); f('lcq-type').classList.add('is-auto');
    await wait(260, token);
    await typeInto(f('lcq-name'), v.name, token);
    await typeInto(f('lcq-phone'), v.phone.replace(/\D/g, ''), token, true);
    await typeInto(f('lcq-email'), v.email, token);
    await wait(160, token);
    f('lcq-source').value = v.source; f('lcq-source').classList.add('is-auto');
    await wait(200, token);
    f('lcq-salesrep').value = v.salesRepId; f('lcq-salesrep').classList.add('is-auto');
    await wait(320, token);
    const btn = quickForm.querySelector<HTMLElement>('button[type="submit"]')!;
    btn.classList.add('is-press');
    await wait(220, token);
    btn.classList.remove('is-press');
    quickAdd(true);
  }
  async function demoSurvey(id: string, token: number) {
    selId = id;
    draw({ keepFocus: false });
    await wait(900, token);
    const input = panelEl.querySelector<HTMLInputElement>('#lc-survey-date');
    if (!input) return;
    const iso = addDays(TODAY, 2);
    input.classList.add('is-auto');
    input.value = iso;
    await wait(650, token);
    api.survey(id, iso);
  }
  async function demoTick() {
    if (demoOn) return;
    if (!canDemo()) { schedule(); return; }
    const token = demoToken;
    demoOn = true;
    try {
      const news = api.leads().filter((l) => l.status === 'new' && l.id !== api.story.leadId);
      const doAdd = api.incoming.length > 0 && (demoStep % 2 === 0 || !news.length);
      demoStep++;
      if (doAdd) {
        pendingAdd = api.incoming.shift()!;
        await demoQuickAdd(pendingAdd, token);
        pendingAdd = null;
      } else if (news.length) await demoSurvey(news.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!.id, token);
      else { setPaused(true); return; } // nothing left to do — the screen rests
    } catch (err) {
      if (err !== ABORT) throw err;
      // Interrupted half-way: that lead was never added, so it waits for the next turn.
      if (pendingAdd) { api.incoming.unshift(pendingAdd); pendingAdd = null; demoStep--; }
    } finally {
      demoOn = false;
    }
    schedule();
  }
  function schedule() {
    window.clearTimeout(demoTimer);
    if (!paused && api.desktop.matches && !api.reduce.matches) demoTimer = window.setTimeout(demoTick, 3600);
  }
  /** Stop a step mid-way and leave the screen clean: half-typed quick add cleared. */
  function stop() {
    window.clearTimeout(demoTimer);
    if (demoOn) {
      demoToken++;
      demoOn = false;
      if (quickForm.querySelector('.is-auto')) resetQuick();
      panelEl.querySelectorAll('.is-auto').forEach((e) => e.classList.remove('is-auto'));
    }
    setPaused(true);
  }
  pauseBtns.forEach((b) => b.addEventListener('click', () => {
    if (paused) { setPaused(false); void demoTick(); } else stop();
  }));
  new IntersectionObserver(([en]) => { visible = !!en && en.isIntersecting; if (visible) schedule(); }, { threshold: 0.15 }).observe(api.root);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  // The demo starts after a first look, unless the visitor has already taken over.
  if (api.wasTouched()) setPaused(true);
  else if (!api.reduce.matches) schedule();

  return { draw, stop };
}
