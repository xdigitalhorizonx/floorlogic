import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launchIsolated } from './browser.mjs';
import { stubSource } from './stub-source.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const srv = await startServer();
const iso = await launchIsolated({ port: srv.port, freezeAt: Date.parse('2026-10-14T09:41:00-07:00'), stubSource });
try {
  const page = await iso.newPage({ width: 390, height: 844, dpr: 1, mobile: true });
  await page.goto(`${iso.origin}/q.html?t=nope`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 200)));
  console.log(JSON.stringify(await page.evaluate(() => window.__flStub && window.__flStub.calls.map(c => c.kind + ':' + c.detail))));
  console.log('errors', JSON.stringify(iso.pageErrors), 'iso', JSON.stringify(iso.isoLog.filter(e => e.kind !== 'attempt').map(e => e.kind + ' ' + (e.url || e.reason))));
  iso.assertClean(); console.log('ISOLATION OK');
} finally { await iso.browser.close(); srv.server.close(); }
