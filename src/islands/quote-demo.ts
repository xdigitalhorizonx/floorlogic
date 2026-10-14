// "Quote a job → the customer approves it on their phone" — the flagship try-it module.
//
// Faithful to the live app (demo `main`), not an invented UI:
//   builder  — renderQuoteBuilder (main L10424): section cards with the blue / purple bands, the
//              Job Area bar (L10680), the Pick One banner + radio rows (L10882, L11251), the carton
//              and roll hints (qbBuildQtyExtraHtml L11207), "Round Labor Up?" (L12664), the totals
//              rail (_computeTotalsData L23236), Privacy Mode (L23978) and the locked banner (L10622).
//   phone    — the customer's live quote page, q.html laid out at a 430 px phone viewport and zoomed
//              to the drawn screen: header card, BILL TO, section
//              bands, Pick One rows (q L1154-1176), "Add to my quote" (q L1199), the totals block
//              (q L1578-1613), Approve (q L1341), the APPROVED stamp (q L418) and the approved card.
//
// Every number comes from src/lib/logic — this file only lays them out. One state object drives
// both screens. Everything runs in the browser on fictional sample data; nothing is sent anywhere.
//
// The render functions below return HTML strings so QuoteModule.astro can server-render the exact
// same markup the browser later patches (no blank flash, and a static picture without JS).
import gsap from 'gsap';
import {
  applyArea,
  approveQuote,
  chosenRowKey,
  computeQuoteTotals,
  depositLabel,
  dueNowView,
  fmtDate,
  fmtMoney,
  fmtNum,
  fmtQty,
  laborLineTotal,
  laborQty,
  materialLineTotal,
  qtyExtra,
  quoteDeposit,
  rollDimensionsPreview,
  rollWidthFromFtIn,
  ROUND_LABOR_COPY,
  sqYdFromLength,
  WO_LABELS,
  type ApprovedQuote,
  type ISODate,
  type QuoteLabor,
  type QuoteMaterial,
  type QuotePicks,
  type QuoteSection,
  type QuoteSelection,
  type QuoteTotals,
  type RoundLaborPrompt,
  type RowKey,
} from '../lib/logic';

// ------------------------------------------------------------------ types --

/** Everything the module needs, built from src/data/sample-data.ts in QuoteModule.astro. */
export interface QmSeed {
  today: ISODate;
  /** Fixed clock for the invoice's "Due Now" maths (noon UTC on `today`). */
  nowMs: number;
  quote: {
    number: string;
    createdAt: ISODate;
    expirationDate: ISODate;
    taxRate: number;
    taxCounty: string;
    taxExempt: boolean;
    paymentTerms: string;
    downPaymentPct: number;
    jobArea: { value: number; uom: string };
    sections: QuoteSection[];
  };
  customer: { name: string; initials: string; phone: string; email: string; city: string };
  rep: { name: string; email: string };
  shop: { name: string; address: string; city: string; phone: string; email: string };
  counters: { job: number; invoice: number };
}

export interface QmApproval {
  result: ApprovedQuote;
  at: ISODate;
  selection: QuoteSelection;
  /** "Selected options:" on the approved card — optional sections first, then Pick One (q L752-768). */
  selectedTitles: string[];
}

export interface QmState {
  sections: QuoteSection[];
  /** The Pick One row — one value shared by the builder radio and the phone radio. */
  pick: RowKey;
  /** The optional section is in the quote (builder toggle = phone "Add to my quote"). */
  addOpt: boolean;
  approval: QmApproval | null;
}

// ---------------------------------------------------------------- helpers --

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Builder line cells print like the app's inputs: "$" + toFixed(2), no grouping (main L11251). */
const inputMoney = (n: unknown): string => '$' + (Number(n) || 0).toFixed(2);

/** Unit shown on a material line (builder + regular q.html rows): cost, coverage, then purchase UOM. */
const matUom = (m: QuoteMaterial): string => m.costUOM || m.coverageUOM || m.purchaseUOM || '';
/** q.html's Pick One rows read coverage, then purchase UOM (q L1159). */
const mcMatUom = (m: QuoteMaterial): string => m.coverageUOM || m.purchaseUOM || '';

interface Idx { pick: number; opt: number; req: number }
function indexes(sections: readonly QuoteSection[]): Idx {
  return {
    pick: sections.findIndex((s) => s.kind === 'pickOne'),
    opt: sections.findIndex((s) => s.kind === 'optional'),
    req: sections.findIndex((s) => s.kind === 'required'),
  };
}

/** Split a stored roll width into the dialog's ft + in fields, as the app does (main L10988). */
function rollFtIn(width: unknown): { ft: number; inches: number } {
  const w = Number(width) || 0;
  const ft = Math.floor(w);
  return { ft, inches: Math.round((w - ft) * 12 * 100) / 100 };
}

function rowName(sec: QuoteSection, key: RowKey): string {
  const m = /^(mat|lab)-(\d+)$/.exec(key);
  if (!m) return '';
  const i = Number(m[2]);
  return (m[1] === 'mat' ? sec.materials[i]?.name : sec.labors[i]?.name) ?? '';
}

export function initialState(seed: QmSeed): QmState {
  const sections = JSON.parse(JSON.stringify(seed.quote.sections)) as QuoteSection[];
  const i = indexes(sections);
  const pick = (i.pick >= 0 ? chosenRowKey(sections[i.pick]!, i.pick) : null) ?? 'mat-0';
  return { sections, pick, addOpt: false, approval: null };
}

function picksOf(state: QmState): QuotePicks {
  const i = indexes(state.sections);
  return {
    pickOne: i.pick >= 0 ? { [i.pick]: state.pick } : {},
    optional: state.addOpt && i.opt >= 0 ? [i.opt] : [],
  };
}

