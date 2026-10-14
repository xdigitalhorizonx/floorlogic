// Film the REAL FloorLogic app (live `main` index.html / q.html) offline, scene by scene.
//   node run.mjs [--scenes=leads,quote,approve,wo,pay,cost] [--fixture=path] [--keep]
// Every click/tap/keystroke below is a real input event in the real app. Between scenes,
// rows for things that happen OFF camera (deposit paid online, POs arriving, job costs)
// are written into the offline store from the shared dataset (fixture.story).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../harness/server.mjs';
import { launchIsolated } from '../harness/browser.mjs';
import { stubSource } from '../harness/stub-source.mjs';
import { makeRecorder, settle, boxOf, byText, mustText, click, type } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const FIXTURE = path.resolve(args.fixture || path.join(HERE, '..', 'harness', 'fixture.json'));
process.env.FL_FIXTURE = FIXTURE;
const FX = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const SCENES = String(args.scenes || 'leads,quote,approve,wo,pay,cost').split(',');
const OUT = HERE;
if (!args.keep) fs.rmSync(path.join(OUT, 'stills'), { recursive: true, force: true });
const rec = makeRecorder(OUT);
const log = (...a) => console.log('[capture]', ...a);
const PT = (iso, hm) => Date.parse(`${iso}T${hm}:00-07:00`);
const DAY = FX.story.days;
// 1920x1080 CSS (a plain 1080p monitor): below ~1800 px the work-order header's step button
// overlaps its own title (measured: 1440/1600/1680/1760 overlap, 1800+ clear). 1.6x pixels
// keep the camera's zoom-ins crisp.
const DESK = { width: 1920, height: 1080, dpr: 1.6 };
const PHONE = { width: 390, height: 797, dpr: 3 };      // screen below a drawn status bar

const srv = await startServer({ log: (e) => { if (e.kind !== '404' || !/favicon/.test(e.path)) log('server', JSON.stringify(e)); } });
const iso = await launchIsolated({ port: srv.port, freezeAt: PT(DAY.quoteDrafted, '09:41'), logPath: path.join(OUT, 'isolation.jsonl'), stubSource });
fs.writeFileSync(path.join(OUT, 'isolation.jsonl'), '');
const failures = [];
const check = (name, ok, detail) => { log((ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' — ' + detail : '')); if (!ok) failures.push(name + ' — ' + detail); };

