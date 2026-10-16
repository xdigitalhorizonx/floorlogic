import { describe, expect, it } from 'vitest';
import {
  approveQuote, approveQuoteDialog, approveQuoteGuard, chosenItems, chosenRowKey, computeQuoteTotals, defaultRowKey, laborLineTotal, materialLineTotal, nextQuoteNumber,
  storedQuoteTotals, type QuoteLabor, type QuoteMaterial, type QuoteSection,
} from '../../src/lib/logic';

const mat = (name: string, quantity: number | '', retailPrice: number, companyCost = 0): QuoteMaterial => ({ name, quantity, retailPrice, companyCost });
const lab = (name: string, quantity: number | '', retailPrice: number, companyCost = 0): QuoteLabor => ({ name, uom: 'SqFt', quantity, retailPrice, companyCost });

// A compact version of the sample quote: Pick One floor, required install, optional stairs.
const sections: QuoteSection[] = [
  { title: 'Floor', kind: 'pickOne', materials: [mat('Good', 927.03, 4.55, 2.74), mat('Better', 915.12, 4.9, 2.95), mat('Best', 925.43, 7.4, 4.55)], labors: [] },
  { title: 'Install', kind: 'required', materials: [mat('Base', 180, 1.85, 0.94)], labors: [lab('LVP Installation', 912, 2.25, 1.35), lab('Demo', 912, 0.65, 0.4)] },
  { title: 'Stairs', kind: 'optional', materials: [mat('Carpet', 19.33, 22.4, 12.85), mat('Pad', 19.33, 4.2, 2.1)], labors: [lab('Stair install', 13, 16, 10)] },
];
const quote = { sections, taxRate: 0.08265, taxExempt: false };

describe('line totals', () => {
  it('material = qty × retail; blank qty is 0', () => {
    expect(materialLineTotal(mat('x', 927.03, 4.55))).toBeCloseTo(4217.9865, 9);
    expect(materialLineTotal(mat('x', '', 4.55))).toBe(0);
  });
  it('labor = qty × retail, but blank OR zero qty counts as 1 (app quirk)', () => {
    expect(laborLineTotal(lab('x', 912, 2.25))).toBe(2052);
    expect(laborLineTotal(lab('x', '', 385))).toBe(385);
    expect(laborLineTotal(lab('x', 0, 385))).toBe(385);
  });
});

describe('Pick One rows', () => {
  it('defaults to the first material, else the first labor row', () => {
    expect(defaultRowKey(sections[0]!)).toBe('mat-0');
    expect(defaultRowKey({ materials: [], labors: [lab('a', 1, 1)] })).toBe('lab-0');
    expect(defaultRowKey({ materials: [], labors: [] })).toBeNull();
  });
  it('customer pick beats the shop’s pre-selection; bad keys fall back to the default', () => {
    const s: QuoteSection = { ...sections[0]!, chosenRowKey: 'mat-2' };
    expect(chosenRowKey(s, 0)).toBe('mat-2');
    expect(chosenRowKey(s, 0, { pickOne: { 0: 'mat-1' } })).toBe('mat-1');
    expect(chosenRowKey(s, 0, { pickOne: { 0: 'mat-9' } })).toBe('mat-2');
    expect(chosenRowKey({ ...s, chosenRowKey: 'lab-0' }, 0)).toBe('mat-0');
    expect(chosenRowKey(sections[1]!, 1)).toBeNull();
  });
});

