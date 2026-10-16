import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as sample from '../../src/data/sample-data';
import {
  appSnapToCartons, augustSnapToCartons, cartonCount, computeDueNow, fmtMoney, LEAD_STATUSES, snapToCartons, WO_SEQUENCE,
} from '../../src/lib/logic';

const { DEMO_TODAY, demoDate, shop, reps, installers, leads, incomingLeads, counters, products, labor, thread } = sample;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = 'C:/dev/floorlogicdemo/scripts/demo-seed.mjs';

// The demo seed's ten leads (demo-seed.mjs L171-180).
const SEED_LEADS = [
  ['LD-051', 'Hannah Brooks', 'LVP — main floor (~900 SqFt)', 'new', 5200, 'Phone', 'ct-rep-2'],
  ['LD-052', 'Tom & Reyna Castillo', 'Carpet — whole house', 'new', 12400, 'Website', 'ct-rep-1'],
  ['LD-053', 'Vista Ridge Dental', 'Commercial LVT — operatories', 'new', 21000, 'Referral', 'ct-rep-1'],
  ['LD-054', 'Marcy Templeton', 'Hardwood — bedrooms', 'site_survey_scheduled', 7800, 'Google', 'ct-rep-2'],
  ['LD-055', 'Orchard House Senior Living', 'Carpet tile — corridors (3 floors)', 'site_survey_scheduled', 46500, 'Referral', 'ct-rep-1'],
  ['LD-056', 'Dev & Anjali Prasad', 'LVP — great room + kitchen', 'send_quote', 9600, 'Home Show', 'ct-rep-2'],
  ['LD-057', 'Copper Canyon Coffee', 'LVT — dining floor', 'send_quote', 6400, 'Facebook', 'ct-rep-1'],
  ['LD-058', 'Bill Hargrove', 'Laminate — rental refresh', 'follow_up', 3900, 'Google', 'ct-rep-2'],
  ['LD-059', 'Meadowbrook Villas HOA', 'Carpet — common areas', 'follow_up', 28800, 'Referral', 'ct-rep-1'],
  ['LD-060', 'Janet Okafor', 'LVP — kitchen + baths', 'approved', 8900, 'Referral', 'ct-rep-2'],
] as const;

const BRANDS = /coretec|shaw|mohawk|mannington|bruce|daltile|karastan|interface|armstrong|pergo|lifeproof|metrie|future foam|anso|revwood|floorte|adura|stainmaster|tarkett|dreamweaver/i;

