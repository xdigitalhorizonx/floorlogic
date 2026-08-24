/* FloorLogic homepage — live dashboard mockup (section #live).
   Motion comes from the vendored anime.js v4 (js/vendor/anime.umd.min.js);
   every number is invented. Without JS, or under prefers-reduced-motion,
   the section renders complete and static — final values live in the HTML. */
(function () {
  'use strict';

  var dash = document.getElementById('dash');
  if (!dash || typeof anime === 'undefined') return;

  var animate = anime.animate;
  var stagger = anime.stagger;
  var createSpring = anime.createSpring;
  var utils = anime.utils;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- data (matches the static HTML) ---------- */

  var KPIS = [
    { key: 'revenue', to: 128400, fmt: function (v) { return '$' + Math.round(v).toLocaleString('en-US'); } },
    { key: 'jobs',    to: 14,     fmt: function (v) { return String(Math.round(v)); } },
    { key: 'quotes',  to: 9,      fmt: function (v) { return String(Math.round(v)); } },
    { key: 'margin',  to: 38.2,   fmt: function (v) { return v.toFixed(1) + '%'; } }
  ];

  var ORDER = ['Scheduled', 'In Progress', 'Complete'];
  var PILL_CLASS = { 'Scheduled': 'pill--quoted', 'In Progress': 'pill--sold', 'Complete': 'pill--complete' };
  var PILL_LABEL = { 'Scheduled': 'Scheduled', 'In Progress': 'In progress', 'Complete': 'Complete' };

  var rows = [].slice.call(dash.querySelectorAll('.dash__row'));
  var initialStatuses = rows.map(function (r) { return r.getAttribute('data-status'); });
  var ROW_H = 58;
  var currentFilter = 'All';

  /* ---------- status pills ---------- */

  function setStatus(row, status, pop) {
    row.setAttribute('data-status', status);
    var pill = row.querySelector('.pill');
    pill.className = 'pill ' + PILL_CLASS[status];
    pill.querySelector('span').textContent = PILL_LABEL[status];
    if (pop && !reduced) {
      animate(pill, { scale: [1.3, 1], ease: createSpring({ stiffness: 260, damping: 13 }) });
    }
    // a row whose status no longer matches the active filter slides away
    if (currentFilter !== 'All') { applyVisibility(row); updateEmpty(); }
  }

  /* ---------- filtering ---------- */

  function applyVisibility(row) {
    var show = currentFilter === 'All' || row.getAttribute('data-status') === currentFilter;
    var shown = row.offsetHeight > 0;
    if (show === shown) return;
    if (reduced) {
      utils.set(row, { height: show ? 'auto' : 0, opacity: show ? 1 : 0 });
      return;
    }
    utils.remove(row); // interrupt any in-flight tween on this row
    if (show) {
      animate(row, { height: [0, ROW_H], opacity: [0, 1], duration: 420, ease: 'outCubic' });
    } else {
      animate(row, { height: 0, opacity: 0, duration: 320, ease: 'outQuad' });
    }
  }

  var empty = dash.querySelector('.dash__empty');
  function updateEmpty() {
    var any = rows.some(function (r) {
      return currentFilter === 'All' || r.getAttribute('data-status') === currentFilter;
    });
    empty.hidden = any;
  }

  var tabs = [].slice.call(dash.querySelectorAll('.dash__tab'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.toggle('is-on', t === tab); });
      currentFilter = tab.getAttribute('data-filter');
      rows.forEach(applyVisibility);
      updateEmpty();
    });
  });

  /* ---------- the auto-cycle: a rotating pipeline ----------
     One job advances each tick; once enough are Complete, the oldest completed
     job flips back to Scheduled — new work arriving, so every status filter
     stays populated the way a real board would. */

  function statusRows(status) {
    return rows.filter(function (r) { return r.getAttribute('data-status') === status; });
  }

  function beginCycle() {
    setInterval(function () {
      var active = rows.filter(function (r) { return r.getAttribute('data-status') !== 'Complete'; });
      if (active.length) {
        var target = active[0];
        setStatus(target, ORDER[ORDER.indexOf(target.getAttribute('data-status')) + 1], true);
      }
      var done = statusRows('Complete');
      if (done.length >= 3) setStatus(done[0], 'Scheduled', true);
      updateEmpty();
    }, 2600);
  }

  /* ---------- entrance (played once, when the board scrolls into view) ---------- */

  function playEntrance() {
    KPIS.forEach(function (k, i) {
      var el = dash.querySelector('[data-kpi="' + k.key + '"]');
      var obj = { v: 0 };
      animate(obj, {
        v: k.to, duration: 1400, delay: 130 * i, ease: 'outExpo',
        onUpdate: function () { el.textContent = k.fmt(obj.v); },
        onComplete: function () { el.textContent = k.fmt(k.to); }
      });
    });
    animate(rows, {
      opacity: [0, 1], translateY: [16, 0],
      delay: stagger(70, { start: 250 }), duration: 550, ease: 'outCubic'
    });
  }

  if (reduced || !('IntersectionObserver' in window)) {
    // static final state is already in the HTML; no cycle, filters swap instantly
    return;
  }

  utils.set(rows, { opacity: 0 }); // hidden only when we KNOW the entrance will run
  var started = false;
  new IntersectionObserver(function (entries, io) {
    if (!entries[0].isIntersecting || started) return;
    started = true;
    io.disconnect();
    playEntrance();
    beginCycle();
  }, { rootMargin: '0px 0px -15% 0px' }).observe(dash);
})();