describe('quote totals', () => {
  it('as sent: Good counts, stairs (optional) do not; tax on materials only', () => {
    const t = computeQuoteTotals(quote);
    expect(t).toMatchObject({ materials: 4550.99, labor: 2644.8, subtotal: 7195.79, tax: 376.14, total: 7571.93, taxLabel: 'Tax (8.265%)' });
    expect(t.sections.map((s) => s.counted)).toEqual([true, true, false]);
    expect(t.sections[0]!.rows.map((r) => r.included)).toEqual([true, false, false]);
    // "if everything is added" = + stairs with their own tax
    expect(t.totalIfAll).toBe(8336.6);
  });

  it('customer picks Better and adds the stairs', () => {
    const t = computeQuoteTotals(quote, { pickOne: { 0: 'mat-1' }, optional: [2] });
    expect(t).toMatchObject({ materials: 5331.27, labor: 2852.8, subtotal: 8184.07, tax: 440.63, total: 8624.7 });
    expect(t.sections.map((s) => s.counted)).toEqual([true, true, true]);
    expect(t.totalIfAll).toBe(t.total);
  });

  it('labor is never taxed', () => {
    const laborOnly = computeQuoteTotals({ sections: [{ title: 'L', kind: 'required', materials: [], labors: [lab('x', 100, 10)] }], taxRate: 0.08265 });
    expect(laborOnly.tax).toBe(0);
    expect(laborOnly.total).toBe(1000);
  });

  it('exempt quotes carry no tax and say so', () => {
    const t = computeQuoteTotals({ ...quote, taxExempt: true });
    expect(t.tax).toBe(0);
    expect(t.total).toBe(t.subtotal);
    expect(t.taxLabel).toBe('Tax (Exempt)');
  });

  it('rounds tax to the cent before adding (subtotal + tax always = total)', () => {
    // Best without stairs: builder header would print $10,419.51 against $9,825.98 + $593.52.
    const t = computeQuoteTotals(quote, { pickOne: { 0: 'mat-2' } });
    expect([t.subtotal, t.tax, t.total]).toEqual([9825.98, 593.52, 10419.5]);
    expect(Math.round(t.raw.total * 100) / 100).toBe(10419.51);
    expect(t.invoiceTotal).toBeCloseTo(10419.502, 9);
  });

  it('site margin leaves tax out; the app’s quote margin does not (kept for reference)', () => {
    const t = computeQuoteTotals(quote, { pickOne: { 0: 'mat-1' }, optional: [2] });
    expect(t.cost.total).toBeCloseTo(4883.7875, 9);
    expect(t.margin.profit).toBeCloseTo(8184.066 - 4883.7875, 9);
    expect(t.margin.pct.toFixed(1)).toBe('40.3');
    expect(t.appMargin.pct.toFixed(1)).toBe('43.4');
  });

  it('stored totals (_mqTotals) leave optional sections out', () => {
    expect(storedQuoteTotals(quote)).toEqual({ subtotal: 7195.79, tax: 376.14, total: 7571.93 });
  });
});

