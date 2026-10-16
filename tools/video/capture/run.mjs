// Film the CURRENT FloorLogic app (app-export/: demo origin/main index.html / q.html) offline,
// scene by scene, for the ~45 s site video. Story (README "The film"):
//   leads    Leads List View: a survey date typed in the New lead's side panel moves it to Site Survey Scheduled
//   mobile   the /mobile phone app's Today screen lists that survey
//   quote    QT-330: Pick One, job area 912 → whole cartons, carpet stairs, totals, Privacy Mode
//   approve  the customer picks Better + the stairs and approves on a phone (q.html)
//   convert  the office presses "Create WO & Invoice" → WO-330 + IN-330
//   wo       WO-330: Order Materials (every line) → Ready to Schedule → Schedule Install
//   pay      IN-330: Take Payment → Record Payment by check → Paid in Full
//   cost     Job Costing for WO-330
//
//   node capture/run.mjs [--scenes=leads,mobile,quote,...] [--dpr=2]   (scenes run in story order)
// Every click / tap / keystroke is a real input event in the real app. Between scenes, rows for
// things that happen OFF camera (link sent, deposit paid online, deliveries, the installer's
// bill) are written into the offline store from the dataset (fixture.story + capture/dataset.mjs),
// only while no app tab is open. Every still passes the camera checks (capture/lib.mjs).
// Output: capture/stills/*.png + capture/manifest.json (read by comp/timeline.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../harness/server.mjs';
import { launchIsolated } from '../harness/browser.mjs';
import { stubSource } from '../harness/stub-source.mjs';
import { makeRecorder, settle, boxOf, byText, mustText, click, type } from './lib.mjs';
import { loadStoryExtras } from './dataset.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const FIXTURE = path.resolve(args.fixture || path.join(HERE, '..', 'harness', 'fixture.json'));
process.env.FL_FIXTURE = FIXTURE;
const FX = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const XS = await loadStoryExtras();
const ALL = ['leads', 'mobile', 'quote', 'approve', 'convert', 'wo', 'pay', 'cost'];
const SCENES = String(args.scenes || ALL.join(',')).split(',');
const OUT = HERE;
fs.rmSync(path.join(OUT, 'stills'), { recursive: true, force: true });
const rec = makeRecorder(OUT);
const log = (...a) => console.log('[film]', ...a);
const PT = (iso, hm) => Date.parse(`${iso}T${hm}:00-07:00`);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAY = FX.story.days;
// 1920×1080 CSS (a plain 1080p monitor; narrower and the WO header's step button overlaps its
// title). Stills at 2× so every camera zoom up to 2.0 stays at or below the captured pixels.
const DESK = { width: 1920, height: 1080, dpr: +(args.dpr || 2) };
const PHONE = { width: 390, height: 797, dpr: 3, mobile: true };      // screen below a drawn status bar
const SURVEY_DATE = addDays(DAY.quoteDrafted, 2);                       // in the phone's "Surveys coming up" (≤ today + 2)

const failures = [];
const check = (name, ok, detail) => { log((ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' — ' + detail : '')); if (!ok) failures.push(name + (detail != null ? ' — ' + detail : '')); };
check('dataset matches the fixture', XS.seedId === FX.seedId && XS.installStart === FX.story.installDate, `${XS.seedId} / ${FX.seedId}; install ${XS.installStart} = ${FX.story.installDate}`);

const srv = await startServer({ log: (e) => { if (!/favicon/.test(e.path || '')) log('server', JSON.stringify(e)); } });
const isoLogPath = path.join(OUT, 'isolation.jsonl');
fs.writeFileSync(isoLogPath, '');
const iso = await launchIsolated({ port: srv.port, freezeAt: PT(DAY.quoteDrafted, '10:20'), logPath: isoLogPath, stubSource });