export function totalsOf(seed: QmSeed, state: QmState): QuoteTotals {
  return computeQuoteTotals({ sections: state.sections, taxRate: seed.quote.taxRate, taxExempt: seed.quote.taxExempt }, picksOf(state));
}

// ------------------------------------------------------- builder (the app) --

function bStatus(state: QmState): string {
  // QUOTE_STATUS_COLORS (main L6512): sent = blue, approved = green.
  return state.approval ? '<span class="a-pill a-green">Approved</span>' : '<span class="a-pill a-blue">Sent</span>';
}

function bGrandTotal(t: QuoteTotals): string {
  return `<span class="qm-gt-cap">Grand Total</span><span class="qm-gt-val num">${fmtMoney(t.total)}</span>`;
}

function bBanner(state: QmState): string {
  if (!state.approval) return '';
  // main L10622 (qb-locked-banner). The app's second sentence points at section lock icons this
  // module does not draw, so only the first sentence is kept.
  return '<div class="qm-lock" role="note"><span class="qm-lock-ic" aria-hidden="true">🔒</span><div><span class="qm-lock-t">This quote is locked</span>'
    + '<span>The work order and invoice were generated from these line items.</span></div></div>';
}

function bMatRow(state: QmState, sec: QuoteSection, sIdx: number, m: QuoteMaterial, i: number): string {
  const key: RowKey = `mat-${i}`;
  const isMc = sec.kind === 'pickOne';
  const locked = !!state.approval;
  const chosen = isMc && state.pick === key;
  const id = `qm-b-${sIdx}-${key}`;
  const uom = matUom(m);
  const extra = qtyExtra(m);
  let hint = '';
  if (extra?.kind === 'cartons') {
    hint = `<div class="qm-hint"><b>📦 ${esc(extra.hint.count)}</b> <span>${esc(extra.hint.equals)}</span></div>`;
  } else if (extra?.kind === 'roll') {
    hint = `<div class="qm-hint"><button type="button" class="qm-rollbtn" data-roll="${sIdx}:${i}"${locked ? ' disabled' : ''} title="Click to edit roll dimensions" aria-label="Roll length ${esc(extra.text)} — edit roll dimensions">📐 ${esc(extra.text)}</button></div>`;
  } else if (extra?.kind === 'roll-missing') {
    hint = `<div class="qm-hint qm-hint-warn">${esc(extra.text)}</div>`;
  }
  // Roll goods also print the roll's size the way the Roll Dimensions dialog previews it (main L10984-11007).
  let sub = '';
  if ((Number(m.rollWidth) || 0) > 0 && extra?.kind === 'roll') {
    const w = rollFtIn(m.rollWidth);
    sub = `<div class="qm-sub">${esc(rollDimensionsPreview(w.ft, w.inches, Number(m.lengthFt) || 0, Number(m.lengthIn) || 0))}</div>`;
  }
  const badge = isMc && locked
    ? (chosen ? '<span class="qm-mcbadge is-chosen">✓ Customer’s Pick</span>' : '<span class="qm-mcbadge is-not">✗ Not Selected</span>')
    : '';
  const cls = ['qm-row', isMc ? 'qm-row-mc' : '', isMc && locked ? (chosen ? 'qm-mc-chosen' : 'qm-mc-unchosen') : ''].filter(Boolean).join(' ');
  const name = isMc
    ? `<label class="qm-name qm-name-mat" for="${id}-r" id="${id}-n">${esc(m.name)}</label>`
    : `<span class="qm-name qm-name-mat" id="${id}-n">${esc(m.name)}</span>`;
  return `<tr class="${cls}" role="row" data-key="${key}">`
    + (isMc ? `<td class="qm-c-pick" role="cell"><input type="radio" class="qm-radio" name="qm-b-pick" id="${id}-r" value="${key}"${chosen ? ' checked' : ''}${locked ? ' disabled' : ''}></td>` : '')
    + `<td class="qm-c-item" role="cell"><div class="qm-namewrap">${name}${badge}</div>${sub}</td>`
    + `<td class="qm-c-qty r" role="cell" data-label="Qty"><span class="qm-qty num">${esc(fmtQty(m.quantity))}</span><span class="qm-qty-u"> ${esc(uom)}</span>${hint}</td>`
    + `<td class="qm-c-uom" role="cell" data-label="UOM">${esc(uom)}</td>`
    + `<td class="qm-c-price r" role="cell" data-label="Price"><span class="qm-money num">${inputMoney(m.retailPrice)}</span></td>`
    + `<td class="qm-c-total r" role="cell" data-label="Total"><span class="qm-money qm-money-b num">${inputMoney(materialLineTotal(m))}</span></td>`
    + `<td class="qm-c-cost r is-private" role="cell" data-label="Cost"><span class="num">${inputMoney(m.companyCost)}</span></td>`
    + '</tr>';
}

