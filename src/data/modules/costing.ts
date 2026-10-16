/**
 * "Know the profit" module data — WO-330's Job Costing page on the morning Ruben Ortiz is paid out
 * (the dataset's D+12, Mon Oct 26): IN-330 was paid in full on D+9, so the work order waits at
 * Ready to be Paid; the four POs and the supplies run (JC-015) are on the books, the installer's
 * payout (JC-016) is not yet — that is the cost the visitor records. Every figure is the dataset's
 * (src/data/sample-data.ts → thread.jobCosts); nothing here is typed in by hand.
 */
import { installers, products, reps, supplies, thread } from '../sample-data';
import type { JcmData, JcmEntry } from '../../islands/job-costing';

const wo = thread.workOrder;
const inv = thread.invoice;
const jc = thread.jobCosts;
const rep = reps.find((r) => r.id === wo.salesRepId)!;
const crew = installers.find((i) => i.id === wo.installerId)!;
const payout = jc.entries.find((e) => e.kind === 'contractor')!;
const paidOut = wo.history.find((h) => h.status === 'paid')!;

type DatasetEntry = (typeof jc.entries)[number];
const toEntry = (e: DatasetEntry): JcmEntry => ({
  id: (e.number ?? '').toLowerCase(),
  number: e.number ?? '',
  kind: e.kind,
  category: e.category ?? '',
  description: e.description ?? '',
  amount: e.amount ?? 0,
  quantity: e.quantity ?? 1,
  unitCost: e.unitCost ?? 0,
  paid: !!e.paid,
  // saveJobCost stamps the paid date from the cost date when none is given.
  paidDate: e.paid ? (e.paidDate ?? e.date) : null,
  method: e.method ?? '',
  checkNumber: '',
  date: e.date,
  contractorId: e.contractorId ?? '',
  contractorName: e.contractorName ?? '',
  vendor: e.vendor ?? '',
  notes: '',
});

export const costingData: JcmData = {
  wo: wo.number,
  customer: wo.customerName,
  site: wo.city,
  status: 'ready_to_be_paid',
  today: paidOut.date,
  rep: { name: rep.name, rate: rep.commissionRate },
  installer: { id: crew.id, name: crew.name },
  people: installers.map((i) => ({ id: i.id, name: i.name })),
  vendors: [...new Set([...products.map((p) => p.vendor), ...jc.pos.map((p) => p.vendor)])].sort((a, b) => a.localeCompare(b)),
  supplies: supplies.map((x) => ({ id: x.id, name: x.name, unitCost: x.unitCost, uom: x.uom })),
  materials: wo.materials.map((m) => ({ quantity: m.quantity, companyCost: m.companyCost, retailPrice: m.retailPrice })),
  labors: wo.labors.map((l) => ({ quantity: l.quantity, companyCost: l.companyCost, retailPrice: l.retailPrice })),
  invoice: { number: inv.number, subtotal: inv.subtotal, tax: inv.tax, total: inv.total, status: inv.status, payments: inv.payments },
  // The app lists a PO by its PO # (poNumber, typed in Order Materials) before its JPO number; the
  // Order Materials window fills PO # with "WO-330-1"… line by line (orderMaterialsLineDefaults),
  // and the dataset's POs follow the work order's lines in order.
  pos: jc.pos.map((p, i) => ({
    number: p.number, poNumber: `${wo.number}-${i + 1}`, productName: p.productName, vendor: p.vendor,
    totalCost: p.totalCost, freight: p.freight, status: p.status,
  })),
  entries: jc.entries.filter((e) => e !== payout).map(toEntry),
  draft: toEntry(payout),
};