describe('fictional shop + people', () => {
  it('header says it is fictional', () => {
    const src = readFileSync(path.join(HERE, '../../src/data/sample-data.ts'), 'utf8');
    expect(src).toContain('Fictional sample data — not real customers or vendor pricing.');
  });

  it('shop, reps, installers', () => {
    expect(shop).toEqual({ name: 'Pinyon Flooring Co.', address: '4120 Sierra Commerce Way', city: 'Reno, NV 89502', phone: '(775) 555-0140', email: 'office@pinyon.test' });
    expect(reps.map((r) => [r.id, r.name, r.initials])).toEqual([['ct-rep-1', 'Dale Whitaker', 'DW'], ['ct-rep-2', 'Marisol Vega', 'MV']]);
    expect(installers).toEqual([{ id: 'ct-ins-1', name: 'Ruben Ortiz', trade: 'Installer' }, { id: 'ct-ins-2', name: 'Tanner Cole', trade: 'Installer' }]);
  });

  it('every lead: 555 phone, .test email, city only (no street address)', () => {
    for (const l of [...leads, ...incomingLeads]) {
      expect(l.phone).toMatch(/^\(775\) 555-\d{4}$/);
      expect(l.email).toMatch(/@example\.test$/);
      expect(l.city).toMatch(/^[A-Za-z .]+, NV$/);
      expect(Object.keys(l)).not.toContain('address');
    }
    const phones = [...leads, ...incomingLeads].map((l) => l.phone);
    expect(new Set(phones).size).toBe(phones.length);
  });

  it('catalog is brand-free', () => {
    for (const p of products) {
      expect(p.name).not.toMatch(BRANDS);
      expect(p.vendor).not.toMatch(BRANDS);
    }
    for (const l of labor) expect(l.name).not.toMatch(BRANDS);
  });

  it('catalog prices as briefed', () => {
    const byName = Object.fromEntries(products.map((p) => [p.name, p]));
    expect(byName['Summit Rigid Core LVP — Driftwood Oak']).toMatchObject({ coverage: 23.77, companyCost: 2.74, retailPrice: 4.55 });
    expect(byName['Summit XL Rigid Core — Smoked Hickory']).toMatchObject({ coverage: 22.32, companyCost: 2.95, retailPrice: 4.9 });
    expect(byName['Heritage Engineered Oak 7in — Natural']).toMatchObject({ coverage: 19.69, companyCost: 4.55, retailPrice: 7.4 });
    expect(byName['Sandbar Nylon Broadloom']).toMatchObject({ rollWidth: 12, cutCostPerSqYd: 12.85, rollCostPerSqYd: 11.2, retailPrice: 22.4 });
    expect(byName['8 lb Rebond Pad']).toMatchObject({ companyCost: 2.1, retailPrice: 4.2 });
    expect(byName['Primed MDF Base 3¼ in']).toMatchObject({ companyCost: 0.94, retailPrice: 1.85, costUOM: 'Linear Ft' });
    const lab = Object.fromEntries(labor.map((l) => [l.name, l]));
    expect(lab['LVP Installation']).toMatchObject({ companyCost: 1.35, retailPrice: 2.25, uom: 'SqFt' });
    expect(lab['Demo & haul-off — carpet']).toMatchObject({ companyCost: 0.4, retailPrice: 0.65, uom: 'SqFt' });
    expect(lab['Carpet install with pad']).toMatchObject({ uom: 'SqYd' });
    expect(lab['Stair install']).toMatchObject({ uom: 'Each', description: 'Per step' });
  });
});

describe('leads mirror the demo seed', () => {
  it('LD-051…LD-060: names, project types, statuses, values, sources, reps', () => {
    expect(leads.map((l) => [l.number, l.name, l.projectType, l.status, l.estimatedValue, l.source, l.salesRepId])).toEqual(SEED_LEADS.map((r) => [...r]));
  });

  it.runIf(existsSync(SEED))('…and agree with demo-seed.mjs itself', () => {
    const seed = readFileSync(SEED, 'utf8');
    const rows = [...seed.matchAll(/lead\('ld-\d+', '(LD-\d+)', '([^']+)', '\([^)]+\) [^']+', '[^']*', '([^']+)', '([a-z_]+)', (\d+), '([^']+)', '(ct-rep-\d)'/g)]
      .map((m) => [m[1], m[2], m[3], m[4], Number(m[5]), m[6], m[7]]);
    expect(rows).toEqual(SEED_LEADS.map((r) => [...r]));
  });

  it('dates hang off DEMO_TODAY', () => {
    expect(DEMO_TODAY).toBe('2026-10-14');
    expect(demoDate(1)).toBe('2026-10-15');
    const l = leads.find((x) => x.number === 'LD-056')!;
    expect(l).toMatchObject({ createdAt: '2026-10-06', siteSurveyDate: '2026-10-12', followUpDate: '2026-10-15', quoteCount: 1, sampleCount: 1, type: 'Retail', city: 'Reno, NV' });
    expect(leads.find((x) => x.number === 'LD-051')!.stageAgeDays).toBe(0);
    expect(leads.filter((x) => x.number !== 'LD-051').every((x) => x.stageAgeDays === 1)).toBe(true);
    for (const x of leads) expect(LEAD_STATUSES).toContain(x.status);
  });

  it('counters continue from the seed', () => {
    expect(counters).toEqual({ lead: 60, quote: 330, job: 327, invoice: 324 });
  });

  it('incoming leads: 8 new leads LD-061…LD-068 across the five towns, mixed types and sources', () => {
    expect(incomingLeads.map((l) => l.number)).toEqual(['LD-061', 'LD-062', 'LD-063', 'LD-064', 'LD-065', 'LD-066', 'LD-067', 'LD-068']);
    expect(incomingLeads.every((l) => l.status === 'new' && l.stageAgeDays === 0 && l.createdAt === DEMO_TODAY)).toBe(true);
    expect(new Set(incomingLeads.map((l) => l.city))).toEqual(new Set(['Reno, NV', 'Sparks, NV', 'Carson City, NV', 'Minden, NV', 'Gardnerville, NV']));
    expect(new Set(incomingLeads.map((l) => l.source))).toEqual(new Set(['Phone', 'Website', 'Google', 'Referral', 'Facebook', 'Home Show']));
    expect(incomingLeads.some((l) => l.type === 'Retail') && incomingLeads.some((l) => l.type !== 'Retail')).toBe(true);
    expect(incomingLeads.map((l) => l.projectType)).toEqual(expect.arrayContaining(['Tile — two baths', 'LVP — basement', 'Carpet — stairs + hall']));
  });
});