// ---------------------------------------------------------------- helpers --
let desk = null;
async function deskPage(clockMs) {
  if (!desk) desk = await iso.newPage({ ...DESK, clock: clockMs });
  else await iso.setClock(desk, clockMs);
  desk.removeAllListeners('dialog');
  desk.on('dialog', async (d) => { log('DIALOG', d.type(), JSON.stringify(d.message())); rec.note({ dialog: d.type(), message: d.message() }); await d.accept(); });
  return desk;
}
const db = (page, t) => page.evaluate((t) => window.__flStub.table(t), t);
const dbWrite = (page, t, rows) => page.evaluate((t, rows) => window.__flStub.write(t, rows), t, rows);
async function flush(page) { await page.evaluate(async () => { if (typeof _flushPendingSave === 'function') await _flushPendingSave(); }); await settle(page, 200); }
// Close the app in the desk tab (after saving) and open the bare store page. Off-camera writes
// only ever happen in this state, so no app tab holding older data can write over them.
async function park() {
  if (!desk) desk = await iso.newPage({ ...DESK });
  if (await desk.evaluate(() => typeof _flushPendingSave === 'function').catch(() => false)) await flush(desk);
  await desk.goto(`${iso.origin}/__harness/db.html`, { waitUntil: 'load' });
  await desk.waitForFunction(() => !!window.__flStub, { timeout: 10000 });
  return desk;
}
async function story(label, fn) { const p = await park(); await fn(p); log('story (off camera):', label); }
// Always a FULL page load (a hash-only change would keep the running app's memory and clock).
async function openApp(page, hash) {
  if (page === desk) await park();
  await page.goto(`${iso.origin}/index.html${hash ? '#' + hash : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof currentView !== 'undefined' && document.querySelector('#content') && document.querySelector('#content').children.length > 0, { timeout: 20000 });
  await page.waitForFunction(() => typeof _productCatalogState === 'undefined' || _productCatalogState === 'ready' || _productCatalogState === 'failed', { timeout: 20000 });
  await settle(page, 600);
}
async function toastText(page) { return page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).join(' | ')); }
// Park the real pointer where it hovers nothing (hover reveals Privacy-Mode blur, lifts cards).
async function parkPointer(page, x = 1300, y = 1060) { await page.mouse.move(x, y); await settle(page, 80); }

// Boxes (CSS px, viewport) of elements the camera should frame, recorded with each still.
async function focus(page, specs, doc = false) {
  await settle(page, 0);
  return page.evaluate((specs, doc) => {
    const out = {};
    const vis = (e) => !!(e && (e.offsetParent || getComputedStyle(e).position === 'fixed'));
    for (const [name, q] of Object.entries(specs)) {
      let el = null;
      if (q.sel) { const els = [...document.querySelectorAll(q.sel)].filter(vis); el = q.last ? els[els.length - 1] : els[q.nth || 0]; }
      if (q.text) {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
        const want = q.text.toLowerCase();
        while ((n = w.nextNode())) { const t = n.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); if ((q.exact ? t === want : t.includes(want)) && vis(n.parentElement) && (!q.within || n.parentElement.closest(q.within))) { el = n.parentElement; if (!q.last) break; } }
      }
      if (q.value) el = [...document.querySelectorAll('input')].find((i) => i.value === q.value && vis(i)) || null;
      // the smallest visible element whose text holds every string in q.contains
      if (q.contains) { const want = q.contains.map((x) => x.toLowerCase()); const root = q.within ? document.querySelector(q.within) : document.body; el = [...root.querySelectorAll('*')].filter((e) => vis(e) && (q.maxY == null || e.getBoundingClientRect().top < q.maxY) && want.every((w) => (e.innerText || '').toLowerCase().includes(w))).sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.width * ra.height - rb.width * rb.height; })[0] || null; }
      if (el && q.closest) el = el.closest(q.closest) || el;
      if (el) { const r = el.getBoundingClientRect(); out[name] = { x: r.x, y: r.y + (doc ? scrollY : 0), w: r.width, h: r.height }; }
    }
    return out;
  }, specs, doc);
}
async function contentTopOf(page, sel) { return page.evaluate((sel) => { const e = document.querySelector(sel); const c = document.getElementById('content'); if (!e || !c) return null; return e.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop; }, sel); }
// Content-pane offset of the first visible element whose own text (or input value) matches.
async function contentTopOfText(page, re) {
  return page.evaluate((src) => {
    const re = new RegExp(src); const c = document.getElementById('content');
    const at = (el) => el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop;
    const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (re.test(n.textContent.trim()) && n.parentElement.offsetParent) return at(n.parentElement);
    const i = [...c.querySelectorAll('input')].find((x) => re.test(x.value) && x.offsetParent);
    return i ? at(i) : null;
  }, re.source);
}
async function scrollContentTo(page, y) { await page.evaluate((y) => { document.getElementById('content').scrollTop = y; }, y); await settle(page, 150); }
// A real scroll of the app's content pane, filmed as a sequence of stills (eased), so the
// compositor plays it back as motion instead of a cut.
async function scrollSeq(page, to, n, name, opts = {}) {
  const from = await page.evaluate(() => document.getElementById('content').scrollTop);
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const files = [];
  for (let i = 1; i <= n; i++) {
    const y = Math.round(from + (to - from) * ease(i / n));
    await page.evaluate((y) => { document.getElementById('content').scrollTop = y; }, y);
    files.push(await rec.still(page, `${name}-${String(i).padStart(2, '0')}`, { seq: name, scrollTop: y }, opts));
  }
  const reached = await page.evaluate(() => document.getElementById('content').scrollTop);
  rec.note({ scrollSeq: name, from, to: reached, frames: files });
  return { files, reached };
}
// Chrome's date picker is never drawn headless: click the box (the app opens its picker),
// close it, then type. `keys` end with ArrowUp on the year segment, which fills the current
// year in ONE keystroke, so the app's onchange fires once with the finished date (typing the
// year digit by digit would hand it 0002, 0020, 0202 first).
async function typeDate(page, sel, iso, label, { name, stillEach = true, focusSpecs } = {}) {
  const [y, m, d] = iso.split('-');
  const h = await page.$(sel); if (!h) throw new Error('date box not found: ' + sel);
  const b = await boxOf(page, h);
  await click(rec, page, h, label, { x: b.x + Math.min(22, b.w * 0.18), y: b.y + b.h / 2 });
  await settle(page, 120);
  await page.keyboard.press('Escape');
  await settle(page, 80);
  const keys = [m[0], m[1], d[0], d[1], 'ArrowUp'];
  const shots = [];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].length === 1) await page.keyboard.type(keys[i]); else await page.keyboard.press(keys[i]);
    if (stillEach && i < keys.length - 1) shots.push(await rec.still(page, `${name}-${i + 1}`, { typed: keys.slice(0, i + 1).join('') }));
  }
  rec.action({ type: 'date', label, text: `${m}/${d}/${y}`, count: 1, keys: keys.length, shots });
  if (String(new Date().getFullYear()) !== y) log(`NOTE the date box's ArrowUp fills the computer's current year (${new Date().getFullYear()}), not ${y}`);
  return shots;
}

// ------------------------------------------------------------- scene: leads (List View)
// #leads opens the List View (the app's default since 2026-10-14): the list, the selected lead
// worked in a side panel, the stage cards below. The panel's Site Survey Date is what moves a
// New lead on — the same setLeadSurveyDate the Pipeline board's cards use.
async function sceneLeads() {
  // The stats line (won / lost / win rate) stays out of frame in every still of this scene.
  const keepOut = [{ text: 'Active Leads', closest: 'div', why: 'leads stats line', required: true }, { text: 'Win Rate', closest: 'span,div', why: 'win rate', required: true }];
  rec.begin('leads', { kind: 'desktop', view: 'list', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr, day: DAY.quoteDrafted, clock: '10:20', keepOut });
  const page = await deskPage(PT(DAY.quoteDrafted, '10:20'));
  await openApp(page, 'leads');
  check('leads: #leads opens the List View (list + side panel + stage cards)', await page.evaluate(() => !!(document.getElementById('lc-table-wrap') && document.getElementById('lc-panel') && document.getElementById('lc-stages'))));
  // The panel works the selected lead: on load, the list's top row — the newest lead (Age ↑).
  const lead = await page.evaluate(() => {
    const id = (document.getElementById('lc-panel') || { getAttribute: () => null }).getAttribute('data-lead');
    const l = id && (data.leads || []).find((x) => x.id === id);
    const top = document.querySelector('#lc-table-wrap tr.lc-row');
    return l ? { id: l.id, name: l.name, number: l.number, status: l.status, topRow: top && top.getAttribute('data-id'), date: l.siteSurveyDate || null } : null;
  });
  if (!lead) throw new Error('list: no lead in the side panel');
  check('list: the panel works the top row, a New lead with no survey date', lead.topRow === lead.id && lead.status === 'new' && !lead.date, `${lead.number} ${lead.name} ${lead.status}`);
  rec.scene.lead = { id: lead.id, name: lead.name, number: lead.number };
  const ROW = `#lc-table-wrap tr.lc-row[data-id="${lead.id}"]`;
  const CARD = (s) => `#lc-stages .lc-stage-card[data-stage="${s}"]`;
  // What the camera frames (css boxes): the row and its status pill, the panel (head, stage chip,
  // stage buttons, the survey date), the stage cards; the edges it keeps to (cards, columns).
  const F = () => focus(page, {
    row: { sel: ROW }, name: { sel: `${ROW} .lc-nm1` }, pill: { sel: `${ROW} td:nth-child(4) .badge-pill` }, phoneText: { sel: `${ROW} td:nth-child(5) a` },
    quick: { sel: '.card.lc-quick' }, list: { sel: '.card.lc-list' }, panel: { sel: '.card.lc-panel-card' },
    pHead: { sel: '#lc-panel .lc-p-head' }, chip: { sel: '#lc-panel .lc-p-stage .badge-pill' }, stageLine: { sel: '#lc-panel .lc-p-stage' },
    stageSec: { sel: '#lc-panel .lc-sec-stage' }, onBtn: { sel: '#lc-panel .lc-stage-btn.on' }, date: { sel: '#lc-survey-date' }, dates: { sel: '#lc-panel .lc-dates' },
    cards: { sel: '#lc-stages' }, newCard: { sel: CARD('new') }, sssCard: { sel: CARD('site_survey_scheduled') },
    newHead: { sel: `${CARD('new')} .lc-stage-h` }, sssHead: { sel: `${CARD('site_survey_scheduled')} .lc-stage-h` },
    toast: { sel: '#toast-container .toast', last: true },
  });
  // What the list, the panel and the stage cards say about the lead (read off the screen).
  const onScreen = () => page.evaluate((ROW) => {
    const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
    return {
      pill: t(document.querySelector(`${ROW} td:nth-child(4) .badge-pill`)),
      chip: t(document.querySelector('#lc-panel .lc-p-stage .badge-pill')),
      onBtn: (document.querySelector('#lc-panel .lc-stage-btn.on') || { getAttribute: () => null }).getAttribute('data-stage'),
      date: (document.getElementById('lc-survey-date') || {}).value || '',
      panelLead: (document.getElementById('lc-panel') || { getAttribute: () => null }).getAttribute('data-lead'),
      topRow: (document.querySelector('#lc-table-wrap tr.lc-row') || { getAttribute: () => null }).getAttribute('data-id'),
      counts: Object.fromEntries([...document.querySelectorAll('#lc-stages .lc-stage-card')].map((c) => [c.getAttribute('data-stage'), Number((c.querySelector('.lc-stage-n') || {}).innerText)])),
    };
  }, ROW);
  // Hovered rows and stage-card buckets light up: the real pointer rests where nothing reacts
  // (the content pane's left margin, between the sidebar and the cards).
  const rest = () => parkPointer(page, 262, 700);
  await rest();
  const s0 = await onScreen();
  check('list: row and panel say New', /^new$/i.test(s0.pill) && /^new$/i.test(s0.chip) && s0.onBtn === 'new' && s0.date === '', JSON.stringify(s0));
  await rec.still(page, 'list', { onScreen: s0, focus: await F() });
  await typeDate(page, '#lc-survey-date', SURVEY_DATE, 'Survey date', { name: 'date' });
  await page.waitForFunction((id) => { const l = (data.leads || []).find((x) => x.id === id); return l && l.status === 'site_survey_scheduled'; }, { timeout: 5000 }, lead.id);
  await settle(page, 300);
  await rest();
  const toast = await toastText(page);
  const s1 = await onScreen();
  await rec.still(page, 'moved', { toast, onScreen: s1, focus: await F() });
  check('list: survey toast', /Survey set for/.test(toast) && toast.includes(lead.name) && /Site Survey Scheduled/.test(toast), toast);
  check('list: the same lead, still the top row, in the panel', s1.panelLead === lead.id && s1.topRow === lead.id, JSON.stringify(s1));
  check('list: row pill, panel chip and stage buttons say Site Survey Scheduled', /^site survey scheduled$/i.test(s1.pill) && /^site survey scheduled$/i.test(s1.chip) && s1.onBtn === 'site_survey_scheduled', JSON.stringify(s1));
  check('list: the panel shows the survey date', s1.date === SURVEY_DATE, s1.date);
  check('list: stage cards — New one less, Site Survey Scheduled one more', s1.counts.new === s0.counts.new - 1 && s1.counts.site_survey_scheduled === s0.counts.site_survey_scheduled + 1, `${JSON.stringify(s0.counts)} → ${JSON.stringify(s1.counts)}`);
  await flush(page);
  const l = (await db(page, 'leads')).find((x) => x.id === lead.id);
  check('list: lead moved to Site Survey Scheduled with the date', l && l.status === 'site_survey_scheduled' && String(l.site_survey_date || '').slice(0, 10) === SURVEY_DATE, l && `${l.status} ${l.site_survey_date}`);
  const tasks = (await db(page, 'tasks')).filter((t) => /site survey/i.test(t.title || '') && (t.link_id === lead.id || t.linkId === lead.id));
  check('list: the app made the survey task', tasks.length >= 1, tasks.map((t) => t.title).join(', '));
}

// ------------------------------------------------------------- scene: the phone app
async function sceneMobile() {
  await park();
  const lead = rec.manifest.scenes.leads && rec.manifest.scenes.leads.lead;
  const mob = await iso.newPage({ ...PHONE, clock: PT(DAY.quoteDrafted, '10:22') });
  mob.on('dialog', async (d) => { log('MOBILE DIALOG', d.message()); await d.dismiss(); });
  await mob.goto(`${iso.origin}/mobile`, { waitUntil: 'load' });
  await mob.waitForFunction(() => typeof currentView !== 'undefined' && /^m-/.test(String(currentView)), { timeout: 20000 });
  await settle(mob, 900);
  rec.begin('mobile', { kind: 'phone', css: { w: PHONE.width, h: PHONE.height }, dpr: PHONE.dpr, day: DAY.quoteDrafted, clock: '10:22' });
  const txt = await mob.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  check('phone app: Today screen', /Today/.test(txt) && /Surveys coming up/i.test(txt), txt.slice(0, 120));
  if (lead) check('phone app: the new survey is listed', new RegExp('Surveys coming up.*' + lead.name.replace(/[&]/g, '.'), 'i').test(txt), lead.name);
  await rec.still(mob, 'today', { focus: await focus(mob, { surveys: { text: 'Surveys coming up', closest: 'section,div' }, lead: lead ? { text: lead.name, closest: 'button,a,div' } : { text: '___' }, stats: { sel: '.m-stats' } }) });
  await mob.close();
}

// ------------------------------------------------------------- scene: quote builder
async function sceneQuote() {
  rec.begin('quote', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr, day: DAY.quoteDrafted, clock: '10:30' });
  const page = await deskPage(PT(DAY.quoteDrafted, '10:30'));
  await openApp(page, 'quote-builder?editId=qt-330');
  // Put the floor section right under the builder's sticky header.
  const top = await contentTopOf(page, '.qb-section-menu-btn');
  if (top == null) throw new Error('builder: no section menu');
  const scrollRef = Math.round(top - 140);
  await scrollContentTo(page, scrollRef);
  // Each re-render of the builder (Pick One, Job Area, Apply) leaves its pane 16 px higher up
  // than it was; the film scrolls it back (as a user would) so the stills line up.
  const holdScroll = async (after) => {
    const now = await page.evaluate(() => document.getElementById('content').scrollTop);
    if (now !== scrollRef) { await scrollContentTo(page, scrollRef); rec.note({ scrollBack: { after, from: now, to: scrollRef } }); log(`scroll back after ${after}: ${now} → ${scrollRef}`); }
  };
  const menuBtn = async () => (await page.$$('.qb-section-menu-btn'))[0];
  const F0 = { menu: { sel: '.qb-section-menu-btn' }, row0: { sel: '#qb-qty-mat-0', closest: 'tr' }, rail: { sel: '#_totalsRailPanel' }, band: { sel: '.qb-section-menu-btn', closest: 'div' } };
  await rec.still(page, 'builder', { focus: await focus(page, F0) });
  await click(rec, page, await menuBtn(), 'Section menu');
  await rec.still(page, 'menu1', { focus: await focus(page, { item: { text: 'Mark as Pick One', exact: true, within: '.qb-row-menu' } }) });
  await click(rec, page, await mustText(page, '.qb-row-menu button', 'Mark as Pick One'), 'Mark as Pick One');
  await settle(page, 250);
  await holdScroll('Mark as Pick One');
  await rec.still(page, 'pickone', { focus: await focus(page, { banner: { sel: '.qb-mc-section-banner' }, menu: { sel: '.qb-section-menu-btn' } }) });
  await click(rec, page, await menuBtn(), 'Section menu');
  await rec.still(page, 'menu2', { focus: await focus(page, { item: { text: 'Show Job Area', exact: true, within: '.qb-row-menu' } }) });
  await click(rec, page, await mustText(page, '.qb-row-menu button', 'Show Job Area'), 'Show Job Area');
  await settle(page, 250);
  await holdScroll('Show Job Area');
  await rec.still(page, 'jobarea', { focus: await focus(page, { area: { sel: '#qb-area-sqft-0' }, apply: { sel: `button[onclick="applyAreaQty('SqFt',0)"]` } }) });
  await click(rec, page, '#qb-area-sqft-0', 'Job area');
  await type(rec, page, String(FX.expected.jobArea.value), 'Job area', { stillEach: true, name: 'area' });
  await click(rec, page, `button[onclick="applyAreaQty('SqFt',0)"]`, 'Apply');
  await settle(page, 350);
  await holdScroll('Apply');
  await parkPointer(page);
  const hint = await page.$eval('#qb-qty-extra-mat-0', (e) => e.innerText.replace(/\s+/g, ' ').trim());
  const toast = await toastText(page);
  await rec.still(page, 'applied', { toast, hint, focus: await focus(page, { hint: { sel: '#qb-qty-extra-mat-0' }, hint2: { sel: '#qb-qty-extra-mat-2' }, qty0: { sel: '#qb-qty-mat-0' }, row0: { sel: '#qb-qty-mat-0', closest: 'tr' }, row2: { sel: '#qb-qty-mat-2', closest: 'tr' }, banner: { sel: '.qb-mc-section-banner' }, rail: { sel: '#_totalsRailPanel' }, toast: { sel: '#toast-container .toast', last: true } }) });
  check('quote: carton hint', hint.replace(/\s+/g, ' ').includes(FX.expected.cartonHint), hint);
  check('quote: apply toast', toast.includes(FX.expected.applyToast), toast);
  const txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  for (const h of FX.expected.cartonHints) check(`quote: carton hint "${h}"`, txt.includes(h), h);
  const gt = (txt.match(/GRAND TOTAL \$[\d,]+\.\d\d/i) || [''])[0];
  check('quote: grand total = dataset (as sent)', gt.includes(money(FX.expected.quoteSent.total)), gt);
  // The optional carpet stairs further down: a real scroll of the builder, filmed frame by frame.
  const STAIRS = FX.tables.quotes.find((q) => q.number === 'QT-330').sections[FX.story.optionalSection].title;
  const stairsTop = await page.evaluate((v) => { const c = document.getElementById('content'); const i = [...c.querySelectorAll('input')].find((x) => x.value === v && x.offsetParent); return i ? i.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop : null; }, STAIRS);
  check('quote: stairs section found', stairsTop != null, String(stairsTop));
  const { reached } = await scrollSeq(page, Math.round(stairsTop - 300), 16, 'scroll');
  // the dataset's carpet line (19.33 SqYd off a 12' roll → 14' 6") and the quote's tax rate
  const QT = FX.tables.quotes.find((q) => q.number === 'QT-330');
  const carpet = QT.materials.find((m) => m._section === FX.story.optionalSection && m.rollWidth);
  const cutTxt = `${carpet.lengthFt}' ${carpet.lengthIn}"`, rollW = `${carpet.rollWidth}' roll`, taxLabel = `Tax (${+(QT.tax_rate * 100).toFixed(3)}%)`;
  const rollTxt = await page.evaluate(() => { const e = document.querySelector('.roll-length'); return e ? e.closest('div').innerText.replace(/\s+/g, ' ').trim() : ''; });
  const railTxt = await page.evaluate(() => { const p = document.getElementById('_totalsRailPanel'); return p ? p.innerText.replace(/\s+/g, ' ').trim() : ''; });
  const FS = { carpet: { sel: '.roll-length', closest: 'tr' }, roll: { sel: '.roll-length', closest: 'div' }, qty: { value: String(carpet.quantity) }, band: { value: STAIRS }, rail: { sel: '#_totalsRailPanel' }, tax: { text: taxLabel, within: '#_totalsRailPanel' }, gt: { text: 'GRAND TOTAL', within: '#_totalsRailPanel', closest: '.totals-row' }, margin: { text: 'Margin', exact: true, within: '#_totalsRailPanel', closest: '.totals-row' } };
  await rec.still(page, 'stairs', { scrollTop: reached, rollTxt, railTxt, carpetQty: String(carpet.quantity), focus: await focus(page, FS) });
  check('quote: carpet cut length from the square yards', rollTxt.includes(cutTxt) && rollTxt.includes(rollW), `${carpet.quantity} SqYd → ${rollTxt}`);
  check(`quote: QUOTE TOTAL card shows ${taxLabel} and the grand total`, railTxt.includes(taxLabel) && railTxt.includes(money(FX.expected.quoteSent.total)), railTxt);
  await click(rec, page, '#privacy-mode-toggle', 'Privacy Mode');
  await parkPointer(page);                                     // hover un-blurs, so the pointer rests on nothing
  await settle(page, 350);
  await rec.still(page, 'privacy', { toast: await toastText(page), focus: await focus(page, { ...FS, toggle: { sel: '#privacy-mode-toggle' }, priv0: { sel: '.qb-private' }, privLast: { sel: '.qb-private', last: true } }) });
  check('quote: privacy on', await page.evaluate(() => document.documentElement.getAttribute('data-privacy') === 'on'));

  // Off camera: Privacy off, Save, Mark Sent, and the customer link (Share → Copy Customer Link).
  await page.click('#privacy-mode-toggle');
  await settle(page, 200);
  await page.click('.qb-header-bar button[onclick="saveQuoteDraft()"]');
  await settle(page, 600);
  const anyway = await byText(page, 'button', 'Save Anyway');
  if (anyway) { await anyway.click(); await settle(page, 500); }
  const saved = await page.waitForFunction(() => [...document.querySelectorAll('#toast-container .toast')].some((t) => /QT-330 saved/.test(t.innerText)), { timeout: 8000 }).then(() => true, () => false);
  check('quote: saved', saved, await toastText(page));
  // The Share menu also holds Email / SMS / "Erick button" — only the exact labels below are ever clicked.
  const shareItem = async (label) => {
    await page.addStyleTag({ content: '.qb-header-bar .hdr-share-btn{display:inline-flex!important}' });   // off camera only
    await page.click('.qb-header-bar button[onclick^="openShareMenu"]');
    await settle(page, 300);
    const h = await page.evaluateHandle((label) => {
      const els = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null && (e.innerText || '').replace(/\s+/g, ' ').trim() === label);
      els.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      return els[0] || null;
    }, label);
    const el = h.asElement(); if (!el) throw new Error('share menu item not found: ' + label);
    await el.click();
    await settle(page, 500);
  };
  await openApp(page, 'quote-builder?editId=qt-330');
  await shareItem('Mark Sent');
  await openApp(page, 'quote-builder?editId=qt-330');
  await shareItem('Copy Customer Link');
  check('quote: link copied toast', (await toastText(page)).includes('Quote link copied'), await toastText(page));
  await flush(page);
  const q = (await db(page, 'quotes')).find((x) => x.number === 'QT-330');
  check('quote: saved as sent with a customer link', q.status === 'sent' && !!q.public_token, `${q.status} token=${!!q.public_token} total=${q.total}`);
  check('quote: stored total = dataset (as sent)', Math.abs(q.total - FX.expected.quoteSent.total) < 0.005, q.total);
  rec.note({ story: 'saved, marked sent, customer link made (off camera)' });
}

