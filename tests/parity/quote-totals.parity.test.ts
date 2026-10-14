/**
 * Quote-total parity: the app's builder recalc (qbFastRecalc), stored totals
 * (_mqTotals), totals box (_computeTotalsData), deposit line
 * (qbRefreshDownPaymentAmt) and approval (approveQuote) run in a sandbox
 * against computeQuoteTotals / storedQuoteTotals / quoteDeposit / approveQuote.
 *
 * Known, documented difference: the site rounds tax to the cent before adding
 * it (like the app's stored totals and invoices); the builder HEADER adds
 * unrounded tax, so its grand total / deposit line can be 1¢ off. Those cases
 * are allowed (≤ 1¢) and counted; everything else must match exactly.
 */
import { describe, expect, it } from 'vitest';
import {
  approveQuote, computeQuoteTotals, depositLabel, fmtMoney, quoteDeposit, storedQuoteTotals, taxLabel,
  type QuoteLabor, type QuoteMaterial, type QuoteSection, type QuoteSelection, type RowKey, type SectionKind,
} from '../../src/lib/logic';
import { thread } from '../../src/data/sample-data';
import { sandbox } from './app-source';
import { fixedDate, money, pick, recorderDocument, rng, toAppQuote, toSelectedOptions, type AppQuote } from './helpers';

const MC_FNS = ['qbMcIsChosen', 'qbMcChosenRowKey', 'qbMcSectionLocalIdx', 'qbMcDefaultRowKey', '_quoteSecActive', '_choiceActiveIdxs'];
const noop = () => {};

function randomQuote(r: () => number): { sections: QuoteSection[]; taxRate: number; taxExempt: boolean } {
  const kinds: SectionKind[] = ['required', 'optional', 'pickOne'];
  const n = 1 + Math.floor(r() * 4);
  const sections: QuoteSection[] = [];
  for (let s = 0; s < n; s++) {
    const kind = pick(r, kinds);
    const materials: QuoteMaterial[] = Array.from({ length: Math.floor(r() * 4) }, (_, i) => ({
      name: `M${s}.${i}`, quantity: r() < 0.1 ? '' : money(r, 2000), retailPrice: money(r, 40), companyCost: money(r, 20),
    }));
    const labors: QuoteLabor[] = Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({
      name: `L${s}.${i}`, uom: 'SqFt', quantity: r() < 0.1 ? '' : r() < 0.05 ? 0 : money(r, 1500), retailPrice: money(r, 8), companyCost: money(r, 5),
    }));
    let chosenRowKey: RowKey | null = null;
    if (kind === 'pickOne' && r() < 0.6) {
      const keys: RowKey[] = [...materials.map((_, i) => `mat-${i}` as RowKey), ...labors.map((_, i) => `lab-${i}` as RowKey)];
      if (keys.length) chosenRowKey = pick(r, keys);
    }
    sections.push({ title: `S${s}`, kind, materials, labors, chosenRowKey });
  }
  const taxExempt = r() < 0.1;
  return { sections, taxRate: taxExempt ? 0 : pick(r, [0.08265, 0.076, 0.071, 0.08375, 0.0685]), taxExempt };
}

const quotes = (() => {
  const r = rng(20261014);
  const list = Array.from({ length: 600 }, () => randomQuote(r));
  list.unshift({ sections: thread.quote.sections, taxRate: thread.quote.taxRate, taxExempt: false });
  return list;
})();

function runBuilder(q: { sections: QuoteSection[]; taxRate: number; taxExempt: boolean }, pct = 50) {
  const appQ = toAppQuote(q.sections, q.taxRate, q.taxExempt) as AppQuote & Record<string, unknown>;
  appQ.downPaymentPct = pct;
  const { els, document } = recorderDocument();
  const win = { _qb: appQ };
  const fns = sandbox<{ qbFastRecalc: () => void; _computeTotalsData: (t: string) => { rows: Array<{ label?: string; value?: string; divider?: boolean }> } }>(
    'index',
    { fns: ['qbFastRecalc', '_qbSecActive', '_qbFmtQty', 'qbBuildQtyExtraHtml', '_qbInchFrac', 'qbRefreshDownPaymentAmt', '_computeTotalsData', 'fmt$', ...MC_FNS] },
    { window: win, document, setTimeout: noop, getQuote: () => undefined, qbSyncRails: noop },
  );
  fns.qbFastRecalc();
  return { qb: win._qb as Record<string, number>, els, rows: fns._computeTotalsData('quote').rows };
}

