// Reference screenshots of every key screen of the CURRENT app, filmed offline with the
// Pinyon dataset. Every state change on the way is the app's own flow (real clicks / taps):
// the customer approves QT-330 on a phone, the office turns it into WO-330 + IN-330, orders
// the materials, schedules the install and records the balance. Things that happen off camera
// (QT-330 measured and sent, the deposit paid online, deliveries, the installer's bill) are
// written into the offline store from the dataset (fixture.story), like the film run does.
//
//   node capture/screens.mjs [--only=01,05b]
// Output: out/screens/NN-name.png + out/screens/INDEX.md (+ index.json). Desktop 1920×1080
// @1.5x, phone 390×844 @3x. Exits non-zero on any banned text, a visible "never on camera"
// control, a non-fictional phone number / e-mail on screen, an old logo, a failed check, a
// page error, or any outside request without a local answer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, NEVER_ON_CAMERA_INDEX, NEVER_ON_CAMERA_Q, BANNED_ON_CAMERA as BANNED } from '../harness/server.mjs';
import { launchIsolated } from '../harness/browser.mjs';
import { stubSource } from '../harness/stub-source.mjs';
import { settle, byText, mustText } from './lib.mjs';
import { loadStoryExtras } from './dataset.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const ONLY = args.only ? new Set(String(args.only).split(',')) : null;
const FX_PATH = process.env.FL_FIXTURE || path.join(ROOT, 'harness', 'fixture.json');
const FX = JSON.parse(fs.readFileSync(FX_PATH, 'utf8'));
const APP_DIR = process.env.FL_APP_DIR || path.join(ROOT, 'app-export');
const OUT = path.join(ROOT, 'out', 'screens');
fs.mkdirSync(OUT, { recursive: true });
if (!ONLY) for (const f of fs.readdirSync(OUT)) if (/\.(png|md|json)$/.test(f)) fs.rmSync(path.join(OUT, f));
const DESK = { width: 1920, height: 1080, dpr: 1.5 };
const PHONE = { width: 390, height: 844, dpr: 3, mobile: true };
const PT = (iso, hm) => Date.parse(`${iso}T${hm}:00-07:00`);
const DAY = FX.story.days;
// two facts the fixture's story does not carry: the install end date and each PO's freight
const XS = await loadStoryExtras();
const log = (...a) => console.log('[screens]', ...a);
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const failures = [];
const notes = [];    // dataset-vs-app observations (reported, not fatal)
const check = (name, ok, detail) => { log((ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' — ' + detail : '')); if (!ok) failures.push(name + (detail != null ? ' — ' + detail : '')); };
const note = (text) => { log('NOTE ' + text); notes.push(text); };
const index = [];    // INDEX.md rows

// What changed since the August film, ONLY where it is certain: the August harness code
// (capture/run.mjs, server.mjs) did it differently, or the app's own dated change notes say
// the feature arrived after August. "—" means not compared, not "unchanged".
const VS_AUGUST = {
  '01': 'The kanban is no longer what #leads opens (August\'s capture went straight onto it): it is the "Pipeline" tab now.',
  '01b': 'New: List View is the Leads default. The Dialpad "Call Log" card above it (new since August) is hidden on camera.',
  '02': 'New CRM lead layout (live 2026-10-14). Its Share button is hidden on camera.',
  '03': 'New header button "Edit with Caspar" (Caspar is new since August).',
  '05': 'Approved quotes are no longer turned into WO + invoice when the app loads (August\'s film relied on that); the office presses "Create WO & Invoice" (05a).',
  '05a': 'New step (see 05).',
  '05b': 'Ordering every line now moves the WO straight on to Ready to Schedule (owner rule 2026-10-13; August went to Materials Ordered).',
  '05c': 'The app moves a WO to Final Invoice by itself the day after the install ends (owner rule 2026-10-13; August clicked "Mark Job Complete").',
  '07': 'Once the invoice is paid in full the app moves the WO to Ready to be Paid by itself (owner rule 2026-10-13).',
  '09': 'New entry Caspar (beta). The logo slot is now a mark + wordmark pair (August: one #sidebar-logo image); the harness swaps in the new FloorLogic lockup.',
  '10': 'New since August: the /mobile phone app (live 2026-10-07).',
  '11': 'New since August: the /mobile phone app; its Projects tab opens Quotes / Work orders / Invoices.',
  '11b': 'New since August (/mobile).',
  '11c': 'New since August (/mobile).',
  '12': 'New since August: Caspar (beta).',
  '12b': 'New since August: Caspar (beta).',
};

const srv = await startServer({ log: (e) => { if (!/favicon/.test(e.path || '')) log('server', JSON.stringify(e)); } });
const isoLog = path.join(ROOT, 'out', 'isolation-screens.jsonl');
fs.writeFileSync(isoLog, '');
const iso = await launchIsolated({ port: srv.port, freezeAt: PT(DAY.quoteDrafted, '10:20'), logPath: isoLog, stubSource });