// ------------------------------------------------------------- scene: approve (phone)
async function sceneApprove() {
  await park();                                    // the office app is closed while the customer approves
  const page = await iso.newPage({ ...PHONE, clock: PT(DAY.approved, '12:20') });
  page.on('dialog', async (d) => { log('PHONE DIALOG', d.message()); await d.accept(); });
  const q = (await db(desk, 'quotes')).find((x) => x.number === 'QT-330');
  if (!q || !q.public_token) throw new Error('QT-330 has no customer link yet (run the quote scene first)');
  await page.goto(`${iso.origin}/q.html?t=${q.public_token}`, { waitUntil: 'load' });
  await page.waitForSelector('#approve-btn', { timeout: 15000 });
  await settle(page, 300);
  rec.begin('approve', { kind: 'phone', css: { w: PHONE.width, h: PHONE.height }, dpr: PHONE.dpr, day: DAY.approved, clock: '12:20' });
  const tall = async (name, specs) => {
    const f = specs ? await focus(page, specs, true) : {};
    const hide = await page.addStyleTag({ content: '#dl-pdf{visibility:hidden!important}' });
    const file = await rec.still(page, name, { focus: f }, { fullPage: true });
    await hide.evaluate((el) => el.remove());
    return file;
  };
  // the fixed "Download PDF" button, captured once so the compositor keeps it fixed while scrolling
  const dl = await boxOf(page, '#dl-pdf').catch(() => null);
  if (dl) { const f = 'approve-dlpdf.png'; await page.screenshot({ path: path.join(OUT, 'stills', f), clip: { x: dl.x, y: dl.y, width: dl.w, height: dl.h } }); rec.note({ overlay: 'dlpdf', file: f, box: dl }); }
  await tall('tall-0', { mc: { sel: 'tr.mc-row' }, header: { text: 'QT-330', exact: true } });
  const tapEl = async (sel, label) => {
    const h = await page.$(sel); if (!h) throw new Error('phone: missing ' + sel);
    // scroll so the target sits in the lower-middle of the screen, like a thumb would
    const docBox = await h.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height }; });
    const targetScroll = Math.max(0, Math.round(docBox.y - PHONE.height * 0.55));
    await page.evaluate((y) => window.scrollTo(0, y), targetScroll);
    await settle(page, 150);
    const b = await boxOf(page, h);
    const x = b.x + b.w / 2, y = b.y + b.h / 2;
    await page.touchscreen.tap(x, y);
    const sy = await page.evaluate(() => window.scrollY);
    rec.action({ type: 'click', tap: true, label, x, y, box: b, scrollY: sy, docY: y + sy });
  };
  await tapEl(`tr.mc-row[data-mc-key="${FX.story.pickOneRow}"]`, 'Pick Better');
  await settle(page, 250);
  check('phone: Better selected', await page.evaluate((k) => !!document.querySelector(`tr.mc-row-selected[data-mc-key="${k}"]`), FX.story.pickOneRow));
  await tall('tall-1');
  const optSel = 'label.opt-toggle input[type=checkbox]';
  await tapEl(optSel, 'Add stairs');
  await settle(page, 250);
  check('phone: stairs added', await page.evaluate((s) => document.querySelector(s).checked, optSel));
  await tall('tall-2', { total: { text: 'TOTAL', exact: true, last: true, closest: 'tr,div' }, totalv: { text: money(FX.expected.quoteApprovedTotal), exact: true, last: true }, stairs: { sel: 'label.opt-toggle' }, approve: { sel: '#approve-btn' } });
  const totalText = await page.evaluate(() => (document.body.innerText.match(/TOTAL\s*\$[\d,]+\.\d\d/g) || []).join(' | ').replace(/\s+/g, ' '));
  check('phone: live total = dataset (Better + stairs)', totalText.includes(money(FX.expected.quoteApprovedTotal)), totalText);
  // q.html reloads 600 ms after the approval; the harness answers that reload after 1.6 s (a
  // real network takes a moment too), so the app's own toast can be photographed before it goes.
  await fetch(`${iso.origin}/__harness/delay-next?path=/q.html&ms=1600`);
  const reloaded = page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null);
  await tapEl('#approve-btn', 'Approve Quote');
  await page.waitForFunction(() => document.getElementById('toast') && document.getElementById('toast').classList.contains('show'), { timeout: 5000 });
  await rec.still(page, 'toast', { viewport: true });
  await reloaded;
  await page.waitForSelector('.approved-stamp', { timeout: 15000 });
  await settle(page, 300);
  const stampT = await page.$eval('.approved-stamp', (e) => getComputedStyle(e).transform);
  check('phone: APPROVED stamp is level', stampT === 'none' || /^matrix\(1, 0, 0, 1,/.test(stampT), stampT);
  await tall('tall-3-approved', { stamp: { sel: '.approved-stamp' }, done: { text: 'Quote Approved' }, header: { text: 'QT-330', exact: true } });
  const q2 = (await db(page, 'quotes')).find((x) => x.number === 'QT-330');
  check('phone: quote approved in store', q2.status === 'approved', q2.status + ' ' + JSON.stringify(q2.selected_options));
  await page.close();
}

