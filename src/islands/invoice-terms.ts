/**
 * "Get paid" — IN-330 in today's invoice screen (renderInvoiceBuilder, main L18331): Payment Terms
 * beside the Tax Rate, the due date (the same day next month — DocumentDates.invoiceDueDate), the
 * sections as the quote left them, the totals down to BALANCE DUE, the 💳 Payment Schedule (Down
 * Payment %), the ☐ Final Invoice toggle (toggleFinalInvoice L6496), 💰 Take Payment → Record
 * Payment (openTakePaymentModal L20865, recordPayment L21005) and the 💳 Payments card (L18364) —
 * beside the customer's live invoice and its PAYMENT card (q L1679-1745).
 *
 * What the customer is asked for comes from due-now.ts (`dueNowView` → `computeDueNow`, the rule
 * Stripe actually charges); the header badge follows the stored status `recordPayment` writes;
 * "Take Payment" shows while more than half a cent is owed. No card is ever charged here: the live
 * invoice's card form needs the shop's own Stripe account, so its pay button and the office's
 * Charge Card tab are shown inert, and say so. Fictional sample data; nothing is saved or sent.
 */
import gsap from 'gsap';
import {
  dueNowView, invoiceStatus, canTakePayment, paymentTypeLabel, paymentRecordedToast, fmtMoney, fmtDate, fmtNum, fmtQty,
  fmtWeekdayShort, addDays, round2, RECORD_PAYMENT_METHODS, ENTER_VALID_AMOUNT,
} from '../lib/logic';
import type { ISODate, InvoiceStatus, DueNowView, SectionKind } from '../lib/logic';
import { withAppIcons } from '../data/modules/app-icons';
import { appToaster } from '../data/modules/app-toast';

export interface IvmLine {
  kind: 'mat' | 'lab';
  name: string;
  /** Style (materials) or the labor's description. */
  desc: string;
  qty: number;
  /** The invoice screen's UOM (the cost UOM for materials). */
  uom: string;
  /** What the customer's page prints (coverage UOM for materials). */
  pUom: string;
  rate: number;
  /** Unrounded qty × price, as the app keeps it. */
  amount: number;
}
export interface IvmSection {
  title: string;
  kind: SectionKind;
  lines: IvmLine[];
  /** Unrounded section sums. */
  materials: number;
  labor: number;
}
export interface IvmData {
  number: string;
  customer: string;
  initials: string;
  phone: string;
  email: string;
  city: string;
  rep: { name: string; email: string };
  shop: { name: string; address: string; city: string; phone: string; email: string };
  /** Date-only issue day; the demo clock counts from here. */
  createdAt: ISODate;
  /** The same day next month (DocumentDates.invoiceDueDate). */
  dueDate: ISODate;
  /** Unrounded materials / labor sums. */
  materials: number;
  labor: number;
  subtotal: number;
  tax: number;
  taxRate: number;
  taxCounty: string;
  total: number;
  /** Unrounded subtotal + tax. */
  rawTotal: number;
  terms: string;
  pct: number;
  termsOptions: string[];
  sections: IvmSection[];
}
export interface IvmPayment { amount: number; method: string; date: ISODate; checkNumber?: string }
export interface IvmState {
  terms: string;
  pct: number;
  /** Days since the invoice was made (the demo clock). */
  age: number;
  final: boolean;
  payments: IvmPayment[];
}

export const IVM_MAX_AGE = 60;