describe('builder recalc (qbFastRecalc) vs computeQuoteTotals', () => {
  it('sums, tax and the "everything added" total agree on 600+ random quotes and the sample', () => {
    let centOff = 0;
    let tieOff = 0;
    for (const q of quotes) {
      const { qb, els, rows } = runBuilder(q);
      const t = computeQuoteTotals(q);
      expect(qb.materialsTotalPrice).toBe(t.raw.materials);
      expect(qb.laborTotalPrice).toBe(t.raw.labor);
      expect(qb.materialsTotalCost).toBe(t.cost.materials);
      expect(qb.laborTotalCost).toBe(t.cost.labor);
      expect(qb.subtotal).toBe(t.raw.subtotal);
      expect(qb.total).toBe(t.raw.total);
      const optMat = t.sections.filter((s) => s.kind === 'optional').reduce((a, s) => a + s.materials, 0);
      const optLab = t.sections.filter((s) => s.kind === 'optional').reduce((a, s) => a + s.labor, 0);
      expect(qb.materialsOptionalPrice).toBeCloseTo(optMat, 9);
      expect(qb.laborOptionalPrice).toBeCloseTo(optLab, 9);
      // Header grand total: builder adds unrounded tax; the site rounds tax first.
      const header = els.get('qb-grand-total')!.textContent;
      expect(header).toBe('$' + t.raw.total.toFixed(2));
      if (header !== '$' + t.total.toFixed(2)) {
        centOff++;
        expect(Math.abs(Number(header.slice(1)) - t.total)).toBeLessThanOrEqual(0.0100001);
      }
      expect(Math.abs(Number(els.get('qb-mt-total')!.textContent.slice(1)) - t.totalIfAll)).toBeLessThanOrEqual(0.0100001);
      // Totals box rows: the app formats UNROUNDED values — identical to formatting the site's raw figures…
      const byLabel = Object.fromEntries(rows.filter((r) => !r.divider).map((r) => [r.label, r.value]));
      expect(byLabel['🧱 Materials']).toBe(fmtMoney(t.raw.materials));
      expect(byLabel['🔨 Labor']).toBe(fmtMoney(t.raw.labor));
      expect(byLabel['Subtotal']).toBe(fmtMoney(t.raw.subtotal));
      expect(byLabel[taxLabel(q.taxRate, q.taxExempt)]).toBe(fmtMoney(t.raw.tax));
      expect(byLabel['Grand Total']).toBe(fmtMoney(t.raw.total));
      expect(byLabel['Margin']).toBe(`${t.appMargin.pct.toFixed(1)}% · ${fmtMoney(t.appMargin.profit)}`);
      // …and within a cent of the site's rounded (stored-style) figures; ties are counted.
      for (const [k, v] of [['materials', t.materials], ['labor', t.labor], ['subtotal', t.subtotal], ['tax', t.tax]] as const) {
        if (fmtMoney(v) !== fmtMoney(t.raw[k])) { tieOff++; expect(Math.abs(v - t.raw[k])).toBeLessThanOrEqual(0.005000001); }
      }
    }
    // both rounding differences exist in the app itself, and both are rare
    expect(centOff).toBeLessThan(quotes.length / 4);
    expect(tieOff).toBeLessThan(quotes.length / 10);
    console.info(`quote parity: ${quotes.length} quotes; builder header 1¢ off (unrounded tax) in ${centOff}; half-cent display ties in ${tieOff} figures`);
  });

  it('deposit line ("→ $X due upfront") is within 1¢ of the site deposit', () => {
    for (const q of quotes.slice(0, 200)) for (const pct of [50, 30, 100]) {
      const { els } = runBuilder(q, pct);
      const appLine = els.get('qb-down-payment-amt')!.textContent;
      const site = quoteDeposit(computeQuoteTotals(q), pct);
      const appAmt = Number(appLine.replace(/^→ \$/, '').replace(/ due upfront$/, ''));
      expect(Math.abs(appAmt - site)).toBeLessThanOrEqual(0.0100001);
    }
    const { els } = runBuilder({ sections: thread.quote.sections, taxRate: thread.quote.taxRate, taxExempt: false });
    expect(els.get('qb-down-payment-amt')!.textContent).toBe(depositLabel(thread.quote.depositAtSend));
  });
});

describe('stored totals (_mqTotals) vs storedQuoteTotals', () => {
  const fns = sandbox<{ _mqTotals: (q: unknown) => { subtotal: number; tax: number; total: number; optional: number } }>(
    'index', { fns: ['_mqTotals', '_mqSecActive', ...MC_FNS] }, { getQuote: () => undefined },
  );
  it('exactly equal (tax rounded first, optional sections left out)', () => {
    for (const q of quotes) {
      const a = fns._mqTotals(toAppQuote(q.sections, q.taxRate, q.taxExempt));
      expect({ subtotal: a.subtotal, tax: a.tax, total: a.total }).toEqual(storedQuoteTotals(q));
    }
  });
});