// ------------------------------------------------------------- scene: the office converts it
async function sceneConvert() {
  // After the approval the builder's QUOTE TOTAL card leaves out the optional stairs the customer
  // added (it reads less than IN-330), so the film keeps that card out of frame in this scene.
  rec.begin('convert', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr, day: DAY.approved, clock: '13:05', keepOut: [{ sel: '#_totalsRailPanel', why: 'quote totals card (leaves out the stairs the customer added)' }] });
  const page = await deskPage(PT(DAY.approved, '13:05'));
  await openApp(page, 'quote-builder?editId=qt-330');
  await scrollContentTo(page, 0);
  const F = { btn: { sel: '#convert-approved-quote' }, banner: { text: 'This quote is locked', closest: 'div' }, title: { sel: '.qb-header-bar' } };
  await rec.still(page, 'quote', { focus: await focus(page, F) });
  await click(rec, page, '#convert-approved-quote', 'Create WO & Invoice');
  await page.waitForSelector('#confirm-convert-quote', { visible: true, timeout: 5000 });
  await settle(page, 300);
  await rec.still(page, 'modal', { focus: await focus(page, { modal: { sel: '#modal' }, ok: { sel: '#confirm-convert-quote' } }) });
  await click(rec, page, '#confirm-convert-quote', 'Create Work Order & Invoice');
  await page.waitForFunction((n) => (data.jobs || []).some((j) => j.number === n), { timeout: 10000 }, FX.expected.workOrderNumber);
  await settle(page, 600);
  await parkPointer(page);
  const toast = await toastText(page);
  await rec.still(page, 'done', { toast, view: await page.evaluate(() => currentView), focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true }, title: { sel: '.qb-header-bar' } }) });
  check('convert: toast = dataset', toast.includes(FX.expected.approvalToast), toast);
  await flush(page);
  const job = (await db(page, 'jobs')).find((j) => j.number === FX.expected.workOrderNumber);
  const inv = (await db(page, 'invoices')).find((i) => i.number === FX.expected.invoiceNumber);
  check('convert: WO-330 created', !!job, job && job.status);
  check('convert: IN-330 created', !!inv, inv && `${inv.subtotal} + ${inv.tax} = ${inv.total}`);
  if (!job || !inv) throw new Error('conversion did not produce WO-330 / IN-330');
  check('IN-330 total = dataset', Math.abs(inv.total - FX.expected.invoice.total) < 0.005, `${inv.total} vs ${FX.expected.invoice.total}`);
  Object.assign(rec.scene, { jobId: job.id, invoiceId: inv.id });
}

