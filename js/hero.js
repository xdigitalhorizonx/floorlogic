/* FloorLogic v2 hero — the quote builds itself, construction-style.
   The hero board holds a faithful recreation of the app's New Quote screen
   (ported verbatim from the shipped full-page mockup). GSAP + DrawSVG run
   the build choreography: a blueprint frame and corner registration marks
   are drawn first, the builder installs piece by piece, line items type
   themselves in like courses being laid while every total climbs (the
   builder's real math — 8.265% tax on materials), the scaffolding fades,
   APPROVED slams, and the seven legend chips rise. The window is authored
   at its finished state, so with reduced motion or no JS it simply sits
   complete. Click / Enter on the board replays. */
(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof DrawSVGPlugin === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var board = document.getElementById('board');
  if (!board) return;

  gsap.registerPlugin(DrawSVGPlugin);

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var frame = document.getElementById('qg-frame');
  var marks = $$('.qbw__mark', board);
  var sections = ['.qb-title', '.qb-cohead', '.qb-parties', '.qb-lines', '.qb-addsection', '.qb-bottom', '.qb-side']
    .map(function (sel) { return $(sel, board); }).filter(Boolean);
  var rows = $$('.qb-row', board);
  var input = document.getElementById('qb-add');
  var stamp = document.getElementById('tally-stamp');
  var legend = $$('#legend li');
  var hint = $('.board__hint', board);
  var underline = document.getElementById('hero-underline');
  if (!frame || !rows.length || !input || !stamp) return;

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
    gsap.set(frame, { drawSVG: '0%' });
    gsap.set(marks, { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' });
    gsap.set(sections, { opacity: 0, y: 8 });
    gsap.set(rows, { opacity: 0, y: -6 });
    gsap.set(stamp, { opacity: 0, scale: 2.2, rotation: -16, transformOrigin: '50% 50%' });
    gsap.set(legend, { opacity: 0, y: 26 });
    if (hint) gsap.set(hint, { opacity: 0 });
    if (underline) gsap.set(underline, { drawSVG: '0%' });

    /* restart-safe zeroing of the money cells */
    tl.set(frame, { opacity: 1 }, 0);
    KEYS.forEach(function (k) { if (qEls[k]) tl.set(qEls[k], { textContent: '$0.00' }, 0); });
    if (marginEl) tl.set(marginEl, { textContent: '0.0% · $0.00' }, 0);
    tl.call(function () { input.value = ''; }, null, 0);

    /* 1) blueprint pass — the frame is drawn before anything is built */
    if (underline) tl.to(underline, { drawSVG: '100%', duration: 0.5, ease: 'power2.inOut' }, 0.15);
    tl.to(frame, { drawSVG: '100%', duration: 0.8, ease: 'power2.inOut' }, 0.05)
      .to(marks, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', stagger: 0.12 }, 0.7);

    /* 2) install the builder piece by piece */
    sections.forEach(function (el, i) {
      tl.to(el, { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.5)' }, 1.0 + i * 0.13);
    });

    /* 3) lay the lines like courses; the ledger climbs after each one */
    var t = 2.15;
    var prev = { mat: 0, labor: 0, sub: 0, tax: 0, grand: 0, band: 0, stax: 0, ssub: 0 };
    rows.forEach(function (row, i) {
      if (i === 0) {
        /* line 1 types itself into the add-row, exactly like the real builder */
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
      t += 0.78;
    });

    /* 4) margin lands */
    if (marginEl) {
      tl.set(marginEl, { textContent: FINAL_MARGIN }, t);
      tl.fromTo(marginEl, { opacity: 0 }, { opacity: 1, duration: 0.35 }, t);
    }

    /* 5) scaffolding down */
    tl.to([frame].concat(marks), { opacity: 0, duration: 0.4 }, t + 0.4);

    /* 6) APPROVED slams; the window feels it; the modules stand up */
    tl.to(stamp, { opacity: 1, scale: 1, rotation: -7, duration: 0.28, ease: 'power4.in' }, t + 0.75)
      .to(board, { x: 3, duration: 0.05, repeat: 3, yoyo: true, ease: 'none' }, t + 1.03)
      .set(board, { x: 0 }, t + 1.25);
    tl.to(legend, { opacity: 1, y: 0, duration: 0.55, stagger: 0.07, ease: 'back.out(1.6)' }, t + 1.1);
    if (hint) tl.to(hint, { opacity: 1, duration: 0.4 }, t + 1.7);

    return tl;
  }

  var tl = build();
  window.__flHero = { tl: tl };

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
