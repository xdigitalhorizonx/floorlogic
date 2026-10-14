// Measure the lead board's stats row + Win Rate tile (CSS px) in the same offline layout the stills used.
import { startServer } from '../harness/server.mjs';
import { launchIsolated } from '../harness/browser.mjs';
import { stubSource } from '../harness/stub-source.mjs';
const srv = await startServer();
const iso = await launchIsolated({ port: srv.port, freezeAt: Date.parse('2026-10-14T09:41:00-07:00'), stubSource });
try {
  const page = await iso.newPage({ width: 1920, height: 1080, dpr: 1 });
  await page.goto(`${iso.origin}/__harness/db.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.__flStub.reseed());
  await page.goto(`${iso.origin}/index.html#leads`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 2500));
  const m = await page.evaluate(() => {
    const w = document.createTreeWalker(document.getElementById('content'), NodeFilter.SHOW_TEXT); let n, lab = null;
    while ((n = w.nextNode())) if (/win rate/i.test(n.textContent)) { lab = n.parentElement; break; }
    let tile = lab; while (tile && tile.getBoundingClientRect().height < 50) tile = tile.parentElement;
    const row = tile.parentElement;
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return { tile: r(tile), row: r(row), tileText: tile.innerText.replace(/\s+/g, ' ').trim(), scroll: document.getElementById('content').scrollTop };
  });
  console.log(JSON.stringify(m));
  iso.assertClean();
} finally { await iso.browser.close(); srv.server.close(); }