// ------------------------------------------------------------- scene: work order
async function sceneWO() {
  const { jobId, invoiceId } = rec.manifest.scenes.convert;
  // Off camera, that evening: the Prasads pay the 50% deposit on the live invoice (Stripe).
  await story('deposit paid online by card', async (p) => {
    const rows = await db(p, 'invoices');
    const inv = rows.find((i) => i.id === invoiceId);
    inv.payments = [FX.story.depositPayment]; inv.amount_paid = FX.story.depositPayment.amount; inv.status = 'deposit';
    await dbWrite(p, 'invoices', rows);
  });
  const ORDER_DAY = addDays(DAY.approved, 1);                                  // dataset: ordered + booked the next day
  rec.begin('wo', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr, day: ORDER_DAY, clock: '09:20', jobId, invoiceId });
  const page = await deskPage(PT(ORDER_DAY, '09:20'));
  await openApp(page, `job-detail/${jobId}`);
  const HB = { hdr: { sel: '.qb-header-bar' }, status: { text: 'Order Materials', within: '.qb-header-bar', last: true }, om: { sel: 'button[onclick^="openOrderMaterialsModal"]' } };
  await rec.still(page, 'start', { focus: await focus(page, HB) });
  await click(rec, page, 'button[onclick^="openOrderMaterialsModal"]', 'Order Materials');
  await page.waitForSelector('#modal-overlay.active', { timeout: 5000 });
  await settle(page, 300);
  const selAll = '#modal input[type=checkbox][onchange^="_omToggleSelectAll"]';
  await rec.still(page, 'om-modal', { focus: await focus(page, { modal: { sel: '#modal' }, selAll: { sel: selAll }, finish: { sel: '#modal .modal-footer button.btn-primary' } }) });
  await click(rec, page, selAll, 'Select all');
  await settle(page, 250);
  await rec.still(page, 'om-selected', { focus: await focus(page, { modal: { sel: '#modal' }, finish: { sel: '#modal .modal-footer button.btn-primary' } }) });
  await click(rec, page, '#modal .modal-footer button.btn-primary', 'Finish');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await settle(page, 400);
  await parkPointer(page);
  const omToast = await toastText(page);
  await rec.still(page, 'ordered', { toast: omToast, focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true }, hdr: { sel: '.qb-header-bar' }, si: { sel: 'button[onclick^="openScheduleJobModal"]' } }) });
  await flush(page);
  let j = (await db(page, 'jobs')).find((x) => x.id === jobId);
  check('WO-330: every line ordered → Ready to Schedule', j.status === 'ready_to_schedule', j.status);
  check('Order Materials toast', /POs? marked as ordered/.test(omToast) && /Ready to Schedule/.test(omToast), omToast);
  const pos = (await db(page, 'job_pos')).filter((x) => x.job_id === jobId);
  check('Order Materials made 4 POs', pos.length === 4, pos.map((x) => `${x.number} ${x.mat_num} ${x.qty}`).join(', '));
  check('WO-330 POs numbered like the dataset', pos.map((x) => x.number).sort().join() === XS.poNumbers.slice().sort().join(), pos.map((x) => x.number).join(', '));
  rec.note({ pos: pos.map((x) => x.number) });

  // Same day: Schedule Install — start + end dates (the dataset's two-day install) and the installer.
  await click(rec, page, 'button[onclick^="openScheduleJobModal"]', 'Schedule Install');
  await page.waitForSelector('#sched-date', { timeout: 5000 });
  await settle(page, 300);
  const SM = { modal: { sel: '#modal' }, start: { sel: '#sched-date' }, end: { sel: '#sched-end' }, span: { sel: '#sched-span' }, inst: { sel: '#sched-installer' }, ok: { sel: '#modal .modal-footer .btn-primary' } };
  await rec.still(page, 'si-modal', { focus: await focus(page, SM) });
  await typeDate(page, '#sched-date', XS.installStart, 'Start date', { name: 'start' });
  await settle(page, 200);
  const endAuto = await page.$eval('#sched-end', (e) => e.value);
  await rec.still(page, 'si-start', { endAuto, focus: await focus(page, SM) });
  check('schedule: start date typed', (await page.$eval('#sched-date', (e) => e.value)) === XS.installStart, await page.$eval('#sched-date', (e) => e.value));
  if (endAuto !== XS.installEnd) {
    // the end follows the start for a one-day job; the dataset's install ends a day later:
    // focus the End box's day and step it up (one keystroke per day, one onchange each)
    const days = Math.round((Date.parse(XS.installEnd) - Date.parse(endAuto)) / 864e5);
    if (!(days >= 1 && days <= 3)) throw new Error(`schedule: unexpected end ${endAuto} vs ${XS.installEnd}`);
    const eb = await boxOf(page, '#sched-end');
    await click(rec, page, '#sched-end', 'End date', { x: eb.x + Math.min(22, eb.w * 0.18), y: eb.y + eb.h / 2 });
    await settle(page, 120);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < days; i++) await page.keyboard.press('ArrowUp');
    rec.action({ type: 'date', label: 'End date', text: XS.installEnd, count: 1, keys: 1 + days });
    await settle(page, 200);
  }
  check('schedule: end date', (await page.$eval('#sched-end', (e) => e.value)) === XS.installEnd, await page.$eval('#sched-end', (e) => e.value));
  await rec.still(page, 'si-end', { focus: await focus(page, SM) });
  await click(rec, page, '#sched-installer', 'Installer');
  await page.keyboard.press('Escape');                                         // the native list is never drawn headless
  await page.select('#sched-installer', FX.story.installer.id);
  rec.action({ type: 'click', label: 'Pick ' + FX.story.installer.name, select: '#sched-installer' });
  await settle(page, 150);
  await rec.still(page, 'si-installer', { focus: await focus(page, SM) });
  await click(rec, page, '#modal .modal-footer .btn-primary', 'Schedule');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await settle(page, 400);
  await parkPointer(page);
  const siToast = await toastText(page);
  await rec.still(page, 'scheduled', { toast: siToast, focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true }, hdr: { sel: '.qb-header-bar' } }) });
  await flush(page);
  j = (await db(page, 'jobs')).find((x) => x.id === jobId);
  check('WO-330 scheduled: start, two days, Ruben', j.status === 'scheduled' && j.scheduled_date === XS.installStart && Number(j.duration_days) === Math.round((Date.parse(XS.installEnd) - Date.parse(XS.installStart)) / 864e5) + 1 && j.crew === FX.story.installer.id, `${j.status} ${j.scheduled_date} ${j.duration_days}d crew=${j.crew}`);
  check('schedule toast', /scheduled for/.test(siToast) && siToast.includes(FX.story.installer.name), siToast);
}

