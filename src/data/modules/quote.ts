/**
 * "Quote a job" module data — QT-330 exactly as src/data/sample-data.ts has it, plus the
 * display bits the builder shows that the dataset does not carry on its quote lines
 * (each product's category and vendor, the sections' 📐 Job Area bars) and the sample
 * catalog that "+ Add line item" searches. Nothing here is typed in by hand: every line,
 * price and date comes from the dataset.
 */
import { counters, demoNowMs, labor, products, reps, shop, thread } from '../sample-data';
import type { QmSeed, QmSection } from '../../islands/quote-demo';

const q = thread.quote;
const lead = thread.lead;
const rep = reps.find((r) => r.id === q.salesRepId) ?? reps[0]!;

/** `_custInitials` (main L23224): the first letters of the first and last words. */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/);
  return w.length === 1 ? w[0]!.slice(0, 2).toUpperCase() : (w[0]![0]! + w[w.length - 1]![0]!).toUpperCase();
}

const byMat = new Map(products.map((p) => [p.matNum, p]));

// The dataset applied the 912 SqFt job area to the floor section and to Install & prep
// (thread.quote.measure), so those two sections open with their Job Area bar showing it.
const areaApplied = new Set([0, 1]);

const sections: QmSection[] = q.sections.map((s, i) => ({
  ...s,
  materials: s.materials.map((m) => {
    const p = m.matNum ? byMat.get(m.matNum) : undefined;
    return { ...m, ...(p ? { category: p.category, vendor: p.vendor } : {}) };
  }),
  labors: s.labors.map((l) => ({ ...l })),
  area: areaApplied.has(i) ? { sqft: q.jobArea.value, sqyd: '' } : null,
}));

const approveDay = thread.approval.date;

export const quoteSeed: QmSeed = {
  issued: q.createdAt,
  approveDay,
  nowMs: demoNowMs(approveDay),
  quote: {
    number: q.number,
    createdAt: q.createdAt,
    expirationDate: q.expirationDate,
    taxRate: q.taxRate,
    taxCounty: q.taxCounty,
    taxExempt: q.taxExempt,
    paymentTerms: q.paymentTerms,
    downPaymentPct: q.downPaymentPct,
    sections,
  },
  customer: { name: lead.name, initials: initialsOf(lead.name), phone: lead.phone, email: lead.email ?? '', city: lead.city },
  lead: { id: lead.id, number: lead.number, name: lead.name, phone: lead.phone, email: lead.email, city: lead.city, source: lead.source, salesRepId: lead.salesRepId, type: lead.type },
  rep: { id: rep.id, name: rep.name, email: rep.email },
  shop: { name: shop.name, address: shop.address, city: shop.city, phone: shop.phone, email: shop.email },
  counters: { job: counters.job, invoice: counters.invoice },
  catalog: {
    products: products.map((p) => ({
      id: p.id, name: p.name, matNum: p.matNum, category: p.category, vendor: p.vendor, purchaseUOM: p.purchaseUOM, costUOM: p.costUOM,
      coverage: p.coverage, ...(p.rollWidth ? { rollWidth: p.rollWidth } : {}), companyCost: p.companyCost, retailPrice: p.retailPrice,
    })),
    labor: labor.map((l) => ({ id: l.id, name: l.name, ...(l.description ? { description: l.description } : {}), uom: l.uom, companyCost: l.companyCost, retailPrice: l.retailPrice })),
  },
};
