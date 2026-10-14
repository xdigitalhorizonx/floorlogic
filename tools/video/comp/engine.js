/* Compositor engine: one paused GSAP timeline, seeked frame by frame by the renderer.
 * Real app stills (captured by capture/run.mjs) are the content; this file only adds the
 * camera, the drawn cursor, tap/click ripples, captions and transitions. */
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

  function img(parent, src, style) {
    const im = E('img', 'still', parent, style);
    im.decoding = 'sync';
    pending.push(new Promise((res) => { im.onload = () => im.decode().then(res, res); im.onerror = () => { console.error('img failed ' + src); res(); }; }));
    im.src = src; allImgs.push(im);
    return im;
  }

  // ------------------------------------------------------------------ desktop
  function Desktop(o) {
    const s = this;
    s.css = o.css; s.S = o.scale || W / o.css.w;
    s.win = { x: 0, y: 0, w: o.css.w * s.S, h: o.css.h * s.S };
    s.layer = E('div', 'layer', scenesEl, { opacity: 0 });
    s.cam = E('div', 'cam', s.layer);
    s.winEl = E('div', 'win', s.cam, { left: '0px', top: '0px', width: s.win.w + 'px', height: s.win.h + 'px' });
    s.vp = E('div', 'vp', s.winEl, { width: s.win.w + 'px', height: s.win.h + 'px' });
    s.overlay = E('div', 'vp', s.cam, { width: s.win.w + 'px', height: s.win.h + 'px' });   // drawn UI (dialogs) above stills
    s.ghost = E('div', 'ghost', s.cam);
    s.ripple = E('div', 'ripple', s.cam);
    s.curWrap = E('div', 'curwrap', s.cam, { position: 'absolute', left: 0, top: 0, width: '34px', height: '40px', transformOrigin: '0 0' });
    s.cursor = E('img', 'cursor', s.curWrap); s.cursor.src = CURSOR_SVG;
    s.z = 1; s.cur = { x: W * 0.6, y: H * 0.7 }; s.top = null; s.zi = 10;
    gsap.set(s.curWrap, { x: s.cur.x, y: s.cur.y, opacity: 0, scale: 1 });
    gsap.set(s.cam, { x: 0, y: 0, scale: 1 });
  }
  const D = Desktop.prototype;
  D.px = function (cx, cy) { return { x: this.win.x + cx * this.S, y: this.win.y + cy * this.S }; };
  D.still = function (t, src, fade) {
    const im = img(this.vp, src, { width: this.win.w + 'px', height: this.win.h + 'px', opacity: 0, zIndex: String(++this.zi) });
    fade = fade == null ? 0.18 : fade;
    const prev = this.top;
    if (fade > 0) tl.fromTo(im, { opacity: 0 }, { opacity: 1, duration: fade, ease: 'none', immediateRender: false }, t);
    else tl.set(im, { opacity: 1 }, t);
    if (prev) tl.set(prev, { opacity: 0 }, t + fade + 0.001);
    this.top = im; return im;
  };
  // Play a captured real scroll: one still per frame.
  D.flip = function (t, srcs, fps) {
    const dt = 1 / (fps || 30); let prev = this.top;
    srcs.forEach((src, i) => {
      const im = img(this.vp, src, { width: this.win.w + 'px', height: this.win.h + 'px', opacity: 0, zIndex: String(++this.zi) });
      tl.set(im, { opacity: 1 }, t + i * dt);
      if (prev) tl.set(prev, { opacity: 0 }, t + i * dt + 0.0005);
      prev = im;
    });
    this.top = prev; return t + srcs.length * dt;
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
  D.camera = function (t, dur, cx, cy, z, ax, ay, ease) {
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
  // Drag a crop of `src` (the card box) with the cursor from its grab point to (tx,ty).
  D.drag = function (t, dur, src, box, grab, to) {
    const S = this.S, g = this.ghost, start = this.px(grab.x, grab.y), end = this.px(to.x, to.y);
    const bx = this.win.x + box.x * S, by = this.win.y + box.y * S, offX = start.x - bx, offY = start.y - by;
    gsap.set(g, { width: box.w * S, height: box.h * S, backgroundImage: 'url(' + src + ')', backgroundSize: this.win.w + 'px ' + this.win.h + 'px', backgroundPosition: (-box.x * S) + 'px ' + (-box.y * S) + 'px', x: bx, y: by, opacity: 0 });
    tl.set(g, { x: bx, y: by, rotation: 0, scale: 1, opacity: 0 }, t);
    tl.to(g, { opacity: 0.96, rotation: 0, scale: 1.04, duration: 0.16, ease: 'power1.out' }, t); // level lift (owner: nothing tilted)
    const o = { k: 0 }, cw = this.curWrap;
    tl.fromTo(o, { k: 0 }, { k: 1, duration: dur, ease: 'power2.inOut', immediateRender: false, onUpdate: () => {
      const x = start.x + (end.x - start.x) * o.k, y = start.y + (end.y - start.y) * o.k - Math.sin(Math.PI * o.k) * 28;
      gsap.set(cw, { x, y }); gsap.set(g, { x: x - offX, y: y - offY });
    } }, t + 0.06);
    this.cur = end; return t + 0.06 + dur;
  };
  D.drop = function (t) { tl.to(this.ghost, { opacity: 0, scale: 0.98, rotation: 0, duration: 0.16, ease: 'none' }, t); return this; };

  // ------------------------------------------------------------------ phone (tall pages)
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
    s.page = E('div', 'pagewin', s.scr, { position: 'absolute', left: 0, top: s.barH * s.S + 'px', width: '410px', height: s.viewH * s.S + 'px', overflow: 'hidden', background: '#f3f4f6' });
    s.vp = E('div', 'vp', s.page, { width: '410px' });
    s.fixed = E('div', 'vp', s.page, { width: '410px', height: s.viewH * s.S + 'px' });
    s.bar = E('div', 'statusbar', s.scr, { height: s.barH * s.S + 'px' });
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
  }
  const P = Phone.prototype;
  // a full-page capture (css height h) shown at the current scroll position
  P.tall = function (t, src, cssH, fade) {
    const im = img(this.vp, src, { position: 'absolute', left: 0, top: 0, width: '410px', height: cssH * this.S + 'px', opacity: 0, zIndex: String(++this.zi) });
    fade = fade == null ? 0.16 : fade; const prev = this.top;
    if (fade > 0) tl.fromTo(im, { opacity: 0 }, { opacity: 1, duration: fade, ease: 'none', immediateRender: false }, t); else tl.set(im, { opacity: 1 }, t);
    if (prev) tl.set(prev, { opacity: 0 }, t + fade + 0.001);
    this.top = im; return im;
  };
  // a viewport-sized capture shown over the page (e.g. a toast moment)
  P.viewport = function (t, src, fade, out) {
    const im = img(this.fixed, src, { position: 'absolute', left: 0, top: 0, width: '410px', height: this.viewH * this.S + 'px', opacity: 0, zIndex: '50' });
    tl.fromTo(im, { opacity: 0 }, { opacity: 1, duration: fade || 0.12, ease: 'none', immediateRender: false }, t);
    if (out != null) tl.to(im, { opacity: 0, duration: 0.12, ease: 'none' }, out);
    return im;
  };
  P.fixedImg = function (src, box) { return img(this.fixed, src, { position: 'absolute', left: box.x * this.S + 'px', top: box.y * this.S + 'px', width: box.w * this.S + 'px', height: box.h * this.S + 'px', zIndex: '40' }); };
  P.scrollTo = function (t, dur, y, ease) {
    if (dur > 0) tl.to(this.vp, { y: -y * this.S, duration: dur, ease: ease || 'power2.inOut' }, t); else tl.set(this.vp, { y: -y * this.S }, t);
    this.scrollState.y = y; return this;
  };
  P.tapAt = function (t, vx, vy) {
    const p = { x: this.origin.x + vx * this.S, y: this.origin.y + vy * this.S };
    tl.set(this.tap, { x: p.x, y: p.y, scale: 0.5, opacity: 0 }, t - 0.14);
    tl.to(this.tap, { opacity: 1, scale: 0.8, duration: 0.12, ease: 'power1.out' }, t - 0.14);
    tl.to(this.tap, { opacity: 0, scale: 1.3, duration: 0.4, ease: 'power2.out' }, t + 0.04);
    return this;
  };
  P.show = function (t, dur) { tl.fromTo(this.layer, { opacity: 0 }, { opacity: 1, duration: dur || 0.4, ease: 'none', immediateRender: false }, t); return this; };
  P.hide = function (t, dur) { tl.to(this.layer, { opacity: 0, duration: dur || 0.35, ease: 'none' }, t); return this; };

  // ------------------------------------------------------------------ captions
  function Caption(o) {
    const c = E('div', 'cap' + (o.big ? ' big' : ''), capsEl, Object.assign({ opacity: 0 }, o.style || {}));
    const eb = E('div', 'eyebrow', c); E('span', 'num', eb).textContent = o.num; E('span', 'lab', eb).textContent = o.label;
    this.date = o.date ? E('span', 'date', eb) : null; if (this.date) this.date.textContent = o.date;
    E('div', 'text', c).innerHTML = o.text;
    this.cnt = E('div', 'count', c); E('span', 'dot', this.cnt); this.val = E('span', 'v', this.cnt); this.val.textContent = o.zero || '';
    gsap.set(this.cnt, { opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' });   // grows in with the first real action
    this.shown = false;
    this.el = c;
  }
  Caption.prototype.inAt = function (t) { tl.fromTo(this.el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45, ease: 'flOut', immediateRender: false }, t); return this; };
  Caption.prototype.outAt = function (t) { tl.to(this.el, { opacity: 0, y: -12, duration: 0.28, ease: 'power1.in' }, t); return this; };
  Caption.prototype.count = function (t, text) {
    if (!this.shown) { tl.to(this.cnt, { height: 'auto', marginTop: 18, paddingTop: 8, paddingBottom: 8, opacity: 1, duration: 0.28, ease: 'power2.out' }, t); this.shown = true; }
    tl.set(this.val, { textContent: text }, t);
    tl.fromTo(this.cnt, { scale: 1.1 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, t);
    return this;
  };
  Caption.prototype.dateAt = function (t, text) {
    if (!this.date) return this;
    tl.to(this.date, { opacity: 0, y: -6, duration: 0.12, ease: 'power1.in' }, t - 0.12);
    tl.set(this.date, { textContent: text, y: 6 }, t);
    tl.to(this.date, { opacity: 1, y: 0, duration: 0.2, ease: 'power1.out' }, t);
    return this;
  };

  window.FL = { tl, Desktop, Phone, Caption, W, H, E, img };
  window.__ready = () => Promise.all(pending).then(() => document.fonts.ready).then(() => allImgs.length);
  // (a hair past 0 so the zero-duration sets placed at 0 render on the very first frame)
  window.__seek = (t) => { tl.seek(Math.max(t, 1e-4), false); return tl.time(); };
  // Before a screenshot: make sure every visible image is decoded (no half-painted frames).
  window.__prepareFrame = async () => {
    const vis = allImgs.filter((im) => { let el = im; while (el && el !== document.body) { const o = parseFloat(getComputedStyle(el).opacity); if (!(o > 0)) return false; el = el.parentElement; } return true; });
    await Promise.all(vis.map((im) => im.decode().catch(() => {})));
    return vis.length;
  };
  window.__duration = () => tl.duration();
})();
