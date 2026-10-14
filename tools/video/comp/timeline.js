/* The cut. Every still and every click/tap position comes from capture/manifest.json
 * (written by capture/run.mjs while it drove the real app). Counters are derived from the
 * manifest's recorded actions — nothing here invents an action that did not happen. */
(function () {
  'use strict';
  const { tl, Desktop, Phone, Caption, E, W, H } = FL;
  const M = window.__MANIFEST;
  const SC = M.scenes;
  const st = (sc, name) => { const s = SC[sc].steps.find((x) => x.kind === 'still' && x.name === name); if (!s) throw new Error('no still ' + sc + '/' + name); return s; };
  const src = (sc, name) => '/stills/' + st(sc, name).file;
  const acts = (sc) => SC[sc].steps.filter((x) => x.kind === 'action');
  const act = (sc, label, n) => { const a = acts(sc).filter((x) => x.label === label)[n || 0]; if (!a) throw new Error('no action ' + sc + '/' + label); return a; };
  const notes = (sc) => SC[sc].steps.filter((x) => x.kind === 'note');
  const ctr = (o) => [o.drag ? o.drag + (o.drag > 1 ? ' drags' : ' drag') : '', o.click ? o.click + (o.tap ? (o.click > 1 ? ' taps' : ' tap') : (o.click > 1 ? ' clicks' : ' click')) : '', o.typed ? 'typed ' + o.typed : '', o.dates ? o.dates + (o.dates > 1 ? ' dates' : ' date') : ''].filter(Boolean).join(' · ');
  const css = { w: 1920, h: 1080 };

  // ========================================================== 1 · LEADS (0 – 5)
  const t1 = 0;
  const L = new Desktop({ css });
  const drag = act('leads', 'Drag LD-059 to Approved');
  const okClick = act('leads', 'OK');
  const cap1 = new Caption({ num: '01', label: 'Leads', text: 'Lead won → customer, work order<br>and invoice made', zero: '' });
  L.still(t1, src('leads', 'board'), 0);
  gsap.set(L.layer, { opacity: 1 });                                        // first frame is the real board
  // Opens pushed in on the five columns: the stats row (y 164-222 css) stays above the frame.
  L.camera(t1, 0, 1024, 664, 1.32);
  L.camera(t1 + 0.35, 1.1, (drag.from.x + drag.to.x) / 2 + 20, 600, 1.55, 1010, 470);
  cap1.inAt(t1 + 0.35);
  L.cursorIn(t1 + 0.75, drag.from.x + 170, drag.from.y + 150);
  L.move(t1 + 0.8, 0.5, drag.from.x, drag.from.y);
  tl.to(L.cursor, { scale: 0.86, duration: 0.08, ease: 'power1.out', transformOrigin: '3px 2px' }, t1 + 1.32);
  const dropAt = L.drag(t1 + 1.38, 0.95, src('leads', 'board'), drag.box, drag.from, drag.to);
  L.still(t1 + 1.5, src('leads', 'dragging'), 0.2);
  L.drop(dropAt);
  tl.to(L.cursor, { scale: 1, duration: 0.12 }, dropAt);
  cap1.count(dropAt, ctr({ drag: 1 }));
  // the app's own confirm() text, drawn (headless Chrome never paints native dialogs)
  const dlg = E('div', 'jsdlg', L.overlay, { left: (960 - 224) + 'px', top: '14px' });
  E('div', 'msg', dlg).textContent = okClick.message;
  const btns = E('div', 'btns', dlg); E('span', 'b cancel', btns).textContent = 'Cancel'; const okEl = E('span', 'b ok', btns); okEl.textContent = 'OK';
  // Frame the dialog without ever showing the Win Rate tile (x >= 1503, y <= 222 css):
  // same zoom, pan left first (right edge to x 1439), only then up to the top of the page.
  tl.to(L.cam, { x: -(200 * 1.55), duration: 0.25, ease: 'power2.inOut' }, dropAt + 0.05);
  tl.to(L.cam, { y: 0, duration: 0.25, ease: 'power2.inOut' }, dropAt + 0.3);
  tl.fromTo(dlg, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'power2.out', immediateRender: false }, dropAt + 0.12);
  // centre of the OK pill, measured from the laid-out dialog (camera is identity at build time)
  const okR = okEl.getBoundingClientRect(), ovR = L.overlay.getBoundingClientRect();
  const okX = (okR.left + okR.width / 2 - ovR.left) / L.S, okY = (okR.top + okR.height / 2 - ovR.top) / L.S;
  L.move(dropAt + 0.3, 0.42, okX, okY);
  const okT = dropAt + 0.78;
  L.click(okT);
  cap1.count(okT, ctr({ drag: 1, click: 1 }));
  tl.to(dlg, { opacity: 0, duration: 0.1, ease: 'none' }, okT + 0.12);
  const res1 = st('leads', 'approved').focus;
  L.still(okT + 0.2, src('leads', 'approved'), 0.22);
  L.camera(okT + 0.45, 0.9, 1090, 250, 1.17, 960, 440);
  L.move(okT + 0.35, 0.6, res1.row.x + 560, res1.row.y + 140);
  L.cursorOut(okT + 1.0);
  cap1.outAt(4.72);
  window.__leadsCheck = { cam: L.cam, dropAt, boardUntil: okT + 0.2 + 0.22 + 0.01, tile: { x0: 1503, y0: 164, x1: 1878, y1: 222 }, statsBottom: 222 };

  // ========================================================== 2 · QUOTE (5 – 15)
  const t2 = 4.85;
  const Q = new Desktop({ css });
  const qa = (l, n) => act('quote', l, n);
  const cap2 = new Caption({ num: '02', label: 'Quote', text: 'Type the area — cartons are counted<br>for you. Good, better, best: pick one.', zero: '' });
  Q.still(t2, src('quote', 'builder'), 0);
  Q.camera(t2, 0, 1100, 420, 1.2, 960, 450);
  Q.show(t2, 0.35); L.hide(t2, 0.35);
  Q.camera(t2 + 0.2, 0.9, 1080, 360, 1.68, 900, 430);
  cap2.inAt(t2 + 0.45);
  let n2 = 0;
  const c2 = (t, a, stillName, extra) => { Q.click(t); n2 += 1; cap2.count(t, ctr({ click: n2, typed: extra })); if (stillName) Q.still(t + 0.03, src('quote', stillName), 0.14); };
  const menu1 = qa('Section menu', 0), pick = qa('Mark as Pick One'), menu2 = qa('Section menu', 1), sja = qa('Show Job Area'), area = qa('Job area'), apply = qa('Apply'), priv = qa('Privacy Mode');
  Q.cursorIn(5.5, menu1.x - 140, menu1.y + 170);
  Q.move(5.55, 0.48, menu1.x, menu1.y); c2(6.08, menu1, 'menu1');
  Q.move(6.25, 0.36, pick.x, pick.y); c2(6.66, pick, 'pickone');
  Q.move(6.82, 0.34, menu2.x, menu2.y); c2(7.2, menu2, 'menu2');
  Q.move(7.32, 0.3, sja.x, sja.y); c2(7.66, sja, 'jobarea');
  Q.camera(7.7, 0.6, 1000, 400, 1.72, 880, 430);
  Q.move(7.8, 0.42, area.x, area.y); c2(8.26, area, null);
  const typed = act('quote', 'Job area', 0) && acts('quote').find((x) => x.type === 'type');
  const area1 = '/stills/' + SC.quote.steps.find((x) => x.name === 'area-1').file;
  Q.still(8.42, area1, 0); Q.still(8.56, src('quote', 'area-2'), 0); Q.still(8.7, src('quote', 'area-3'), 0);
  cap2.count(8.7, ctr({ click: n2, typed: typed.text }));
  Q.move(8.84, 0.3, apply.x, apply.y);
  Q.click(9.18); n2 += 1; cap2.count(9.18, ctr({ click: n2, typed: typed.text }));
  Q.still(9.21, src('quote', 'applied'), 0.14);
  const fa = st('quote', 'applied').focus;
  Q.move(9.35, 0.5, fa.hint.x - 90, fa.hint.y + 120);
  Q.camera(9.3, 0.7, fa.hint.x + fa.hint.w / 2, fa.hint.y + 40, 1.85, 900, 520);   // "39 Cartons = 927.03 SqFt"
  Q.camera(10.75, 0.75, fa.gtv.x + 20, fa.gtv.y + 30, 1.62, 1100, 480);            // grand total $7,571.93
  Q.camera(11.7, 0.6, 1560, 250, 1.4, 1150, 400);
  Q.move(11.75, 0.55, priv.x, priv.y);
  Q.click(12.35); n2 += 1; cap2.count(12.35, ctr({ click: n2, typed: typed.text }));
  Q.still(12.38, src('quote', 'privacy'), 0.25);
  const fp = st('quote', 'privacy').focus;
  Q.move(12.5, 0.6, 980, 800);
  Q.camera(12.55, 0.8, (fp.priv0.x + fp.privLast.x + fp.privLast.w) / 2, fp.priv0.y + 10, 1.62, 960, 520);
  Q.cursorOut(13.2);
  cap2.outAt(14.62);

  // ========================================================== 3 · CUSTOMER APPROVES (15 – 24)
  const t3 = 14.75;
  const app = SC.approve;
  const dl = notes('approve').find((x) => x.overlay === 'dlpdf');
  const PH = new Phone({ cssW: app.css.w, viewH: app.css.h, barH: 47, x: 1190, y: 70, time: '7:12' });
  const tallH = (name) => st('approve', name).height;
  const cap3 = new Caption({ num: '03', label: 'Customer approves', text: 'They pick Better, add<br>the stairs and approve —<br>right on their phone', zero: '', big: true });
  PH.tall(t3, src('approve', 'tall-0'), tallH('tall-0'), 0);
  if (dl) PH.fixedImg('/stills/' + dl.file, dl.box);
  PH.scrollTo(t3, 0, 0);
  Q.hide(t3 - 0.13, 0.3);
  PH.show(t3 + 0.1, 0.35);
  tl.fromTo(PH.body, { y: 90 }, { y: 0, duration: 0.8, ease: 'flOut', immediateRender: false }, t3 + 0.1);
  cap3.inAt(t3 + 0.35);
  const pc = { x: PH.layerBox.x + PH.layerBox.w / 2, y: PH.layerBox.y + PH.layerBox.h / 2 }, zp = 1.15;
  tl.to(PH.cam, { scale: zp, x: (1 - zp) * pc.x, y: (1 - zp) * pc.y + 6, duration: 1.2, ease: 'flSoft' }, t3 + 0.6);
  const tB = act('approve', 'Pick Better'), tS = act('approve', 'Add stairs'), tA = act('approve', 'Approve Quote');
  const fT = st('approve', 'tall-2').focus;
  PH.scrollTo(16.2, 0.95, tB.scrollY);
  PH.tapAt(17.4, tB.x, tB.y); cap3.count(17.4, ctr({ click: 1, tap: true }));
  PH.tall(17.45, src('approve', 'tall-1'), tallH('tall-1'), 0.12);
  PH.scrollTo(17.75, 0.95, tS.scrollY);
  PH.tapAt(18.95, tS.x, tS.y); cap3.count(18.95, ctr({ click: 2, tap: true }));
  PH.tall(19.0, src('approve', 'tall-2'), tallH('tall-2'), 0.12);
  PH.scrollTo(19.3, 0.85, Math.round(fT.total.y - 430));                                 // TOTAL $8,624.70
  PH.scrollTo(20.6, 0.8, tA.scrollY);
  PH.tapAt(21.6, tA.x, tA.y); cap3.count(21.6, ctr({ click: 3, tap: true }));
  PH.viewport(21.66, src('approve', 'toast'), 0.08, 22.25);
  PH.tall(22.25, src('approve', 'tall-3-approved'), tallH('tall-3-approved'), 0.01);
  PH.scrollTo(22.25, 0, 0);
  const flash = E('div', '', PH.page, { position: 'absolute', inset: '0', background: '#fff', opacity: 0, zIndex: '60' });   // the page reloads
  tl.to(flash, { opacity: 1, duration: 0.08, ease: 'none' }, 22.17);
  tl.to(flash, { opacity: 0, duration: 0.3, ease: 'none' }, 22.3);
  // push in on the APPROVED stamp
  const stamp = st('approve', 'tall-3-approved').focus.stamp;
  const sx = PH.origin.x + (stamp.x + stamp.w / 2) * PH.S, sy = PH.origin.y + (stamp.y + stamp.h / 2) * PH.S, zz = 1.34;
  tl.to(PH.cam, { scale: zz, x: (PH.layerBox.x + 219) - zz * sx, y: 330 - zz * sy, duration: 1.0, ease: 'flSoft' }, 22.45);
  cap3.outAt(23.6);

  // ========================================================== 4 · WORK ORDER (24 – 34)
  const t4 = 23.75;
  const WO = new Desktop({ css });
  const wa = (l, n) => act('wo', l, n);
  const cap4 = new Caption({ num: '04', label: 'Work order', text: 'One button walks the job from<br>materials to the final invoice', zero: '', date: 'Thu, Oct 15' });
  const zW = 1.2, cW = { x: 1100, y: 430 };
  WO.still(t4, src('wo', 'start'), 0);
  WO.camera(t4, 0, 1000, 420, 0.9);
  PH.hide(t4 - 0.05, 0.3); WO.show(t4 + 0.05, 0.35);
  WO.camera(t4 + 0.2, 0.75, cW.x, cW.y, zW);
  cap4.inAt(t4 + 0.4);
  let n4 = 0, dates4 = 0;
  const c4 = (t, stillName, fade) => { WO.click(t); n4 += 1; cap4.count(t, ctr({ click: n4, dates: dates4 })); if (stillName) WO.still(t + 0.03, src('wo', stillName), fade == null ? 0.12 : fade); };
  const om = wa('Order Materials'), sel = wa('Select all'), fin = wa('Finish'), rts = wa('Ready to Schedule'), dd = wa('Installer dropdown'), sch1 = wa('Schedule', 0), si = wa('Schedule Install'), dt = wa('Install date'), sch2 = wa('Schedule', 1), mjc = wa('Mark Job Complete'), vfi = wa('View Final Invoice');
  WO.cursorIn(24.45, om.x + 160, om.y + 210);
  WO.move(24.5, 0.38, om.x, om.y); c4(24.9, 'om-modal');
  WO.camera(24.95, 0.45, 960, 545, 1.03);
  WO.move(25.05, 0.38, sel.x, sel.y); c4(25.45, 'om-selected');
  WO.move(25.58, 0.45, fin.x, fin.y); c4(26.05, 'ordered');
  WO.camera(26.1, 0.45, cW.x, cW.y, zW);
  // days pass: materials arrive (Oct 19)
  cap4.dateAt(26.7, 'Mon, Oct 19'); WO.still(26.7, src('wo', 'day5'), 0.3);
  WO.move(26.85, 0.32, rts.x, rts.y); c4(27.2, 'rts-modal');
  WO.move(27.3, 0.3, dd.x, dd.y); c4(27.62, null);
  c4(27.85, 'rts-installer');                                   // pick Ruben Ortiz from the list
  WO.move(27.95, 0.28, sch1.x, sch1.y); c4(28.26, 'rts-done');
  WO.move(28.42, 0.3, si.x, si.y); c4(28.75, 'si-modal');
  WO.move(28.85, 0.28, dt.x, dt.y); c4(29.15, null);
  dates4 = 1; WO.still(29.42, src('wo', 'si-date'), 0.1); cap4.count(29.42, ctr({ click: n4, dates: dates4 }));
  WO.move(29.52, 0.28, sch2.x, sch2.y); c4(29.83, 'si-done');
  // install day done (Oct 22)
  cap4.dateAt(30.55, 'Thu, Oct 22'); WO.still(30.55, src('wo', 'day8'), 0.3);
  WO.move(30.7, 0.32, mjc.x, mjc.y); c4(31.05, 'complete');
  WO.move(31.45, 0.25, vfi.x + 4, vfi.y + 1); c4(31.75, 'invoice', 0.08);
  WO.camera(31.85, 0.9, 1150, 330, 1.3, 960, 440);
  WO.cursorOut(32.2);
  cap4.outAt(33.62);

  // ========================================================== 5 · GET PAID (34 – 40)
  const t5 = 33.75;
  const PY = new Desktop({ css });
  const pa = (l) => act('pay', l);
  const cap5 = new Caption({ num: '05', label: 'Get paid', text: 'Balance paid by check —<br>recorded in a few clicks', zero: '', date: 'Fri, Oct 23' });
  PY.still(t5, src('pay', 'start'), 0);
  PY.camera(t5, 0, 1150, 330, 1.3, 960, 440);
  PY.show(t5, 0.35); WO.hide(t5 + 0.35, 0.01);
  PY.camera(t5 + 0.2, 0.6, cW.x, cW.y, zW);
  cap5.inAt(t5 + 0.35);
  let n5 = 0, typed5 = '';
  const c5 = (t, stillName) => { PY.click(t); n5 += 1; cap5.count(t, ctr({ click: n5, typed: typed5 })); if (stillName) PY.still(t + 0.03, src('pay', stillName), 0.12); };
  const tp = pa('Take Payment'), md = pa('Method dropdown'), cn = pa('Check number'), rp = pa('Record Payment');
  const ty5 = acts('pay').find((x) => x.type === 'type');
  PY.cursorIn(34.25, tp.x + 150, tp.y + 200);
  PY.move(34.3, 0.4, tp.x, tp.y); c5(34.74, 'modal');
  PY.camera(34.8, 0.5, 960, 560, 1.55, 960, 500);
  PY.move(34.95, 0.35, md.x, md.y); c5(35.32, null);
  c5(35.55, 'check');
  PY.move(35.68, 0.3, cn.x, cn.y); c5(36.0, null);
  typed5 = ty5.text;
  ['checkno-1', 'checkno-2', 'checkno-3', 'checkno-4'].forEach((nm, i) => PY.still(36.14 + i * 0.12, src('pay', nm), 0));
  cap5.count(36.5, ctr({ click: n5, typed: typed5 }));
  PY.move(36.6, 0.33, rp.x, rp.y); c5(36.96, 'paid');
  PY.camera(37.05, 0.5, 1160, 300, 1.25, 960, 420);
  PY.cursorOut(37.2);
  // a real scroll down to the totals (captured frame by frame)
  const seq = notes('pay').find((x) => x.scrollSeq === 'scroll');
  PY.camera(37.6, 1.0, 900, 520, 1.25, 960, 520);
  const endFlip = PY.flip(37.62, seq.frames.map((f) => '/stills/' + f), 30);
  PY.still(endFlip + 0.02, src('pay', 'paid-balance'), 0);
  PY.camera(endFlip + 0.05, 0.85, 990, 600, 1.85, 960, 560);                          // BALANCE DUE $0.00
  cap5.outAt(39.62);

  // ========================================================== 6 · JOB COSTING (40 – 42.7)
  const t6 = 39.75;
  const C = new Desktop({ css });
  const cap6 = new Caption({ num: '06', label: 'Job costing', text: 'Estimate vs actual — ready<br>the moment the job is', zero: '', date: 'Mon, Oct 26', style: { left: 'auto', right: '72px' } });
  const fl = st('cost', 'list').focus, fd = st('cost', 'detail').focus, rowA = act('cost', 'Open WO-330 costing');
  C.still(t6, src('cost', 'list'), 0);
  C.camera(t6, 0, 1060, 330, 1.25, 960, 430);
  C.show(t6, 0.35); PY.hide(t6 + 0.35, 0.01);
  cap6.inAt(t6 + 0.3);
  C.cursorIn(40.15, rowA.x + 120, rowA.y + 150);
  C.move(40.2, 0.4, rowA.x, rowA.y);
  C.click(40.65); cap6.count(40.65, ctr({ click: 1 }));
  C.still(40.68, src('cost', 'detail'), 0.16);
  C.camera(40.72, 0.8, 920, 470, 1.42, 960, 470);
  C.cursorOut(41.0);
  cap6.outAt(42.45);

  // ========================================================== END CARD (42.6 – 45.4)
  const tE = 42.55;
  document.getElementById('end-logo').src = '/brand/floorlogic-lockup-horizontal-reversed.svg';
  tl.to('#end', { opacity: 1, duration: 0.45, ease: 'none' }, tE);
  tl.fromTo('#end .logo', { opacity: 0, y: 18, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'flOut', immediateRender: false }, tE + 0.2);
  tl.fromTo('#end h1', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.6, ease: 'flOut', immediateRender: false }, tE + 0.4);
  tl.fromTo('#end p.sub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55, ease: 'flOut', immediateRender: false }, tE + 0.6);
  tl.fromTo('#end .url', { opacity: 0, y: 14, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'flOut', immediateRender: false }, tE + 0.8);
  gsap.set(['#end .logo', '#end h1', '#end p.sub', '#end .url'], { opacity: 0 });
  tl.to({}, { duration: 0.01 }, 45.39);   // total length 45.4 s

  window.__CHAPTERS = [
    { at: t1, label: 'A lead is won' }, { at: 5, label: 'Quote the job' }, { at: 15, label: 'Customer approves' },
    { at: 24, label: 'Run the install' }, { at: 34, label: 'Get paid' }, { at: 40, label: 'Know the profit' },
  ];
})();
