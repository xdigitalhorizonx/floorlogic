// Dev preview: boot the app offline and screenshot one or more routes.
//   node harness/devshot.mjs <route> [<route> ...] [--phone] [--full] [--out=dir] [--wait=ms] [--js=code]
// A route is a hash for the desktop app ("leads", "lead-detail/ld-16") or a path
// starting with "/" ("/mobile", "/q.html?t=..."). Prints the view, unimplemented stub
// calls, page errors and any outside request. Output: out/dev/<route>.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launchIsolated } from './browser.mjs';
import { stubSource } from './stub-source.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const routes = argv.filter((a) => !a.startsWith('--'));
const OUT = path.resolve(opt.out || path.join(HERE, '..', 'out', 'dev'));
fs.mkdirSync(OUT, { recursive: true });
const phone = !!opt.phone;
const vp = phone ? { width: 390, height: 844, dpr: 2, mobile: true } : { width: 1920, height: 1080, dpr: 1 };

const srv = await startServer({ log: (e) => { if (!/favicon/.test(e.path || '')) console.log('srv', JSON.stringify(e)); } });
const iso = await launchIsolated({ port: srv.port, freezeAt: Date.parse(process.env.FREEZE || '2026-10-14T10:20:00-07:00'), stubSource });
try {
  const page = await iso.newPage(vp);
  page.on('dialog', (d) => { console.log('DIALOG', d.type(), d.message()); d.dismiss(); });
  page.on('console', (m) => { if (opt.console) console.log('console.' + m.type(), m.text().slice(0, 300)); });
  await page.goto(`${iso.origin}/__harness/db.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.__flStub.reseed());
  for (const r of routes) {
    const url = r.startsWith('/') ? iso.origin + r : `${iso.origin}/index.html#${r}`;
    await page.goto(url, { waitUntil: 'load' });
    await new Promise((res) => setTimeout(res, +(opt.wait || 2500)));
    if (opt.js) { console.log('js ->', JSON.stringify(await page.evaluate(opt.js)).slice(0, 2000)); await new Promise((res) => setTimeout(res, 800)); }
    const info = await page.evaluate(() => ({
      view: typeof currentView !== 'undefined' ? currentView : null,
      leads: typeof data !== 'undefined' && data ? (data.leads || []).length : null,
      unknown: window.__flStub && window.__flStub.unknown.slice(),
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
    }));
    const file = path.join(OUT, (phone ? 'phone-' : '') + r.replace(/[^a-z0-9-]+/gi, '_').replace(/^_+|_+$/g, '') + '.png');
    await page.screenshot({ path: file, fullPage: !!opt.full });
    console.log(JSON.stringify({ route: r, file, ...info }));
  }
  console.log('pageErrors', JSON.stringify(iso.pageErrors));
  console.log('consoleErrors', JSON.stringify(iso.consoleErrors.slice(0, 15)));
  console.log('outside', JSON.stringify(iso.isoLog.filter((e) => e.kind !== 'attempt' && e.kind !== 'failed').map((e) => e.kind + ' ' + e.url)));
  iso.assertClean();
  console.log('ISOLATION OK');
} finally {
  await iso.browser.close();
  srv.server.close();
}
