/**
 * Invoice module ("Get paid"): the office side of IN-330 — Payment Terms, Down
 * Payment, the Final Invoice toggle and Take Payment → Record Payment (main
 * L15990-16090, L18236, L18355) — beside the customer's live invoice and its
 * PAYMENT card (q L1636-1684).
 *
 * What the customer is asked for comes from due-now.ts (`dueNowView` →
 * `computeDueNow`, the rule Stripe actually charges); the status after a
 * payment from `invoiceStatus`. The pay button stays disabled: on the live
 * invoice it opens Stripe's card form, and there is no fake one here.
 * Fictional sample data; nothing is saved or sent anywhere.
 */
import gsap from 'gsap';
import { dueNowView, invoiceStatus, depositAmount, fmtMoney, fmtDate, addDays, round2, INVOICE_STATUS_COLOR_NAMES } from '../lib/logic';
import type { ISODate, InvoiceStatus, DueNowView } from '../lib/logic';

export interface IvmData {
  number: string;
  customer: string;
  initials: string;
  shop: { name: string; address: string; city: string };
  /** Date-only creation day; the age slider counts from here. */
  createdAt: ISODate;
  materials: number;
  labor: number;
  subtotal: number;
  tax: number;
  total: number;
  /** Unrounded subtotal + tax — what the builder's "due upfront" multiplies (main L16001). */
  rawTotal: number;
  terms: string;
  pct: number;
  termsOptions: string[];
}
export interface IvmPayment { amount: number; method: string; date: ISODate; checkNumber?: string }
export interface IvmState {
  terms: string;
  pct: number;
  age: number;
  final: boolean;
  payments: IvmPayment[];
  termsChanged: boolean;
  checkRecorded: boolean;
}

export const IVM_MAX_AGE = 60;
export const PAY_CAPTION = 'Opens Stripe’s card form on the live invoice';

export function ivmInitialState(d: IvmData): IvmState {
  return { terms: d.terms, pct: d.pct, age: 0, final: false, payments: [], termsChanged: false, checkRecorded: false };
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The simulated "today": the invoice's creation day + the slider's age. */
export const ivmToday = (d: IvmData, s: IvmState): ISODate => addDays(d.createdAt, s.age);
/** A fixed instant (noon UTC) on that day, so the age maths never depends on the viewer's time zone. */
const noonMs = (iso: ISODate): number => Date.parse(`${iso}T12:00:00Z`);
export const ivmPaid = (s: IvmState): number => round2(s.payments.reduce((a, p) => a + p.amount, 0));
export const ivmBalance = (d: IvmData, s: IvmState): number => round2(d.total - ivmPaid(s));
export const ivmStatus = (d: IvmData, s: IvmState): InvoiceStatus => invoiceStatus(d.total, s.payments);
export const ivmStatusLabel = (st: InvoiceStatus): string => st.charAt(0).toUpperCase() + st.slice(1);
export const ivmPillClass = (st: InvoiceStatus): string => `a-pill a-${INVOICE_STATUS_COLOR_NAMES[st]}`;

export function ivmView(d: IvmData, s: IvmState): DueNowView {
  return dueNowView(
    { total: d.total, paid: ivmPaid(s), terms: s.terms, downPaymentPct: s.pct, finalInvoice: s.final, createdAt: d.createdAt },
    noonMs(ivmToday(d, s)),
  );
}

/** Builder line under Down Payment (main L16090): "→ $4,312.35 due upfront". */
export function ivmUpfront(d: IvmData, s: IvmState): string {
  return `→ ${fmtMoney(depositAmount(d.rawTotal, s.pct))} due upfront`;
}

export function ivmAgeText(d: IvmData, s: IvmState): string {
  return `${s.age} day${s.age === 1 ? '' : 's'} old · ${fmtDate(ivmToday(d, s))}`;
}

/** Office totals (main L16068-16078): Balance Due turns green at $0. */
export function renderIvmTotals(d: IvmData, s: IvmState): string {
  const paid = ivmPaid(s);
  const bal = ivmBalance(d, s);
  return `<tbody><tr><td>Materials</td><td class="num">${fmtMoney(d.materials)}</td></tr>`
    + `<tr><td>Labor</td><td class="num">${fmtMoney(d.labor)}</td></tr>`
    + `<tr><td>Subtotal</td><td class="num">${fmtMoney(d.subtotal)}</td></tr>`
    + `<tr><td>Tax</td><td class="num">${fmtMoney(d.tax)}</td></tr>`
    + `<tr class="ivm-grand"><td>Total</td><td class="num">${fmtMoney(d.total)}</td></tr>`
    + `<tr class="ivm-paid"><td>Paid</td><td class="num">-${fmtMoney(paid)}</td></tr>`
    + `<tr class="ivm-bal${bal > 0 ? ' is-due' : ''}" data-ivm-bal><td>Balance Due</td><td class="num">${fmtMoney(bal)}</td></tr></tbody>`;
}

/** Office "💳 Payments" card body (main L15990). */
export function renderIvmPays(s: IvmState): string {
  if (!s.payments.length) return '<p class="ivm-nopay">No payments recorded yet.</p>';
  const rows = s.payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.method)}${p.checkNumber ? ` <span class="ivm-chk">#${esc(p.checkNumber)}</span>` : ''}</td><td class="r num ivm-green">${fmtMoney(p.amount)}</td></tr>`).join('');
  return `<table class="ivm-ptable"><thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col" class="r">Amount</th></tr></thead><tbody>${rows}<tr class="ivm-ptd"><td colspan="2">Paid to date</td><td class="r num ivm-green">${fmtMoney(ivmPaid(s))}</td></tr></tbody></table>`;
}

