// Smoke test for the customer quote page (q.html) on a phone, offline.
//   node harness/qsmoke.mjs [out.png]
// Writes QT-330 "as sent" (fixture.story.quoteSent, with its customer link) into the offline
// store, opens /q.html?t=<token> at 390×844, and checks the page rendered the quote with its
// Approve button, the stand-in saw no unimplemented call, nothing threw, nothing left 127.0.0.1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launchIsolated } from './browser.mjs';
import { stubSource } from './stub-source.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(fs.readFileSync(process.env.FL_FIXTURE || path.join(HERE, 'fixture.json'), 'utf8'));
const out = process.argv[2] || path.join(HERE, '..', 'out', 'qsmoke.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
const sent = FX.story.quoteSent;
const srv = await startServer({ log: (e) => console.log('srv', JSON.stringify(e)) });
const iso = await launchIsolated({ port: srv.port, freezeAt: Date.parse('2026-10-15T12:20:00-07:00'), stubSource });
let ok = false;
try {
  // the store page shares the origin's localStorage with q.html
  const store = await iso.newPage({ width: 800, height: 600, dpr: 1 });
  await store.goto(`${iso.origin}/__harness/db.html`, { waitUntil: 'load' });
  await store.evaluate((q) => { window.__flStub.reseed(); const rows = window.__flStub.table('quotes'); window.__flStub.write('quotes', rows.map((r) => (r.id === q.id ? q : r))); }, sent);
  await store.close();
  const page = await iso.newPage({ width: 390, height: 844, dpr: 1, mobile: true });
  await page.goto(`${iso.origin}/q.html?t=${sent.public_token}`, { waitUntil: 'load' });
  await page.waitForSelector('#approve-btn', { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  const info = await page.evaluate(() => ({
    title: document.title,
    approveButton: !!document.getElementById('approve-btn'),
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 240),
    unknown: window.__flStub && window.__flStub.unknown,
    rpc: window.__flStub && window.__flStub.calls.filter((c) => c.kind === 'rpc').map((c) => c.detail),
  }));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: out });
  console.log('screenshot', out);
  console.log('pageErrors', JSON.stringify(iso.pageErrors), 'outside', JSON.stringify(iso.isoLog.filter((e) => e.kind !== 'attempt' && e.kind !== 'failed').map((e) => `${e.kind}: ${e.url}`)));
  const problems = [];
  if (!info.approveButton) problems.push('no Approve button (quote did not render)');
  if (!info.text.includes(sent.number)) problems.push(`${sent.number} not on the page`);
  if (!info.unknown || info.unknown.length) problems.push('unimplemented stand-in calls: ' + JSON.stringify(info.unknown));
  if (iso.pageErrors.length) problems.push(`${iso.pageErrors.length} page error(s)`);
  iso.assertClean();
  if (problems.length) { console.log('QSMOKE FAILED:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
  else { ok = true; console.log(`QSMOKE OK — ${sent.number} rendered on a phone with its Approve button, unknown: [], 0 page errors`); }
  console.log('ISOLATION OK');
} catch (e) {
  console.log(e.message); process.exitCode = 2;
} finally { await iso.browser.close(); srv.server.close(); }
if (!ok && !process.exitCode) process.exitCode = 1;
