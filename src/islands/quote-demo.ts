// "Quote a job" — QT-330 in today's quote builder, the customer's live link on their phone, and
// the office turning the customer's approval into WO-330 + IN-330.
//
// The current app (demo `main`, Oct 2026), not an invented UI:
//   builder — renderQuoteBuilder (main L12651): section bands (L12849), the 📐 Job Area bar with
//             SqFt / SqYd + Apply (L12852, applyAreaQty L14989), Pick One radios + banner, the
//             carton hint and the carpet length chip (qbBuildQtyExtraHtml L13425), "+ Add line item"
//             (L14058-14100), section totals, the paper's Optional Add-Ons + TOTAL (WITH DEFAULTS)
//             (L12931), Down Payment (L13517), the QUOTE TOTAL card (_computeTotalsData L27324),
//             Privacy Mode (L28637), the locked banner (L12794). Emoji become the app's line icons
//             (icons.js) exactly where the app swaps them.
//   phone   — q.html at a 430 px phone viewport: BILL TO / SITE DETAILS, Pick One rows and
//             "Add to my quote" that re-total live (q L1186-1232), totals (q L1626), Approve (q L1390),
//             the APPROVED stamp (kept LEVEL — the app tilts it) and the approved card (q L1373-1388).
//   office  — a customer approving online only marks the quote approved. "🔨 Create WO & Invoice"
//             (main L12784) asks (confirmConvertApprovedQuote L12337) and then approveQuote makes
//             WO-330 + IN-330 from the customer's picks (L12367).
//
// Every number comes from src/lib/logic. Fictional sample data; nothing leaves the browser.
import gsap from 'gsap';
import {
  applyArea,
  applyRollDimensions,
  approveQuote,
  chosenRowKey,
  computeQuoteTotals,
  convertApprovedQuoteDialog,
  CREATE_WO_INVOICE,
  CUSTOMER_APPROVED_TOAST,
  depositLabel,
  dueNowView,
  fmtDate,
  fmtMoney,
  fmtNum,
  fmtQty,
  laborLineTotal,
  laborQty,
  materialLineTotal,
  materialQtyFromInput,
  qtyExtra,
  quoteDeposit,
  rollDimensionsFromQty,
  rollDimensionsPreview,
  rollDimsDialog,
  rollLengthFromQty,
  WO_LABELS,
  type ApprovedQuote,
  type ISODate,
  type Lead,
  type QuoteLabor,
  type QuoteMaterial,
  type QuotePicks,
  type QuoteSection,
  type QuoteSelection,
  type QuoteTotals,
  type RowKey,
} from '../lib/logic';
import { iconSvg, withAppIcons } from '../data/modules/app-icons';
import { appToaster } from '../data/modules/app-toast';

// ------------------------------------------------------------------ types --

export interface QmMaterial extends QuoteMaterial {
  category?: string;
  vendor?: string;
  rollWidthAssumed?: boolean;
}
export interface QmSection extends QuoteSection {
  materials: QmMaterial[];
  /** The section's 📐 Job Area bar (open when an area was applied), SqFt and SqYd boxes. */
  area?: { sqft: number | ''; sqyd: number | '' } | null;
}
export interface QmCatalogProduct {
  id: string; name: string; matNum: string; category: string; vendor: string;
  purchaseUOM: string; costUOM: string; coverage: number; rollWidth?: number; companyCost: number; retailPrice: number;
}
export interface QmCatalogLabor { id: string; name: string; description?: string; uom: string; companyCost: number; retailPrice: number }

/** Everything the module needs, built from src/data/sample-data.ts (src/data/modules/quote.ts). */
export interface QmSeed {
  /** The quote's issue day (it is Sent on this day). */
  issued: ISODate;
  /** The day the customer approves and the office converts (the dataset's D+1). */
  approveDay: ISODate;
  /** Noon UTC on approveDay — the clock for the live invoice's "Due Now". */
  nowMs: number;
  quote: {
    number: string; createdAt: ISODate; expirationDate: ISODate; taxRate: number; taxCounty: string; taxExempt: boolean;
    paymentTerms: string; downPaymentPct: number; sections: QmSection[];
  };
  customer: { name: string; initials: string; phone: string; email: string; city: string };
  lead: Pick<Lead, 'id' | 'number' | 'name' | 'phone' | 'email' | 'city' | 'source' | 'salesRepId' | 'type'>;
  rep: { id: string; name: string; email: string };
  shop: { name: string; address: string; city: string; phone: string; email: string };
  counters: { job: number; invoice: number };
  catalog: { products: QmCatalogProduct[]; labor: QmCatalogLabor[] };
}

export interface QmApproval {
  at: ISODate;
  selection: Required<QuoteSelection>;
  /** "Selected options:" on the approved card — optional sections first, then Pick One (q L1375). */
  selectedTitles: string[];
}

export interface QmState {
  sections: QmSection[];
  /** Builder radio = the default row the customer's page opens on, per Pick One section. */
  defaultPicks: Record<number, RowKey>;
  /** What the customer has picked on their phone (live, until Approve). */
  phonePicks: Record<number, RowKey>;
  /** Optional sections the customer added on their phone. */
  phoneOpts: number[];
  downPct: number;
  approval: QmApproval | null;
  /** The work order + invoice the office created. */
  converted: ApprovedQuote | null;
}

// ---------------------------------------------------------------- helpers --

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Builder line cells print like the app's inputs: toFixed(2), no grouping (main L13460). */
const cents = (n: unknown): string => (Number(n) || 0).toFixed(2);

/** Unit shown on a material line: cost, coverage, then purchase UOM (the app's UOM select). */
const matUom = (m: QuoteMaterial): string => m.costUOM || m.coverageUOM || m.purchaseUOM || '';
/** q.html's Pick One rows read coverage, then purchase UOM (q L1189). */
const mcMatUom = (m: QuoteMaterial): string => m.coverageUOM || m.purchaseUOM || '';

const BAND_EMOJI = { required: '📋', pickOne: '🔘', optional: '⭐' } as const;

function rowName(sec: QuoteSection, key: RowKey): string {
  const m = /^(mat|lab)-(\d+)$/.exec(key);
  if (!m) return '';
  const i = Number(m[2]);
  return (m[1] === 'mat' ? sec.materials[i]?.name : sec.labors[i]?.name) ?? '';
}

const pickIdxs = (sections: readonly QuoteSection[]): number[] => sections.flatMap((s, i) => (s.kind === 'pickOne' ? [i] : []));
const optIdxs = (sections: readonly QuoteSection[]): number[] => sections.flatMap((s, i) => (s.kind === 'optional' ? [i] : []));

export function initialState(seed: QmSeed): QmState {
  const sections = JSON.parse(JSON.stringify(seed.quote.sections)) as QmSection[];
  const defaultPicks: Record<number, RowKey> = {};
  for (const i of pickIdxs(sections)) defaultPicks[i] = chosenRowKey(sections[i]!, i) ?? 'mat-0';
  return { sections, defaultPicks, phonePicks: { ...defaultPicks }, phoneOpts: [], downPct: seed.quote.downPaymentPct, approval: null, converted: null };
}

const money = (seed: QmSeed, s: QmState) => ({ sections: s.sections, taxRate: seed.quote.taxRate, taxExempt: seed.quote.taxExempt });

/**
 * The builder's money: required sections + the Pick One row (the default, or the customer's pick
 * once approved). Optional sections stay out until the customer approves with them. The app keeps
 * them out even then (main L13531), so its Grand Total stops matching the invoice the approval
 * makes — an app bug (docs/logic-changes-2026-10.md #27); the site shows the approved total.
 */
export function builderTotals(seed: QmSeed, s: QmState): QuoteTotals {
  const picks: QuotePicks = s.approval
    ? { pickOne: s.approval.selection.pickOne, optional: s.approval.selection.optional }
    : { pickOne: s.defaultPicks };
  return computeQuoteTotals(money(seed, s), picks);
}

/** The customer's page: their live picks and the optional sections they added. */
export function phoneTotals(seed: QmSeed, s: QmState): QuoteTotals {
  const picks: QuotePicks = s.approval
    ? { pickOne: s.approval.selection.pickOne, optional: s.approval.selection.optional }
    : { pickOne: s.phonePicks, optional: s.phoneOpts };
  return computeQuoteTotals(money(seed, s), picks);
}

// ------------------------------------------------------- builder (the app) --

function bStatus(s: QmState): string {
  // QUOTE_STATUS_COLORS (main L7623): sent = blue, approved = green.
  return s.approval ? '<span class="a-pill a-green">Approved</span>' : '<span class="a-pill a-blue">Sent</span>';
}

function bAction(s: QmState): string {
  if (!s.approval || s.converted) return '';
  return `<button type="button" class="a-btn a-success a-btn-sm qm-convert" data-convert title="${esc(CREATE_WO_INVOICE.title)}">${esc(CREATE_WO_INVOICE.label)}</button>`;
}

function bGrand(t: QuoteTotals): string {
  return `<span class="qm-gt-cap">Grand Total</span><span class="qm-gt-val num">${fmtMoney(t.total)}</span>`;
}

