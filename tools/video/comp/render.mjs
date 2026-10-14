// Frame-by-frame renderer: seek the compositor timeline, screenshot each frame to PNG.
// node render.mjs [--from=0] [--to=<sec>] [--fps=30] [--only=12.5,20] [--out=dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCompServer } from './serve.mjs';
import { launchIsolated } from '../harness/browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const FPS = +(args.fps || 30);
const OUT = path.resolve(args.out || path.join(HERE, '..', 'frames'));
fs.mkdirSync(OUT, { recursive: true });

const srv = await startCompServer();
const iso = await launchIsolated({ port: srv.port, freezeAt: 0, logPath: path.join(HERE, '..', 'out', 'isolation-render.jsonl'), stubSource: () => '' });
try {
  const page = await iso.newPage({ width: 1920, height: 1080, dpr: 1 });
  await page.goto(`${iso.origin}/comp/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.__ready());
  const dur = await page.evaluate(() => window.__duration());
  const from = +(args.from || 0), to = Math.min(+(args.to || dur), dur);
  const times = args.only ? String(args.only).split(',').map(Number) : null;
  const frames = times ? times.map((t) => Math.round(t * FPS)) : Array.from({ length: Math.round((to - from) * FPS) }, (_, i) => Math.round(from * FPS) + i);
  console.log(JSON.stringify({ duration: dur, frames: frames.length, out: OUT }));
  const t0 = Date.now();
  for (const f of frames) {
    await page.evaluate((t) => window.__seek(t), f / FPS);
    await page.evaluate(() => window.__prepareFrame());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(OUT, (times ? 'probe_' : 'f') + String(f).padStart(5, '0') + '.png'), type: 'png', optimizeForSpeed: false });
    if (f % 90 === 0) console.log(`frame ${f} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  if (iso.pageErrors.length) console.log('PAGE ERRORS', JSON.stringify(iso.pageErrors));
  iso.assertClean();
  console.log('done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
} finally {
  await iso.browser.close();
  srv.server.close();
}