export function ivmInitialState(d: IvmData): IvmState {
  return { terms: d.terms, pct: d.pct, age: 0, final: false, payments: [] };
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The demo clock's "today": the invoice's issue day + its age. */
export const ivmToday = (d: IvmData, s: IvmState): ISODate => addDays(d.createdAt, s.age);
/** Noon UTC on that day, so the age maths never depends on the viewer's time zone. */
const noonMs = (iso: ISODate): number => Date.parse(`${iso}T12:00:00Z`);
export const ivmPaid = (s: IvmState): number => round2(s.payments.reduce((a, p) => a + p.amount, 0));
/** What the invoice screen shows as Balance Due (`balNow`, main L18361) — negative when overpaid, as in the app. */
export const ivmBalance = (d: IvmData, s: IvmState): number => round2(d.total - ivmPaid(s));
/** The status `recordPayment` stores (paid ≥ total → paid, anything paid → deposit) — the header badge reads it. */
export const ivmStatus = (d: IvmData, s: IvmState): InvoiceStatus => invoiceStatus(d.total, s.payments);
export const ivmStatusLabel = (st: InvoiceStatus): string => st.charAt(0).toUpperCase() + st.slice(1);
/** The invoice screen's header badge (main L18376): paid green, deposit amber, unpaid GREY. */
export const ivmPillClass = (st: InvoiceStatus): string => `a-pill ${st === 'paid' ? 'a-green' : st === 'deposit' ? 'a-amber' : 'a-gray'}`;

export function ivmView(d: IvmData, s: IvmState): DueNowView {
  return dueNowView(
    { total: d.total, paid: ivmPaid(s), terms: s.terms, downPaymentPct: s.pct, finalInvoice: s.final, createdAt: d.createdAt },
    noonMs(ivmToday(d, s)),
  );
}

/** 💳 Payment Schedule line (main L18375 + L18461): (subtotal + tax) × % — the screen's unrounded figures, fmt$. */
export function ivmUpfront(d: IvmData, s: IvmState): string {
  const amt = (d.materials + d.labor + d.materials * d.taxRate) * (s.pct / 100);
  return `→ ${fmtMoney(amt)} due upfront`;
}

/** The demo clock line: "Thu, Oct 15, 2026 · invoice 0 days old". */
export function ivmClockText(d: IvmData, s: IvmState): string {
  const t = ivmToday(d, s);
  return `${fmtWeekdayShort(t)}, ${t.slice(0, 4)} · invoice ${s.age} day${s.age === 1 ? '' : 's'} old`;
}

/** Header: 💰 Take Payment while money is owed, else "✅ Paid in Full" (main L18382). */
export function renderIvmAct(d: IvmData, s: IvmState): string {
  return canTakePayment(ivmBalance(d, s))
    ? '<button type="button" class="a-btn a-success a-btn-sm ivm-take" data-ivm-take>💰 Take Payment</button>'
    : '<span class="ivm-paidtext" data-ivm-paidtext tabindex="-1">✅ Paid in Full</span>';
}

/** The header's "Balance Due" box (`.hdr-totals-btn`, main L18388): red while owed, green otherwise, "of $total". */
export function renderIvmBal(d: IvmData, s: IvmState): string {
  const bal = ivmBalance(d, s);
  return '<span class="ivm-hbal-cap">Balance Due</span>'
    + `<span class="ivm-hbal-val num${bal > 0 ? ' is-due' : ''}">${fmtMoney(bal)}</span>`
    + `<span class="ivm-hbal-of">of <span class="num">${fmtMoney(d.total)}</span></span>`;
}

/** The paper's totals (main L18444-18454): Paid in green, BALANCE DUE red while owed, green when not. */
export function renderIvmTotals(d: IvmData, s: IvmState): string {
  const bal = ivmBalance(d, s);
  return `<tr><td>Materials</td><td class="num">${fmtMoney(d.materials)}</td></tr>`
    + `<tr><td>Labor</td><td class="num">${fmtMoney(d.labor)}</td></tr>`
    + `<tr><td>Subtotal</td><td class="num">${fmtMoney(d.subtotal)}</td></tr>`
    + `<tr><td>Tax</td><td class="num">${fmtMoney(d.tax)}</td></tr>`
    + `<tr class="ivm-grand"><td>Total</td><td class="num">${fmtMoney(d.total)}</td></tr>`
    // The app prints "-$0.00" before any payment; the site drops the minus until something is paid.
    + `<tr class="ivm-paid"><td>Paid</td><td class="num">${ivmPaid(s) > 0 ? '-' : ''}${fmtMoney(ivmPaid(s))}</td></tr>`
    + `<tr class="ivm-bal${bal > 0 ? ' is-due' : ''}"><td>Balance Due</td><td class="num">${fmtMoney(bal)}</td></tr>`;
}

/** 💳 Payments card (paymentsHTML, main L18364): " #2318" after a check, "Paid to date". */
export function renderIvmPays(d: IvmData, s: IvmState): string {
  const take = canTakePayment(ivmBalance(d, s)) ? '<button type="button" class="a-btn a-success a-btn-sm" data-ivm-take2>💰 Take Payment</button>' : '';
  const head = `<div class="ivm-pays-h"><h5 id="ivm-pays-h">💳 Payments</h5>${take}</div>`;
  if (!s.payments.length) return head + '<p class="ivm-nopay">No payments recorded yet.</p>';
  const rows = s.payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.method || '—')}${p.checkNumber ? `<span class="ivm-chk"> #${esc(p.checkNumber)}</span>` : ''}</td><td class="r num ivm-green">${fmtMoney(p.amount)}</td></tr>`).join('');
  return head + '<div class="ivm-ptwrap"><table class="ivm-ptable" aria-labelledby="ivm-pays-h"><thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col" class="r">Amount</th></tr></thead>'
    + `<tbody>${rows}<tr class="ivm-ptd"><td colspan="2">Paid to date</td><td class="r num ivm-green">${fmtMoney(ivmPaid(s))}</td></tr></tbody></table></div>`;
}

const SEC_ICON: Record<SectionKind, string> = { pickOne: '🔘', required: '📋', optional: '⭐' };

/** One section card on the invoice screen (`_ibSecHeader` + rows + `_ibSecTotals`, main L18520-18552), read-only. */
export function renderIvmSection(d: IvmData, i: number): string {
  const sec = d.sections[i]!;
  const tax = sec.materials * d.taxRate;
  const rows = sec.lines.map((l) => `<tr><td class="ivm-c-item"><span class="ivm-ln ivm-ln-${l.kind}">${esc(l.name)}</span>${l.desc ? `<span class="ivm-ld">${esc(l.desc)}</span>` : ''}</td>`
    + `<td class="c num ivm-c-qty" data-label="Qty">${fmtQty(l.qty)} <span class="ivm-uom">${esc(l.uom)}</span></td><td class="r num ivm-c-price" data-label="Price">${fmtMoney(l.rate)}</td><td class="r num ivm-c-total" data-label="Total">${fmtMoney(l.amount)}</td></tr>`).join('');
  return `<div class="ivm-band${sec.kind === 'optional' ? ' ivm-band-opt' : ''}"><span class="ivm-band-ic" aria-hidden="true">${SEC_ICON[sec.kind]}</span><h5 class="ivm-band-t" id="ivm-sec-t-${i}">${esc(sec.title)}</h5></div>`
    + `<div class="ivm-secbody"><div class="ivm-twrap"><table class="ivm-tbl" aria-labelledby="ivm-sec-t-${i}"><thead><tr><th scope="col">Line Items</th><th scope="col" class="c">Qty <span class="ivm-th-sub">/ UOM</span></th><th scope="col" class="r">Price</th><th scope="col" class="r">Total</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + '<div class="ivm-sectot"><div class="ivm-sectot-h">Section Totals</div><table><tbody>'
    + `<tr class="ivm-sectot-tax"><td>Sales Tax</td><td class="num">${fmtMoney(tax)}</td></tr>`
    + `<tr><td>${esc(sec.title)} Subtotal</td><td class="num">${fmtMoney(sec.materials + sec.labor + tax)}</td></tr></tbody></table></div></div>`;
}