// ---------------------------------------------------------------- helpers --
let desk = null;
async function deskPage(clockMs) {
  if (!desk) desk = await iso.newPage({ ...DESK, clock: clockMs });
  else await iso.setClock(desk, clockMs);
  desk.removeAllListeners('dialog');
  desk.on('dialog', async (d) => { log('DIALOG', d.type(), JSON.stringify(d.message())); await d.accept(); });
  return desk;
}
const db = (page, t) => page.evaluate((t) => window.__flStub.table(t), t);
const dbWrite = (page, t, rows) => page.evaluate((t, rows) => window.__flStub.write(t, rows), t, rows);
async function flush(page) { await page.evaluate(async () => { if (typeof _flushPendingSave === 'function') await _flushPendingSave(); }); await settle(page, 200); }
// Close the app (after saving) and open the bare store page: off-camera writes only happen
// here, so no open app tab can write an older copy over them.
async function park() {
  if (!desk) desk = await iso.newPage({ ...DESK });
  if (await desk.evaluate(() => typeof _flushPendingSave === 'function').catch(() => false)) await flush(desk);
  await desk.goto(`${iso.origin}/__harness/db.html`, { waitUntil: 'load' });
  await desk.waitForFunction(() => !!window.__flStub, { timeout: 10000 });
  return desk;
}
async function story(label, fn) { const p = await park(); await fn(p); log('story (off camera):', label); }
// Always a full page load (a hash-only change would keep the running app's memory).
async function openApp(page, hash) {
  if (page === desk) await park();
  await page.goto(`${iso.origin}/index.html${hash ? '#' + hash : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof currentView !== 'undefined' && document.querySelector('#content') && document.querySelector('#content').children.length > 0, { timeout: 20000 });
  await page.waitForFunction(() => typeof _productCatalogState === 'undefined' || _productCatalogState === 'ready' || _productCatalogState === 'failed', { timeout: 20000 });
  await settle(page, 600);
}
async function toastText(page) { return page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).join(' | ')); }
async function clickSel(page, sel, label) {
  const h = await page.$(sel); if (!h) throw new Error(`not found: ${label || sel}`);
  await h.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await settle(page, 100);
  await h.click(); log('click', label || sel);
}
async function clickText(page, sel, text, label) { const h = await mustText(page, sel, text); await h.evaluate((el) => el.scrollIntoView({ block: 'center' })); await settle(page, 100); await h.click(); log('click', label || text); }
async function scrollContent(page, y) { await page.evaluate((y) => { const c = document.getElementById('content'); if (c) c.scrollTop = y; }, y); await settle(page, 200); }
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
async function tap(page, target, label) {
  const h = typeof target === 'string' ? await page.$(target) : target;
  if (!h) throw new Error('phone: missing ' + label);
  await h.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await settle(page, 150);
  const b = await h.boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  log('tap', label);
}

// The "never on camera" checks, run on every screenshot (BANNED = server.mjs BANNED_ON_CAMERA).
async function cameraCheck(page, name, hidden) {
  const r = await page.evaluate((banned, hidden) => {
    const vis = (e) => { if (!e) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const text = document.body ? document.body.innerText : '';
    const hits = banned.map((s) => new RegExp(s.src, s.flags)).filter((re) => re.test(text)).map(String);
    const shown = hidden.filter((sel) => [...document.querySelectorAll(sel)].some(vis));
    // every phone number on screen must be the cast's fictional (775) 555-01xx / 555-05xx
    const phones = [...new Set(text.match(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g) || [])].filter((p) => !/555[\s.-]0[15]\d\d/.test(p));
    const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || [])].filter((e) => !/\.test$/i.test(e));
    const oldLogo = [...document.images].filter((i) => vis(i) && /floorlogic-(mark|wordmark)-dark\.png|^data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAACg/.test(i.getAttribute('src') || '')).map((i) => (i.getAttribute('src') || '').slice(0, 60));
    return { hits, shown, phones, emails, oldLogo };
  }, BANNED.map((re) => ({ src: re.source, flags: re.flags })), hidden);
  const bad = [];
  if (r.hits.length) bad.push('banned text ' + r.hits.join(', '));
  if (r.shown.length) bad.push('never-on-camera control visible: ' + r.shown.join(', '));
  if (r.phones.length) bad.push('non-fictional phone number(s): ' + r.phones.join(', '));
  if (r.emails.length) bad.push('non-.test e-mail(s): ' + r.emails.join(', '));
  if (r.oldLogo.length) bad.push('old logo on screen: ' + r.oldLogo.join(', '));
  check(`camera-safe ${name}`, !bad.length, bad.join(' · ') || 'clean');
}
async function shot(page, id, name, meta, opts = {}) {
  const file = `${id}-${name}.png`;
  if (ONLY && !ONLY.has(id)) { log('skip still', file); return; }
  await settle(page, 300);
  await cameraCheck(page, file, opts.phone ? NEVER_ON_CAMERA_Q.concat(NEVER_ON_CAMERA_INDEX) : NEVER_ON_CAMERA_INDEX);
  const o = { path: path.join(OUT, file), type: 'png' };
  // A clip must not resize the page (captureBeyondViewport would reflow the app's layout).
  if (opts.clip) { o.clip = opts.clip; o.captureBeyondViewport = false; }
  if (opts.fullPage) o.fullPage = true;
  await page.screenshot(o);
  const vp = page.viewport();
  const size = opts.clip ? `${Math.round(opts.clip.width * vp.deviceScaleFactor)}×${Math.round(opts.clip.height * vp.deviceScaleFactor)} px (clip at @${vp.deviceScaleFactor}x)`
    : opts.fullPage ? `${vp.width} wide @${vp.deviceScaleFactor}x, full page` : `${vp.width}×${vp.height} @${vp.deviceScaleFactor}x`;
  index.push({ id, file, ...meta, size, vsAugust: VS_AUGUST[id] || '' });
  log('still', file);
}

// The exported app build: the demo repo commit whose index.html / q.html the export equals.
function appBuild() {
  const out = { indexSha: null, demoCommit: null };
  try {
    const exp = fs.readFileSync(path.join(APP_DIR, 'demo-main-index.html'), 'utf8').replace(/\r\n/g, '\n');
    out.indexSha = crypto.createHash('sha256').update(exp).digest('hex').slice(0, 12);
    const DEMO = 'C:/dev/floorlogicdemo';
    if (fs.existsSync(DEMO)) {
      const blob = execFileSync('git', ['-C', DEMO, 'show', 'origin/main:index.html'], { encoding: 'utf8', maxBuffer: 64 << 20 }).replace(/\r\n/g, '\n');
      const head = execFileSync('git', ['-C', DEMO, 'log', '-1', '--format=%h %cs %s', 'origin/main'], { encoding: 'utf8' }).trim();
      out.demoCommit = blob === exp ? `floorlogicdemo origin/main ${head}` : `differs from floorlogicdemo origin/main (${head})`;
    }
  } catch (e) { out.demoCommit = 'unknown (' + e.message.split('\n')[0] + ')'; }
  return out;
}

// ------------------------------------------------------------------ run --
let job = null, inv0 = null;
try {
  const p0 = await park();
  await p0.evaluate(() => window.__flStub.reseed());
  const token = FX.story.quoteSent.public_token;
  // Off camera, Oct 14 10:05: Marisol measured (912 SqFt), marked the floor "Pick One",
  // saved, marked it sent and made the customer link.
  await story('QT-330 measured + sent', async (p) => {
    const rows = await db(p, 'quotes');
    await dbWrite(p, 'quotes', rows.map((q) => (q.id === FX.story.quoteSent.id ? FX.story.quoteSent : q)));
  });

  // ---- Wed Oct 14, 10:20 — the office ---------------------------------------------------
  let page = await deskPage(PT(DAY.quoteDrafted, '10:20'));
  await openApp(page, 'dashboard');
  check('dashboard: widgets rendered', (await page.$$('.dash-widget')).length >= 8, String((await page.$$('.dash-widget')).length));
  await shot(page, '08', 'dashboard', { what: 'Dashboard — the starter "Main" layout: New Leads, Active Jobs, Outstanding, Revenue (Paid), My Work Today, Schedule; calendar below the fold', route: '#dashboard', when: 'Wed Oct 14 2026, 10:20' });
  {
    const b = await (await page.$('#sidebar')).boundingBox();
    await shot(page, '09', 'sidebar-menu', { what: 'The navy sidebar menu, full height: Company / Clients / Documents / Finances / Inventory / Settings, new FloorLogic lockup', route: '#dashboard (clip of #sidebar from the 1920×1080 frame)', when: 'Wed Oct 14 2026, 10:20' }, { clip: { x: b.x, y: b.y, width: b.width, height: b.height } });
  }

  await openApp(page, 'leads?leadView=pipeline');
  await shot(page, '01', 'leads-board', { what: 'Leads → Pipeline (kanban): New · Site Survey Scheduled · Send Quote · Follow-up · Approved; LD-056 Dev & Anjali Prasad in Send Quote (1 quote, 1 sample)', route: '#leads?leadView=pipeline', when: 'Wed Oct 14 2026, 10:20' });
  await openApp(page, 'leads');
  await shot(page, '01b', 'leads-list', { what: 'Leads → List View (the default): quick-add bar, sortable list, LD-051 in the side panel, stage cards along the bottom', route: '#leads', when: 'Wed Oct 14 2026, 10:20' });

  await openApp(page, 'lead-detail/ld-16');
  await shot(page, '02', 'lead-detail', { what: 'Lead LD-056 Dev & Anjali Prasad — CRM view: header actions, stat tiles, tabs; Quotes tab with QT-330 ($7,571.93, Sent)', route: '#lead-detail/ld-16', when: 'Wed Oct 14 2026, 10:20' });
  {
    const tab = await byText(page, '#content .tab, #content button, #content [onclick]', 'Notes');
    if (tab) { await tab.click(); await settle(page, 300); await shot(page, '02b', 'lead-detail-notes', { what: 'Lead LD-056 — Notes tab (Home Show + site-survey notes)', route: '#lead-detail/ld-16 → Notes tab', when: 'Wed Oct 14 2026, 10:20' }); }
    else check('lead detail: Notes tab found', false, 'no Notes tab');
  }

  await openApp(page, 'quote-builder?editId=qt-330');
  {
    const top = await contentTopOf(page, '.qb-section-menu-btn');
    check('builder: first section found', top != null, String(top));
    if (top != null) await scrollContent(page, Math.round(top - 140));
    const txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    const gt = (txt.match(/GRAND TOTAL \$[\d,]+\.\d\d/i) || [''])[0];
    check('builder: grand total = dataset (as sent)', gt.includes(money(FX.expected.quoteSent.total)), gt);
    for (const h of FX.expected.cartonHints) check(`builder: carton hint "${h}"`, txt.includes(h), h);
    await shot(page, '03', 'quote-builder', { what: 'QT-330 in the quote builder — "Pick One" floor section (Good / Better / Best LVP with carton hints for 912 SqFt), quote-total rail (grand total $7,571.93 as sent)', route: '#quote-builder?editId=qt-330 (scrolled to the first section)', when: 'Wed Oct 14 2026, 10:20' });
    const lab = await contentTopOfText(page, /^LVP Installation$/);
    check('builder: Install & prep labor found', lab != null, String(lab));
    if (lab != null) await scrollContent(page, Math.round(lab - 150));
    await shot(page, '03b', 'quote-builder-stairs', { what: 'QT-330 builder, further down — Install & prep labor (912 SqFt) and the optional "Stairs — carpet" section: 12\' roll cut 14\' 6" (19.33 SqYd), pad, 13 stair steps', route: '#quote-builder?editId=qt-330 (scrolled to the labor lines)', when: 'Wed Oct 14 2026, 10:20' });
  }

  // Caspar: its home screen, then the builder's "Edit with Caspar" (the open quote becomes
  // Caspar's draft). Both are local: no voice session, no AI call, nothing saved.
  await openApp(page, 'caspar');
  await page.waitForFunction(() => !!window.Caspar, { timeout: 10000 });
  await settle(page, 600);
  await shot(page, '12b', 'caspar-home', { what: 'Caspar (beta) home — Talk to Caspar / Scan a written quote / chat (nothing started)', route: '#caspar', when: 'Wed Oct 14 2026, 10:20' });
  await openApp(page, 'quote-builder?editId=qt-330');
  await clickText(page, 'button', 'Edit with Caspar', 'Edit with Caspar');
  await page.waitForFunction(() => currentView === 'caspar', { timeout: 10000 });
  await settle(page, 1200);
  await shot(page, '12', 'caspar-quote-panel', { what: 'Caspar\'s quote panel — QT-330 handed over from the builder: chat pane (not listening) + "Quote draft" (lines, totals; the Pick One and optional sections are kept aside). Static: no AI call', route: '#quote-builder?editId=qt-330 → "Edit with Caspar"', when: 'Wed Oct 14 2026, 10:20' });
  {
    const q = (await db(page, 'quotes')).find((x) => x.id === FX.story.quoteSent.id);
    check('caspar: QT-330 untouched in the store', q && q.status === 'sent' && Math.abs(q.total - FX.expected.quoteSent.total) < 0.005, q && `${q.status} ${q.total}`);
  }

  // ---- Thu Oct 15, 12:20 — the Prasads on a phone ---------------------------------------
  await park();
  const phone = await iso.newPage({ ...PHONE, clock: PT(DAY.approved, '12:20') });
  phone.on('dialog', async (d) => { log('PHONE DIALOG', d.message()); await d.accept(); });
  await phone.goto(`${iso.origin}/q.html?t=${token}`, { waitUntil: 'load' });
  await phone.waitForSelector('#approve-btn', { timeout: 15000 });
  await settle(phone, 400);
  await shot(phone, '04', 'customer-quote-phone', { what: 'QT-330 as the customer sees it on a phone (q.html): FloorLogic header, quote number, rep, bill-to, the Pick One floor options', route: `/q.html?t=${token}`, when: 'Thu Oct 15 2026, 12:20' }, { phone: true });
  await tap(phone, `tr.mc-row[data-mc-key="${FX.story.pickOneRow}"]`, 'Pick Better');
  await settle(phone, 250);
  check('phone: Better selected', await phone.evaluate((k) => !!document.querySelector(`tr.mc-row-selected[data-mc-key="${k}"]`), FX.story.pickOneRow));
  await tap(phone, 'label.opt-toggle input[type=checkbox]', 'Add the stairs');
  await settle(phone, 250);
  check('phone: stairs added', await phone.evaluate(() => { const c = document.querySelector('label.opt-toggle input[type=checkbox]'); return !!(c && c.checked); }));
  const liveTotal = await phone.evaluate(() => (document.body.innerText.match(/TOTAL\s*\$[\d,]+\.\d\d/g) || []).join(' | ').replace(/\s+/g, ' '));
  check('phone: live total = dataset (Better + stairs)', liveTotal.includes(money(FX.expected.quoteApprovedTotal)), liveTotal);
  await phone.evaluate(() => window.scrollTo(0, 0));
  await shot(phone, '04b', 'customer-quote-phone-full', { what: 'QT-330 on the phone, whole page after the customer picked Better and added the stairs: live total $8,624.70, terms, Approve Quote', route: `/q.html?t=${token} → tap Better, tap "Add to my quote"`, when: 'Thu Oct 15 2026, 12:20' }, { phone: true, fullPage: true });
  await tap(phone, '#approve-btn', 'Approve Quote');
  await phone.waitForFunction(() => document.getElementById('toast') && document.getElementById('toast').classList.contains('show'), { timeout: 5000 }).catch(() => {});
  await phone.waitForNavigation({ waitUntil: 'load', timeout: 10000 }).catch(() => {});
  await phone.waitForSelector('.approved-stamp', { timeout: 15000 }).catch(() => {});
  await settle(phone, 300);
  const q2 = (await db(phone, 'quotes')).find((x) => x.id === FX.story.quoteSent.id);
  check('phone: QT-330 approved in the store', q2 && q2.status === 'approved', q2 && `${q2.status} ${JSON.stringify(q2.selected_options)}`);
  await shot(phone, '04c', 'customer-quote-approved', { what: 'QT-330 on the phone right after "Approve Quote": Quote Approved, selected options, locked', route: `/q.html?t=${token} → Approve Quote`, when: 'Thu Oct 15 2026, 12:21' }, { phone: true });
  await phone.close();

  // ---- Thu Oct 15, 13:05 — the office turns the approval into WO-330 + IN-330 -------------
  page = await deskPage(PT(DAY.approved, '13:05'));
  await openApp(page, 'quote-builder?editId=qt-330');
  await clickSel(page, '#convert-approved-quote', 'Create WO & Invoice');
  await page.waitForSelector('#confirm-convert-quote', { visible: true, timeout: 5000 });
  await settle(page, 300);
  await shot(page, '05a', 'convert-approved-quote', { what: 'QT-330 approved by the customer → "Create the work order and invoice for QT-330?" (makes WO-330 + IN-330, turns the lead into a customer)', route: '#quote-builder?editId=qt-330 → "Create WO & Invoice"', when: 'Thu Oct 15 2026, 13:05' });
  await clickSel(page, '#confirm-convert-quote', 'Create Work Order & Invoice');
  await page.waitForFunction((n) => (data.jobs || []).some((j) => j.number === n), { timeout: 10000 }, FX.expected.workOrderNumber);
  await settle(page, 600);
  const convToast = await toastText(page);
  check('convert: toast = dataset', convToast.includes(FX.expected.approvalToast), convToast);
  await flush(page);
  job = (await db(page, 'jobs')).find((j) => j.number === FX.expected.workOrderNumber);
  inv0 = (await db(page, 'invoices')).find((i) => i.number === FX.expected.invoiceNumber);
  check('convert: WO-330 created', !!job, job && job.status);
  check('convert: IN-330 created', !!inv0, inv0 && `${inv0.subtotal} + ${inv0.tax} = ${inv0.total}`);
  if (!job || !inv0) throw new Error('conversion did not produce WO-330 / IN-330');
  check('IN-330 total = dataset', Math.abs(inv0.total - FX.expected.invoice.total) < 0.005, `${inv0.total} vs ${FX.expected.invoice.total}`);
  if (inv0.total !== FX.expected.invoice.total) note(`IN-330 stores an unrounded total (${inv0.total}; subtotal ${inv0.subtotal}); the dataset's is ${FX.expected.invoice.total}. After the balance is recorded the invoice shows "Balance Due $-0.00".`);
  const ld = (await db(page, 'leads')).find((l) => l.id === FX.story.quoteSent.lead_id);
  check('convert: LD-056 left the board (now a customer)', !ld, ld ? ld.status : 'converted');

  page = await deskPage(PT(DAY.approved, '13:10'));
  await openApp(page, `job-detail/${job.id}`);
  check('WO-330: "Order Materials" is the next step', !!(await byText(page, 'button[onclick^="openOrderMaterialsModal"]', 'Order Materials')));
  const woTxt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  check('WO-330: total at cost = dataset estimate', woTxt.includes(money(FX.expected.jobCosting.estimate)), money(FX.expected.jobCosting.estimate));
  await shot(page, '05', 'work-order', { what: 'WO-330 right after the conversion — status Order Materials; the header\'s next-step button "📦 Order Materials"; lines from the customer\'s picks (Better + stairs); total $4,883.79 at cost', route: `#job-detail/${job.id}`, when: 'Thu Oct 15 2026, 13:10' });

  // ---- Thu Oct 15, 13:20 — the phone app ----------------------------------------------
  await park();
  const mob = await iso.newPage({ ...PHONE, clock: PT(DAY.approved, '13:20') });
  mob.on('dialog', async (d) => { log('MOBILE DIALOG', d.message()); await d.dismiss(); });
  await mob.goto(`${iso.origin}/mobile`, { waitUntil: 'load' });
  await mob.waitForFunction(() => typeof currentView !== 'undefined' && /^m-/.test(String(currentView)), { timeout: 20000 });
  await settle(mob, 800);
  await shot(mob, '10', 'mobile-home', { what: 'The /mobile phone app — Today: greeting, stat tiles (open leads, quotes out, won this month), surveys coming up, new leads to call, ready to quote, recent wins; bottom tab bar', route: '/mobile (#/today)', when: 'Thu Oct 15 2026, 13:20' }, { phone: true });
  await tap(mob, await mustText(mob, '#m-tabs a, #m-tabs button, #m-tabs [onclick]', 'Projects'), 'Projects tab');
  await settle(mob, 700);
  await shot(mob, '11', 'mobile-projects', { what: 'The /mobile phone app — Projects tab: its menu (Quotes · Work orders · Invoices, with counts)', route: '/mobile → Projects tab', when: 'Thu Oct 15 2026, 13:20' }, { phone: true });
  await tap(mob, await mustText(mob, 'button, a, [onclick]', 'Work orders'), 'Work orders');
  await settle(mob, 800);
  await shot(mob, '11b', 'mobile-work-orders', { what: 'The /mobile phone app — Projects → Work orders list (WO-330 at the top, Order Materials)', route: '/mobile → Projects → Work orders', when: 'Thu Oct 15 2026, 13:20' }, { phone: true });
  {
    const row = await byText(mob, '#m-main a, #m-main button, #m-main [onclick]', FX.expected.workOrderNumber);
    if (row) {
      await tap(mob, row, 'WO-330');
      await settle(mob, 800);
      await shot(mob, '11c', 'mobile-work-order', { what: 'The /mobile phone app — WO-330 on the phone (status, customer, install list, linked quote / invoice)', route: '/mobile → Projects → Work orders → WO-330', when: 'Thu Oct 15 2026, 13:20' }, { phone: true });
    } else check('mobile: WO-330 in the work-order list', false, 'not found');
  }
  await mob.close();

  // Off camera, that evening: the Prasads pay the 50% deposit on the live invoice.
  await story('deposit paid online by card', async (p) => {
    const rows = await db(p, 'invoices');
    const inv = rows.find((i) => i.id === inv0.id);
    inv.payments = [FX.story.depositPayment]; inv.amount_paid = FX.story.depositPayment.amount; inv.status = 'deposit';
    await dbWrite(p, 'invoices', rows);
  });

  // ---- Fri Oct 16 — Order Materials (the app writes the POs) ----------------------------
  page = await deskPage(PT('2026-10-16', '09:20'));
  await openApp(page, `job-detail/${job.id}`);
  await clickSel(page, 'button[onclick^="openOrderMaterialsModal"]', 'Order Materials');
  await page.waitForSelector('#modal-overlay.active', { timeout: 5000 });
  await settle(page, 300);
  await clickSel(page, '#modal input[type=checkbox][onchange^="_omToggleSelectAll"]', 'Select all');
  await settle(page, 300);
  await shot(page, '05b', 'order-materials', { what: 'WO-330 → Order Materials: every line ticked (LVP, base, carpet, pad) with PO #, order date, est. delivery, before Finish', route: `#job-detail/${job.id} → "Order Materials" → Select all`, when: 'Fri Oct 16 2026, 09:20' });
  await clickSel(page, '#modal .modal-footer button.btn-primary', 'Finish');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await settle(page, 400);
  await flush(page);
  let j = (await db(page, 'jobs')).find((x) => x.id === job.id);
  // owner rule 2026-10-13: the last line going on order moves the job on to Ready to Schedule
  check('WO-330 out of Materials (all lines ordered → Ready to Schedule)', j.status === 'ready_to_schedule', j.status);
  const pos = (await db(page, 'job_pos')).filter((x) => x.job_id === job.id);
  check('Order Materials made 4 POs', pos.length === 4, pos.map((x) => `${x.number} ${x.mat_num} ${x.qty}`).join(', '));
  { const app = pos.map((x) => x.number).sort().join(', '), ds = XS.poNumbers.slice().sort().join(', '); check('WO-330 POs numbered like the dataset', app === ds, `app ${app} · dataset ${ds}`); }

  // Off camera, Oct 19: everything arrives (base as 12 × 16 ft sticks); freight paid. Receiving
  // a PO also marks its work-order line in (matReceivedAt), as the app's own receive does.
  const costs = FX.story.jobCosts.map((c) => ({ ...c, job_id: job.id, job_number: job.number }));
  await story('materials received + freight', async (p) => {
    const all = await db(p, 'job_pos');
    await dbWrite(p, 'job_pos', all.map((x) => {
      if (x.job_id !== job.id) return x;
      const qty = FX.story.poQty[x.mat_num] != null ? FX.story.poQty[x.mat_num] : x.qty;
      return { ...x, qty, total_cost: Math.round(qty * x.cost * 100) / 100, freight: XS.poFreight[x.mat_num] || 0, status: 'received', received_at: FX.story.poReceivedAt };
    }));
    const jobs = await db(p, 'jobs');
    await dbWrite(p, 'jobs', jobs.map((x) => (x.id !== job.id ? x : { ...x, materials: (x.materials || []).map((m) => ({ ...m, matReceivedAt: FX.story.poReceivedAt })) })));
    const jc = await db(p, 'job_costs');
    await dbWrite(p, 'job_costs', jc.concat(costs.filter((c) => c.kind === 'freight')));
  });

  // ---- Mon Oct 19 — Schedule Install: Oct 21, Ruben -------------------------------------
  page = await deskPage(PT(DAY.materialsIn, '08:40'));
  await openApp(page, `job-detail/${job.id}`);
  for (let i = 0; i < 2 && j.status !== 'scheduled'; i++) {
    await clickSel(page, 'button[onclick^="openScheduleJobModal"]', 'Schedule Install');
    await page.waitForSelector('#modal-overlay.active', { timeout: 5000 });
    if (await page.$('#sched-installer')) await page.select('#sched-installer', FX.story.installer.id);
    const setDate = (sel, v) => page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    if (await page.$('#sched-date')) await setDate('#sched-date', FX.story.installDate);
    if (await page.$('#sched-end')) await setDate('#sched-end', XS.installEnd);
    await settle(page, 200);
    if (i === 0) await shot(page, '05d', 'schedule-install', { what: 'WO-330 → Schedule Install: start Oct 21, end Oct 22 (2-day install), installer Ruben Ortiz', route: `#job-detail/${job.id} → "Schedule Install"`, when: 'Mon Oct 19 2026, 08:40' });
    await clickSel(page, '#modal .modal-footer .btn-primary', 'Schedule');
    await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
    await settle(page, 300);
    await flush(page);
    j = (await db(page, 'jobs')).find((x) => x.id === job.id);
  }
  check('WO-330 scheduled for the install dates with Ruben', j.status === 'scheduled' && j.scheduled_date === FX.story.installDate && Number(j.duration_days) === Math.round((Date.parse(XS.installEnd) - Date.parse(XS.installStart)) / 864e5) + 1 && j.crew === FX.story.installer.id, `${j.status} ${j.scheduled_date} ${j.duration_days}d crew=${j.crew}`);

  // Off camera, Oct 21: install supplies bought.
  await story('install supplies', async (p) => { const jc = await db(p, 'job_costs'); await dbWrite(p, 'job_costs', jc.concat(costs.filter((c) => c.kind === 'supply'))); });

  // ---- Thu Oct 22 — the job is done → the final invoice ---------------------------------
  // The app moves a work order to Final Invoice by itself the day after the install ends
  // (_plAutoAdvanceSweep, "exactly Mark Job Complete"); the button is pressed only if not.
  page = await deskPage(PT(DAY.complete, '16:10'));
  await openApp(page, `job-detail/${job.id}`);
  if (await page.$('button[onclick^="completeJob"]')) { await clickSel(page, 'button[onclick^="completeJob"]', 'Mark Job Complete'); await settle(page, 500); }
  else log('WO-330 already moved to Final Invoice by the app (day after the install)');
  await shot(page, '05c', 'work-order-final-invoice', { what: 'WO-330 the day after the install — moved to Final Invoice by the app itself; header button "📄 View Final Invoice"', route: `#job-detail/${job.id}`, when: 'Thu Oct 22 2026, 16:10' });
  await clickText(page, '.qb-header-bar button', 'View Final Invoice', 'View Final Invoice');
  await page.waitForFunction(() => currentView === 'invoice-detail', { timeout: 5000 });
  await settle(page, 400);
  await flush(page);
  j = (await db(page, 'jobs')).find((x) => x.id === job.id);
  check('WO-330 at final invoice', j.status === 'final_invoice', j.status);
  let inv = (await db(page, 'invoices')).find((i) => i.id === inv0.id);
  if (!inv.final_invoice) { const fin = await page.$('#ib-final-btn'); if (fin) { await fin.click(); await settle(page, 300); await flush(page); } inv = (await db(page, 'invoices')).find((i) => i.id === inv0.id); }
  check('IN-330 marked final', !!inv.final_invoice, String(inv.final_invoice));

  // ---- Fri Oct 23 — IN-330: terms + record the balance by check -------------------------
  page = await deskPage(PT(FX.story.balanceCheck.date, '11:20'));
  await openApp(page, `invoice-detail/${inv0.id}`);
  await shot(page, '06', 'invoice', { what: 'IN-330 (final invoice) — Deposit status, Take Payment, payment terms 50% / 50%, totals rail: paid $4,312.35, balance due $4,312.35', route: `#invoice-detail/${inv0.id}`, when: 'Fri Oct 23 2026, 11:20' });
  {
    const termsTop = await contentTopOfText(page, /^TERMS & CONDITIONS$|^Terms & Conditions$/);
    check('invoice: terms block found', termsTop != null, String(termsTop));
    if (termsTop != null) {
      await scrollContent(page, Math.round(termsTop - 420));
      await shot(page, '06a', 'invoice-terms-payments', { what: 'IN-330 further down — total, paid, BALANCE DUE, Terms & Conditions (tickable), payment schedule', route: `#invoice-detail/${inv0.id} (scrolled to the terms)`, when: 'Fri Oct 23 2026, 11:20' });
      await scrollContent(page, 0);
    }
  }
  const take = (await page.$$('button[onclick^="openTakePaymentModal"]'))[0];
  if (!take) throw new Error('invoice: no Take Payment button');
  await take.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await take.click();
  await page.waitForSelector('#pay-method', { timeout: 5000 });
  const amt = await page.$eval('#pay-amt', (el) => el.value);
  check('Take Payment pre-fills the balance', Math.abs(Number(amt) - FX.story.balanceCheck.amount) < 0.005, amt);
  await page.select('#pay-method', 'Check');
  await settle(page, 150);
  await page.click('#pay-checkno');
  await page.keyboard.type(FX.story.balanceCheck.checkNumber);
  await settle(page, 200);
  await shot(page, '06b', 'record-payment', { what: 'IN-330 → Take Payment → Record Payment: balance $4,312.35 pre-filled, Check #2318 (the Charge Card tab is hidden)', route: `#invoice-detail/${inv0.id} → Take Payment`, when: 'Fri Oct 23 2026, 11:20' });
  await clickSel(page, '#pay-confirm-btn', 'Record Payment');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await settle(page, 500);
  await shot(page, '06c', 'invoice-paid', { what: 'IN-330 after the check — Paid, "Paid in Full", toast "Payment of $4,312.35 recorded on IN-330"', route: `#invoice-detail/${inv0.id} → Record Payment`, when: 'Fri Oct 23 2026, 11:21' });
  await flush(page);
  inv = (await db(page, 'invoices')).find((i) => i.id === inv0.id);
  const paidSum = (inv.payments || []).reduce((a, p) => a + Number(p.amount || 0), 0);
  check('IN-330 paid in full', inv.status === 'paid' && Math.abs(paidSum - FX.expected.invoice.total) < 0.005, `${inv.status} ${paidSum.toFixed(2)} in ${inv.payments.length} payments`);

  // Off camera, Oct 26: Ruben's install is recorded and paid out.
  await story('installer labor recorded + paid', async (p) => {
    const jc = (await db(p, 'job_costs')).filter((c) => c.job_id !== job.id);
    await dbWrite(p, 'job_costs', jc.concat(costs));
  });

  // ---- Mon Oct 26 — job costing for WO-330 ------------------------------------------------
  page = await deskPage(PT(DAY.payout, '10:00'));
  await openApp(page, 'job-costing');
  await shot(page, '07b', 'job-costing-list', { what: 'Job Costing list — estimate vs actual per job, commission due; WO-330 ready to be paid', route: '#job-costing', when: 'Mon Oct 26 2026, 10:00' });
  {
    const row = await page.evaluateHandle((num) => {
      const w = document.createTreeWalker(document.getElementById('content'), NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { if (n.textContent.trim() === num && n.parentElement.offsetParent) { let el = n.parentElement; while (el && el.tagName !== 'TR' && !el.hasAttribute('onclick')) el = el.parentElement; return el; } }
      return null;
    }, FX.expected.workOrderNumber);
    if (!row.asElement()) throw new Error('job costing list: no WO-330 row');
    await row.asElement().click();
    await page.waitForFunction(() => currentView === 'job-costing-detail', { timeout: 5000 });
    await settle(page, 500);
    const txt = (await page.evaluate(() => document.querySelector('#content').innerText)).replace(/\s+/g, ' ');
    const E = FX.expected.jobCosting;
    check('costing: estimate = dataset', txt.includes(money(E.estimate)), money(E.estimate));
    check('costing: actual = dataset', txt.includes(money(E.actual)), money(E.actual));
    check('costing: variance = dataset', txt.includes(E.variance), E.variance);
    if (!txt.includes(money(E.profit))) note(`Job costing shows profit ${(txt.match(/PROFIT \$[\d,]+\.\d\d/i) || ['?'])[0].replace(/^PROFIT /i, '')} for WO-330; the site dataset says ${money(E.profit)}.`);
    await shot(page, '07', 'job-costing', { what: 'Job costing for WO-330 — revenue, estimate $4,883.79 vs actual $5,072.92 (+$189.13), estimate-vs-actual buckets, recorded costs, profit, commission, billing (paid in full)', route: `#job-costing → WO-330 (job-costing-detail/${job.id})`, when: 'Mon Oct 26 2026, 10:00' });
  }
} catch (e) {
  failures.push('EXCEPTION ' + e.message);
  log('ERROR', e.stack);
  if (desk) await desk.screenshot({ path: path.join(OUT, '_error.png') }).catch(() => {});
} finally {
  await iso.browser.close();
  srv.server.close();
}
let isolation = 'ISOLATION OK';
try { iso.assertClean(); } catch (e) { isolation = e.message; process.exitCode = 2; }
if (iso.pageErrors.length) failures.push(`${iso.pageErrors.length} page error(s): ` + JSON.stringify(iso.pageErrors.slice(0, 5)));

// ------------------------------------------------------------------ INDEX.md --
index.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
const build = appBuild();
// The app names the work order and invoice it creates ('j' / 'i' + a timestamp): show the role.
const route = (r) => { let s = r; if (job) s = s.split(job.id).join('{WO-330 id}'); if (inv0) s = s.split(inv0.id).join('{IN-330 id}'); return s; };
const today = new Date().toLocaleDateString('en-CA');
const answered = [...new Set(iso.isoLog.filter((e) => e.kind === 'answered-locally').map((e) => `${e.url.replace(/\?.*$/, '?…')} → ${e.with}`))];
const md = [
  '# FloorLogic app — reference screenshots',
  '',
  `Captured ${today} by \`capture/screens.mjs\`, fully offline (127.0.0.1 + the in-memory Supabase stand-in), from the Pinyon Flooring Co. fixture.`,
  '',
  `- App build: \`app-export/demo-main-index.html\` sha256 ${build.indexSha}… = ${build.demoCommit || 'unknown'}`,
  `- Fixture: \`harness/fixture.json\` (${FX.seedId}), built by \`tools/export-fixture.mjs\``,
  '- Desktop 1920×1080 CSS px @1.5x (2880×1620 PNG); phone 390×844 @3x (1170×2532 PNG). Times are the harness clock (America/Los_Angeles).',
  '- Routes: a hash is the desktop app (`/index.html#…`); `{WO-330 id}` / `{IN-330 id}` are the ids the app gives the work order and invoice it creates (new every run).',
  `- Every frame passed the camera checks (banned words, hidden controls, only 555-01xx / 555-05xx numbers and .test e-mail, new logo). ${isolation}.`,
  '- "Different from August" lists only differences that are certain (the August harness did it differently, or the app\'s dated change notes put the feature after August); "—" means not compared.',
  '',
  '| File | What it shows | How it was reached | When (story clock) | Size | Different from August |',
  '|---|---|---|---|---|---|',
  ...index.map((r) => `| \`${r.file}\` | ${r.what} | \`${route(r.route)}\` | ${r.when} | ${r.size} | ${r.vsAugust || '—'} |`),
  '',
  '## Dataset vs app (noticed while capturing)',
  '',
  ...(notes.length ? notes.map((n) => `- ${n}`) : ['- none']),
  '',
  '## Outside requests answered locally (nothing left the machine)',
  '',
  ...answered.map((a) => `- ${a}`),
  '',
  ...(failures.length ? ['## FAILURES', '', ...failures.map((f) => `- ${f}`), ''] : []),
].join('\n');
if (!ONLY) fs.writeFileSync(path.join(OUT, 'INDEX.md'), md);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ created: new Date().toISOString(), build, index, notes, failures, pageErrors: iso.pageErrors }, null, 1));

log(isolation + ' — ' + iso.isoLog.filter((e) => e.kind === 'answered-locally').length + ' answered locally, ' + iso.unansweredAttempts().length + ' unanswered');
if (failures.length) { log('FAILURES:\n  ' + failures.join('\n  ')); process.exitCode = process.exitCode || 1; }
else log(`ALL CHECKS PASSED — ${index.length} screenshots in ${OUT}`);