describe('approval → work order + invoice', () => {
  it('chosenItems follows the customer’s picks', () => {
    const c = chosenItems(sections, { pickOne: { 0: 'mat-1' }, optional: [2] });
    expect(c.materials.map((x) => x.line.name)).toEqual(['Better', 'Base', 'Carpet', 'Pad']);
    expect(c.labors.map((x) => x.line.name)).toEqual(['LVP Installation', 'Demo', 'Stair install']);
  });

  it('a hand-approved quote (no selection) takes EVERY Pick One row and every optional section (app behaviour)', () => {
    const c = chosenItems(sections, null);
    expect(c.materials.map((x) => x.line.name)).toEqual(['Good', 'Better', 'Best', 'Base', 'Carpet', 'Pad']);
  });

  it('an optional section the customer skipped stays out', () => {
    const c = chosenItems(sections, { pickOne: { 0: 'mat-0' } });
    expect(c.materials.map((x) => x.line.name)).toEqual(['Good', 'Base']);
  });

  it('numbers WO/IN after the quote and raises the counters; invoice total = Σ lines + rounded tax', () => {
    const a = approveQuote({ number: 'QT-330', sections, taxRate: 0.08265, paymentTerms: '50% Deposit / 50% on Completion', downPaymentPct: 50 },
      { pickOne: { 0: 'mat-1' }, optional: [2] }, { job: 327, invoice: 324 }, '2026-10-15');
    expect(a.workOrder.number).toBe('WO-330');
    expect(a.invoice.number).toBe('IN-330');
    expect(a.counters).toEqual({ job: 330, invoice: 330 });
    expect([a.invoice.subtotal, a.invoice.tax, a.invoice.total]).toEqual([8184.07, 440.63, 8624.7]);
    expect(a.invoice.raw.total).toBeCloseTo(8624.696, 9);
    expect(a.invoice.dueDate).toBe('2026-11-15'); // same day next month (August: +30 days = Nov 14)
    expect(a.invoice.lines[0]).toEqual({ desc: 'Better', qty: 915.12, rate: 4.9, amount: 915.12 * 4.9 });
    expect(a.toast).toBe('Quote QT-330 approved! Work Order WO-330 & Invoice IN-330 created.');
  });

  it('counters never go backwards', () => {
    const a = approveQuote({ number: 'QT-012', sections, taxRate: 0.076 }, null, { job: 400, invoice: 410 }, '2026-10-15');
    expect(a.workOrder.number).toBe('WO-012');
    expect(a.counters).toEqual({ job: 400, invoice: 410 });
  });

  it('next quote number', () => {
    expect(nextQuoteNumber({ lead: 60, quote: 329, job: 327, invoice: 324 })).toEqual({
      number: 'QT-330', counters: { lead: 60, quote: 330, job: 327, invoice: 324 },
    });
  });

  it('invoice due dates clamp to the month end', () => {
    expect(approveQuote({ number: 'QT-1', sections, taxRate: 0.076 }, null, { job: 0, invoice: 0 }, '2026-01-31').invoice.dueDate).toBe('2026-02-28');
    expect(approveQuote({ number: 'QT-1', sections, taxRate: 0.076 }, null, { job: 0, invoice: 0 }, '2026-12-15').invoice.dueDate).toBe('2027-01-15');
  });

  it('guards: refused on a partial load; a quote with a work order OR an invoice is not converted again', () => {
    expect(approveQuoteGuard({ dataLoaded: false, hasWorkOrder: false, hasInvoice: false })).toEqual({
      kind: 'refuse', toast: 'Work orders or invoices did not finish loading. Reload the page before approving, so nothing is made twice.', toastKind: 'error',
    });
    expect(approveQuoteGuard({ dataLoaded: true, hasWorkOrder: true, hasInvoice: true })).toEqual({ kind: 'alreadyConverted', toast: 'Quote already has a work order' });
    expect(approveQuoteGuard({ dataLoaded: true, hasWorkOrder: false, hasInvoice: true })).toEqual({ kind: 'alreadyConverted', toast: 'Quote already has an invoice' });
    expect(approveQuoteGuard({ dataLoaded: true, hasWorkOrder: false, hasInvoice: false })).toEqual({ kind: 'proceed' });
  });

  it('the Approve confirm, and a lead’s quote converting the lead', () => {
    expect(approveQuoteDialog('QT-330', 'Dev & Anjali Prasad', true)).toEqual({
      title: '✅ Approve QT-330?',
      body: 'This wins the job for Dev & Anjali Prasad and creates the work order and invoice, and turns the lead into a customer.',
      button: '✅ Approve',
    });
    expect(approveQuoteDialog('QT-12', '', false).body).toBe('This wins the job and creates the work order and invoice.');
    const lead = { id: 'ld-16', number: 'LD-056', name: 'Dev & Anjali Prasad', phone: '(775) 555-0506', email: 'dev@example.test', city: 'Reno, NV', source: 'Home Show', salesRepId: 'ct-rep-2', type: 'Retail' as const };
    const a = approveQuote({ number: 'QT-330', sections, taxRate: 0.08265, lead }, { pickOne: { 0: 'mat-1' }, optional: [2] }, { job: 327, invoice: 324 }, '2026-10-15');
    expect(a.convertedLead).toMatchObject({ customer: { id: 'cu-ld-16', type: 'Retail', customerSince: '2026-10-15' }, removedFromPipeline: true });
    expect(approveQuote({ number: 'QT-330', sections, taxRate: 0.08265 }, null, { job: 0, invoice: 0 }, '2026-10-15').convertedLead).toBeNull();
  });
});