let desk = null;
async function deskPage(clockMs) {
  if (!desk) desk = await iso.newPage({ ...DESK, clock: clockMs });
  else await iso.setClock(desk, clockMs);
  desk.removeAllListeners('dialog');
  desk.on('dialog', async (d) => { log('DIALOG', d.type(), JSON.stringify(d.message())); rec.note({ dialog: d.type(), message: d.message() }); await d.accept(); });
  return desk;
}
// Always a FULL page load (a hash-only goto would just re-route inside the running app and
// keep its clock, toasts and memory): save, park on the store page, then open the app.
async function openApp(page, hash) {
  if (page === desk) await park();
  await page.goto(`${iso.origin}/index.html#${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof currentView !== 'undefined' && document.querySelector('#content') && document.querySelector('#content').children.length > 0, { timeout: 20000 });
  // the product catalog loads right after first paint and re-renders product views
  await page.waitForFunction(() => typeof _productCatalogState === 'undefined' || _productCatalogState === 'ready' || _productCatalogState === 'failed', { timeout: 20000 });
  await settle(page, 500);
}
const db = (page, t) => page.evaluate((t) => window.__flStub.table(t), t);
const dbWrite = (page, t, rows) => page.evaluate((t, rows) => window.__flStub.write(t, rows), t, rows);
async function flush(page) { await page.evaluate(async () => { if (typeof _flushPendingSave === 'function') await _flushPendingSave(); }); await settle(page, 200); }
// Close the app in the desk tab (after saving) and open the bare store page. External
// writes (the customer's approval, off-camera story rows) only ever happen in this state,
// so no app tab holding older data can write over them.
async function park() {
  if (!desk) desk = await iso.newPage({ ...DESK });
  if (await desk.evaluate(() => typeof _flushPendingSave === 'function').catch(() => false)) await flush(desk);
  await desk.goto(`${iso.origin}/__harness/db.html`, { waitUntil: 'load' });
  await desk.waitForFunction(() => !!window.__flStub, { timeout: 10000 });
  return desk;
}
async function story(label, fn) { const p = await park(); await fn(p); rec.note({ story: label }); log('story (off camera):', label); }
async function toastText(page) { return page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).join(' | ')); }

// Boxes (CSS px, viewport) of elements the camera should frame, recorded with each still.
async function focus(page, specs) {
  await settle(page, 0);                                          // measure after entrance animations
  return page.evaluate((specs) => {
    const out = {};
    const vis = (e) => !!(e && (e.offsetParent || getComputedStyle(e).position === 'fixed'));
    for (const [name, q] of Object.entries(specs)) {
      let el = null;
      if (q.sel) { const els = [...document.querySelectorAll(q.sel)].filter(vis); el = q.last ? els[els.length - 1] : els[0]; }
      if (q.text) {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
        const want = q.text.toLowerCase();
        while ((n = w.nextNode())) { const t = n.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); if ((q.exact ? t === want : t.includes(want)) && vis(n.parentElement)) { el = n.parentElement; if (!q.last) break; } }
      }
      if (el && q.closest) el = el.closest(q.closest) || el;
      if (el) { const r = el.getBoundingClientRect(); out[name] = { x: r.x, y: r.y, w: r.width, h: r.height }; }
    }
    return out;
  }, specs);
}

async function clickMenuItem(page, text, label) {
  const h = await mustText(page, '.qb-row-menu button', text);
  return click(rec, page, h, label || text);
}
async function scrollContentTo(page, y) { await page.evaluate((y) => { document.getElementById('content').scrollTop = y; }, y); await settle(page, 150); }
// A real scroll of the app's content pane, filmed as a sequence of stills (eased), so the
// compositor can play it back as motion instead of a cut.
async function scrollSeq(page, to, n, name) {
  const from = await page.evaluate(() => document.getElementById('content').scrollTop);
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const files = [];
  for (let i = 1; i <= n; i++) {
    const y = Math.round(from + (to - from) * ease(i / n));
    await page.evaluate((y) => { document.getElementById('content').scrollTop = y; }, y);
    files.push(await rec.still(page, `${name}-${String(i).padStart(2, '0')}`, { seq: name, scrollTop: y }));
  }
  rec.note({ scrollSeq: name, from, to, frames: files });
  return files;
}

// ------------------------------------------------------------- scene: leads board
async function sceneLeads() {
  rec.begin('leads', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr });
  const page = await deskPage(PT(DAY.quoteDrafted, '09:41'));
  await openApp(page, 'leads');
  const LEAD = 'ld-19';                                         // LD-059 Meadowbrook Villas HOA (Follow-up)
  // Bring the Approved column fully into view (a plain horizontal scroll of the board).
  await page.evaluate(() => {
    const col = document.querySelector(`.kanban-col[ondrop="kanbanDrop(event,'approved')"]`);
    let el = col.parentElement;
    while (el && !(el.scrollWidth > el.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowX))) el = el.parentElement;
    if (el) el.scrollLeft = Math.max(0, col.offsetLeft + col.offsetWidth - el.clientWidth + 24);
  });
  await settle(page, 200);
  const card = await page.$(`.kanban-card[ondragstart*="'${LEAD}'"]`);
  const col = await page.$(`.kanban-col[ondrop="kanbanDrop(event,'approved')"]`);
  const cardBox = await boxOf(page, card), colBox = await boxOf(page, col);
  check('board: LD-059 and Approved both in view', cardBox.x >= 0 && colBox.x + colBox.w <= DESK.width, JSON.stringify({ cardBox, colBox }));
  await rec.still(page, 'board', { cardBox, colBox });
  // A real HTML5 drag with the mouse: press on the card, travel, release over Approved.
  const from = { x: cardBox.x + cardBox.w * 0.42, y: cardBox.y + 20 };
  const lastCard = await page.evaluate((sel) => { const cs = [...document.querySelectorAll(sel + ' .kanban-card')]; const r = cs.length ? cs[cs.length - 1].getBoundingClientRect() : null; return r ? r.bottom : null; }, `.kanban-col[ondrop="kanbanDrop(event,'approved')"]`);
  // drop inside the column's own box (it is only as tall as its cards; empty, it is just the
  // "No leads — drop here" well, so aim at the middle of that well)
  const to = { x: colBox.x + colBox.w * 0.5, y: lastCard ? Math.min(colBox.y + colBox.h - 24, lastCard - 30) : colBox.y + colBox.h * 0.6 };
  let dialogMsg = null;
  desk.removeAllListeners('dialog');
  desk.on('dialog', async (d) => { dialogMsg = d.message(); log('DIALOG', d.type(), JSON.stringify(dialogMsg)); await d.accept(); });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const N = 18;
  for (let i = 1; i <= N; i++) await page.mouse.move(from.x + (to.x - from.x) * i / N, from.y + (to.y - from.y) * i / N);
  await settle(page, 120);
  await rec.still(page, 'dragging');                            // card dimmed in place, Approved outlined
  await page.mouse.up();
  rec.action({ type: 'drag', label: 'Drag LD-059 to Approved', from, to, box: cardBox });
  await page.waitForFunction(() => currentView === 'customers', { timeout: 8000 });
  check('board: the app asked to confirm', !!dialogMsg, dialogMsg);
  rec.action({ type: 'click', label: 'OK', dialog: true, message: dialogMsg });
  await settle(page, 350);
  const toast = await toastText(page);
  await rec.still(page, 'approved', { toast, focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true }, row: { text: 'Meadowbrook Villas HOA', closest: 'tr' } }) });
  check('board: toast names WO-328 + IN-325', toast.includes(FX.expected.boardApproval.workOrder) && toast.includes(FX.expected.boardApproval.invoice), toast);
  await flush(page);
  const cust = (await db(page, 'customers')).find((c) => c.name === 'Meadowbrook Villas HOA');
  check('board: lead became a customer', !!cust, cust && cust.id);
  check('board: work order + invoice exist', (await db(page, 'jobs')).some((j) => j.number === FX.expected.boardApproval.workOrder) && (await db(page, 'invoices')).some((i) => i.number === FX.expected.boardApproval.invoice));
}

// ------------------------------------------------------------- scene: quote builder
async function sceneQuote() {
  rec.begin('quote', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr });
  const page = await deskPage(PT(DAY.quoteDrafted, '10:20'));
  await openApp(page, 'quote-builder?editId=qt-330');
  // Put the floor section right under the builder's header bar.
  const secTop = await page.evaluate(() => { const b = document.querySelector('.qb-section-menu-btn'); const c = document.getElementById('content'); return b.getBoundingClientRect().top + c.scrollTop; });
  await scrollContentTo(page, Math.round(secTop - 205));
  await rec.still(page, 'builder', { focus: await focus(page, { menu: { sel: '.qb-section-menu-btn' }, row0: { sel: '#qb-qty-mat-0', closest: 'tr' }, rail: { text: 'GRAND TOTAL', closest: 'div' } }) });
  const menuBtn = async () => (await page.$$('.qb-section-menu-btn'))[0];
  await click(rec, page, await menuBtn(), 'Section menu');
  await rec.still(page, 'menu1');
  await clickMenuItem(page, 'Mark as Pick One');
  await settle(page, 250);
  await rec.still(page, 'pickone', { focus: await focus(page, { banner: { sel: '.qb-mc-section-banner' } }) });
  await click(rec, page, await menuBtn(), 'Section menu');
  await rec.still(page, 'menu2');
  await clickMenuItem(page, 'Show Job Area');
  await settle(page, 250);
  await rec.still(page, 'jobarea', { focus: await focus(page, { area: { sel: '#qb-area-sqft-0' } }) });
  await click(rec, page, '#qb-area-sqft-0', 'Job area');
  await type(rec, page, String(FX.expected.jobArea.value), 'Job area', { stillEach: true, name: 'area' });
  await click(rec, page, `button[onclick="applyAreaQty('SqFt',0)"]`, 'Apply');
  await settle(page, 350);
  const hint = await page.$eval('#qb-qty-extra-mat-0', (e) => e.innerText.replace(/\s+/g, ' ').trim());
  const toast = await toastText(page);
  await rec.still(page, 'applied', { toast, hint, focus: await focus(page, { hint: { sel: '#qb-qty-extra-mat-0' }, qty0: { sel: '#qb-qty-mat-0' }, hint2: { sel: '#qb-qty-extra-mat-2' }, gt: { text: 'GRAND TOTAL' }, gtv: { text: '$7,571.93', exact: true }, toast: { sel: '#toast-container .toast', last: true } }) });
  check('quote: carton hint', hint.includes(FX.expected.cartonHint), hint);
  check('quote: apply toast', toast.includes(FX.expected.applyToast), toast);
  const gt = await page.evaluate(() => document.body.innerText.match(/GRAND TOTAL\s*\$[\d,]+\.\d\d/gi));
  check('quote: grand total = dataset (as sent)', JSON.stringify(gt || []).includes('7,571.93'), JSON.stringify(gt));
  await click(rec, page, '#privacy-mode-toggle', 'Privacy Mode');
  await page.mouse.move(700, 795);                              // keep the pointer off blurred cells (hover un-blurs)
  await settle(page, 350);
  await rec.still(page, 'privacy', { toast: await toastText(page), focus: await focus(page, { priv0: { sel: '.qb-private' }, privLast: { sel: '.qb-private', last: true }, toast: { sel: '#toast-container .toast', last: true } }) });
  check('quote: privacy on', await page.evaluate(() => document.documentElement.getAttribute('data-privacy') === 'on'));

  // Off camera: privacy back off, Save, Mark Sent, and make the customer link (Share -> Copy Customer Link).
  await page.click('#privacy-mode-toggle');
  await settle(page, 200);
  await page.click('.qb-header-bar button[onclick="saveQuoteDraft()"]');
  await settle(page, 600);
  const anyway = await byText(page, '#_checklistConfirmOverlay button', 'Save Anyway');
  if (anyway) { await anyway.click(); await settle(page, 500); }
  check('quote: saved', (await toastText(page)).includes('QT-330 saved'), await toastText(page));
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
  // Each step on a fresh load, so no stale builder copy can write over the previous one.
  await openApp(page, 'quote-builder?editId=qt-330');
  await shareItem('Mark Sent');
  await openApp(page, 'quote-builder?editId=qt-330');
  await shareItem('Copy Customer Link');
  check('quote: link copied toast', (await toastText(page)).includes('Quote link copied'), await toastText(page));
  await flush(page);
  const q = (await db(page, 'quotes')).find((x) => x.number === 'QT-330');
  check('quote: saved as sent with a customer link', q.status === 'sent' && !!q.public_token, `${q.status} token=${!!q.public_token} total=${q.total}`);
  check('quote: stored total = dataset (as sent)', Math.abs(q.total - 7571.93) < 0.005, q.total);
  rec.note({ story: 'saved, marked sent, customer link copied (off camera)' });
}

// ------------------------------------------------------------- scene: approve (phone)
async function sceneApprove() {
  await park();                                    // the office app is closed while the customer approves
  const page = await iso.newPage({ ...PHONE, mobile: true, clock: PT(DAY.approved, '19:12') });
  page.on('dialog', async (d) => { log('PHONE DIALOG', d.message()); await d.accept(); });
  const q = (await db(desk, 'quotes')).find((x) => x.number === 'QT-330');
  if (!q || !q.public_token) throw new Error('QT-330 has no public link yet');
  const url = `${iso.origin}/q.html?t=${q.public_token}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#approve-btn', { timeout: 15000 });
  await settle(page, 300);
  rec.begin('approve', { kind: 'phone', css: { w: PHONE.width, h: PHONE.height }, dpr: PHONE.dpr });
  const tall = async (name, specs) => {
    const f = specs ? await focus(page, specs) : {};
    const sy = await page.evaluate(() => window.scrollY);
    for (const k of Object.keys(f)) f[k].y += sy;                   // document coordinates
    await page.addStyleTag({ content: '#dl-pdf{visibility:hidden!important}' }).then((h) => h.evaluate((el) => { el.id = 'tmp-hide'; }));
    const file = await rec.still(page, name, { full: true, height: await page.evaluate(() => document.documentElement.scrollHeight), focus: f }, { fullPage: true });
    await page.evaluate(() => { const s = document.getElementById('tmp-hide'); if (s) s.remove(); });
    return file;
  };
  // the fixed "Download PDF" button, captured once so the compositor can keep it fixed while scrolling
  const dl = await boxOf(page, '#dl-pdf').catch(() => null);
  if (dl) { const f = 'approve-dlpdf.png'; await page.screenshot({ path: path.join(OUT, 'stills', f), clip: { x: dl.x, y: dl.y, width: dl.w, height: dl.h } }); rec.note({ overlay: 'dlpdf', file: f, box: dl }); }
  await tall('tall-0', { mc: { sel: 'tr.mc-row', last: false } });
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
    rec.action({ type: 'click', tap: true, label, x, y, box: b, scrollY: await page.evaluate(() => window.scrollY), docY: y + targetScroll });
  };
  await tapEl('tr.mc-row[data-mc-key="' + FX.story.pickOneRow + '"]', 'Pick Better');
  await settle(page, 250);
  check('phone: Better selected', await page.evaluate((k) => !!document.querySelector('tr.mc-row-selected[data-mc-key="' + k + '"]'), FX.story.pickOneRow));
  await tall('tall-1');
  const optSel = 'label.opt-toggle input[type=checkbox]';
  await tapEl(optSel, 'Add stairs');
  await settle(page, 250);
  check('phone: stairs added', await page.evaluate((s) => document.querySelector(s).checked, optSel));
  await tall('tall-2', { total: { text: 'TOTAL', exact: true, last: true }, totalv: { text: '$8,624.70', exact: true, last: true }, stairs: { sel: 'label.opt-toggle' } });
  const totalText = await page.evaluate(() => (document.body.innerText.match(/TOTAL\s*\$[\d,]+\.\d\d/) || [''])[0]);
  check('phone: live total matches dataset', totalText.includes('8,624.70'), totalText);
  await tapEl('#approve-btn', 'Approve Quote');
  await page.waitForFunction(() => document.getElementById('toast') && document.getElementById('toast').classList.contains('show'), { timeout: 5000 });
  await rec.still(page, 'toast', { viewport: true });
  await page.waitForNavigation({ waitUntil: 'load', timeout: 10000 }).catch(() => {});
  await page.waitForSelector('.approved-stamp', { timeout: 15000 });
  await settle(page, 300);
  await tall('tall-3-approved', { stamp: { sel: '.approved-stamp' }, done: { text: 'Quote Approved' } });
  const q2 = (await db(page, 'quotes')).find((x) => x.number === 'QT-330');
  check('phone: quote approved in store', q2.status === 'approved', q2.status + ' ' + JSON.stringify(q2.selected_options));
  await page.close();
}

