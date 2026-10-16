// The hero's living lead board, run on the same rules as the real app (src/lib/logic/lead-pipeline,
// October build): a survey date moves New → Site Survey Scheduled, the survey day moves it on to Send
// Quote, sending a quote moves it to Follow-up, and a lead is never approved by hand — dropping one on
// Approved gets the app's refusal. Approval comes from the customer: approve QT-330 on the phone card,
// then "Create WO & Invoice" makes the work order and invoice, as the office does. Sample data only.
import {
  BOARD_STATUSES, LEAD_LABELS, LEAD_AGE_BUCKETS, advanceLead, canDrop, changeStatus, leadAgeBucketKey,
  leadAgeBucketDefaultOpen, quoteSentToLead, setSurveyDate, statusChangeActivity, surveyDayReached,
  type ColumnBucket, type Lead,
} from '../lib/logic/lead-pipeline';
import { fmtDate } from '../lib/logic/dates';
import { fmtMoney } from '../lib/logic/money';
import { bucketHTML, docCardHTML, icon, leadCardHTML } from '../lib/board/card-html';
import { track } from '../lib/analytics';

type Status = Lead['status'];
type Counters = { lead: number; job: number; invoice: number; quote: number };
type Rep = { id: string; name: string };
/** The quote the visitor approves (the dataset's thread), passed in by HeroBoard.astro. */
type Story = { leadId: string; quote: string; customer: string; total: number; wo: string; inv: string; toast: string; due: string };

const STEP_MS = 2800;
const IDLE_AFTER_USER_MS = 9000;

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
// Small beats use the Web Animations API, so phones never download an animation library.
// GSAP only arrives on desktop, after first paint, for the scroll scene.
function anim(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof el.animate !== 'function') return null;
  return el.animate(frames, { easing: EASE_OUT, ...opts });
}
const BUCKET_ORDER = LEAD_AGE_BUCKETS.map((b) => b.key);

