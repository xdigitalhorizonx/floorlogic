// Frame-by-frame check: in the leads scene the board stills never show the Win Rate tile,
// and before the drop the whole stats row stays out of frame. Margins: 16 css px.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCompServer } from './serve.mjs';
import { launchIsolated } from '../harness/browser.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const srv = await startCompServer();
const iso = await launchIsolated({ port: srv.port, freezeAt: 0, stubSource: () => '' });
try {
  const page = await iso.newPage({ width: 1920, height: 1080, dpr: 1 });
  await page.goto(`${iso.origin}/comp/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.__ready());
  const res = await page.evaluate(() => {
    const C = window.__leadsCheck, M = 16, out = { frames: 0, statsHits: [], tileHits: [], minTop: 1e9, maxRightWhenHigh: -1 };
    for (let f = 0; f / 30 <= C.boardUntil; f++) {
      const t = f / 30; window.__seek(t);
      const x = gsap.getProperty(C.cam, 'x'), y = gsap.getProperty(C.cam, 'y'), s = gsap.getProperty(C.cam, 'scale');
      const r = { x0: -x / s, y0: -y / s, x1: (1920 - x) / s, y1: (1080 - y) / s };
      out.frames++;
      if (t < C.dropAt) { out.minTop = Math.min(out.minTop, r.y0); if (r.y0 < C.statsBottom + M) out.statsHits.push([f, Math.round(r.y0)]); }
      const T = C.tile, hit = r.x1 > T.x0 - M && r.x0 < T.x1 + M && r.y0 < T.y1 + M && r.y1 > T.y0 - M;
      if (hit) out.tileHits.push([f, Math.round(r.x0), Math.round(r.y0), Math.round(r.x1), Math.round(r.y1)]);
      if (r.y0 < T.y1 + M) out.maxRightWhenHigh = Math.max(out.maxRightWhenHigh, r.x1);
    }
    return out;
  });
  console.log(JSON.stringify(res));
  if (res.statsHits.length || res.tileHits.length) { console.log('FRAMING CHECK FAILED'); process.exitCode = 1; } else console.log('FRAMING CHECK OK');
  iso.assertClean();
} finally { await iso.browser.close(); srv.server.close(); }
