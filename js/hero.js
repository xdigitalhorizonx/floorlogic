/* FloorLogic v3 hero — one screen glowing in a dark office.
   The board is a faithful recreation of the app's New Quote screen inside
   real window chrome, big enough to read. GSAP runs the build: the window
   rises out of the dark, the builder installs piece by piece, line items
   type themselves in while every total climbs (the builder's real math —
   8.265% tax on materials), APPROVED slams, and the seven module chips
   light up. The window carries a subtle 3D lean that flattens as you
   scroll. Authored at its finished state: reduced motion / no JS get the
   complete window. Click / Enter replays. */
(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof DrawSVGPlugin === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var board = document.getElementById('board');
  if (!board) return;

  gsap.registerPlugin(DrawSVGPlugin);
  if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var sections = ['.qb-title', '.qb-cohead', '.qb-parties', '.qb-lines', '.qb-addsection', '.qb-bottom', '.qb-side']
    .map(function (sel) { return $(sel, board); }).filter(Boolean);
  var rows = $$('.qb-row', board);
  var input = document.getElementById('qb-add');
  var stamp = document.getElementById('tally-stamp');
  var legend = $$('#legend li');
  var hint = $('.board__hint', board);
  var underline = document.getElementById('hero-underline');
  if (!rows.length || !input || !stamp) return;

  var KEYS = ['mat', 'labor', 'sub', 'tax', 'grand', 'band', 'stax', 'ssub'];
  var qEls = {};
  KEYS.forEach(function (k) { qEls[k] = board.querySelector('[data-qt="' + k + '"]'); });
  var marginEl = board.querySelector('[data-qt="margin"]');
  var FINAL_MARGIN = marginEl ? marginEl.textContent : '';

  /* cumulative ledger after each line — the full builder's math:
     LVP 2,489.60 (mat) → tear out 480.00 → install 1,440.00; tax on materials */
  var TAX = 0.08265;
  var STEPS = [
    { mat: 2489.60, labor: 0 },
    { mat: 2489.60, labor: 480.00 },
    { mat: 2489.60, labor: 1920.00 }
  ].map(function (s) {
    var sub = s.mat + s.labor;
    var tax = s.mat * TAX;
    return { mat: s.mat, labor: s.labor, sub: sub, tax: tax, grand: sub + tax, band: sub + tax, stax: tax, ssub: sub };
  });
  var TYPE_NAME = 'LVP — Great Basin'; // line 1 types itself, like the real builder

  function money(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function countMoney(el, from, to, dur) {
    var o = { v: from };
    return gsap.to(o, {
      v: to, duration: dur, ease: 'power2.out',
      onUpdate: function () { el.textContent = money(o.v); }
    });
  }

  function build() {
    var tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    /* initial states (JS-only, so no-JS never sees them) */
    gsap.set(board, { opacity: 0, y: 34, scale: 0.965 });
    gsap.set(sections, { opacity: 0, y: 10 });
    gsap.set(rows, { opacity: 0, y: -6 });
    gsap.set(stamp, { opacity: 0, scale: 2.2, rotation: -16, transformOrigin: '50% 50%' });
    gsap.set(legend, { opacity: 0, y: 22 });
    if (hint) gsap.set(hint, { opacity: 0 });
    if (underline) gsap.set(underline, { drawSVG: '0%' });

    /* restart-safe zeroing of the money cells */
    KEYS.forEach(function (k) { if (qEls[k]) tl.set(qEls[k], { textContent: '$0.00' }, 0); });
    if (marginEl) tl.set(marginEl, { textContent: '0.0% · $0.00' }, 0);
    tl.call(function () { input.value = ''; }, null, 0);

    /* 1) the screen turns on */
    if (underline) tl.to(underline, { drawSVG: '100%', duration: 0.5, ease: 'power2.inOut' }, 0.2);
    tl.to(board, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out' }, 0.05);

    /* 2) the builder installs piece by piece */
    sections.forEach(function (el, i) {
      tl.to(el, { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)' }, 0.55 + i * 0.11);
    });

    /* 3) lay the lines; the ledger climbs after each one */
    var t = 1.55;
    var prev = { mat: 0, labor: 0, sub: 0, tax: 0, grand: 0, band: 0, stax: 0, ssub: 0 };
    rows.forEach(function (row, i) {
      if (i === 0) {
        var o = { n: 0 };
        tl.to(o, {
          n: TYPE_NAME.length, duration: TYPE_NAME.length * 0.03, ease: 'none',
          onUpdate: function () { input.value = TYPE_NAME.slice(0, Math.round(o.n)); }
        }, t);
        t += TYPE_NAME.length * 0.03 + 0.2;
        tl.call(function () { input.value = ''; }, null, t - 0.02);
      }
      tl.to(row, { opacity: 1, y: 0, duration: 0.35, ease: 'back.out(1.7)' }, t);
      var step = STEPS[i];
      KEYS.forEach(function (k, j) {
        if (qEls[k]) tl.add(countMoney(qEls[k], prev[k], step[k], 0.45), t + 0.06 + j * 0.02);
      });
      prev = step;
      t += 0.74;
    });

    /* 4) margin lands */
    if (marginEl) {
      tl.set(marginEl, { textContent: FINAL_MARGIN }, t);
      tl.fromTo(marginEl, { opacity: 0 }, { opacity: 1, duration: 0.35 }, t);
    }

    /* 5) APPROVED slams; the window feels it; the modules light up */
    tl.to(stamp, { opacity: 1, scale: 1, rotation: -7, duration: 0.28, ease: 'power4.in' }, t + 0.55)
      .to(board, { x: 3, duration: 0.05, repeat: 3, yoyo: true, ease: 'none' }, t + 0.83)
      .set(board, { x: 0 }, t + 1.05);
    tl.to(legend, { opacity: 1, y: 0, duration: 0.55, stagger: 0.07, ease: 'back.out(1.6)' }, t + 0.9);
    if (hint) tl.to(hint, { opacity: 1, duration: 0.4 }, t + 1.5);

    return tl;
  }

  var tl = build();
  window.__flHero = { tl: tl };

  /* the lean flattens as you scroll (desktop only — CSS drops it under 1120px) */
  if (typeof ScrollTrigger !== 'undefined') {
    var mm = gsap.matchMedia();
    mm.add('(min-width: 1121px)', function () {
      gsap.to(board, {
        rotateY: 0, rotateX: 0, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 45%', scrub: 0.6 }
      });
    });
  }

  /* deterministic frame for headless verification: ?tkt=end or ?tkt=<seconds> */
  var tkt = new URLSearchParams(window.location.search).get('tkt');
  if (tkt === 'end') { tl.progress(1); }
  else if (tkt) { tl.pause(parseFloat(tkt) || 0); }

  /* replay on click / keyboard — progressive enhancement only */
  board.setAttribute('role', 'button');
  board.setAttribute('tabindex', '0');
  board.setAttribute('aria-label', 'Replay the quote-builder animation');
  function replay() { if (!tl.isActive()) tl.restart(); }
  board.addEventListener('click', replay);
  board.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); replay(); }
  });
})();