/** The same section on the customer's page (q.html `__qRenderSec`): its line table and the subtotal before tax. */
export function renderIvmPSection(d: IvmData, i: number): string {
  const sec = d.sections[i]!;
  const rows = sec.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.desc)}</td><td class="num">${esc(fmtNum(l.qty))}</td><td class="num">${esc(l.pUom)}</td><td class="num">${fmtMoney(l.rate)}</td><td class="num">${fmtMoney(l.amount)}</td></tr>`).join('');
  return `<div class="ivm-q-sh" id="ivm-p-sec-t-${i}">${esc(sec.title.toUpperCase())}</div>`
    + `<div class="ivm-q-ltwrap"><table class="ivm-q-lt" aria-labelledby="ivm-p-sec-t-${i}"><thead><tr><th scope="col">Line Items</th><th scope="col">Description</th><th scope="col" class="num">Qty</th><th scope="col" class="num">UOM</th><th scope="col" class="num">Price</th><th scope="col" class="num">Total</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<table class="ivm-q-lt ivm-q-sectot"><tbody><tr><td>${esc(sec.title)} Subtotal</td><td class="num">${fmtMoney(sec.materials + sec.labor)}</td></tr></tbody></table>`;
}

/** The customer's live invoice below the lines (q L1451, L1664-1745): terms, totals, PAYMENT, PAYMENTS. */
export function renderIvmPhone(d: IvmData, s: IvmState): string {
  const paid = ivmPaid(s);
  const bal = ivmBalance(d, s);
  const v = ivmView(d, s);
  let card: string;
  if (v.kind === 'paid') {
    card = `<div class="ivm-q-pay-done" data-ivm-paybox><div class="ivm-q-big">${esc(v.title)}</div><div class="ivm-q-metax">${esc(v.meta)}</div></div>`;
  } else if (v.kind === 'none') {
    // q L1716: the first sentence, a line break, then the balance in bold.
    const cut = v.text.indexOf('. ') + 1;
    const first = v.text.slice(0, cut);
    const tail = esc(v.text.slice(cut + 1)).replace(/\$-?[\d,]+\.\d{2}/, (m) => `<strong>${m}</strong>`);
    card = `<div class="ivm-q-pay-none" data-ivm-paybox>${esc(first)}<br>${tail}</div>`;
  } else {
    card = `<div class="ivm-q-pay-card" data-ivm-paybox><div class="ivm-q-due-row"><span class="ivm-q-due-lbl">${esc(v.label)}</span><span class="ivm-q-due-amt" data-ivm-due>${esc(v.amount)}</span></div>`
      + `<div class="ivm-q-due-sub">${esc(v.sub)}</div>`
      + '<div class="ivm-q-el">Stripe’s card form loads here on the live invoice. This sample has no Stripe account, so nothing can be paid.</div>'
      + `<button type="button" class="ivm-q-pay-btn" disabled>${esc(v.button)}</button>`
      + '<div class="ivm-q-pay-note">🔒 Secure card payment powered by Stripe</div></div>';
  }
  const terms = s.terms.trim() ? `<div class="ivm-q-pterms"><span class="ivm-q-lbl">PAYMENT TERMS</span>${esc(s.terms)}</div>` : '';
  const ps = s.payments.filter((p) => p.amount !== 0);
  const pays = ps.length
    ? '<div class="ivm-q-sh">PAYMENTS</div><div class="ivm-q-ltwrap"><table class="ivm-q-lt"><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col" class="num">Amount</th></tr></thead><tbody>'
      + ps.map((p) => `<tr><td>${esc(fmtDate(p.date))}</td><td>${esc(paymentTypeLabel(p))}</td><td class="num">${fmtMoney(p.amount)}</td></tr>`).join('')
      + '</tbody></table></div>'
    : '';
  return `<div class="ivm-q-bot">${terms}<div class="ivm-q-totals">`
    + `<div class="ivm-q-row"><span>Sales Tax</span><span>${fmtMoney(d.tax)}</span></div>`
    + `<div class="ivm-q-row ivm-q-grand"><span>TOTAL</span><span>${fmtMoney(d.total)}</span></div>`
    + `<div class="ivm-q-row"><span>Amount Paid</span><span>${paid > 0 ? '-' : ''}${fmtMoney(paid)}</span></div>`
    + `<div class="ivm-q-row ivm-q-grand"><span>BALANCE DUE</span><span data-ivm-cbal>${fmtMoney(bal)}</span></div></div></div>`
    + `<div class="ivm-q-payh">PAYMENT</div>${card}${pays}`;
}

/** One line for screen readers: what the customer is asked for now. */
export function ivmViewText(v: DueNowView): string {
  if (v.kind === 'paid') return 'The customer’s invoice reads Paid in Full.';
  if (v.kind === 'none') return `The customer’s invoice: ${v.text}`;
  return `The customer’s invoice asks for ${v.amount} now — ${v.sub}.`;
}

// ----------------------------------------------------------- the island --

const TASK_DONE = 'Done: terms switched and the check is on the books.';

export function initInvoiceModules(): void {
  document.querySelectorAll<HTMLElement>('[data-ivm]').forEach(initOne);
}

function initOne(root: HTMLElement): void {
  if (root.dataset.ivmReady) return;
  root.dataset.ivmReady = '1';
  const dataEl = root.querySelector('[data-ivm-data]');
  if (!dataEl) return;
  const d = JSON.parse(dataEl.textContent || '{}') as IvmData;
  let s = ivmInitialState(d);

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const pill = $('[data-ivm-pill]');
  const act = $('[data-ivm-act]');
  const finalBtn = $<HTMLButtonElement>('[data-ivm-final]');
  const balBox = $('[data-ivm-bal]');
  const terms = $<HTMLSelectElement>('[data-ivm-terms]');
  const pct = $<HTMLInputElement>('[data-ivm-pct]');
  const upfront = $('[data-ivm-upfront]');
  const totals = $('[data-ivm-totals]');
  const pays = $('[data-ivm-pays]');
  const age = $<HTMLInputElement>('[data-ivm-age]');
  const clock = $('[data-ivm-clock]');
  const phone = $('[data-ivm-phone]');
  const phoneScroll = $('[data-ivm-pscroll]');
  const phoneScreen = $('[data-ivm-pscreen]');
  const liveCap = $('[data-ivm-livecap]');
  const body = $('[data-ivm-body]');
  const dlg = $<HTMLDialogElement>('[data-ivm-dlg]');
  const toastEl = $('[data-ivm-toast]');
  const live = $('[data-ivm-live]');
  const task = $('[data-task]');
  const reset = $<HTMLButtonElement>('[data-ivm-reset]');
  const taskText = task.textContent || '';
  let termsChanged = false;
  let checkRecorded = false;

  const fx = { smooth: false, open: (_el: Element) => {}, flash: (_el: Element | null) => {} };
  gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const { motion } = ctx.conditions as { motion: boolean };
    fx.smooth = motion;
    if (!motion) { fx.open = () => {}; fx.flash = () => {}; return; }
    fx.open = (box) => { gsap.fromTo(box, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: 'transform,opacity' }); };
    fx.flash = (el) => { if (el) gsap.fromTo(el, { backgroundColor: 'rgba(0,116,211,.16)' }, { backgroundColor: 'rgba(0,116,211,0)', duration: 0.9, ease: 'power1.out', clearProps: 'backgroundColor' }); };
  });

  // The app's showToast; lifted above the Take Payment window while it is open.
  const toast = appToaster(toastEl, dlg);
  let liveTimer = 0;
  function announce(msg: string): void {
    window.clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = window.setTimeout(() => { live.textContent = msg; }, 80);
  }

  /** Scroll the phone's own screen (never the page) so `first` … `last` is in view. */
  function phoneReveal(first: Element | null, last: Element | null = first): void {
    if (!first || !last) return;
    const sc = phoneScroll;
    const origin = sc.getBoundingClientRect().top - sc.scrollTop;
    const top = first.getBoundingClientRect().top - origin;
    const h = last.getBoundingClientRect().bottom - origin - top;
    const cur = sc.scrollTop;
    const vh = sc.clientHeight;
    let target = cur;
    if (top < cur + 8 || h > vh - 24) target = top - 12;
    else if (top + h > cur + vh - 8) target = top + h - vh + 12;
    target = Math.max(0, Math.min(target, sc.scrollHeight - vh));
    if (Math.abs(target - cur) > 2) sc.scrollTo({ top: target, behavior: fx.smooth ? 'smooth' : 'auto' });
  }

  /** What the PAYMENT card says, as one key — so a change can be shown. */
  const payKey = (): string => { const v = ivmView(d, s); return v.kind === 'due' ? `due:${v.amount}:${v.sub}` : v.kind === 'none' ? `none:${v.text}` : 'paid'; };
  function showPayChange(): void {
    const box = phone.querySelector('[data-ivm-paybox]');
    // The PAYMENT bar and its card together, so the customer's new "Due Now" is in view.
    phoneReveal(phone.querySelector('.ivm-q-payh'), box);
    fx.flash(box);
    liveCap.classList.remove('is-sync');
    void liveCap.offsetWidth;
    liveCap.classList.add('is-sync');
  }

  function render(): void {
    const st = ivmStatus(d, s);
    pill.className = ivmPillClass(st);
    pill.textContent = ivmStatusLabel(st);
    act.innerHTML = withAppIcons(renderIvmAct(d, s));
    balBox.innerHTML = renderIvmBal(d, s);
    finalBtn.classList.toggle('is-final', s.final);
    finalBtn.setAttribute('aria-pressed', String(s.final));
    finalBtn.textContent = `${s.final ? '☑' : '☐'} Final Invoice`;
    if (terms.value !== s.terms) terms.value = s.terms;
    if (document.activeElement !== pct && Number(pct.value) !== s.pct) pct.value = String(s.pct);
    upfront.textContent = ivmUpfront(d, s);
    totals.innerHTML = renderIvmTotals(d, s);
    pays.innerHTML = withAppIcons(renderIvmPays(d, s));
    if (Number(age.value) !== s.age) age.value = String(s.age);
    clock.textContent = ivmClockText(d, s);
    age.setAttribute('aria-valuetext', ivmClockText(d, s));
    phone.innerHTML = renderIvmPhone(d, s);
    reset.hidden = !(s.payments.length || s.terms !== d.terms || s.final || s.age || s.pct !== d.pct);
    if (termsChanged && checkRecorded && !task.classList.contains('is-done')) {
      task.classList.add('is-done');
      task.textContent = TASK_DONE;
    }
  }

  /** Re-render; when what the customer is asked for changed, show it on the phone; tell screen readers. */
  let viewTimer = 0;
  function changed(prefix = ''): void {
    const before = payKey();
    render();
    if (payKey() !== before) showPayChange();
    window.clearTimeout(viewTimer);
    viewTimer = window.setTimeout(() => announce(`${prefix}${ivmViewText(ivmView(d, s))}`), 350);
  }

  // ---- controls ----
  terms.addEventListener('change', () => {
    s.terms = terms.value;
    if (s.terms !== d.terms) termsChanged = true;
    changed(`Payment terms: ${s.terms || 'none'}. `);
  });
  pct.addEventListener('change', () => {
    // The app stores +value (blank → 0); the input's own range is 0–100.
    const n = Number(pct.value);
    s.pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    pct.value = String(s.pct);
    changed(`Down payment ${s.pct}%, ${ivmUpfront(d, s).replace('→ ', '')}. `);
  });
  age.addEventListener('input', () => {
    s.age = Math.max(0, Math.min(IVM_MAX_AGE, Math.round(Number(age.value) || 0)));
    changed(`${ivmClockText(d, s)}. `);
  });
  finalBtn.addEventListener('click', () => {
    // toggleFinalInvoice (main L6496): patched in place, and its toast.
    s.final = !s.final;
    const msg = s.final
      ? `☑ ${d.number} marked as final — the live invoice now asks for the full remaining balance`
      : `${d.number} is no longer final — the live invoice asks for the deposit portion again`;
    changed(`${msg}. `);
    toast(msg);
  });
  act.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-ivm-take]')) openTakePayment(); });
  pays.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-ivm-take2]')) openTakePayment(); });

  // ---- Take Payment (main L20865) — a native modal <dialog> inside the module's .app ----
  let opener: HTMLElement | null = null;
  function closeModal(focusEl?: HTMLElement | null): void {
    if (!dlg.open) return;
    dlg.close();
    dlg.innerHTML = '';
    const back = focusEl ?? (opener && opener.isConnected ? opener : null) ?? root.querySelector<HTMLElement>('[data-ivm-take], [data-ivm-paidtext]');
    back?.focus({ preventScroll: true });
    opener = null;
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeModal(); });

  function openTakePayment(): void {
    const active = document.activeElement as HTMLElement | null;
    opener = active && root.contains(active) ? active : null;
    const bal = Math.max(0, ivmBalance(d, s));
    const methods = RECORD_PAYMENT_METHODS.map((m) => `<option>${m}</option>`).join('');
    dlg.setAttribute('aria-labelledby', 'ivm-tp-h');
    dlg.style.setProperty('--dlg-w', '520px');
    dlg.innerHTML = `<div class="a-dlg">${withAppIcons(`
      <div class="a-dlg-h"><h4 id="ivm-tp-h">💰 Take Payment — ${esc(d.number)}</h4><button type="button" class="a-x" data-close aria-label="Close">✕</button></div>
      <div class="a-dlg-b">
        <div class="a-tabs" role="tablist" aria-label="How to take the payment"><button type="button" class="a-tab" role="tab" id="ivm-tab-rec" aria-selected="true" aria-controls="ivm-pane-rec" data-tp-tab="rec">📝 Record Payment</button><button type="button" class="a-tab" role="tab" id="ivm-tab-card" aria-selected="false" aria-controls="ivm-pane-card" data-tp-tab="card" tabindex="-1">💳 Charge Card</button></div>
        <div id="ivm-pane-rec" role="tabpanel" aria-labelledby="ivm-tab-rec" class="ivm-pane">
          <div class="a-field"><label for="ivm-tp-amt">Amount</label><input class="a-input num" id="ivm-tp-amt" type="number" step="0.01" inputmode="decimal" value="${bal.toFixed(2)}"></div>
          <div class="a-field"><label for="ivm-tp-method">Method</label><select class="a-select" id="ivm-tp-method">${methods}</select></div>
          <div class="a-field" data-tp-chk hidden><label for="ivm-tp-chk">Check #</label><input class="a-input" id="ivm-tp-chk" type="text" placeholder="e.g. 1042" autocomplete="off"></div>
          <div class="a-field"><label for="ivm-tp-date">Date</label><input class="a-input" id="ivm-tp-date" type="date" value="${ivmToday(d, s)}"></div>
        </div>
        <div id="ivm-pane-card" role="tabpanel" aria-labelledby="ivm-tab-card" class="ivm-pane" hidden>
          <div class="ivm-cardbox"><p><strong>No card can be charged on this page.</strong></p><p>In FloorLogic this tab opens Stripe’s card form, connected to the shop’s own Stripe account. This sample has no Stripe account.</p></div>
        </div>
      </div>
      <div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-tp-save>Record Payment</button></div>`)}</div>`;
    dlg.showModal();
    const box = dlg.querySelector<HTMLElement>('.a-dlg')!;
    fx.open(box);
    const amtIn = box.querySelector<HTMLInputElement>('#ivm-tp-amt')!;
    amtIn.focus({ preventScroll: true });
    const method = box.querySelector<HTMLSelectElement>('#ivm-tp-method')!;
    const chkRow = box.querySelector<HTMLElement>('[data-tp-chk]')!;
    const saveBtn = box.querySelector<HTMLButtonElement>('[data-tp-save]')!;
    // payToggleCheckNo: the Check # field shows only for a check.
    method.addEventListener('change', () => { chkRow.hidden = method.value !== 'Check'; });
    const tabs = Array.from(box.querySelectorAll<HTMLButtonElement>('[data-tp-tab]'));
    const setTab = (k: string, focus = false) => {
      tabs.forEach((t) => { const on = t.dataset.tpTab === k; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
      box.querySelector<HTMLElement>('#ivm-pane-rec')!.hidden = k !== 'rec';
      box.querySelector<HTMLElement>('#ivm-pane-card')!.hidden = k !== 'card';
      // _switchTakePayTab (main L20866): "💳 Charge Card" stays disabled until Stripe's form is ready — here, always.
      saveBtn.innerHTML = withAppIcons(k === 'rec' ? 'Record Payment' : '💳 Charge Card');
      saveBtn.disabled = k !== 'rec';
    };
    box.querySelector('[role="tablist"]')!.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return;
      e.preventDefault();
      const cur = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      const next = k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (cur + (k === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      setTab(tabs[next]!.dataset.tpTab!, true);
    });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-tp-tab]')) { setTab(t.dataset.tpTab!); return; }
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-tp-save]') || t.disabled) return;
      // recordPayment (main L21005)
      const amt = Number(amtIn.value);
      if (!amt || amt <= 0) { toast(ENTER_VALID_AMOUNT, 'warning'); announce(ENTER_VALID_AMOUNT); amtIn.focus(); return; }
      const chk = box.querySelector<HTMLInputElement>('#ivm-tp-chk')!.value.trim();
      const day = box.querySelector<HTMLInputElement>('#ivm-tp-date')!.value as ISODate;
      const pay: IvmPayment = { amount: round2(amt), method: method.value, date: day || ivmToday(d, s) };
      if (pay.method === 'Check' && chk) pay.checkNumber = chk;
      const before = payKey();
      s.payments.push(pay);
      if (pay.method === 'Check') checkRecorded = true;
      const st = ivmStatus(d, s);
      render();
      if (payKey() !== before) showPayChange();
      // Paid in full hides Take Payment, so focus lands on the "✅ Paid in Full" note instead.
      closeModal(root.querySelector<HTMLElement>(st === 'paid' ? '[data-ivm-paidtext]' : '[data-ivm-take]'));
      const msg = paymentRecordedToast(pay.amount, d.number);
      toast(msg);
      announce(`${msg}. Invoice ${ivmStatusLabel(st)}. Balance due ${fmtMoney(ivmBalance(d, s))}. ${ivmViewText(ivmView(d, s))}`);
    });
  }

  reset.addEventListener('click', () => {
    closeModal(terms);
    s = ivmInitialState(d);
    termsChanged = false;
    checkRecorded = false;
    task.classList.remove('is-done');
    task.textContent = taskText;
    render();
    phoneScroll.scrollTop = 0;
    body.scrollTop = 0;
    announce(`Started over. ${ivmViewText(ivmView(d, s))}`);
    terms.focus({ preventScroll: true });
  });

  // The customer's page is laid out at a 430 px phone viewport and zoomed (CSS zoom < 1 keeps text
  // crisp — no transform) to the drawn screen; InvoiceModule.astro has the no-JS steps.
  const fitPhone = () => {
    const w = phoneScroll.clientWidth;
    if (w > 0) phoneScreen.style.setProperty('--ivm-qz', String(Math.floor((w / 430) * 10000) / 10000));
  };
  // Toasts dock right under the sticky invoice header, whatever its height.
  const head = root.querySelector<HTMLElement>('.ivm-top');
  const fitHead = () => { if (head) root.style.setProperty('--ivm-head', `${Math.round(head.offsetHeight)}px`); };
  fitPhone();
  fitHead();
  if ('ResizeObserver' in window) {
    new ResizeObserver(fitPhone).observe(phoneScroll);
    if (head) new ResizeObserver(fitHead).observe(head);
  }

  render();
  root.classList.add('is-live');
}
