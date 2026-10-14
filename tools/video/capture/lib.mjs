// Capture helpers: every action is a REAL input event in the real app (puppeteer mouse /
// keyboard), recorded with the element's box so the compositor can draw the cursor where
// the click actually happened. Stills are screenshots of the real app between actions.
import fs from 'node:fs';
import path from 'node:path';

export function makeRecorder(outDir) {
  fs.mkdirSync(path.join(outDir, 'stills'), { recursive: true });
  const manifest = { created: new Date().toISOString(), scenes: {} };
  let scene = null;
  return {
    manifest,
    begin(id, meta) { scene = manifest.scenes[id] = { id, ...meta, steps: [], actions: { click: 0, drag: 0, type: 0, keys: 0 } }; return scene; },
    async still(page, name, extra = {}, opts = {}) {
      const file = `${scene.id}-${String(scene.steps.length).padStart(2, '0')}-${name}.png`;
      await settle(page);
      // Hard rule: none of these may ever be on camera. Checked on the rendered text of every still.
      const hits = await page.evaluate(() => {
        const t = document.body ? document.body.innerText : '';
        const bad = [/landmark/i, /\berick\b/i, /foundation/i, /855[\s.-]*457[\s.-]*2197/, /casper/i, /charge card/i];
        return bad.filter((re) => re.test(t)).map((re) => String(re));
      });
      if (hits.length) throw new Error(`banned text on screen in still "${name}": ${hits.join(', ')}`);
      const shareVisible = await page.evaluate(() => [...document.querySelectorAll('.hdr-share-btn, button[onclick^="openShareMenu"]')].some((b) => b.offsetParent !== null));
      if (shareVisible) throw new Error(`a Share button is visible in still "${name}"`);
      await page.screenshot({ path: path.join(outDir, 'stills', file), type: 'png', fullPage: !!opts.fullPage });
      const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
      scene.steps.push({ kind: 'still', name, file, scroll, ...extra });
      return file;
    },
    action(a) { scene.steps.push({ kind: 'action', ...a }); if (a.type in scene.actions) scene.actions[a.type] += a.count || 1; },
    note(n) { scene.steps.push({ kind: 'note', ...n }); },
    save() { fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1)); },
    get scene() { return scene; },
  };
}

// Wait for layout + images + two frames, so a still never catches a half-render.
export async function settle(page, ms = 120) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // let entrance animations/transitions (toasts sliding in, modal fades) finish
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      const running = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity);
      if (!running.length) break;
      await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 250))]);
    }
  });
  if (ms) await new Promise((r) => setTimeout(r, ms));
}

export async function boxOf(page, target) {
  const h = typeof target === 'string' ? await page.$(target) : target;
  if (!h) throw new Error('boxOf: not found ' + target);
  const b = await h.boundingBox();
  if (!b) throw new Error('boxOf: not visible ' + target);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

// Find a visible element by exact/regex text within a selector scope.
export async function byText(page, selector, text, { exact = false } = {}) {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const ok = await h.evaluate((el, text, exact) => {
      const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      const vis = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
      if (!vis) return false;
      if (text.startsWith('/')) { const m = text.match(/^\/(.*)\/([a-z]*)$/); return new RegExp(m[1], m[2]).test(t); }
      return exact ? t === text : t.includes(text);
    }, String(text), exact);
    if (ok) return h;
  }
  return null;
}

export async function mustText(page, selector, text, opts) {
  const h = await byText(page, selector, text, opts);
  if (!h) throw new Error(`not found: ${selector} with text ${text}`);
  return h;
}

// A real click at the element's centre (or an offset inside it). Returns the click point.
export async function click(rec, page, target, label, { dx = 0.5, dy = 0.5, delay = 60 } = {}) {
  const h = typeof target === 'string' ? await page.$(target) : target;
  if (!h) throw new Error('click: not found ' + (typeof target === 'string' ? target : label));
  const b = await boxOf(page, h);
  const vp = page.viewport();
  if (b.x < 0 || b.y < 0 || b.x + b.w > vp.width || b.y + b.h > vp.height) throw new Error(`click: "${label}" is outside the viewport ${JSON.stringify(b)} — scroll first (and take a still)`);
  const x = b.x + b.w * dx, y = b.y + b.h * dy;
  await page.mouse.move(x, y);
  await page.mouse.down(); await new Promise((r) => setTimeout(r, delay)); await page.mouse.up();
  rec.action({ type: 'click', label, x, y, box: b });
  return { x, y, box: b };
}

// Real typing, one key at a time, with a still after each key when `stillEach`.
export async function type(rec, page, text, label, { stillEach = false, name = 'type' } = {}) {
  const shots = [];
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i]);
    if (stillEach) shots.push(await rec.still(page, `${name}-${i + 1}`, { typed: text.slice(0, i + 1) }));
  }
  rec.action({ type: 'type', label, text, count: 1, keys: text.length, shots });
  return shots;
}