describe('carton sizes keep app and site in agreement for every sample quantity', () => {
  const cartonLines = [...thread.quote.sections.flatMap((s) => s.materials), ...thread.workOrder.materials].filter((m) => Number(m.coveragePerUOM) > 1);

  it('snap, hint count and re-entry agree — in the current app and even in the August one', () => {
    expect(cartonLines.length).toBeGreaterThanOrEqual(4);
    for (const m of cartonLines) {
      const q = Number(m.quantity);
      const cov = Number(m.coveragePerUOM);
      expect(Math.ceil(q / cov)).toBe(cartonCount(q, cov)); // August app hint vs site hint
      expect(augustSnapToCartons(q, cov)).toEqual(snapToCartons(q, cov)); // re-typing the quantity, August rule
      expect(appSnapToCartons(q, cov)).toEqual(snapToCartons(q, cov)); // current app rule
      expect(snapToCartons(q, cov)!.quantity).toBe(q); // already whole cartons
    }
    // the sample's job area, applied to every carton product
    for (const p of products.filter((x) => x.coverage > 1)) {
      expect(augustSnapToCartons(thread.quote.jobArea.value, p.coverage)).toEqual(snapToCartons(thread.quote.jobArea.value, p.coverage));
    }
  });

  it('the briefed 22.31 for Better would have hit the August bug (why it is 22.32); the current app is fixed', () => {
    const s = snapToCartons(912, 22.31)!;
    expect(s).toEqual({ cartons: 41, quantity: 914.71 });
    expect(Math.ceil(s.quantity / 22.31)).toBe(42); // the August hint read "42 Cartons = 914.71 SqFt"
    expect(augustSnapToCartons(s.quantity, 22.31)!.quantity).toBe(937.02);
    expect(appSnapToCartons(s.quantity, 22.31)!.quantity).toBe(914.71);
  });
});