// ------------------------------------------------------------- scene: payment
async function scenePay() {
  const { jobId, invoiceId } = rec.manifest.scenes.convert;
  // Off camera, Oct 19: everything arrives (base as 12 × 16 ft sticks); the base's freight goes
  // on its PO (dataset). Receiving a PO also marks its work-order line in (matReceivedAt).
  const costs = FX.story.jobCosts.map((c) => ({ ...c, job_id: jobId, job_number: FX.expected.workOrderNumber }));
  await story('materials received (+ freight on the base PO)', async (p) => {
    const all = await db(p, 'job_pos');
    await dbWrite(p, 'job_pos', all.map((x) => {
      if (x.job_id !== jobId) return x;
      const qty = FX.story.poQty[x.mat_num] != null ? FX.story.poQty[x.mat_num] : x.qty;
      const freight = XS.poFreight[x.mat_num] || 0;
      return { ...x, qty, total_cost: Math.round(qty * x.cost * 100) / 100, freight, status: 'received', received_at: FX.story.poReceivedAt };
    }));
    const jobs = await db(p, 'jobs');
    await dbWrite(p, 'jobs', jobs.map((x) => (x.id !== jobId ? x : { ...x, materials: (x.materials || []).map((m) => ({ ...m, matReceivedAt: FX.story.poReceivedAt })) })));
  });
  await story('install supplies', async (p) => { const jc = await db(p, 'job_costs'); await dbWrite(p, 'job_costs', jc.concat(costs.filter((c) => c.kind === 'supply'))); });
  // Off camera, the morning after the install ends: the app moves WO-330 to Final Invoice by
  // itself (_plAutoAdvanceSweep on load); the office opens the final invoice and ticks Final.
  let page = await deskPage(PT(DAY.complete, '08:10'));
  await openApp(page, `job-detail/${jobId}`);
  await flush(page);
  let j = (await db(page, 'jobs')).find((x) => x.id === jobId);
  check('the app moved WO-330 to Final Invoice the day after the install', j.status === 'final_invoice', j.status);
  await openApp(page, `invoice-detail/${invoiceId}`);
  let inv = (await db(page, 'invoices')).find((i) => i.id === invoiceId);
  if (!inv.final_invoice) { const fin = await page.$('#ib-final-btn'); if (fin) { await fin.click(); await settle(page, 300); await flush(page); } inv = (await db(page, 'invoices')).find((i) => i.id === invoiceId); }
  check('IN-330 marked final', !!inv.final_invoice, String(inv.final_invoice));
  rec.note({ story: 'WO-330 moved to Final Invoice by the app; Final Invoice ticked (off camera)' });

  rec.begin('pay', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr, day: FX.story.balanceCheck.date, clock: '11:20' });
  page = await deskPage(PT(FX.story.balanceCheck.date, '11:20'));
  await openApp(page, `invoice-detail/${invoiceId}`);
  await rec.still(page, 'start', { focus: await focus(page, { take: { sel: 'button[onclick^="openTakePaymentModal"]' }, hdr: { sel: '.qb-header-bar' }, rail: { sel: '#_totalsRailPanel' } }) });
  const take = (await page.$$('button[onclick^="openTakePaymentModal"]'))[0];
  if (!take) throw new Error('invoice: no Take Payment button');
  await click(rec, page, take, 'Take Payment');
  await page.waitForSelector('#pay-method', { timeout: 5000 });
  await settle(page, 300);
  const PM = { modal: { sel: '#modal' }, amt: { sel: '#pay-amt' }, method: { sel: '#pay-method' }, checkno: { sel: '#pay-checkno' }, ok: { sel: '#pay-confirm-btn' } };
  await rec.still(page, 'modal', { focus: await focus(page, PM) });
  const amt = await page.$eval('#pay-amt', (el) => el.value);
  check('Take Payment pre-fills the balance', Math.abs(Number(amt) - FX.story.balanceCheck.amount) < 0.005, amt);
  await click(rec, page, '#pay-method', 'Method');
  await page.keyboard.press('Escape');
  await page.select('#pay-method', 'Check');
  rec.action({ type: 'click', label: 'Pick Check', select: '#pay-method' });
  await settle(page, 200);
  await rec.still(page, 'check', { focus: await focus(page, PM) });
  await click(rec, page, '#pay-checkno', 'Check number');
  await type(rec, page, FX.story.balanceCheck.checkNumber, 'Check number', { stillEach: true, name: 'checkno' });
  check('the amount is the one the app pre-filled', (await page.$eval('#pay-amt', (el) => el.value)) === amt, amt);
  await click(rec, page, '#pay-confirm-btn', 'Record Payment');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await settle(page, 400);
  await parkPointer(page);
  const toast = await toastText(page);
  await rec.still(page, 'paid', { toast, focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true }, paid: { text: 'Paid in Full', within: '.qb-header-bar' }, hdr: { sel: '.qb-header-bar' }, badge: { text: 'PAID', exact: true, within: '.qb-header-bar' }, title: { text: 'Invoice', exact: true, within: '.qb-header-bar' }, paper: { sel: '#content .doc-paper' }, rail: { sel: '#_totalsRailPanel' } }) });
  check('payment toast', /Payment of \$[\d,]+\.\d\d recorded on IN-330/.test(toast), toast);
  // Down to the document's own totals (TOTAL · Paid · BALANCE DUE): a real scroll, frame by frame.
  const balY = await page.evaluate(() => {
    const c = document.getElementById('content');
    const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let n, best = null;
    while ((n = w.nextNode())) if (n.textContent.trim() === 'Balance Due' && n.parentElement.offsetParent) { const y = n.parentElement.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop; if (!best || y > best) best = y; }
    return best;
  });
  check('invoice: document totals found', balY != null && balY > 900, String(balY));
  const { reached } = await scrollSeq(page, Math.round(balY - 560), 16, 'scroll');
  const doc = await page.evaluate(() => {
    const w = document.createTreeWalker(document.getElementById('content'), NodeFilter.SHOW_TEXT); let n; const out = [];
    while ((n = w.nextNode())) if (/^balance due$/i.test(n.textContent.trim()) && n.parentElement.offsetParent) { const tr = n.parentElement.closest('tr'); if (tr) out.push(tr.innerText.replace(/\s+/g, ' ').trim()); }
    return out;
  });
  // The closing shot is framed on the paper's totals at up to 2.4x: this still is captured at
  // 3x so that zoom stays at or below its pixels (the layout is the same; only density changes).
  await page.setViewport({ width: DESK.width, height: DESK.height, deviceScaleFactor: Math.max(DESK.dpr, 3) });
  await settle(page, 400);
  await rec.still(page, 'paid-balance', { scrollTop: reached, doc, focus: await focus(page, { bal: { text: 'Balance Due', exact: true, last: true, within: '#content', closest: 'tr' }, total: { text: 'TOTAL', exact: true, last: true, within: '#content', closest: 'tr' }, paidRow: { text: 'Paid', exact: true, last: true, within: '#content', closest: 'tr' }, table: { text: 'Balance Due', exact: true, last: true, within: '#content', closest: 'table' }, paper: { sel: '#content .doc-paper' }, rail: { sel: '#_totalsRailPanel' } }) });
  await page.setViewport({ width: DESK.width, height: DESK.height, deviceScaleFactor: DESK.dpr });
  check('invoice: the document reads BALANCE DUE $0.00', doc.some((t) => /BALANCE DUE \$0\.00/i.test(t)), JSON.stringify(doc));
  await flush(page);
  inv = (await db(page, 'invoices')).find((i) => i.id === invoiceId);
  const paidSum = (inv.payments || []).reduce((a, p) => a + Number(p.amount || 0), 0);
  check('IN-330 paid in full', inv.status === 'paid' && Math.abs(paidSum - FX.expected.invoice.total) < 0.005, `${inv.status} ${paidSum.toFixed(2)} in ${inv.payments.length} payments`);
  rec.scene.costs = costs;
}

