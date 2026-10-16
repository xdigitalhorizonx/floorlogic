/**
 * "Run the install" module data — WO-330 as src/data/sample-data.ts made it (approval of QT-330
 * on the dataset's D+1), with the display bits the work-order screen shows that the dataset keeps
 * elsewhere: each line's vendor, IN-330's card deposit (paid on the invoice's link the same day),
 * the installers, and where the purchase-order numbers carry on from (the dataset's JPO-1193 is
 * the first one Finish makes).
 */
import { installers, products, reps, thread } from '../sample-data';
import { docNumberSuffix, jobFinance, num, paymentTypeLabel } from '../../lib/logic';
import { initialsOf } from './quote';
import type { WomData } from '../../islands/wo-button';

const wo = thread.workOrder;
const inv = thread.invoice;
const vendorOf = (matNum: string | undefined) => products.find((p) => p.matNum === matNum)?.vendor ?? '';
// The deposit the customer paid by card on IN-330's link the day it was made (the dataset's first payment).
const deposit = inv.payments[0]!;
// Finish numbers each new PO after the last one in the system: the dataset's first is JPO-1193.
const firstPO = Math.min(...thread.jobCosts.pos.map((p) => docNumberSuffix(p.number)));

export const workOrderData: WomData = {
  wo: wo.number,
  customer: wo.customerName,
  initials: initialsOf(wo.customerName),
  phone: thread.lead.phone,
  site: wo.city,
  issued: wo.createdAt,
  today: thread.approval.date,
  rep: reps.find((r) => r.id === wo.salesRepId)?.name ?? '',
  invoice: {
    number: inv.number,
    total: inv.total,
    payments: [{ amount: deposit.amount, method: deposit.method ?? 'Credit Card (Stripe)', date: deposit.date ?? inv.createdAt, label: paymentTypeLabel(deposit) }],
  },
  people: installers.map((p) => ({ id: p.id, name: p.name, trade: p.trade })),
  lines: wo.materials.map((m) => ({
    name: m.name, matNum: m.matNum ?? '', vendor: vendorOf(m.matNum), uom: m.costUOM ?? '', qty: num(m.quantity), cost: num(m.companyCost),
    purchaseUOM: m.purchaseUOM ?? '', coveragePerUOM: num(m.coveragePerUOM), costUOM: m.costUOM ?? '', coverageUOM: m.coverageUOM ?? '',
    ...(m.rollWidth ? { rollWidth: m.rollWidth } : {}), ...(m.lengthFt != null ? { lengthFt: m.lengthFt } : {}), ...(m.lengthIn != null ? { lengthIn: m.lengthIn } : {}),
  })),
  // `_techJobLaborCost` (main L17853) = the work order's quoted labor — the payout window's "Est. Labor Owed".
  laborOwed: jobFinance({ materials: wo.materials, labors: wo.labors }).laborQuoted,
  poCounter: firstPO - 1,
  start: wo.history[0]!.status,
};