// ------------------------------------------------------------- scene: work order
async function sceneWO() {
  // The office opens the app the morning after the approval: the app's own boot
  // reconciliation turns the approved QT-330 into WO-330 + IN-330 (approveQuote).
  let page = await deskPage(PT(DAY.approved, '08:05'));
  await openApp(page, 'jobs');
  await flush(page);
  const job = (await db(page, 'jobs')).find((j) => j.number === FX.expected.workOrderNumber);
  const inv0 = (await db(page, 'invoices')).find((i) => i.number === FX.expected.invoiceNumber);
  check('app created WO-330', !!job, job && job.status);
  check('app created IN-330', !!inv0, inv0 && `${inv0.subtotal} + ${inv0.tax} = ${inv0.total}`);
  if (!job || !inv0) throw new Error('approval did not produce WO-330 / IN-330');
  check('IN-330 total matches dataset', Math.abs(inv0.total - FX.expected.invoice.total) < 0.005, `${inv0.total} vs ${FX.expected.invoice.total}`);
  // Off camera, that evening: the Prasads pay the 50% deposit on the live invoice (Stripe).
  await story('deposit paid online by card', async (p) => {
    const rows = await db(p, 'invoices');
    const inv = rows.find((i) => i.id === inv0.id);
    inv.payments = [FX.story.depositPayment]; inv.amount_paid = FX.story.depositPayment.amount; inv.status = 'deposit';
    await dbWrite(p, 'invoices', rows);
  });
  rec.begin('wo', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr, jobId: job.id, invoiceId: inv0.id });

  // Day 1 (Oct 15): Order Materials
  page = await deskPage(PT(DAY.approved, '09:20'));
  await openApp(page, `job-detail/${job.id}`);
  await rec.still(page, 'start', { day: DAY.approved, focus: await focus(page, { hdr: { sel: '.qb-header-bar' } }) });
  await click(rec, page, 'button[onclick^="openOrderMaterialsModal"]', 'Order Materials');
  await page.waitForSelector('#modal-overlay.active', { timeout: 5000 });
  await rec.still(page, 'om-modal', { focus: await focus(page, { modal: { sel: '#modal' } }) });
  await click(rec, page, '#modal input[type=checkbox][onchange^="_omToggleSelectAll"]', 'Select all');
  await rec.still(page, 'om-selected');
  await click(rec, page, '#modal .modal-footer button.btn-primary', 'Finish');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await rec.still(page, 'ordered', { toast: await toastText(page), focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true } }) });
  await flush(page);
  let j = (await db(page, 'jobs')).find((x) => x.id === job.id);
  check('WO materials_ordered', j.status === 'materials_ordered', j.status);

  // Off camera, Oct 19: everything arrives (base ships as 12 x 16 ft sticks = 192 LF); freight paid.
  const costs = FX.story.jobCosts.map((c) => ({ ...c, job_id: job.id, job_number: job.number }));
  await story('materials received + freight', async (p) => {
    const all = await db(p, 'job_pos');
    const mine = all.filter((x) => x.job_id === job.id);
    check('Order Materials made 4 POs', mine.length === 4, mine.map((x) => `${x.number} ${x.mat_num} ${x.qty}`).join(', '));
    await dbWrite(p, 'job_pos', all.map((x) => {
      if (x.job_id !== job.id) return x;
      const qty = FX.story.poQty[x.mat_num] != null ? FX.story.poQty[x.mat_num] : x.qty;
      return { ...x, qty, total_cost: Math.round(qty * x.cost * 100) / 100, status: 'received', received_at: FX.story.poReceivedAt };
    }));
    await dbWrite(p, 'job_costs', costs.filter((c) => c.kind === 'freight'));
  });

  // Day 5 (Oct 19): Ready to Schedule -> assign Ruben (no date yet)
  page = await deskPage(PT(DAY.materialsIn, '08:40'));
  await openApp(page, `job-detail/${job.id}`);
  await rec.still(page, 'day5', { day: DAY.materialsIn });
  await click(rec, page, 'button[onclick^="openScheduleJobModal"]', 'Ready to Schedule');
  await page.waitForSelector('#sched-installer', { timeout: 5000 });
  await rec.still(page, 'rts-modal', { focus: await focus(page, { modal: { sel: '#modal' } }) });
  await click(rec, page, '#sched-installer', 'Installer dropdown');
  await page.select('#sched-installer', FX.story.installer.id);
  rec.action({ type: 'click', label: 'Pick ' + FX.story.installer.name, select: '#sched-installer', x: null, y: null });
  await rec.still(page, 'rts-installer');
  await click(rec, page, '#modal .modal-footer .btn-primary', 'Schedule');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await rec.still(page, 'rts-done', { toast: await toastText(page), focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true } }) });

  // Same day: Schedule Install for Oct 21
  await click(rec, page, 'button[onclick^="openScheduleJobModal"]', 'Schedule Install');
  await page.waitForSelector('#sched-date', { timeout: 5000 });
  await rec.still(page, 'si-modal', { focus: await focus(page, { modal: { sel: '#modal' } }) });
  await click(rec, page, '#sched-date', 'Install date');
  await settle(page, 120);
  await page.keyboard.press('Escape');                          // closes Chrome's date picker popup (not drawn headless)
  const [y, m, d] = FX.story.installDate.split('-');
  await page.keyboard.type(m + d + y);
  check('schedule modal still open', !!(await page.$('#modal-overlay.active')));
  check('install date typed', (await page.$eval('#sched-date', (e) => e.value)) === FX.story.installDate, await page.$eval('#sched-date', (e) => e.value));
  rec.action({ type: 'type', label: 'Install date', text: `${m}/${d}/${y}`, count: 1 });
  await rec.still(page, 'si-date');
  await click(rec, page, '#modal .modal-footer .btn-primary', 'Schedule');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await rec.still(page, 'si-done', { toast: await toastText(page), focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true } }) });
  await flush(page);
  j = (await db(page, 'jobs')).find((x) => x.id === job.id);
  check('WO scheduled for install date', j.status === 'scheduled' && j.scheduled_date === FX.story.installDate, `${j.status} ${j.scheduled_date} crew=${j.crew}`);

  // Off camera, Oct 21: install supplies bought.
  await story('install supplies', async (p) => { await dbWrite(p, 'job_costs', costs.filter((c) => c.kind === 'freight' || c.kind === 'supply')); });

  // Day 8 (Oct 22): Mark Job Complete -> View Final Invoice
  page = await deskPage(PT(DAY.complete, '16:10'));
  await openApp(page, `job-detail/${job.id}`);
  await rec.still(page, 'day8', { day: DAY.complete });
  await click(rec, page, 'button[onclick^="completeJob"]', 'Mark Job Complete');
  await settle(page, 400);
  await rec.still(page, 'complete', { toast: await toastText(page), focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true } }) });
  const viewInv = await mustText(page, '.qb-header-bar button', 'View Final Invoice');
  await click(rec, page, viewInv, 'View Final Invoice');
  await page.waitForFunction(() => currentView === 'invoice-detail', { timeout: 5000 });
  await settle(page, 300);
  await rec.still(page, 'invoice');
  await flush(page);
  j = (await db(page, 'jobs')).find((x) => x.id === job.id);
  check('WO at final_invoice', j.status === 'final_invoice', j.status);
  // Off camera, same afternoon: the office ticks "Final Invoice" (the app's own toggle).
  const fin = await page.$('#ib-final-btn');
  if (fin) { await fin.click(); await settle(page, 300); await flush(page); }
  const invNow = (await db(page, 'invoices')).find((i) => i.id === inv0.id);
  check('IN-330 marked final', !!invNow.final_invoice, String(invNow.final_invoice));
}