function bBanner(seed: QmSeed, s: QmState): string {
  const c = s.converted;
  if (!c) return '';
  const wo = c.workOrder;
  const inv = c.invoice;
  // What the customer's live invoice asks for right now (q L1679-1731). The app stores the invoice
  // total unrounded (subtotal + tax in cents), so "Due Now" is figured from raw.total.
  const due = dueNowView({ total: inv.raw.total, paid: 0, terms: inv.paymentTerms, downPaymentPct: inv.downPaymentPct, finalInvoice: false, createdAt: inv.createdAt }, seed.nowMs);
  const dueHtml = due.kind === 'due'
    ? `<div class="qm-doc-due"><span>${esc(due.label)}</span><b class="num">${esc(due.amount)}</b></div><div class="qm-doc-sub">${esc(due.sub)} — on the invoice’s pay link.</div>`
    : '';
  const lead = c.convertedLead;
  // main L12794 (qb-locked-banner). Its second sentence points at section lock icons this module
  // does not let you click, so only the first sentence is kept.
  return '<div class="qm-lock" role="note"><span class="qm-lock-ic" aria-hidden="true">🔒</span><div><span class="qm-lock-t">This quote is locked</span>'
    + '<span>The work order and invoice were generated from these line items.</span></div></div>'
    + `<section class="qm-docs" data-docs aria-labelledby="qm-docs-h" tabindex="-1"><div class="qm-docs-h"><h4 id="qm-docs-h">Created from ${esc(seed.quote.number)}</h4></div>`
    + '<div class="qm-docs-grid">'
    + `<div class="qm-doc qm-doc-wo"><div class="qm-doc-top"><span class="qm-doc-num">🔨 ${esc(wo.number)}</span><span class="a-pill a-purple">${esc(WO_LABELS[wo.status])}</span></div>`
    + `<div class="qm-doc-line">Work order · ${wo.materials.length} material${wo.materials.length === 1 ? '' : 's'}, ${wo.labors.length} labor</div>`
    + `<div class="qm-doc-sub">Created ${esc(fmtDate(wo.createdAt))} · only the customer’s picks</div></div>`
    + `<div class="qm-doc qm-doc-in"><div class="qm-doc-top"><span class="qm-doc-num">🧾 ${esc(inv.number)}</span><span class="a-pill a-gray">Unpaid</span></div>`
    + `<div class="qm-doc-line">Invoice · <span class="num">${fmtMoney(inv.total)}</span> · due ${esc(fmtDate(inv.dueDate))}</div>${dueHtml}</div>`
    + '</div>'
    + (lead ? `<p class="qm-docs-note">Lead ${esc(seed.lead.number)} is now the customer ${esc(lead.customer.name)} and leaves the lead pipeline.</p>` : '')
    + '</section>';
}

function hintHtml(m: QmMaterial, sIdx: number, i: number, locked: boolean): string {
  const x = qtyExtra(m);
  if (!x) return '';
  if (x.kind === 'cartons') return `<div class="qm-hint"><b>📦 ${esc(x.hint.count)}</b> <span>${esc(x.hint.equals)}</span></div>`;
  if (x.kind === 'roll') {
    const w = x.width ? `<span class="qm-rollw" title="${esc(x.width.title)}">${esc(x.width.text)}</span>` : '';
    return `<div class="qm-hint qm-hint-roll"><button type="button" class="qm-rollbtn" data-roll="${sIdx}:${i}"${locked ? ' disabled' : ''} aria-label="Roll length ${esc(x.text)} — edit roll dimensions">📐 ${esc(x.text)}</button>${w}</div>`;
  }
  if (x.kind === 'roll-missing') {
    return `<div class="qm-hint"><button type="button" class="qm-rollbtn qm-rollbtn-warn" data-roll="${sIdx}:${i}"${locked ? ' disabled' : ''} aria-label="No length yet — set the roll dimensions">${esc(x.text)}</button></div>`;
  }
  return '';
}

function pickCell(sec: QmSection, sIdx: number, key: RowKey, chosen: boolean, locked: boolean, id: string): string {
  if (sec.kind !== 'pickOne') return '';
  const title = locked ? 'Customer picked this option' : 'Click to set as the default the customer sees';
  return `<td class="qm-c-pick"><input type="radio" class="qm-radio" name="qm-b-pick-${sIdx}" id="${id}-r" value="${key}" data-bpick="${sIdx}"${chosen ? ' checked' : ''}${locked ? ' disabled' : ''} title="${esc(title)}"></td>`;
}

function badgeHtml(sec: QmSection, chosen: boolean, approved: boolean): string {
  if (sec.kind !== 'pickOne' || !approved) return '';
  return chosen
    ? '<span class="qm-mcbadge is-chosen" title="The customer picked this option — only its price counts toward the total">✓ Customer’s Pick</span>'
    : '<span class="qm-mcbadge is-not" title="Not selected — does not count toward the total">✗ Not Selected</span>';
}

function rowClass(sec: QmSection, chosen: boolean, approved: boolean, kind: 'mat' | 'lab'): string {
  return ['qm-row', `qm-row-${kind}`, sec.kind === 'pickOne' ? 'qm-row-mc' : '', sec.kind === 'pickOne' && approved ? (chosen ? 'qm-mc-chosen' : 'qm-mc-unchosen') : ''].filter(Boolean).join(' ');
}

function bMatRow(s: QmState, sec: QmSection, sIdx: number, m: QmMaterial, i: number, pick: RowKey | undefined): string {
  const key: RowKey = `mat-${i}`;
  const locked = !!s.approval;
  const chosen = sec.kind === 'pickOne' && pick === key;
  const id = `qm-b-${sIdx}-${key}`;
  const uom = matUom(m);
  const name = sec.kind === 'pickOne' ? `<label class="qm-name qm-name-mat" for="${id}-r">${esc(m.name)}</label>` : `<span class="qm-name qm-name-mat">${esc(m.name)}</span>`;
  const c = Number(m.companyCost) || 0;
  return `<tr class="${rowClass(sec, chosen, locked, 'mat')}" data-key="${key}">`
    + pickCell(sec, sIdx, key, chosen, locked, id)
    + `<td class="qm-c-item"><div class="qm-namewrap">${name}${badgeHtml(sec, chosen, locked)}</div></td>`
    + `<td class="qm-c-desc" data-label="Description">${m.style ? esc(m.style) : '<span class="qm-ph" aria-hidden="true">Style/Color</span>'}</td>`
    + `<td class="qm-c-qty" data-label="Qty / UOM"><div class="qm-qtywrap"><input class="qm-chip" type="number" step="0.01" min="0" inputmode="decimal" id="${id}-q" data-qty="${sIdx}:${key}" value="${esc(fmtQty(m.quantity))}" placeholder="0"${locked ? ' disabled' : ''} aria-label="Quantity, ${esc(m.name)} (${esc(uom)})"><span class="qm-uom">${esc(uom)}</span></div>${hintHtml(m, sIdx, i, locked)}</td>`
    + `<td class="qm-c-price" data-label="Price"><div class="qm-moneywrap"><span class="qm-dollar" aria-hidden="true">$</span><input class="qm-chip qm-chip-money" type="number" step="0.01" min="0" inputmode="decimal" id="${id}-p" data-price="${sIdx}:${key}" value="${cents(m.retailPrice)}"${locked ? ' disabled' : ''} aria-label="Price per ${esc(uom || 'unit')}, ${esc(m.name)}"></div><div class="qm-cost is-private" title="Never shown to customer">💰 ${c > 0 ? 'Cost $' + cents(c) : 'Set cost'}</div></td>`
    + `<td class="qm-c-total" data-label="Total"><span class="qm-total num"><span class="qm-dollar" aria-hidden="true">$</span>${cents(materialLineTotal(m))}</span></td>`
    + '</tr>';
}

function bLabRow(s: QmState, sec: QmSection, sIdx: number, l: QuoteLabor, i: number, pick: RowKey | undefined): string {
  const key: RowKey = `lab-${i}`;
  const locked = !!s.approval;
  const chosen = sec.kind === 'pickOne' && pick === key;
  const id = `qm-b-${sIdx}-${key}`;
  const name = sec.kind === 'pickOne' ? `<label class="qm-name qm-name-lab" for="${id}-r">${esc(l.name)}</label>` : `<span class="qm-name qm-name-lab">${esc(l.name)}</span>`;
  const c = Number(l.companyCost) || 0;
  return `<tr class="${rowClass(sec, chosen, locked, 'lab')}" data-key="${key}">`
    + pickCell(sec, sIdx, key, chosen, locked, id)
    + `<td class="qm-c-item"><div class="qm-namewrap">${name}${badgeHtml(sec, chosen, locked)}</div></td>`
    + `<td class="qm-c-desc" data-label="Description">${l.description ? esc(l.description) : '<span class="qm-ph" aria-hidden="true">Details...</span>'}</td>`
    + `<td class="qm-c-qty" data-label="Qty / UOM"><div class="qm-qtywrap"><input class="qm-chip" type="number" step="0.01" min="0" inputmode="decimal" id="${id}-q" data-qty="${sIdx}:${key}" value="${esc(fmtQty(l.quantity))}" placeholder="0"${locked ? ' disabled' : ''} aria-label="Quantity, ${esc(l.name)} (${esc(l.uom)})"><span class="qm-uom">${esc(l.uom)}</span></div></td>`
    + `<td class="qm-c-price" data-label="Price"><div class="qm-moneywrap"><span class="qm-dollar" aria-hidden="true">$</span><input class="qm-chip qm-chip-money" type="number" step="0.01" min="0" inputmode="decimal" id="${id}-p" data-price="${sIdx}:${key}" value="${cents(l.retailPrice)}"${locked ? ' disabled' : ''} aria-label="Price per ${esc(l.uom || 'unit')}, ${esc(l.name)}"></div><div class="qm-cost is-private" title="Never shown to customer">💰 ${c > 0 ? 'Cost $' + cents(c) : 'Set cost'}</div></td>`
    + `<td class="qm-c-total" data-label="Total"><span class="qm-total num"><span class="qm-dollar" aria-hidden="true">$</span>${cents(laborLineTotal(l))}</span></td>`
    + '</tr>';
}