describe('the thread: LD-056 → QT-330 → WO-330 / IN-330 → job costing', () => {
  const q = thread.quote;

  it('quote measured at 912 SqFt', () => {
    expect(q.number).toBe('QT-330');
    expect(q.sections.map((s) => [s.title, s.kind])).toEqual([['Great room + kitchen — LVP', 'pickOne'], ['Install & prep', 'required'], ['Stairs — carpet', 'optional']]);
    expect(q.sections[0]!.materials.map((m) => m.quantity)).toEqual([927.03, 915.12, 925.43]);
    expect(q.cartonHints.map((h) => h?.text)).toEqual(['39 Cartons = 927.03 SqFt', '41 Cartons = 915.12 SqFt', '47 Cartons = 925.43 SqFt']);
    expect(q.sections[1]!.labors.map((l) => [l.name, l.quantity])).toEqual([['LVP Installation', 912], ['Demo & haul-off — carpet', 912]]);
    expect(q.sections[1]!.materials.map((m) => [m.name, m.quantity])).toEqual([['Primed MDF Base 3¼ in', 180]]);
    expect(q.sections[2]!.materials.map((m) => m.quantity)).toEqual([19.33, 19.33]);
    expect(q.sections[2]!.labors.map((l) => [l.name, l.quantity])).toEqual([['Stair install', 13]]);
    expect(q.measure.floor.toast).toBe('✓ Applied 912 SqFt to 3 materials');
    expect(q.measure.install.toast).toBe('✓ Applied 912 SqFt to 2 labor items');
    expect(q.roundLaborExample.roundLabor).toEqual({ applied: 912, maxMat: 927.03, uom: 'SqFt' });
  });

  it('Washoe tax on materials only, 50% deposit, 50/50 terms', () => {
    expect([q.taxRate, q.taxCounty, q.totals.taxLabel]).toEqual([0.08265, 'Washoe County', 'Tax (8.265%)']);
    expect(q.paymentTerms).toBe('50% Deposit / 50% on Completion');
    expect(q.totalsAtSend).toMatchObject({ subtotal: 7195.79, tax: 376.14, total: 7571.93 });
    expect(q.depositAtSend).toBe(3785.96);
    expect(q.selection).toEqual({ pickOne: { 0: 'mat-1' }, optional: [2] });
    expect(q.totals).toMatchObject({ materials: 5331.27, labor: 2852.8, subtotal: 8184.07, tax: 440.63, total: 8624.7 });
    expect(q.deposit).toBe(4312.35);
    expect(q.depositLabel).toBe('→ $4312.35 due upfront');
  });

  it('displayed figures add up', () => {
    for (const t of [q.totalsAtSend, q.totals]) {
      expect(Math.round((t.materials + t.labor) * 100)).toBe(Math.round(t.subtotal * 100));
      expect(Math.round((t.subtotal + t.tax) * 100)).toBe(Math.round(t.total * 100));
    }
  });

  it('sample is rounding-proof: the app’s screens (unrounded, toLocaleString) show the same cents', () => {
    for (const t of [q.totalsAtSend, q.totals]) {
      for (const k of ['materials', 'labor', 'subtotal', 'tax', 'total'] as const) expect(fmtMoney(t.raw[k]), k).toBe(fmtMoney(t[k]));
    }
    for (const s of q.totals.sections) for (const r of s.rows) expect(fmtMoney(r.total)).toBe(fmtMoney(Math.round(r.total * 100) / 100));
  });

  it('approval makes WO-330 and IN-330 and moves the counters', () => {
    expect(thread.approval.toast).toBe('Quote QT-330 approved! Work Order WO-330 & Invoice IN-330 created.');
    expect(thread.approval.counters).toEqual({ lead: 60, quote: 330, job: 330, invoice: 330 });
    expect(thread.workOrder.number).toBe('WO-330');
    expect(thread.invoice.number).toBe('IN-330');
    expect(thread.workOrder.materials.map((m) => m.name)).toEqual(['Summit XL Rigid Core — Smoked Hickory', 'Primed MDF Base 3¼ in', 'Sandbar Nylon Broadloom', '8 lb Rebond Pad']);
  });

  it('invoice: deposit by card, balance by check, paid in full', () => {
    const inv = thread.invoice;
    expect([inv.subtotal, inv.tax, inv.total]).toEqual([8184.07, 440.63, 8624.7]);
    expect(inv.payments.map((p) => [p.amount, p.method, p.processingFee ?? null])).toEqual([[4312.35, 'Credit Card (Stripe)', 125.36], [4312.35, 'Check', null]]);
    expect(inv.status).toBe('paid');
    expect(inv.dueNow.map((s) => [s.at, s.due.dueNow, s.due.basis, s.view.kind, s.status])).toEqual([
      ['Approved', 4312.35, 'deposit', 'due', 'unpaid'],
      ['Deposit paid', 0, 'deposit', 'none', 'deposit'],
      ['Marked final', 4312.35, 'final', 'due', 'deposit'],
      ['Paid in full', 0, 'final', 'paid', 'paid'],
    ]);
  });

  it('the unrounded invoice total gives the same due-now amounts (rounding-proof sample)', () => {
    const inv = thread.invoice;
    const row = { down_payment_pct: 50, payment_terms: inv.paymentTerms, created_at: inv.createdAt };
    const now = sample.demoNowMs(inv.createdAt);
    for (const pays of [[], [inv.payments[0]!]]) {
      for (const final of [false, true]) {
        expect(computeDueNow({ ...row, total: inv.raw.total, payments: pays, final_invoice: final }, now).dueNow)
          .toBe(computeDueNow({ ...row, total: inv.total, payments: pays, final_invoice: final }, now).dueNow);
      }
    }
  });

  it('work order walks every stage, ending Paid', () => {
    // Ordering every line at once skips Materials Ordered (straight to Ready to Schedule), as the October app does.
    expect(thread.workOrder.history.map((h) => h.status)).toEqual(WO_SEQUENCE.filter((s) => s !== 'materials_ordered'));
    expect(thread.workOrder.scheduledEndDate).toBe('2026-10-22');
    expect(thread.workOrder.status).toBe('paid');
    expect(thread.workOrder.installerId).toBe('ct-ins-1');
    expect(thread.workOrder.history[0]!.note).toBe('Quote QT-330 approved! Work Order WO-330 & Invoice IN-330 created.');
  });

  it('job costing: estimate vs actual tells a real story', () => {
    const f = thread.jobCosts.finance;
    expect(fmtMoney(f.matQuoted)).toBe('$3,157.79');
    expect(fmtMoney(f.laborQuoted)).toBe('$1,726.00');
    expect(fmtMoney(f.estimate)).toBe('$4,883.79');
    expect(thread.jobCosts.pos.map((p) => [p.number, p.totalCost, p.freight])).toEqual([['JPO-1193', 2699.6, 0], ['JPO-1194', 180.48, 45], ['JPO-1195', 248.39, 0], ['JPO-1196', 40.59, 0]]);
    expect(fmtMoney(f.matCost)).toBe('$3,214.06'); // POs + the pallet freight on JPO-1194
    expect(f.laborCost).toBe(1690); // Ruben Ortiz
    expect(f.otherCost).toBe(43.5); // transition strips
    expect(f.feeCost).toBe(125.36); // deposit paid by card
    expect(fmtMoney(f.actual)).toBe('$5,072.92');
    expect(thread.jobCosts.variance).toMatchObject({ text: '+$189.13', label: 'over estimate', tone: 'red' });
    expect(f.revenue).toBe(8184.07);
    expect(f.tax).toBe(440.63);
    expect(fmtMoney(f.commission)).toBe('$248.89');
    expect(fmtMoney(f.profit)).toBe('$2,862.26');
    expect(fmtMoney(f.preCommProfit)).toBe('$3,111.15');
    // margin is taken before commission in the October app (it read 35.0% after commission in August)
    expect(f.margin.toFixed(1)).toBe('38.0');
    expect(((f.profit / f.revenue) * 100).toFixed(1)).toBe('35.0');
    // revenue − cost − commission = profit, to the cent, as displayed
    expect(Math.round((f.revenue - f.actual) * 100) - Math.round(f.commission * 100)).toBe(Math.round(f.profit * 100));
  });

  it('exports the names the site modules import', () => {
    expect(Object.keys(thread).sort()).toEqual(['approval', 'invoice', 'jobCosts', 'lead', 'quote', 'sample', 'workOrder']);
    expect(thread.lead.number).toBe('LD-056');
    for (const k of ['DEMO_TODAY', 'demoDate', 'demoNowMs', 'shop', 'reps', 'installers', 'leads', 'incomingLeads', 'counters', 'products', 'labor', 'supplies', 'thread']) {
      expect(sample).toHaveProperty(k);
    }
  });
});