// ------------------------------------------------------------- scene: payment
async function scenePay() {
  const wo = rec.manifest.scenes.wo;
  rec.begin('pay', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr });
  const page = await deskPage(PT(FX.story.balanceCheck.date, '11:20'));
  await openApp(page, `invoice-detail/${wo.invoiceId}`);
  await rec.still(page, 'start');
  const take = (await page.$$('button[onclick^="openTakePaymentModal"]'))[0];
  await click(rec, page, take, 'Take Payment');
  await page.waitForSelector('#pay-method', { timeout: 5000 });
  await rec.still(page, 'modal', { focus: await focus(page, { modal: { sel: '#modal' } }) });
  const amt = await page.$eval('#pay-amt', (el) => el.value);
  check('Take Payment pre-fills the balance', Math.abs(Number(amt) - FX.story.balanceCheck.amount) < 0.005, amt);
  await click(rec, page, '#pay-method', 'Method dropdown');
  await page.select('#pay-method', 'Check');
  rec.action({ type: 'click', label: 'Pick Check', select: '#pay-method', x: null, y: null });
  await settle(page, 150);
  await rec.still(page, 'check');
  await click(rec, page, '#pay-checkno', 'Check number');
  await type(rec, page, FX.story.balanceCheck.checkNumber, 'Check number', { stillEach: true, name: 'checkno' });
  await click(rec, page, '#pay-confirm-btn', 'Record Payment');
  await page.waitForFunction(() => !document.querySelector('#modal-overlay.active'), { timeout: 5000 });
  await settle(page, 300);
  await rec.still(page, 'paid', { toast: await toastText(page), focus: await focus(page, { toast: { sel: '#toast-container .toast', last: true }, paid: { text: 'Paid in Full' } }) });
  // The payments card further down shows both payments and the balance; scroll to it (a plain scroll).
  const payCard = await page.evaluate(() => {
    const c = document.getElementById('content');
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n, best = null;
    while ((n = w.nextNode())) { if (n.textContent.trim() === 'Balance Due' && n.parentElement.offsetParent) { const r = n.parentElement.getBoundingClientRect(); const y = r.top + c.scrollTop; if (!best || y > best.y) best = { y, x: r.left }; } }
    return best;
  });
  check('payments card found', !!payCard && payCard.y > 1200, JSON.stringify(payCard));
  await scrollSeq(page, Math.round(payCard.y - 620), 12, 'scroll');
  const balTxt = await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n, out = [];
    while ((n = w.nextNode())) { const t = n.textContent.trim(); if (/^\$-?0\.00$/.test(t) && n.parentElement.offsetParent) { const r = n.parentElement.getBoundingClientRect(); if (r.top > 0 && r.bottom < innerHeight) out.push({ t, x: Math.round(r.left), y: Math.round(r.top) }); } }
    return out;
  });
  await rec.still(page, 'paid-balance', { balances: balTxt, focus: await focus(page, { bal: { text: 'BALANCE DUE', exact: true, last: true, closest: 'tr' }, total: { text: 'TOTAL', exact: true, last: true, closest: 'tr' } }) });
  check('balance $0.00 on screen', balTxt.some((b) => b.t === '$0.00'), JSON.stringify(balTxt));
  await flush(page);
}