/** The customer's live invoice: totals, the PAYMENT card in its three states, and PAYMENTS. */
export function renderIvmPhone(d: IvmData, s: IvmState): string {
  const paid = ivmPaid(s);
  const bal = ivmBalance(d, s);
  const v = ivmView(d, s);
  let card: string;
  if (v.kind === 'paid') {
    card = `<div class="ivm-pay-done"><div class="ivm-big">${esc(v.title)}</div><div class="ivm-meta">${esc(v.meta)}</div></div>`;
  } else if (v.kind === 'none') {
    // q L1660: first sentence, a line break, and the balance in bold.
    const [first, ...rest] = v.text.split(/(?<=\.)\s+/);
    const tail = esc(rest.join(' ')).replace(/\$[\d,]+\.\d{2}/, (m) => `<strong>${m}</strong>`);
    card = `<div class="ivm-pay-none">${esc(first)}<br>${tail}</div>`;
  } else {
    card = `<div class="ivm-pay-card"><div class="ivm-due-row"><span class="ivm-due-lbl">${esc(v.label)}</span><span class="ivm-due-amt num" data-ivm-due>${esc(v.amount)}</span></div>`
      + `<div class="ivm-due-sub">${esc(v.sub)}</div>`
      + `<button type="button" class="ivm-pay-btn" disabled aria-describedby="ivm-paycap">${esc(v.button)}</button>`
      + `<p class="ivm-paycap" id="ivm-paycap">${PAY_CAPTION}</p>`
      + `<div class="ivm-pay-note">🔒 Secure card payment powered by Stripe</div></div>`;
  }
  const pays = s.payments.length
    ? `<div class="ivm-sec-h">PAYMENTS</div><table class="ivm-lt"><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col" class="num">Amount</th></tr></thead><tbody>${s.payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.method)}</td><td class="num">${fmtMoney(p.amount)}</td></tr>`).join('')}</tbody></table>`
    : '';
  return `<div class="ivm-q-tot"><div class="ivm-row"><span>Sales Tax</span><span class="num">${fmtMoney(d.tax)}</span></div>`
    + `<div class="ivm-row ivm-row-grand"><span>TOTAL</span><span class="num">${fmtMoney(d.total)}</span></div>`
    + `<div class="ivm-row"><span>Amount Paid</span><span class="num">-${fmtMoney(paid)}</span></div>`
    + `<div class="ivm-row ivm-row-grand"><span>BALANCE DUE</span><span class="num" data-ivm-cbal>${fmtMoney(bal)}</span></div></div>`
    + `<div class="ivm-pay-h">PAYMENT</div>${card}${pays}`;
}

/** One line for screen readers: what the customer is asked for now. */
export function ivmViewText(v: DueNowView): string {
  if (v.kind === 'paid') return 'Customer’s invoice: Paid in Full.';
  if (v.kind === 'none') return `Customer’s invoice: ${v.text}`;
  return `Customer’s invoice: Due Now ${v.amount}, ${v.sub}.`;
}

// ----------------------------------------------------------- the island --

type ToastType = 'success' | 'info' | 'warning' | 'error';
const TOAST_ICON: Record<ToastType, string> = { success: '✅', info: 'ℹ️', warning: '⚠️', error: '❌' };
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const main = $('[data-ivm-main]');
  const pill = $('[data-ivm-pill]');
  const finalBtn = $<HTMLButtonElement>('[data-ivm-final]');
  const takeBtn = $<HTMLButtonElement>('[data-ivm-take]');
  const paidText = $('[data-ivm-paidtext]');
  const terms = $<HTMLSelectElement>('[data-ivm-terms]');
  const pct = $<HTMLInputElement>('[data-ivm-pct]');
  const upfront = $('[data-ivm-upfront]');
  const totals = $('[data-ivm-totals]');
  const pays = $('[data-ivm-pays]');
  const age = $<HTMLInputElement>('[data-ivm-age]');
  const ageOut = $('[data-ivm-ageout]');
  const phone = $('[data-ivm-phone]');
  const overlay = $('[data-ivm-modal]');
  const toastEl = $('[data-ivm-toast]');
  const live = $('[data-ivm-live]');
  const task = $('[data-task]');
  const reset = $<HTMLButtonElement>('[data-ivm-reset]');
  const taskText = task.textContent || '';

  const liveDot = root.querySelector('[data-ivm-livedot]');
  const fx = { pop: (_el: Element) => {}, open: (_el: Element) => {}, ping: (_el: Element | null) => {} };
  gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const { motion } = ctx.conditions as { motion: boolean };
    if (!motion) { fx.pop = () => {}; fx.open = () => {}; fx.ping = () => {}; return; }
    fx.pop = (el) => { gsap.fromTo(el, { scale: 0.94 }, { scale: 1, duration: 0.4, ease: 'back.out(2.2)', clearProps: 'transform' }); };
    fx.open = (box) => { gsap.fromTo(box, { y: 14, scale: 0.985, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' }); };
    // The "live" dot pings when the customer's copy changes (same cue as the quote module's phone).
    fx.ping = (el) => { if (el) gsap.fromTo(el, { boxShadow: '0 0 0 0 rgba(16,185,129,.6)' }, { boxShadow: '0 0 0 11px rgba(16,185,129,0)', duration: 0.75, ease: 'power1.out', clearProps: 'boxShadow' }); };
  });

  let toastTimer = 0;
  function toast(msg: string, type: ToastType = 'success'): void {
    toastEl.dataset.type = type;
    toastEl.innerHTML = `<span aria-hidden="true">${TOAST_ICON[type]}</span><span>${esc(msg)}</span>`;
    toastEl.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('is-on'), 3200);
  }
  let liveTimer = 0;
  function announce(msg: string): void {
    window.clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = window.setTimeout(() => { live.textContent = msg; }, 80);
  }

  function render(): void {
    const st = ivmStatus(d, s);
    pill.className = ivmPillClass(st);
    pill.textContent = ivmStatusLabel(st);
    takeBtn.hidden = st === 'paid';
    paidText.hidden = st !== 'paid';
    finalBtn.classList.toggle('is-final', s.final);
    finalBtn.setAttribute('aria-pressed', String(s.final));
    finalBtn.textContent = `${s.final ? '☑' : '☐'} Final Invoice`;
    if (terms.value !== s.terms) terms.value = s.terms;
    if (document.activeElement !== pct && Number(pct.value) !== s.pct) pct.value = String(s.pct);
    upfront.textContent = ivmUpfront(d, s);
    totals.innerHTML = renderIvmTotals(d, s);
    pays.innerHTML = renderIvmPays(s);
    if (Number(age.value) !== s.age) age.value = String(s.age);
    ageOut.textContent = ivmAgeText(d, s);
    age.setAttribute('aria-valuetext', ivmAgeText(d, s));
    const before = phone.querySelector('[data-ivm-due]')?.textContent ?? phone.querySelector('.ivm-pay-done, .ivm-pay-none')?.className ?? '';
    phone.innerHTML = renderIvmPhone(d, s);
    const after = phone.querySelector('[data-ivm-due]')?.textContent ?? phone.querySelector('.ivm-pay-done, .ivm-pay-none')?.className ?? '';
    if (before !== after) {
      const target = phone.querySelector('.ivm-pay-card, .ivm-pay-done, .ivm-pay-none');
      if (target) fx.pop(target);
      fx.ping(liveDot);
    }
    reset.hidden = !(s.payments.length || s.termsChanged || s.final || s.age || s.pct !== d.pct);
    if (s.termsChanged && s.checkRecorded && !task.classList.contains('is-done')) {
      task.classList.add('is-done');
      task.textContent = 'Done: terms switched and the check is on the books.';
      fx.pop(task);
    }
  }

  /** Re-render, then tell screen readers what the customer now sees (debounced for the slider). */
  let viewTimer = 0;
  function changed(prefix = ''): void {
    render();
    window.clearTimeout(viewTimer);
    viewTimer = window.setTimeout(() => announce(`${prefix}${ivmViewText(ivmView(d, s))}`), 350);
  }

  // ---- controls ----
  terms.addEventListener('change', () => {
    s.terms = terms.value;
    if (s.terms !== d.terms) s.termsChanged = true;
    changed(`Payment terms: ${s.terms || 'none'}. `);
  });
  pct.addEventListener('change', () => {
    // The app stores +value (blank → 0); due-now.ts clamps to 0–100.
    const n = Number(pct.value);
    s.pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    pct.value = String(s.pct);
    changed(`Down payment ${s.pct}%, ${fmtMoney(depositAmount(d.rawTotal, s.pct))} due upfront. `);
  });
  finalBtn.addEventListener('click', () => {
    s.final = !s.final;
    changed(s.final ? 'Final invoice on. ' : 'Final invoice off. ');
  });
  age.addEventListener('input', () => {
    s.age = Math.max(0, Math.min(IVM_MAX_AGE, Number(age.value) || 0));
    changed(`Invoice ${s.age} days old. `);
  });

  // ---- Take Payment (main L18236) ----
  let opener: HTMLElement | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  function closeModal(focusEl?: HTMLElement | null): void {
    if (overlay.hidden) return;
    if (onKey) overlay.removeEventListener('keydown', onKey);
    onKey = null;
    overlay.hidden = true;
    overlay.innerHTML = '';
    main.inert = false;
    const back = focusEl ?? (opener && opener.isConnected && !opener.hidden ? opener : null) ?? finalBtn;
    back.focus({ preventScroll: true });
    opener = null;
  }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });

  function openTakePayment(): void {
    const active = document.activeElement as HTMLElement | null;
    opener = active && root.contains(active) ? active : takeBtn;
    const bal = Math.max(0, ivmBalance(d, s));
    overlay.innerHTML = `<div class="ivm-dlg" role="dialog" aria-modal="true" aria-labelledby="ivm-tp-h">
      <div class="ivm-dlg-h"><h4 id="ivm-tp-h">💰 Take Payment — ${esc(d.number)}</h4><button type="button" class="ivm-x" data-close aria-label="Close">✕</button></div>
      <div class="ivm-dlg-b">
        <div class="ivm-tabs"><span class="ivm-tab is-on">📝 Record Payment</span><span class="ivm-tab is-off" title="Card charges open Stripe’s card form in the live app">💳 Charge Card<span class="sr-only"> (runs through Stripe in the live app)</span></span></div>
        <div class="ivm-fg"><label for="ivm-tp-amt">Amount</label><input class="a-input num" id="ivm-tp-amt" type="number" step="0.01" min="0" inputmode="decimal" value="${bal.toFixed(2)}"></div>
        <div class="ivm-fg"><label for="ivm-tp-method">Method</label><select class="a-select" id="ivm-tp-method"><option>Cash</option><option>Check</option><option>Bank Transfer</option><option>Other</option></select></div>
        <div class="ivm-fg" data-tp-chk hidden><label for="ivm-tp-chk">Check #</label><input class="a-input" id="ivm-tp-chk" type="text" placeholder="e.g. 1042"></div>
        <div class="ivm-fg"><label for="ivm-tp-date">Date</label><input class="a-input" id="ivm-tp-date" type="date" value="${ivmToday(d, s)}"></div>
      </div>
      <div class="ivm-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-tp-save>Record Payment</button></div>
    </div>`;
    overlay.hidden = false;
    main.inert = true;
    const box = overlay.firstElementChild as HTMLElement;
    fx.open(box);
    box.querySelector<HTMLInputElement>('#ivm-tp-amt')!.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'nearest' });
    onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const a = f[0]!, z = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    overlay.addEventListener('keydown', onKey);
    const method = box.querySelector<HTMLSelectElement>('#ivm-tp-method')!;
    method.addEventListener('change', () => { box.querySelector<HTMLElement>('[data-tp-chk]')!.hidden = method.value !== 'Check'; });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-tp-save]')) return;
      // recordPayment (main L18355)
      const amt = Number(box.querySelector<HTMLInputElement>('#ivm-tp-amt')!.value);
      if (!amt || amt <= 0) { toast('Enter valid amount', 'warning'); return; }
      const chk = box.querySelector<HTMLInputElement>('#ivm-tp-chk')!.value.trim();
      const pay: IvmPayment = { amount: round2(amt), method: method.value, date: (box.querySelector<HTMLInputElement>('#ivm-tp-date')!.value || ivmToday(d, s)) as ISODate };
      if (pay.method === 'Check' && chk) pay.checkNumber = chk;
      s.payments.push(pay);
      if (pay.method === 'Check') s.checkRecorded = true;
      const st = ivmStatus(d, s);
      render();
      // Paid in full hides Take Payment, so focus lands on the "✅ Paid in Full" note instead.
      closeModal(st === 'paid' ? paidText : null);
      fx.pop(pill);
      const msg = `Payment of ${fmtMoney(pay.amount)} recorded on ${d.number}`;
      toast(msg);
      announce(`Invoice ${ivmStatusLabel(st)}. Balance due ${fmtMoney(ivmBalance(d, s))}. ${ivmViewText(ivmView(d, s))}`);
    });
  }
  takeBtn.addEventListener('click', openTakePayment);

  reset.addEventListener('click', () => {
    closeModal(finalBtn);
    s = ivmInitialState(d);
    task.classList.remove('is-done');
    task.textContent = taskText;
    render();
    announce(`Started over. ${ivmViewText(ivmView(d, s))}`);
    terms.focus();
  });

  render();
}