// ------------------------------------------------------------- scene: job costing
async function sceneCost() {
  const { jobId } = rec.manifest.scenes.convert;
  const costs = FX.story.jobCosts.map((c) => ({ ...c, job_id: jobId, job_number: FX.expected.workOrderNumber }));
  // Off camera, Oct 26: Ruben's install is recorded and paid out.
  await story('installer labor recorded + paid', async (p) => {
    const jc = (await db(p, 'job_costs')).filter((c) => c.job_id !== jobId);
    await dbWrite(p, 'job_costs', jc.concat(costs));
  });
  rec.begin('cost', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr, day: DAY.payout, clock: '10:00' });
  const page = await deskPage(PT(DAY.payout, '10:00'));
  await openApp(page, 'job-costing');
  await rec.still(page, 'list', { focus: await focus(page, { row: { text: FX.expected.workOrderNumber, exact: true, within: '#content', closest: 'tr' } }) });
  const row = await page.evaluateHandle((num) => {
    const w = document.createTreeWalker(document.getElementById('content'), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (n.textContent.trim() === num && n.parentElement.offsetParent) { let el = n.parentElement; while (el && el.tagName !== 'TR' && !el.hasAttribute('onclick')) el = el.parentElement; return el; } }
    return null;
  }, FX.expected.workOrderNumber);
  if (!row.asElement()) throw new Error('job costing list: no row for ' + FX.expected.workOrderNumber);
  await click(rec, page, row.asElement(), 'Open WO-330 costing', { dx: 0.18 });
  await page.waitForFunction(() => currentView === 'job-costing-detail', { timeout: 5000 });
  await settle(page, 500);
  await parkPointer(page);
  const strip = await page.evaluate(() => {
    const w = document.createTreeWalker(document.getElementById('content'), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (/^revenue$/i.test(n.textContent.trim()) && n.parentElement.offsetParent) { let el = n.parentElement; while (el && !/sales tax/i.test(el.innerText)) el = el.parentElement; return el ? el.innerText.replace(/\s+/g, ' ').trim() : ''; }
    return '';
  });
  await rec.still(page, 'detail', { strip, focus: await focus(page, { strip: { contains: ['Revenue', 'Estimated', 'Actual', 'Variance', 'Margin', 'Profit', 'Sales Tax'], within: '#content' }, revCell: { contains: ['Revenue', 'invoiced'], within: '#content', maxY: 320 }, marginCell: { contains: ['Margin', 'before commission'], within: '#content', maxY: 320 }, profitCell: { contains: ['Profit', 'after commission'], within: '#content', maxY: 320 }, taxCell: { contains: ['Sales Tax', 'invoiced'], within: '#content', maxY: 320 }, hdr: { contains: ['Mark Paid', 'Invoice IN-330'], within: '#content' }, markPaid: { text: 'Mark Paid', within: '#content', closest: 'button' }, woBtn: { text: 'Work Order', exact: true, within: '#content', closest: 'button' }, sidebar: { sel: '#sidebar' }, title: { text: 'Job Costing', within: '#content' }, evsa: { text: 'Estimate vs Actual', within: '#content' }, profit: { text: 'Job Profit', within: '#content' } }) });
  const E = FX.expected.jobCosting;
  check('costing: estimate = dataset', strip.includes(money(E.estimate)), money(E.estimate));
  check('costing: actual = dataset', strip.includes(money(E.actual)), money(E.actual));
  check('costing: variance = dataset', strip.includes(E.variance), E.variance);
  check('costing: margin before commission, profit after', /before commission/i.test(strip) && /after commission/i.test(strip), strip);
  rec.note({ strip });
}

