/* FloorLogic v2 hero — the takeoff draws itself.
   GSAP + DrawSVG animate the SVG plan (#takeoff): walls draw, dimensions
   annotate, plank/tile hatching lays room by room with a blaze "current
   course" sweep, the tally counts up, the APPROVED stamp slams, and the
   seven legend chips rise. The SVG is authored at its finished state, so
   with reduced motion or no JS the board simply sits complete. Click or
   press Enter on the board to replay. */
(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof DrawSVGPlugin === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var svg = document.getElementById('takeoff');
  var board = document.getElementById('board');
  if (!svg || !board) return;

  gsap.registerPlugin(DrawSVGPlugin);

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var walls = $$('.tk-wall', svg);
  var wins = $$('#tk-wins > *', svg);
  var doors = $$('#tk-doors path', svg);
  var dimlines = $$('.tk-dimline', svg);
  var arrows = $$('.tk-arrow', svg);
  var dimtext = $('#tk-dimtext', svg);
  var labels = $$('.tk-label', svg);
  var title = $('#tk-title', svg);
  var marks = $('#tk-marks', svg);
  var sqftEl = $('#tk-sqft', svg);
  var underline = document.getElementById('hero-underline');
  var tally = document.getElementById('tally');
  var tallyRows = $$('.tally__row', tally);
  var stamp = document.getElementById('tally-stamp');
  var legend = $$('#legend li');
  var hint = $('.board__hint', board);

  /* room fills lay top-to-bottom via clip-path; the blaze course line sweeps
     down in sync — the drafting-table version of planks being laid. */
  var rooms = [
    { fill: $('#tk-fill-great', svg),   course: $('#tk-course-great', svg), y0: 97,  y1: 353, dur: 0.9  },
    { fill: $('#tk-fill-kitchen', svg), course: null,                       y0: 97,  y1: 353, dur: 0.55 },
    { fill: $('#tk-fill-bed1', svg),    course: $('#tk-course-bed1', svg),  y0: 367, y1: 603, dur: 0.7  },
    { fill: $('#tk-fill-bed2', svg),    course: $('#tk-course-bed2', svg),  y0: 367, y1: 603, dur: 0.7  },
    { fill: $('#tk-fill-bath', svg),    course: null,                       y0: 367, y1: 603, dur: 0.5  }
  ];

  /* counters: the markup holds the real final value — parse it, count to it */
  function counter(el, dur) {
    var raw = el.textContent.replace(/,/g, '');
    var target = parseFloat(raw);
    var dec = raw.indexOf('.') > -1 ? 2 : 0;
    if (isNaN(target)) return gsap.to({}, { duration: 0.01 });
    var obj = { v: 0 };
    return gsap.to(obj, {
      v: target, duration: dur, ease: 'power2.out',
      onUpdate: function () {
        el.textContent = obj.v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      }
    });
  }

  function build() {
    var tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    /* initial states (JS-only, so no-JS never sees them) */
    gsap.set(walls, { drawSVG: '0%' });
    gsap.set(doors, { drawSVG: '0%', opacity: 0 });
    gsap.set(wins, { opacity: 0 });
    gsap.set(dimlines, { drawSVG: '0%' });
    gsap.set(arrows, { opacity: 0 });
    gsap.set([dimtext, title, marks], { opacity: 0 });
    gsap.set(labels, { opacity: 0, y: 6 });
    rooms.forEach(function (r) { gsap.set(r.fill, { clipPath: 'inset(0% 0% 100% 0%)' }); });
    gsap.set(tally, { opacity: 0, y: 10 });
    gsap.set(tallyRows, { opacity: 0, x: -8 });
    gsap.set(stamp, { opacity: 0, scale: 2.2, rotation: -16, transformOrigin: '50% 50%' });
    gsap.set(legend, { opacity: 0, y: 26 });
    if (hint) gsap.set(hint, { opacity: 0 });
    if (underline) gsap.set(underline, { drawSVG: '0%' });

    /* headline chalk underline */
    if (underline) tl.to(underline, { drawSVG: '100%', duration: 0.5, ease: 'power2.inOut' }, 0.15);

    /* walls, openings, dimensions */
    tl.to(walls[0], { drawSVG: '100%', duration: 0.9, ease: 'power2.inOut' }, 0.05)
      .to(walls.slice(1), { drawSVG: '100%', duration: 0.5, stagger: 0.08 }, 0.55)
      .to(wins, { opacity: 1, duration: 0.35 }, 0.95)
      .to(doors, { drawSVG: '100%', opacity: 1, duration: 0.4, stagger: 0.06 }, 1.0)
      .to(dimlines, { drawSVG: '100%', duration: 0.45, stagger: 0.05 }, 1.15)
      .to(arrows, { opacity: 1, duration: 0.2 }, 1.5)
      .to(dimtext, { opacity: 1, duration: 0.3 }, 1.55);

    /* lay the floors */
    var at = 1.6;
    rooms.forEach(function (r) {
      tl.to(r.fill, { clipPath: 'inset(0% 0% 0% 0%)', duration: r.dur, ease: 'power1.inOut' }, at);
      if (r.course) {
        tl.fromTo(r.course,
          { attr: { y1: r.y0, y2: r.y0 }, opacity: 1 },
          { attr: { y1: r.y1, y2: r.y1 }, duration: r.dur, ease: 'power1.inOut' }, at)
          .to(r.course, { opacity: 0, duration: 0.2 }, at + r.dur);
      }
      at += r.dur * 0.55;
    });

    /* labels, title block, square-footage count */
    tl.to(labels, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08 }, 2.3)
      .to([title, marks], { opacity: 1, duration: 0.4 }, 3.2);
    if (sqftEl) tl.add(counter(sqftEl, 0.9), 3.25);

    /* the tally builds */
    tl.to(tally, { opacity: 1, y: 0, duration: 0.35 }, 3.6)
      .to(tallyRows, { opacity: 1, x: 0, duration: 0.3, stagger: 0.07 }, 3.7);
    $$('[data-tally]', tally).forEach(function (el, i) {
      tl.add(counter(el, 0.55 + i * 0.05), 3.8 + i * 0.12);
    });

    /* APPROVED slams; the board feels it */
    tl.to(stamp, { opacity: 1, scale: 1, rotation: -8, duration: 0.28, ease: 'power4.in' }, 4.75)
      .to(board, { x: 3, duration: 0.05, repeat: 3, yoyo: true, ease: 'none' }, 5.03)
      .set(board, { x: 0 }, 5.25);

    /* the seven modules stand up on the finished floor */
    tl.to(legend, { opacity: 1, y: 0, duration: 0.55, stagger: 0.07, ease: 'back.out(1.6)' }, 5.1);
    if (hint) tl.to(hint, { opacity: 1, duration: 0.4 }, 5.8);

    return tl;
  }

  var tl = build();

  /* deterministic frame for headless verification: ?tkt=end or ?tkt=<seconds> */
  var tkt = new URLSearchParams(window.location.search).get('tkt');
  if (tkt === 'end') { tl.progress(1); }
  else if (tkt) { tl.pause(parseFloat(tkt) || 0); }

  /* replay on click / keyboard — progressive enhancement only */
  board.setAttribute('role', 'button');
  board.setAttribute('tabindex', '0');
  board.setAttribute('aria-label', 'Replay the takeoff drawing animation');
  function replay() { if (!tl.isActive()) tl.restart(); }
  board.addEventListener('click', replay);
  board.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); replay(); }
  });
})();