describe('approval (approveQuote) vs approveQuote', () => {
  const NOW = Date.parse('2026-10-15T17:00:00Z');
  function runApprove(q: { sections: QuoteSection[]; taxRate: number; taxExempt: boolean }, number: string, selection: QuoteSelection | null, counters: { job: number; invoice: number }) {
    const appQ = {
      ...toAppQuote(q.sections, q.taxRate, q.taxExempt), id: 'q1', number, status: 'sent', customerId: 'cu-1', leadId: null,
      paymentTerms: '50% Deposit / 50% on Completion', downPaymentPct: 50, selectedOptions: toSelectedOptions(q.sections, selection),
      siteAddress: 'Reno, NV', salesRepId: 'ct-rep-2', salesRep: 'Marisol Vega', lineItemsHeader: 'Materials & Labor',
    };
    const data = { quotes: [appQ], jobs: [] as Record<string, unknown>[], invoices: [] as Record<string, unknown>[], counters: { ...counters, quote: 0 }, systemSalesReps: [], customers: [], inventory: [], leads: [], quoteInteractions: [] };
    const toasts: string[] = [];
    let link = 0;
    const fns = sandbox<{ approveQuote: (id: string) => void }>('index', {
      fns: ['approveQuote', 'applyCustomerSelectionToQuote', '_refreshQuoteStoredTotals', '_mqTotals', '_mqSecActive', 'qbChosenSectionsAndRows',
        'qbFilterChosenItems', '_choiceGroups', '_coverageUnits', '_isoDay', ...MC_FNS],
    }, {
      data, getQuote: (id: string) => data.quotes.find((x) => x.id === id), getCustomer: () => null, getLead: () => null,
      _todayISO: () => '2026-10-15', _logQuoteApproval: noop, addActivity: noop, _resolveQuoteLeadToCustomer: (x: { customerId: string }) => x.customerId,
      _newLinkId: () => `lk${++link}`, _syncSnap: () => ({}), createTasksForEvent: noop, showToast: (t: string) => toasts.push(t), saveData: noop,
      navigate: noop, Date: fixedDate(NOW),
    });
    fns.approveQuote('q1');
    return { job: data.jobs[0]!, inv: data.invoices[0]!, counters: data.counters, toasts };
  }

  const cases: Array<[string, { sections: QuoteSection[]; taxRate: number; taxExempt: boolean }, QuoteSelection | null]> = [
    ['sample, Better + stairs', { sections: thread.quote.sections, taxRate: thread.quote.taxRate, taxExempt: false }, thread.quote.selection],
    ['sample, Good only', { sections: thread.quote.sections, taxRate: thread.quote.taxRate, taxExempt: false }, { pickOne: { 0: 'mat-0' } }],
    ['sample, approved by hand (no selection)', { sections: thread.quote.sections, taxRate: thread.quote.taxRate, taxExempt: false }, null],
  ];
  const r = rng(7);
  for (let i = 0; i < 60; i++) {
    const q = quotes[i + 1]!;
    const sel: QuoteSelection = { pickOne: {}, optional: [] };
    q.sections.forEach((s, idx) => {
      if (s.kind === 'optional' && r() < 0.5) (sel.optional as number[]).push(idx);
      if (s.kind === 'pickOne') {
        const keys = [...s.materials.map((_, j) => `mat-${j}`), ...s.labors.map((_, j) => `lab-${j}`)] as RowKey[];
        if (keys.length) (sel.pickOne as Record<number, RowKey>)[idx] = pick(r, keys);
      }
    });
    cases.push([`random #${i}`, q, sel]);
  }

  it.each(cases)('%s', (_label, q, selection) => {
    const a = runApprove(q, 'QT-330', selection, { job: 327, invoice: 324 });
    const s = approveQuote({ number: 'QT-330', sections: q.sections, taxRate: q.taxRate, taxExempt: q.taxExempt, paymentTerms: '50% Deposit / 50% on Completion', downPaymentPct: 50 }, selection, { job: 327, invoice: 324 }, '2026-10-15');
    expect(a.job.number).toBe(s.workOrder.number);
    expect(a.inv.number).toBe(s.invoice.number);
    expect({ job: a.counters.job, invoice: a.counters.invoice }).toEqual(s.counters);
    expect(a.toasts).toEqual([s.toast]);
    expect(a.job.status).toBe('order_materials');
    expect((a.job.materials as Array<{ item: string; quantity: unknown }>).map((m) => [m.item, m.quantity])).toEqual(s.workOrder.materials.map((c) => [c.line.name, c.line.quantity]));
    expect((a.job.labors as Array<{ name: string; quantity: unknown }>).map((l) => [l.name, l.quantity])).toEqual(s.workOrder.labors.map((c) => [c.line.name, c.line.quantity]));
    expect(a.inv.subtotal).toBe(s.invoice.raw.subtotal);
    expect(a.inv.tax).toBe(s.invoice.tax);
    expect(a.inv.total).toBe(s.invoice.raw.total);
    expect(a.inv.status).toBe('unpaid');
    expect(a.inv.dueDate).toBe(s.invoice.dueDate);
    expect(a.inv.downPaymentPct).toBe(50);
    expect((a.inv.lineItems as Array<Record<string, unknown>>).map((x) => [x.desc, x.qty, x.rate, x.amount])).toEqual(s.invoice.lines.map((x) => [x.desc, x.qty, x.rate, x.amount]));
  });

  it('the sample invoice total equals the quote the customer approved', () => {
    expect(thread.invoice.total).toBe(thread.quote.totals.total);
    expect(thread.invoice.raw.total).toBe(thread.quote.totals.invoiceTotal);
  });
});
