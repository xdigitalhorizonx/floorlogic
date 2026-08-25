/* FloorLogic v4 — THE INSTALL, film wiring.
   The 3D engine (js/vendor/install3d.js) owns the room; this file owns the
   scrub: a master ScrollTrigger maps the film region's scroll progress onto
   the engine, the quote builder fills itself as its act scrolls, the outcome
   cards sweep in, and stamps land. Runs only when the engine is up (it adds
   .film-3d to <html> on its first rendered frame). Without the engine —
   reduced motion, small screens, no WebGL, no JS — the page is a complete
   static site and this file does nothing. ?filmp=0..1 freezes the film for
   headless verification. */
(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  gsap.registerPlugin(ScrollTrigger);

  function init() {
    var eng = window.__flInstall;
    var film = document.getElementById('film');
    if (!eng || !film) return;

    ScrollTrigger.refresh(); // act heights changed when .film-3d landed

    /* master scrub: page scroll IS the film */
    ScrollTrigger.create({
      trigger: film, start: 'top top', end: 'bottom bottom',
      onUpdate: function (self) { eng.setProgress(self.progress); }
    });

    /* scroll cue dies after the first meaningful scroll */
    var cue = document.querySelector('.scrollcue');
    if (cue) {
      ScrollTrigger.create({
        trigger: film, start: '2% top',
        onEnter: function () { gsap.to(cue, { opacity: 0, duration: 0.4 }); },
        onLeaveBack: function () { gsap.to(cue, { opacity: 1, duration: 0.4 }); }
      });
    }

    /* act captions drift up as they pass */
    gsap.utils.toArray('.cap__box').forEach(function (box) {
      gsap.fromTo(box, { opacity: 0, y: 46 }, {
        opacity: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: box, start: 'top 88%', end: 'top 55%', scrub: 0.4 }
      });
      gsap.to(box, {
        opacity: 0, y: -36, ease: 'none',
        scrollTrigger: { trigger: box, start: 'bottom 38%', end: 'bottom 12%', scrub: 0.4 }
      });
    });

    /* ---- act: the quote fills itself, scrubbed ---- */
    var quote = document.getElementById('quote');
    var qwin = quote && quote.querySelector('.qwin');
    if (qwin) {
      var rows = gsap.utils.toArray('.qb-row', qwin);
      var input = qwin.querySelector('#qb-add');
      var stamp = document.getElementById('quote-stamp');
      var KEYS = ['mat', 'labor', 'sub', 'tax', 'grand', 'band', 'stax', 'ssub'];
      var qEls = {};
      KEYS.forEach(function (k) { qEls[k] = qwin.querySelector('[data-qt="' + k + '"]'); });
      var marginEl = qwin.querySelector('[data-qt="margin"]');
      var FINAL_MARGIN = marginEl ? marginEl.textContent : '';
      var TAX = 0.08265;
      var STEPS = [
        { mat: 2489.60, labor: 0 },
        { mat: 2489.60, labor: 480.00 },
        { mat: 2489.60, labor: 1920.00 }
      ].map(function (s) {
        var sub = s.mat + s.labor, tax = s.mat * TAX;
        return { mat: s.mat, labor: s.labor, sub: sub, tax: tax, grand: sub + tax, band: sub + tax, stax: tax, ssub: sub };
      });
      var TYPE_NAME = 'LVP — Great Basin';
      function money(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

      var qtl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: quote, start: 'top 55%', end: 'bottom 92%', scrub: 0.45 }
      });
      qtl.fromTo(qwin, { opacity: 0, y: 90, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power1.out' }, 0);
      KEYS.forEach(function (k) { if (qEls[k]) qtl.set(qEls[k], { textContent: '$0.00' }, 0); });
      if (marginEl) qtl.set(marginEl, { textContent: '—' }, 0);

      var t = 0.9;
      var prev = { mat: 0, labor: 0, sub: 0, tax: 0, grand: 0, band: 0, stax: 0, ssub: 0 };
      rows.forEach(function (row, i) {
        if (i === 0 && input) {
          var o = { n: 0 };
          qtl.to(o, {
            n: TYPE_NAME.length, duration: 0.5,
            onUpdate: function () { input.value = TYPE_NAME.slice(0, Math.round(o.n)); }
          }, t);
          t += 0.55;
          qtl.set(input, { value: '' }, t - 0.02);
        }
        qtl.fromTo(row, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power1.out' }, t);
        var step = STEPS[i];
        KEYS.forEach(function (k, j) {
          if (!qEls[k]) return;
          var obj = { v: prev[k] };
          qtl.to(obj, {
            v: step[k], duration: 0.4,
            onUpdate: (function (el, ob) { return function () { el.textContent = money(ob.v); }; })(qEls[k], obj)
          }, t + 0.05 + j * 0.01);
        });
        prev = step;
        t += 0.6;
      });
      if (marginEl) {
        qtl.set(marginEl, { textContent: FINAL_MARGIN }, t);
        qtl.fromTo(marginEl, { opacity: 0 }, { opacity: 1, duration: 0.2 }, t);
      }
      if (stamp) {
        qtl.fromTo(stamp, { opacity: 0, scale: 2.3, rotation: -16 },
          { opacity: 1, scale: 1, rotation: -7, duration: 0.3, ease: 'power2.in' }, t + 0.25);
      }
    }

    /* ---- act: the ripple — outcome cards sweep in ---- */
    gsap.utils.toArray('.ripple-card').forEach(function (card, i) {
      gsap.fromTo(card, { opacity: 0, y: 80, scale: 0.95 }, {
        opacity: 1, y: 0, scale: 1, ease: 'power1.out',
        scrollTrigger: { trigger: card, start: 'top 92%', end: 'top 55%', scrub: 0.4 }
      });
      var s = card.querySelector('.stamp, .margin-badge');
      if (s) {
        gsap.fromTo(s, { opacity: 0, scale: 2, rotation: i === 2 ? 12 : -14 }, {
          opacity: 1, scale: 1, rotation: i === 2 ? 4 : -7, ease: 'power2.in',
          scrollTrigger: { trigger: card, start: 'top 62%', end: 'top 45%', scrub: 0.4 }
        });
      }
    });

    /* ---- act: landing text ---- */
    var land = document.querySelector('.act--land .act__center');
    if (land) {
      gsap.fromTo(land, { opacity: 0, y: 60 }, {
        opacity: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: '.act--land', start: 'top 75%', end: 'top 35%', scrub: 0.4 }
      });
    }

    /* deterministic film position for headless verification: ?filmp=0..1 */
    var q = new URLSearchParams(location.search).get('filmp');
    if (q !== null) {
      var p = Math.max(0, Math.min(1, parseFloat(q) || 0));
      ScrollTrigger.getAll().forEach(function (st) { st.disable(false, false); });
      eng.setProgress(p);
    }

    window.__flFilm = { ready: true };
  }

  if (window.__flInstall && document.documentElement.classList.contains('film-3d')) init();
  else addEventListener('fl:film-ready', init, { once: true });
})();
