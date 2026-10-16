/* The cut (October app). Every still and every click/tap position comes from
 * capture/manifest.json (written by capture/run.mjs while it drove the real app). Counters are
 * derived from the manifest's recorded actions — nothing here invents an action that did not
 * happen. Times are seconds. Each scene's cross-fade starts 0.38 s before its chapter's whole
 * second and has settled by it (src/data/video.ts seeks to those seconds). */
(function () {
  'use strict';
  const { tl, Desktop, Phone, Caption, E, W, H, cues } = FL;
  const M = window.__MANIFEST;
  const SC = M.scenes;
  for (const id of ['leads', 'mobile', 'quote', 'approve', 'convert', 'wo', 'pay', 'cost']) if (!SC[id]) throw new Error('manifest has no scene ' + id + ' (run capture/run.mjs for every scene)');
  const st = (sc, name) => { const s = SC[sc].steps.find((x) => x.kind === 'still' && x.name === name); if (!s) throw new Error('no still ' + sc + '/' + name); return s; };
  const acts = (sc) => SC[sc].steps.filter((x) => x.kind === 'action');
  const act = (sc, label, n) => { const a = acts(sc).filter((x) => x.label === label)[n || 0]; if (!a) throw new Error('no action ' + sc + '/' + label); return a; };
  const seqOf = (sc, name) => { const n = SC[sc].steps.find((x) => x.kind === 'note' && x.scrollSeq === name); if (!n) throw new Error('no scroll ' + sc + '/' + name); return n.frames.map((f) => SC[sc].steps.find((x) => x.file === f)); };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  // The caption's action chip: built from the recorded actions shown so far, never typed in.
  const ctr = (o) => [o.click ? plural(o.click, o.tap ? 'tap' : 'click', o.tap ? 'taps' : 'clicks') : '', o.typed ? 'typed ' + o.typed : '', o.dates ? plural(o.dates, 'date', 'dates') : ''].filter(Boolean).join(' · ');
  const day = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const ctrBox = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const css = { w: 1920, h: 1080 };
  // Dataset values the descriptions quote (run.mjs checked each one on camera)
  const X = M.expected, Y = M.story;
  if (!X || !Y) throw new Error('manifest has no expected/story values (re-run capture/run.mjs)');
  const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const longDay = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  // "19.33 sq yd — a 14' 6" cut off a 12' roll", from the hint the builder showed under the qty
  const carpetLine = () => {
    const s = st('quote', 'stairs'), r = s.rollTxt || '', m = r.match(/(\d+' \d+")\s*× (\d+') roll/);
    if (!m) throw new Error('stairs still: no roll hint (' + r + ')');
    if (!s.carpetQty) throw new Error('stairs still: no carpet quantity recorded');
    return `${s.carpetQty} sq yd — a ${m[1]} cut off a ${m[2]} roll`;
  };
  // "revenue $8,184.07, estimated cost …", from the metric strip text recorded with the costing still
  const stripText = () => {
    const n = SC.cost.steps.find((x) => x.kind === 'note' && x.strip); const t = n ? n.strip : '';
    const g = (k) => { const m = t.match(new RegExp(k + ' ([^ ]+)', 'i')); if (!m) throw new Error('costing strip: no ' + k + ' in "' + t + '"'); return m[1]; };
    return `revenue ${g('Revenue')}, estimated cost ${g('Estimated')}, actual ${g('Actual')} (${g('Variance')} over), margin ${g('Margin')} before commission, profit ${g('Profit')} after commission`;
  };
  // "8.265%", from the QUOTE TOTAL card text recorded with the stairs still
  const taxPct = () => { const m = (st('quote', 'stairs').railTxt || '').match(/Tax \(([\d.]+%)\)/); if (!m) throw new Error('stairs still: no tax rate in the totals card text'); return m[1]; };
  // The app's sidebar ends here (css px); desktop shots put their left edge on the content.
  const SIDEBAR = st('cost', 'detail').focus.sidebar ? Math.round(st('cost', 'detail').focus.sidebar.x + st('cost', 'detail').focus.sidebar.w) : 250;
  // The document framing (quote / work order / invoice headers + paper top): content's left edge on.
  const DOC = { cx: SIDEBAR + 600, cy: 340, z: 1.6 };
  // A wide shot of a document screen: content's left edge to the toast's right edge.
  const WIDE = (() => { const x0 = SIDEBAR, x1 = 1910, z = 1920 / (x1 - x0); return { cx: (x0 + x1) / 2, cy: 540 / z, z }; })();

  // ========================================================== 1 · LEADS (0 – 5.62)
  // The Leads List View (what #leads opens): a site-survey date typed in the selected New lead's
  // side panel; the app moves the lead to Site Survey Scheduled — the panel's stage, the lead's row
  // and the stage cards below all follow. The stats line (0 won · win rate) stays out of frame:
  // every shot keeps its top edge below it.
  const L = new Desktop({ css });
  const l0 = st('leads', 'list'), lm = st('leads', 'moved');
  const f0 = l0.focus, fm = lm.focus, s1 = lm.onScreen;
  if (!f0.quick || !f0.list || !f0.panel || !f0.phoneText || !fm.pill || !fm.onBtn || !fm.sssHead || !s1) throw new Error('leads stills: missing focus boxes (re-run capture/run.mjs)');
  const clickDate = act('leads', 'Survey date');
  const dateAct = acts('leads').find((x) => x.type === 'date');
  const lead = SC.leads.lead;
  const cap1 = new Caption({ num: '01', label: 'Leads', date: day(SC.leads.day), text: 'Pick a survey date —<br>the lead moves itself',
    describe: `On the Leads list, new lead ${lead.name} is open in the side panel. A site-survey date (${dateAct.text}) is typed in the panel; the app moves the lead to Site Survey Scheduled — the panel's stage, the lead's status in the list and the stage counts below (New ${s1.counts.new}, Site Survey Scheduled ${s1.counts.site_survey_scheduled}) — and adds a survey task.` });
  // Wide: the whole List View below its stats line, the cards' outer edges 12 px in on both sides.
  const koBottom = Math.max(...l0.keepOut.map((k) => k.y + k.h));
  const WL = (() => {
    const x0 = f0.quick.x - 12, x1 = f0.quick.x + f0.quick.w + 12;
    const z = Math.max(W / (x1 - x0), H / (css.h - (koBottom + 8)));
    return { cx: (x0 + x1) / 2, cy: css.h - H / z / 2, z };
  })();
  // Close: the panel (name, stage, its buttons, the survey date) beside the selected row. The left
  // edge sits as far left of the phone column as the panel card sits in from the window's right
  // edge; the top edge in the gap between the quick-add bar and the list.
  const PZ = (() => {
    const m = css.w - (f0.panel.x + f0.panel.w), x0 = f0.phoneText.x - m, z = Math.min(2.0, W / (css.w - x0));
    const top = (f0.quick.y + f0.quick.h + f0.list.y) / 2;
    return { cx: (x0 + css.w) / 2, cy: top + H / z / 2, z };
  })();
  L.still(0, l0, 0);
  gsap.set(L.layer, { opacity: 1 });                                        // first frame is the real List View
  L.camera(0, 0, WL.cx, WL.cy, WL.z);
  L.camera(0.28, 0.7, PZ.cx, PZ.cy, PZ.z);                                  // in to the panel
  cap1.inAt(0.3);
  L.cursorIn(0.5, clickDate.x + 160, clickDate.y + 200);
  L.move(0.55, 0.41, clickDate.x, clickDate.y);
  L.click(0.98); cap1.count(0.98, ctr({ click: 1 }));
  L.move(1.04, 0.55, clickDate.x + 120, clickDate.y + 170);                 // the hand leaves the mouse: the digits stay readable
  ['date-1', 'date-2', 'date-3', 'date-4'].forEach((nm, i) => L.still(1.1 + i * 0.11, st('leads', nm), 0));
  L.still(1.58, lm, 0.16);                                                  // the app re-drew the list: the lead moved
  cap1.count(1.58, ctr({ click: 1, dates: 1 }));
  L.cursorOut(1.62);
  L.ring(1.74, fm.onBtn, 0.7, 4);                                           // the panel's stage: Site Survey Scheduled
  cap1.outAt(2.55);
  L.camera(2.5, 0.65, WL.cx, WL.cy, WL.z);                                  // back out: the row and the stage counts agree
  L.ring(3.0, fm.pill, 0.55, 4);
  L.ring(3.0, fm.sssHead, 0.55, 5);
  L.hide(3.55, 0.35);

  // ---- the phone app (still chapter 1): its Today screen lists the new survey
  const mob = SC.mobile;
  const PA = new Phone({ cssW: mob.css.w, viewH: mob.css.h, barH: 47, x: 1190, y: 70, time: mob.clock.replace(/^0/, ''), barBg: '#f3f5f9', pageBg: '#f3f5f9' });
  const today = st('mobile', 'today');
  const cap1b = new Caption({ num: '01', label: 'Leads', date: day(mob.day), text: 'And it’s on<br>your phone', big: true,
    describe: `The FloorLogic phone app's Today screen lists ${lead.name} under Surveys coming up.` });
  const tP = 3.55;
  PA.tall(tP, today, 0); PA.scrollTo(tP, 0, 0);
  PA.show(tP + 0.05, 0.35);
  tl.fromTo(PA.body, { y: 90 }, { y: 0, duration: 0.8, ease: 'flOut', immediateRender: false }, tP + 0.05);
  cap1b.inAt(tP + 0.25);
  const lr = today.focus.lead, sv = today.focus.surveys;
  const rowBox = { x: sv.x, y: lr.y, w: sv.w, h: lr.h };
  PA.zoomTo(tP + 0.45, 0.9, 1.07, PA.centre, PA.centre.x, PA.centre.y);       // the whole phone stays in frame
  PA.ring(tP + 0.85, rowBox, 0.95, 5);
  cap1b.outAt(5.45);
  PA.hide(5.62, 0.3);

  // ========================================================== 2 · QUOTE (5.62 – 15.62)
  const t2 = 5.62;
  const Q = new Desktop({ css });
  const qa = (l, n) => act('quote', l, n);
  const typedQ = acts('quote').find((x) => x.type === 'type');
  const cap2 = new Caption({ num: '02', label: 'Quote', date: day(SC.quote.day), text: 'Type the area — whole cartons, carpet<br>cuts and tax figured for you',
    describe: `In quote QT-330 the floor section is marked Pick One (good / better / best) and a ${typedQ.text} sq ft job area is applied: ${X.cartonHint.replace(/Cartons/, 'cartons').replace(/SqFt/, 'sq ft')} for the first option. The optional carpet stairs read ${carpetLine()}. Quote total: tax ${taxPct()}, grand total ${money(X.quoteSent.total)}. Privacy Mode then blurs cost and margin.` });
  Q.still(t2, st('quote', 'builder'), 0);
  Q.camera(t2, 0, 1150, 470, 1.45);
  Q.show(t2, 0.35);
  Q.camera(t2 + 0.2, 1.0, 1170, 455, 1.57);                                 // the floor section + the whole QUOTE TOTAL card
  cap2.inAt(t2 + 0.38);
  let n2 = 0, typed2 = '';
  const c2 = (t, stillName) => { Q.click(t); n2 += 1; cap2.count(t, ctr({ click: n2, typed: typed2 })); if (stillName) Q.still(t + 0.03, st('quote', stillName), 0.12); };
  const menu1 = qa('Section menu', 0), pick = qa('Mark as Pick One'), menu2 = qa('Section menu', 1), sja = qa('Show Job Area'), area = qa('Job area'), apply = qa('Apply'), priv = qa('Privacy Mode');
  Q.cursorIn(t2 + 0.55, menu1.x - 170, menu1.y + 190);
  Q.move(t2 + 0.6, 0.42, menu1.x, menu1.y); c2(t2 + 1.06, 'menu1');
  Q.move(t2 + 1.2, 0.3, pick.x, pick.y); c2(t2 + 1.54, 'pickone');
  Q.move(t2 + 1.66, 0.3, menu2.x, menu2.y); c2(t2 + 2.0, 'menu2');
  Q.move(t2 + 2.12, 0.28, sja.x, sja.y); c2(t2 + 2.44, 'jobarea');
  Q.camera(t2 + 2.5, 0.6, 985, st('quote', 'jobarea').focus.area.y + 124, 1.8);   // the Job Area bar (the totals card stays out)
  Q.move(t2 + 2.56, 0.36, area.x, area.y); c2(t2 + 2.96, null);
  ['area-1', 'area-2', 'area-3'].forEach((nm, i) => Q.still(t2 + 3.08 + i * 0.12, st('quote', nm), 0));
  typed2 = typedQ.text; cap2.count(t2 + 3.32, ctr({ click: n2, typed: typed2 }));
  Q.move(t2 + 3.4, 0.3, apply.x, apply.y); c2(t2 + 3.74, 'applied');
  const fa = st('quote', 'applied').focus;
  Q.move(t2 + 3.9, 0.5, fa.hint.x - 70, fa.hint.y + 150);
  Q.camera(t2 + 3.85, 0.75, 1030, fa.hint.y + 61, 2.0);                     // "39 Cartons = 927.03 SqFt"
  Q.ring(t2 + 4.45, { x: fa.qty0.x - 4, y: fa.qty0.y - 2, w: fa.hint.w + 8, h: fa.hint.y + fa.hint.h - fa.qty0.y + 4 }, 0.95, 4);
  Q.cursorOut(t2 + 4.4);
  // a real scroll down to the optional carpet stairs (captured frame by frame)
  const endFlip = Q.flip(t2 + 4.95, seqOf('quote', 'scroll'), 30);
  const fs = st('quote', 'stairs').focus;
  Q.still(endFlip + 0.02, st('quote', 'stairs'), 0);
  Q.camera(t2 + 4.95, 0.95, 1030, 470, 2.0);                               // square yards ↔ cut length
  Q.ring(endFlip + 0.25, { x: fs.qty.x - 4, y: fs.qty.y - 2, w: fs.roll.w + 8, h: fs.roll.y + fs.roll.h - fs.qty.y + 4 }, 1.0, 4);
  // the QUOTE TOTAL card: tax 8.265 % and the grand total
  Q.camera(t2 + 6.85, 0.7, 1560, 330, 2.0);
  Q.ring(t2 + 7.4, { x: fs.tax.x - 10, y: fs.tax.y - 4, w: fs.gt.x + fs.gt.w - fs.tax.x + 20, h: fs.gt.y + fs.gt.h - fs.tax.y + 8 }, 0.95, 2);
  Q.cursorIn(t2 + 7.65, priv.x - 200, priv.y + 260);
  Q.move(t2 + 7.7, 0.45, priv.x, priv.y); c2(t2 + 8.2, 'privacy');
  Q.move(t2 + 8.35, 0.5, priv.x - 260, priv.y + 330);
  Q.camera(t2 + 8.35, 0.85, 1296, 430, 1.538);                              // paper edge to the right edge: blur + the app's toast
  Q.cursorOut(t2 + 8.9);
  cap2.outAt(t2 + 9.82);

  // ========================================================== 3 · CUSTOMER APPROVES (15.62 – 23.62)
  const t3 = 15.62;
  const app = SC.approve;
  const dl = app.steps.find((x) => x.kind === 'note' && x.overlay === 'dlpdf');
  const PH = new Phone({ cssW: app.css.w, viewH: app.css.h, barH: 47, x: 1190, y: 70, time: app.clock.replace(/^0/, ''), barBg: '#eef0f4', pageBg: '#eef0f4' });
  const cap3 = new Caption({ num: '03', label: 'Customer approves', date: day(app.day), text: 'They pick Better, add<br>the stairs and approve —<br>from their phone', big: true,
    describe: `On the customer's quote link the Better floor is picked, the carpeted stairs are added (total ${money(X.quoteApprovedTotal)}) and Approve Quote is tapped. The quote shows APPROVED and locks.` });
  PH.tall(t3, st('approve', 'tall-0'), 0);
  if (dl) PH.fixedImg({ file: dl.file, css: { w: dl.box.w, h: dl.box.h }, dpr: 3, keepOut: [] }, dl.box);
  PH.scrollTo(t3, 0, 0);
  Q.hide(t3 - 0.1, 0.3);
  PH.show(t3 + 0.05, 0.35);
  tl.fromTo(PH.body, { y: 90 }, { y: 0, duration: 0.8, ease: 'flOut', immediateRender: false }, t3 + 0.05);
  cap3.inAt(t3 + 0.35);
  PH.zoomTo(t3 + 0.55, 1.0, 1.12, PH.centre, PH.centre.x, PH.centre.y + 6);
  const tB = act('approve', 'Pick Better'), tS = act('approve', 'Add stairs'), tA = act('approve', 'Approve Quote');
  const fT = st('approve', 'tall-2').focus;
  PH.scrollTo(t3 + 1.05, 0.8, tB.scrollY);
  PH.tapAt(t3 + 2.0, tB.x, tB.y); cap3.count(t3 + 2.0, ctr({ click: 1, tap: true }));
  PH.tall(t3 + 2.05, st('approve', 'tall-1'), 0.12);
  PH.scrollTo(t3 + 2.25, 0.8, tS.scrollY);
  PH.tapAt(t3 + 3.2, tS.x, tS.y); cap3.count(t3 + 3.2, ctr({ click: 2, tap: true }));
  PH.tall(t3 + 3.25, st('approve', 'tall-2'), 0.12);
  PH.scrollTo(t3 + 3.45, 0.75, Math.round(fT.total.y - 430));                  // TOTAL $8,624.70
  PH.scrollTo(t3 + 4.75, 0.7, tA.scrollY);
  PH.tapAt(t3 + 5.6, tA.x, tA.y); cap3.count(t3 + 5.6, ctr({ click: 3, tap: true }));
  PH.viewport(t3 + 5.66, st('approve', 'toast'), 0.08, t3 + 6.2);
  PH.tall(t3 + 6.2, st('approve', 'tall-3-approved'), 0.01);
  PH.scrollTo(t3 + 6.2, 0, 0);
  const flash = E('div', '', PH.page, { position: 'absolute', inset: '0', background: '#fff', opacity: 0, zIndex: '60' });   // the page reloads
  tl.to(flash, { opacity: 1, duration: 0.08, ease: 'none' }, t3 + 6.12);
  tl.to(flash, { opacity: 0, duration: 0.3, ease: 'none' }, t3 + 6.25);
  const stamp = st('approve', 'tall-3-approved').focus.stamp;                  // level (harness: transformQ)
  PH.zoomTo(t3 + 6.4, 0.95, 1.34, PH.at(stamp.x + stamp.w / 2, stamp.y + stamp.h / 2), PH.centre.x, 330);
  cap3.outAt(t3 + 7.8);

  // ========================================================== 4 · WORK ORDER (23.62 – 33.62)
  // 4a: the office turns the approval into WO-330 + IN-330 ("Create WO & Invoice" + confirm).
  // The quote's totals card (right) leaves out the stairs the customer added, so it stays out
  // of frame here (every shot ends left of x 1518).
  const t4 = 23.62;
  const CV = new Desktop({ css });
  const cv = (l) => act('convert', l);
  const cap4a = new Caption({ num: '04', label: 'Work order', date: day(SC.convert.day), text: 'One click makes the work<br>order and invoice',
    describe: 'In the office, approved quote QT-330 shows Create WO & Invoice; the app asks to confirm and creates work order ' + X.workOrderNumber + ' and invoice ' + X.invoiceNumber + '.' });
  CV.still(t4, st('convert', 'quote'), 0);
  CV.camera(t4, 0, DOC.cx, DOC.cy, DOC.z);
  CV.show(t4, 0.35); PH.hide(t4, 0.3);
  cap4a.inAt(t4 + 0.38);
  const cb = cv('Create WO & Invoice'), ok = cv('Create Work Order & Invoice');
  CV.cursorIn(t4 + 0.5, cb.x + 150, cb.y + 230);
  CV.move(t4 + 0.55, 0.45, cb.x, cb.y);
  CV.click(t4 + 1.05); cap4a.count(t4 + 1.05, ctr({ click: 1 }));
  CV.still(t4 + 1.08, st('convert', 'modal'), 0.14);
  CV.camera(t4 + 1.15, 0.6, 960, 540, 1.75);
  CV.move(t4 + 1.3, 0.42, ok.x, ok.y);
  CV.click(t4 + 1.78); cap4a.count(t4 + 1.78, ctr({ click: 2 }));
  CV.still(t4 + 1.81, st('convert', 'done'), 0.14);
  CV.camera(t4 + 1.95, 0.5, DOC.cx, DOC.cy, DOC.z);                          // the framing WO-330 opens on: the pages swap in place
  CV.move(t4 + 1.95, 0.4, ok.x - 60, ok.y + 150);
  CV.cursorOut(t4 + 2.15);
  cap4a.outAt(t4 + 2.3, true);

  // 4b: WO-330 — Order Materials for every line → Ready to Schedule → Schedule Install.
  const t4b = t4 + 2.5;
  const WO = new Desktop({ css });
  const wa = (l, n) => act('wo', l, n);
  const cap4b = new Caption({ num: '04', label: 'Work order', date: day(SC.wo.day), text: 'Order the materials,<br>book the install',
    describe: `Work order ${X.workOrderNumber}: Order Materials, select all, Finish — ${SC.wo.steps.find((x) => x.kind === 'note' && x.pos).pos.length} purchase orders are marked ordered and the work order moves to Ready to Schedule. Schedule Install: start ${longDay(Y.installStart)}, end ${longDay(Y.installEnd)}, installer ${Y.installer} — Scheduled.` });
  WO.still(t4b, st('wo', 'start'), 0);
  WO.camera(t4b, 0, DOC.cx, DOC.cy, DOC.z);
  WO.show(t4b, 0.3); CV.hide(t4b + 0.3, 0.01);
  cap4b.inAt(t4b + 0.05, true);
  let n4 = 0, d4 = 0;
  const c4 = (t, stillName, fade) => { WO.click(t); n4 += 1; cap4b.count(t, ctr({ click: n4, dates: d4 })); if (stillName) WO.still(t + 0.03, st('wo', stillName), fade == null ? 0.12 : fade); };
  const om = wa('Order Materials'), sel = wa('Select all'), fin = wa('Finish'), si = wa('Schedule Install'), sd = wa('Start date'), ed = wa('End date'), ins = wa('Installer'), sch = wa('Schedule');
  WO.cursorIn(t4b + 0.3, om.x + 160, om.y + 220);
  WO.move(t4b + 0.35, 0.4, om.x, om.y); c4(t4b + 0.8, 'om-modal');
  const omm = st('wo', 'om-modal').focus.modal;
  WO.camera(t4b + 0.85, 0.5, ctrBox(omm).x, ctrBox(omm).y, 1.12);
  WO.move(t4b + 0.95, 0.38, sel.x, sel.y); c4(t4b + 1.38, 'om-selected');
  WO.move(t4b + 1.5, 0.42, fin.x, fin.y); c4(t4b + 1.97, 'ordered');
  WO.camera(t4b + 2.05, 0.6, WIDE.cx, WIDE.cy, WIDE.z);                         // Ready to Schedule + the app's toast
  WO.move(t4b + 2.55, 0.42, si.x, si.y); c4(t4b + 3.02, 'si-modal');
  WO.camera(t4b + 3.08, 0.55, 960, 540, 1.75);
  WO.move(t4b + 3.15, 0.36, sd.x, sd.y); c4(t4b + 3.56, null);
  ['start-1', 'start-2', 'start-3', 'start-4'].forEach((nm, i) => WO.still(t4b + 3.66 + i * 0.1, st('wo', nm), 0));
  WO.still(t4b + 4.1, st('wo', 'si-start'), 0.1); d4 = 1; cap4b.count(t4b + 4.1, ctr({ click: n4, dates: d4 }));
  WO.move(t4b + 4.2, 0.32, ed.x, ed.y); c4(t4b + 4.57, null);
  WO.still(t4b + 4.66, st('wo', 'si-end'), 0.1); d4 = 2; cap4b.count(t4b + 4.66, ctr({ click: n4, dates: d4 }));
  WO.move(t4b + 4.8, 0.32, ins.x, ins.y); c4(t4b + 5.17, null);
  c4(t4b + 5.38, 'si-installer');                                           // pick Ruben Ortiz from the list
  WO.move(t4b + 5.5, 0.34, sch.x, sch.y); c4(t4b + 5.9, 'scheduled');
  WO.camera(t4b + 5.98, 0.65, WIDE.cx, WIDE.cy, WIDE.z);
  WO.move(t4b + 6.05, 0.5, sch.x + 120, sch.y + 160);
  WO.cursorOut(t4b + 6.5);
  WO.camera(t4b + 6.85, 0.5, DOC.cx, DOC.cy, DOC.z);                         // the framing the invoice opens on
  cap4b.outAt(t4b + 7.3);

  // ========================================================== 5 · GET PAID (33.62 – 38.62)
  const t5 = 33.62;
  const PY = new Desktop({ css });
  const pa = (l) => act('pay', l);
  const ty5 = acts('pay').find((x) => x.type === 'type');
  const cap5 = new Caption({ num: '05', label: 'Get paid', date: day(SC.pay.day), text: 'Balance paid by check —<br>recorded in a few clicks',
    describe: 'On invoice ' + X.invoiceNumber + ': Take Payment (the balance, ' + money(Y.balanceCheck.amount) + ', is filled in), method Check, check number ' + ty5.text + ', Record Payment. Paid in Full — the invoice reads Balance Due $0.00.' });
  PY.still(t5, st('pay', 'start'), 0);
  PY.camera(t5, 0, DOC.cx, DOC.cy, DOC.z);
  PY.show(t5, 0.35); WO.hide(t5 + 0.35, 0.01);
  cap5.inAt(t5 + 0.38);
  let n5 = 0, typed5 = '';
  const c5 = (t, stillName, fade) => { PY.click(t); n5 += 1; cap5.count(t, ctr({ click: n5, typed: typed5 })); if (stillName) PY.still(t + 0.03, st('pay', stillName), fade == null ? 0.12 : fade); };
  const tp = pa('Take Payment'), md = pa('Method'), cn = pa('Check number'), rp = pa('Record Payment');
  PY.cursorIn(t5 + 0.5, tp.x + 150, tp.y + 220);
  PY.move(t5 + 0.55, 0.4, tp.x, tp.y); c5(t5 + 1.0, 'modal');
  const pm = st('pay', 'modal').focus.modal;
  PY.camera(t5 + 1.06, 0.5, 960, ctrBox(pm).y + 20, 1.72);
  PY.move(t5 + 1.12, 0.32, md.x, md.y); c5(t5 + 1.48, null);
  c5(t5 + 1.68, 'check');                                                  // pick Check from the list
  PY.move(t5 + 1.8, 0.28, cn.x, cn.y); c5(t5 + 2.12, null);
  ['checkno-1', 'checkno-2', 'checkno-3', 'checkno-4'].forEach((nm, i) => PY.still(t5 + 2.24 + i * 0.11, st('pay', nm), 0));
  typed5 = ty5.text; cap5.count(t5 + 2.57, ctr({ click: n5, typed: typed5 }));
  PY.move(t5 + 2.66, 0.32, rp.x, rp.y); c5(t5 + 3.02, 'paid');
  const fp = st('pay', 'paid').focus;
  PY.camera(t5 + 3.1, 0.55, SIDEBAR + 600, 330, 1.6);                         // ✓ Paid in Full · PAID (keeps left of the totals card)
  PY.ring(t5 + 3.45, fp.paid, 0.7, 4);
  PY.cursorOut(t5 + 3.25);
  // down the invoice to its own totals (a real scroll, captured frame by frame)
  const endPay = PY.flip(t5 + 3.72, seqOf('pay', 'scroll'), 30);
  const fb = st('pay', 'paid-balance').focus;
  PY.still(endPay + 0.02, st('pay', 'paid-balance'), 0);
  const paper = fb.paper || { x: 680, w: 810 };
  // ≤ 2.0 while the 2× scroll frames play; on to 2.25 once the 3× closing still is up
  PY.camera(t5 + 3.72, 0.55, paper.x + paper.w / 2, ctrBox(fb.bal).y - 40, Math.min(2.0, PY.maxZ));
  PY.camera(endPay + 0.06, 0.6, paper.x + paper.w / 2, ctrBox(fb.bal).y - 40, Math.min(2.25, st('pay', 'paid-balance').dpr));   // BALANCE DUE $0.00, paper edge to edge
  PY.ring(endPay + 0.2, fb.bal, 0.55, 3);
  cap5.outAt(t5 + 4.82);

  // ========================================================== 6 · JOB COSTING (38.62 – 42.55)
  const t6 = 38.62;
  const C = new Desktop({ css });
  const cap6 = new Caption({ num: '06', label: 'Job costing', date: day(SC.cost.day), text: 'Estimate vs actual, margin<br>and profit — ready when the job is',
    describe: 'Job costing for ' + X.workOrderNumber + ': ' + stripText() + '.' });
  const fd = st('cost', 'detail').focus, rowA = act('cost', 'Open WO-330 costing');
  C.still(t6, st('cost', 'list'), 0);
  C.camera(t6, 0, 1000, 420, 1.3);
  C.show(t6, 0.35); PY.hide(t6 + 0.35, 0.01);
  cap6.inAt(t6 + 0.38);
  C.cursorIn(t6 + 0.5, rowA.x + 140, rowA.y + 180);
  C.move(t6 + 0.55, 0.4, rowA.x, rowA.y);
  C.click(t6 + 1.0); cap6.count(t6 + 1.0, ctr({ click: 1 }));
  C.still(t6 + 1.03, st('cost', 'detail'), 0.16);
  // the metric strip (Revenue … Sales Tax) with the header: left edge on the content, right edge
  // in the gap after "Mark Paid" (no half buttons); ring on Margin (before commission) + Profit (after)
  const fx0 = SIDEBAR, fx1 = fd.markPaid && fd.woBtn ? (fd.markPaid.x + fd.markPaid.w + fd.woBtn.x) / 2 : fd.taxCell.x + fd.taxCell.w + 90;
  const zC = Math.min(2.0, C.maxZ, W / (fx1 - fx0));
  C.camera(t6 + 1.1, 0.85, (fx0 + fx1) / 2, fd.strip.y + fd.strip.h / 2 + 100, zC);
  C.cursorOut(t6 + 1.35);
  const mc = fd.marginCell, pc = fd.profitCell;
  C.ring(t6 + 1.8, { x: mc.x, y: Math.min(mc.y, pc.y), w: pc.x + pc.w - mc.x, h: Math.max(mc.y + mc.h, pc.y + pc.h) - Math.min(mc.y, pc.y) }, 1.4, 7);
  cap6.outAt(t6 + 3.62);

  // ========================================================== END CARD (42.55 – 45.4)
  const tE = 42.55;
  document.getElementById('end-logo').src = '/brand/floorlogic-lockup-horizontal-reversed.svg';
  tl.to('#end', { opacity: 1, duration: 0.45, ease: 'none' }, tE);
  tl.fromTo('#end .logo', { opacity: 0, y: 18, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'flOut', immediateRender: false }, tE + 0.2);
  tl.fromTo('#end h1', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.6, ease: 'flOut', immediateRender: false }, tE + 0.4);
  tl.fromTo('#end p.sub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55, ease: 'flOut', immediateRender: false }, tE + 0.6);
  tl.fromTo('#end .url', { opacity: 0, y: 14, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'flOut', immediateRender: false }, tE + 0.8);
  gsap.set(['#end .logo', '#end h1', '#end p.sub', '#end .url'], { opacity: 0 });
  C.hide(tE + 0.45, 0.01);
  tl.to({}, { duration: 0.01 }, 45.39);   // total length 45.4 s
  const endCue = { num: '', label: 'End', text: 'FloorLogic. Start your free 14-day trial. No credit card · No setup fee. floorlogic.vercel.app', describe: '', start: tE, end: 45.4, count: '' };
  cues.push(endCue);

  window.__CHAPTERS = [
    { at: 0, label: 'Leads move themselves', detail: 'Pick a survey date' },
    { at: Math.round(t2 + 0.38), label: 'Quote the job', detail: 'Cartons counted for you' },
    { at: Math.round(t3 + 0.38), label: 'Customer approves', detail: 'On their phone' },
    { at: Math.round(t4 + 0.38), label: 'Work order & invoice', detail: 'One click, then schedule' },
    { at: Math.round(t5 + 0.38), label: 'Get paid', detail: 'Balance hits $0' },
    { at: Math.round(t6 + 0.38), label: 'Know the profit', detail: 'Before and after commission' },
  ];
  window.__CUES = cues;
  // the poster frame: the customer's level APPROVED stamp with its caption (comp/encode.mjs)
  window.__POSTER = t3 + 7.53;
})();
