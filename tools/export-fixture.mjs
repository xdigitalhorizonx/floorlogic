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
//   tables   rows that exist at the start of the story (DEMO_TODAY, before the video's actions)
//   story    rows for things that happen off-camera between scenes (deposit paid online,
//            purchase orders, job costs), in app row shape
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
function appLines(sections) {
  const materials = [], labors = [];
  sections.forEach((sec, sIdx) => {
    sec.materials.forEach((m, i) => {
      const qty = m.quantity === '' || m.quantity == null ? '' : Number(m.quantity);
      const q = qty === '' ? 0 : qty;
      materials.push({
        linkId: `lk-film-${sIdx}-m${i}`, item: m.name, productName: m.name, style: m.style || '', color: '', vendor: S.products.find((p) => p.matNum === m.matNum)?.vendor || '',
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
        linkId: `lk-film-${sIdx}-l${i}`, name: l.name, productName: l.name, description: l.description || '', uom: l.uom,
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

export function buildFixture() {
  // ----------------------------------------------------------- people --
  const contractors = [
    ...S.reps.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: '', role: 'Sales Rep', trade: '', active: true, commission_rate: r.commissionRate, user_id: r.id === 'ct-rep-1' ? SESSION_USER.id : null })),
    ...S.installers.map((i) => ({ id: i.id, name: i.name, email: '', phone: '', role: 'Installer', trade: 'Installer', active: true })),
  ];
  const profiles = [{ id: SESSION_USER.id, email: SESSION_USER.email, name: SESSION_USER.name, role: 'admin', active: true }];
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

  const EMPTY = ['customers', 'jobs', 'invoices', 'change_orders', 'tasks', 'task_templates', 'inventory_items', 'job_pos',
    'quote_interactions', 'notes', 'calendar_events', 'job_files', 'projects', 'trash', 'bugs', 'payables', 'bank_accounts',
    'bank_transactions', 'finance_settings', 'recurring_payables', 'receivables', 'job_costs', 'activities', 'messages',
    'call_records', 'quote_chat_messages'];
  // Counter anchors. The dataset's shop already has history (its `counters`: last work order
  // WO-327, last invoice IN-324). The app numbers new documents from the highest existing
  // number, so the history is represented by those two closed documents — nothing else.
  const jobs = [{
    id: 'wo-327', number: `WO-${String(S.counters.job).padStart(3, '0')}`, customer_id: null, status: 'paid', project_type: '', site_address: '',
    job_description: '', materials: [], labors: [], schedule: [], payments: [], notes: [], versions: [], tax_rate: q.taxRate,
    created_at: at(D(-30)), completed_at: at(D(-21), '15:00'), paid_at: at(D(-18), '11:00'),
  }];
  const invoices = [{
    id: 'in-324', number: `IN-${String(S.counters.invoice).padStart(3, '0')}`, customer_id: null, status: 'paid', site_address: '',
    job_description: '', payment_terms: 'Due on Receipt', tax_rate: q.taxRate, materials: [], labors: [], subtotal: 0, tax: 0, total: 0,
    amount_paid: 0, payments: [], line_items: [], line_items_header: 'Materials & Labor', enabled_terms: [], notes: [], sections: [],
    versions: [], stripe_payment_intent_ids: [], due_date: D(-20), created_at: at(D(-30)),
  }];
  const tables = { app_settings, profiles, user_preferences, contractors, leads, product_catalog, sample_checkouts, quotes, jobs, invoices };
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
  };

  return { seedId: `sample-data@${S.DEMO_TODAY}`, demoToday: S.DEMO_TODAY, session: SESSION_USER, tables, story, expected };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fx = buildFixture();
  const out = args.out ? path.resolve(String(args.out)) : null;
  const json = JSON.stringify(fx, null, 1);
  if (out) { fs.writeFileSync(out, json); console.log(`wrote ${out}`); } else process.stdout.write(json + '\n');
}
