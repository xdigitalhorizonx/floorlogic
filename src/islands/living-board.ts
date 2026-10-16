// The hero's Leads screen, run on the same rules as the real app (October build). This core keeps the
// records (the sample leads, QT-330, the counters), the app's toasts and confirm dialogs, the story
// card (the customer approves QT-330 on the phone card, then "Create WO & Invoice" makes the work
// order and invoice and the lead leaves the list as a customer), and the desktop scroll scene. The
// screen itself is drawn by one of two views, each loaded only where it shows: the List View on
// desktop (hero-list-view.ts) and the phone app's Leads screens on phones (hero-phone-view.ts).
// Sample data only; nothing is saved or sent anywhere.
// Logic is imported from its own files (not the logic index), so the hero never pulls in the try-it modules' maths.
import { fmtDate } from '../lib/logic/dates';
import { fmtMoney } from '../lib/logic/money';
import { changeStatus, setSurveyDate, statusChangeActivity, surveyDayReached, type LeadStatus } from '../lib/logic/lead-pipeline';
import { createLeadRecord, demoNoteInstant, withNote, type DuplicateMatch, type ListCustomer, type ListLead, type ListQuote, type ListRep, type QuickAddValues } from '../lib/logic/lead-list';
import { docCardHTML } from '../lib/board/card-html';
import { track } from '../lib/analytics';
import type { HeroApi, HeroView, NewLeadValues, Story, ToastType } from './hero-api';

