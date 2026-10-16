/**
 * "Get paid" module data — IN-330 exactly as src/data/sample-data.ts made it (approval of QT-330 on
 * the dataset's D+1): its sections and lines, money, terms and dates. The module opens on the
 * invoice the day it was made, before anything was paid; the visitor takes the payments.
 *
 * The invoice keeps the quote's sections (approveQuote copies `q.sections`, main L12413), so the
 * lines are grouped the way the app's invoice screen groups them. Line order and amounts are the
 * dataset's (`chosenItems` — the same call approval made).
 */
import { reps, shop, thread } from '../sample-data';
import { DEFAULT_PAYMENT_TERMS, chosenItems, laborLineTotal, laborQty, materialLineTotal, num } from '../../lib/logic';
import { initialsOf } from './quote';
import type { IvmData, IvmLine, IvmSection } from '../../islands/invoice-terms';

const inv = thread.invoice;
const q = thread.quote;
const lead = thread.lead;
const rep = reps.find((r) => r.id === q.salesRepId) ?? reps[0]!;
const chosen = chosenItems(q.sections, q.selection);

const sections: IvmSection[] = q.sections.map((s, i) => {
  const mats: IvmLine[] = chosen.materials.filter((c) => c.sectionIndex === i).map(({ line: m }) => ({
    kind: 'mat',
    name: m.name,
    desc: m.style ?? '',
    qty: num(m.quantity),
    // The invoice screen's UOM select defaults to the cost UOM; the customer page prints the coverage UOM.
    uom: m.costUOM || m.coverageUOM || m.purchaseUOM || '',
    pUom: m.coverageUOM || m.purchaseUOM || '',
    rate: num(m.retailPrice),
    amount: materialLineTotal(m),
  }));
  const labs: IvmLine[] = chosen.labors.filter((c) => c.sectionIndex === i).map(({ line: l }) => ({
    kind: 'lab',
    name: l.name,
    desc: l.description ?? '',
    qty: laborQty(l),
    uom: l.uom,
    pUom: l.uom,
    rate: num(l.retailPrice),
    amount: laborLineTotal(l),
  }));
  const lines = [...mats, ...labs];
  return {
    title: s.title,
    kind: s.kind,
    lines,
    materials: mats.reduce((a, l) => a + l.amount, 0),
    labor: labs.reduce((a, l) => a + l.amount, 0),
  };
}).filter((s) => s.lines.length > 0);

export const invoiceData: IvmData = {
  number: inv.number,
  customer: inv.customerName,
  initials: initialsOf(inv.customerName),
  phone: lead.phone,
  email: lead.email ?? '',
  city: lead.city,
  rep: { name: rep.name, email: rep.email },
  shop: { name: shop.name, address: shop.address, city: shop.city, phone: shop.phone, email: shop.email },
  createdAt: inv.createdAt,
  dueDate: inv.dueDate,
  materials: inv.raw.materials,
  labor: inv.raw.subtotal - inv.raw.materials,
  subtotal: inv.subtotal,
  tax: inv.tax,
  taxRate: inv.taxRate,
  taxCounty: q.taxCounty,
  total: inv.total,
  rawTotal: inv.raw.total,
  terms: inv.paymentTerms,
  pct: inv.downPaymentPct,
  termsOptions: [...DEFAULT_PAYMENT_TERMS],
  sections,
};
