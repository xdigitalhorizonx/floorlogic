// Smoke test: boot the app offline with the current fixture and screenshot a view.
//   node harness/smoke.mjs [hash] [out.png]
// Passes only when the app is signed in and rendered the view, the offline stand-in saw no
// unimplemented call (unknown: []), the page threw nothing, and no request left 127.0.0.1
// without a local answer. Prints ISOLATION OK at the end; exits non-zero otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launchIsolated } from './browser.mjs';
import { stubSource } from './stub-source.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const hash = process.argv[2] || '';
const out = process.argv[3] || path.join(HERE, '..', 'out', 'smoke-' + (hash || 'home').replace(/[^a-z0-9-]/gi, '_') + '.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
const logPath = path.join(HERE, '..', 'out', 'isolation-smoke.jsonl');
fs.writeFileSync(logPath, '');

const srv = await startServer({ log: (e) => console.log('srv', JSON.stringify(e)) });
const iso = await launchIsolated({ port: srv.port, freezeAt: Date.parse(process.env.FREEZE || '2026-10-14T09:41:00-07:00'), logPath, stubSource });
let ok = false;
try {
  const page = await iso.newPage({ width: 1440, height: 810, dpr: 1 });
  page.on('dialog', (d) => { console.log('DIALOG', d.type(), d.message()); d.dismiss(); });
  await page.goto(`${iso.origin}/index.html${hash ? '#' + hash : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof currentView !== 'undefined' && document.querySelector('#content') && document.querySelector('#content').children.length > 0, { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const info = await page.evaluate(() => ({
    view: typeof currentView !== 'undefined' ? currentView : null,
    signedIn: !document.getElementById('login-screen') && typeof currentSession !== 'undefined' && !!currentSession,
    user: typeof currentSession !== 'undefined' && currentSession ? currentSession.user.email : null,
    leads: typeof data !== 'undefined' && data ? (data.leads || []).length : null,
    jobs: typeof data !== 'undefined' && data ? (data.jobs || []).length : null,
    invoices: typeof data !== 'undefined' && data ? (data.invoices || []).length : null,
    dashboardWidgets: document.querySelectorAll('.dash-widget').length,
    unknown: window.__flStub && window.__flStub.unknown,
    calls: window.__flStub && window.__flStub.calls.length,
    tablesRead: window.__flStub && [...new Set(window.__flStub.calls.filter((c) => c.kind === 'select').map((c) => c.detail.split(' ')[0]))].sort(),
    rpcs: window.__flStub && [...new Set(window.__flStub.calls.filter((c) => c.kind === 'rpc').map((c) => c.detail))],
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
  }));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: out });
  console.log('screenshot', out);
  console.log('pageErrors', JSON.stringify(iso.pageErrors.slice(0, 20), null, 1));
  console.log('consoleErrors', JSON.stringify(iso.consoleErrors.slice(0, 20), null, 1));
  console.log('outside requests', JSON.stringify(iso.isoLog.filter((e) => e.kind !== 'attempt' && e.kind !== 'failed').map((e) => `${e.kind}: ${e.url}${e.with ? ' -> ' + e.with : ''}`), null, 1));
  const problems = [];
  if (!info.signedIn) problems.push('not signed in (login screen showing)');
  if (!info.view) problems.push('no view rendered');
  if (!hash && info.view !== 'dashboard') problems.push(`expected the dashboard, got ${info.view}`);
  if (!hash && !info.dashboardWidgets) problems.push('the dashboard has no widgets');
  if (!info.unknown || info.unknown.length) problems.push('unimplemented stand-in calls: ' + JSON.stringify(info.unknown));
  if (iso.pageErrors.length) problems.push(`${iso.pageErrors.length} page error(s)`);
  iso.assertClean();
  if (problems.length) { console.log('SMOKE FAILED:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
  else { ok = true; console.log(`SMOKE OK — view ${info.view}, signed in as ${info.user}, ${info.leads} leads, ${info.jobs} work orders, ${info.invoices} invoices, unknown: [], 0 page errors`); }
  console.log('ISOLATION OK');
} catch (e) {
  console.log(e.message); process.exitCode = 2;
} finally {
  await iso.browser.close();
  srv.server.close();
}
if (!ok && !process.exitCode) process.exitCode = 1;
