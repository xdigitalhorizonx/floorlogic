// The home hero's Caspar replay: a short scripted replay of the sample (about 8.5 s) that runs once,
// when the conversation first comes into view, and stops on the final state. "Hold to talk" replays
// it: no microphone, nothing is recorded, sent or fetched. Pause / Play while it moves (WCAG 2.2.2);
// with reduced motion the final state shows at once and the button just shows it again.
// No maths here: every figure was worked out at build time (src/data/hero-caspar.ts); the count-up
// only formats the running totals it is given. CSS draws every state (HeroCaspar.astro); this file
// only flips attributes on a virtual clock that stops when paused.
import { fmtMoney } from '../lib/logic/money';
import { track } from '../lib/analytics';

type State = 'wait' | 'play' | 'pause' | 'done' | 'reset';
type Status = 'listen' | 'think' | 'talk';
type Orb = 'listen' | 'hear' | 'think' | 'talk';

const END = 8400;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

export function initHeroCaspar() {
  const stageEl = document.querySelector<HTMLElement>('[data-hc]');
  if (!stageEl) return;
  const stage: HTMLElement = stageEl;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => stage.querySelector<T>(sel)!;
  const x = (key: string) => $(`[data-hc-x="${key}"]`);
  const phone = $('[data-hc-phone]');
  const ptt = $<HTMLButtonElement>('[data-hc-ptt]');
  const pauseBtn = $<HTMLButtonElement>('[data-hc-pause]');
  const totalEl = $('[data-hc-total]');
  const empty = $('[data-hc-empty]');
  const beam = $('[data-hc-beam]');
  const paper = $('.hc-paper');
  const live = $('[data-hc-live]');
  const log = $('[data-hc-log]');
  const finalTotal = totalEl.textContent || '';
  const steps = JSON.parse(stage.dataset.steps || '[]') as number[];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  let state: State = 'wait';
  let t = 0;
  let last = 0;
  let raf = 0;
  let next = 0;

  const set = (s: State) => { state = s; stage.dataset.hc = s; };
  const on = (el: Element, attr = 'data-on') => el.setAttribute(attr, '');
  const say = (s: Status, orb: Orb) => { phone.dataset.status = s; phone.dataset.orb = orb; };
  // Dale holding his button in the sample (the pressed look) / you holding it (also the app's words).
  const hold = (v: boolean) => ptt.toggleAttribute('data-holding', v);
  const press = (v: boolean) => ptt.toggleAttribute('data-pressed', v);
  const flow = (key: 'snap' | 'fills', v: boolean) => $(`[data-hc-wire="${key}"]`).toggleAttribute('data-flow', v);
  const scan = () => {
    const h = paper.offsetHeight - beam.offsetHeight;
    beam.animate(
      [{ opacity: 0, transform: 'translateY(0)' }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.86 }, { opacity: 0, transform: `translateY(${h}px)` }],
      { duration: 1200, easing: 'cubic-bezier(.45, 0, .25, 1)' },
    );
  };

  // The script. Dale holds the button and talks, Caspar thinks, answers, and fills the draft in.
  const cues: Array<[number, () => void]> = [
    [0, () => { say('listen', 'hear'); hold(true); }],
    [200, () => on(x('msg0'))],
    [1300, () => { on(x('msg0'), 'data-final'); hold(false); say('think', 'think'); }],
    [1900, () => { say('talk', 'talk'); on(x('msg1')); }],
    [2200, () => { flow('fills', true); on(x('who')); on(empty, 'data-off'); }],
    [2400, () => { on(x('row0')); on(x('sum')); }],
    [3000, () => flow('fills', false)],
    [3200, () => { say('listen', 'hear'); hold(true); on(x('msg2')); }],
    [4000, () => { on(x('msg2'), 'data-final'); hold(false); say('think', 'think'); }],
    [4500, () => { say('talk', 'talk'); on(x('msg3')); }],
    [4800, () => flow('fills', true)],
    [4900, () => on(x('row1'))],
    [5350, () => on(x('row2'))],
    [5800, () => on(x('row3'))],
    [6400, () => { on(x('ok')); flow('fills', false); say('listen', 'listen'); }],
    [6600, () => { flow('snap', true); scan(); }],
    [7900, () => { on(x('checked')); flow('snap', false); }],
  ];
  // The total counts up as each line lands: [from, to] = the running totals around that line.
  const counts = [[2400, 600], [4900, 400], [5350, 400], [5800, 500]].map(([at, dur], k) => ({ at: at!, dur: dur!, from: steps[k] ?? 0, to: steps[k + 1] ?? 0 }));
  const paintTotal = () => {
    let v = steps[0] ?? 0;
    for (const c of counts) if (t >= c.at) v = c.from + (c.to - c.from) * easeOut(Math.min(1, (t - c.at) / c.dur));
    totalEl.textContent = fmtMoney(v);
  };

  const tick = (now: number) => {
    if (state !== 'play') return;
    t += Math.min(now - last, 100); // a long frame or a hidden tab never skips a beat
    last = now;
    while (next < cues.length && cues[next]![0] <= t) cues[next++]![1]();
    paintTotal();
    if (t >= END) { finish(true); return; }
    raf = requestAnimationFrame(tick);
  };

  const announce = () => {
    live.textContent = '';
    setTimeout(() => { live.textContent = live.dataset.done || ''; }, 60);
  };

  function finish(natural: boolean) {
    cancelAnimationFrame(raf);
    const hadFocus = document.activeElement === pauseBtn;
    beam.getAnimations().forEach((a) => a.cancel());
    // The final state is the page as built: every part shown, the app at rest.
    hold(false);
    press(false);
    say('listen', 'listen');
    flow('fills', false);
    flow('snap', false);
    totalEl.textContent = finalTotal;
    set('done');
    pauseBtn.hidden = true;
    if (hadFocus) ptt.focus();
    if (natural) announce();
  }

  function clear() {
    cancelAnimationFrame(raf);
    beam.getAnimations().forEach((a) => a.cancel());
    set('reset'); // transitions off for one style pass
    stage.querySelectorAll('[data-on], [data-final], [data-off], [data-flow]').forEach((el) => {
      for (const a of ['data-on', 'data-final', 'data-off', 'data-flow']) el.removeAttribute(a);
    });
    say('listen', 'listen');
    hold(false);
    press(false);
    totalEl.textContent = fmtMoney(steps[0] ?? 0);
    void stage.offsetWidth;
    t = 0;
    next = 0;
  }

  function play() {
    set('play');
    setPauseLabel(false);
    pauseBtn.hidden = false;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function setPauseLabel(paused: boolean) {
    pauseBtn.toggleAttribute('data-paused', paused);
    pauseBtn.setAttribute('aria-label', paused ? 'Play the sample' : 'Pause the sample');
  }

  function pause() {
    if (state !== 'play') return;
    cancelAnimationFrame(raf);
    set('pause');
    stage.getAnimations({ subtree: true }).forEach((a) => a.pause());
    setPauseLabel(true);
  }

  function resume() {
    if (state !== 'pause') return;
    set('play');
    stage.getAnimations({ subtree: true }).forEach((a) => a.play());
    setPauseLabel(false);
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------- controls --
  pauseBtn.addEventListener('click', () => {
    if (state === 'play') { pause(); track('hero_caspar_pause', {}); } else resume();
  });

  // "Hold to talk": held, it shows the app's "Listening… let go to send"; let go, the sample replays.
  const letGo = () => press(false);
  ptt.addEventListener('pointerdown', () => press(true));
  ptt.addEventListener('pointerleave', letGo);
  ptt.addEventListener('pointercancel', letGo);
  ptt.addEventListener('keydown', (e) => { if (e.key === ' ') press(true); });
  ptt.addEventListener('blur', letGo);
  ptt.addEventListener('click', () => {
    press(false);
    track('hero_caspar_replay', {});
    if (reduce.matches) { finish(false); announce(); return; }
    clear();
    play();
  });

  reduce.addEventListener('change', () => { if (reduce.matches && state !== 'done') finish(false); });

  // ---------------------------------------------------------------- start --
  // Reduced motion: the final state, as built. A very late start (the CSS fallback has already shown
  // the final state after 4 s): stay there rather than blank it and start over.
  if (reduce.matches || performance.now() > 3900 || !('IntersectionObserver' in window)) { finish(false); return; }
  set('wait');
  // Once the conversation is on screen (after first paint), play it, once.
  const io = new IntersectionObserver((entries) => {
    if (state !== 'wait' || !entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    setTimeout(() => { if (state === 'wait') play(); }, 350);
  }, { threshold: 0.3 });
  io.observe(log);
}