function bSection(seed: QmSeed, s: QmState, t: QuoteTotals, sIdx: number): string {
  const sec = s.sections[sIdx]!;
  const st = t.sections[sIdx]!;
  const locked = !!s.approval;
  const pick = sec.kind === 'pickOne' ? (s.approval ? s.approval.selection.pickOne[sIdx] : s.defaultPicks[sIdx]) : undefined;
  const lockTitle = locked ? 'Quote is locked' : 'Lock engages once the quote is approved';
  let h = `<div class="qm-band qm-band-${sec.kind}"><span class="qm-band-drag" aria-hidden="true">⇅</span><span class="qm-band-ic" aria-hidden="true">${BAND_EMOJI[sec.kind]}</span>`
    + `<h4 class="qm-band-t" id="qm-sec-t-${sIdx}">${esc(sec.title)}</h4>`
    + `<span class="qm-band-lock" role="img" aria-label="${esc(lockTitle)}" title="${esc(lockTitle)}">${locked ? '🔒' : '🔓'}</span></div>`;
  h += '<div class="qm-secbody">';
  if (sec.area) {
    const lab = esc(sec.title);
    h += '<div class="qm-area">'
      + '<span class="qm-area-l">📐 Job Area:</span>'
      + `<span class="qm-area-g"><input type="number" min="0" step="0.01" inputmode="decimal" id="qm-area-${sIdx}-sqft" data-areain="${sIdx}:SqFt" value="${esc(sec.area.sqft)}" placeholder="0"${locked ? ' disabled' : ''} aria-label="Job area in square feet, ${lab}"><span class="qm-area-u" aria-hidden="true">SqFt</span>`
      + `<button type="button" data-area="${sIdx}:SqFt"${locked ? ' disabled' : ''} aria-label="Apply the square feet to ${lab}">Apply</button></span>`
      + '<span class="qm-area-sep" aria-hidden="true"></span>'
      + `<span class="qm-area-g"><input type="number" min="0" step="0.001" inputmode="decimal" id="qm-area-${sIdx}-sqyd" data-areain="${sIdx}:SqYd" value="${esc(sec.area.sqyd)}" placeholder="0"${locked ? ' disabled' : ''} aria-label="Job area in square yards, ${lab}"><span class="qm-area-u" aria-hidden="true">SqYd</span>`
      + `<button type="button" data-area="${sIdx}:SqYd"${locked ? ' disabled' : ''} aria-label="Apply the square yards to ${lab}">Apply</button></span>`
      + '</div>';
  }
  if (sec.kind === 'pickOne' && !locked && pick) {
    // main L12994 — the draft banner; after approval the rows carry the customer's pick instead.
    h += `<div class="qm-mcban"><span class="qm-mcban-l">🔘 Pick One</span><span class="qm-mcban-p">Default: ${esc(rowName(sec, pick))}</span>`
      + '<span class="qm-mcban-n">— click any row’s radio to set it as the default the customer sees. Only the picked row counts toward the total.</span></div>';
  }
  const head = '<thead><tr>'
    + (sec.kind === 'pickOne' ? '<th class="qm-c-pick" scope="col">Pick</th>' : '')
    + '<th class="qm-c-item" scope="col">Line Items</th><th class="qm-c-desc" scope="col">Description</th>'
    + '<th class="qm-c-qty" scope="col">Qty <span class="qm-th-sub">/ UOM</span></th><th class="qm-c-price" scope="col">Price</th><th class="qm-c-total" scope="col">Total</th></tr></thead>';
  const rows = sec.materials.map((m, i) => bMatRow(s, sec, sIdx, m, i, pick)).join('') + sec.labors.map((l, i) => bLabRow(s, sec, sIdx, l, i, pick)).join('');
  h += `<table class="qm-tbl" aria-labelledby="qm-sec-t-${sIdx}">${head}<tbody>${rows}</tbody></table>`;
  if (!locked) {
    h += `<div class="qm-ali"><button type="button" class="qm-ali-btn" data-ali="${sIdx}" aria-haspopup="menu" aria-expanded="false" id="qm-ali-${sIdx}">+ Add line item</button></div>`;
  }
  // Section totals (main L13067): Sales Tax, then "<Title> Subtotal" with the section's tax in it.
  // A Pick One section counts its picked row only.
  h += '<div class="qm-sectot"><div class="qm-sectot-h">Section Totals</div>'
    + (seed.quote.taxExempt ? '' : `<div class="qm-sectot-r"><span>Sales Tax</span><span class="num">${fmtMoney(st.tax)}</span></div>`)
    + `<div class="qm-sectot-r qm-sectot-sub"><span>${esc(sec.title)} Subtotal</span><span class="num">${fmtMoney(st.total)}</span></div></div>`;
  h += '</div>';
  return h;
}

/** The paper's totals block (main L12931): ⭐ Optional Add-Ons, then TOTAL (WITH DEFAULTS) = everything incl. options. */
function bPaperTotals(s: QmState, t: QuoteTotals): string {
  const opts = optIdxs(s.sections);
  let h = '<table class="qm-ptot"><tbody>';
  if (opts.length) {
    h += '<tr><th colspan="2" scope="colgroup" class="qm-ptot-oh">⭐ Optional Add-Ons</th></tr>';
    for (const i of opts) h += `<tr class="qm-ptot-opt"><td>⭐ ${esc(s.sections[i]!.title)}</td><td class="num">+${fmtMoney(t.sections[i]!.total)}</td></tr>`;
  }
  h += `<tr class="qm-ptot-total"><td>Total${opts.length ? ' (with defaults)' : ''}</td><td class="num">${fmtMoney(opts.length ? t.totalIfAll : t.total)}</td></tr></tbody></table>`;
  return h;
}

function bRail(t: QuoteTotals): string {
  // Margin WITHOUT tax: (subtotal − cost) ÷ subtotal (QuoteTotals.margin). The app's own Margin row
  // (_computeTotalsData, main L27324) divides by the grand total INCLUDING tax and counts the tax as
  // profit — a known app bug (docs/logic-changes-2026-10.md #3). Sales tax is not the shop's money.
  // The docked card isn't swept by the icon swap, so its emoji stay emoji (as in the app).
  const m = t.margin;
  return `<div class="qm-trow"><span class="qm-tl qm-tl-mat">🧱 Materials</span><span class="qm-tv num">${fmtMoney(t.materials)}</span></div>`
    + `<div class="qm-trow"><span class="qm-tl qm-tl-lab">🔨 Labor</span><span class="qm-tv num">${fmtMoney(t.labor)}</span></div>`
    + '<hr class="qm-tsep">'
    + `<div class="qm-trow"><span class="qm-tl">Subtotal</span><span class="qm-tv num">${fmtMoney(t.subtotal)}</span></div>`
    + `<div class="qm-trow"><span class="qm-tl">${esc(t.taxLabel)}</span><span class="qm-tv num">${fmtMoney(t.tax)}</span></div>`
    + '<hr class="qm-tsep">'
    + `<div class="qm-trow qm-trow-hl"><span class="qm-tl">Grand Total</span><span class="qm-tv num">${fmtMoney(t.total)}</span></div>`
    + '<hr class="qm-tsep">'
    + `<div class="qm-trow is-private" title="Never shown to the customer"><span class="qm-tl">Margin</span><span class="qm-tv qm-tv-m${m.profit < 0 ? ' is-neg' : ''} num">${m.pct.toFixed(1)}% · ${fmtMoney(m.profit)}</span></div>`;
}

function bDeposit(s: QmState, t: QuoteTotals): string {
  const locked = !!s.approval;
  return '<span class="qm-dp-l">Down Payment:</span>'
    + `<input type="number" min="0" max="100" step="1" inputmode="numeric" class="qm-dp-in" id="qm-dp" data-dp value="${esc(s.downPct)}"${locked ? ' disabled' : ''} aria-label="Down payment percent">`
    + `<span class="qm-dp-l">%</span><span class="qm-dp-amt num">${esc(depositLabel(quoteDeposit(t, s.downPct)))}</span>`;
}

// ------------------------------------------------- phone (q.html, customer) --

function pStamp(s: QmState): string {
  const a = s.approval;
  if (!a) return '';
  // The app tilts this stamp (rotate −8° / −4°). The site keeps it level, on purpose.
  return `<div class="qm-q-stamp" role="img" aria-label="Approved ${esc(fmtDate(a.at))}">Approved<span class="qm-q-stamp-d">${esc(fmtDate(a.at))}</span></div>`;
}

const P_HEAD = '<th>Line Items</th><th>Description</th><th class="num">Qty</th><th class="num">UOM</th><th class="num">Price</th><th class="num">Total</th>';

function pMcRow(sIdx: number, key: RowKey, sel: boolean, locked: boolean, cells: string, name: string): string {
  return `<tr class="qm-q-mcrow${sel ? ' is-sel' : ''}" data-mc="${sIdx}:${key}">`
    + `<td class="qm-q-radiocell"><input type="radio" name="qm-p-pick-${sIdx}" id="qm-p-${sIdx}-${key}" value="${key}" data-ppick="${sIdx}"${sel ? ' checked' : ''}${locked ? ' disabled' : ''} aria-labelledby="qm-p-${sIdx}-${key}-n"></td>`
    + `<td id="qm-p-${sIdx}-${key}-n">${esc(name)}</td>${cells}</tr>`;
}