const SCENE_FNS = { leads: sceneLeads, mobile: sceneMobile, quote: sceneQuote, approve: sceneApprove, convert: sceneConvert, wo: sceneWO, pay: scenePay, cost: sceneCost };
try {
  const p0 = await park();
  await p0.evaluate(() => window.__flStub.reseed());              // every run starts from the fixture
  for (const s of SCENES) {
    if (!SCENE_FNS[s]) throw new Error('unknown scene ' + s);
    log('=== scene', s);
    await SCENE_FNS[s]();
    rec.save();
  }
} catch (e) {
  failures.push('EXCEPTION ' + e.message);
  log('ERROR', e.stack);
  if (desk) await desk.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
} finally {
  // the dataset values the captions' descriptions quote (checked on camera above)
  rec.manifest.expected = FX.expected;
  rec.manifest.story = { installer: FX.story.installer.name, installStart: XS.installStart, installEnd: XS.installEnd, balanceCheck: FX.story.balanceCheck, jobArea: FX.expected.jobArea };
  rec.manifest.isolation = { attempts: iso.isoLog.length, forbidden: iso.forbiddenAttempts().length, unanswered: iso.unansweredAttempts().length, answered: [...new Set(iso.isoLog.filter((e) => e.kind === 'answered-locally').map((e) => e.with))] };
  rec.manifest.pageErrors = iso.pageErrors;
  rec.manifest.failures = failures;
  rec.manifest.stub = await (async () => { try { const p = await park(); return { unknown: await p.evaluate(() => window.__flStub.unknown) }; } catch (_) { return null; } })();
  rec.save();
  await iso.browser.close();
  srv.server.close();
}
if (rec.manifest.stub && rec.manifest.stub.unknown && rec.manifest.stub.unknown.length) { log('UNIMPLEMENTED STUB CALLS', JSON.stringify(rec.manifest.stub.unknown)); process.exitCode = 1; }
try { iso.assertClean(); log('ISOLATION OK —', iso.isoLog.filter((e) => e.kind === 'answered-locally').length, 'answered locally, 0 unanswered'); }
catch (e) { log(e.message); process.exitCode = 2; }
if (iso.pageErrors.length) { log('PAGE ERRORS', JSON.stringify(iso.pageErrors)); process.exitCode = process.exitCode || 1; }
if (failures.length) { log('FAILURES:\n  ' + failures.join('\n  ')); process.exitCode = process.exitCode || 1; }
else log('ALL CHECKS PASSED —', Object.values(rec.manifest.scenes).reduce((n, s) => n + s.steps.filter((x) => x.kind === 'still').length, 0), 'stills');
