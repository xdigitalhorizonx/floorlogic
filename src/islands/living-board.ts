// The hero's living lead board. Same rules as the real app (via src/lib/logic/lead-pipeline):
// survey date moves New → Site Survey Scheduled, "→ Next" advances, dropping on Approved asks the
// app's own confirm, and approval creates the work order + invoice. Sample data only; no network.
import {
  BOARD_STATUSES, LEAD_LABELS, nextStatus, canDrop, approveLead, setSurveyDate, changeStatus, type Lead,
} from '../lib/logic/lead-pipeline';
import { leadCardHTML, docCardHTML } from '../lib/board/card-html';
import { track } from '../lib/analytics';

type Status = Lead['status'];
type Counters = { lead: number; job: number; invoice: number; quote: number };
type Rep = { id: string; name: string };

const STEP_MS = 2800;
const IDLE_AFTER_USER_MS = 9000;

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
// Small beats use the Web Animations API, so phones never download an animation library.
// GSAP only arrives on desktop, after first paint, for the scroll scene.
function anim(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof el.animate !== 'function') return null;
  return el.animate(frames, { easing: EASE_OUT, ...opts });
}

export function initLivingBoard() {
  const rootEl = document.querySelector<HTMLElement>('[data-board]');
  if (!rootEl) return;
  const root: HTMLElement = rootEl;
  const hero = root.closest<HTMLElement>('[data-hero]')!;
  const plane = root.querySelector<HTMLElement>('[data-plane]')!;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const toastEl = hero.querySelector<HTMLElement>('[data-toast]')!;
  const docsEl = hero.querySelector<HTMLElement>('[data-docs]')!;
  const confirmEl = root.querySelector<HTMLElement>('[data-confirm]')!;
  const pauseBtns = Array.from(hero.querySelectorAll<HTMLButtonElement>('[data-pause]'));
  const hintEl = hero.querySelector<HTMLElement>('[data-hint]')!;
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  root.appendChild(live);

  const state = JSON.parse(root.querySelector('[data-board-state]')!.textContent || '{}') as {
    leads: Lead[]; incoming: Lead[]; reps: Rep[]; counters: Counters; today: string;
  };
  // The demo's fixed "today" travels with the board state, so this script never loads the sample dataset.
  const DEMO_TODAY = state.today;
  const leads = new Map(state.leads.map((l) => [l.id, { ...l }]));
  const incoming = state.incoming.map((l) => ({ ...l }));
  let counters = { ...state.counters };
  const repName = (id?: string | null) => state.reps.find((r) => r.id === id)?.name ?? '';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 900px)');
  const laneEl = (s: Status) => plane.querySelector<HTMLElement>(`[data-lane="${s}"]`)!;
  const cardEl = (id: string) => plane.querySelector<HTMLElement>(`.kc[data-id="${CSS.escape(id)}"]`);

  // ---------- helpers ----------
  // Activity feed: the app's own toast wording, newest first, last three kept.
  function toast(msg: string) {
    const li = document.createElement('p');
    li.textContent = msg;
    toastEl.prepend(li);
    while (toastEl.children.length > 3) toastEl.lastElementChild!.remove();
    anim(li, [{ transform: 'translateY(-10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350 });
  }
  function announce(msg: string) { live.textContent = msg; }
  function counts() {
    for (const s of BOARD_STATUSES) {
      const el = laneEl(s);
      el.querySelector('[data-count]')!.textContent = String(el.querySelectorAll('.kc').length);
    }
  }
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
  function placeCard(lead: Lead, opts: { animate?: boolean; focus?: boolean } = {}) {
    const old = cardEl(lead.id);
    const fresh = renderCard(lead);
    const target = laneEl(lead.status).querySelector<HTMLElement>('[data-cards]')!;
    const animate = opts.animate !== false && !reduce.matches;
    if (old) old.replaceWith(fresh);
    target.prepend(fresh);
    // Local-space entrance only: FLIP across a 3D-tilted parent would jump.
    if (animate) anim(fresh, [{ transform: 'translateY(-18px) scale(0.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500 });
    counts();
    if (opts.focus) fresh.focus({ preventScroll: true });
    return fresh;
  }
  function popDocs(wo: { number: string; total?: number }, inv: { number: string; total: number }) {
    const box = document.createElement('div');
    box.innerHTML = docCardHTML('wo', wo.number, 'Work order · Order Materials', 'Order Materials', 'kc-pill-purple')
      + docCardHTML('inv', inv.number, `Invoice · ${money(inv.total)} · due in 30 days`, 'Unpaid', 'kc-pill-red');
    const cards = Array.from(box.children) as HTMLElement[];
    docsEl.replaceChildren(...cards);
    cards.forEach((c, i) => anim(c, [{ transform: 'translateY(26px) scale(0.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 550, delay: i * 120, fill: 'backwards', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }));
  }

  // ---------- the app's moves ----------
  function doApprove(id: string, byUser: boolean) {
    const lead = leads.get(id);
    if (!lead) return;
    const res = approveLead(lead, counters, DEMO_TODAY);
    counters = res.counters;
    leads.delete(id);
    const el = cardEl(id);
    const finish = () => { el?.remove(); counts(); };
    const out = el ? anim(el, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-10px) scale(0.9)', opacity: 0 }], { duration: 450, easing: 'ease-in', fill: 'forwards' }) : null;
    if (out) out.onfinish = finish; else finish();
    popDocs(res.workOrder, res.invoice);
    toast(res.toast);
    announce(res.toast);
    if (byUser) { track('board_approve', { by: 'user' }); celebrate(); }
  }
  function moveTo(id: string, to: Status, byUser: boolean): boolean {
    const lead = leads.get(id);
    if (!lead || lead.status === to) return false;
    const check = canDrop(lead, to);
    if (!check.ok) { if (check.toast) { toast(check.toast); announce(check.toast); } return false; }
    if (check.approves) {
      if (byUser && check.confirm) { askConfirm(check.confirm, () => doApprove(id, true)); return true; }
      doApprove(id, false);
      return true;
    }
    Object.assign(lead, changeStatus(lead, to, DEMO_TODAY));
    placeCard(lead, { focus: byUser && document.activeElement?.classList.contains('kc') });
    announce(`${lead.name} moved to ${LEAD_LABELS[to]}.`);
    return true;
  }
  function survey(id: string, byUser: boolean) {
    const lead = leads.get(id);
    if (!lead) return;
    const res = setSurveyDate(lead, addDays(DEMO_TODAY, 2), DEMO_TODAY);
    Object.assign(lead, res.lead);
    placeCard(lead, { focus: byUser });
    if (res.toast) { toast(res.toast); announce(res.toast); }
  }
  function advance(id: string, byUser: boolean) {
    const lead = leads.get(id);
    if (!lead) return;
    const nx = nextStatus(lead.status);
    if (!nx) return;
    if (nx === 'approved') { doApprove(id, byUser); return; } // the app's advance button skips the confirm
    moveTo(id, nx, byUser);
  }

  // ---------- confirm (the app uses window.confirm with this exact text) ----------
  let confirmCb: (() => void) | null = null;
  let confirmReturn: HTMLElement | null = null;
  function askConfirm(msg: string, yes: () => void) {
    confirmCb = yes;
    confirmReturn = document.activeElement as HTMLElement;
    confirmEl.querySelector('[data-confirm-msg]')!.textContent = msg;
    confirmEl.hidden = false;
    confirmEl.querySelector<HTMLButtonElement>('[data-confirm-yes]')!.focus();
  }
  function closeConfirm(ok: boolean) {
    confirmEl.hidden = true;
    const cb = confirmCb;
    confirmCb = null;
    if (ok && cb) cb();
    confirmReturn?.focus?.({ preventScroll: true });
  }
  confirmEl.querySelector('[data-confirm-yes]')!.addEventListener('click', () => closeConfirm(true));
  confirmEl.querySelector('[data-confirm-no]')!.addEventListener('click', () => closeConfirm(false));
  confirmEl.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') closeConfirm(false); });

  // ---------- small celebration on a user approval (one beat) ----------
  function celebrate() {
    hintEl.innerHTML = '<span class="lb-hint-dot" aria-hidden="true"></span><span>That\'s the real flow. <a href="/start">Run your shop on it free for 14 days →</a></span>';
  }

  // ---------- user input ----------
  let lastUser = 0;
  const userTouched = () => { lastUser = Date.now(); };

  plane.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    if (!btn) return;
    const card = btn.closest<HTMLElement>('.kc')!;
    userTouched();
    if (btn.dataset.act === 'survey') survey(card.dataset.id!, true);
    if (btn.dataset.act === 'advance') advance(card.dataset.id!, true);
    track('board_button', { act: btn.dataset.act! });
  });

  plane.addEventListener('keydown', (e) => {
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
      if (lead.status === 'new') survey(id, true);
      else if (lead.status !== 'site_survey_scheduled') advance(id, true);
    }
  });

  // Drag: lift the card off the tilted floor into a flat, readable "ghost", drop on a lane.
  let drag: null | { id: string; el: HTMLElement; ghost: HTMLElement; sx: number; sy: number; started: boolean; over: HTMLElement | null; pid: number } = null;
  plane.addEventListener('pointerdown', (e) => {
    if (!desktop.matches || e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.kc');
    if (!el || (e.target as HTMLElement).closest('button')) return;
    userTouched();
    drag = { id: el.dataset.id!, el, ghost: el, sx: e.clientX, sy: e.clientY, started: false, over: null, pid: e.pointerId };
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
      ghost.style.left = `${e.clientX - 130}px`;
      ghost.style.top = `${e.clientY - 40}px`;
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      drag.el.classList.add('is-lifted');
      anim(ghost, [{ transform: `scale(${Math.max(0.5, r.width / 260)}) rotate(-4deg)` }, { transform: 'scale(1.04) rotate(-2deg)' }], { duration: 250, fill: 'forwards' });
      document.body.style.cursor = 'grabbing';
    }
    drag.ghost.style.left = `${e.clientX - 130}px`;
    drag.ghost.style.top = `${e.clientY - 40}px`;
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
      const ret = anim(d.ghost, [{ transform: 'scale(1.04) rotate(-2deg)', opacity: 1 }, { transform: `translate(${r.left - g.left}px, ${r.top - g.top}px) scale(${r.width / 260})`, opacity: 0.4 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      if (ret) ret.onfinish = back; else back();
    }
    if (to) track('board_drag', { to });
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---------- auto-flow: one real transition every few seconds ----------
  let paused = false;
  let visible = true;
  let step = 0;
  const firstIn = (s: Status) => [...leads.values()].filter((l) => l.status === s).sort((a, b) => b.stageAgeDays - a.stageAgeDays)[0];
  function tick() {
    if (paused || !visible || document.hidden || reduce.matches || drag || !confirmEl.hidden) return;
    if (Date.now() - lastUser < IDLE_AFTER_USER_MS) return;
    for (let tries = 0; tries < 5; tries++) {
      const k = step++ % 5;
      if (k === 0) { const l = firstIn('new'); if (l) { survey(l.id, false); return; } }
      if (k === 1) { const l = firstIn('site_survey_scheduled'); if (l) { moveTo(l.id, 'send_quote', false); return; } }
      if (k === 2) { const l = firstIn('send_quote'); if (l) { advance(l.id, false); return; } }
      if (k === 3) { const l = firstIn('follow_up'); if (l) { advance(l.id, false); return; } }
      if (k === 4) {
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

  // ---------- desktop scroll scene: the floor tilts up to meet you ----------
  function fitBoard() {
    if (!desktop.matches) { root.style.removeProperty('--lb-h'); return; }
    // Fill the rest of the first screen (not the hero's own height — that includes this box).
    const mast = document.querySelector<HTMLElement>('[data-mast]')?.offsetHeight ?? 72;
    const top = root.getBoundingClientRect().top - hero.getBoundingClientRect().top;
    root.style.setProperty('--lb-h', `${Math.max(320, window.innerHeight - mast - top)}px`);
    // Desktop: the activity feed sits beside the paragraph + form, just under the headline.
    const h1 = hero.querySelector('h1');
    const feed = hero.querySelector<HTMLElement>('.hero-feed');
    if (h1 && feed) feed.style.setProperty('--feed-top', `${Math.round(h1.getBoundingClientRect().bottom - hero.getBoundingClientRect().top + 22)}px`);
    // Keep the floor wider than the window on big screens so it always bleeds off both edges.
    plane.style.setProperty('--base', String(Math.min(1.5, Math.max(0.62, window.innerWidth / 1400))));
  }
  fitBoard();
  window.addEventListener('resize', fitBoard);

  // Lay the floor: lanes click in like planks (desktop, motion allowed).
  if (desktop.matches) {
    plane.querySelectorAll('.lb-lane').forEach((lane, i) => anim(lane, [{ transform: 'translateY(60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 150 + i * 80, fill: 'backwards' }));
    if (reduce.matches) { plane.style.setProperty('--tilt', '30deg'); plane.style.setProperty('--twist', '-3deg'); }
  }

  // The scroll scene needs GSAP + ScrollTrigger: desktop only, loaded after the page has painted.
  async function scrollScene() {
    const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add({ desk: '(min-width: 900px)', motion: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
      const { desk, motion } = ctx.conditions as { desk: boolean; motion: boolean };
      if (!desk || !motion) return;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: hero, start: () => `top ${document.querySelector<HTMLElement>('[data-mast]')?.offsetHeight ?? 72}px`, end: '+=70%', scrub: 0.6, pin: true, anticipatePin: 1, invalidateOnRefresh: true },
      });
      // Copy and feed clear out first, then the floor tilts up and rises to fill the screen.
      tl.to(hero.querySelector('.hero-copy'), { autoAlpha: 0, y: -70, duration: 0.32, ease: 'power1.in' }, 0)
        .to(hero.querySelector('.hero-feed'), { autoAlpha: 0, y: -40, duration: 0.32, ease: 'power1.in' }, 0)
        .to(plane, { '--tilt': '18deg', '--twist': '-1.5deg', '--scale': 0.86, duration: 1, ease: 'none' }, 0)
        .to(stage, { y: () => -Math.min(window.innerHeight * 0.5, root.getBoundingClientRect().top - hero.getBoundingClientRect().top - 24), duration: 1, ease: 'none' }, 0)
        .to(root.querySelector('[data-end]'), { autoAlpha: 1, duration: 0.2, ease: 'none' }, 0.8);
      return () => { tl.scrollTrigger?.kill(); tl.kill(); };
    });
  }
  const wantScene = () => desktop.matches && !reduce.matches;
  let sceneLoaded = false;
  const loadScene = () => { if (!sceneLoaded && wantScene()) { sceneLoaded = true; scrollScene(); } };
  if (document.readyState === 'complete') setTimeout(loadScene, 0);
  else window.addEventListener('load', () => setTimeout(loadScene, 0), { once: true });
  desktop.addEventListener('change', loadScene);

  // Cards become keyboard-reachable once the script runs.
  plane.querySelectorAll<HTMLElement>('.kc').forEach(prepCard);
  start();
}