function pSection(s: QmState, t: QuoteTotals, sIdx: number): string {
  const sec = s.sections[sIdx]!;
  const st = t.sections[sIdx]!;
  const title = esc(sec.title.toUpperCase());
  const locked = !!s.approval;
  // q.html's section line shows the subtotal before tax (tax is reported once, above TOTAL).
  const sub = fmtMoney(st.materials + st.labor);
  if (sec.kind === 'pickOne') {
    const sel = st.chosenRowKey;
    const n = sec.materials.length + sec.labors.length;
    const rows = sec.materials.map((m, i) => pMcRow(sIdx, `mat-${i}`, sel === `mat-${i}`, locked,
      `<td>${esc(m.style ?? '')}</td><td class="num">${esc(fmtNum(m.quantity))}</td><td class="num">${esc(mcMatUom(m))}</td><td class="num">${fmtMoney(m.retailPrice)}</td><td class="num">${fmtMoney(materialLineTotal(m))}</td>`, m.name)).join('')
      + sec.labors.map((l, i) => pMcRow(sIdx, `lab-${i}`, sel === `lab-${i}`, locked,
        `<td>${esc(l.description ?? '')}</td><td class="num">${esc(fmtNum(laborQty(l)))}</td><td class="num">${esc(l.uom)}</td><td class="num">${fmtMoney(l.retailPrice)}</td><td class="num">${fmtMoney(laborLineTotal(l))}</td>`, l.name)).join('');
    return `<div class="qm-q-mcsec" data-p-sec="${sIdx}"><div class="qm-q-sh" id="qm-p-sec-t-${sIdx}">${title}</div>`
      + '<div class="qm-q-mchelp">🔘 <em>Pick one option below</em> — only the selected row’s price is added to your total.</div>'
      + `<div class="qm-q-ltwrap" data-keep-scroll><table class="qm-q-lt qm-q-lt-mc" aria-labelledby="qm-p-sec-t-${sIdx}"><thead><tr><th><span class="sr-only">Pick</span></th>${P_HEAD}</tr></thead><tbody>${rows}</tbody></table></div>`
      + `<table class="qm-q-lt qm-q-sectot qm-q-sectot-mc"><tbody><tr><td>${esc(sec.title)} Subtotal (1 of ${n})</td><td class="num">${sub}</td></tr></tbody></table></div>`;
  }
  const rows = sec.materials.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.style ?? '')}</td><td class="num">${esc(fmtNum(m.quantity))}</td><td class="num">${esc(matUom(m))}</td><td class="num">${fmtMoney(m.retailPrice)}</td><td class="num">${fmtMoney(materialLineTotal(m))}</td></tr>`).join('')
    + sec.labors.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.description ?? '')}</td><td class="num">${esc(fmtNum(laborQty(l)))}</td><td class="num">${esc(l.uom)}</td><td class="num">${fmtMoney(l.retailPrice)}</td><td class="num">${fmtMoney(laborLineTotal(l))}</td></tr>`).join('');
  if (sec.kind === 'optional') {
    const on = st.counted;
    return `<div class="qm-q-optsec${on ? ' is-sel' : ''}" data-p-sec="${sIdx}"><div class="qm-q-sh qm-q-sh-opt"><span id="qm-p-sec-t-${sIdx}">${title}</span>`
      + `<label class="qm-q-opttoggle"><input type="checkbox" id="qm-p-opt-${sIdx}" data-popt="${sIdx}"${on ? ' checked' : ''}${locked ? ' disabled' : ''} aria-describedby="qm-p-sec-t-${sIdx}"><span>Add to my quote</span></label></div>`
      + `<div class="qm-q-ltwrap" data-keep-scroll><table class="qm-q-lt qm-q-lt-opt" aria-labelledby="qm-p-sec-t-${sIdx}"><thead><tr>${P_HEAD}</tr></thead><tbody>${rows}</tbody></table></div>`
      + `<table class="qm-q-lt qm-q-sectot qm-q-sectot-opt"><tbody><tr><td>${esc(sec.title)} Subtotal</td><td class="num">${sub}</td></tr></tbody></table></div>`;
  }
  return `<div data-p-sec="${sIdx}"><div class="qm-q-sh" id="qm-p-sec-t-${sIdx}">${title}</div>`
    + `<div class="qm-q-ltwrap" data-keep-scroll><table class="qm-q-lt" aria-labelledby="qm-p-sec-t-${sIdx}"><thead><tr>${P_HEAD}</tr></thead><tbody>${rows}</tbody></table></div>`
    + `<table class="qm-q-lt qm-q-sectot"><tbody><tr><td>${esc(sec.title)} Subtotal</td><td class="num">${sub}</td></tr></tbody></table></div>`;
}

function pTotals(seed: QmSeed, s: QmState, t: QuoteTotals): string {
  // q L1626-1662: ⭐ Optional Add-Ons (each added one +$x, else the help line), one line per Pick
  // One section (its picked row with tax), Sales Tax for what is selected, TOTAL.
  let h = '<div class="qm-q-totals">';
  const opts = optIdxs(s.sections);
  if (opts.length) {
    h += '<div class="qm-q-opthead">⭐ Optional Add-Ons</div>';
    const on = opts.filter((i) => t.sections[i]!.counted);
    if (!on.length) h += '<div class="qm-q-opthelp">Check <em>“Add to my quote”</em> on any optional section above to include it in your total.</div>';
    for (const i of on) h += `<div class="qm-q-row qm-q-optline"><span>⭐ ${esc(t.sections[i]!.title)}</span><span class="num">+${fmtMoney(t.sections[i]!.total)}</span></div>`;
  }
  for (const i of pickIdxs(s.sections)) {
    const ms = t.sections[i]!;
    h += `<div class="qm-q-row qm-q-mcline"><span>${esc(ms.title)}</span><span class="num">${fmtMoney(ms.total)}</span></div>`;
  }
  if (!seed.quote.taxExempt) h += `<div class="qm-q-row"><span>Sales Tax</span><span class="num">${fmtMoney(t.tax)}</span></div>`;
  h += `<div class="qm-q-row qm-q-grand"><span>TOTAL</span><span class="num">${fmtMoney(t.total)}</span></div></div>`;
  return h;
}

function pApproval(s: QmState): string {
  const a = s.approval;
  if (a) {
    const sel = a.selectedTitles.length ? `<div class="qm-q-metax qm-q-selopts"><strong>Selected options:</strong> ${a.selectedTitles.map(esc).join(', ')}</div>` : '';
    return `<div class="qm-q-approved" id="qm-p-approved"><div class="qm-q-big">✓ Quote Approved</div><div class="qm-q-metax">Approved on ${esc(fmtDate(a.at))}</div>${sel}`
      + '<div class="qm-q-lockrow">🔒 Locked — changes disabled</div></div>';
  }
  return '<div class="qm-q-apwrap"><div class="qm-q-aphelp">Click below to approve this quote — we’ll get started right away.</div>'
    + '<button type="button" class="qm-q-approve" id="qm-p-approve" data-approve>✓ Approve Quote</button></div>';
}

/** Builder slots get the app's icon swap; the toast-free q.html slots keep their emoji. */
const BUILDER_SLOT = /^b-/;

/** Every dynamic region of the module, keyed by its data-slot name. */
export function renderSlots(seed: QmSeed, s: QmState): Record<string, string> {
  const bt = builderTotals(seed, s);
  const pt = phoneTotals(seed, s);
  const out: Record<string, string> = {
    'b-status': bStatus(s),
    'b-action': bAction(s),
    'b-gt': bGrand(bt),
    'b-banner': bBanner(seed, s),
    'b-ptot': bPaperTotals(s, bt),
    'b-dep': bDeposit(s, bt),
    'p-stamp': pStamp(s),
    'p-totals': pTotals(seed, s, pt),
    'p-approval': pApproval(s),
  };
  s.sections.forEach((_, i) => {
    out[`b-sec-${i}`] = bSection(seed, s, bt, i);
    out[`p-sec-${i}`] = pSection(s, pt, i);
  });
  for (const k of Object.keys(out)) if (BUILDER_SLOT.test(k)) out[k] = withAppIcons(out[k]!);
  // The QUOTE TOTAL card is docked chrome the app never sweeps — emoji stay.
  out['r-rail'] = bRail(bt);
  return out;
}

// ------------------------------------------------------------ the island --