/** A lead as the page carries it: only what the screen reads (HeroBoard.astro slims it). */
type PageLead = Omit<ListLead, 'city' | 'estimatedValue' | 'stageAgeDays' | 'quoteCount' | 'sampleCount'>;
type BoardState = {
  today: string; leads: PageLead[]; quotes: ListQuote[]; reps: ListRep[]; counters: { lead: number };
  incoming: QuickAddValues[]; user: { name: string }; story: Story;
};

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const TOAST_ICON: Record<ToastType, string> = { success: '✅', info: 'ℹ️', warning: '⚠️', error: '❌' };
// Small beats use the Web Animations API, so phones never download an animation library.
// GSAP only arrives on desktop, after first paint, for the scroll scene.
function anim(el: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || typeof el.animate !== 'function') return null;
  return el.animate(frames, { easing: EASE_OUT, ...opts });
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function initLivingBoard() {
  const rootEl = document.querySelector<HTMLElement>('[data-board]');
  if (!rootEl) return;
  const root: HTMLElement = rootEl;
  const hero = root.closest<HTMLElement>('[data-hero]')!;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string, in_: ParentNode = root) => in_.querySelector<T>(sel)!;
  const plane = $('[data-plane]');
  const pivot = $('[data-pivot]');
  const stage = $('[data-stage]');
  const listEl = $('[data-list]');
  const tableEl = $('[data-table]');
  const stagesEl = $('[data-stages]');
  const toastsEl = $('[data-toasts]');
  const live = $('[data-live]');
  const phone = $('[data-phone]');
  const mToast = $('[data-m-toast]', phone);
  const dlg = $<HTMLDialogElement>('[data-dlg]');
  const endEl = $('[data-end]');
  const feedEl = hero.querySelector<HTMLElement>('[data-feed]')!;
  const feedLog = hero.querySelector<HTMLElement>('[data-feedlog]')!;
  const storyEl = hero.querySelector<HTMLElement>('[data-story]')!;
  const docsEl = hero.querySelector<HTMLElement>('[data-docs]')!;
  const hintEl = hero.querySelector<HTMLElement>('[data-hint]')!;
  const pauseBtns = Array.from(hero.querySelectorAll<HTMLButtonElement>('[data-pause]'));

  const S = JSON.parse(root.querySelector('[data-board-state]')!.textContent || '{}') as BoardState;
  // The sample shop lives on a fixed "today" (DEMO_TODAY), carried in the state, so this script never loads the dataset.
  const TODAY = S.today;
  const story = S.story;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 900px)');

  // ---------------------------------------------------------------- the records --
  // The page carries only the fields the screen reads; the rest of a Lead is filled in here.
  let leads: ListLead[] = S.leads.map((l) => ({ estimatedValue: 0, stageAgeDays: 0, quoteCount: 0, sampleCount: 0, ...l, city: l.address, notes: [...(l.notes || [])] }));
  let quotes: ListQuote[] = S.quotes.map((q) => ({ ...q }));
  const customers: ListCustomer[] = [];
  let counters = { ...S.counters };
  let seq = 0;
  const getLead = (id: string | null | undefined) => (id ? leads.find((l) => l.id === id) : undefined);
  const putLead = (next: ListLead) => { leads = leads.map((l) => (l.id === next.id ? next : l)); };

  // ------------------------------------------------------------- toasts + voice --
  function announce(msg: string) { live.textContent = ''; window.setTimeout(() => { live.textContent = msg; }, 30); }
  function toastNode(msg: string, type: ToastType) {
    const t = document.createElement('div');
    t.className = 'lc-toast';
    t.dataset.type = type;
    t.innerHTML = `<span aria-hidden="true">${TOAST_ICON[type]}</span><span>${esc(msg)}</span>`;
    return t;
  }
  /** The app's showToast: top right of the screen on desktop, top of the phone screen on a phone, ~3 s. */
  function toast(msg: string, type: ToastType = 'success') {
    const t = toastNode(msg, type);
    toastsEl.appendChild(t);
    while (toastsEl.children.length > 3) toastsEl.firstElementChild!.remove();
    anim(t, [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
    window.setTimeout(() => {
      const out = anim(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      if (out) out.onfinish = () => t.remove(); else t.remove();
    }, 3000);
    const m = toastNode(msg, type);
    mToast.replaceChildren(m);
    anim(m, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 250 });
    window.setTimeout(() => { if (m.isConnected) m.remove(); }, 3000);
    announce(msg);
  }

  // ---------------------------------------------------------------- the views --
  // The page arrives drawn (HeroBoard.astro renders the same HTML on the server); a view redraws
  // only once something has changed.
  const views: HeroView[] = [];
  let changed = false;
  /** Every change redraws the views on screen, after `_runLeadAutoTransitions` (run on every draw, as
   *  the app does): a survey day that has come moves the lead to Send Quote. */
  function draw(opts: { keepFocus?: boolean } = {}) {
    changed = true;
    for (const l of leads) {
      const m = surveyDayReached(l, TODAY);
      if (m) { putLead({ ...l, ...m.lead }); announce(m.activity); }
    }
    for (const v of views) v.draw(opts);
  }

  // -------------------------------------------------- the office's dialogs --
  const dlgH = $('[data-dlg-h]', dlg);
  const dlgHead = $('[data-dlg-head]', dlg);
  const dlgB = $('[data-dlg-b]', dlg);
  const dlgF = $('[data-dlg-f]', dlg);
  let dlgReturn: HTMLElement | null = null;
  let dlgYes: (() => void) | null = null;
  let dlgUse: ((id: string) => void) | null = null;
  function openDlg(title: string, bodyHTML: string, footHTML: string, label: string, focus: '[data-yes]' | '[data-no]') {
    dlgReturn = document.activeElement as HTMLElement | null;
    dlgHead.hidden = !title;
    dlgH.textContent = title;
    if (title) { dlg.setAttribute('aria-labelledby', 'lb-dlg-h'); dlg.removeAttribute('aria-label'); }
    else { dlg.removeAttribute('aria-labelledby'); dlg.setAttribute('aria-label', label); }
    dlgB.innerHTML = bodyHTML;
    dlgF.innerHTML = footHTML;
    dlg.showModal();
    dlgF.querySelector<HTMLElement>(focus)?.focus();
  }
  function closeDlg(ok: boolean, then?: () => void) {
    const cb = ok ? dlgYes : null;
    dlgYes = null;
    dlgUse = null;
    if (dlg.open) dlg.close();
    cb?.();
    then?.();
    const back = dlgReturn;
    dlgReturn = null;
    if (back && back.isConnected && !dlg.contains(back) && document.activeElement === document.body) back.focus({ preventScroll: true });
  }
  /** A yes / no question: the app's own confirm (Lost: the browser's confirm, OK / Cancel). */
  function askConfirm(o: { title?: string; body: string; yes: string; yesClass?: string; onYes: () => void }) {
    dlgYes = o.onYes;
    openDlg(o.title ?? '', `<p>${esc(o.body)}</p>`, `<button type="button" class="a-btn a-outline" data-no>Cancel</button><button type="button" class="a-btn ${o.yesClass ?? 'a-primary'}" data-yes>${esc(o.yes)}</button>`, o.body, '[data-yes]');
  }
  /** `_dupGuardPrompt`: someone on file already matches what was typed. */
  function askDuplicate(matches: DuplicateMatch[], proceed: () => void, use: (id: string) => void) {
    dlgYes = proceed;
    dlgUse = use;
    // The app's "Use this one" opens that record; a customer's page is not part of this screen, so only leads offer it.
    const rows = matches.map((m) => `<div class="lb-dlg-dup"><div><strong>${esc(m.rec.name || '(no name)')}</strong><span class="lb-dlg-kind">${m.kind === 'customer' ? 'Customer' : 'Lead'}</span><span class="lb-dlg-why">${esc(m.reasons.join(', '))}</span><small>${esc([m.rec.phone, m.rec.email, m.rec.address].filter(Boolean).join(' • '))}</small></div>${m.kind === 'lead' ? `<button type="button" class="a-btn a-primary a-btn-sm" data-use="${esc(m.rec.id)}">Use this one</button>` : ''}</div>`).join('');
    openDlg('⚠️ This lead may already exist',
      `<p>${matches.length === 1 ? 'One record already matches' : `${matches.length} records already match`} what you entered. Use the existing one to keep their history together, or create a new lead anyway.</p><div class="lb-dlg-dups">${rows}</div>`,
      `<button type="button" class="a-btn a-outline" data-no>← Back to the form</button><button type="button" class="a-btn a-outline" data-yes>Create new lead anyway</button>`, '', '[data-no]');
  }
  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === dlg || t.closest('[data-no], [data-dlg-x]')) { closeDlg(false); return; }
    if (t.closest('[data-yes]')) { closeDlg(true); return; }
    const use = t.closest<HTMLElement>('[data-use]');
    if (use) { const f = dlgUse; const id = use.dataset.use!; closeDlg(false, () => f?.(id)); }
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDlg(false); });

  // ----------------------------------------------------------------- the API --
  let touched = false;
  /** The visitor took over: anything running by itself stops (Play brings the desktop demo back). */
  function userTouched() { touched = true; for (const v of views) v.stop?.(); }
  const api: HeroApi = {
    root, hero, today: TODAY, reps: S.reps, story, reduce, desktop, incoming: S.incoming.slice(),
    leads: () => leads, quotes: () => quotes, customers: () => customers, getLead, putLead,
    createLead(v: NewLeadValues) {
      const note = v.noteText?.trim() ? { text: v.noteText, date: demoNoteInstant(TODAY, new Date()), userName: S.user.name } : null;
      const r = createLeadRecord(v, counters, TODAY, `hl-${Date.now().toString(36)}-${seq++}`, note);
      counters = r.counters;
      leads = [...leads, r.lead];
      announce(r.activity);
      return r.lead;
    },
    /** `setLeadSurveyDate`: a date moves a New lead to Site Survey Scheduled; clearing it moves it back. */
    survey(id, iso) {
      const l = getLead(id);
      if (!l) return;
      const r = setSurveyDate(l, iso || null, TODAY);
      putLead({ ...l, ...r.lead });
      if (r.toast) toast(r.toast);
      else announce(`Lead ${l.number}: site-survey date cleared`);
      draw();
    },
    followUp(id, iso) {
      const l = getLead(id);
      if (!l) return;
      putLead({ ...l, followUpDate: iso || null });
      draw();
    },
    /** `addLeadNote` with the signed-in user and the time, as the app stamps notes since 2026-10-15. */
    addNote(id, text) {
      const l = getLead(id);
      if (!l || !text.trim()) return false;
      putLead(withNote(l, text, demoNoteInstant(TODAY, new Date()), S.user.name));
      announce('Note added');
      draw();
      track('hero_note', {});
      return true;
    },
    setStage(id, to: LeadStatus) {
      const cur = getLead(id);
      if (!cur) return;
      putLead(changeStatus(cur, to, TODAY));
      announce(statusChangeActivity(cur, to));
      draw();
    },
    toast, announce, askConfirm, askDuplicate, draw, userTouched, wasTouched: () => touched, track,
  };

  // Load the view the screen shows (and the other one too if the window is resized across 900px).
  let listView: Promise<void> | null = null;
  let phoneView: Promise<void> | null = null;
  let listReady = false;
  function mount(v: HeroView) {
    views.push(v);
    if (changed) v.draw({ keepFocus: false });
  }
  function loadViews() {
    if (desktop.matches && !listView) listView = import('./hero-list-view').then((m) => { mount(m.mountListView(api, pauseBtns)); listReady = true; });
    if (!desktop.matches && !phoneView) phoneView = import('./hero-phone-view').then((m) => mount(m.mountPhoneView(api)));
  }
  loadViews();
  desktop.addEventListener('change', loadViews);

  // Any real interaction with the screen or the story hands the screen to the visitor.
  for (const el of [plane, storyEl, phone]) {
    el.addEventListener('pointerdown', (e) => { if (e.isTrusted) userTouched(); });
    el.addEventListener('keydown', (e) => { if (e.isTrusted) userTouched(); });
  }
  // Pause belongs to the desktop's idle demo: shown only there, and never with reduced motion.
  // Pressed before the List View has loaded, the List View starts paused.
  pauseBtns.forEach((b) => b.addEventListener('click', () => { if (!listReady) touched = true; }));
  const syncPause = () => pauseBtns.forEach((b) => { b.hidden = reduce.matches || !desktop.matches; });
  syncPause();
  desktop.addEventListener('change', syncPause);
  reduce.addEventListener('change', syncPause);

  // ------------------------------------- the customer's approval, then the office --
  let phase: 'sent' | 'approved' | 'converted' = 'sent';
  const stepEl = (k: typeof phase) => storyEl.querySelector<HTMLElement>(`[data-step="${k}"]`)!;
  const approveBtn = storyEl.querySelector<HTMLButtonElement>('[data-approve]')!;
  const convertBtn = storyEl.querySelector<HTMLButtonElement>('[data-convert]')!;
  /** The story card shows one step at a time: the customer's phone → the office → what got created. */
  function showStep(k: typeof phase, focus?: HTMLElement) {
    for (const x of ['sent', 'approved', 'converted'] as const) stepEl(x).hidden = x !== k;
    anim(stepEl(k), [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380 });
    focus?.focus({ preventScroll: true });
  }
  function feedLine(msg: string) {
    const p = document.createElement('p');
    p.textContent = msg;
    feedLog.prepend(p);
    while (feedLog.children.length > 3) feedLog.lastElementChild!.remove();
    anim(p, [{ transform: 'translateY(-10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350 });
  }
  approveBtn.addEventListener('click', () => {
    if (phase !== 'sent') return;
    userTouched();
    phase = 'approved';
    // As q.html: one tap, no confirm. QT-330 is approved; nothing else exists yet, so the office sees it
    // waiting (the app's banner wording). The quote keeps its stored total until the office converts it.
    quotes = quotes.map((q) => (q.id === story.quoteId ? { ...q, status: 'approved' } : q));
    showStep('approved', convertBtn);
    feedLine('Quote approved! Thank you.'); // the feed is a live log, so it is read out
    draw();
    track('board_customer_approve', {});
  });
  convertBtn.addEventListener('click', () => {
    if (phase !== 'approved') return;
    userTouched();
    // The app's confirm (`confirmConvertApprovedQuote`), word for word.
    askConfirm({
      title: `🔨 Create the work order and invoice for ${story.quote}?`,
      body: `${story.customer} approved this quote but it has no work order or invoice yet. This creates ${story.wo} and ${story.inv} from it, and turns the lead into a customer.`,
      yes: '🔨 Create Work Order & Invoice', yesClass: 'a-success', onYes: convert,
    });
  });
  function convert() {
    phase = 'converted';
    // approveQuote → _resolveQuoteLeadToCustomer: the lead becomes a customer and leaves the list.
    const l = getLead(story.leadId);
    if (l) customers.push({ id: `cu-${l.id}`, name: l.name, phone: l.phone, email: l.email ?? '', address: l.address });
    leads = leads.filter((x) => x.id !== story.leadId);
    quotes = quotes.filter((q) => q.id !== story.quoteId);
    const box = document.createElement('div');
    box.innerHTML = docCardHTML('wo', story.wo, 'Work order · Order Materials', 'Order Materials', 'kc-pill-purple')
      + docCardHTML('inv', story.inv, `Invoice · ${fmtMoney(story.total)} · due ${fmtDate(story.due)}`, 'Unpaid', 'kc-pill-red');
    const cards = Array.from(box.children) as HTMLElement[];
    docsEl.replaceChildren(...cards);
    showStep('converted');
    cards.forEach((c, i) => anim(c, [{ transform: 'translateY(22px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 550, delay: i * 120, fill: 'backwards', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }));
    toast(story.toast);
    draw({ keepFocus: false });
    docsEl.focus({ preventScroll: true });
    hintEl.innerHTML = '<span class="lb-hint-dot" aria-hidden="true"></span><span>That’s the real flow. <a href="/start">Run your shop on it free for 14 days →</a></span>';
    track('board_convert', {});
  }

  // ---------- desktop: size the screen, then let it rise to meet you on scroll ----------
  // The List View at the app's size: the list (its table at least 820px, like the app) beside the
  // 360px panel. Narrower than that, CSS zoom shrinks the whole screen evenly; zoom re-lays out
  // text rather than scaling pixels, so it never goes soft, and it never goes above 1. The list's
  // own box gets the height that lets the whole screen and the hint fit; it scrolls inside, like
  // the app's, when there are more leads than rows (never fewer than four rows).
  const PLANE_MIN = 1244, PLANE_MAX = 1480, MIN_ROWS = 4;
  // Flat screen size on the page (layout px; unaffected by the pivot transform).
  let boardW = 0, boardH = 0;
  const wantPivot = () => desktop.matches && !reduce.matches;
  function fitBoard() {
    if (!desktop.matches) {
      root.style.removeProperty('--lb-h');
      for (const k of ['--z', '--pw']) plane.style.removeProperty(k);
      listEl.style.removeProperty('--lc-list-h');
      pivot.style.transform = '';
      stage.style.transform = '';
      root.classList.remove('is-flat', 'is-tilted');
      return;
    }
    const mast = document.querySelector<HTMLElement>('[data-mast]')?.offsetHeight ?? 72;
    const flat = !wantPivot();
    root.classList.toggle('is-flat', flat);
    // Fill exactly the rest of the first screen (not the hero's own height — that includes this
    // box), so the pinned hero ends at the screen's bottom edge and the fade + hint stay in view.
    const top = root.getBoundingClientRect().top - hero.getBoundingClientRect().top;
    if (!flat) root.style.setProperty('--lb-h', `${Math.max(160, window.innerHeight - mast - top)}px`);
    else root.style.removeProperty('--lb-h');
    // Desktop: the story card sits beside the paragraph + form, just under the headline.
    const h1 = hero.querySelector('h1');
    if (h1) feedEl.style.setProperty('--feed-top', `${Math.round(h1.getBoundingClientRect().bottom - hero.getBoundingClientRect().top + 22)}px`);
    // Width: the page gutter on both sides, centred, never wider than PLANE_MAX.
    const gutter = Math.min(40, Math.max(16, 6.4 + 0.026 * window.innerWidth));
    const availW = stage.clientWidth - 2 * gutter;
    const zW = Math.max(0.6, Math.min(1, availW / PLANE_MIN));
    let pw = Math.floor(Math.min(PLANE_MAX, availW / zW));
    // At true size, keep both side gaps whole pixels (an odd leftover would centre it on a half pixel).
    if (zW === 1 && (stage.clientWidth - pw) % 2) pw -= 1;
    plane.style.setProperty('--pw', `${pw}px`);
    // Height, measured at true size with the list at its natural height.
    plane.style.setProperty('--z', '1');
    listEl.style.removeProperty('--lc-list-h');
    const table = tableEl.querySelector('table');
    const theadH = table?.tHead?.offsetHeight ?? 32;
    const nRows = table?.tBodies[0]?.rows.length ?? 0;
    const rowH = nRows && table ? (table.offsetHeight - theadH) / nRows : 49.5;
    const chrome = listEl.offsetHeight - tableEl.offsetHeight;
    const fixed = pivot.offsetHeight - listEl.offsetHeight;
    // Room for every lead (not just the ones a filter shows), header row and border included.
    const allList = chrome + 1 + theadH + Math.max(leads.length, 1) * rowH;
    const avail = window.innerHeight - mast;
    const endH = endEl.offsetHeight || 46;
    const margin = window.innerHeight <= 820 ? 16 : 24;
    let listH = allList;
    let z = zW;
    if (!flat && (fixed + allList) * zW + 16 + endH + 2 * 16 > avail) {
      const target = avail - 2 * margin - 16 - endH;
      listH = target / zW - fixed;
      const minList = chrome + 1 + theadH + MIN_ROWS * rowH;
      if (listH < minList) { listH = minList; z = Math.max(0.6, Math.min(zW, target / (fixed + minList))); }
      listH = Math.min(listH, allList);
    }
    // When the height sets the zoom, lay the screen out wider so it still fills the width between the gutters.
    if (z < zW) plane.style.setProperty('--pw', `${Math.floor(Math.min(PLANE_MAX, availW / z))}px`);
    listEl.style.setProperty('--lc-list-h', `${Math.floor(listH)}px`);
    plane.style.setProperty('--z', z.toFixed(4));
    boardW = pivot.offsetWidth;
    boardH = pivot.offsetHeight;
  }

  // ---------- the pivot: laid back like a floor at the top, flat when it arrives ----------
  // Hinged on the screen's bottom edge, the far (top) edge leans away from you. Everything sits at
  // or behind the screen plane, so it is only ever drawn at true size or smaller: sharp, never blown
  // up. Symmetric: no twist, vanishing point dead centre. At rest the transform is removed entirely.
  const PIVOT_DEG = 38;
  const snap = (v: number) => { const d = window.devicePixelRatio || 1; return Math.round(v * d) / d; };
  let riseDist = 0;
  function pose(p: number) {
    // The screen finishes pivoting at 85% of the scroll, then glides the last bit flat.
    const k = Math.min(1, p / 0.85);
    const theta = PIVOT_DEG * (1 - (0.5 - 0.5 * Math.cos(Math.PI * k)));
    let drop = 0;
    if (theta > 0.01 && boardH) {
      const persp = Math.round(boardW * 1.1);
      const r = (theta * Math.PI) / 180;
      const s = persp / (persp + boardH * Math.sin(r));
      // Tilting lowers the far edge on screen; lift the screen by the same amount so its top
      // edge travels in a straight line from under the headline to its resting place.
      drop = boardH - boardH * Math.cos(r) * s;
      pivot.style.transform = `perspective(${persp}px) rotateX(${theta.toFixed(3)}deg)`;
    } else {
      pivot.style.transform = '';
    }
    const y = snap(-riseDist * p - drop);
    stage.style.transform = y ? `translateY(${y}px)` : '';
    // The list and panel scroll only once the screen has come to rest; the fade goes as it rises.
    root.classList.toggle('is-tilted', p < 0.999);
    root.style.setProperty('--fade', (1 - p).toFixed(3));
  }
  fitBoard();
  window.addEventListener('resize', fitBoard);
  // Start laid back right away (the screen settles in on top of it), before the scroll code arrives.
  if (wantPivot()) pose(0);

  // Lay the screen: its parts settle in from the top, the stage cards from the centre outward.
  if (wantPivot()) {
    plane.querySelectorAll(':scope > .lc-header, :scope > .lc-quick, :scope > .lc-grid').forEach((el, i) => anim(el, [{ transform: 'translateY(36px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 120 + i * 90, fill: 'backwards' }));
    stagesEl.querySelectorAll('.lc-stage-card').forEach((el, i) => anim(el, [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 380 + Math.abs(i - 2) * 110, fill: 'backwards' }));
  }

  // The scroll scene needs GSAP + ScrollTrigger: desktop only, loaded after the page has painted.
  async function scrollScene() {
    const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add({ desk: '(min-width: 900px)', motion: '(prefers-reduced-motion: no-preference)' }, (mctx) => {
      const { desk, motion } = mctx.conditions as { desk: boolean; motion: boolean };
      if (!desk || !motion) return;
      const mastH = () => document.querySelector<HTMLElement>('[data-mast]')?.offsetHeight ?? 72;
      // Where the screen comes to rest. If the whole screen plus its hint pill fits, the pair sits
      // centred on the screen, pill just under it. If not, the screen stops 24px under the
      // masthead and its lower edge fades off the bottom, with the pill floating over it.
      const measure = () => {
        fitBoard();
        const avail = window.innerHeight - mastH();
        const lbTop = root.getBoundingClientRect().top - hero.getBoundingClientRect().top;
        const group = boardH + 16 + (endEl.offsetHeight || 46);
        let top = 24;
        if (group + 32 <= avail) {
          top = Math.round((avail - group) / 2);
          endEl.style.setProperty('--end-top', `${Math.round(top + boardH + 16 - lbTop)}px`);
          endEl.classList.add('is-docked');
        } else {
          endEl.classList.remove('is-docked');
        }
        riseDist = lbTop - top;
      };
      measure();
      const drive = { p: 0 };
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: hero, start: () => `top ${mastH()}px`, end: '+=70%', scrub: 0.6, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
          onRefresh: () => { measure(); pose(drive.p); },
        },
      });
      // Copy and story card clear out first; the screen pivots up flat, rises and settles.
      tl.to(hero.querySelector('.hero-copy'), { autoAlpha: 0, y: -70, duration: 0.32, ease: 'power1.in' }, 0)
        .to(feedEl, { autoAlpha: 0, y: -40, duration: 0.32, ease: 'power1.in' }, 0)
        .to(drive, { p: 1, duration: 1, ease: 'none', onUpdate: () => pose(drive.p) }, 0)
        .to(endEl, { autoAlpha: 1, duration: 0.2, ease: 'none' }, 0.8);
      pose(drive.p);
      return () => { tl.scrollTrigger?.kill(); tl.kill(); pivot.style.transform = ''; stage.style.transform = ''; root.classList.remove('is-tilted'); };
    });
  }
  let sceneLoaded = false;
  // If the scroll code can't load, lay the screen flat rather than leave it tilted.
  const loadScene = () => {
    if (sceneLoaded || !wantPivot()) return;
    sceneLoaded = true;
    scrollScene().catch(() => { pivot.style.transform = ''; stage.style.transform = ''; root.classList.remove('is-tilted'); root.classList.add('is-flat'); fitBoard(); });
  };
  if (document.readyState === 'complete') setTimeout(loadScene, 0);
  else window.addEventListener('load', () => setTimeout(loadScene, 0), { once: true });
  desktop.addEventListener('change', () => { fitBoard(); loadScene(); });
}
