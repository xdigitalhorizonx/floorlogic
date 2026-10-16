#!/usr/bin/env node
// Export the site's shared fictional dataset (src/data/sample-data.ts) as FloorLogic app
// database rows — snake_case, the shape PostgREST returns and the app's `_fromApi` maps to
// camelCase (demo `main` index.html: TABLE_MAP, FIELD_OVERRIDES_OUT, `_fromApi`).
//
// Used by the demo-video harness, which feeds these rows to an OFFLINE, in-memory Supabase
// stand-in. Nothing here talks to any database or network: it is a pure transform.
//
//   node tools/export-fixture.mjs [--out=fixture.json]
//
// Output: { seedId, demoToday, session, tables, story, expected }
//   tables   rows that exist at the start of the story (DEMO_TODAY, before the video's actions):
//            the dataset's leads + QT-330 (draft), plus the shop's "supporting cast" — past
//            and running jobs, invoices, POs, payments, job costs, tasks, calendar, notes —
//            so every screen of the app looks like a working shop (see buildWorld below)
//   story    rows for things that happen off-camera between scenes (QT-330 measured and sent,
//            deposit paid online, purchase orders, job costs), in app row shape
//   expected values the app must reproduce on camera (carton hint, totals, toasts) — the
//            harness asserts them so the video and the site can never disagree
//
// Requires Node 24 (built-in TypeScript type stripping). A tiny resolve hook maps the
// dataset's extensionless relative imports ('../lib/logic') to .ts files.
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = `
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL && ctx.parentURL.endsWith('.ts') && !/\\.[cm]?[jt]s$/.test(spec)) {
    for (const cand of [spec + '.ts', spec + '/index.ts']) {
      const u = new URL(cand, ctx.parentURL);
      if (fs.existsSync(fileURLToPath(u))) return next(u.href, ctx);
    }
  }
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const S = await import(pathToFileURL(path.join(ROOT, 'src/data/sample-data.ts')).href);
const L = await import(pathToFileURL(path.join(ROOT, 'src/lib/logic/index.ts')).href);

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));

// ---------------------------------------------------------------- helpers --
const TZ = '-07:00';                                   // Reno in October (PDT)
const at = (iso, hm = '10:00') => `${iso}T${hm}:00${TZ}`;
const D = S.demoDate;
const norm = (p) => String(p || '').replace(/\D/g, '').slice(-10) || null;
const T = S.thread;
const repById = Object.fromEntries(S.reps.map((r) => [r.id, r]));
const SESSION_USER = { id: '0d1e5a1e-film-4d00-8000-00000000da1e', email: S.reps[0].email, name: S.reps[0].name };

// Row keys inside a section, the app's way (q.html L1016-1036): materials 'mat-i', labors 'lab-i'.
// `lk` prefixes the line ids (a quote, its work order and its invoice share them, as the app's
// approval pairs them; different documents never do).
function appLines(sections, lk = 'lk-film') {
  const materials = [], labors = [];
  sections.forEach((sec, sIdx) => {
    sec.materials.forEach((m, i) => {
      const qty = m.quantity === '' || m.quantity == null ? '' : Number(m.quantity);
      const q = qty === '' ? 0 : qty;
      materials.push({
        linkId: `${lk}-${sIdx}-m${i}`, item: m.name, productName: m.name, style: m.style || '', color: '', vendor: S.products.find((p) => p.matNum === m.matNum)?.vendor || '',
        sku: '', matNum: m.matNum || '', quantity: qty, retailPrice: m.retailPrice, companyCost: m.companyCost,
        purchaseUOM: m.purchaseUOM || '', costUOM: m.costUOM || '', coverageUOM: m.coverageUOM || m.costUOM || '', coveragePerUOM: m.coveragePerUOM || 0,
        ...(m.rollWidth ? { rollWidth: m.rollWidth } : {}), ...(m.lengthFt != null ? { lengthFt: m.lengthFt, lengthIn: m.lengthIn || 0 } : {}),
        // category left blank on quote lines, as the app's own demo seed does (a set category
        // switches on the builder's material checklist).
        poNumber: '', category: '', hidden: false,
        totalPrice: L.round2(q * m.retailPrice), totalCost: L.round2(q * m.companyCost), _section: sIdx, _order: i,
      });
    });
    sec.labors.forEach((l, i) => {
      const qty = l.quantity === '' || l.quantity == null ? '' : Number(l.quantity);
      const q = qty === '' ? 1 : (qty || 1);           // app quirk: blank/zero labor qty counts as 1
      labors.push({
        linkId: `${lk}-${sIdx}-l${i}`, name: l.name, productName: l.name, description: l.description || '', uom: l.uom,
        quantity: qty, retailPrice: l.retailPrice, companyCost: l.companyCost,
        totalPrice: L.round2(q * l.retailPrice), totalCost: L.round2(q * l.companyCost), _section: sIdx, _order: sec.materials.length + i,
      });
    });
  });
  return { materials, labors };
}
function appSections(sections) {
  return sections.map((s) => ({
    title: s.title,
    ...(s.kind === 'pickOne' ? { multipleChoice: true, chosenRowKey: s.chosenRowKey || null } : {}),
    ...(s.kind === 'optional' ? { optional: true } : {}),
  }));
}

// The app's starter "Main" dashboard (index.html SYSTEM_DEFAULT_DASHBOARDS, key 'sd-main').
const MAIN_DASH = {
  layout: ['stat-new-leads', 'stat-active-jobs', 'stat-outstanding', 'stat-revenue', 'card-my-work', 'card-schedule', 'card-calendar', 'card-pipeline', 'card-job-board', 'card-recent-activity'],
  cols: { 'stat-new-leads': 1, 'stat-active-jobs': 4, 'stat-outstanding': 7, 'stat-revenue': 10, 'card-my-work': 1, 'card-schedule': 7, 'card-calendar': 1, 'card-pipeline': 1, 'card-job-board': 7, 'card-recent-activity': 1 },
  rows: { 'stat-new-leads': 1, 'stat-active-jobs': 1, 'stat-outstanding': 1, 'stat-revenue': 1, 'card-my-work': 2, 'card-schedule': 2, 'card-calendar': 6, 'card-pipeline': 13, 'card-job-board': 13, 'card-recent-activity': 16 },
};

// Marisol's sign-in (the shop's second user). Dale (SESSION_USER) is the one on camera.
const MARISOL_USER = { id: '0d1e5a1e-film-4d00-8000-0000000a4502', email: S.reps[1].email, name: S.reps[1].name };

// ------------------------------------------------- the shop's supporting cast --
// Everything the dataset does not cover but a working shop's screens show: customers from
// past leads, the quotes / work orders / invoices of jobs already won (QT-318…329,
// WO-318…327, IN-318…324), purchase orders, payments, job costs, tasks, calendar, sticky
// notes, activity and stock. All fictional, film-only: no real brands (the dataset's own
// products, vendors and labor), no street addresses (a city, or a site label such as
// "Sage Creek, Lot 8, Sparks, NV"), (775) 555-01xx phone numbers (the range reserved for
// fiction), .test e-mail. Money is figured with the site's copy of the
// app's own rules (src/lib/logic), so totals, tax and deposits read exactly as the app
// would store them. Numbering follows the app: a quote's work order and invoice carry the
// quote's number (approveQuote); WO-325…327 are work orders opened by hand (no invoice yet).
function buildWorld({ taxRate, taxCounty }) {
  const P = Object.fromEntries(S.products.map((p) => [p.id, p]));
  const LAB = Object.fromEntries(S.labor.map((l) => [l.id, l]));
  const repCols = (id) => ({ sales_rep_id: id, sales_rep_name: repById[id].name, sales_rep_email: repById[id].email });
  const M = (pid, qty) => {
    const p = P[pid];
    return { name: p.name, matNum: p.matNum, quantity: qty, retailPrice: p.retailPrice, companyCost: p.companyCost, purchaseUOM: p.purchaseUOM, costUOM: p.costUOM, coverageUOM: p.costUOM, coveragePerUOM: p.coverage, ...(p.rollWidth ? { rollWidth: p.rollWidth } : {}) };
  };
  // An area of a carton product, snapped up to whole cartons the app's way.
  const area = (pid, sqft) => { const s = P[pid].coverage ? L.snapToCartons(sqft, P[pid].coverage) : null; return s ? s.quantity : sqft; };
  const LB = (lid, qty) => { const l = LAB[lid]; return { name: l.name, ...(l.description ? { description: l.description } : {}), uom: l.uom, quantity: qty, retailPrice: l.retailPrice, companyCost: l.companyCost }; };
  const custom = (name, uom, qty, cost, retail) => ({ name, uom, quantity: qty, retailPrice: retail, companyCost: cost });
  const money = (mats, labs) => L.computeQuoteTotals({ sections: [{ title: '', kind: 'required', materials: mats, labors: labs }], taxRate, taxExempt: false });
  const lines = (key, mats, labs) => appLines([{ title: '', kind: 'required', materials: mats, labors: labs }], `lk-${key}`);
  const fee = (amount, method) => (L.isCardPayment(method) ? L.paymentFee({ amount, method }) : 0);
  const pay = (id, amount, dateOff, method, note) => ({ id, amount, date: D(dateOff), method, note, ...(L.isCardPayment(method) ? { processingFee: fee(amount, method) } : {}) });
  const ONLINE = 'Credit Card (Stripe)';

  // -------------------------------------------------------------- customers --
  const C = (id, name, phone, email, city, type, source, sinceOff, repId, terms = 'Due on Receipt') => ({
    id, name, phone, phone_norm: norm(phone), email, address: city, customer_type: type, source,
    customer_since: D(sinceOff), default_payment_terms: terms, notes: [], contacts: [], properties: [], pricing: [], files: [],
    tax_exempt: false, sales_rep_id: repId, created_at: at(D(sinceOff), '10:00'),
  });
  const customers = [
    C('cu-9', 'Marcus & Dana Ellsworth', '(775) 555-0161', 'marcus@example.test', 'Reno, NV', 'Retail', 'Google', -14, 'ct-rep-1'),
    C('cu-10', 'Whitmore Property Trust', '(775) 555-0162', 'ap@whitmore-trust.test', 'Reno, NV', 'Property Management', 'Referral', -290, 'ct-rep-1', 'Net 30'),
    C('cu-11', 'Sage Creek Homes', '(775) 555-0163', 'purchasing@sagecreek-homes.test', 'Sparks, NV', 'Builder', 'Referral', -186, 'ct-rep-2', 'Net 30'),
    C('cu-12', 'Juniper Hill Café', '(775) 555-0164', 'owner@juniperhill.test', 'Reno, NV', 'Commercial', 'Website', -16, 'ct-rep-2', 'Net 15'),
    C('cu-13', 'Colette Marchand', '(775) 555-0165', 'colette@example.test', 'Reno, NV', 'Retail', 'Home Show', -13, 'ct-rep-1'),
    C('cu-14', 'Bright Path Pediatrics', '(775) 555-0166', 'office@brightpath-peds.test', 'Reno, NV', 'Commercial', 'Google', -39, 'ct-rep-2', 'Net 30'),
    C('cu-15', 'Ray & Sun Yi', '(775) 555-0167', 'ray@example.test', 'Sparks, NV', 'Retail', 'Referral', -11, 'ct-rep-2'),
    C('cu-17', 'Silver Sage Apartments', '(775) 555-0168', 'ap@silversage-apts.test', 'Reno, NV', 'Property Management', 'Cold Call', -64, 'ct-rep-1', 'Net 30'),
    C('cu-21', 'Kevin & Amber Owens', '(775) 555-0169', 'amber@example.test', 'Sparks, NV', 'Retail', 'Facebook', -52, 'ct-rep-2'),
  ];
  const cust = Object.fromEntries(customers.map((c) => [c.id, c]));

  // --------------------------------------------------- quotes / WOs / invoices --
  // One spec per document family; `wo` + `inv` are the work order and invoice its approval made.
  const specs = [
    { n: 318, cu: 'cu-21', site: 'Owens residence, Sparks, NV', rep: 'ct-rep-2', type: 'Residential — Hardwood', name: 'Living + dining', desc: 'Heritage oak, glue-down through living and dining. New base.',
      mats: [M('p-hw-best', area('p-hw-best', 620)), M('p-base-325', 180)], labs: [custom('Hardwood install — glue-down', 'SqFt', 620, 2.6, 4.25)],
      created: -50, sent: -49, approved: -47, terms: L.DEFAULT_PAYMENT_TERMS[5],
      wo: { status: 'paid', scheduled: -41, days: 3, crew: 'ct-ins-1', started: -41, completed: -38, paid: -34 },
      inv: { final: true, pays: [['ip-318-1', 'half', -47, ONLINE, 'Deposit — paid on the live invoice'], ['ip-318-2', 'rest', -36, 'Check', 'Check 2187 — balance']] } },
    { n: 319, cu: 'cu-10', site: 'Whitmore Building, Suite 120, Reno, NV', rep: 'ct-rep-1', type: 'Commercial — LVP', name: 'Suite 120 lobby + corridor', desc: 'Summit LVP through the suite 120 lobby and corridor. Weekend install.',
      mats: [M('p-lvp-good', area('p-lvp-good', 1240))], labs: [LB('l-lvp-install', 1240)],
      created: -42, sent: -41, approved: -38, terms: 'Net 30',
      wo: { status: 'paid', scheduled: -31, days: 2, crew: 'ct-ins-1', started: -31, completed: -29, paid: -12 },
      inv: { final: true, pays: [['ip-319-1', 'all', -12, 'Bank Transfer', 'ACH']] } },
    { n: 320, cu: 'cu-11', site: 'Sage Creek, Lot 8, Sparks, NV', rep: 'ct-rep-2', type: 'New construction — LVP', name: 'Lot 8', desc: 'Lot 8 flooring package: Summit LVP through the lower level.',
      mats: [M('p-lvp-good', area('p-lvp-good', 1830))], labs: [LB('l-lvp-install', 1830)],
      created: -30, sent: -29, approved: -27, terms: 'Net 30',
      wo: { status: 'final_invoice', scheduled: -8, days: 2, crew: 'ct-ins-1', started: -8, completed: -6 },
      inv: { final: true, pays: [] } },
    { n: 321, cu: 'cu-12', site: 'Juniper Hill Café, Reno, NV', rep: 'ct-rep-2', type: 'Commercial — LVP', name: 'Dining room', desc: 'Dining floor in Summit XL, after-hours install over three nights. New wall base.',
      mats: [M('p-lvp-better', area('p-lvp-better', 1240)), M('p-base-325', 300)], labs: [custom('Commercial LVP install — after hours', 'SqFt', 1240, 1.4, 2.1)],
      created: -16, sent: -15, approved: -13, terms: L.DEFAULT_PAYMENT_TERMS[5],
      wo: { status: 'in_progress', scheduled: -2, days: 3, crew: 'ct-ins-2', started: -2, startedAt: '17:00', ordered: -12 },
      inv: { pays: [['ip-321-1', 'half', -13, ONLINE, 'Deposit — paid on the live invoice']] } },
    { n: 322, cu: 'cu-9', site: 'Ellsworth residence, Reno, NV', rep: 'ct-rep-1', type: 'Residential — LVP', name: 'Main level', desc: 'Summit LVP through the main level: great room, kitchen, hall. Demo existing carpet, haul away.',
      mats: [M('p-lvp-good', area('p-lvp-good', 1650)), M('p-base-325', 420)], labs: [LB('l-lvp-install', 1650), LB('l-demo-carpet', 1650)],
      created: -12, sent: -11, approved: -9, terms: L.DEFAULT_PAYMENT_TERMS[5],
      wo: { status: 'scheduled', scheduled: 3, days: 2, crew: 'ct-ins-1', ordered: -8, eta: -3 },
      inv: { pays: [['ip-322-1', 'half', -9, ONLINE, 'Deposit — paid on the live invoice']] } },
    { n: 323, cu: 'cu-11', site: 'Sage Creek, Lot 14, Sparks, NV', rep: 'ct-rep-2', type: 'New construction — LVP', name: 'Lot 14', desc: 'Lot 14 flooring package: Summit LVP through the lower level, new base throughout.',
      mats: [M('p-lvp-good', area('p-lvp-good', 1830)), M('p-base-325', 360)], labs: [LB('l-lvp-install', 1830)],
      created: -10, sent: -10, approved: -8, terms: 'Net 30',
      wo: { status: 'materials_ordered', ordered: -7, eta: 5, days: 2 },
      inv: { pays: [] } },
    { n: 324, cu: 'cu-14', site: 'Bright Path Pediatrics, Reno, NV', rep: 'ct-rep-2', type: 'Commercial — LVP', name: 'Waiting room + exam halls', desc: 'Waiting room and two exam halls in Summit XL. Confirm color with the office manager before ordering.',
      mats: [M('p-lvp-better', area('p-lvp-better', 1240))], labs: [LB('l-lvp-install', 1240), custom('Floor prep — patch & level', 'SqFt', 1240, 0.55, 0.95)],
      created: -6, sent: -6, approved: -4, terms: 'Net 30',
      wo: { status: 'order_materials', days: 2 },
      inv: { pays: [] } },
    // open quotes
    { n: 325, cu: 'cu-15', site: 'Yi residence, Sparks, NV', rep: 'ct-rep-2', type: 'Residential — Hardwood', name: 'Living + dining', desc: 'Heritage oak, glue-down through living and dining. Stairs stay carpeted.',
      mats: [M('p-hw-best', area('p-hw-best', 780)), M('p-base-325', 210)], labs: [custom('Hardwood install — glue-down', 'SqFt', 780, 2.6, 4.25)],
      created: -5, sent: -4, status: 'sent', terms: L.DEFAULT_PAYMENT_TERMS[5] },
    { n: 326, cu: 'cu-17', site: 'Silver Sage Apartments, Reno, NV', rep: 'ct-rep-1', type: 'Multi-family — Carpet', name: 'Unit turnover program', desc: 'Turnover pricing per unit (2-bed standard): carpet and pad, tear-out and haul-off.',
      mats: [M('p-carpet-sandbar', 62), M('p-pad-8lb', 62)], labs: [LB('l-carpet-pad', 62), custom('Tear-out & haul-off', 'SqYd', 62, 0.6, 1.1)],
      created: -4, sent: -3, status: 'sent', terms: 'Net 30' },
    { n: 327, cu: 'cu-13', site: 'Marchand residence, Reno, NV', rep: 'ct-rep-1', type: 'Residential — Carpet', name: 'Bedrooms + stairs', desc: 'Three bedrooms and the stairs in Sandbar broadloom over 8 lb pad.',
      mats: [M('p-carpet-sandbar', 96), M('p-pad-8lb', 96)], labs: [LB('l-carpet-pad', 96), LB('l-stair', 14)],
      created: -3, sent: -1, status: 'sent', terms: L.DEFAULT_PAYMENT_TERMS[5] },
    { n: 328, cu: 'cu-10', site: 'Whitmore Building, Suite 210, Reno, NV', rep: 'ct-rep-1', type: 'Commercial — LVP', name: 'Suite 210', desc: 'Suite 210 refresh, same Summit LVP as suite 120.',
      mats: [M('p-lvp-good', area('p-lvp-good', 980))], labs: [LB('l-lvp-install', 980)],
      created: -2, status: 'draft', terms: 'Net 30' },
    { n: 329, cu: 'cu-11', site: 'Sage Creek, Lot 15, Sparks, NV', rep: 'ct-rep-2', type: 'New construction — Hardwood', name: 'Lot 15 hardwood option', desc: 'Buyer upgrade option: Heritage oak in the great room instead of LVP.',
      mats: [M('p-hw-best', area('p-hw-best', 640))], labs: [custom('Hardwood install — glue-down', 'SqFt', 640, 2.6, 4.25)],
      created: -2, sent: -2, declined: -1, status: 'declined', terms: 'Net 30' },
  ];
  const quotes = [], jobs = [], invoices = [];
  for (const s of specs) {
    const key = `${s.n}`;
    const c = cust[s.cu];
    const t = money(s.mats, s.labs);
    const ln = lines(key, s.mats, s.labs);
    const common = {
      customer_id: s.cu, project_type: s.type, site_address: s.site || c.address, job_description: s.desc, doc_name: s.name,
      tax_rate: taxRate, tax_county: taxCounty, materials: ln.materials, labors: ln.labors, ...repCols(s.rep),
    };
    const status = s.wo ? 'approved' : s.status;
    quotes.push({
      id: `qt-${key}`, number: `QT-${key}`, lead_id: null, status, ...common,
      payment_terms: s.terms, tax_exempt: false, down_payment_pct: 50, subtotal: t.subtotal, tax: t.tax, total: t.total,
      enabled_terms: [], notes: [], versions: [], rooms: [], sections: [], show_breakdown: false, selected_options: null, edit_unlocked: false,
      expiration_date: D(s.created + 20), line_items_header: 'Materials & Labor', public_token: null,
      ...(s.sent != null ? { sent_at: at(D(s.sent), '10:15') } : {}),
      ...(s.approved != null ? { approved_at: at(D(s.approved), '18:40') } : {}),
      created_at: at(D(s.created), '09:30'),
    });
    if (!s.wo) continue;
    const w = s.wo;
    jobs.push({
      id: `wo-${key}`, number: `WO-${key}`, quote_id: `qt-${key}`, status: w.status, ...common,
      schedule: [], payments: [], notes: [], versions: [], duration_days: w.days || 1, hide_labor: false,
      scheduled_date: w.scheduled != null ? D(w.scheduled) : '', crew: w.crew || '',
      ...(w.started != null ? { started_at: at(D(w.started), w.startedAt || '08:05') } : {}),
      ...(w.completed != null ? { completed_at: at(D(w.completed), '15:30') } : {}),
      ...(w.paid != null ? { paid_at: at(D(w.paid), '11:00') } : {}),
      ...(w.ordered != null ? { materials_ordered_at: at(D(w.ordered), '09:15') } : {}),
      ...(w.eta != null ? { materials_eta: D(w.eta) } : {}),
      created_at: at(D(s.approved), '18:45'),
    });
    const invTotal = L.round2(t.invoiceTotal);
    const half = L.depositAmount(invTotal, 50);
    const pays = s.inv.pays.map(([id, part, off, method, note]) => pay(id, part === 'half' ? half : part === 'rest' ? L.round2(invTotal - half) : invTotal, off, method, note));
    const paid = L.round2(pays.reduce((a, p) => a + p.amount, 0));
    // Net 30 from the approval; a 50 / 50 balance falls due when the job is done.
    const doneOff = w.completed != null ? w.completed : w.scheduled != null ? w.scheduled + (w.days || 1) - 1 : s.approved + 21;
    invoices.push({
      id: `in-${key}`, number: `IN-${key}`, quote_id: `qt-${key}`, job_id: `wo-${key}`, status: L.invoiceStatus(invTotal, pays), ...common,
      payment_terms: s.terms, subtotal: t.subtotal, tax: t.tax, total: invTotal, amount_paid: paid, payments: pays,
      down_payment_pct: 50, final_invoice: !!s.inv.final, due_date: s.terms === 'Net 30' ? D(s.approved + 30) : D(doneOff),
      line_items: [], line_items_header: 'Materials & Labor', enabled_terms: [], notes: [], sections: [], versions: [], stripe_payment_intent_ids: [],
      created_at: at(D(s.approved), '18:45'),
    });
  }
  // Work orders opened by hand (turnover and repair work for regular customers): no quote,
  // no invoice yet. They take the next work-order numbers after the last approval.
  const manual = (n, cu, rep, type, name, desc, mats, labs, wo) => {
    const ln = lines(`${n}`, mats, labs);
    jobs.push({
      id: `wo-${n}`, number: `WO-${n}`, quote_id: null, customer_id: cu, status: wo.status, project_type: type, site_address: wo.site || cust[cu].address,
      job_description: desc, doc_name: name, materials: ln.materials, labors: ln.labors, schedule: [], payments: [], notes: [], versions: [],
      tax_rate: taxRate, tax_county: taxCounty, duration_days: wo.days || 1, hide_labor: false, ...repCols(rep),
      scheduled_date: wo.scheduled != null ? D(wo.scheduled) : '', crew: wo.crew || '',
      ...(wo.started != null ? { started_at: at(D(wo.started), '08:10') } : {}),
      created_at: at(D(wo.created), '14:00'),
    });
  };
  manual(325, 'cu-17', 'ct-rep-1', 'Multi-family — Carpet', 'Unit 2A turnover', 'Unit 2A turnover: carpet and pad, both bedrooms and the living room.',
    [M('p-carpet-sandbar', 62), M('p-pad-8lb', 62)], [LB('l-carpet-pad', 62)], { status: 'in_progress', scheduled: 0, crew: 'ct-ins-1', started: 0, created: -3, site: 'Silver Sage Apartments, Unit 2A, Reno, NV' });
  manual(326, 'cu-13', 'ct-rep-1', 'Residential — Repair', 'Hall carpet repair', 'Restretch the hall carpet and patch the doorway seam.',
    [], [custom('Carpet repair & restretch', 'Each', 1, 210, 385)], { status: 'ready_to_schedule', created: -2, site: 'Marchand residence, Reno, NV' });
  manual(327, 'cu-17', 'ct-rep-1', 'Multi-family — Carpet', 'Unit 4C turnover', 'Unit 4C turnover: carpet and pad throughout.',
    [M('p-carpet-sandbar', 58), M('p-pad-8lb', 58)], [LB('l-carpet-pad', 58)], { status: 'scheduled', scheduled: 5, crew: 'ct-ins-2', days: 1, created: -1, site: 'Silver Sage Apartments, Unit 4C, Reno, NV' });

  // --------------------------------------------------------- purchase orders --
  const job = Object.fromEntries(jobs.map((j) => [j.id, j]));
  const poSeq = {};
  const PO = (id, number, jobId, pid, qty, status, orderedOff, etaOff, receivedOff, note = '') => {
    const p = P[pid], j = job[jobId];
    poSeq[jobId] = (poSeq[jobId] || 0) + 1;
    return {
      id, number, job_id: jobId, job_number: j.number, customer_id: j.customer_id, customer_name: cust[j.customer_id].name, po_number: `${j.number}-${poSeq[jobId]}`,
      product_name: p.name, mat_num: p.matNum, style: '', color: '', vendor: p.vendor, uom: p.costUOM, qty, cost: p.companyCost,
      total_cost: L.round2(qty * p.companyCost), status, note, order_date: D(orderedOff), estimated_delivery: D(etaOff), ordered_at: D(orderedOff),
      ...(receivedOff != null ? { received_at: D(receivedOff) } : {}), created_at: at(D(orderedOff), '09:20'),
    };
  };
  const job_pos = [
    PO('po-1185', 'JPO-1185', 'wo-318', 'p-hw-best', area('p-hw-best', 620), 'received', -46, -43, -43),
    PO('po-1186', 'JPO-1186', 'wo-318', 'p-base-325', 192, 'received', -46, -43, -43, '12 × 16 ft lengths'),
    PO('po-1187', 'JPO-1187', 'wo-319', 'p-lvp-good', area('p-lvp-good', 1240), 'received', -37, -33, -33),
    PO('po-1188', 'JPO-1188', 'wo-320', 'p-lvp-good', area('p-lvp-good', 1830), 'received', -26, -10, -10),
    PO('po-1189', 'JPO-1189', 'wo-322', 'p-lvp-good', area('p-lvp-good', 1650), 'received', -8, -3, -3),
    PO('po-1190', 'JPO-1190', 'wo-322', 'p-base-325', 432, 'received', -8, -3, -3, '27 × 16 ft lengths'),
    PO('po-1191', 'JPO-1191', 'wo-323', 'p-lvp-good', area('p-lvp-good', 1830), 'ordered', -7, 5, null),
    PO('po-1192', 'JPO-1192', 'wo-321', 'p-lvp-better', area('p-lvp-better', 1240), 'received', -12, -4, -4),
  ];

  // The work orders' material lines carry what ordering and receiving wrote on them (Order
  // Materials: poCreated, poNumber, poOrderDate, estimatedDelivery; receiving a PO: matReceivedAt). Lines with no PO on jobs
  // already past ordering were bought over the counter / from stock: ordered and in on day one.
  const PAST_ORDERING = ['materials_ordered', 'ready_to_schedule', 'scheduled', 'in_progress', 'final_invoice', 'ready_to_be_paid', 'paid', 'complete'];
  for (const j of jobs) {
    for (const m of j.materials) {
      const po = job_pos.find((x) => x.job_id === j.id && x.mat_num === m.matNum);
      if (po) Object.assign(m, { poCreated: true, poNumber: po.po_number, poOrderDate: po.order_date, estimatedDelivery: po.estimated_delivery, allocatedFromInventory: false, matOrderedAt: po.ordered_at, ...(po.received_at ? { matReceivedAt: po.received_at } : {}) });
      else if (PAST_ORDERING.includes(j.status)) Object.assign(m, { matOrderedAt: j.created_at.slice(0, 10), matReceivedAt: j.created_at.slice(0, 10) });
    }
  }

  // --------------------------------------------------------------- job costs --
  // JC-001…014; the dataset's WO-330 costs continue at JC-015.
  const JC = (n, jobId, kind, category, description, amount, extra = {}) => ({
    id: `jc-${n}`, number: `JC-${String(n).padStart(3, '0')}`, job_id: jobId, job_number: job[jobId].number, kind, category, description,
    vendor: '', contractor_id: null, contractor_name: '', quantity: 1, unit_cost: amount, amount, paid: false, paid_date: null,
    method: '', check_number: '', notes: '', file_id: null, status: 'active', created_by_name: S.reps[0].name, ...extra,
    cost_date: D(extra.cost_date), created_at: at(D(extra.cost_date), '16:00'),
  });
  const ruben = { contractor_id: 'ct-ins-1', contractor_name: 'Ruben Ortiz' }, tanner = { contractor_id: 'ct-ins-2', contractor_name: 'Tanner Cole' };
  const paidOn = (off, method, check = '') => ({ paid: true, paid_date: D(off), method, check_number: check });
  const job_costs = [
    JC(1, 'wo-318', 'contractor', 'Labor', 'Install — hardwood glue-down (3 days)', 1640, { ...ruben, cost_date: -38, ...paidOn(-37, 'Check', '2201') }),
    JC(2, 'wo-318', 'contractor', 'Labor', 'Helper day — tear-out', 420, { ...tanner, cost_date: -41, ...paidOn(-37, 'Check', '2202') }),
    JC(3, 'wo-318', 'receipt', 'Supplies', 'Adhesive + moisture barrier', 186.4, { vendor: 'Basin Floor Supply', cost_date: -42, ...paidOn(-42, 'Card') }),
    JC(4, 'wo-319', 'contractor', 'Labor', 'Install — 2 days (weekend)', 1180, { ...ruben, cost_date: -29, ...paidOn(-28, 'Check', '2208') }),
    JC(5, 'wo-319', 'freight', 'Freight', 'Pallet delivery — Basin Floor Supply', 45, { vendor: 'Basin Floor Supply', cost_date: -32, ...paidOn(-32, 'Card') }),
    JC(6, 'wo-319', 'receipt', 'Equipment', 'Floor scraper rental', 148.5, { vendor: 'Basin Tool Rental', cost_date: -31, ...paidOn(-31, 'Card') }),
    JC(7, 'wo-320', 'contractor', 'Labor', 'Install — lot 8 LVP (2 days)', 1650, { ...ruben, cost_date: -6, ...paidOn(-5, 'Check', '2214') }),
    JC(8, 'wo-320', 'freight', 'Freight', 'Pallet delivery — Basin Floor Supply', 45, { vendor: 'Basin Floor Supply', cost_date: -9, ...paidOn(-9, 'Card') }),
    JC(9, 'wo-321', 'contractor', 'Labor', 'Night install — first two nights', 940, { ...tanner, cost_date: -1 }),
    JC(10, 'wo-321', 'supply', 'Supplies', 'Transition strips', 58, { quantity: 4, unit_cost: 14.5, cost_date: -1, ...paidOn(-1, 'Card') }),
    JC(11, 'wo-321', 'receipt', 'Supplies', 'Patch, primer, trowels', 132.77, { vendor: 'Basin Floor Supply', cost_date: 0, ...paidOn(0, 'Card') }),
    JC(12, 'wo-322', 'freight', 'Freight', 'Pallet delivery — Basin Floor Supply', 45, { vendor: 'Basin Floor Supply', cost_date: -3, ...paidOn(-3, 'Card') }),
    JC(13, 'wo-325', 'contractor', 'Labor', 'Unit 2A carpet install', 610, { ...ruben, cost_date: 0 }),
    JC(14, 'wo-325', 'supply', 'Supplies', 'Seam tape', 19.5, { quantity: 2, unit_cost: 9.75, cost_date: 0, ...paidOn(0, 'Cash') }),
  ];

  // ------------------------------------------------------- the office's day --
  const task = (n, title, description, assignee, priority, status, dueOff, linkType, linkId, extra = {}) => ({
    id: `tk-${n}`, number: `TSK-${String(n).padStart(4, '0')}`, title, description, assigned_user_id: assignee, priority, status,
    due_date: at(D(dueOff), '17:00'), link_type: linkType, link_id: linkId, notes: [], job_task: false, notify_user_ids: [],
    created_at: at(D(dueOff - 2), '09:00'), ...extra,
  });
  // Assignees are sales-rep ids, as the app's task picker stores them (it lists the reps by
  // id; app_settings.system_users is empty on the demo). The dashboard's My Work card files a
  // "high" task under its red group, so only today's must-do is high.
  const DALE = 'ct-rep-1', MARI = 'ct-rep-2';
  const tasks = [
    task(923, 'Order materials (confirm color first)', 'Confirm the Smoked Hickory color with the office manager, then order.', MARI, 'high', 'pending', 0, 'job', 'wo-324'),
    task(924, 'Follow up on the turnover proposal', 'Their board reviews it Thursday. They want an updated insurance certificate first.', DALE, 'medium', 'pending', 1, 'quote', 'qt-326'),
    task(925, 'Collect deposit — Yi hardwood', 'Verbal yes on QT-325. Send the payment link.', MARI, 'medium', 'pending', 2, 'quote', 'qt-325'),
    task(926, 'Schedule the hall repair', 'Two-hour job. Mornings work best for Colette.', DALE, 'medium', 'pending', 1, 'job', 'wo-326'),
    task(927, 'Final invoice reminder — Sage Creek lot 8', 'Net 30; check in with purchasing.', MARI, 'low', 'pending', 4, 'invoice', 'in-320'),
    task(928, 'Receive JPO-1189', 'Count cartons and check for damage.', DALE, 'low', 'completed', -3, 'job', 'wo-322', { completed_at: at(D(-3), '09:40'), completed_by_user_id: SESSION_USER.id }),
  ];
  const ce = (n, title, off, start, end, location, color, kind, linkType, linkId) => ({
    id: `ce-${n}`, title, date: D(off), start_time: start, end_time: end, location, color, kind, link_type: linkType, link_id: linkId, created_by_name: S.reps[0].name,
  });
  const calendar_events = [
    ce(1, 'Carpet — Silver Sage 2A (WO-325)', 0, '08:00', '12:00', 'Reno, NV', 'blue', 'job', 'job', 'wo-325'),
    ce(2, 'Night install — Juniper Hill Café (WO-321)', 0, '17:00', '23:00', 'Reno, NV', 'blue', 'job', 'job', 'wo-321'),
    ce(3, 'Install — Ellsworth (WO-322) day 1', 3, '08:00', '16:00', 'Reno, NV', 'blue', 'job', 'job', 'wo-322'),
    ce(4, 'Install — Ellsworth (WO-322) day 2', 4, '08:00', '16:00', 'Reno, NV', 'blue', 'job', 'job', 'wo-322'),
    ce(5, 'Final walkthrough — Juniper Hill Café', 1, '15:00', '15:30', 'Reno, NV', 'green', 'event', 'job', 'wo-321'),
    ce(6, 'Delivery — JPO-1191 (Sage Creek lot 14)', 5, '09:00', '10:00', 'Warehouse dock', 'purple', 'event', 'job', 'wo-323'),
    ce(7, 'Carpet — Silver Sage 4C (WO-327)', 5, '08:00', '14:00', 'Reno, NV', 'blue', 'job', 'job', 'wo-327'),
  ];
  const notes = [
    { id: 'nt-1', title: 'Ruben off Friday', body: "No installs for Ruben's crew Friday; plan around it.", author_name: S.reps[0].name, color: 'amber', pinned: true, sort_order: 1, done: false, created_at: at(D(-2), '08:30') },
    { id: 'nt-2', title: 'Basin rep Tuesday 10am', body: 'Bringing the new Summit XL color line and updated dealer pricing.', author_name: S.reps[1].name, color: 'blue', pinned: false, sort_order: 2, done: false, created_at: at(D(-1), '11:10') },
    { id: 'nt-3', title: 'Silver Sage decision Thursday', body: 'If approved, block the week of the 26th for the first three unit turns.', author_name: S.reps[0].name, color: 'green', pinned: true, sort_order: 3, done: false, created_at: at(D(-1), '16:20') },
  ];
  const inv = Object.fromEntries(invoices.map((i) => [i.id, i]));
  const act = (n, text, off, hm) => ({ id: `act-${n}`, text, user_id: SESSION_USER.id, created_at: at(D(off), hm) });
  const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const activities = [
    act(1, 'New lead LD-051 — Hannah Brooks (Phone)', 0, '08:40'),
    act(2, 'Work order WO-325 started — Silver Sage Apartments', 0, '08:12'),
    act(3, 'Quote QT-327 sent to Colette Marchand', -1, '16:05'),
    act(4, 'Work order WO-327 created — Silver Sage Apartments', -1, '14:00'),
    act(5, 'Quote QT-329 declined — Sage Creek Homes', -1, '11:20'),
    act(6, 'Work order WO-321 started — Juniper Hill Café', -2, '17:05'),
    act(7, 'JPO-1189 received — Summit Rigid Core LVP — Driftwood Oak', -3, '09:40'),
    act(8, 'Quote QT-324 approved — Bright Path Pediatrics', -4, '18:40'),
    act(9, 'Job WO-320 marked complete — Sage Creek Homes', -6, '15:30'),
    act(10, `Payment received — IN-322 — ${fmt(inv['in-322'].payments[0].amount)} — Marcus & Dana Ellsworth`, -9, '18:52'),
    act(11, 'Quote QT-322 approved online — Marcus & Dana Ellsworth', -9, '18:40'),
    act(12, `Payment received — IN-319 — ${fmt(inv['in-319'].payments[0].amount)} — Whitmore Property Trust`, -12, '10:30'),
  ];
  const sample_checkouts = [
    { id: 'sc-0233', number: 'SC-0233', customer_id: 'cu-13', mat_num: P['p-carpet-sandbar'].matNum, product_name: P['p-carpet-sandbar'].name, style: '', color: '', vendor: P['p-carpet-sandbar'].vendor, checkout_date: at(D(-4), '10:00'), expected_return: D(6), notes: 'Bedroom carpet: comparing two colors' },
    { id: 'sc-0234', number: 'SC-0234', customer_id: 'cu-15', mat_num: P['p-hw-best'].matNum, product_name: P['p-hw-best'].name, style: '', color: '', vendor: P['p-hw-best'].vendor, checkout_date: at(D(-2), '14:30'), expected_return: D(5) },
  ];
  const stock = (n, pid, onHand, allocated, low) => {
    const p = P[pid];
    return {
      id: `iv-${n}`, mat_num: p.matNum, vendor: p.vendor, category: p.category, sku: '', product_name: p.name, style: '', color: '',
      uom: p.costUOM, ...(p.rollWidth ? { roll_width: p.rollWidth } : {}), on_hand: onHand, allocated, available: onHand - allocated,
      required: allocated, shortage: Math.max(0, allocated - onHand), company_cost: p.companyCost, cost_uom: p.costUOM, retail_price: p.retailPrice,
      low_stock_threshold: low, low_stock_enabled: true, prepared: 0, picked_up: 0, remaining_stock: 0, wo_cost: 0, p_os: [],
    };
  };
  const inventory_items = [
    stock(1, 'p-lvp-good', 713.1, 0, 300),
    stock(2, 'p-base-325', 64, 0, 200),
  ];
  const quote_interactions = [
    { id: 'qint-w1', quote_id: 'qt-322', kind: 'approved', user_agent: 'Approved online', created_at: at(D(-9), '18:40') },
    { id: 'qint-w2', quote_id: 'qt-325', kind: 'view', user_agent: 'Mozilla/5.0 (iPhone)', created_at: at(D(-1), '19:02') },
    { id: 'qint-w3', quote_id: 'qt-326', kind: 'view', user_agent: 'Mozilla/5.0 (Windows NT 10.0)', created_at: at(D(-2), '16:20') },
  ];
  // Three older leads still in play, so every working column of the board holds three
  // (LD-047…049: below the dataset's LD-051…060, so the next new lead is still LD-061).
  const lead = (id, number, name, phone, city, type, projectType, status, value, source, rep, o) => ({
    id, number, name, phone, phone_norm: norm(phone), email: `${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}@example.test`,
    address: city, type, project_type: projectType, status, estimated_value: String(value), source, sales_rep_id: rep, notes: [], contacts: [],
    site_survey_date: o.survey == null ? null : D(o.survey), follow_up_date: o.followUp == null ? null : D(o.followUp),
    created_at: D(o.created), stage_changed_at: D(o.stage),
  });
  const leads = [
    lead('ld-7', 'LD-047', 'Ruth & Allen Mercer', '(775) 555-0147', 'Reno, NV', 'Retail', 'Carpet — three bedrooms', 'site_survey_scheduled', 6800, 'Referral', 'ct-rep-1', { created: -9, stage: -2, survey: 1, followUp: 1 }),
    lead('ld-8', 'LD-048', 'Bluebunch Physical Therapy', '(775) 555-0148', 'Sparks, NV', 'Commercial', 'LVT — clinic floor', 'send_quote', 11800, 'Website', 'ct-rep-2', { created: -11, stage: -3, survey: -4, followUp: 2 }),
    lead('ld-9', 'LD-049', 'Diane Kowalski', '(775) 555-0149', 'Reno, NV', 'Retail', 'Laminate — living room + hall', 'follow_up', 4600, 'Google', 'ct-rep-1', { created: -16, stage: -5, followUp: 0 }),
  ];
  return { customers, leads, quotes, jobs, invoices, job_pos, job_costs, tasks, calendar_events, notes, activities, sample_checkouts, inventory_items, quote_interactions };
}

export function buildFixture() {
  // ----------------------------------------------------------- people --
  const contractors = [
    ...S.reps.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: '', role: 'Sales Rep', trade: '', active: true, commission_rate: r.commissionRate, user_id: r.id === 'ct-rep-1' ? SESSION_USER.id : r.id === 'ct-rep-2' ? MARISOL_USER.id : null })),
    ...S.installers.map((i) => ({ id: i.id, name: i.name, email: '', phone: '', role: 'Installer', trade: 'Installer', active: true })),
  ];
  const profiles = [
    { id: SESSION_USER.id, email: SESSION_USER.email, name: SESSION_USER.name, role: 'admin', active: true },
    { id: MARISOL_USER.id, email: MARISOL_USER.email, name: MARISOL_USER.name, role: 'sales', active: true },
  ];
  const user_preferences = [{ user_id: SESSION_USER.id, theme: 'light', theme_mode: 'light', privacy_mode: false, dismissed_notifications: [], snoozed_notifications: {}, seen_notifications: [], cleared_notifications: [] }];

  // ------------------------------------------------------------- leads --
  // Lead dates are DATE-ONLY strings, as the app writes them (`_todayISO()`); its
  // daysBetween() parses both sides as UTC midnight, so timestamps would skew the ages.
  // Approved leads are not loaded onto the board: in the app, approving a lead converts it
  // to a customer and removes it from the pipeline (approveLead), so the dataset's approved
  // lead (LD-060) would never still sit in the Approved column in real use.
  const leads = S.leads.filter((l) => l.status !== 'approved').map((l) => ({
    id: l.id, number: l.number, name: l.name, phone: l.phone, phone_norm: norm(l.phone), email: l.email,
    address: l.city, type: l.type, project_type: l.projectType, status: l.status, estimated_value: String(l.estimatedValue),
    source: l.source, sales_rep_id: l.salesRepId, notes: [], contacts: [],
    site_survey_date: l.siteSurveyDate, follow_up_date: l.followUpDate,
    created_at: l.createdAt,
    stage_changed_at: l.stageChangedAt,
  }));

  // ---------------------------------------------------------- catalog --
  const product_catalog = S.products.map((p) => ({
    id: p.id, mat_num: p.matNum, product_name: p.name, vendor: p.vendor, category: p.category, sku: '', style: '', color: '',
    purchase_uom: p.purchaseUOM, coverage_uom: p.costUOM, cost_uom: p.costUOM, coverage: p.coverage || null,
    roll_width: p.rollWidth ? [p.rollWidth] : null, retail_price: p.retailPrice, company_cost: p.companyCost,
    cut_cost_per_sqyd: p.cutCostPerSqYd ?? null, roll_cost_per_sqyd: p.rollCostPerSqYd ?? null, description: '',
  }));

  // ---------------------------------------------------------- samples --
  const better = S.products.find((p) => p.tier === 'better');
  const sample_checkouts = [{
    id: 'sc-0235', number: T.sample.number, lead_id: T.lead.id, mat_num: better.matNum, product_name: T.sample.productName,
    style: '', color: '', vendor: better.vendor, checkout_date: at(T.sample.checkedOutAt, '11:15'), expected_return: T.sample.expectedReturn,
  }];

  // ------------------------------------------------------ settings ----
  const app_settings = [{
    id: 1,
    company_name: S.shop.name,
    company_email: S.shop.email,
    company_logo_url: null,
    system_labors: S.labor.map((l) => ({ id: l.id, name: l.name, description: l.description || '', uom: l.uom, companyCost: l.companyCost, retailPrice: l.retailPrice })),
    system_supplies: S.supplies.map((s) => ({ id: s.id, name: s.name, unitCost: s.unitCost, uom: s.uom, category: 'Supplies' })),
    system_payment_terms: [...L.DEFAULT_PAYMENT_TERMS],
    system_vendors: [...new Set(S.products.map((p) => p.vendor))].map((name, i) => ({ id: `ven-${i + 1}`, name })),
    system_people_roles: ['Sales Rep', 'Installer', 'Office'],
    system_quote_terms: [], system_invoice_terms: [], system_sales_reps: [],
    quote_defaults: { guidedMode: false },
  }];

  // ------------------------------------------- QT-330, as drafted today --
  // The video starts the moment before Marisol measures: the floor section's three options
  // have no quantities yet (the on-camera "apply job area" fills them). Install & prep and
  // the optional stairs are already measured, exactly as in the dataset.
  const q = T.quote;
  const draftSections = q.sections.map((s, i) => (i === 0 ? { ...s, materials: s.materials.map((m) => ({ ...m, quantity: '' })) } : s));
  const lines = appLines(draftSections);
  const draftMoney = L.computeQuoteTotals({ sections: draftSections, taxRate: q.taxRate, taxExempt: false });
  const rep = repById[q.salesRepId];
  const quotes = [{
    id: q.id, number: q.number, customer_id: null, lead_id: q.leadId, status: 'draft',
    project_type: T.lead.projectType, site_address: q.siteCity, site_address2: '', site_contact: q.customerName,
    job_description: '', doc_name: 'Great room + kitchen',
    payment_terms: q.paymentTerms, tax_rate: q.taxRate, tax_county: q.taxCounty, tax_exempt: false, down_payment_pct: q.downPaymentPct,
    materials: lines.materials, labors: lines.labors, sections: appSections(draftSections.map((s, i) => (i === 0 ? { ...s, kind: 'required' } : s))),
    subtotal: draftMoney.subtotal, tax: draftMoney.tax, total: draftMoney.total,
    enabled_terms: [], notes: [], versions: [], rooms: [], show_breakdown: false, selected_options: null, edit_unlocked: false,
    expiration_date: q.expirationDate, line_items_header: 'Materials & Labor', public_token: null,
    sales_rep_id: rep.id, sales_rep_name: rep.name, sales_rep_email: rep.email,
    created_at: at(q.createdAt, '09:12'),
  }];

  // The shop's history and running work (customers, QT-322…329, WO-319…327, IN-318…324, POs,
  // payments, job costs, tasks, calendar, notes, activity). It tops out at the dataset's
  // counters (last work order WO-327, last invoice IN-324), so the next lead approved on the
  // board still makes WO-328 / IN-325 and QT-330's approval makes WO-330 / IN-330.
  const world = buildWorld({ taxRate: q.taxRate, taxCounty: q.taxCounty });
  quotes.push(...world.quotes);
  leads.push(...world.leads);
  sample_checkouts.push(...world.sample_checkouts);
  // LD-056's CRM notes (the lead detail's Notes tab).
  const ld56 = leads.find((l) => l.id === T.lead.id);
  ld56.notes = [
    { text: 'Met Dev and Anjali at the Home Show. LVP through the great room and kitchen; maybe carpet on the stairs.', date: at(D(-8), '13:40') },
    { text: 'Site survey done: 912 SqFt measured, 13 stair steps. They keep coming back to the Smoked Hickory sample.', date: at(D(-2), '16:05') },
  ];
  // The dashboard: one "Main" dashboard laid out exactly like the app's own starter
  // template (index.html SYSTEM_DEFAULT_DASHBOARDS 'sd-main').
  Object.assign(user_preferences[0], {
    dash_dashboards: [{ id: 'd-film-main', name: 'Main', layout: MAIN_DASH.layout, cols: MAIN_DASH.cols, rows: MAIN_DASH.rows, versions: [], createdAt: at(D(-30)), updatedAt: at(D(-30)) }],
    dash_active_dashboard_id: 'd-film-main',
    dash_custom_layout: MAIN_DASH.layout, dash_custom_cols: MAIN_DASH.cols, dash_custom_rows: MAIN_DASH.rows,
    profile: {},
  });

  const EMPTY = ['customers', 'jobs', 'invoices', 'change_orders', 'tasks', 'task_templates', 'inventory_items', 'job_pos',
    'quote_interactions', 'notes', 'calendar_events', 'job_files', 'projects', 'trash', 'bugs', 'payables', 'bank_accounts',
    'bank_transactions', 'finance_settings', 'recurring_payables', 'receivables', 'job_costs', 'activities', 'messages',
    'call_records', 'quote_chat_messages', 'gcal_external_events'];
  const tables = {
    app_settings, profiles, user_preferences, contractors, leads, product_catalog, sample_checkouts, quotes,
    customers: world.customers, jobs: world.jobs, invoices: world.invoices, job_pos: world.job_pos, job_costs: world.job_costs,
    tasks: world.tasks, calendar_events: world.calendar_events, notes: world.notes, activities: world.activities,
    inventory_items: world.inventory_items, quote_interactions: world.quote_interactions,
  };
  for (const t of EMPTY) if (!tables[t]) tables[t] = [];

  // ------------------------------------- off-camera story events ------
  // Rows the office (or Stripe) writes between the scenes, in app row shape. The harness
  // fills job/invoice ids at run time (the app itself creates WO-330 / IN-330 on camera).
  const dep = T.invoice.payments[0], bal = T.invoice.payments[1];
  const ins = S.installers.find((i) => i.id === T.workOrder.installerId);
  const story = {
    // what the Prasads pick on their phone (the dataset's selection: Better + the stairs)
    pickOneRow: Object.values(q.selection.pickOne)[0], optionalSection: q.selection.optional[0],
    depositPayment: { id: 'ip-330-1', amount: dep.amount, date: dep.date, method: dep.method, note: dep.note, processingFee: dep.processingFee },
    balanceCheck: { amount: bal.amount, date: bal.date, method: 'Check', checkNumber: (bal.note.match(/Check (\d+)/) || [])[1] || '' },
    installDate: T.workOrder.scheduledDate,
    installer: { id: ins.id, name: ins.name },
    // POs as the app's Order Materials writes them; the base is bought as 12 × 16 ft sticks.
    poQty: Object.fromEntries(T.jobCosts.pos.map((p) => [p.matNum, p.qty])),
    poReceivedAt: T.jobCosts.pos[0].receivedAt,
    jobCosts: T.jobCosts.entries.map((e, i) => ({
      id: `jc-film-${i + 1}`, number: e.number, kind: e.kind, category: e.category, description: e.description,
      vendor: e.vendor || '', contractor_id: e.contractorId || null, contractor_name: e.contractorName || '',
      cost_date: e.date, quantity: e.quantity ?? 1, unit_cost: e.unitCost ?? e.amount, amount: e.amount,
      paid: !!e.paid, paid_date: e.paidDate || (e.paid ? e.date : null), method: e.method || '', check_number: '', notes: '',
      file_id: null, status: 'active', created_by_name: S.reps[0].name, created_at: at(e.date, '16:00'),
    })),
    days: Object.fromEntries(['quoteDrafted', 'approved', 'materialsIn', 'install', 'complete', 'balancePaid', 'payout']
      .map((k, i) => [k, [D(0), T.approval.date, T.jobCosts.pos[0].receivedAt, T.workOrder.scheduledDate, T.workOrder.history.find((h) => h.status === 'final_invoice').date, bal.date, T.workOrder.history.find((h) => h.status === 'paid').date][i]])),
  };

  // QT-330 measured and sent (DEMO_TODAY, mid-morning): the dataset's quote exactly — floor
  // section "Pick One" (Good / Better / Best, snapped to whole cartons for 912 SqFt), install
  // & prep, the optional stairs (12' roll cut 14' 6") — with the customer link made. Stored
  // totals are the app's "as sent" figures (default pick, stairs not added). The reference
  // screenshots start from this state; the film shows the measuring itself on camera.
  const sentLines = appLines(q.sections);
  const SENT_AT = at(D(0), '10:05');
  story.quoteSent = {
    ...quotes[0],
    status: 'sent', sent_at: SENT_AT, updated_at: SENT_AT,
    materials: sentLines.materials, labors: sentLines.labors, sections: appSections(q.sections),
    subtotal: q.totalsAtSend.subtotal, tax: q.totalsAtSend.tax, total: q.totalsAtSend.total,
    public_token: 'pinyon-film-qt330-8c1e5a7d0b2f4e6a9d3c',
  };

  // ------------------------------------------------- expected on camera --
  const expected = {
    cartonHint: q.cartonHints[0].text,                               // "39 Cartons = 927.03 SqFt"
    cartonHints: q.cartonHints.map((h) => h.text),
    applyToast: q.measure.floor.toast,                               // "✓ Applied 912 SqFt to 3 materials"
    jobArea: q.jobArea,
    approvalToast: T.approval.toast,
    workOrderNumber: T.workOrder.number, invoiceNumber: T.invoice.number,
    invoice: { subtotal: T.invoice.subtotal, tax: T.invoice.tax, total: T.invoice.total },
    deposit: q.deposit,
    // the next lead approved on the board: numbered from the counters (WO-328 / IN-325)
    boardApproval: { workOrder: `WO-${String(S.counters.job + 1).padStart(3, '0')}`, invoice: `IN-${String(S.counters.invoice + 1).padStart(3, '0')}` },
    jobCosting: { estimate: L.round2(T.jobCosts.finance.estimate), actual: L.round2(T.jobCosts.finance.actual), variance: T.jobCosts.variance.text, profit: L.round2(T.jobCosts.finance.profit) },
    quoteSent: { subtotal: q.totalsAtSend.subtotal, tax: q.totalsAtSend.tax, total: q.totalsAtSend.total },
    quoteApprovedTotal: q.totals.total,
  };

  return { seedId: `sample-data@${S.DEMO_TODAY}`, demoToday: S.DEMO_TODAY, session: SESSION_USER, tables, story, expected };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fx = buildFixture();
  const out = args.out ? path.resolve(String(args.out)) : null;
  const json = JSON.stringify(fx, null, 1);
  if (out) { fs.writeFileSync(out, json); console.log(`wrote ${out}`); } else process.stdout.write(json + '\n');
}