const TASK_TODO = 'Try it: pick a floor, add the stairs, then tap Approve on the phone.';
const TASK_APPROVED = 'Approved online. Nothing is created yet — press Create WO & Invoice.';
const TASK_DONE = 'Done: WO-330 and IN-330 were made from the customer’s picks.';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initQuoteDemo(): void {
  const rootEl = document.querySelector<HTMLElement>('[data-qm]');
  if (!rootEl || rootEl.dataset.qmReady) return;
  const root: HTMLElement = rootEl;
  root.dataset.qmReady = '1';
  const seedEl = root.querySelector('[data-qm-seed]');
  if (!seedEl) return;
  const seed = JSON.parse(seedEl.textContent || '{}') as QmSeed;
  let s = initialState(seed);

  const $ = <T extends Element = HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const app = $('[data-qm-app]');
  const task = $('[data-task]');
  const privacyBtn = $<HTMLButtonElement>('[data-privacy-btn]');
  const phoneScroll = $('[data-phone-scroll]');
  const phoneScreen = $('[data-phone-screen]');
  const paper = $('[data-q-paper]');
  const live = $('[data-live]');
  const liveChip = $('[data-live-chip]');
  const bToast = $('[data-btoast]');
  const pToast = $('[data-ptoast]');
  const dlg = $<HTMLDialogElement>('[data-qm-dlg]');
  const builderBody = $('[data-qm-body]');

  const slotEls = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => slotEls.set(el.dataset.slot!, el));
  const cache = new Map<string, string>();

  // ---- motion: two small beats (stamp, new documents) + flashes; nothing under reduced motion ----
  // No scale above 1 and no rotation on text: the stamp drops in level, the cards rise.
  const fx = { smooth: false, hide: (_e: Element[]) => {}, stamp: (_e: HTMLElement) => {}, docs: (_e: HTMLElement[]) => {}, open: (_e: Element) => {} };
  gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', still: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const motion = !!ctx.conditions?.motion;
    fx.smooth = motion;
    if (motion) {
      fx.hide = (els) => { gsap.set(els, { autoAlpha: 0 }); };
      fx.stamp = (el) => {
        gsap.timeline()
          .fromTo(el, { y: -14, autoAlpha: 0 }, { y: 0, autoAlpha: 0.9, duration: 0.32, ease: 'power3.in' })
          .fromTo(paper, { y: 0 }, { y: 3, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.out' })
          .set([el, paper], { clearProps: 'transform,opacity,visibility' });
      };
      fx.docs = (els) => { gsap.fromTo(els, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'power2.out', stagger: 0.1, clearProps: 'transform,opacity,visibility' }); };
      fx.open = (el) => { gsap.fromTo(el, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: 'transform,opacity' }); };
    } else {
      fx.hide = () => {};
      fx.stamp = (el) => { gsap.set(el, { clearProps: 'all' }); };
      fx.docs = (els) => { gsap.set(els, { clearProps: 'all' }); };
      fx.open = () => {};
    }
    return () => { fx.smooth = false; fx.hide = () => {}; fx.stamp = () => {}; fx.docs = () => {}; fx.open = () => {}; };
  });

  // ---- feedback ----
  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
  // showToast (main L7895): icon + message, coloured edge by type, gone after 3 s. Toasts are
  // visual only; screen readers hear the same words through the module's live region.
  // Lifted above an open window (Roll Dimensions, Add line item) while one is open.
  const toastB = appToaster(bToast, dlg, 3000);
  let pTimer = 0;
  function toastP(msg: string) {
    pToast.textContent = msg; // q.html toast(): 2.5 s (q L572)
    pToast.classList.add('is-on');
    window.clearTimeout(pTimer);
    pTimer = window.setTimeout(() => pToast.classList.remove('is-on'), 2500);
  }
  let liveTimer = 0;
  function announce(msg: string) {
    window.clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = window.setTimeout(() => { live.textContent = msg; }, 60);
  }
  function pulse() {
    liveChip.classList.remove('is-sync');
    void liveChip.offsetWidth;
    liveChip.classList.add('is-sync');
  }
  function flash(el: Element | null) {
    if (!el) return;
    el.classList.remove('qm-flash');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('qm-flash');
  }

  /** Patch every slot whose HTML changed; keep focus and sideways table scroll where they were. */
  function patch(slots: Record<string, string>, force = false) {
    const active = document.activeElement as HTMLElement | null;
    const activeId = active && root.contains(active) && active.id ? active.id : '';
    for (const [name, html] of Object.entries(slots)) {
      const el = slotEls.get(name);
      if (!el || (!force && cache.get(name) === html)) continue;
      const keep = Array.from(el.querySelectorAll<HTMLElement>('[data-keep-scroll]'), (n) => n.scrollLeft);
      el.innerHTML = html;
      cache.set(name, html);
      el.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach((n, k) => { if (keep[k]) n.scrollLeft = keep[k]!; });
    }
    if (activeId && document.activeElement?.id !== activeId) {
      const again = document.getElementById(activeId) as HTMLInputElement | null;
      if (again && root.contains(again) && !again.disabled) again.focus({ preventScroll: true });
    }
  }

  function sync(force = false): void {
    patch(renderSlots(seed, s), force);
    paper.classList.toggle('is-locked', !!s.approval);
  }

  /** Scroll the phone's own screen (never the page) so `el` is in view. */
  function phoneScrollTo(el: Element | null, align: 'nearest' | 'top' = 'nearest') {
    if (!el) return;
    const sc = phoneScroll;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    const h = el.getBoundingClientRect().height;
    const cur = sc.scrollTop;
    const vh = sc.clientHeight;
    let target = cur;
    if (align === 'top' || top < cur + 8 || h > vh - 24) target = top - 12;
    else if (top + h > cur + vh - 8) target = top + h - vh + 12;
    target = Math.max(0, Math.min(target, sc.scrollHeight - vh));
    if (Math.abs(target - cur) > 2) sc.scrollTo({ top: target, behavior: fx.smooth ? 'smooth' : 'auto' });
  }
  function scrollEnd(el: HTMLElement, maxMs: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; el.removeEventListener('scrollend', finish); resolve(); };
      el.addEventListener('scrollend', finish, { once: true });
      window.setTimeout(finish, maxMs);
    });
  }

  // ---- dialogs (the app's openModal look) — a native modal <dialog>: page inert behind it,
  // Esc closes, focus returns to what opened it ----
  let opener: HTMLElement | null = null;
  let onClose: (() => void) | null = null;
  function openDialog(html: string, opts: { labelledBy: string; width?: number; focus?: string; alert?: boolean; onClose?: () => void }): HTMLElement {
    closeDialog(false);
    const active = document.activeElement as HTMLElement | null;
    opener = active && active !== document.body && root.contains(active) ? active : null;
    dlg.style.setProperty('--dlg-w', `${opts.width ?? 480}px`);
    dlg.setAttribute('aria-labelledby', opts.labelledBy);
    if (opts.alert) dlg.setAttribute('role', 'alertdialog'); else dlg.removeAttribute('role');
    dlg.innerHTML = `<div class="a-dlg">${withAppIcons(html)}</div>`;
    dlg.showModal();
    const box = dlg.querySelector<HTMLElement>('.a-dlg')!;
    fx.open(box);
    const first = (opts.focus ? box.querySelector<HTMLElement>(opts.focus) : null) ?? box.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    onClose = opts.onClose ?? null;
    return box;
  }
  /** Close; focus returns to the opener (or `to`). */
  function closeDialog(restore = true, to: HTMLElement | null = null) {
    if (!dlg.open) return;
    dlg.close();
    dlg.innerHTML = '';
    const cb = onClose;
    onClose = null;
    if (restore) {
      const back = to ?? (opener && opener.isConnected ? opener : null);
      back?.focus({ preventScroll: true });
    }
    opener = null;
    cb?.();
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(); });
  // A click on the backdrop lands on the <dialog> itself (the card fills it).
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeDialog(); });
  const dlgHead = (id: string, title: string) => `<div class="a-dlg-h"><h4 id="${id}">${title}</h4><button type="button" class="a-x" data-close aria-label="Close">✕</button></div>`;

  // ---- builder: the shop's edits ----
  const locked = () => !!s.approval;
  let approving = false;
  let run = 0;

  function lineOf(sIdx: number, key: string): { sec: QmSection; kind: 'mat' | 'lab'; i: number; mat?: QmMaterial; lab?: QuoteLabor } | null {
    const sec = s.sections[sIdx];
    const m = /^(mat|lab)-(\d+)$/.exec(key);
    if (!sec || !m) return null;
    const i = Number(m[2]);
    if (m[1] === 'mat') { const mat = sec.materials[i]; return mat ? { sec, kind: 'mat', i, mat } : null; }
    const lab = sec.labors[i];
    return lab ? { sec, kind: 'lab', i, lab } : null;
  }

  function afterEdit(msg: string) {
    sync();
    pulse();
    flash(slotEls.get('b-gt') ?? null);
    announce(msg);
  }

  function setQty(sIdx: number, key: string, raw: string) {
    if (locked()) return;
    const L = lineOf(sIdx, key);
    if (!L) return;
    const v = raw.trim();
    if (L.mat) {
      const m = L.mat;
      // setQBMaterialQty (main L13214): carton products snap UP to whole cartons; rolled SqYd lines
      // keep what was typed and get their cut length filled (_rollLengthFromQty L13153).
      m.quantity = materialQtyFromInput(v === '' ? '' : Math.max(0, Number(v) || 0), Number(m.coveragePerUOM) || 0);
      const patchL = rollLengthFromQty({ ...m, item: m.name, category: m.category });
      if (patchL) Object.assign(m, patchL);
      const x = qtyExtra(m);
      const tail = x?.kind === 'cartons' ? ` — ${x.hint.text}` : x?.kind === 'roll' ? ` — cut length ${x.text}${x.width ? ' ' + x.width.text : ''}` : '';
      afterEdit(`${m.name}: ${fmtQty(m.quantity) || 'blank'} ${matUom(m)}${tail}. Grand total ${fmtMoney(builderTotals(seed, s).total)}.`);
    } else if (L.lab) {
      L.lab.quantity = v === '' ? '' : Math.max(0, Number(v) || 0);
      afterEdit(`${L.lab.name}: ${fmtQty(L.lab.quantity) || 'blank'} ${L.lab.uom}. Grand total ${fmtMoney(builderTotals(seed, s).total)}.`);
    }
  }

  function setPrice(sIdx: number, key: string, raw: string) {
    if (locked()) return;
    const L = lineOf(sIdx, key);
    if (!L) return;
    const p = Math.max(0, Number(raw) || 0);
    if (L.mat) L.mat.retailPrice = p;
    if (L.lab) L.lab.retailPrice = p;
    afterEdit(`${(L.mat ?? L.lab)!.name} priced at ${fmtMoney(p)}. Grand total ${fmtMoney(builderTotals(seed, s).total)}.`);
  }

  function setDefaultPick(sIdx: number, key: RowKey) {
    if (locked() || approving) return;
    const sec = s.sections[sIdx];
    if (!sec || !rowName(sec, key) || s.defaultPicks[sIdx] === key) return;
    s.defaultPicks[sIdx] = key;
    sec.chosenRowKey = key;
    // The customer's page opens on the saved default — as if they reloaded it.
    s.phonePicks[sIdx] = key;
    sync();
    pulse();
    flash(slotEls.get('b-gt') ?? null);
    flash(phoneScroll.querySelector(`[data-mc="${sIdx}:${key}"]`));
    phoneScrollTo(phoneScroll.querySelector(`[data-p-sec="${sIdx}"]`));
    announce(`Default set to ${rowName(sec, key)}. The customer’s page now opens on it. Grand total ${fmtMoney(builderTotals(seed, s).total)}.`);
  }

  function applyJobArea(sIdx: number, uom: 'SqFt' | 'SqYd') {
    if (locked()) return;
    const sec = s.sections[sIdx];
    if (!sec?.area) return;
    const input = root.querySelector<HTMLInputElement>(`#qm-area-${sIdx}-${uom.toLowerCase()}`);
    const value = Math.min(Math.max(0, Number(input?.value) || 0), 99999);
    // applyAreaQty (main L14989) for this one section.
    const res = applyArea(value, uom, sec.materials, sec.labors);
    if (!res) {
      toastB('Enter a value first.', 'warning'); // an alert() in the app
      announce('Enter a value first.');
      input?.focus();
      return;
    }
    if (uom === 'SqFt') sec.area.sqft = value; else sec.area.sqyd = value;
    res.materialQty.forEach((q, k) => {
      if (q == null) return;
      const m = sec.materials[k]!;
      m.quantity = q;
    });
    res.laborQty.forEach((q, k) => { if (q != null) sec.labors[k]!.quantity = q; });
    sync();
    pulse();
    flash(slotEls.get('b-gt') ?? null);
    const type = res.matFilled + res.labFilled === 0 ? 'info' : 'success';
    toastB(res.toast, type);
    announce(`${res.toast}. Grand total ${fmtMoney(builderTotals(seed, s).total)}.`);
  }

  function setDownPct(raw: string) {
    if (locked()) return;
    const n = Number(raw);
    s.downPct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    sync();
    announce(`Down payment ${s.downPct}%: ${depositLabel(quoteDeposit(builderTotals(seed, s), s.downPct)).replace('→ ', '')}.`);
  }

  function setPrivacy(on: boolean, withToast: boolean) {
    app.dataset.privacy = on ? 'on' : 'off';
    privacyBtn.setAttribute('aria-pressed', String(on));
    privacyBtn.innerHTML = iconSvg(on ? 'sunglasses' : 'eye');
    // togglePrivacyMode (main L28637): the topbar icon flips eye ↔ sunglasses, and these toasts.
    const msg = on ? '🕶️ Privacy mode on — cost & margin hidden' : '👁 Privacy mode off — internal data visible';
    if (withToast) { toastB(msg, 'info'); announce(on ? 'Privacy mode on — cost and margin hidden.' : 'Privacy mode off — internal data visible.'); }
  }

  // ---- Roll Dimensions (main L13174-13258), through the roll helpers ----
  function openRoll(sIdx: number, i: number) {
    if (locked()) return;
    const m = s.sections[sIdx]?.materials[i];
    if (!m) return;
    const line = { ...m, item: m.name, category: m.category };
    const d = rollDimsDialog(line);
    const canClear = (Number(m.rollWidth) || 0) > 0 || (Number(m.lengthFt) || 0) > 0 || (Number(m.lengthIn) || 0) > 0;
    const box = openDialog(
      dlgHead('qm-rd-h', '📐 Roll Dimensions')
      + `<div class="a-dlg-b"><p class="qm-rd-intro">${esc(d.intro).replace('length × width / 9', '<em>length × width / 9</em>')}</p>`
      + '<div class="qm-rd">'
      + `<fieldset><legend>Roll Width</legend><div class="qm-rd-in"><input type="number" min="0" step="1" inputmode="decimal" data-rd="wft" value="${esc(d.widthFt)}" placeholder="ft" aria-label="Roll width, feet"><span aria-hidden="true">ft</span><input type="number" min="0" max="11.99" step="0.01" inputmode="decimal" data-rd="win" value="${esc(d.widthIn)}" placeholder="in" aria-label="Roll width, inches"><span aria-hidden="true">in</span></div></fieldset>`
      + `<fieldset><legend>Length</legend><div class="qm-rd-in"><input type="number" min="0" step="1" inputmode="decimal" data-rd="lft" value="${esc(d.lengthFt)}" placeholder="ft" aria-label="Length, feet"><span aria-hidden="true">ft</span><input type="number" min="0" max="11.99" step="0.01" inputmode="decimal" data-rd="lin" value="${esc(d.lengthIn)}" placeholder="in" aria-label="Length, inches"><span aria-hidden="true">in</span></div></fieldset>`
      + '</div>'
      + (d.note ? `<div class="qm-rd-note">${esc(d.note)}</div>` : '')
      + '<div class="qm-rd-prev" data-rd-preview aria-live="polite">Enter width and length</div>'
      + '<div class="a-warnbox">💡 Common carpet widths: 12\', 13\' 2", 15\'.</div></div>'
      + `<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button>${canClear ? '<button type="button" class="a-btn a-outline qm-rd-clear" data-rd-clear>Clear</button>' : ''}<button type="button" class="a-btn a-primary" data-rd-save>Save</button></div>`,
      { labelledBy: 'qm-rd-h', width: 500, focus: '[data-rd="lft"]' },
    );
    const inp = (k: string) => box.querySelector<HTMLInputElement>(`[data-rd="${k}"]`)!;
    let typed = false;
    const q = Number(m.quantity) || 0;
    const update = () => {
      const wf = Number(inp('wft').value) || 0, wi = Number(inp('win').value) || 0;
      if (d.fromQty && !typed) {
        const r = rollDimensionsFromQty(wf, wi, q);
        inp('lft').value = String(r.lengthFt);
        inp('lin').value = String(r.lengthIn);
        box.querySelector('[data-rd-preview]')!.textContent = r.preview;
        return;
      }
      box.querySelector('[data-rd-preview]')!.textContent = rollDimensionsPreview(wf, wi, Number(inp('lft').value) || 0, Number(inp('lin').value) || 0);
    };
    ['wft', 'win'].forEach((k) => inp(k).addEventListener('input', update));
    ['lft', 'lin'].forEach((k) => inp(k).addEventListener('input', () => { typed = true; update(); }));
    update();
    const opener0 = () => root.querySelector<HTMLElement>(`[data-roll="${sIdx}:${i}"]`);
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeDialog(); return; }
      if (t.matches('[data-rd-clear]')) {
        m.rollWidth = undefined; m.lengthFt = undefined; m.lengthIn = undefined; delete m.rollWidthAssumed;
        closeDialog(false);
        afterEdit(`${m.name}: roll width and length cleared.`);
        opener0()?.focus({ preventScroll: true });
        return;
      }
      if (!t.matches('[data-rd-save]')) return;
      const res = applyRollDimensions(line, { widthFt: inp('wft').value, widthIn: inp('win').value, lengthFt: inp('lft').value, lengthIn: inp('lin').value, typed });
      const p = res.patch;
      if (p.rollWidth !== undefined) { m.rollWidth = p.rollWidth; delete m.rollWidthAssumed; }
      if (p.rollWidthAssumed) m.rollWidthAssumed = true;
      if (p.lengthFt !== undefined) m.lengthFt = p.lengthFt === '' ? undefined : p.lengthFt;
      if (p.lengthIn !== undefined) m.lengthIn = p.lengthIn === '' ? undefined : p.lengthIn;
      if (p.quantity !== undefined) m.quantity = p.quantity;
      closeDialog(false);
      const x = qtyExtra(m);
      afterEdit(`${m.name}: ${x?.kind === 'roll' ? `cut length ${x.text} ${x.width ? x.width.text : ''}, ` : ''}${fmtQty(m.quantity)} SqYd. Grand total ${fmtMoney(builderTotals(seed, s).total)}.`);
      opener0()?.focus({ preventScroll: true });
    });
  }

  // ---- "+ Add line item" (main L14058-14100): menu → search window → the line ----
  type Pick = { t: 'custom' } | { t: 'product'; p: QmCatalogProduct } | { t: 'lab'; l: QmCatalogLabor };
  const ALI_KINDS = {
    mat: { menu: '+ Add material', title: 'Add material', ph: 'Search inventory and the product catalog…', what: 'material' },
    lab: { menu: '+ Add labor', title: 'Add labor', ph: 'Search labor…', what: 'labor' },
    trans: { menu: '+ Add transitions', title: 'Add transitions', ph: 'Search transitions…', what: 'transition' },
  } as const;
  type AliKind = keyof typeof ALI_KINDS;
  const isTransition = (c: string) => /transition/i.test(c || '');
  let menuEl: HTMLElement | null = null;
  let menuBtn: HTMLElement | null = null;

  function closeMenu(focusBtn = false) {
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); if (focusBtn) menuBtn.focus({ preventScroll: true }); }
    menuBtn = null;
    document.removeEventListener('mousedown', onMenuOutside, true);
  }
  function onMenuOutside(e: MouseEvent) {
    if (menuEl && (menuEl.contains(e.target as Node) || (menuBtn && menuBtn.contains(e.target as Node)))) return;
    closeMenu();
  }
  function openMenu(btn: HTMLElement, sIdx: number) {
    if (locked()) return;
    if (menuEl) { const same = menuBtn === btn; closeMenu(); if (same) return; }
    menuBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    const m = document.createElement('div');
    m.className = 'qm-menu';
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', 'Add line item');
    m.innerHTML = (Object.keys(ALI_KINDS) as AliKind[]).map((k) => `<button type="button" role="menuitem" tabindex="-1" data-kind="${k}">${ALI_KINDS[k].menu}</button>`).join('');
    btn.parentElement!.appendChild(m);
    menuEl = m;
    const items = Array.from(m.querySelectorAll<HTMLButtonElement>('button'));
    items[0]?.focus({ preventScroll: true });
    m.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = items.length, d = e.key === 'ArrowDown' ? 1 : -1; items[(i < 0 ? 0 : i + d + n) % n]!.focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0]!.focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]!.focus(); }
      else if (e.key === 'Tab') closeMenu();
    });
    m.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-kind]');
      if (!b) return;
      const opener1 = menuBtn;
      closeMenu();
      openPicker(sIdx, b.dataset.kind as AliKind, opener1);
    });
    window.setTimeout(() => document.addEventListener('mousedown', onMenuOutside, true), 0);
  }

  function searchCatalog(kind: AliKind, q: string): Pick[] {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (fields: string[]) => !toks.length || toks.every((t) => fields.some((f) => f.toLowerCase().includes(t)));
    if (kind === 'lab') return seed.catalog.labor.filter((l) => hit([l.name, l.description ?? '', l.uom])).map((l) => ({ t: 'lab', l }) as Pick);
    const wantT = kind === 'trans';
    return seed.catalog.products.filter((p) => isTransition(p.category) === wantT && hit([p.name, p.matNum, p.vendor, p.category])).map((p) => ({ t: 'product', p }) as Pick);
  }

  function openPicker(sIdx: number, kind: AliKind, backTo: HTMLElement | null) {
    const K = ALI_KINDS[kind];
    const sec = s.sections[sIdx];
    if (!sec) return;
    let items: Pick[] = [];
    let active = 0;
    const box = openDialog(
      dlgHead('qm-ali-h', K.title)
      + `<div class="a-dlg-b" data-ali-pane></div><div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button></div>`,
      { labelledBy: 'qm-ali-h', width: 540 },
    );
    if (backTo) opener = backTo;
    const pane = box.querySelector<HTMLElement>('[data-ali-pane]')!;
    const showSearch = (q = '') => {
      pane.innerHTML = `<input type="text" class="a-input qm-ali-search" data-ali-q placeholder="${esc(K.ph)}" autocomplete="off" value="${esc(q)}" role="combobox" aria-expanded="true" aria-controls="qm-ali-list" aria-autocomplete="list" aria-label="${esc(K.ph)}"><div class="qm-ali-list" id="qm-ali-list" role="listbox" aria-label="${esc(K.title)}"></div>`;
      const input = pane.querySelector<HTMLInputElement>('[data-ali-q]')!;
      const list = pane.querySelector<HTMLElement>('#qm-ali-list')!;
      const paint = () => {
        list.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => {
          const on = Number(el.dataset.i) === active;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-selected', on ? 'true' : 'false');
          if (on) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
        });
      };
      const render = () => {
        const query = input.value.trim();
        const found = searchCatalog(kind, query);
        items = [{ t: 'custom' }, ...found];
        active = query && found.length ? 1 : 0;
        let h = `<div class="qm-ali-opt qm-ali-custom" role="option" id="qm-ali-o0" data-i="0"><div class="qm-ali-main">✎ Custom / misc</div><div class="qm-ali-sub">${query ? `Add “${esc(query)}” as a free-text ${K.what} line` : `Type your own ${K.what} line — not linked to the catalog`}</div></div>`;
        let last = '';
        found.forEach((x, k) => {
          const grp = x.t === 'lab' ? 'Labor' : 'Product catalog';
          if (grp !== last) { last = grp; h += `<div class="qm-ali-group" role="presentation">${grp}</div>`; }
          if (x.t === 'lab') {
            const l = x.l;
            h += `<div class="qm-ali-opt" role="option" id="qm-ali-o${k + 1}" data-i="${k + 1}"><div class="qm-ali-main">${esc(l.name)} <span class="qm-ali-badge is-lab">Labor</span></div><div class="qm-ali-sub">UOM: ${esc(l.uom)} • Cost: ${fmtMoney(l.companyCost)}/${esc(l.uom)} • Retail: ${fmtMoney(l.retailPrice)}/${esc(l.uom)}</div></div>`;
          } else if (x.t === 'product') {
            const p = x.p;
            h += `<div class="qm-ali-opt" role="option" id="qm-ali-o${k + 1}" data-i="${k + 1}"><div class="qm-ali-main">${esc(p.name)} <span class="qm-ali-badge is-prod">Product</span></div><div class="qm-ali-sub">${esc(p.matNum)} • ${esc(p.vendor)}</div></div>`;
          }
        });
        if (!found.length) h += `<div class="qm-ali-empty">${query ? 'No matches — choose Custom / misc to add it as a free-text line.' : 'Nothing to list yet.'}</div>`;
        list.innerHTML = h;
        paint();
      };
      input.addEventListener('input', render);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = items.length; if (!n) return; active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; paint(); }
        else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
      });
      list.addEventListener('mousedown', (e) => e.preventDefault());
      list.addEventListener('click', (e) => { const o = (e.target as HTMLElement).closest<HTMLElement>('[data-i]'); if (o) choose(Number(o.dataset.i)); });
      render();
      input.focus({ preventScroll: true });
    };
    const showCustom = (q: string) => {
      pane.innerHTML = `<p class="qm-ali-hint">Custom ${K.what} line — free text, not linked to the catalog. Set its qty and price on the line.</p>`
        + `<div class="qm-ali-cform"><input type="text" class="a-input" data-ali-name placeholder="Name this ${K.what} line…" autocomplete="off" value="${esc(q)}" aria-label="Name this ${K.what} line"><button type="button" class="a-btn a-primary" data-ali-add>Add line</button></div>`
        + '<button type="button" class="a-link qm-ali-back" data-ali-back>← Back to search</button>';
      const name = pane.querySelector<HTMLInputElement>('[data-ali-name]')!;
      const confirm = () => { const v = name.value.trim(); if (!v) { name.classList.add('is-need'); name.focus(); return; } commit({ t: 'custom' }, v); };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
      pane.querySelector('[data-ali-add]')!.addEventListener('click', confirm);
      pane.querySelector('[data-ali-back]')!.addEventListener('click', () => showSearch(q));
      name.focus({ preventScroll: true });
    };
    const choose = (i: number) => {
      const x = items[i];
      if (!x) return;
      if (x.t === 'custom') { showCustom(pane.querySelector<HTMLInputElement>('[data-ali-q]')?.value.trim() ?? ''); return; }
      commit(x, '');
    };
    const commit = (x: Pick, customName: string) => {
      // _qbAliAdd (main L14098): a blank-quantity line in this section, filled from the pick.
      let key: RowKey;
      let label: string;
      if (x.t === 'lab' || (x.t === 'custom' && kind === 'lab')) {
        const l: QuoteLabor = x.t === 'lab'
          ? { name: x.l.name, ...(x.l.description ? { description: x.l.description } : {}), uom: x.l.uom, quantity: '', retailPrice: x.l.retailPrice, companyCost: x.l.companyCost }
          : { name: customName, uom: '', quantity: '', retailPrice: 0, companyCost: 0 };
        sec.labors.push(l);
        key = `lab-${sec.labors.length - 1}`;
        label = l.name;
      } else {
        const p = x.t === 'product' ? x.p : null;
        const m: QmMaterial = p
          ? { name: p.name, matNum: p.matNum, quantity: '', retailPrice: p.retailPrice, companyCost: p.companyCost, purchaseUOM: p.purchaseUOM, costUOM: p.costUOM, coverageUOM: p.costUOM, coveragePerUOM: p.coverage, category: p.category, vendor: p.vendor, ...(p.rollWidth ? { rollWidth: p.rollWidth } : {}) }
          : { name: customName, quantity: '', retailPrice: 0, companyCost: 0, ...(kind === 'trans' ? { category: 'Trim/Transition' } : {}) };
        sec.materials.push(m);
        key = `mat-${sec.materials.length - 1}`;
        label = m.name;
      }
      closeDialog(false);
      sync();
      pulse();
      const q = root.querySelector<HTMLInputElement>(`#qm-b-${sIdx}-${key}-q`);
      flash(q?.closest('tr') ?? null);
      q?.focus({ preventScroll: false });
      announce(`${label} added to ${sec.title}. Type its quantity${x.t === 'custom' ? ' and price' : ''}.`);
    };
    showSearch('');
  }

  // ---- the customer, on their phone ----
  function setPhonePick(sIdx: number, key: RowKey) {
    if (s.approval || approving) return;
    const sec = s.sections[sIdx];
    if (!sec || !rowName(sec, key) || s.phonePicks[sIdx] === key) return;
    s.phonePicks[sIdx] = key;
    sync();
    pulse();
    flash(phoneScroll.querySelector('.qm-q-grand'));
    announce(`On the phone: ${rowName(sec, key)} picked. Customer’s total ${fmtMoney(phoneTotals(seed, s).total)}.`);
  }
  function setPhoneOpt(sIdx: number, on: boolean) {
    if (s.approval || approving) return;
    const has = s.phoneOpts.includes(sIdx);
    if (on === has) return;
    s.phoneOpts = on ? [...s.phoneOpts, sIdx].sort((a, b) => a - b) : s.phoneOpts.filter((i) => i !== sIdx);
    sync();
    pulse();
    flash(phoneScroll.querySelector('.qm-q-grand'));
    announce(`On the phone: ${s.sections[sIdx]!.title} ${on ? 'added to' : 'taken off'} the quote. Customer’s total ${fmtMoney(phoneTotals(seed, s).total)}.`);
  }

  async function approve() {
    if (s.approval || approving) return;
    approving = true;
    const mine = ++run;
    const btn = root.querySelector<HTMLButtonElement>('[data-approve]');
    if (btn) btn.disabled = true;
    const pt = phoneTotals(seed, s);
    const pickOne: Record<number, RowKey> = {};
    for (const i of pickIdxs(s.sections)) pickOne[i] = pt.sections[i]!.chosenRowKey ?? 'mat-0';
    const optional = s.phoneOpts.slice();
    const selectedTitles = [...optional.map((k) => s.sections[k]!.title), ...pickIdxs(s.sections).map((k) => s.sections[k]!.title)];
    toastP(CUSTOMER_APPROVED_TOAST); // q L783
    await wait(fx.smooth ? 800 : 0); // the page reloads approved (q L784-814)
    if (mine !== run) return;
    s.approval = { at: seed.approveDay, selection: { pickOne, optional }, selectedTitles };
    sync();
    pulse();
    const stamp = phoneScroll.querySelector<HTMLElement>('.qm-q-stamp');
    if (stamp) fx.hide([stamp]);
    phoneScroll.focus({ preventScroll: true });
    if (phoneScroll.scrollTop > 2) {
      phoneScroll.scrollTo({ top: 0, behavior: fx.smooth ? 'smooth' : 'auto' });
      if (fx.smooth) await scrollEnd(phoneScroll, 900);
      if (mine !== run) return;
    }
    if (stamp) fx.stamp(stamp);
    approving = false;
    flash(root.querySelector('[data-convert]'));
    task.textContent = TASK_APPROVED;
    announce(`${seed.customer.name} approved ${seed.quote.number} on their phone with ${selectedTitles.join(' and ')}. Nothing has been created yet. In the office, the quote now shows Create WO and Invoice.`);
  }

  // ---- the office: 🔨 Create WO & Invoice → confirm → approveQuote ----
  function openConvert() {
    if (!s.approval || s.converted) return;
    const d = convertApprovedQuoteDialog(seed.quote.number, seed.customer.name, true);
    const box = openDialog(
      dlgHead('qm-cv-h', esc(d.title))
      // Document numbers never break at their hyphen ("WO-|330").
      + `<div class="a-dlg-b"><p class="qm-cv-p">${d.strong ? `<strong>${esc(d.strong)}</strong>` : ''}${esc(d.rest).replace(/\b(?:WO|IN|QT|LD)-\d+/g, (n) => `<span class="a-nowrap">${n}</span>`)}</p></div>`
      + `<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>${esc(d.cancel)}</button><button type="button" class="a-btn a-success" data-cv-go>${esc(d.button)}</button></div>`,
      { labelledBy: 'qm-cv-h', width: 560, focus: '[data-cv-go]' },
    );
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeDialog(); return; }
      if (t.matches('[data-cv-go]')) { closeDialog(false); convert(); }
    });
  }

  function convert() {
    if (!s.approval || s.converted) return;
    const result = approveQuote(
      {
        number: seed.quote.number, sections: s.sections, taxRate: seed.quote.taxRate, taxExempt: seed.quote.taxExempt,
        paymentTerms: seed.quote.paymentTerms, downPaymentPct: s.downPct, salesRepId: seed.rep.id, lead: seed.lead,
      },
      s.approval.selection,
      seed.counters,
      seed.approveDay,
    );
    s.converted = result;
    sync();
    const docs = Array.from(root.querySelectorAll<HTMLElement>('[data-docs] .qm-doc'));
    fx.hide(docs);
    const docsBox = root.querySelector<HTMLElement>('[data-docs]');
    builderBody.scrollTo({ top: 0, behavior: fx.smooth ? 'smooth' : 'auto' });
    toastB(result.toast);
    fx.docs(docs);
    docsBox?.focus({ preventScroll: true });
    if (docsBox) {
      const r = docsBox.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(root).getPropertyValue('--app-stick')) || 84;
      if (r.top < top + 60 || r.bottom > window.innerHeight) docsBox.scrollIntoView({ block: 'center', behavior: fx.smooth ? 'smooth' : 'auto' });
    }
    task.textContent = TASK_DONE;
    task.classList.add('is-done');
    announce(`${result.toast} ${TASK_DONE}`);
  }

  function reset() {
    run++;
    approving = false;
    gsap.killTweensOf(root.querySelectorAll('.qm-q-stamp, .qm-doc'));
    gsap.killTweensOf(paper);
    gsap.set(paper, { clearProps: 'transform' });
    closeMenu();
    closeDialog(false);
    s = initialState(seed);
    setPrivacy(false, false);
    sync(true);
    phoneScroll.scrollTop = 0;
    builderBody.scrollTop = 0;
    root.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach((n) => { n.scrollLeft = 0; });
    window.clearTimeout(pTimer);
    bToast.classList.remove('is-on');
    pToast.classList.remove('is-on');
    task.textContent = TASK_TODO;
    task.classList.remove('is-done');
    announce('Demo reset. QT-330 is back to Sent.');
  }

  // ---- wiring (event delegation, so patched markup needs no re-binding) ----
  // Quantity / price / area boxes commit on change (blur or Enter), like the app's onchange.
  // The re-render waits a tick so focus can land on the next field first.
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    // Enter commits once; the blur that follows must not commit the same value again.
    if ((el.dataset.qty || el.dataset.price || el.dataset.dp !== undefined) && el.dataset.committed === el.value) return;
    if (el.dataset.qty || el.dataset.price || el.dataset.dp !== undefined) el.dataset.committed = el.value;
    if (el.dataset.qty) { const [a, b] = el.dataset.qty.split(':'); window.setTimeout(() => setQty(Number(a), b!, el.value), 0); }
    else if (el.dataset.price) { const [a, b] = el.dataset.price.split(':'); window.setTimeout(() => setPrice(Number(a), b!, el.value), 0); }
    else if (el.dataset.areain) {
      const [a, u] = el.dataset.areain.split(':');
      const sec = s.sections[Number(a)];
      if (sec?.area) { const v = el.value === '' ? '' : Math.max(0, Number(el.value) || 0); if (u === 'SqFt') sec.area.sqft = v; else sec.area.sqyd = v; }
    } else if (el.matches('[data-dp]')) window.setTimeout(() => setDownPct(el.value), 0);
    else if (el.dataset.bpick) setDefaultPick(Number(el.dataset.bpick), el.value as RowKey);
    else if (el.dataset.ppick) setPhonePick(Number(el.dataset.ppick), el.value as RowKey);
    else if (el.dataset.popt) setPhoneOpt(Number(el.dataset.popt), el.checked);
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    if (e.key !== 'Enter' || !(el instanceof HTMLInputElement)) return;
    if (el.dataset.areain) {
      e.preventDefault();
      const [a, u] = el.dataset.areain.split(':');
      el.dispatchEvent(new Event('change', { bubbles: true }));
      applyJobArea(Number(a), u as 'SqFt' | 'SqYd');
    } else if (el.dataset.qty || el.dataset.price || el.matches('[data-dp]')) {
      e.preventDefault();
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-reset]')) { reset(); (root.querySelector<HTMLElement>('.mod-foot [data-reset]'))?.focus({ preventScroll: true }); return; }
    if (target.closest('[data-approve]')) { void approve(); return; }
    if (target.closest('[data-convert]')) { openConvert(); return; }
    if (target.closest('[data-privacy-btn]')) { setPrivacy(app.dataset.privacy !== 'on', true); return; }
    const area = target.closest<HTMLElement>('[data-area]');
    if (area) { const [a, u] = area.dataset.area!.split(':'); applyJobArea(Number(a), u as 'SqFt' | 'SqYd'); return; }
    const roll = target.closest<HTMLElement>('[data-roll]');
    if (roll) { const [a, b] = roll.dataset.roll!.split(':').map(Number); openRoll(a ?? -1, b ?? -1); return; }
    const ali = target.closest<HTMLElement>('[data-ali]');
    if (ali) { openMenu(ali, Number(ali.dataset.ali)); return; }
    // q.html: tapping anywhere on a Pick One row picks it (q L1197); the radio itself goes through 'change'.
    const row = target.closest<HTMLElement>('tr.qm-q-mcrow');
    if (row && !target.closest('input')) { const [a, b] = row.dataset.mc!.split(':'); setPhonePick(Number(a), b as RowKey); }
  });

  // The customer's page is laid out at a 430 px phone viewport and zoomed (CSS zoom < 1 keeps text
  // crisp — no transform) to the drawn screen; QuoteModule.astro has the no-JS steps.
  const fitPhone = () => {
    const w = phoneScroll.clientWidth;
    if (w > 0) phoneScreen.style.setProperty('--qm-qz', String(Math.floor((w / 430) * 10000) / 10000));
  };
  fitPhone();
  // Toasts dock right under the sticky builder header, whatever its height (one or two rows).
  const head = root.querySelector<HTMLElement>('.qm-top');
  const fitHead = () => { if (head) root.style.setProperty('--qm-head', `${Math.round(head.offsetHeight)}px`); };
  fitHead();
  if ('ResizeObserver' in window) {
    new ResizeObserver(fitPhone).observe(phoneScroll);
    if (head) new ResizeObserver(fitHead).observe(head);
  }

  // Hydrate: write the same markup the server rendered, then hand over.
  setPrivacy(false, false);
  sync(true);
  task.textContent = TASK_TODO;
  root.classList.add('is-live');
}
