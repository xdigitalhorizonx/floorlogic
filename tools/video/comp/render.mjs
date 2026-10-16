// Frame-by-frame renderer: seek the compositor timeline, check the frame, screenshot it.
//   node comp/render.mjs [--fps=30] [--from=0] [--to=<sec>] [--only=12.5,20] [--out=dir] [--check-only]
// Every frame runs window.__frameCheck (comp/engine.js): no still drawn above its captured
// pixels, nothing tilted, no keep-out box (e.g. "$-0.00") in frame. Any hit fails the run and is
// listed in out/frame-qa.json. --check-only runs the checks on every frame without screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCompServer } from './serve.mjs';
import { launchIsolated } from '../harness/browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const FPS = +(args.fps || 30);
const OUT = path.resolve(args.out || path.join(HERE, '..', 'frames'));
const CHECK_ONLY = !!args['check-only'];
const QA = path.join(HERE, '..', 'out', 'frame-qa.json');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(QA), { recursive: true });

const srv = await startCompServer();
const iso = await launchIsolated({ port: srv.port, freezeAt: 0, logPath: path.join(HERE, '..', 'out', 'isolation-render.jsonl'), stubSource: () => '' });
const qa = { frames: 0, upscale: [], tilted: [], keepOut: [] };
let crashed = null;
try {
  const page = await iso.newPage({ width: 1920, height: 1080, dpr: 1 });
  await page.goto(`${iso.origin}/comp/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.__ready());
  if (iso.pageErrors.length) throw new Error('the compositor page threw (timeline did not build): ' + JSON.stringify(iso.pageErrors));
  const dur = await page.evaluate(() => window.__duration());
  if (!(dur >= 30 && dur <= 60)) throw new Error(`timeline duration ${dur}s is outside 30-60 s`);
  if (!(await page.evaluate(() => Array.isArray(window.__CUES) && Array.isArray(window.__CHAPTERS)))) throw new Error('timeline did not export __CUES / __CHAPTERS');
  const from = +(args.from || 0), to = Math.min(+(args.to || dur), dur);
  const times = args.only ? String(args.only).split(',').map(Number) : null;
  const frames = times ? times.map((t) => Math.round(t * FPS)) : Array.from({ length: Math.round((to - from) * FPS) }, (_, i) => Math.round(from * FPS) + i);
  console.log(JSON.stringify({ duration: dur, frames: frames.length, out: CHECK_ONLY ? null : OUT }));
  if (!CHECK_ONLY && !times) for (const f of fs.readdirSync(OUT)) if (/^f\d{5}\.png$/.test(f)) fs.rmSync(path.join(OUT, f));
  const t0 = Date.now();
  for (const f of frames) {
    const t = f / FPS;
    await page.evaluate((t) => window.__seek(t), t);
    const c = await page.evaluate(() => window.__frameCheck());
    qa.frames++;
    for (const k of ['upscale', 'tilted', 'keepOut']) for (const m of c[k]) qa[k].push(`${t.toFixed(3)}s ${m}`);
    if (!CHECK_ONLY) {
      await page.evaluate(() => window.__prepareFrame());
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: path.join(OUT, (times ? 'probe_' : 'f') + String(f).padStart(5, '0') + '.png'), type: 'png', optimizeForSpeed: false });
    }
    if (f % 90 === 0) console.log(`frame ${f} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  if (iso.pageErrors.length) { console.log('PAGE ERRORS', JSON.stringify(iso.pageErrors)); process.exitCode = 1; }
  iso.assertClean();
  // meta for the site (captions + chapters), straight from the timeline
  const meta = await page.evaluate(() => ({ duration: window.__duration(), fps: null, poster: window.__POSTER, chapters: window.__CHAPTERS, cues: window.__CUES }));
  meta.fps = FPS;
  fs.writeFileSync(path.join(HERE, '..', 'out', 'film-meta.json'), JSON.stringify(meta, null, 1));
  console.log('done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
} catch (e) {
  crashed = e;
} finally {
  await iso.browser.close();
  srv.server.close();
}
if (crashed) { console.log('RENDER FAILED: ' + crashed.message); process.exit(1); }
const dedupe = (a) => { const seen = new Map(); for (const m of a) { const k = m.replace(/^[\d.]+s /, ''); if (!seen.has(k)) seen.set(k, [m.match(/^[\d.]+/)[0], m.match(/^[\d.]+/)[0], 0]); const e = seen.get(k); e[1] = m.match(/^[\d.]+/)[0]; e[2]++; } return [...seen].map(([k, [a, b, n]]) => `${a}–${b}s (${n} frames) ${k}`); };
const summary = { frames: qa.frames, upscale: dedupe(qa.upscale), tilted: dedupe(qa.tilted), keepOut: dedupe(qa.keepOut) };
fs.writeFileSync(QA, JSON.stringify(summary, null, 1));
const bad = summary.upscale.length + summary.tilted.length + summary.keepOut.length;
if (bad) { console.log('FRAME QA FAILED (' + QA + '):\n  ' + [...summary.upscale.map((x) => 'UPSCALE ' + x), ...summary.tilted.map((x) => 'TILTED ' + x), ...summary.keepOut.map((x) => 'KEEP-OUT ' + x)].slice(0, 40).join('\n  ')); process.exitCode = 1; }
else console.log(`FRAME QA OK — ${qa.frames} frames: nothing upscaled, nothing tilted, no keep-out box in frame`);
