/* FloorLogic homepage — hero module assembly (section #top).
   Seven module cards drift up scattered like loose paperwork, then spring into
   workflow order over the oak photo while a connector line draws itself
   through them — the product's pitch, acted out. Vendored anime.js v4 drives
   the motion; mo.js fires the celebration bursts. Without JS, or under
   prefers-reduced-motion, the cards render already in order (their CSS homes)
   and the connector renders fully drawn. */
(function () {
  'use strict';

  var visual = document.getElementById('hero-visual');
  var stack = document.getElementById('hero-stack');
  if (!visual || !stack || typeof anime === 'undefined') return;

  var animate = anime.animate;
  var stagger = anime.stagger;
  var createSpring = anime.createSpring;
  var splitText = anime.splitText;
  var svg = anime.svg;
  var utils = anime.utils;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mods = [].slice.call(stack.querySelectorAll('.mod'));

  /* mo.js bursts share the site's real tokens (read, never hardcoded) */
  var css = getComputedStyle(document.documentElement);
  var BURST_COLORS = [css.getPropertyValue('--cta').trim(), css.getPropertyValue('--accent').trim(), css.getPropertyValue('--st-complete').trim(), '#FFFFFF'];
  var burst = null;
  if (typeof mojs !== 'undefined') {
    burst = new mojs.Burst({
      radius: { 8: 74 }, count: 10,
      children: { shape: 'line', stroke: BURST_COLORS, strokeWidth: { 3: 0 }, radius: { 10: 2 }, duration: 800, easing: 'cubic.out' }
    });
  }
  function boom(el) {
    if (!burst || reduced || !el) return;
    var r = el.getBoundingClientRect();
    burst.tune({ x: r.left + r.width / 2 + window.scrollX, y: r.top + 8 + window.scrollY }).replay();
  }

  /* celebration on trial-form success (fired from main.js) */
  window.addEventListener('fl:trial-success', function (e) { boom(e.detail && e.detail.el); });

  if (reduced || document.body.clientWidth < 880) {
    // cards are already in order (CSS homes); just fill the step numbers
    mods.forEach(function (m) { m.classList.add('is-set'); });
    return;
  }

  /* ---------- phase 0: rewind — scatter the cards, blank the connector ---------- */

  // deterministic scatter (tuned, not random): dx, dy, rot per card
  var SCATTER = [
    [-70, 150, -7], [80, 190, 6], [-110, 120, 5], [95, 160, -6],
    [-60, 200, 8], [70, 120, -5], [0, 210, 4]
  ];
  mods.forEach(function (m, i) {
    utils.set(m, { translateX: SCATTER[i][0], translateY: SCATTER[i][1], rotate: SCATTER[i][2], opacity: 0 });
  });
  var drawable = svg.createDrawable('.hero__connector path');
  utils.set(drawable, { draw: '0 0' });

  /* headline words tumble in alongside */
  var h1 = document.querySelector('.hero h1');
  if (h1 && splitText) {
    var split = splitText(h1, { words: true });
    animate(split.words, { opacity: [0, 1], translateY: [12, 0], delay: stagger(22), duration: 500, ease: 'outCubic' });
  }

  /* ---------- phase 1: the papers float up… ---------- */
  animate(mods, { opacity: [0, 0.95], translateY: '-=26', duration: 700, delay: stagger(80), ease: 'outQuad' });

  /* ---------- phase 2: …and fall in line, one module at a time ---------- */
  mods.forEach(function (m, i) {
    animate(m, {
      translateX: 0, translateY: 0, rotate: 0, opacity: 1,
      delay: 420 + i * 160,
      ease: createSpring({ stiffness: 110, damping: 13 }),
      onComplete: function () {
        m.classList.add('is-set');
        animate(m.querySelector('.mod__n'), { scale: [1.4, 1], duration: 450, ease: 'outBack(2)' });
      }
    });
  });

  /* ---------- phase 3: the line connects them; the last card celebrates ---------- */
  var settleAt = 420 + (mods.length - 1) * 160 + 1000;
  setTimeout(function () {
    animate(drawable, { draw: '0 1', duration: 850, ease: 'inOutQuad' });
  }, settleAt);
  setTimeout(function () {
    boom(mods[mods.length - 1]);
    // idle breathing — desynced so the stack feels alive, never mechanical
    mods.forEach(function (m, i) {
      animate(m, { translateY: [-2.5, 2.5], duration: 2800 + i * 240, loop: true, alternate: true, ease: 'inOutSine' });
    });
  }, settleAt + 900);

  /* ---------- pointer parallax on the whole stack ---------- */
  var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
  function tick() {
    cx += (tx - cx) * 0.06;
    cy += (ty - cy) * 0.06;
    stack.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
    if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(tick);
    else raf = null;
  }
  function aim(x, y) { tx = x; ty = y; if (!raf) raf = requestAnimationFrame(tick); }
  visual.addEventListener('pointermove', function (e) {
    var r = visual.getBoundingClientRect();
    aim(((e.clientX - r.left) / r.width - 0.5) * 14, ((e.clientY - r.top) / r.height - 0.5) * 10);
  });
  visual.addEventListener('pointerleave', function () { aim(0, 0); });
})();