// ------------------------------------------------------------- scene: job costing
async function sceneCost() {
  const wo = rec.manifest.scenes.wo;
  // Off camera, Oct 26: Ruben's install is recorded and paid out.
  await story('installer labor recorded + paid', async (p) => {
    const costs = FX.story.jobCosts.map((c) => ({ ...c, job_id: wo.jobId, job_number: FX.expected.workOrderNumber }));
    await dbWrite(p, 'job_costs', costs);
  });
  rec.begin('cost', { kind: 'desktop', css: { w: DESK.width, h: DESK.height }, dpr: DESK.dpr });
  const page = await deskPage(PT(DAY.payout, '10:00'));
  await openApp(page, 'job-costing');
  await rec.still(page, 'list', { focus: await focus(page, { row: { text: 'WO-330', closest: 'tr' }, cards: { text: 'Estimated Cost', closest: 'div' } }) });
  const row = await page.evaluateHandle((num) => {
    const w = document.createTreeWalker(document.getElementById('content'), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (n.textContent.trim() === num && n.parentElement.offsetParent) { let el = n.parentElement; while (el && el.tagName !== 'TR' && !el.hasAttribute('onclick')) el = el.parentElement; return el; } }
    return null;
  }, FX.expected.workOrderNumber);
  if (!row.asElement()) throw new Error('job costing list: no row for ' + FX.expected.workOrderNumber);
  await click(rec, page, row.asElement(), 'Open WO-330 costing', { dx: 0.3 });
  await page.waitForFunction(() => currentView === 'job-costing-detail', { timeout: 5000 });
  await settle(page, 400);
  await rec.still(page, 'detail', { focus: await focus(page, { est: { text: 'Estimated Cost', exact: true }, evsa: { text: 'Estimate vs Actual' }, totalRow: { text: 'Total Cost', exact: true, closest: 'tr' }, profit: { text: 'Profit', exact: true } }) });
  const txt = await page.evaluate(() => document.querySelector('#content').innerText);
  check('costing shows dataset estimate', txt.includes('4,883.79'), (txt.match(/Estimated Cost[\s\S]{0,40}/) || [''])[0].replace(/\s+/g, ' '));
  check('costing shows dataset variance', txt.includes('189.13'), (txt.match(/Variance[\s\S]{0,60}/) || [''])[0].replace(/\s+/g, ' '));
}

