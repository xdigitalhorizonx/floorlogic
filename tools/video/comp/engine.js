/* Compositor engine: one paused GSAP timeline, seeked frame by frame by the renderer.
 * Real app stills (captured by capture/run.mjs) are the content; this file only adds the
 * camera, the drawn cursor, tap/click ripples, highlight rings, captions and transitions.
 * Rules it enforces (window.__frameCheck, run on every rendered frame by render.mjs):
 *   - no still is ever drawn larger than its captured pixels (no soft, upscaled text)
 *   - nothing on the stage is turned by an angle that is not a multiple of 90° (level)
 *   - no keep-out box recorded with a still (e.g. the invoice card's "$-0.00") is in frame */
(function () {
  'use strict';
  const W = 1920, H = 1080;
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });
  const scenesEl = document.getElementById('scenes');
  const capsEl = document.getElementById('caps');
  const pending = [];
  const allImgs = [];
  const E = (tag, cls, parent, style) => { const e = document.createElement(tag); if (cls) e.className = cls; if (style) Object.assign(e.style, style); if (parent) parent.appendChild(e); return e; };
  CustomEase.create('flSoft', 'M0,0 C0.3,0.05 0.2,1 1,1');
  CustomEase.create('flOut', 'M0,0 C0.22,1 0.36,1 1,1');

  const CURSOR_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="40" viewBox="0 0 34 40">' +
    '<path d="M3 2 L3 31 L10.5 24.4 L15.6 36.2 L21.2 33.8 L16.1 22.2 L26 22.2 Z" fill="#fff" stroke="#0b1220" stroke-width="2.4" stroke-linejoin="round"/></svg>');

  // A still: `step` is the manifest entry (file, css size, dpr, keep-out boxes).
  function img(parent, step, style) {
    const im = E('img', 'still', parent, style);
    im.decoding = 'sync';
    pending.push(new Promise((res) => { im.onload = () => im.decode().then(res, res); im.onerror = () => { console.error('img failed ' + step.file); res(); }; }));
    im.src = '/stills/' + step.file;
    im.__step = step; allImgs.push(im);
    return im;
  }

  // ------------------------------------------------------------------ desktop
  function Desktop(o) {
    const s = this;
    s.css = o.css; s.S = W / o.css.w;
    s.win = { x: 0, y: 0, w: o.css.w * s.S, h: o.css.h * s.S };
    s.layer = E('div', 'layer', scenesEl, { opacity: 0 });
    s.cam = E('div', 'cam', s.layer);
    s.winEl = E('div', 'win', s.cam, { left: '0px', top: '0px', width: s.win.w + 'px', height: s.win.h + 'px' });
    s.vp = E('div', 'vp', s.winEl, { width: s.win.w + 'px', height: s.win.h + 'px' });
    s.overlay = E('div', 'vp', s.cam, { width: s.win.w + 'px', height: s.win.h + 'px' });   // rings above the stills
    s.ripple = E('div', 'ripple', s.cam);
    s.curWrap = E('div', 'curwrap', s.cam, { position: 'absolute', left: 0, top: 0, width: '34px', height: '40px', transformOrigin: '0 0' });
    s.cursor = E('img', 'cursor', s.curWrap); s.cursor.src = CURSOR_SVG;
    s.z = 1; s.cur = { x: W * 0.6, y: H * 0.7 }; s.top = null; s.zi = 10; s.maxZ = Infinity;
    gsap.set(s.curWrap, { x: s.cur.x, y: s.cur.y, opacity: 0, scale: 1.12 });
    gsap.set(s.cam, { x: 0, y: 0, scale: 1 });
  }
  const D = Desktop.prototype;
  D.px = function (cx, cy) { return { x: this.win.x + cx * this.S, y: this.win.y + cy * this.S }; };
  D.still = function (t, step, fade) {
    const im = img(this.vp, step, { width: this.win.w + 'px', height: this.win.h + 'px', opacity: 0, zIndex: String(++this.zi) });
    this.maxZ = Math.min(this.maxZ, step.dpr / this.S);
    fade = fade == null ? 0.18 : fade;
    const prev = this.top;
    if (fade > 0) tl.fromTo(im, { opacity: 0 }, { opacity: 1, duration: fade, ease: 'none', immediateRender: false }, t);
    else tl.set(im, { opacity: 1 }, t);
    if (prev) tl.set(prev, { opacity: 0 }, t + fade + 0.001);
    this.top = im; return im;
  };
  // Play a captured real scroll: one still per frame.
  D.flip = function (t, steps, fps) {
    const dt = 1 / (fps || 30); let prev = this.top;
    steps.forEach((step, i) => {
      const im = img(this.vp, step, { width: this.win.w + 'px', height: this.win.h + 'px', opacity: 0, zIndex: String(++this.zi) });
      this.maxZ = Math.min(this.maxZ, step.dpr / this.S);
      tl.set(im, { opacity: 1 }, t + i * dt);
      if (prev) tl.set(prev, { opacity: 0 }, t + i * dt + 0.0005);
      prev = im;
    });
    this.top = prev; return t + steps.length * dt;
  };
  D.show = function (t, dur) { tl.fromTo(this.layer, { opacity: 0 }, { opacity: 1, duration: dur == null ? 0.35 : dur, ease: 'none', immediateRender: false }, t); return this; };
  D.hide = function (t, dur) { tl.to(this.layer, { opacity: 0, duration: dur == null ? 0.35 : dur, ease: 'none' }, t); return this; };
  // Camera: put css point (cx,cy) at stage point (ax,ay) at zoom z. Zoomed in, the window
  // always covers the frame (no empty edges); zoomed out, it is centred.
  D.camState = function (cx, cy, z, ax, ay) {
    const p = this.px(cx, cy); ax = ax == null ? W / 2 : ax; ay = ay == null ? H / 2 : ay;
    let x = ax - z * p.x, y = ay - z * p.y;
    const ww = this.win.w * z, wh = this.win.h * z;
    if (ww >= W) x = Math.min(0, Math.max(W - ww, x)); else x = (W - ww) / 2;
    if (wh >= H) y = Math.min(0, Math.max(H - wh, y)); else y = (H - wh) / 2;
    return { x, y, scale: z };
  };
  // Frame a css rectangle {x0,y0,x1,y1}: the largest zoom that shows all of it (capped at zmax).
  D.fit = function (r, zmax) { const z = Math.min(zmax || 2, W / ((r.x1 - r.x0) * this.S), H / ((r.y1 - r.y0) * this.S)); return { cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, z }; };
  D.camera = function (t, dur, cx, cy, z, ax, ay, ease) {
    if (typeof cx === 'object') { const f = cx; ease = cy; cx = f.cx; cy = f.cy; z = f.z; ax = f.ax; ay = f.ay; }
    const st = this.camState(cx, cy, z, ax, ay);
    if (dur > 0) { tl.to(this.cam, { ...st, duration: dur, ease: ease || 'flSoft' }, t); tl.to(this.curWrap, { scale: 1.12 / z, duration: dur, ease: ease || 'flSoft' }, t); }
    else { tl.set(this.cam, st, t); tl.set(this.curWrap, { scale: 1.12 / z }, t); }
    this.z = z; return this;
  };
  D.cursorIn = function (t, cx, cy) { const p = this.px(cx, cy); tl.set(this.curWrap, { x: p.x, y: p.y }, t); tl.to(this.curWrap, { opacity: 1, duration: 0.2, ease: 'none' }, t); this.cur = p; return this; };
  D.cursorOut = function (t) { tl.to(this.curWrap, { opacity: 0, duration: 0.2, ease: 'none' }, t); return this; };
  D.move = function (t, dur, cx, cy, ease) {
    const p = this.px(cx, cy), from = this.cur;
    const mx = (from.x + p.x) / 2, my = (from.y + p.y) / 2, dx = p.x - from.x, dy = p.y - from.y, len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(70, len * 0.14), qx = mx - (dy / len) * bend, qy = my + (dx / len) * bend;
    const o = { k: 0 }, cw = this.curWrap;
    tl.fromTo(o, { k: 0 }, { k: 1, duration: dur, ease: ease || 'power3.inOut', immediateRender: false, onUpdate: () => {
      const k = o.k, a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
      gsap.set(cw, { x: a * from.x + b * qx + c * p.x, y: a * from.y + b * qy + c * p.y });
    } }, t);
    this.cur = p; return this;
  };
  D.click = function (t) {
    tl.to(this.cursor, { scale: 0.84, duration: 0.07, ease: 'power1.out', transformOrigin: '3px 2px' }, t);
    tl.to(this.cursor, { scale: 1, duration: 0.16, ease: 'power1.out' }, t + 0.07);
    tl.set(this.ripple, { x: this.cur.x, y: this.cur.y, scale: 0.3, opacity: 0.9 }, t);
    tl.to(this.ripple, { scale: 1.3, opacity: 0, duration: 0.5, ease: 'power2.out' }, t);
    return this;
  };
  // A level highlight ring around a css box (drawn in camera space, so it zooms with the shot).
  D.ring = function (t, box, dur, pad) {
    pad = pad == null ? 6 : pad;
    const r = E('div', 'ring', this.overlay, { left: (box.x - pad) * this.S + 'px', top: (box.y - pad) * this.S + 'px', width: (box.w + 2 * pad) * this.S + 'px', height: (box.h + 2 * pad) * this.S + 'px', opacity: 0 });
    tl.fromTo(r, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'flOut', immediateRender: false }, t);
    tl.to(r, { opacity: 0, duration: 0.3, ease: 'none' }, t + (dur || 1));
    return r;
  };

  // ------------------------------------------------------------------ phone
  // Tall (full-page) or viewport stills inside a drawn phone, scrolled by the camera.
  function Phone(o) {
    const s = this;
    s.cssW = o.cssW; s.viewH = o.viewH; s.barH = o.barH;
    s.S = 410 / s.cssW;
    const screenH = (s.barH + s.viewH) * s.S;
    s.layer = E('div', 'layer', scenesEl, { opacity: 0 });
    s.cam = E('div', 'cam', s.layer);
    s.body = E('div', 'phone', s.cam, { left: o.x + 'px', top: o.y + 'px', height: (screenH + 28) + 'px' });
    [['-4px', '172px', '4px', '64px'], ['-4px', '258px', '4px', '96px'], ['-4px', '370px', '4px', '96px'], ['438px', '280px', '4px', '130px']].forEach((b) => E('div', 'btn', s.body, { left: b[0], top: b[1], width: b[2], height: b[3] }));
    s.scr = E('div', 'scr', s.body, { height: screenH + 'px' });
    s.page = E('div', 'pagewin', s.scr, { position: 'absolute', left: 0, top: s.barH * s.S + 'px', width: '410px', height: s.viewH * s.S + 'px', overflow: 'hidden', background: o.pageBg || '#f3f4f6' });
    s.vp = E('div', 'vp', s.page, { width: '410px' });
    s.fixed = E('div', 'vp', s.page, { width: '410px', height: s.viewH * s.S + 'px' });
    s.overlay = E('div', 'vp', s.page, { width: '410px', height: s.viewH * s.S + 'px', zIndex: '45' });
    s.bar = E('div', 'statusbar', s.scr, { height: s.barH * s.S + 'px', background: o.barBg || '#fff' });
    s.bar.innerHTML = '<span class="sb-time">' + (o.time || '9:41') + '</span><span class="sb-icons">' +
      '<svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
      '<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.2c2.5 0 4.8 1 6.5 2.6l1.3-1.4C14.2 1.5 11.5.3 8.5.3S2.8 1.5.7 3.4L2 4.8C3.7 3.2 6 2.2 8.5 2.2zm0 3.8c1.5 0 2.8.6 3.8 1.5l1.3-1.4c-1.3-1.2-3.1-2-5.1-2s-3.8.8-5.1 2l1.3 1.4c1-.9 2.3-1.5 3.8-1.5zm0 3.7c.6 0 1.1.2 1.5.6L8.5 12 7 10.3c.4-.4.9-.6 1.5-.6z"/></svg>' +
      '<svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="22" height="12" rx="3.5" fill="none" stroke="#111" stroke-opacity=".45"/><rect x="2.5" y="2.5" width="16" height="8" rx="2"/><path d="M24.5 4.5v4c.9-.3 1.5-1.1 1.5-2s-.6-1.7-1.5-2z" fill-opacity=".5"/></svg></span>';
    E('div', 'island', s.body);
    s.origin = { x: o.x + 14, y: o.y + 14 + s.barH * s.S };
    s.tap = E('div', 'tap', s.cam);
    s.scrollState = { y: 0 }; s.top = null; s.zi = 10;
    gsap.set(s.cam, { x: 0, y: 0, scale: 1, transformOrigin: '0 0' });
    s.layerBox = { x: o.x, y: o.y, w: 438, h: screenH + 28 };
    s.centre = { x: o.x + 219, y: o.y + (screenH + 28) / 2 };
  }
  const P = Phone.prototype;
  // a full-page (or viewport) capture shown at the current scroll position
  P.tall = function (t, step, fade) {
    const im = img(this.vp, step, { position: 'absolute', left: 0, top: 0, width: '410px', height: step.css.h * this.S + 'px', opacity: 0, zIndex: String(++this.zi) });
    fade = fade == null ? 0.16 : fade; const prev = this.top;
    if (fade > 0) tl.fromTo(im, { opacity: 0 }, { opacity: 1, duration: fade, ease: 'none', immediateRender: false }, t); else tl.set(im, { opacity: 1 }, t);
    if (prev) tl.set(prev, { opacity: 0 }, t + fade + 0.001);
    this.top = im; return im;
  };
  // a viewport-sized capture shown over the page (e.g. a toast moment)
  P.viewport = function (t, step, fade, out) {
    const im = img(this.fixed, step, { position: 'absolute', left: 0, top: 0, width: '410px', height: this.viewH * this.S + 'px', opacity: 0, zIndex: '50' });
    tl.fromTo(im, { opacity: 0 }, { opacity: 1, duration: fade || 0.12, ease: 'none', immediateRender: false }, t);
    if (out != null) tl.to(im, { opacity: 0, duration: 0.12, ease: 'none' }, out);
    return im;
  };
  P.fixedImg = function (step, box) { return img(this.fixed, step, { position: 'absolute', left: box.x * this.S + 'px', top: box.y * this.S + 'px', width: box.w * this.S + 'px', height: box.h * this.S + 'px', zIndex: '40' }); };
  P.scrollTo = function (t, dur, y, ease) {
    if (dur > 0) tl.to(this.vp, { y: -y * this.S, duration: dur, ease: ease || 'power2.inOut' }, t); else tl.set(this.vp, { y: -y * this.S }, t);
    this.scrollState.y = y; return this;
  };
  // stage point of a viewport css point (camera at identity)
  P.at = function (vx, vy) { return { x: this.origin.x + vx * this.S, y: this.origin.y + vy * this.S }; };
  P.tapAt = function (t, vx, vy) {
    const p = this.at(vx, vy);
    tl.set(this.tap, { x: p.x, y: p.y, scale: 0.5, opacity: 0 }, t - 0.14);
    tl.to(this.tap, { opacity: 1, scale: 0.8, duration: 0.12, ease: 'power1.out' }, t - 0.14);
    tl.to(this.tap, { opacity: 0, scale: 1.3, duration: 0.4, ease: 'power2.out' }, t + 0.04);
    return this;
  };
  // level ring around a VIEWPORT css box (for viewport stills / the current scroll)
  P.ring = function (t, box, dur, pad) {
    pad = pad == null ? 5 : pad;
    const r = E('div', 'ring', this.overlay, { left: (box.x - pad) * this.S + 'px', top: (box.y - pad) * this.S + 'px', width: (box.w + 2 * pad) * this.S + 'px', height: (box.h + 2 * pad) * this.S + 'px', opacity: 0, borderRadius: '18px' });
    tl.fromTo(r, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'flOut', immediateRender: false }, t);
    tl.to(r, { opacity: 0, duration: 0.3, ease: 'none' }, t + (dur || 1));
    return r;
  };
  // zoom the phone so stage point p sits at (ax, ay)
  P.zoomTo = function (t, dur, z, p, ax, ay, ease) {
    const st = { scale: z, x: (ax == null ? p.x : ax) - z * p.x, y: (ay == null ? p.y : ay) - z * p.y };
    if (dur > 0) tl.to(this.cam, { ...st, duration: dur, ease: ease || 'flSoft' }, t); else tl.set(this.cam, st, t);
    return this;
  };
  P.show = function (t, dur) { tl.fromTo(this.layer, { opacity: 0 }, { opacity: 1, duration: dur || 0.4, ease: 'none', immediateRender: false }, t); return this; };
  P.hide = function (t, dur) { tl.to(this.layer, { opacity: 0, duration: dur || 0.35, ease: 'none' }, t); return this; };

  // ------------------------------------------------------------------ captions
  const cues = [];
  function Caption(o) {
    const c = E('div', 'cap' + (o.big ? ' big' : ''), capsEl, Object.assign({ opacity: 0 }, o.style || {}));
    const eb = E('div', 'eyebrow', c); E('span', 'num', eb).textContent = o.num; E('span', 'lab', eb).textContent = o.label;
    this.date = o.date ? E('span', 'date', eb) : null; if (this.date) this.date.textContent = o.date;
    E('div', 'text', c).innerHTML = o.text;
    this.cnt = E('div', 'count', c); E('span', 'dot', this.cnt); this.val = E('span', 'v', this.cnt); this.val.textContent = '';
    gsap.set(this.cnt, { opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' });   // grows in with the first real action
    this.shown = false; this.el = c; this.o = o; this.lastCount = '';
    this.cue = { num: o.num, label: o.label, text: o.text.replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim(), date: o.date || '', describe: o.describe || '', start: null, end: null, count: '' };
    cues.push(this.cue);
  }
  Caption.prototype.inAt = function (t, quick) {
    if (quick) tl.fromTo(this.el, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none', immediateRender: false }, t);
    else tl.fromTo(this.el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45, ease: 'flOut', immediateRender: false }, t);
    this.cue.start = t; return this;
  };
  Caption.prototype.outAt = function (t, quick) {
    if (quick) tl.to(this.el, { opacity: 0, duration: 0.2, ease: 'none' }, t);
    else tl.to(this.el, { opacity: 0, y: -12, duration: 0.28, ease: 'power1.in' }, t);
    this.cue.end = t + (quick ? 0.2 : 0.28); return this;
  };
  Caption.prototype.count = function (t, text) {
    if (!this.shown) { tl.to(this.cnt, { height: 'auto', marginTop: 18, paddingTop: 8, paddingBottom: 8, opacity: 1, duration: 0.28, ease: 'power2.out' }, t); this.shown = true; }
    tl.set(this.val, { textContent: text }, t);
    tl.fromTo(this.cnt, { scale: 1.1 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, t);
    this.cue.count = text; return this;
  };

  // ------------------------------------------------------------------ frame QA
  const rot = (el) => { const t = getComputedStyle(el).transform; if (!t || t === 'none') return 0; const m = t.match(/^matrix\(([^)]+)\)/); if (!m) return 0; const [a, b] = m[1].split(',').map(Number); return Math.atan2(b, a) * 180 / Math.PI; };
  const effOpacity = (el) => { let o = 1; while (el && el !== document.documentElement) { o *= parseFloat(getComputedStyle(el).opacity); if (!(o > 0.004)) return 0; el = el.parentElement; } return o; };
  const clipOf = (im) => { let el = im.parentElement; while (el && el !== document.body) { const s = getComputedStyle(el); if (s.overflow === 'hidden' || s.overflowX === 'hidden') return el.getBoundingClientRect(); el = el.parentElement; } return { left: 0, top: 0, right: W, bottom: H }; };
  const inter = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  window.__frameCheck = function (margin) {
    margin = margin == null ? 6 : margin;           // css px of the still around a keep-out box
    const out = { upscale: [], tilted: [], keepOut: [], visible: [] };
    const stage = { left: 0, top: 0, right: W, bottom: H };
    for (const im of allImgs) {
      const op = effOpacity(im); if (op <= 0.004) continue;
      const r = im.getBoundingClientRect();
      if (r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;
      const step = im.__step; const scale = r.width / im.naturalWidth;      // stage px per image px
      out.visible.push(step.file);
      if (scale > 1.0005) out.upscale.push(`${step.file} ×${scale.toFixed(3)}`);
      const k = r.width / step.css.w;                                          // stage px per css px
      const vis = inter(inter(stage, clipOf(im)), { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      for (const b of step.keepOut || []) {
        const box = { left: r.left + (b.x - margin) * k, top: r.top + (b.y - margin) * k, right: r.left + (b.x + b.w + margin) * k, bottom: r.top + (b.y + b.h + margin) * k };
        const i = inter(vis, box);
        if (i.right > i.left + 0.5 && i.bottom > i.top + 0.5) out.keepOut.push(`${step.file}: ${b.why} (${Math.round(i.right - i.left)}×${Math.round(i.bottom - i.top)} px in frame, opacity ${op.toFixed(2)})`);
      }
    }
    for (const el of document.querySelectorAll('#stage *')) {
      const d = rot(el); const off = Math.abs(((d % 90) + 90) % 90);
      if (Math.min(off, 90 - off) > 0.05 && effOpacity(el) > 0.004) out.tilted.push(`${el.tagName.toLowerCase()}.${el.className} ${d.toFixed(2)}°`);
    }
    return out;
  };

  window.FL = { tl, Desktop, Phone, Caption, W, H, E, cues };
  window.__ready = () => Promise.all(pending).then(() => document.fonts.ready).then(() => allImgs.length);
  // (a hair past 0 so the zero-duration sets placed at 0 render on the very first frame)
  window.__seek = (t) => { tl.seek(Math.max(t, 1e-4), false); return tl.time(); };
  // Before a screenshot: make sure every visible image is decoded (no half-painted frames).
  window.__prepareFrame = async () => {
    const vis = allImgs.filter((im) => effOpacity(im) > 0.004);
    await Promise.all(vis.map((im) => im.decode().catch(() => {})));
    return vis.length;
  };
  window.__duration = () => tl.duration();
})();