function bLabRow(state: QmState, sec: QuoteSection, sIdx: number, l: QuoteLabor, i: number): string {
  const key: RowKey = `lab-${i}`;
  const isMc = sec.kind === 'pickOne';
  const locked = !!state.approval;
  const chosen = isMc && state.pick === key;
  const id = `qm-b-${sIdx}-${key}`;
  const badge = isMc && locked
    ? (chosen ? '<span class="qm-mcbadge is-chosen">✓ Customer’s Pick</span>' : '<span class="qm-mcbadge is-not">✗ Not Selected</span>')
    : '';
  const cls = ['qm-row', isMc ? 'qm-row-mc' : '', isMc && locked ? (chosen ? 'qm-mc-chosen' : 'qm-mc-unchosen') : ''].filter(Boolean).join(' ');
  const name = isMc
    ? `<label class="qm-name qm-name-lab" for="${id}-r" id="${id}-n">${esc(l.name)}</label>`
    : `<span class="qm-name qm-name-lab" id="${id}-n">${esc(l.name)}</span>`;
  return `<tr class="${cls}" role="row" data-key="${key}">`
    + (isMc ? `<td class="qm-c-pick" role="cell"><input type="radio" class="qm-radio" name="qm-b-pick" id="${id}-r" value="${key}"${chosen ? ' checked' : ''}${locked ? ' disabled' : ''}></td>` : '')
    + `<td class="qm-c-item" role="cell"><div class="qm-namewrap">${name}${badge}</div>${l.description ? `<div class="qm-sub">${esc(l.description)}</div>` : ''}</td>`
    + `<td class="qm-c-qty r" role="cell" data-label="Qty"><span class="qm-qty num">${esc(fmtQty(l.quantity))}</span><span class="qm-qty-u"> ${esc(l.uom)}</span></td>`
    + `<td class="qm-c-uom" role="cell" data-label="UOM">${esc(l.uom)}</td>`
    + `<td class="qm-c-price r" role="cell" data-label="Price"><span class="qm-money num">${inputMoney(l.retailPrice)}</span></td>`
    + `<td class="qm-c-total r" role="cell" data-label="Total"><span class="qm-money qm-money-b num">${inputMoney(laborLineTotal(l))}</span></td>`
    + `<td class="qm-c-cost r is-private" role="cell" data-label="Cost"><span class="num">${inputMoney(l.companyCost)}</span></td>`
    + '</tr>';
}

function bSection(seed: QmSeed, state: QmState, t: QuoteTotals, sIdx: number): string {
  const sec = state.sections[sIdx]!;
  const st = t.sections[sIdx]!;
  const isMc = sec.kind === 'pickOne';
  let html = '';
  if (isMc && !state.approval) {
    // main L10882 — the draft banner; it disappears once the customer has approved.
    html += `<div class="qm-mcban"><span class="qm-mcban-l">🔘 Pick One</span><span class="qm-mcban-p">Default: ${esc(rowName(sec, state.pick))}</span>`
      + '<span class="qm-mcban-n">— click any row’s radio to set it as the default the customer sees. Only the picked row counts toward the total.</span></div>';
  }
  const head = '<thead role="rowgroup"><tr role="row">'
    + (isMc ? '<th class="qm-c-pick" role="columnheader" scope="col">Pick</th>' : '')
    + '<th class="qm-c-item" role="columnheader" scope="col">Line Items</th>'
    + '<th class="qm-c-qty r" role="columnheader" scope="col">Qty</th>'
    + '<th class="qm-c-uom" role="columnheader" scope="col">UOM</th>'
    + '<th class="qm-c-price r" role="columnheader" scope="col">Price</th>'
    + '<th class="qm-c-total r" role="columnheader" scope="col">Total</th>'
    + '<th class="qm-c-cost r is-private" role="columnheader" scope="col"><span aria-hidden="true">💰 </span>Cost</th>'
    + '</tr></thead>';
  const rows = sec.materials.map((m, i) => bMatRow(state, sec, sIdx, m, i)).join('')
    + sec.labors.map((l, i) => bLabRow(state, sec, sIdx, l, i)).join('');
  html += `<table class="qm-tbl${isMc ? ' qm-tbl-mc' : ''}" role="table" aria-labelledby="qm-sec-t-${sIdx}">${head}<tbody role="rowgroup">${rows}</tbody></table>`;
  // Section totals (main L10896-10897): Sales Tax, then "<Title> Subtotal" — the builder's subtotal
  // includes the section's tax. A Pick One section counts its picked row only.
  html += '<div class="qm-sectot"><div class="qm-sectot-h">Section Totals</div>'
    + (seed.quote.taxExempt ? '' : `<div class="qm-sectot-r"><span>Sales Tax</span><span class="num">${fmtMoney(st.tax)}</span></div>`)
    + `<div class="qm-sectot-r qm-sectot-sub"><span>${esc(sec.title)} Subtotal</span><span class="num">${fmtMoney(st.total)}</span></div></div>`;
  return html;
}