const SCENE_FNS = { leads: sceneLeads, quote: sceneQuote, approve: sceneApprove, wo: sceneWO, pay: scenePay, cost: sceneCost };
try {
  // first load seeds the offline store from the fixture
  const p0 = await park();
  if (!args.keep) await p0.evaluate(() => window.__flStub.reseed());
  for (const s of SCENES) {
    if (!SCENE_FNS[s]) { log('skip (not implemented yet):', s); continue; }
    log('=== scene', s);
    await SCENE_FNS[s]();
    rec.save();
  }
} catch (e) {
  failures.push('EXCEPTION ' + e.message);
  log('ERROR', e.stack);
  if (desk) await desk.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
} finally {
  rec.manifest.isolation = { attempts: iso.isoLog.length, forbidden: iso.forbiddenAttempts() };
  rec.manifest.pageErrors = iso.pageErrors;
  rec.manifest.failures = failures;
  rec.save();
  await iso.browser.close();
  srv.server.close();
}
try { iso.assertClean(); log('ISOLATION OK —', iso.isoLog.filter((e) => e.kind === 'blocked').length, 'blocked,', iso.isoLog.filter((e) => e.kind === 'answered-locally').length, 'answered locally'); }
catch (e) { log(e.message); process.exitCode = 2; }
if (iso.pageErrors.length) log('PAGE ERRORS', JSON.stringify(iso.pageErrors));
if (failures.length) { log('FAILURES:\n  ' + failures.join('\n  ')); process.exitCode = process.exitCode || 1; }
