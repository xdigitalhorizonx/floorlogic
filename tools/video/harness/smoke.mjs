// Smoke test: boot the app offline with the current fixture and screenshot a view.
// node smoke.mjs [hash] [out.png]
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

const srv = await startServer({ log: (e) => console.log('srv', JSON.stringify(e)) });
const iso = await launchIsolated({ port: srv.port, freezeAt: Date.parse(process.env.FREEZE || '2026-10-14T09:41:00-07:00'), logPath: path.join(HERE, '..', 'out', 'isolation-smoke.jsonl'), stubSource });
try {
  const page = await iso.newPage({ width: 1440, height: 810, dpr: 1 });
  page.on('dialog', (d) => { console.log('DIALOG', d.type(), d.message()); d.dismiss(); });
  await page.goto(`${iso.origin}/index.html${hash ? '#' + hash : ''}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 2500));
  const info = await page.evaluate(() => ({
    view: typeof currentView !== 'undefined' ? currentView : null,
    login: !!document.getElementById('login-screen'),
    leads: (window.data && data.leads || []).length,
    unknown: window.__flStub && window.__flStub.unknown,
    calls: window.__flStub && window.__flStub.calls.length,
    text: document.body.innerText.slice(0, 400),
  }));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: out });
  console.log('pageErrors', JSON.stringify(iso.pageErrors.slice(0, 20), null, 1));
  console.log('consoleErrors', JSON.stringify(iso.consoleErrors.slice(0, 20), null, 1));
  console.log('isolation', JSON.stringify(iso.isoLog, null, 1));
  iso.assertClean();
  console.log('ISOLATION OK');
} finally {
  await iso.browser.close();
  srv.server.close();
}