function bRail(t: QuoteTotals): string {
  // Margin WITHOUT tax: (subtotal − cost) ÷ subtotal (QuoteTotals.margin). The app's own Margin row
  // (main L23236) divides by the grand total INCLUDING tax and counts the tax as profit — a known
  // quirk (QuoteTotals.appMargin keeps it for parity tests). Sales tax is not the shop's money.
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

function bDocs(seed: QmSeed, state: QmState): string {
  const a = state.approval;
  if (!a) return '';
  const wo = a.result.workOrder;
  const inv = a.result.invoice;
  // What the customer's live invoice asks for right now (q L1636-1684 via dueNowView). The app
  // stores the invoice total UNROUNDED (subtotal + tax in cents, main L10293 `total:sub+tax`), so the
  // deposit is figured from `raw.total` — the same figure as the builder's "→ $X due upfront"
  // (quoteDeposit). The rounded `inv.total` can be a cent off (Good, no stairs: $3,785.97 vs $3,785.96).
  const due = dueNowView(
    { total: inv.raw.total, paid: 0, terms: inv.paymentTerms, downPaymentPct: inv.downPaymentPct, finalInvoice: false, createdAt: inv.createdAt },
    seed.nowMs,
  );
  const dueHtml = due.kind === 'due'
    ? `<div class="qm-doc-due"><span>${esc(due.label)}</span><b class="num">${esc(due.amount)}</b></div><div class="qm-doc-sub">${esc(due.sub)}</div>`
    : '';
  return `<div class="qm-docs" data-docs><div class="qm-docs-h"><span>Created from ${esc(seed.quote.number)}</span><button type="button" class="qm-linkbtn" data-reset>Reset the demo</button></div>`
    + '<div class="qm-docs-grid">'
    + `<div class="qm-doc qm-doc-wo"><div class="qm-doc-top"><span class="qm-doc-num">${esc(wo.number)}</span><span class="a-pill a-purple">${esc(WO_LABELS[wo.status])}</span></div>`
    + `<div class="qm-doc-line">Work order · ${wo.materials.length} materials, ${wo.labors.length} labor</div>`
    + `<div class="qm-doc-sub">Created ${esc(fmtDate(wo.createdAt))} · materials ready to order</div></div>`
    + `<div class="qm-doc qm-doc-in"><div class="qm-doc-top"><span class="qm-doc-num">${esc(inv.number)}</span><span class="a-pill a-red">Unpaid</span></div>`
    + `<div class="qm-doc-line">Invoice · <span class="num">${fmtMoney(inv.total)}</span> · due ${esc(fmtDate(inv.dueDate))}</div>${dueHtml}</div>`
    + '</div></div>';
}

// ------------------------------------------------- phone (q.html, customer) --

function pStamp(state: QmState): string {
  const a = state.approval;
  if (!a) return '';
  return `<div class="qm-q-stamp" role="img" aria-label="Approved ${esc(fmtDate(a.at))}">Approved<span class="qm-q-stamp-d">${esc(fmtDate(a.at))}</span></div>`;
}

function pMcMatRow(state: QmState, m: QuoteMaterial, i: number): string {
  const key: RowKey = `mat-${i}`;
  const sel = state.pick === key;
  const locked = !!state.approval;
  return `<tr class="qm-q-mcrow${sel ? ' is-sel' : ''}" data-mc-key="${key}">`
    + `<td class="qm-q-radiocell"><input type="radio" name="qm-p-pick" id="qm-p-${key}" value="${key}"${sel ? ' checked' : ''}${locked ? ' disabled' : ''} aria-labelledby="qm-p-${key}-n"></td>`
    + `<td id="qm-p-${key}-n">${esc(m.name)}</td><td>${esc([m.style].filter(Boolean).join(' '))}</td>`
    + `<td class="num">${esc(fmtNum(m.quantity))}</td><td class="num">${esc(mcMatUom(m))}</td>`
    + `<td class="num">${fmtMoney(m.retailPrice)}</td><td class="num">${fmtMoney(materialLineTotal(m))}</td></tr>`;
}

function pMcLabRow(state: QmState, l: QuoteLabor, i: number): string {
  const key: RowKey = `lab-${i}`;
  const sel = state.pick === key;
  const locked = !!state.approval;
  return `<tr class="qm-q-mcrow${sel ? ' is-sel' : ''}" data-mc-key="${key}">`
    + `<td class="qm-q-radiocell"><input type="radio" name="qm-p-pick" id="qm-p-${key}" value="${key}"${sel ? ' checked' : ''}${locked ? ' disabled' : ''} aria-labelledby="qm-p-${key}-n"></td>`
    + `<td id="qm-p-${key}-n">${esc(l.name)}</td><td>${esc(l.description ?? '')}</td>`
    + `<td class="num">${esc(fmtNum(laborQty(l)))}</td><td class="num">${esc(l.uom)}</td>`
    + `<td class="num">${fmtMoney(l.retailPrice)}</td><td class="num">${fmtMoney(laborLineTotal(l))}</td></tr>`;
}

const pMatRow = (m: QuoteMaterial): string =>
  `<tr><td>${esc(m.name)}</td><td>${esc([m.style].filter(Boolean).join(' '))}</td><td class="num">${esc(fmtNum(m.quantity))}</td>`
  + `<td class="num">${esc(matUom(m))}</td><td class="num">${fmtMoney(m.retailPrice)}</td><td class="num">${fmtMoney(materialLineTotal(m))}</td></tr>`;

const pLabRow = (l: QuoteLabor): string =>
  `<tr><td>${esc(l.name)}</td><td>${esc(l.description ?? '')}</td><td class="num">${esc(fmtNum(laborQty(l)))}</td>`
  + `<td class="num">${esc(l.uom)}</td><td class="num">${fmtMoney(l.retailPrice)}</td><td class="num">${fmtMoney(laborLineTotal(l))}</td></tr>`;

const P_HEAD = '<th>Line Items</th><th>Description</th><th class="num">Qty</th><th class="num">UOM</th><th class="num">Price</th><th class="num">Total</th>';

function pSection(state: QmState, t: QuoteTotals, sIdx: number): string {
  const sec = state.sections[sIdx]!;
  const st = t.sections[sIdx]!;
  const title = esc(sec.title.toUpperCase());
  const locked = !!state.approval;
  // q.html's per-section line shows the section subtotal before tax (tax is reported once, above TOTAL).
  const sub = fmtMoney(st.materials + st.labor);
  if (sec.kind === 'pickOne') {
    const n = sec.materials.length + sec.labors.length;
    const rows = sec.materials.map((m, i) => pMcMatRow(state, m, i)).join('') + sec.labors.map((l, i) => pMcLabRow(state, l, i)).join('');
    return `<div class="qm-q-mcsec" data-p-sec="${sIdx}"><div class="qm-q-sh qm-q-sh-mc" id="qm-p-sec-t-${sIdx}">${title}</div>`
      + '<div class="qm-q-mchelp">🔘 <em>Pick one option below</em> — only the selected row’s price is added to your total.</div>'
      + `<div class="qm-q-ltwrap" data-keep-scroll><table class="qm-q-lt qm-q-lt-mc" aria-labelledby="qm-p-sec-t-${sIdx}"><thead><tr><th><span class="sr-only">Pick</span></th>${P_HEAD}</tr></thead><tbody>${rows}</tbody></table></div>`
      + `<table class="qm-q-lt qm-q-sectot qm-q-sectot-mc"><tbody><tr class="qm-q-totrow"><td>${esc(sec.title)} Subtotal (1 of ${n})</td><td>${sub}</td></tr></tbody></table></div>`;
  }
  const rows = sec.materials.map(pMatRow).join('') + sec.labors.map(pLabRow).join('');
  if (sec.kind === 'optional') {
    const on = state.addOpt;
    return `<div class="qm-q-optsec${on ? ' is-sel' : ''}" data-p-sec="${sIdx}"><div class="qm-q-sh qm-q-sh-opt"><span id="qm-p-sec-t-${sIdx}">${title}</span>`
      + `<label class="qm-q-opttoggle"><input type="checkbox" id="qm-p-opt" data-opt${on ? ' checked' : ''}${locked ? ' disabled' : ''} aria-describedby="qm-p-sec-t-${sIdx}"><span>Add to my quote</span></label></div>`
      + `<div class="qm-q-ltwrap" data-keep-scroll><table class="qm-q-lt qm-q-lt-opt" aria-labelledby="qm-p-sec-t-${sIdx}"><thead><tr>${P_HEAD}</tr></thead><tbody>${rows}</tbody></table></div>`
      + `<table class="qm-q-lt qm-q-sectot qm-q-sectot-opt"><tbody><tr class="qm-q-totrow"><td>${esc(sec.title)} Subtotal</td><td>${sub}</td></tr></tbody></table></div>`;
  }
  return `<div data-p-sec="${sIdx}"><div class="qm-q-sh" id="qm-p-sec-t-${sIdx}">${title}</div>`
    + `<div class="qm-q-ltwrap" data-keep-scroll><table class="qm-q-lt" aria-labelledby="qm-p-sec-t-${sIdx}"><thead><tr>${P_HEAD}</tr></thead><tbody>${rows}</tbody></table></div>`
    + `<table class="qm-q-lt qm-q-sectot"><tbody><tr class="qm-q-totrow"><td>${esc(sec.title)} Subtotal</td><td>${sub}</td></tr></tbody></table></div>`;
}

function pTotals(seed: QmSeed, state: QmState, t: QuoteTotals): string {
  const i = indexes(state.sections);
  let h = '<div class="qm-q-totals">';
  if (i.opt >= 0) {
    const os = t.sections[i.opt]!;
    h += '<div class="qm-q-opthead">⭐ Optional Add-Ons</div>';
    h += state.addOpt
      ? `<div class="qm-q-row qm-q-optline"><span>⭐ ${esc(os.title)}</span><span class="num">+${fmtMoney(os.total)}</span></div>`
      : '<div class="qm-q-opthelp">Check <em>“Add to my quote”</em> on any optional section above to include it in your total.</div>';
  }
  if (i.pick >= 0) {
    const ms = t.sections[i.pick]!;
    h += `<div class="qm-q-row qm-q-mcline"><span>${esc(ms.title)}</span><span class="num">${fmtMoney(ms.total)}</span></div>`;
  }
  if (!seed.quote.taxExempt) h += `<div class="qm-q-row"><span>Sales Tax</span><span class="num">${fmtMoney(t.tax)}</span></div>`;
  h += `<div class="qm-q-row qm-q-grand"><span>TOTAL</span><span class="num">${fmtMoney(t.total)}</span></div></div>`;
  return h;
}

function pApproval(state: QmState): string {
  const a = state.approval;
  if (a) {
    const sel = a.selectedTitles.length
      ? `<div class="qm-q-metax qm-q-selopts"><strong>Selected options:</strong> ${a.selectedTitles.map(esc).join(', ')}</div>`
      : '';
    return `<div class="qm-q-approved" id="qm-p-approved"><div class="qm-q-big">✓ Quote Approved</div><div class="qm-q-metax">Approved on ${esc(fmtDate(a.at))}</div>${sel}`
      + '<div class="qm-q-lockrow">🔒 Locked — changes disabled</div></div>';
  }
  return '<div class="qm-q-apwrap"><div class="qm-q-aphelp">Click below to approve this quote — we’ll get started right away.</div>'
    + '<button type="button" class="qm-q-approve" id="qm-p-approve" data-approve>✓ Approve Quote</button></div>';
}

/** Every dynamic region of the module, keyed by its data-slot name. */
export function renderSlots(seed: QmSeed, state: QmState, t: QuoteTotals = totalsOf(seed, state)): Record<string, string> {
  const out: Record<string, string> = {
    'b-status': bStatus(state),
    'b-gt': bGrandTotal(t),
    'b-banner': bBanner(state),
    'b-rail': bRail(t),
    'b-dep': esc(depositLabel(quoteDeposit(t, seed.quote.downPaymentPct))),
    'b-docs': bDocs(seed, state),
    'p-stamp': pStamp(state),
    'p-totals': pTotals(seed, state, t),
    'p-approval': pApproval(state),
  };
  state.sections.forEach((_, i) => {
    out[`b-sec-${i}`] = bSection(seed, state, t, i);
    out[`p-sec-${i}`] = pSection(state, t, i);
  });
  return out;
}

// ------------------------------------------------------------ the island --

const TASK_TODO = 'Try it: pick a floor, add the stairs, then tap Approve on the phone.';
const TASK_DONE = 'Approved. Work order and invoice are ready.';

type Source = 'builder' | 'phone';

export function initQuoteDemo(): void {
  const rootEl = document.querySelector<HTMLElement>('[data-qm]');
  if (!rootEl || rootEl.dataset.qmReady) return;
  // A non-null const, so the narrowing survives inside the hoisted helpers below.
  const root: HTMLElement = rootEl;
  root.dataset.qmReady = '1';
  const seedEl = root.querySelector('[data-qm-seed]');
  if (!seedEl) return;
  const seed = JSON.parse(seedEl.textContent || '{}') as QmSeed;
  let state = initialState(seed);

  const $ = <T extends Element = HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const app = $('[data-qm-app]');
  const task = $('[data-task]');
  const privacyBtn = $<HTMLButtonElement>('[data-privacy-btn]');
  const areaForm = $<HTMLFormElement>('[data-area]');
  const areaIn = $<HTMLInputElement>('[data-area-in]');
  const areaBtn = $<HTMLButtonElement>('[data-area-btn]');
  const optB = $<HTMLInputElement>('[data-opt-b]');
  const phone = $('[data-phone]');
  const phoneScroll = $('[data-phone-scroll]');
  const phoneScreen = $('[data-phone-screen]');
  const paper = $('[data-q-paper]');
  const live = $('[data-live]');
  const liveChip = $('[data-live-chip]');
  const bToast = $('[data-btoast]');
  const pToast = $('[data-ptoast]');
  const roundDlg = $<HTMLDialogElement>('[data-dlg-round]');
  const rollDlg = $<HTMLDialogElement>('[data-dlg-roll]');

  const slotEls = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => slotEls.set(el.dataset.slot!, el));
  const cache = new Map<string, string>();

  // ---- motion: GSAP for the two small beats only, inside matchMedia with a no-motion branch ----
  const fx = {
    smooth: false,
    hide: (_els: Element[]) => {},
    stamp: (_el: HTMLElement) => {},
    docs: (_els: HTMLElement[]) => {},
  };
  const mm = gsap.matchMedia();
  mm.add({ motion: '(prefers-reduced-motion: no-preference)', still: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const motion = !!ctx.conditions?.motion;
    fx.smooth = motion;
    if (motion) {
      fx.hide = (els) => { gsap.set(els, { autoAlpha: 0 }); };
      fx.stamp = (el) => {
        gsap.timeline()
          .fromTo(el, { scale: 2.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 0.85, duration: 0.36, ease: 'power4.in' })
          .fromTo(paper, { y: 0 }, { y: 4, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.out' })
          .set([el, paper], { clearProps: 'transform,opacity,visibility' });
      };
      fx.docs = (els) => {
        gsap.fromTo(els, { y: 22, scale: 0.95, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.55, ease: 'back.out(1.6)', stagger: 0.12, clearProps: 'transform,opacity,visibility' });
      };
    } else {
      // Reduced motion: every state lands instantly.
      fx.hide = () => {};
      fx.stamp = (el) => { gsap.set(el, { clearProps: 'all' }); };
      fx.docs = (els) => { gsap.set(els, { clearProps: 'all' }); };
    }
    return () => {
      fx.smooth = false;
      fx.hide = () => {};
      fx.stamp = () => {};
      fx.docs = () => {};
    };
  });

  // ---- helpers ----
  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
  // showToast (main L6736): icon + message, colored edge by type, gone after 3 s.
  const TOAST_ICON = { success: '✅', info: 'ℹ️', warning: '⚠️' } as const;
  const bToastIc = $('[data-btoast-ic]');
  const bToastMsg = $('[data-btoast-msg]');
  let bTimer = 0;
  function toastB(msg: string, type: keyof typeof TOAST_ICON = 'success') {
    bToast.className = `qm-btoast is-${type}`;
    bToastIc.textContent = TOAST_ICON[type];
    bToastMsg.textContent = msg;
    void bToast.offsetWidth;
    bToast.classList.add('is-on');
    window.clearTimeout(bTimer);
    bTimer = window.setTimeout(() => bToast.classList.remove('is-on'), 3000);
  }
  let pTimer = 0;
  function toastP(msg: string) {
    // q.html toast(): shows for 2.5 s (q L570).
    pToast.textContent = msg;
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

  function sync(force = false): QuoteTotals {
    const t = totalsOf(seed, state);
    patch(renderSlots(seed, state, t), force);
    const locked = !!state.approval;
    optB.checked = state.addOpt;
    optB.disabled = locked;
    areaIn.disabled = locked;
    areaBtn.disabled = locked;
    paper.classList.toggle('is-locked', locked);
    return t;
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

  // ---- the app's moves ----
  let approving = false;
  let run = 0;

  function setPick(key: RowKey, from: Source) {
    if (state.approval || approving || key === state.pick) return;
    const i = indexes(state.sections);
    if (i.pick < 0 || !rowName(state.sections[i.pick]!, key)) return;
    state.pick = key;
    const t = sync();
    pulse();
    flash(slotEls.get('b-gt') ?? null);
    if (from === 'builder') {
      const row = phone.querySelector(`[data-mc-key="${key}"]`);
      phoneScrollTo(phone.querySelector('.qm-q-mcsec'));
      flash(row);
    } else {
      flash(root.querySelector(`[data-slot="b-sec-${i.pick}"] tr[data-key="${key}"]`));
    }
    announce(`${rowName(state.sections[i.pick]!, key)} picked. Grand total ${fmtMoney(t.total)}.`);
  }

  function setOpt(on: boolean, from: Source) {
    if (state.approval || approving || on === state.addOpt) return;
    const i = indexes(state.sections);
    if (i.opt < 0) return;
    state.addOpt = on;
    const t = sync();
    pulse();
    flash(slotEls.get('b-gt') ?? null);
    if (from === 'builder') phoneScrollTo(phone.querySelector('.qm-q-optsec'));
    announce(`${state.sections[i.opt]!.title} ${on ? 'added to' : 'taken off'} the quote. Grand total ${fmtMoney(t.total)}.`);
  }

  function applyJobArea() {
    if (state.approval || approving) return;
    const i = indexes(state.sections);
    if (i.pick < 0) return;
    const value = Math.min(Number(areaIn.value) || 0, 99999);
    const floor = state.sections[i.pick]!;
    const install = i.req >= 0 ? state.sections[i.req]! : null;
    // The app applies a job area to ONE section (applyAreaQty, main L12662). Here the floor options
    // and their install labor live in two sections, so this one Job Area bar runs the same
    // applyArea over both together — what the app does when a section holds the floor and its
    // labor, and the case where it asks "Round Labor Up?".
    const mats = [...floor.materials, ...(install?.materials ?? [])];
    const labs = [...floor.labors, ...(install?.labors ?? [])];
    const res = applyArea(value, seed.quote.jobArea.uom, mats, labs);
    if (!res) {
      toastB('Enter a value first.', 'warning'); // the app shows this as an alert (main L12662)
      areaIn.focus();
      return;
    }
    res.materialQty.forEach((q, k) => { if (q != null) mats[k]!.quantity = q; });
    res.laborQty.forEach((q, k) => { if (q != null) labs[k]!.quantity = q; });
    sync();
    pulse();
    toastB(res.toast);
    announce(res.toast);
    if (res.roundLabor) window.setTimeout(() => openRound(res.roundLabor!), 120);
  }

  // "Round Labor Up?" (main L12664) — the app's modal, as a native <dialog>.
  let roundPrompt: RoundLaborPrompt | null = null;
  function openRound(p: RoundLaborPrompt) {
    if (state.approval || approving || roundDlg.open) return;
    roundPrompt = p;
    $('[data-round-body]').textContent = ROUND_LABOR_COPY.body(p.applied, p.uom);
    $('[data-round-cur]').textContent = String(p.applied);
    $('[data-round-new]').textContent = String(p.maxMat);
    root.querySelectorAll('[data-round-uom]').forEach((el) => { el.textContent = p.uom; });
    $('[data-round-keep]').textContent = ROUND_LABOR_COPY.keepButton(p.applied);
    $('[data-round-go]').textContent = ROUND_LABOR_COPY.roundButton(p.maxMat);
    roundDlg.returnValue = '';
    roundDlg.showModal();
    $<HTMLButtonElement>('[data-round-go]').focus();
  }
  roundDlg.addEventListener('close', () => {
    const p = roundPrompt;
    roundPrompt = null;
    if (p && roundDlg.returnValue === 'round' && !state.approval) {
      // roundupLaborQty (main L12665): every labor row in that unit, across the quote.
      let updated = 0;
      for (const s of state.sections) for (const l of s.labors) if (String(l.uom || '').trim() === p.uom) { l.quantity = p.maxMat; updated++; }
      sync();
      pulse();
      const msg = ROUND_LABOR_COPY.doneToast(p.maxMat, p.uom, updated);
      toastB(msg);
      announce(msg);
    }
    if (!areaBtn.disabled) areaBtn.focus({ preventScroll: true });
  });

  // Roll Dimensions (main L10984-11007) — width × length → SqYd, through the roll helpers.
  let rollTarget: { sIdx: number; i: number; opener: HTMLElement | null } | null = null;
  const rollIn = (k: string) => $<HTMLInputElement>(`[data-rd="${k}"]`);
  function rollPreview() {
    $('[data-rd-preview]').textContent = rollDimensionsPreview(
      Number(rollIn('wft').value) || 0, Number(rollIn('win').value) || 0, Number(rollIn('lft').value) || 0, Number(rollIn('lin').value) || 0,
    );
  }
  function openRoll(sIdx: number, i: number, opener: HTMLElement | null) {
    const m = state.sections[sIdx]?.materials[i];
    if (!m || state.approval || approving || rollDlg.open) return;
    rollTarget = { sIdx, i, opener };
    const w = (Number(m.rollWidth) || 0) > 0 ? rollFtIn(m.rollWidth) : null;
    rollIn('wft').value = w ? String(w.ft) : '';
    rollIn('win').value = w ? String(w.inches) : '';
    rollIn('lft').value = m.lengthFt != null ? String(m.lengthFt) : '';
    rollIn('lin').value = m.lengthIn != null ? String(m.lengthIn) : '';
    rollPreview();
    rollDlg.returnValue = '';
    rollDlg.showModal();
    rollIn('lft').focus();
  }
  rollDlg.addEventListener('input', rollPreview);
  rollDlg.addEventListener('close', () => {
    const tgt = rollTarget;
    rollTarget = null;
    if (!tgt) return;
    const m = state.sections[tgt.sIdx]?.materials[tgt.i];
    if (m && rollDlg.returnValue === 'save' && !state.approval) {
      const width = rollWidthFromFtIn(Number(rollIn('wft').value) || 0, Number(rollIn('win').value) || 0);
      const lf = Math.max(0, Number(rollIn('lft').value) || 0);
      const li = Math.max(0, Number(rollIn('lin').value) || 0);
      if (width) m.rollWidth = width;
      m.lengthFt = lf > 0 ? lf : undefined;
      m.lengthIn = li > 0 ? li : undefined;
      const q = sqYdFromLength(lf, li, Number(m.rollWidth) || 0);
      if (q) m.quantity = q.quantity;
      const t = sync();
      pulse();
      const w = rollFtIn(m.rollWidth);
      announce(`${rollDimensionsPreview(w.ft, w.inches, lf, li).replace('📐 ', '')}. Grand total ${fmtMoney(t.total)}.`);
    }
    const opener = root.querySelector<HTMLButtonElement>(`[data-roll="${tgt.sIdx}:${tgt.i}"]`);
    if (opener && !opener.disabled) opener.focus({ preventScroll: true });
  });

  function setPrivacy(on: boolean, withToast: boolean) {
    app.dataset.privacy = on ? 'on' : 'off';
    privacyBtn.setAttribute('aria-pressed', String(on));
    privacyBtn.classList.toggle('is-on', on);
    // The app's toasts (main L23978).
    if (withToast) toastB(on ? '🕶️ Privacy mode on — cost & margin hidden' : '👁 Privacy mode off — internal data visible', 'info');
  }

  async function approve() {
    if (state.approval || approving) return;
    approving = true;
    const mine = ++run;
    const btn = root.querySelector<HTMLButtonElement>('[data-approve]');
    if (btn) btn.disabled = true;
    const i = indexes(state.sections);
    const selection: QuoteSelection = {
      pickOne: i.pick >= 0 ? { [i.pick]: state.pick } : {},
      optional: state.addOpt && i.opt >= 0 ? [i.opt] : [],
    };
    const result = approveQuote(
      {
        number: seed.quote.number, sections: state.sections, taxRate: seed.quote.taxRate, taxExempt: seed.quote.taxExempt,
        paymentTerms: seed.quote.paymentTerms, downPaymentPct: seed.quote.downPaymentPct,
      },
      selection,
      seed.counters,
      seed.today,
    );
    const selectedTitles = [
      ...(selection.optional ?? []).map((k) => state.sections[k]!.title),
      ...(i.pick >= 0 ? [state.sections[i.pick]!.title] : []),
    ];
    toastP('Quote approved! Thank you.'); // q L783
    // The live page reloads into its approved state (q L784-814).
    await wait(fx.smooth ? 800 : 0);
    if (mine !== run) return;
    state.approval = { result, at: seed.today, selection, selectedTitles };
    sync();
    pulse();
    const stamp = phone.querySelector<HTMLElement>('.qm-q-stamp');
    const docs = Array.from(root.querySelectorAll<HTMLElement>('[data-slot="b-docs"] .qm-doc'));
    fx.hide([...(stamp ? [stamp] : []), ...docs]);
    // The Approve button is gone; keep focus on something visible — the phone itself (a labelled,
    // focusable region). The outcome is announced through the live region below.
    phoneScroll.focus({ preventScroll: true });
    // Back to the top of the paper, where the stamp lands.
    if (phoneScroll.scrollTop > 2) {
      phoneScroll.scrollTo({ top: 0, behavior: fx.smooth ? 'smooth' : 'auto' });
      if (fx.smooth) await scrollEnd(phoneScroll, 900);
      if (mine !== run) return;
    }
    if (stamp) fx.stamp(stamp);
    await wait(fx.smooth ? 420 : 0);
    if (mine !== run) return;
    toastB(result.toast);
    fx.docs(docs);
    task.textContent = TASK_DONE;
    task.classList.add('is-done');
    announce(`${result.toast} ${TASK_DONE}`);
    // On a stacked layout the work order + invoice can sit above the fold: bring them in, gently.
    const docsBox = root.querySelector<HTMLElement>('[data-docs]');
    if (docsBox) {
      const r = docsBox.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(root).getPropertyValue('--qm-stick')) || 84;
      if (r.top < top || r.bottom > window.innerHeight) docsBox.scrollIntoView({ block: 'nearest', behavior: fx.smooth ? 'smooth' : 'auto' });
    }
    approving = false;
  }

  function reset() {
    run++;
    gsap.killTweensOf(root.querySelectorAll('.qm-q-stamp, .qm-doc'));
    gsap.killTweensOf(paper);
    gsap.set(paper, { clearProps: 'transform' });
    roundPrompt = null;
    rollTarget = null;
    if (roundDlg.open) roundDlg.close();
    if (rollDlg.open) rollDlg.close();
    state = initialState(seed);
    approving = false;
    areaIn.value = String(seed.quote.jobArea.value);
    setPrivacy(false, false);
    sync(true);
    phoneScroll.scrollTop = 0;
    root.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach((n) => { n.scrollLeft = 0; });
    window.clearTimeout(bTimer);
    window.clearTimeout(pTimer);
    bToast.classList.remove('is-on');
    pToast.classList.remove('is-on');
    task.textContent = TASK_TODO;
    task.classList.remove('is-done');
    announce('Demo reset. The quote is back to Sent.');
  }

  // ---- wiring (event delegation, so patched markup needs no re-binding) ----
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'qm-b-pick') setPick(el.value as RowKey, 'builder');
    else if (el.name === 'qm-p-pick') setPick(el.value as RowKey, 'phone');
    else if (el.matches('[data-opt-b]')) setOpt(el.checked, 'builder');
    else if (el.matches('[data-opt]')) setOpt(el.checked, 'phone');
  });
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const resetBtn = target.closest('[data-reset]');
    if (resetBtn) {
      const fromDocs = !!resetBtn.closest('[data-docs]');
      reset();
      if (fromDocs) root.querySelector<HTMLElement>('.mod-foot [data-reset]')?.focus({ preventScroll: true });
      return;
    }
    if (target.closest('[data-approve]')) { void approve(); return; }
    if (target.closest('[data-privacy-btn]')) { setPrivacy(app.dataset.privacy !== 'on', true); return; }
    const roll = target.closest<HTMLElement>('[data-roll]');
    if (roll) {
      const [s, i] = (roll.dataset.roll || '').split(':').map(Number);
      openRoll(s ?? -1, i ?? -1, roll);
      return;
    }
    // q.html: tapping anywhere on a Pick One row picks it (q L1162); the radio itself goes through 'change'.
    const row = target.closest<HTMLElement>('tr.qm-q-mcrow');
    if (row && !target.closest('input')) setPick(row.dataset.mcKey as RowKey, 'phone');
  });
  areaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    applyJobArea();
  });

  // The customer's page is laid out at a 430 px phone viewport and zoomed to the drawn screen
  // (exact here; QuoteModule.astro has a no-JS fallback). Floor, so it never spills sideways.
  const fitPhone = () => {
    const w = phoneScroll.clientWidth;
    if (w > 0) phoneScreen.style.setProperty('--qm-qz', String(Math.floor((w / 430) * 10000) / 10000));
  };
  fitPhone();
  if ('ResizeObserver' in window) new ResizeObserver(fitPhone).observe(phoneScroll);

  // Hydrate: write the same markup the server rendered, then hand over.
  sync(true);
  task.textContent = TASK_TODO;
  root.classList.add('is-live');
}
