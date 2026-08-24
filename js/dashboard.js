/* FloorLogic homepage — live Lead Pipeline mockup (section #live).
   A faithful animated recreation of the real app's pipeline view. Motion comes
   from the vendored anime.js v4 (js/vendor/anime.umd.min.js); every lead is
   invented. Without JS, or under prefers-reduced-motion, the board renders
   complete and static — the full kanban lives in the HTML. */
(function () {
  'use strict';

  var dash = document.getElementById('dash');
  if (!dash || typeof anime === 'undefined') return;

  var animate = anime.animate;
  var stagger = anime.stagger;
  var createSpring = anime.createSpring;
  var utils = anime.utils;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var STAGES = ['new', 'survey', 'quote', 'follow', 'approved'];
  var PILL_TEXT = { quote: '→ Follow-up', follow: 'Approved', approved: '→ Won' };
  var board = document.getElementById('fl-board');
  var list = document.getElementById('fl-list');

  function colBody(stage) { return board.querySelector('.fl-col[data-stage="' + stage + '"] .fl-colbody'); }
  function cardsIn(stage) { return [].slice.call(colBody(stage).querySelectorAll('.fl-card')); }
  function allCards() { return [].slice.call(board.querySelectorAll('.fl-card')); }
  function stageOf(card) { return card.closest('.fl-col').getAttribute('data-stage'); }

  /* ---------- counts (column chips, tabs, active-leads stat) ---------- */

  function bump(el) {
    if (!reduced) animate(el, { scale: [1.3, 1], duration: 450, ease: 'outBack(2)' });
  }

  function updateCounts() {
    STAGES.forEach(function (stage) {
      var chip = board.querySelector('.fl-col[data-stage="' + stage + '"] [data-colcount]');
      var n = String(cardsIn(stage).length);
      if (chip.textContent !== n) { chip.textContent = n; bump(chip); }
    });
    var total = String(allCards().length);
    [].forEach.call(dash.querySelectorAll('[data-count]'), function (el) {
      if (el.textContent !== total) el.textContent = total;
    });
    var active = dash.querySelector('[data-stat="active"]');
    if (active.textContent !== total) { active.textContent = total; bump(active); }
  }

  /* ---------- list view (mirror of the board; built here, hidden without JS) ---------- */

  var STAGE_LABEL = { new: 'New', survey: 'Site survey', quote: 'Send quote', follow: 'Follow-up', approved: 'Approved' };

  function listRowFor(card) {
    var row = document.createElement('div');
    row.className = 'fl-listrow';
    row.setAttribute('data-lead', card.getAttribute('data-lead'));
    var stage = stageOf(card);
    row.innerHTML =
      '<b>' + card.querySelector('.fl-card__top b').innerHTML + '</b>' +
      '<span class="fl-stagepill" data-stage="' + stage + '">' + STAGE_LABEL[stage] + '</span>' +
      '<span class="fl-line"><svg width="11" height="11" class="fl-ico"><use href="#i-phone"/></svg>' +
        card.querySelector('.fl-line').textContent.trim() + '</span>' +
      '<span class="fl-age">' + card.querySelector('.fl-age').textContent + '</span>';
    return row;
  }

  function syncListRow(card) {
    var row = list.querySelector('[data-lead="' + card.getAttribute('data-lead') + '"]');
    if (!row) return;
    var pill = row.querySelector('.fl-stagepill');
    var stage = stageOf(card);
    pill.setAttribute('data-stage', stage);
    pill.textContent = STAGE_LABEL[stage];
    bump(pill);
  }

  allCards().forEach(function (card) { list.appendChild(listRowFor(card)); });

  /* ---------- moving a card between stages (FLIP + spring) ---------- */

  function moveCard(card, toStage) {
    var first = card.getBoundingClientRect();
    colBody(toStage).appendChild(card);
    var last = card.getBoundingClientRect();
    var pill = card.querySelector('[data-pill]');
    if (PILL_TEXT[toStage]) pill.textContent = PILL_TEXT[toStage];
    if (reduced) { updateCounts(); syncListRow(card); return; }
    card.style.position = 'relative';
    card.style.zIndex = 5;
    utils.set(card, { translateX: first.left - last.left, translateY: first.top - last.top });
    animate(card, {
      translateX: 0, translateY: 0,
      ease: createSpring({ stiffness: 170, damping: 21 }),
      onComplete: function () { card.style.zIndex = ''; card.style.position = ''; }
    });
    animate(card, { scale: [1.04, 1], duration: 450, ease: 'outQuad' });
    updateCounts();
    syncListRow(card);
  }

  /* ---------- graduating approved work + spawning fresh leads ---------- */

  var POOL = [
    { name: 'Summit Peak Dental', phone: '(775) 555-0341', addr: '1200 S Virginia St, Reno, NV 89502' },
    { name: 'Alvarez Residence', phone: '(775) 555-0352', addr: '88 Bartley Ranch Rd, Reno, NV 89511' },
    { name: 'Torreon Grill Remodel', phone: '(775) 555-0363', addr: '510 Riverside Dr, Reno, NV 89503' },
    { name: 'Meadowlark HOA', phone: '(775) 555-0374', addr: '6300 Meadowlark Ln, Sparks, NV 89436' },
    { name: 'Crestline Office Park', phone: '(775) 555-0385', addr: '9410 Prototype Dr, Reno, NV 89521' }
  ];
  var poolAt = 0, leadSeq = 9;

  function buildCard(lead) {
    leadSeq += 1;
    var el = document.createElement('article');
    el.className = 'fl-card';
    el.setAttribute('data-lead', 'l' + leadSeq);
    el.setAttribute('data-name', lead.name);
    el.innerHTML =
      '<div class="fl-card__top"><span class="fl-dot"></span><b>' + lead.name + '</b><span class="fl-age">0d</span></div>' +
      '<div class="fl-line"><svg width="11" height="11" class="fl-ico"><use href="#i-phone"/></svg>' + lead.phone + '</div>' +
      '<div class="fl-line"><svg width="11" height="11" class="fl-ico"><use href="#i-pin"/></svg>' + lead.addr + '</div>' +
      '<div class="fl-line"><svg width="11" height="11" class="fl-ico"><use href="#i-user"/></svg>Marisol Vega</div>' +
      '<div class="fl-card__act fl-card__act--date"><span class="fl-date"><svg width="11" height="11" class="fl-ico"><use href="#i-cal"/></svg>mm/dd/yyyy</span><span class="fl-iconbtn fl-iconbtn--chat"><svg width="12" height="12" class="fl-ico"><use href="#i-chat"/></svg></span><span class="fl-iconbtn"><svg width="12" height="12" class="fl-ico"><use href="#i-eye"/></svg></span></div>' +
      '<div class="fl-card__act fl-card__act--pill"><span class="fl-actpill" data-pill>→ Follow-up</span><span class="fl-iconbtn fl-iconbtn--chat"><svg width="12" height="12" class="fl-ico"><use href="#i-chat"/></svg></span><span class="fl-iconbtn"><svg width="12" height="12" class="fl-ico"><use href="#i-eye"/></svg></span></div>';
    return el;
  }

  function spawnLead() {
    if (allCards().length >= 11) graduate(); // keep the board from overcrowding
    var lead, tries = 0; // never re-issue a name that is still on the board
    do { lead = POOL[poolAt % POOL.length]; poolAt += 1; tries += 1; }
    while (tries < POOL.length && allCards().some(function (c) { return c.getAttribute('data-name') === lead.name; }));
    var card = buildCard(lead);
    var body = colBody('new');
    body.insertBefore(card, body.firstChild);
    list.appendChild(listRowFor(card));
    if (!reduced) animate(card, { opacity: [0, 1], scale: [0.92, 1], translateY: [-10, 0], duration: 550, ease: 'outBack(1.4)' });
    updateCounts();
  }

  function graduate() {
    var done = cardsIn('approved');
    if (!done.length) return;
    var card = done[0];
    var row = list.querySelector('[data-lead="' + card.getAttribute('data-lead') + '"]');
    function gone() { card.remove(); if (row) row.remove(); updateCounts(); }
    if (reduced) return gone();
    animate(card, { opacity: 0, scale: 0.92, translateY: -8, duration: 420, ease: 'outQuad', onComplete: gone });
  }

  document.getElementById('fl-newlead').addEventListener('click', spawnLead);

  /* ---------- the auto-cycle: the pipeline works itself ---------- */

  function beginCycle() {
    setInterval(function () {
      var eligible = STAGES.slice(0, 4).filter(function (s) { return cardsIn(s).length > 0; });
      if (eligible.length) {
        var stage = eligible[Math.floor(Math.random() * eligible.length)];
        var card = cardsIn(stage)[0];
        moveCard(card, STAGES[STAGES.indexOf(stage) + 1]);
      }
      if (cardsIn('approved').length >= 3) {
        graduate();  // approved work becomes a job and leaves the board…
        spawnLead(); // …and a fresh lead arrives to take its place
      }
    }, 3000);
  }

  /* ---------- view tabs: Pipeline <-> List ---------- */

  var tabs = [].slice.call(dash.querySelectorAll('.fl-tab'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (tab.classList.contains('is-on')) return;
      tabs.forEach(function (t) { t.classList.toggle('is-on', t === tab); });
      var toList = tab.getAttribute('data-view') === 'list';
      function swap() {
        board.classList.toggle('is-off', toList);
        list.classList.toggle('is-on', toList);
        if (reduced) return;
        var incoming = toList ? list.querySelectorAll('.fl-listrow') : board.querySelectorAll('.fl-col');
        animate(incoming, { opacity: [0, 1], translateY: [10, 0], delay: stagger(40), duration: 380, ease: 'outCubic' });
      }
      if (reduced) return swap();
      animate(toList ? board : list, { opacity: [1, 0], duration: 180, ease: 'outQuad', onComplete: function () {
        utils.set([board, list], { opacity: 1 });
        swap();
      } });
    });
  });

  /* ---------- search (filters both views) ---------- */

  document.getElementById('fl-search').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase();
    allCards().forEach(function (card) {
      card.style.display = !q || card.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    });
    [].forEach.call(list.querySelectorAll('.fl-listrow'), function (row) {
      row.style.display = !q || row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    });
  });

  /* ---------- notifications: Clear All (they come back — it is a live shop) ---------- */

  var notif = document.getElementById('fl-notif');
  var bellBadge = dash.querySelector('[data-bell]');
  document.getElementById('fl-clear').addEventListener('click', function () {
    bellBadge.textContent = '0';
    if (reduced) { notif.style.display = 'none'; }
    else animate(notif, { height: 0, opacity: 0, duration: 380, ease: 'outQuad' });
    setTimeout(function () {
      bellBadge.textContent = '2';
      bump(bellBadge);
      if (reduced) { notif.style.display = ''; }
      else animate(notif, { height: notif.scrollHeight, opacity: 1, duration: 450, ease: 'outCubic',
        onComplete: function () { notif.style.height = ''; } });
    }, 12000);
  });

  /* ---------- entrance: stats count up, columns settle in ---------- */

  var STAT_SPECS = [
    { key: 'active', to: 9, fmt: function (v) { return String(Math.round(v)); } },
    { key: 'overdue', to: 0, fmt: function (v) { return String(Math.round(v)); } },
    { key: 'age', to: 2, fmt: function (v) { return Math.round(v) + 'd'; } },
    { key: 'win', to: 50, fmt: function (v) { return Math.round(v) + '%'; } }
  ];

  function playEntrance() {
    STAT_SPECS.forEach(function (s, i) {
      var el = dash.querySelector('[data-stat="' + s.key + '"]');
      var obj = { v: 0 };
      animate(obj, {
        v: s.to, duration: 1100, delay: 110 * i, ease: 'outExpo',
        onUpdate: function () { el.textContent = s.fmt(obj.v); },
        onComplete: function () { el.textContent = s.fmt(s.to); updateCounts(); }
      });
    });
    animate('.fl-col', { opacity: [0, 1], translateY: [14, 0], delay: stagger(90), duration: 600, ease: 'outCubic' });
  }

  if (reduced || !('IntersectionObserver' in window)) {
    // the HTML already shows the complete, final board; filters/tabs work instantly
    return;
  }

  utils.set('.fl-col', { opacity: 0 });
  var started = false;
  new IntersectionObserver(function (entries, io) {
    if (!entries[0].isIntersecting || started) return;
    started = true;
    io.disconnect();
    playEntrance();
    beginCycle();
  }, { rootMargin: '0px 0px -15% 0px' }).observe(dash);
})();
