// Capture helpers: every action is a REAL input event in the real app (puppeteer mouse /
// keyboard / touch), recorded with the element's box so the compositor can draw the cursor
// where the click actually happened. Stills are screenshots of the real app between actions,
// and every still passes the camera checks below before it is written.
import fs from 'node:fs';
import path from 'node:path';
import { BANNED_ON_CAMERA, NEVER_ON_CAMERA_INDEX, NEVER_ON_CAMERA_Q } from '../harness/server.mjs';

// The film adds to the harness list: the word "AI" (owner: Caspar is "Caspar", never "AI").
export const BANNED_IN_FILM = [...BANNED_ON_CAMERA, /\bA\.?I\b/];
// Text the app may show that must stay OUT OF FRAME: recorded as keep-out boxes on the still,
// and comp/render.mjs fails if any of them is ever visible in a rendered frame.
//   "$-0.00": the invoice's totals card computes the balance from an unrounded tax
//   (8624.696 − 8624.70) and prints minus zero; the document's own BALANCE DUE row rounds.
export const KEEP_OUT_TEXT = [/\$\s*-0\.00\b/, /-\$0\.00\b/];

// Everything a still must satisfy (run in the page). Returns { problems[], keepOut[] }.
//   hidden   selectors that may never be visible (the "never on camera" list)
//   keepOut  extra [{ sel | text, closest?, why }] boxes this still must keep out of frame
//   doc      true for a full-page still: boxes in document coordinates
export async function cameraCheck(page, { hidden, keepOut = [], doc = false }) {
  return page.evaluate((banned, keepText, hidden, keepOut, doc) => {
    const vis = (e) => { if (!e) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x + (doc ? scrollX : 0), y: r.y + (doc ? scrollY : 0), w: r.width, h: r.height }; };
    const text = document.body ? document.body.innerText : '';
    const problems = [];
    const hits = banned.map((s) => new RegExp(s.src, s.flags)).filter((re) => re.test(text)).map(String);
    if (hits.length) problems.push('banned text ' + hits.join(', '));
    const shown = hidden.filter((sel) => [...document.querySelectorAll(sel)].some(vis));
    if (shown.length) problems.push('never-on-camera control visible: ' + shown.join(', '));
    // every phone number on screen must be the cast's fictional (775) 555-01xx / 555-05xx
    const phones = [...new Set(text.match(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g) || [])].filter((p) => !/555[\s.-]0[15]\d\d/.test(p));
    if (phones.length) problems.push('non-fictional phone number(s): ' + phones.join(', '));
    const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || [])].filter((e) => !/\.test$/i.test(e));
    if (emails.length) problems.push('non-.test e-mail(s): ' + emails.join(', '));
    const oldLogo = [...document.images].filter((i) => vis(i) && /floorlogic-(mark|wordmark)-dark\.png|^data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAACg/.test(i.getAttribute('src') || '')).map((i) => (i.getAttribute('src') || '').slice(0, 60));
    if (oldLogo.length) problems.push('old logo on screen: ' + oldLogo.join(', '));
    // Nothing tilted at rest (owner): any visible element turned by an angle that is not a
    // multiple of 90° (a chevron flipped 180° is fine; a stamp at −4° is not).
    const tilted = [];
    for (const e of document.querySelectorAll('body *')) {
      const t = getComputedStyle(e).transform;
      if (!t || t === 'none' || !vis(e)) continue;
      const m = t.match(/^matrix\(([^)]+)\)/); if (!m) continue;
      const [a, b] = m[1].split(',').map(Number);
      const deg = Math.atan2(b, a) * 180 / Math.PI;
      const off = Math.abs(((deg % 90) + 90) % 90);
      if (Math.min(off, 90 - off) > 0.05) { const r = e.getBoundingClientRect(); if (r.width > 12 && r.height > 12) tilted.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} ${deg.toFixed(2)}°`); }
    }
    if (tilted.length) problems.push('tilted element(s): ' + tilted.slice(0, 5).join(', '));
    // keep-out boxes: app text that must never be in frame, plus what the shot asked for
    const out = [];
    const keepRes = keepText.map((s) => new RegExp(s.src, s.flags));
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue;
      if (keepRes.some((re) => re.test(t)) && vis(n.parentElement)) out.push({ ...box(n.parentElement), why: 'text "' + t.slice(0, 40) + '"' });
    }
    for (const k of keepOut) {
      let els = [];
      if (k.sel) els = [...document.querySelectorAll(k.sel)].filter(vis);
      if (k.text) { const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let m2; while ((m2 = w2.nextNode())) { const t = m2.textContent.replace(/\s+/g, ' ').trim(); if (t && t.toLowerCase().includes(k.text.toLowerCase()) && vis(m2.parentElement)) els.push(m2.parentElement); } }
      if (k.closest) els = els.map((e) => e.closest(k.closest) || e);
      if (!els.length && k.required) problems.push('keep-out target not found: ' + (k.sel || k.text));
      for (const e of els) out.push({ ...box(e), why: k.why || k.sel || k.text });
    }
    return { problems, keepOut: out };
  }, BANNED_IN_FILM.map((re) => ({ src: re.source, flags: re.flags })), KEEP_OUT_TEXT.map((re) => ({ src: re.source, flags: re.flags })), hidden, keepOut, doc);
}

export function makeRecorder(outDir) {
  fs.mkdirSync(path.join(outDir, 'stills'), { recursive: true });
  const manifest = { created: new Date().toISOString(), scenes: {} };
  let scene = null;
  return {
    manifest,
    begin(id, meta) { scene = manifest.scenes[id] = { id, ...meta, steps: [], actions: { click: 0, tap: 0, type: 0, keys: 0, date: 0 } }; return scene; },
    // opts: fullPage, keepOut [{sel|text, closest, why, required}] (default: the scene's), hidden (selector list)
    async still(page, name, extra = {}, opts = {}) {
      const file = `${scene.id}-${String(scene.steps.length).padStart(2, '0')}-${name}.png`;
      await settle(page);
      const hidden = opts.hidden || (scene.kind === 'phone' ? NEVER_ON_CAMERA_Q.concat(NEVER_ON_CAMERA_INDEX) : NEVER_ON_CAMERA_INDEX);
      const r = await cameraCheck(page, { hidden, keepOut: opts.keepOut || scene.keepOut || [], doc: !!opts.fullPage });
      if (r.problems.length) throw new Error(`camera check failed in still "${name}": ${r.problems.join(' · ')}`);
      await page.screenshot({ path: path.join(outDir, 'stills', file), type: 'png', fullPage: !!opts.fullPage, captureBeyondViewport: !!opts.fullPage });
      const vp = page.viewport();
      const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, content: (document.getElementById('content') || {}).scrollTop || 0 }));
      const height = opts.fullPage ? await page.evaluate(() => document.documentElement.scrollHeight) : vp.height;
      scene.steps.push({ kind: 'still', name, file, dpr: vp.deviceScaleFactor, css: { w: vp.width, h: height }, full: !!opts.fullPage, scroll, keepOut: r.keepOut, ...extra });
      return file;
    },
    action(a) { scene.steps.push({ kind: 'action', ...a }); const k = a.tap ? 'tap' : a.type; if (k in scene.actions) scene.actions[k] += a.count || 1; },
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
export async function click(rec, page, target, label, { dx = 0.5, dy = 0.5, delay = 60, x: ax, y: ay } = {}) {
  const h = typeof target === 'string' ? await page.$(target) : target;
  if (!h) throw new Error('click: not found ' + (typeof target === 'string' ? target : label));
  const b = await boxOf(page, h);
  const vp = page.viewport();
  if (b.x < 0 || b.y < 0 || b.x + b.w > vp.width || b.y + b.h > vp.height) throw new Error(`click: "${label}" is outside the viewport ${JSON.stringify(b)} — scroll first (and take a still)`);
  const x = ax != null ? ax : b.x + b.w * dx, y = ay != null ? ay : b.y + b.h * dy;
  await page.mouse.move(x, y);
  await page.mouse.down(); await new Promise((r) => setTimeout(r, delay)); await page.mouse.up();
  rec.action({ type: 'click', label, x, y, box: b });
  return { x, y, box: b };
}

// Real typing, one key at a time, with a still after each key when `stillEach`.
// `keys` may hold named keys ('ArrowUp'); `shown` is how the caption counts it.
export async function type(rec, page, text, label, { stillEach = false, name = 'type', keys = null, shown = null, kind = 'type' } = {}) {
  const shots = [];
  const seq = keys || text.split('');
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].length === 1) await page.keyboard.type(seq[i]); else await page.keyboard.press(seq[i]);
    if (stillEach) shots.push(await rec.still(page, `${name}-${i + 1}`, { typed: seq.slice(0, i + 1).join('') }));
  }
  rec.action({ type: kind, label, text: shown || text, count: 1, keys: seq.length, shots });
  return shots;
}