export function initLivingBoard() {
  const rootEl = document.querySelector<HTMLElement>('[data-board]');
  if (!rootEl) return;
  const root: HTMLElement = rootEl;
  const hero = root.closest<HTMLElement>('[data-hero]')!;
  const plane = root.querySelector<HTMLElement>('[data-plane]')!;
  const pivot = root.querySelector<HTMLElement>('[data-pivot]')!;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const feedEl = hero.querySelector<HTMLElement>('[data-feed]')!;
  const toastEl = hero.querySelector<HTMLElement>('[data-toast]')!;
  const docsEl = hero.querySelector<HTMLElement>('[data-docs]')!;
  const storyEl = hero.querySelector<HTMLElement>('[data-story]')!;
  const stepEl = (k: 'sent' | 'approved' | 'converted') => storyEl.querySelector<HTMLElement>(`[data-step="${k}"]`)!;
  const confirmEl = root.querySelector<HTMLElement>('[data-confirm]')!;
  const endMsg = root.querySelector<HTMLElement>('[data-end-msg]');
  const pauseBtns = Array.from(hero.querySelectorAll<HTMLButtonElement>('[data-pause]'));
  const hintEl = hero.querySelector<HTMLElement>('[data-hint]')!;
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  root.appendChild(live);

  const state = JSON.parse(root.querySelector('[data-board-state]')!.textContent || '{}') as {
    leads: Lead[]; incoming: Lead[]; reps: Rep[]; counters: Counters; today: string; story: Story;
  };
  // The demo's fixed "today" travels with the board state, so this script never loads the sample dataset.
  const DEMO_TODAY = state.today;
  const story = state.story;
  const leads = new Map(state.leads.map((l) => [l.id, { ...l }]));
  const incoming = state.incoming.map((l) => ({ ...l }));
  let counters = { ...state.counters };
  const repName = (id?: string | null) => state.reps.find((r) => r.id === id)?.name ?? '';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 900px)');
  const laneEl = (s: Status) => plane.querySelector<HTMLElement>(`[data-lane="${s}"]`)!;
  const cardEl = (id: string) => plane.querySelector<HTMLElement>(`.kc[data-id="${CSS.escape(id)}"]`);

  // ---------- helpers ----------
  // While the scroll scene has the feed faded out, the latest line also shows in the end pill.
  const endDefault = endMsg?.innerHTML ?? '';
  let endTimer = 0;
  function feedHidden() { return parseFloat(getComputedStyle(feedEl).opacity || '1') < 0.3; }
  // Activity feed: the app's own toast and activity-log wording, newest first, last three kept.
  function toast(msg: string, kind: 'info' | 'warning' = 'info') {
    const li = document.createElement('p');
    li.textContent = msg;
    if (kind === 'warning') li.className = 'is-warn';
    toastEl.prepend(li);
    while (toastEl.children.length > 3) toastEl.lastElementChild!.remove();
    anim(li, [{ transform: 'translateY(-10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350 });
    announce(msg);
    if (endMsg && feedHidden()) {
      endMsg.textContent = msg;
      clearTimeout(endTimer);
      endTimer = window.setTimeout(() => { endMsg.innerHTML = endDefault; }, 4200);
    }
  }
  function announce(msg: string) { live.textContent = msg; }
  function prepCard(el: HTMLElement) {
    el.tabIndex = 0;
    el.setAttribute('aria-label', `${el.querySelector('.kc-name')?.textContent}, ${LEAD_LABELS[el.dataset.status as Status]}. Left and right arrows move it.`);
  }
  function renderCard(lead: Lead): HTMLElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = leadCardHTML(lead, repName(lead.salesRepId), DEMO_TODAY).trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    prepCard(el);
    return el;
  }
  /** Counts per lane and bucket, empty buckets removed, and the lane's empty line shown when needed. */
  function tidy() {
    for (const s of BOARD_STATUSES) {
      const lane = laneEl(s);
      lane.querySelectorAll<HTMLElement>('.kb-bucket').forEach((b) => {
        const n = b.querySelectorAll('.kc').length;
        if (!n) { b.remove(); return; }
        b.querySelector('[data-bucket-count]')!.textContent = String(n);
      });
      const total = lane.querySelectorAll('.kc').length;
      lane.querySelector('[data-count]')!.textContent = String(total);
      const empty = lane.querySelector<HTMLElement>('[data-empty]');
      if (empty) empty.hidden = total > 0;
    }
  }
  /** The age group a lead sits in inside its column, created in order when it doesn't exist yet. */
  function bucketFor(lane: HTMLElement, key: ColumnBucket): HTMLElement {
    const existing = lane.querySelector<HTMLElement>(`.kb-bucket[data-bucket="${key}"] [data-bucket-cards]`);
    if (existing) return existing;
    const tpl = document.createElement('template');
    tpl.innerHTML = bucketHTML(key, '', 0, leadAgeBucketDefaultOpen(key, lane.querySelectorAll('.kc').length + 1, 0)).trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    const host = lane.querySelector<HTMLElement>('[data-cards]')!;
    const after = Array.from(host.querySelectorAll<HTMLElement>('.kb-bucket')).find((b) => BUCKET_ORDER.indexOf(b.dataset.bucket as ColumnBucket) > BUCKET_ORDER.indexOf(key));
    host.insertBefore(el, after ?? host.querySelector('[data-empty]'));
    return el.querySelector<HTMLElement>('[data-bucket-cards]')!;
  }
  function placeCard(lead: Lead, opts: { animate?: boolean; focus?: boolean } = {}) {
    const old = cardEl(lead.id);
    const fresh = renderCard(lead);
    const target = bucketFor(laneEl(lead.status), leadAgeBucketKey(lead.createdAt, DEMO_TODAY));
    const animate = opts.animate !== false && !reduce.matches;
    old?.remove();
    target.prepend(fresh);
    // Local entrance: the card settles into its lane.
    if (animate) anim(fresh, [{ transform: 'translateY(-18px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500 });
    tidy();
    if (opts.focus) fresh.focus({ preventScroll: true });
    return fresh;
  }
  function removeCard(id: string) {
    const el = cardEl(id);
    const finish = () => { el?.remove(); tidy(); };
    const out = el ? anim(el, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-10px)', opacity: 0 }], { duration: 450, easing: 'ease-in', fill: 'forwards' }) : null;
    if (out) out.onfinish = finish; else finish();
  }

  // ---------- the app's moves ----------
  function moveTo(id: string, to: Status, byUser: boolean): boolean {
    const lead = leads.get(id);
    if (!lead || lead.status === to) return false;
    const check = canDrop(lead, to);
    if (!check.ok) {
      if (check.toast) toast(check.toast, 'warning');
      // Approved only comes from the customer's approval: point at it while it's still waiting.
      if (check.reason === 'approve-via-quote' && byUser && phase === 'sent') nudgeApprove();
      return false;
    }
    // Lost is not a column on the board, so a confirm never comes up here.
    Object.assign(lead, changeStatus(lead, to, DEMO_TODAY));
    placeCard(lead, { focus: byUser && document.activeElement?.classList.contains('kc') });
    toast(statusChangeActivity(lead, to));
    return true;
  }
  function survey(id: string, iso: string, byUser: boolean) {
    const lead = leads.get(id);
    if (!lead) return;
    const res = setSurveyDate(lead, iso, DEMO_TODAY);
    Object.assign(lead, res.lead);
    placeCard(lead, { focus: byUser });
    if (res.toast) toast(res.toast);
  }
  function advance(id: string, byUser: boolean) {
    const lead = leads.get(id);
    if (!lead) return;
    const res = advanceLead(lead);
    if (res.kind === 'refuse') { toast(res.toast, 'warning'); if (byUser && phase === 'sent') nudgeApprove(); return; }
    if (res.kind === 'move') moveTo(id, res.to, byUser);
  }
  /** Auto-flow: the survey day comes round (the board runs a little faster than a real week). */
  function surveyDone(id: string) {
    const lead = leads.get(id);
    if (!lead) return;
    const move = surveyDayReached({ ...lead, siteSurveyDate: DEMO_TODAY }, DEMO_TODAY);
    if (!move) return;
    Object.assign(lead, move.lead);
    placeCard(lead);
    toast(move.activity);
  }
  /** Auto-flow: a quote goes out by email, so the app moves the lead to Follow-up. */
  function quoteSent(id: string) {
    const lead = leads.get(id);
    if (!lead) return;
    counters = { ...counters, quote: counters.quote + 1 };
    const move = quoteSentToLead({ ...lead, quoteCount: lead.quoteCount + 1 }, `QT-${counters.quote}`, 'email', DEMO_TODAY);
    if (!move) return;
    Object.assign(lead, move.lead);
    placeCard(lead);
    if (move.activity) toast(move.activity);
  }

  // ---------- the customer's approval, then the office's one click ----------
  let phase: 'sent' | 'approved' | 'converted' = 'sent';
  const approveBtn = storyEl.querySelector<HTMLButtonElement>('[data-approve]')!;
  const convertBtn = storyEl.querySelector<HTMLButtonElement>('[data-convert]')!;
  /** The story card shows one step at a time: the customer's phone → the office → what got created. */
  function showStep(k: 'sent' | 'approved' | 'converted', focus?: HTMLElement) {
    for (const x of ['sent', 'approved', 'converted'] as const) stepEl(x).hidden = x !== k;
    anim(stepEl(k), [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380 });
    focus?.focus({ preventScroll: true });
  }
  function nudgeApprove() {
    anim(approveBtn, [{ boxShadow: '0 0 0 0 rgba(16,185,129,.55)' }, { boxShadow: '0 0 0 12px rgba(16,185,129,0)' }], { duration: 900, iterations: 2 });
  }
  approveBtn.addEventListener('click', () => {
    if (phase !== 'sent') return;
    userTouched();
    phase = 'approved';
    // As q.html: one tap, no confirm. The quote is approved; nothing else is created yet, so the
    // office sees it waiting (the app's banner wording).
    showStep('approved', convertBtn);
    toast('Quote approved! Thank you.');
    track('board_customer_approve', {});
  });
  convertBtn.addEventListener('click', () => {
    if (phase !== 'approved') return;
    userTouched();
    // The app's confirm (`confirmConvertApprovedQuote`), word for word.
    askConfirm(
      `🔨 Create the work order and invoice for ${story.quote}?`,
      `${story.customer} approved this quote but it has no work order or invoice yet. This creates ${story.wo} and ${story.inv} from it, and turns the lead into a customer.`,
      '🔨 Create Work Order & Invoice',
      convert,
    );
  });
  function convert() {
    phase = 'converted';
    // The lead becomes a customer and leaves the board; the work order and invoice exist now.
    leads.delete(story.leadId);
    removeCard(story.leadId);
    const box = document.createElement('div');
    box.innerHTML = docCardHTML('wo', story.wo, 'Work order · Order Materials', 'Order Materials', 'kc-pill-purple')
      + docCardHTML('inv', story.inv, `Invoice · ${fmtMoney(story.total)} · due ${fmtDate(story.due)}`, 'Unpaid', 'kc-pill-red');
    const cards = Array.from(box.children) as HTMLElement[];
    docsEl.replaceChildren(...cards);
    showStep('converted');
    cards.forEach((c, i) => anim(c, [{ transform: 'translateY(22px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 550, delay: i * 120, fill: 'backwards', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }));
    toast(story.toast);
    track('board_convert', {});
    celebrate();
  }

  // ---------- confirm (the app's modal: title, body, Cancel + the action) ----------
  let confirmCb: (() => void) | null = null;
  let confirmReturn: HTMLElement | null = null;
  function askConfirm(title: string, body: string, yes: string, cb: () => void) {
    confirmCb = cb;
    confirmReturn = document.activeElement as HTMLElement;
    confirmEl.querySelector('[data-confirm-h]')!.textContent = title;
    confirmEl.querySelector('[data-confirm-msg]')!.textContent = body;
    confirmEl.querySelector('[data-confirm-yes]')!.textContent = yes;
    confirmEl.hidden = false;
    confirmEl.querySelector<HTMLButtonElement>('[data-confirm-yes]')!.focus();
  }
  function closeConfirm(ok: boolean) {
    confirmEl.hidden = true;
    const cb = confirmCb;
    confirmCb = null;
    if (ok && cb) cb();
    (ok && phase === 'converted' ? docsEl : confirmReturn)?.focus?.({ preventScroll: true });
  }
  confirmEl.querySelector('[data-confirm-yes]')!.addEventListener('click', () => closeConfirm(true));
  confirmEl.querySelector('[data-confirm-no]')!.addEventListener('click', () => closeConfirm(false));
  confirmEl.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') closeConfirm(false); });

  // ---------- small celebration after the conversion (one beat) ----------
  function celebrate() {
    hintEl.innerHTML = '<span class="lb-hint-dot" aria-hidden="true"></span><span>That\'s the real flow. <a href="/start">Run your shop on it free for 14 days →</a></span>';
  }

  // ---------- user input ----------
  let lastUser = 0;
  function userTouched() { lastUser = Date.now(); }

  plane.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const toggle = t.closest<HTMLButtonElement>('[data-bucket-toggle]');
    if (toggle) {
      // Collapse / open an age group; the chevron swaps (down / right) instead of rotating.
      const b = toggle.closest<HTMLElement>('.kb-bucket')!;
      const open = b.classList.toggle('is-closed') === false;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.kb-bucket-arrow')!.innerHTML = icon(open ? 'chevron' : 'chevronRight');
      userTouched();
      return;
    }
    const btn = t.closest<HTMLButtonElement>('button[data-act]');
    if (!btn) return;
    const card = btn.closest<HTMLElement>('.kc')!;
    userTouched();
    if (btn.dataset.act === 'advance') advance(card.dataset.id!, true);
    track('board_button', { act: btn.dataset.act! });
  });
  // The New card's survey box is a real date input, like the app's.
  plane.addEventListener('change', (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-act="survey"]');
    if (!input || !input.value) return;
    const card = input.closest<HTMLElement>('.kc')!;
    userTouched();
    survey(card.dataset.id!, input.value, true);
    track('board_button', { act: 'survey' });
  });
  plane.addEventListener('click', (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-act="survey"]');
    try { (input as HTMLInputElement & { showPicker?: () => void })?.showPicker?.(); } catch { /* not allowed here */ }
  });

  plane.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input')) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>('.kc');
    if (!card) return;
    const id = card.dataset.id!;
    const lead = leads.get(id);
    if (!lead) return;
    const order = BOARD_STATUSES as readonly Status[];
    const i = order.indexOf(lead.status);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      userTouched();
      const to = order[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (to) moveTo(id, to, true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      userTouched();
      // New: pick a survey two days out (the date box takes any date too); Send Quote: "→ Follow-up".
      if (lead.status === 'new') survey(id, addDays(DEMO_TODAY, 2), true);
      else advance(id, true);
    }
  });

  // Drag: lift the card into a level, full-size "ghost" that follows the pointer; drop on a lane.
  let drag: null | { id: string; el: HTMLElement; ghost: HTMLElement; gw: number; sx: number; sy: number; started: boolean; over: HTMLElement | null; pid: number } = null;
  plane.addEventListener('pointerdown', (e) => {
    if (!desktop.matches || e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.kc');
    if (!el || (e.target as HTMLElement).closest('button, input, label')) return;
    userTouched();
    drag = { id: el.dataset.id!, el, ghost: el, gw: 260, sx: e.clientX, sy: e.clientY, started: false, over: null, pid: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      drag.started = true;
      const r = drag.el.getBoundingClientRect();
      const ghost = drag.el.cloneNode(true) as HTMLElement;
      ghost.classList.add('lb-ghost');
      ghost.removeAttribute('tabindex');
      // The ghost lives outside the (possibly zoomed, possibly tilted) board, at the card's true size.
      drag.gw = Math.round(drag.el.offsetWidth);
      ghost.style.setProperty('--gw', `${drag.gw}px`);
      ghost.style.left = `${Math.round(e.clientX - drag.gw / 2)}px`;
      ghost.style.top = `${Math.round(e.clientY - 40)}px`;
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      drag.el.classList.add('is-lifted');
      const from = r.width / drag.gw;
      if (from < 0.98) anim(ghost, [{ transform: `scale(${from})` }, { transform: 'none' }], { duration: 220 });
      document.body.style.cursor = 'grabbing';
    }
    drag.ghost.style.left = `${Math.round(e.clientX - drag.gw / 2)}px`;
    drag.ghost.style.top = `${Math.round(e.clientY - 40)}px`;
    const lane = document.elementsFromPoint(e.clientX, e.clientY).map((n) => (n as HTMLElement).closest?.('[data-lane]') as HTMLElement | null).find(Boolean) ?? null;
    if (lane !== drag.over) { drag.over?.classList.remove('is-over'); lane?.classList.add('is-over'); drag.over = lane; }
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    document.body.style.cursor = '';
    if (!d.started) return;
    d.over?.classList.remove('is-over');
    const to = d.over?.dataset.lane as Status | undefined;
    const lead = leads.get(d.id);
    const moved = !!(to && lead && to !== lead.status) && moveTo(d.id, to, true);
    const back = () => { d.ghost.remove(); d.el.classList.remove('is-lifted'); };
    if (moved || reduce.matches) { back(); }
    else {
      const r = d.el.getBoundingClientRect();
      const g = d.ghost.getBoundingClientRect();
      const ret = anim(d.ghost, [{ transform: 'none', opacity: 1 }, { transform: `translate(${r.left - g.left}px, ${r.top - g.top}px) scale(${r.width / g.width})`, opacity: 0.4 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      if (ret) ret.onfinish = back; else back();
    }
    if (to) track('board_drag', { to });
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---------- auto-flow: one real transition every few seconds ----------
  // The story lead (QT-330) is the visitor's to approve, so the auto-flow never touches it.
  let paused = false;
  let visible = true;
  let step = 0;
  const firstIn = (s: Status) => [...leads.values()].filter((l) => l.status === s && l.id !== story.leadId).sort((a, b) => b.stageAgeDays - a.stageAgeDays)[0];
  function tick() {
    if (paused || !visible || document.hidden || reduce.matches || drag || !confirmEl.hidden) return;
    if (Date.now() - lastUser < IDLE_AFTER_USER_MS) return;
    for (let tries = 0; tries < 4; tries++) {
      const k = step++ % 4;
      if (k === 0) { const l = firstIn('new'); if (l) { survey(l.id, addDays(DEMO_TODAY, 2), false); return; } }
      if (k === 1) { const l = firstIn('site_survey_scheduled'); if (l) { surveyDone(l.id); return; } }
      if (k === 2) { const l = firstIn('send_quote'); if (l) { quoteSent(l.id); return; } }
      if (k === 3) {
        const nl = incoming.shift();
        if (nl) {
          counters = { ...counters, lead: counters.lead + 1 };
          const lead = { ...nl, status: 'new' as Status, stageAgeDays: 0 };
          leads.set(lead.id, lead);
          placeCard(lead);
          toast(`New lead ${lead.number} — ${lead.name}`);
          return;
        }
      }
    }
    stop(); // nothing left to move — the board rests
  }
  let timer = 0;
  const start = () => { if (!timer && !reduce.matches) timer = window.setInterval(tick, STEP_MS); };
  const stop = () => { clearInterval(timer); timer = 0; };
  pauseBtns.forEach((b) => b.addEventListener('click', () => {
    paused = !paused;
    pauseBtns.forEach((x) => { x.setAttribute('aria-pressed', String(paused)); x.textContent = paused ? 'Play' : 'Pause'; });
    if (!paused) start();
  }));
  if (reduce.matches) pauseBtns.forEach((b) => { b.hidden = true; });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.15 }).observe(root);

  // ---------- desktop: size the board, then let it rise to meet you on scroll ----------
  // Lanes match the app (240-280px wide, 12px apart). Below that, CSS zoom shrinks the whole
  // board evenly; zoom re-lays out text rather than scaling pixels, so it never goes soft.
  const LANE_MIN = 240, LANE_MAX = 280, GAP = 12, PAD = 14;
  const BOARD_MIN = 5 * LANE_MIN + 4 * GAP + 2 * PAD;
  const BOARD_MAX = 5 * LANE_MAX + 4 * GAP + 2 * PAD;
  let zoom = 1;
  // Flat board size on screen (layout px; unaffected by the pivot transform).
  let boardW = 0, boardH = 0;
  function fitBoard() {
    if (!desktop.matches) {
      zoom = 1;
      root.style.removeProperty('--lb-h');
      for (const k of ['--z', '--pw']) plane.style.removeProperty(k);
      pivot.style.transform = '';
      stage.style.transform = '';
      return;
    }
    // Fill exactly the rest of the first screen (not the hero's own height — that includes this
    // box), so the pinned hero ends at the screen's bottom edge and the fade + hint stay in view.
    const mast = document.querySelector<HTMLElement>('[data-mast]')?.offsetHeight ?? 72;
    const top = root.getBoundingClientRect().top - hero.getBoundingClientRect().top;
    root.style.setProperty('--lb-h', `${Math.max(160, window.innerHeight - mast - top)}px`);
    // Desktop: the activity feed sits beside the paragraph + form, just under the headline.
    const h1 = hero.querySelector('h1');
    const feed = hero.querySelector<HTMLElement>('.hero-feed');
    if (h1 && feed) feed.style.setProperty('--feed-top', `${Math.round(h1.getBoundingClientRect().bottom - hero.getBoundingClientRect().top + 22)}px`);
    // Same side margin as the page gutter; centered; never wider than the app's own board.
    const gutter = Math.min(40, Math.max(16, 6.4 + 0.026 * window.innerWidth));
    const avail = stage.clientWidth - 2 * gutter;
    zoom = Math.max(0.6, Math.min(1, avail / BOARD_MIN));
    const width = Math.floor(Math.min(BOARD_MAX, avail / zoom));
    plane.style.setProperty('--z', zoom.toFixed(4));
    plane.style.setProperty('--pw', `${width}px`);
    boardW = pivot.offsetWidth;
    boardH = pivot.offsetHeight;
  }
  fitBoard();
  window.addEventListener('resize', fitBoard);

  // ---------- the pivot: laid back like a floor at the top, flat when it arrives ----------
  // Hinged on the board's bottom edge, the far (top) edge leans away from you. Everything sits at or
  // behind the screen plane, so it is only ever drawn at true size or smaller: sharp, never blown up.
  // Symmetric: no twist, vanishing point dead center. At rest the transform is removed entirely.
  const PIVOT_DEG = 38;
  const snap = (v: number) => { const d = window.devicePixelRatio || 1; return Math.round(v * d) / d; };
  let riseDist = 0;
  function pose(p: number) {
    // The board finishes pivoting at 85% of the scroll, then glides the last bit flat.
    const k = Math.min(1, p / 0.85);
    const theta = PIVOT_DEG * (1 - (0.5 - 0.5 * Math.cos(Math.PI * k)));
    let drop = 0;
    if (theta > 0.01 && boardH) {
      const persp = Math.round(boardW * 1.1);
      const r = (theta * Math.PI) / 180;
      const s = persp / (persp + boardH * Math.sin(r));
      // Tilting lowers the far edge on screen; lift the board by the same amount so its top
      // edge travels in a straight line from under the headline to its resting place.
      drop = boardH - boardH * Math.cos(r) * s;
      pivot.style.transform = `perspective(${persp}px) rotateX(${theta.toFixed(3)}deg)`;
    } else {
      pivot.style.transform = '';
    }
    const y = snap(-riseDist * p - drop);
    stage.style.transform = y ? `translateY(${y}px)` : '';
  }
  const wantPivot = () => desktop.matches && !reduce.matches;
  // Start laid back right away (the lanes fade in on top of it), before the scroll code arrives.
  if (wantPivot()) pose(0);

  // Lay the board: lanes settle in from the center outward, evenly on both sides.
  if (desktop.matches) {
    plane.querySelectorAll('.lb-lane').forEach((lane, i) => anim(lane, [{ transform: 'translateY(48px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 150 + Math.abs(i - 2) * 110, fill: 'backwards' }));
  }

  // The scroll scene needs GSAP + ScrollTrigger: desktop only, loaded after the page has painted.
  async function scrollScene() {
    const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add({ desk: '(min-width: 900px)', motion: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
      const { desk, motion } = ctx.conditions as { desk: boolean; motion: boolean };
      if (!desk || !motion) return;
      const mastH = () => document.querySelector<HTMLElement>('[data-mast]')?.offsetHeight ?? 72;
      // Where the board comes to rest. If the whole board plus its hint pill fits, the pair sits
      // centered on the screen, pill just under the board. If not, the board stops 24px under the
      // masthead and its lower edge fades off the bottom, with the pill floating over it.
      const endEl = root.querySelector<HTMLElement>('[data-end]')!;
      const measure = () => {
        fitBoard();
        const avail = window.innerHeight - mastH();
        const lbTop = root.getBoundingClientRect().top - hero.getBoundingClientRect().top;
        const group = boardH + 16 + (endEl.offsetHeight || 48);
        let top = 24;
        if (group + 48 <= avail) {
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
      // Copy and feed clear out first; the board pivots up flat, rises and settles.
      tl.to(hero.querySelector('.hero-copy'), { autoAlpha: 0, y: -70, duration: 0.32, ease: 'power1.in' }, 0)
        .to(hero.querySelector('.hero-feed'), { autoAlpha: 0, y: -40, duration: 0.32, ease: 'power1.in' }, 0)
        .to(drive, { p: 1, duration: 1, ease: 'none', onUpdate: () => pose(drive.p) }, 0)
        .to(endEl, { autoAlpha: 1, duration: 0.2, ease: 'none' }, 0.8);
      pose(drive.p);
      return () => { tl.scrollTrigger?.kill(); tl.kill(); pivot.style.transform = ''; stage.style.transform = ''; };
    });
  }
  let sceneLoaded = false;
  // If the scroll code can't load, lay the board flat rather than leave it tilted.
  const loadScene = () => { if (!sceneLoaded && wantPivot()) { sceneLoaded = true; scrollScene().catch(() => { pivot.style.transform = ''; stage.style.transform = ''; }); } };
  if (document.readyState === 'complete') setTimeout(loadScene, 0);
  else window.addEventListener('load', () => setTimeout(loadScene, 0), { once: true });
  desktop.addEventListener('change', loadScene);

  // Cards become keyboard-reachable once the script runs.
  plane.querySelectorAll<HTMLElement>('.kc').forEach(prepCard);
  start();
}
