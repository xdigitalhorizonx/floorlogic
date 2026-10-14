// dev preview of q.html on a phone viewport: node qdev.mjs <token> <out.png> [fullpage]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launchIsolated } from './browser.mjs';
import { stubSource } from './stub-source.mjs';
const [token, out, full] = process.argv.slice(2);
const srv = await startServer();
const iso = await launchIsolated({ port: srv.port, freezeAt: Date.parse(process.env.FREEZE || '2026-10-15T19:12:00-07:00'), stubSource });
try {
  const page = await iso.newPage({ width: 390, height: 844, dpr: 2, mobile: true });
  await page.goto(`${iso.origin}/q.html?t=${token}`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 600)));
  console.log('H', await page.evaluate(() => document.documentElement.scrollHeight));
  await page.screenshot({ path: out, fullPage: !!full });
  console.log('errors', JSON.stringify(iso.pageErrors), JSON.stringify(iso.consoleErrors.slice(0,5)));
  iso.assertClean(); console.log('ISOLATION OK');
} finally { await iso.browser.close(); srv.server.close(); }
