/**
 * "Run the install" — WO-330 and the ONE status-driven button the current app puts in the work
 * order header (renderJobDetail, main L16824-16922), walked through today's sequence:
 *
 *   📦 Order Materials  → the Order Materials window (main L21032-21231): PO # "WO-330-1"…, Order
 *                         Date, Est. Delivery (+14 days), Est. Freight. Ordering EVERY line goes
 *                         straight to Ready to Schedule (_matMaybeAdvance L21513); Finish files the
 *                         purchase orders under the next JPO numbers (_nextJobPONumber L21030).
 *   📅 Schedule Install → Start date *, End date *, Assigned Installer (main L19435-19522).
 *   ✅ Mark Job Complete — or nothing at all: the day after the install ends the app completes the
 *                         job itself (_plAutoAdvanceSweep L29503). The demo clock shows that.
 *   📄 View Final Invoice → IN-330 → 💰 Take Payment → Record Payment (main L20865, L21005); paid in
 *                         full moves the job to Ready to be Paid on its own (_advanceJobToReady).
 *   💰 Mark as Paid…    → the installer payout (openTechPaymentModal L20755) → Paid → Archive.
 *
 * Labels, colours, transitions and toasts come from src/lib/logic. The app's emoji become its line
 * icons where the app swaps them (screens and windows; toasts keep emoji). Fictional sample data;
 * nothing is saved or sent.
 */
import gsap from 'gsap';
import {
  WO_LABELS, WO_BUCKETS, MANAGE_POS, MARK_PAID_DISABLED_TITLE, JOB_STATUS_COLOR_NAMES, ORDER_MATERIALS_INFO, ORDER_NEEDS_PO_TOAST,
  ORDER_NOTHING_TICKED_TOAST, RECORD_PAYMENT_METHODS, ENTER_VALID_AMOUNT, APP_BADGE_TINT, siteHex, woPrimaryAction, showsManagePOs,
  woTransition, completeToast, saveSchedule, orderMaterials, orderMaterialsLineDefaults, nextJobPONumber, poFieldSavedToast, installRangeHint,
  endFollowingStart, installEnd, installSpan, autoAdvance, invoiceStatus, paymentRecordedToast, paymentTypeLabel, canTakePayment, qtyExtra,
  fmtMoney, fmtDate, fmtQty, fmtWeekdayShort, addDays, round2,
} from '../lib/logic';
import type { WoStatus, WoPrimary, ISODate, InvoiceStatus, ColorName, WoMaterialLine } from '../lib/logic';
import { withAppIcons } from '../data/modules/app-icons';
import { appToaster, type AppToastType } from '../data/modules/app-toast';

// ------------------------------------------------------------------ data --

export interface WomLine {
  name: string; matNum: string; vendor: string; uom: string; qty: number; cost: number;
  purchaseUOM: string; coveragePerUOM: number; costUOM: string; coverageUOM: string;
  rollWidth?: number; lengthFt?: number; lengthIn?: number;
}
export interface WomPerson { id: string; name: string; trade: string }
export interface WomPayment { amount: number; method: string; date: ISODate; checkNumber?: string; label?: string }
export interface WomData {
  wo: string;
  customer: string;
  initials: string;
  phone: string;
  /** Site, for the windows (sample leads carry a city only). */
  site: string;
  issued: ISODate;
  /** The demo clock starts here: the day QT-330 was converted and WO-330 created. */
  today: ISODate;
  rep: string;
  invoice: { number: string; total: number; payments: WomPayment[] };
  /** People who can be put on the job (the app lists those whose Role is Installer). */
  people: WomPerson[];
  lines: WomLine[];
  /** Σ labor qty × company cost — the payout window's "Est. Labor Owed". */
  laborOwed: number;
  /** The last JPO number in the system; Finish numbers new POs after it. */
  poCounter: number;
  start: WoStatus;
}
export interface WomPO {
  /** The work-order line's state in the Order Materials window. */
  ordered: boolean;
  poNumber: string;
  orderDate: ISODate;
  eta: ISODate;
  freight: number | '';
  qty: number;
  cost: number;
  /** The purchase-order record Finish made ("JPO-1193"). */
  jpo: string;
}
export interface WomState {
  status: WoStatus;
  today: ISODate;
  start: ISODate | '';
  end: ISODate | '';
  crew: string;
  pos: WomPO[];
  poCounter: number;
  payments: WomPayment[];
  /** What the app did overnight on the last clock step (shown as a note), or ''. */
  overnight: string;
}

export function womInitialState(d: WomData): WomState {
  return {
    status: d.start,
    today: d.today,
    start: '',
    end: '',
    crew: '',
    pos: d.lines.map((l, i) => {
      const def = orderMaterialsLineDefaults(d.wo, i, d.today);
      return { ordered: false, poNumber: def.poNumber, orderDate: def.orderDate, eta: def.estimatedDelivery, freight: def.freight, qty: l.qty, cost: l.cost, jpo: '' };
    }),
    poCounter: d.poCounter,
    payments: d.invoice.payments.map((p) => ({ ...p })),
    overnight: '',
  };
}

// ------------------------------------------------------- pure renderers --

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
/** Labels without their leading emoji, for screen-reader announcements. */
export function plain(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

const paidTotal = (s: WomState): number => round2(s.payments.reduce((a, p) => a + p.amount, 0));
export const womBalance = (d: WomData, s: WomState): number => round2(d.invoice.total - paidTotal(s));
/** The stored status `recordPayment` writes (paid ≥ total → paid, anything → deposit). */
export const womInvoiceStatus = (d: WomData, s: WomState): InvoiceStatus => invoiceStatus(d.invoice.total, s.payments);

export function womPrimary(d: WomData, s: WomState): WoPrimary {
  return woPrimaryAction(s.status, { hasLinkedInvoice: true, anyInvoicePaid: womInvoiceStatus(d, s) === 'paid' });
}

export interface PrimaryView { kind: 'button' | 'text' | 'none'; action: string; text: string; cls: string; locked: boolean; title: string }

export function womPrimaryView(d: WomData, s: WomState): PrimaryView {
  const p = womPrimary(d, s);
  if (!p) return { kind: 'none', action: '', text: '', cls: 'a-btn wom-primary', locked: true, title: '' };
  if (p.kind === 'text') return { kind: 'text', action: '', text: p.label, cls: 'wom-paidtext', locked: true, title: '' };
  const variant = p.variant === 'success' ? 'a-success' : p.variant === 'warning' ? 'a-warning' : 'a-primary';
  return { kind: 'button', action: p.action, text: p.label, cls: `a-btn ${variant} wom-primary`, locked: !p.enabled, title: p.title ?? '' };
}

export function womPill(status: WoStatus): { cls: string; label: string } {
  return { cls: `a-pill a-${JOB_STATUS_COLOR_NAMES[status]} wom-pill`, label: WO_LABELS[status] };
}

type Bucket = (typeof WO_BUCKETS)[number];
/** On Hold is the board's optional column, drawn only when a job sits in it (main L21252). */
const BOARD: readonly Bucket[] = WO_BUCKETS.filter((b) => b.key !== 'on_hold');
const bucketOf = (status: WoStatus): Bucket | null => WO_BUCKETS.find((b) => (b.statuses as readonly WoStatus[]).includes(status)) ?? null;

/** The Projects pipeline (JOB_BUCKETS, main L21252) — no Done column; Paid jobs live on the 🗄️ Archive tab. */
export function renderWomBoard(d: WomData, s: WomState): string {
  const cur = bucketOf(s.status);
  const archived = s.status === 'paid' || s.status === 'complete';
  const chip = `<span class="wom-chip" data-wom-chip>${esc(d.wo)}</span>`;
  const cols = BOARD.map((b) => {
    const on = cur?.key === b.key;
    const color = b.color as ColorName;
    return `<li class="wom-col${on ? ' is-on' : ''}" data-bucket="${b.key}" style="--c:${siteHex(color)};--t:${APP_BADGE_TINT[color]}"${on ? ' aria-current="step"' : ''}>`
      + `<span class="wom-col-h"><span class="wom-col-i" aria-hidden="true">${b.icon}</span><span class="wom-col-l">${esc(b.label)}</span></span>`
      + `<span class="wom-slot">${on ? chip : ''}</span></li>`;
  }).join('');
  const arch = `<li class="wom-col wom-col-arch${archived ? ' is-on' : ''}" data-bucket="archive"${archived ? ' aria-current="step"' : ''}>`
    + `<span class="wom-col-h"><span class="wom-col-i" aria-hidden="true">🗄️</span><span class="wom-col-l">Archive</span></span><span class="wom-slot">${archived ? chip : ''}</span></li>`;
  const cap = archived
    ? '🗄️ Archive <span class="wom-cap-sub">· Projects → Archive tab — off the board</span>'
    : cur ? `${cur.icon} ${esc(cur.label)}${cur.sub ? ` <span class="wom-cap-sub">· ${esc(cur.sub)}</span>` : ''}` : '—';
  return `<p class="wom-board-cap"><span class="wom-cap-k">Pipeline</span> <span data-wom-cap>${cap}</span></p><ol class="wom-cols" aria-label="Projects pipeline columns">${cols}${arch}</ol>`;
}

export function renderWomMeta(d: WomData, s: WomState): string {
  const crew = d.people.find((p) => p.id === s.crew);
  return `<div><dt>Issued</dt><dd>${fmtDate(d.issued)}</dd></div>`
    + `<div><dt>Start</dt><dd>${s.start ? fmtDate(s.start) : '—'}</dd></div>`
    + `<div><dt>End</dt><dd>${s.end ? fmtDate(s.end) : '—'}</dd></div>`
    + `<div><dt>Installer</dt><dd>${crew ? `${esc(crew.name)} · ${esc(crew.trade)}` : 'Select…'}</dd></div>`
    + `<div><dt>Sales Rep</dt><dd>${esc(d.rep)}</dd></div>`
    + '<div><dt>Sales Rep 2</dt><dd>— None —</dd></div>';
}

/** Header buttons: 📦 Manage POs (every status but Order Materials) + the one status button. */
export function renderWomActions(d: WomData, s: WomState): string {
  const v = womPrimaryView(d, s);
  const pos = showsManagePOs(s.status) ? `<button type="button" class="a-btn a-outline wom-pos" data-wom-pos title="${esc(MANAGE_POS.title)}">${MANAGE_POS.label}</button>` : '';
  let main = '';
  if (v.kind === 'text') main = `<span class="wom-paidtext" data-wom-done tabindex="-1">${esc(v.text)}</span>`;
  else if (v.kind === 'button') {
    main = `<button type="button" class="${v.cls}" data-wom-primary data-action="${v.action}"${v.title ? ` title="${esc(v.title)}"` : ''}${v.locked ? ' disabled aria-describedby="wom-lock"' : ''}>${esc(v.text)}</button>`;
  }
  const lock = v.kind === 'button' && v.locked ? `<p class="wom-lock" id="wom-lock">${esc(MARK_PAID_DISABLED_TITLE)}</p>` : '';
  return `<div class="wom-btns">${pos}${main}</div>${lock}`;
}

function lineHint(l: WomLine): string {
  const x = qtyExtra({ quantity: l.qty, coveragePerUOM: l.coveragePerUOM, purchaseUOM: l.purchaseUOM, costUOM: l.costUOM, coverageUOM: l.coverageUOM, rollWidth: l.rollWidth, lengthFt: l.lengthFt, lengthIn: l.lengthIn, matNum: l.matNum });
  if (x?.kind === 'cartons') return `<span class="wom-hint"><b>📦 ${esc(x.hint.count)}</b> <span>${esc(x.hint.equals)}</span></span>`;
  if (x?.kind === 'roll') return `<span class="wom-hint"><b>📐 ${esc(x.text)}</b>${x.width ? ` <span>${esc(x.width.text)}</span>` : ''}</span>`;
  return '';
}

export function renderWomMats(d: WomData, s: WomState): string {
  return d.lines.map((l, i) => {
    const po = s.pos[i]!;
    // woBuildMatRowHtml (main L13821): "🚚 Est. delivery: —" until the line has a PO with dates.
    const eta = po.ordered
      ? `<span class="wom-eta is-on" title="Estimated delivery — set in the Order Materials window">🚚 Est. delivery: ${esc(fmtDate(po.eta))}</span>`
      : '<span class="wom-eta" title="Not yet ordered — set delivery date in Order Materials window">🚚 Est. delivery: —</span>';
    const total = l.qty * l.cost;
    return `<tr><td><span class="wom-mname">${esc(l.name)}</span><span class="wom-msub">#${esc(l.matNum)} · ${esc(l.vendor)}</span>${eta}</td>`
      + `<td class="wom-c-qty"><span class="num">${fmtQty(l.qty)}</span> <span class="wom-uom">${esc(l.uom)}</span>${lineHint(l)}</td>`
      + `<td class="r num wom-c-cost">${(l.cost).toFixed(2)}</td><td class="r num wom-c-tot">${total.toFixed(2)}</td></tr>`;
  }).join('');
}

/** The demo clock beside the frame: today's date, the next step, and what the app did overnight. */
export function renderWomClock(_d: WomData, s: WomState): string {
  const end = s.start ? installEnd(s.start, installSpan(s.start, s.end).days ?? 1) : null;
  const waiting = (s.status === 'scheduled' || s.status === 'in_progress') && end && end >= s.today;
  const jump = waiting ? addDays(end, 1) : '';
  const btn = jump
    ? `<button type="button" class="mod-ctl-btn" data-wom-skip="${jump}">Skip to ${esc(fmtWeekdayShort(jump))}, the day after the install</button>`
    : `<button type="button" class="mod-ctl-btn" data-wom-skip="${addDays(s.today, 1)}">Next day</button>`;
  return `<span class="wom-clock-l"><span aria-hidden="true">📅</span> Demo clock: <b data-wom-today>${esc(fmtWeekdayShort(s.today))}, ${esc(s.today.slice(0, 4))}</b></span>${btn}`
    + (s.overnight ? `<p class="mod-note" role="note">${esc(s.overnight)}</p>` : '');
}

// ----------------------------------------------------------- the island --

type ToastType = AppToastType;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initWorkOrderModules(): void {
  document.querySelectorAll<HTMLElement>('[data-wom]').forEach(initOne);
}

function initOne(root: HTMLElement): void {
  if (root.dataset.womReady) return;
  root.dataset.womReady = '1';
  const dataEl = root.querySelector('[data-wom-data]');
  if (!dataEl) return;
  const d = JSON.parse(dataEl.textContent || '{}') as WomData;
  let s = womInitialState(d);

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const board = $('[data-wom-board]');
  const pill = $('[data-wom-pill]');
  const meta = $('[data-wom-meta]');
  const actions = $('[data-wom-actions]');
  const mats = $('[data-wom-mats]');
  const clock = $('[data-wom-clock]');
  const topDate = $('[data-wom-topdate]');
  const dlg = $<HTMLDialogElement>('[data-wom-dlg]');
  const toastEl = $('[data-wom-toast]');
  const live = $('[data-wom-live]');
  const task = $('[data-task]');
  const reset = $<HTMLButtonElement>('[data-wom-reset]');
  const taskText = task.textContent || '';

  // ---- motion: the board chip slides; dialogs rise; nothing scales above 1, nothing under reduced motion ----
  const fx = { slide: (_el: Element, _dx: number, _dy: number) => {}, open: (_box: Element) => {}, nudge: (_el: Element) => {} };
  gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const { motion } = ctx.conditions as { motion: boolean };
    if (!motion) { fx.slide = () => {}; fx.open = () => {}; fx.nudge = () => {}; return; }
    fx.slide = (el, dx, dy) => { gsap.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.6, ease: 'power3.inOut', clearProps: 'transform' }); };
    fx.open = (box) => { gsap.fromTo(box, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: 'transform,opacity' }); };
    fx.nudge = (el) => { gsap.fromTo(el, { x: 0 }, { keyframes: { x: [0, -5, 5, -3, 3, 0] }, duration: 0.45, ease: 'none', clearProps: 'transform' }); };
  });

  // ---- feedback (toasts are visual; the live region carries the words) ----
  // The app's showToast; lifted above an open window (Order Materials refusals, PO saves).
  const toast = appToaster(toastEl, dlg);
  let liveTimer = 0;
  function announce(msg: string): void {
    window.clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = window.setTimeout(() => { live.textContent = msg; }, 60);
  }

  // ---- render ----
  function render(prev: WoStatus | null): void {
    const chipFrom = root.querySelector('[data-wom-chip]')?.getBoundingClientRect() ?? null;
    board.innerHTML = withAppIcons(renderWomBoard(d, s));
    const chip = root.querySelector('[data-wom-chip]');
    if (chip && chipFrom && prev && prev !== s.status) {
      const to = chip.getBoundingClientRect();
      const dx = Math.round(chipFrom.left - to.left);
      const dy = Math.round(chipFrom.top - to.top);
      if (Math.abs(dx) + Math.abs(dy) > 1) fx.slide(chip, dx, dy);
    }
    const p = womPill(s.status);
    pill.className = p.cls;
    pill.textContent = p.label;
    meta.innerHTML = renderWomMeta(d, s);
    actions.innerHTML = withAppIcons(renderWomActions(d, s));
    mats.innerHTML = withAppIcons(renderWomMats(d, s));
    clock.innerHTML = renderWomClock(d, s);
    topDate.textContent = fmtWeekdayShort(s.today);
    if (s.status === 'paid') markDone();
    reset.hidden = !(s.status !== d.start || s.pos.some((x) => x.ordered) || s.today !== d.today || s.crew || s.payments.length !== d.invoice.payments.length);
  }
  const primaryBtn = () => root.querySelector<HTMLButtonElement>('[data-wom-primary]');
  /** After a change, focus the next thing to do (the status button, or the "✅ Paid in Full" note). */
  function focusNext(): void {
    const b = primaryBtn();
    if (b && !b.disabled) { b.focus({ preventScroll: true }); return; }
    root.querySelector<HTMLElement>('[data-wom-done]')?.focus({ preventScroll: true });
  }

  function markDone(): void {
    if (task.classList.contains('is-done')) return;
    task.classList.add('is-done');
    task.textContent = `Done: ${d.wo} went from ordering materials to paid — it is on the Archive tab now.`;
  }

  /** What the button offers now, for the status announcement. */
  function nextStep(): string {
    const v = womPrimaryView(d, s);
    if (v.kind === 'text') return ` ${plain(v.text)}. The job has left the board for the Archive.`;
    if (v.kind !== 'button') return '';
    return v.locked ? ` Next: ${plain(v.text)}, locked until the invoice is paid.` : ` Next: ${plain(v.text)}.`;
  }

  function moveTo(next: WoStatus, msg: string | null, type: ToastType = 'success'): void {
    const prev = s.status;
    s.status = next;
    s.overnight = '';
    render(prev);
    if (msg) toast(msg, type);
    announce(`${msg ? msg + '. ' : ''}Work order status: ${WO_LABELS[s.status]}.${nextStep()}`);
  }

  /** `_plAutoAdvanceSweep` on the demo clock: install END passed → complete; invoice paid → Ready to be Paid. No toast. */
  function sweep(): string {
    const st = womInvoiceStatus(d, s);
    const days = s.start ? installSpan(s.start, s.end).days ?? 1 : null;
    const r = autoAdvance({ number: d.wo, status: s.status, scheduledDate: s.start || null, durationDays: days }, s.today, { anyPaid: st === 'paid', allPaid: st === 'paid' });
    if (!r) return '';
    const prev = s.status;
    s.status = r.status;
    render(prev);
    return r.activity.join(' · ');
  }

  // ---- dialogs (the app's openModal look) — a native modal <dialog>: page inert behind it,
  // Esc closes, focus returns to what opened it (or to the next step) ----
  let opener: HTMLElement | null = null;
  function openModal(html: string, opts: { labelledBy: string; focus?: string; alert?: boolean; width?: number }): HTMLElement {
    closeModal(false);
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
    return box;
  }
  function closeModal(restore = true): void {
    if (!dlg.open) return;
    dlg.close();
    dlg.innerHTML = '';
    if (restore) {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      else focusNext();
    }
    opener = null;
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeModal(); });
  const dlgHead = (id: string, title: string) => `<div class="a-dlg-h"><h4 id="${id}">${title}</h4><button type="button" class="a-x" data-close aria-label="Close">✕</button></div>`;

  // ---------------------------------------------------- Order Materials --
  function openOrderMaterials(): void {
    // openOrderMaterialsModal (main L21032): every line is shown. A line that already has a PO is
    // locked (its dates and est. freight still change and save to that PO); any other line opens
    // fresh with today's defaults — what was typed in a cancelled window is not kept.
    const win: WomPO[] = s.pos.map((p, i) => {
      if (p.ordered) return p;
      const def = orderMaterialsLineDefaults(d.wo, i, s.today);
      return { ordered: false, poNumber: def.poNumber, orderDate: def.orderDate, eta: def.estimatedDelivery, freight: def.freight, qty: d.lines[i]!.qty, cost: d.lines[i]!.cost, jpo: '' };
    });
    const sel = win.map(() => false);
    const orderable = () => win.map((p, i) => (p.ordered ? -1 : i)).filter((i) => i >= 0);
    const done = orderable().length === 0;
    const title = `📦 ${done ? 'Manage POs' : 'Order Materials'} — ${esc(d.wo)} · ${esc(d.customer)}`;
    const info = done ? ORDER_MATERIALS_INFO.done : ORDER_MATERIALS_INFO.todo.replace('Pressing Finish', 'Pressing <strong>Finish</strong>').replace('the Ordered tab', 'the <strong>Ordered</strong> tab');
    const lines = d.lines.map((l, i) => {
      const po = win[i]!;
      const locked = po.ordered;
      const ro = locked ? ' disabled' : '';
      const fr = po.freight === '' ? '' : Number(po.freight).toFixed(2);
      return `<div class="wom-line" data-om-row="${i}" data-fate="${locked ? 'ordered' : 'none'}">
        <div class="wom-line-h">
          <input type="checkbox" id="wom-om-${i}" data-om-line="${i}"${locked ? ' checked disabled' : ''} title="${locked ? 'This line is already ordered' : 'Select this line to mark as ordered'}">
          <label class="wom-line-name" for="wom-om-${i}"><b>${esc(l.name)}</b><span><span class="wom-mono">#${esc(l.matNum)}</span> · ${esc(l.vendor)}</span></label>
          <span class="a-pill ${locked ? 'a-blue' : 'a-gray'}" data-om-fate>${locked ? '✓ PO created' : '○ Not selected'}</span>
        </div>
        <div class="wom-line-f">
          <div><label class="a-label" for="wom-om-q-${i}">Quantity</label><div class="wom-inrow"><input class="a-input num" type="number" step="0.01" id="wom-om-q-${i}" data-om-q="${i}" value="${po.qty.toFixed(2)}"${ro}><span class="wom-lt">${esc(l.uom || '—')}</span></div><span class="wom-lt">Not in inventory yet</span></div>
          <div><label class="a-label" for="wom-om-c-${i}">Cost / Unit</label><div class="wom-inrow"><span class="wom-lt" aria-hidden="true">$</span><input class="a-input num" type="number" step="0.01" id="wom-om-c-${i}" data-om-c="${i}" value="${po.cost.toFixed(2)}"${ro}></div><span class="wom-lt">Line total: <b class="num" data-om-lt="${i}">${fmtMoney(po.qty * po.cost)}</b></span></div>
          <div><label class="a-label" for="wom-om-po-${i}">PO #</label><input class="a-input wom-po-in" id="wom-om-po-${i}" data-om-po="${i}" value="${esc(po.poNumber)}" placeholder="Auto-generated"${ro}></div>
          <div><label class="a-label" for="wom-om-od-${i}">Order Date</label><input class="a-input" type="date" id="wom-om-od-${i}" data-om-od="${i}" value="${po.orderDate}"></div>
          <div><label class="a-label" for="wom-om-ed-${i}">Est. Delivery</label><input class="a-input" type="date" id="wom-om-ed-${i}" data-om-ed="${i}" value="${po.eta}"></div>
          <div><label class="a-label" for="wom-om-fr-${i}">Est. Freight</label><div class="wom-inrow"><span class="wom-lt" aria-hidden="true">$</span><input class="a-input num" type="number" step="0.01" min="0" id="wom-om-fr-${i}" data-om-fr="${i}" value="${fr}" placeholder="0.00"></div></div>
        </div>
      </div>`;
    }).join('');
    const box = openModal(
      dlgHead('wom-om-h', title)
      + `<div class="a-dlg-b wom-om-b"><div class="a-info">💡 <strong>How this works:</strong> ${info}</div>`
      + (done ? '' : '<div class="wom-selall"><input type="checkbox" id="wom-om-all" data-om-all><label for="wom-om-all">Select all orderable</label><span class="wom-selcount" data-om-count aria-live="polite"></span></div>')
      + `<div class="wom-tiles" data-om-tiles></div><div class="wom-lines">${lines}</div></div>`
      + `<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>${done ? 'Close' : 'Cancel'}</button>${done ? '' : '<button type="button" class="a-btn a-primary" data-om-finish>Finish</button>'}</div>`,
      { labelledBy: 'wom-om-h', width: 820, focus: done ? '[data-close]' : '#wom-om-all' },
    );

    function sync(): void {
      const ord = orderable();
      const selectedCount = ord.filter((i) => sel[i]).length;
      const locked = win.length - ord.length;
      const skipped = ord.length - selectedCount;
      // The Selected Total counts goods + est. freight (main L21107).
      const total = win.reduce((a, p, i) => a + (sel[i] ? p.qty * p.cost + (Number(p.freight) || 0) : 0), 0);
      const count = box.querySelector('[data-om-count]');
      if (count) count.innerHTML = `<strong>${selectedCount}</strong> of ${ord.length} orderable selected${skipped ? ` · ${skipped} skipped` : ''}${locked ? ` · ${locked} already done` : ''}`;
      const all = box.querySelector<HTMLInputElement>('[data-om-all]');
      if (all) all.checked = ord.length > 0 && selectedCount === ord.length;
      box.querySelector('[data-om-tiles]')!.innerHTML =
        `<div class="wom-tile is-sel"><span>Selected to order</span><b class="num">${selectedCount}</b></div>`
        + `<div class="wom-tile is-done"><span>Already allocated / ordered</span><b class="num">${locked}</b></div>`
        + `<div class="wom-tile is-skip"><span>Pending / skipped</span><b class="num">${skipped}</b></div>`
        + `<div class="wom-tile is-total"><span>Selected Total</span><b class="num">${fmtMoney(total)}</b></div>`;
      box.querySelectorAll<HTMLElement>('[data-om-row]').forEach((row) => {
        const i = Number(row.dataset.omRow);
        if (win[i]!.ordered) return;
        row.dataset.fate = sel[i] ? 'selected' : 'none';
        const fate = row.querySelector('[data-om-fate]')!;
        fate.className = `a-pill ${sel[i] ? 'a-green' : 'a-gray'}`;
        fate.innerHTML = withAppIcons(sel[i] ? '✓ Will be marked Ordered' : '○ Not selected');
        const lt = row.querySelector('[data-om-lt]');
        if (lt) lt.textContent = fmtMoney(win[i]!.qty * win[i]!.cost);
      });
    }
    sync();

    box.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      const n = (k: string) => Number(t.dataset[k]);
      if (t.matches('[data-om-line]')) { sel[n('omLine')] = t.checked; sync(); return; }
      if (t.matches('[data-om-all]')) {
        orderable().forEach((i) => { sel[i] = t.checked; });
        box.querySelectorAll<HTMLInputElement>('[data-om-line]:not([disabled])').forEach((cb) => { cb.checked = t.checked; });
        sync();
        return;
      }
      if (t.matches('[data-om-q]')) { win[n('omQ')]!.qty = Math.max(0, Number(t.value) || 0); sync(); return; }
      if (t.matches('[data-om-c]')) { win[n('omC')]!.cost = Math.max(0, Number(t.value) || 0); sync(); return; }
      if (t.matches('[data-om-po]')) { win[n('omPo')]!.poNumber = t.value.trim(); return; }
      // Dates and freight stay editable on a PO'd line: they save straight to that PO (_omUpdatePO, main L21149).
      const field = t.matches('[data-om-od]') ? 'orderDate' : t.matches('[data-om-ed]') ? 'estimatedDelivery' : t.matches('[data-om-fr]') ? 'freight' : null;
      if (!field) return;
      const i = n(field === 'orderDate' ? 'omOd' : field === 'estimatedDelivery' ? 'omEd' : 'omFr');
      const po = win[i]!;
      if (field === 'freight') {
        const raw = t.value.trim();
        const v: number | '' = raw === '' ? '' : Math.round((Number(raw) || 0) * 100) / 100;
        if (v !== '' && v < 0) { toast("Freight can't be negative", 'warning'); announce("Freight can't be negative"); t.value = ''; return; }
        const before: number | '' = po.freight === '' ? '' : Number(po.freight);
        if (before === v) return;
        po.freight = v;
      } else if (field === 'orderDate') {
        if ((t.value || '') === po.orderDate) return;
        po.orderDate = (t.value || s.today) as ISODate;
      } else {
        if ((t.value || '') === po.eta) return;
        po.eta = (t.value || addDays(s.today, 14)) as ISODate;
      }
      sync();
      if (po.ordered) {
        const msg = poFieldSavedToast(po.poNumber, field);
        toast(msg);
        announce(`${msg}.`);
        mats.innerHTML = withAppIcons(renderWomMats(d, s));
      }
    });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-om-finish]')) return;
      // submitOrderMaterials (main L21164)
      const picked = orderable().filter((i) => sel[i] && win[i]!.qty > 0);
      if (!picked.length) { toast(ORDER_NOTHING_TICKED_TOAST, 'warning'); announce(ORDER_NOTHING_TICKED_TOAST); return; }
      if (picked.some((i) => !win[i]!.poNumber)) { toast(ORDER_NEEDS_PO_TOAST, 'warning'); announce(ORDER_NEEDS_PO_TOAST); return; }
      picked.forEach((i) => {
        const n = nextJobPONumber(s.poCounter);
        s.poCounter = n.counter;
        s.pos[i] = { ...win[i]!, ordered: true, jpo: n.number };
      });
      const linesAfter: WoMaterialLine[] = d.lines.map((l, i) => ({ quantity: l.qty, productName: l.name, poCreated: s.pos[i]!.ordered }));
      const r = orderMaterials(s.status, d.wo, linesAfter, s.start || null, picked.length);
      closeModal(false);
      if (!r.ok) { toast(r.toast, r.toastKind); return; }
      const jpos = picked.map((i) => s.pos[i]!.jpo);
      moveTo(r.status, r.toast);
      announce(`${r.toast}. Purchase orders ${jpos[0]}${jpos.length > 1 ? ` to ${jpos[jpos.length - 1]}` : ''} filed (PO # ${picked.map((i) => s.pos[i]!.poNumber).join(', ')}). Work order status: ${WO_LABELS[s.status]}.${nextStep()}`);
      focusNext();
    });
  }

  // ---------------------------------------------------- Schedule Install --
  function openSchedule(): void {
    // Installers = People whose Role is Installer (_activeInstallers, main L19907), name order.
    const installers = d.people.filter((p) => /installer/i.test(p.trade)).slice().sort((a, b) => a.name.localeCompare(b.name));
    const opts = installers.map((p) => `<option value="${esc(p.id)}"${s.crew === p.id ? ' selected' : ''}>${esc(p.name)}${p.trade ? ` · ${esc(p.trade)}` : ''} 🔧</option>`).join('');
    let days = Math.max(1, s.start && s.end ? installSpan(s.start, s.end).days ?? 1 : 1);
    const box = openModal(
      dlgHead('wom-sc-h', `📅 Schedule Install · ${esc(d.wo)}`)
      + `<div class="a-dlg-b"><div class="a-custbox"><span class="a-label">Customer</span><div><strong>${esc(d.customer)}</strong> · ${esc(d.phone)}</div><span class="a-label wom-mt">Site Address</span><div>${esc(d.site)}</div></div>
        <div class="a-row2">
          <div class="a-field"><label for="wom-sc-start">Start date <span class="a-req" aria-hidden="true">*</span></label><input class="a-input" type="date" id="wom-sc-start" value="${s.start}" aria-required="true"></div>
          <div class="a-field"><label for="wom-sc-end">End date <span class="a-req" aria-hidden="true">*</span></label><input class="a-input" type="date" id="wom-sc-end" value="${s.end}" min="${s.start}" aria-required="true" aria-describedby="wom-sc-span"><div class="wom-span" id="wom-sc-span" aria-live="polite"></div></div>
        </div>
        <div class="a-field"><label for="wom-sc-inst">Assigned Installer</label><select class="a-select" id="wom-sc-inst"><option value="">— Unassigned —</option>${opts}</select></div>
        <p class="a-help">Pick the first and last day on site — the same day for a one-day job. Setting the dates flips the WO to <strong>Scheduled</strong>. You can save just an installer without dates — the WO stays in <strong>Ready to Schedule</strong> until you pick them.</p></div>`
      + '<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-sc-save>📅 Schedule</button></div>',
      { labelledBy: 'wom-sc-h', width: 560, focus: '#wom-sc-start' },
    );
    const startEl = box.querySelector<HTMLInputElement>('#wom-sc-start')!;
    const endEl = box.querySelector<HTMLInputElement>('#wom-sc-end')!;
    const span = box.querySelector<HTMLElement>('#wom-sc-span')!;
    const hint = () => {
      const h = installRangeHint(startEl.value, endEl.value);
      span.className = `wom-span${h.kind === 'error' ? ' is-err' : ''}`;
      span.innerHTML = h.kind === 'span' ? withAppIcons(`${h.icon} <strong>${esc(h.label)}</strong>${esc(h.rest)}`) : esc(h.text);
    };
    hint();
    // _rangeStartChanged / _rangeEndChanged (main L19418-19428): the end follows the start, same days.
    startEl.addEventListener('change', () => { endEl.value = endFollowingStart(startEl.value, days); endEl.min = startEl.value || ''; hint(); });
    endEl.addEventListener('change', () => { const sp = installSpan(startEl.value, endEl.value); if (sp.days !== undefined) days = sp.days; hint(); });
    for (const el of [startEl, endEl]) el.addEventListener('click', () => { try { el.showPicker?.(); } catch { /* not allowed here */ } });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-sc-save]')) return;
      const crew = box.querySelector<HTMLSelectElement>('#wom-sc-inst')!.value;
      const crewName = d.people.find((p) => p.id === crew)?.name ?? '';
      // saveScheduleJob (main L19484): dates come as a pair; a bad range is refused before anything changes.
      const r = saveSchedule(s.status, d.wo, { start: startEl.value || null, end: endEl.value || null, installerId: crew || null, installerName: crewName || null });
      if (!r.ok) { toast(r.toast, r.toastKind); announce(r.toast); return; }
      s.start = (startEl.value || '') as ISODate | '';
      s.end = (endEl.value || '') as ISODate | '';
      s.crew = crew;
      closeModal(false);
      moveTo(r.status, r.toast);
      // An install that already ended (a past date was picked) is swept at once, as the app's next pass would.
      const moved = sweep();
      if (moved) { s.overnight = `FloorLogic moved it on by itself: ${moved}.`; render(null); announce(s.overnight); }
      focusNext();
    });
  }

  // ----------------------------------------- Invoice + Take Payment --
  function invoiceHTML(): string {
    const paid = paidTotal(s);
    const bal = womBalance(d, s);
    const rows = s.payments.length
      ? `<table class="wom-ptable"><thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col" class="r">Amount</th></tr></thead><tbody>${s.payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.method)}${p.checkNumber ? ` <span class="wom-chk">#${esc(p.checkNumber)}</span>` : ''}</td><td class="r num wom-green">${fmtMoney(p.amount)}</td></tr>`).join('')}<tr class="wom-ptd"><td colspan="2">Paid to date</td><td class="r num wom-green">${fmtMoney(paid)}</td></tr></tbody></table>`
      : '<p class="wom-nopay">No payments recorded yet.</p>';
    return `<table class="wom-itot"><tbody><tr class="wom-grand"><td>Total</td><td class="num">${fmtMoney(d.invoice.total)}</td></tr><tr class="wom-paidrow"><td>Paid</td><td class="num">-${fmtMoney(paid)}</td></tr><tr class="wom-bal${bal > 0.005 ? ' is-due' : ''}"><td>Balance Due</td><td class="num">${fmtMoney(Math.max(0, bal))}</td></tr></tbody></table>`
      + `<div class="wom-pays"><h5>💳 Payments</h5>${rows}</div>`;
  }
  const invPillHTML = (st: InvoiceStatus) => `<span class="a-pill ${st === 'paid' ? 'a-green' : st === 'deposit' ? 'a-amber' : 'a-gray'}">${st.charAt(0).toUpperCase() + st.slice(1)}</span>`;

  function openInvoice(): void {
    const st = womInvoiceStatus(d, s);
    const bal = womBalance(d, s);
    const box = openModal(
      dlgHead('wom-iv-h', `🧾 Invoice ${esc(d.invoice.number)}${invPillHTML(st)}`)
      + `<div class="a-dlg-b"><p class="wom-sub">${esc(d.customer)} · the final invoice for ${esc(d.wo)}</p>${invoiceHTML()}</div>`
      + `<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Close</button>${canTakePayment(bal) ? '<button type="button" class="a-btn a-success" data-iv-take>💰 Take Payment</button>' : '<span class="wom-paidtext">✅ Paid in Full</span>'}</div>`,
      { labelledBy: 'wom-iv-h', width: 500, focus: '[data-iv-take]' },
    );
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) closeModal();
      else if (t.matches('[data-iv-take]')) { const back = opener; closeModal(false); openTakePayment(back); }
    });
  }

  function openTakePayment(returnTo: HTMLElement | null): void {
    const bal = Math.max(0, womBalance(d, s));
    const methods = RECORD_PAYMENT_METHODS.map((m) => `<option>${m}</option>`).join('');
    const box = openModal(
      dlgHead('wom-tp-h', `💰 Take Payment — ${esc(d.invoice.number)}`)
      + `<div class="a-dlg-b"><div class="a-tabs" role="tablist" aria-label="How the payment is taken"><button type="button" class="a-tab" role="tab" id="wom-tab-rec" aria-selected="true" aria-controls="wom-pane-rec" data-tp-tab="rec">📝 Record Payment</button><button type="button" class="a-tab" role="tab" id="wom-tab-card" aria-selected="false" aria-controls="wom-pane-card" data-tp-tab="card" tabindex="-1">💳 Charge Card</button></div>
        <div id="wom-pane-rec" role="tabpanel" aria-labelledby="wom-tab-rec" class="wom-pane">
          <div class="a-field"><label for="wom-tp-amt">Amount</label><input class="a-input num" id="wom-tp-amt" type="number" step="0.01" min="0" inputmode="decimal" value="${bal.toFixed(2)}"></div>
          <div class="a-field"><label for="wom-tp-method">Method</label><select class="a-select" id="wom-tp-method">${methods}</select></div>
          <div class="a-field" data-tp-chk hidden><label for="wom-tp-chk">Check #</label><input class="a-input" id="wom-tp-chk" type="text" placeholder="e.g. 1042" autocomplete="off"></div>
          <div class="a-field"><label for="wom-tp-date">Date</label><input class="a-input" id="wom-tp-date" type="date" value="${s.today}"></div>
        </div>
        <div id="wom-pane-card" role="tabpanel" aria-labelledby="wom-tab-card" class="wom-pane" hidden>
          <div class="wom-cardbox"><span class="a-label">Card</span><p>Cards are charged through the shop’s own Stripe account in FloorLogic. This sample has no Stripe account, so nothing can be charged here.</p></div>
        </div></div>`
      + '<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-tp-save>Record Payment</button></div>',
      { labelledBy: 'wom-tp-h', width: 480, focus: '#wom-tp-amt' },
    );
    if (returnTo) opener = returnTo;
    const method = box.querySelector<HTMLSelectElement>('#wom-tp-method')!;
    const saveBtn = box.querySelector<HTMLButtonElement>('[data-tp-save]')!;
    method.addEventListener('change', () => { box.querySelector<HTMLElement>('[data-tp-chk]')!.hidden = method.value !== 'Check'; });
    const tabs = Array.from(box.querySelectorAll<HTMLButtonElement>('[data-tp-tab]'));
    const setTab = (k: string, focus = false) => {
      tabs.forEach((t) => { const on = t.dataset.tpTab === k; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
      box.querySelector<HTMLElement>('#wom-pane-rec')!.hidden = k !== 'rec';
      box.querySelector<HTMLElement>('#wom-pane-card')!.hidden = k !== 'card';
      // _switchTakePayTab (main L20866): the button becomes "💳 Charge Card", disabled until Stripe's form is ready.
      saveBtn.innerHTML = withAppIcons(k === 'rec' ? 'Record Payment' : '💳 Charge Card');
      saveBtn.disabled = k !== 'rec';
    };
    box.querySelector('[role="tablist"]')!.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); const cur = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'); setTab(tabs[(cur + 1) % 2]!.dataset.tpTab!, true); }
    });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-tp-tab]')) { setTab(t.dataset.tpTab!); return; }
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-tp-save]')) return;
      // recordPayment (main L21005)
      const amt = Number(box.querySelector<HTMLInputElement>('#wom-tp-amt')!.value);
      if (!amt || amt <= 0) { toast(ENTER_VALID_AMOUNT, 'warning'); announce(ENTER_VALID_AMOUNT); return; }
      const chk = box.querySelector<HTMLInputElement>('#wom-tp-chk')!.value.trim();
      const pay: WomPayment = { amount: round2(amt), method: method.value, date: (box.querySelector<HTMLInputElement>('#wom-tp-date')!.value || s.today) as ISODate };
      if (pay.method === 'Check' && chk) pay.checkNumber = chk;
      pay.label = paymentTypeLabel(pay);
      s.payments.push(pay);
      const st = womInvoiceStatus(d, s);
      const msg = paymentRecordedToast(pay.amount, d.invoice.number);
      closeModal(false);
      // Paid in full: a job waiting at Final Invoice moves to Ready to be Paid by itself (_advanceJobToReady).
      const next = st === 'paid' ? woTransition(s.status, { type: 'invoicePaid' }) : s.status;
      if (next !== s.status) moveTo(next, msg);
      else { render(null); toast(msg); announce(`${msg}. Invoice ${d.invoice.number}: ${st}. Work order status: ${WO_LABELS[s.status]}.${nextStep()}`); }
      focusNext();
    });
  }

  // ------------------------------------------------ installer payout --
  function openPayout(): void {
    const crew = d.people.find((p) => p.id === s.crew);
    if (!crew) {
      // openWOPaymentModal without an installer (main L19553): the app's confirm().
      const box = openModal(
        dlgHead('wom-cf-h', `Mark ${esc(d.wo)} as Paid?`)
        + `<div class="a-dlg-b"><p>No installer assigned to ${esc(d.wo)}.</p><p>Assign one first to record a payment to a technician, or mark this WO Paid without recording a payment?</p><p class="wom-muted">OK → mark Paid without payment<br>Cancel → go back and assign an installer first</p></div>`
        + '<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-cf-ok>OK</button></div>',
        { labelledBy: 'wom-cf-h', alert: true, focus: '[data-cf-ok]' },
      );
      box.addEventListener('click', (e) => {
        const t = (e.target as HTMLElement).closest('button');
        if (!t) return;
        if (t.matches('[data-close]')) closeModal();
        else if (t.matches('[data-cf-ok]')) { closeModal(false); moveTo(woTransition(s.status, { type: 'markPaid' }), `Job ${d.wo} marked as Paid`); focusNext(); }
      });
      return;
    }
    const owed = d.laborOwed;
    const pl = womPill(s.status);
    const methods = ['Cash', 'Check', 'Venmo', 'Zelle', 'ACH / Bank Transfer', 'Credit Card', 'Other'].map((m) => `<option>${m}</option>`).join('');
    const box = openModal(
      dlgHead('wom-py-h', `💵 Add Payment — ${esc(crew.name)}`)
      + `<div class="a-dlg-b"><div class="wom-owed"><div><span class="wom-owed-k" title="From the work orders’ quoted labor — the actual payout is whatever you type on each row">Est. Labor Owed</span><b class="num">${fmtMoney(owed)}</b></div><div class="r"><span class="wom-owed-k">Selected</span><b class="num wom-green" data-py-sel>${fmtMoney(owed)}</b></div></div>
        <div class="a-row2">
          <div class="a-field"><label for="wom-py-amt">Amount <span class="a-req" aria-hidden="true">*</span></label><input class="a-input num" id="wom-py-amt" type="number" step="0.01" min="0.01" inputmode="decimal" value="${owed.toFixed(2)}" aria-required="true"></div>
          <div class="a-field"><label for="wom-py-method">Method</label><select class="a-select" id="wom-py-method">${methods}</select></div>
          <div class="a-field"><label for="wom-py-date">Date</label><input class="a-input" id="wom-py-date" type="date" value="${s.today}"></div>
          <div class="a-field"><label for="wom-py-ref">Check # / Reference</label><input class="a-input" id="wom-py-ref" placeholder="Optional" autocomplete="off"></div>
        </div>
        <div class="a-field"><span class="a-flabel">What is this paying for? <span class="wom-muted">(labor marks the work order Paid; commission clears the sign-off and leaves the work order alone)</span></span>
        <div class="wom-pyrow"><span class="wom-pyrow-t"><strong>📍 ${esc(d.site)}</strong> <span class="wom-mono">${esc(d.wo)}</span> <span class="${pl.cls}">${esc(pl.label)}</span> <span class="wom-this">▸ THIS WO</span><span class="wom-pyrow-s">${esc(d.customer)}${s.start ? ` · Scheduled ${fmtDate(s.start)}` : ''}</span></span><b class="num">${fmtMoney(owed)}</b></div></div></div>`
      + '<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-py-save>💾 Record Payment</button></div>',
      { labelledBy: 'wom-py-h', width: 560, focus: '#wom-py-amt' },
    );
    const amtEl = box.querySelector<HTMLInputElement>('#wom-py-amt')!;
    amtEl.addEventListener('input', () => { box.querySelector('[data-py-sel]')!.textContent = fmtMoney(Number(amtEl.value) || 0); });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-py-save]')) return;
      // saveTechPayment (main L20828): labor on this WO marks it Paid → off the board, onto the Archive.
      const amt = Number(amtEl.value);
      if (!(amt > 0)) { toast('Enter a valid amount', 'warning'); announce('Enter a valid amount'); return; }
      closeModal(false);
      moveTo(woTransition(s.status, { type: 'markPaid' }), `✓ Payment ${fmtMoney(amt)} recorded · 1 WO marked Paid (moved to the Archive)`);
      focusNext();
    });
  }

  // ------------------------------------------------------------ wiring --
  actions.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!t) return;
    if (t.matches('[data-wom-pos]')) { openOrderMaterials(); return; }
    if (!t.matches('[data-wom-primary]') || t.disabled) return;
    switch (t.dataset.action) {
      case 'orderMaterials': openOrderMaterials(); break;
      case 'schedule': openSchedule(); break;
      case 'complete': {
        // completeJob (main L19526)
        const next = woTransition(s.status, { type: 'complete', anyInvoicePaid: womInvoiceStatus(d, s) === 'paid' });
        moveTo(next, completeToast(d.wo, next));
        focusNext();
        break;
      }
      case 'viewFinalInvoice': openInvoice(); break;
      case 'markPaid': openPayout(); break;
    }
  });
  clock.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-wom-skip]');
    if (!b) return;
    closeModal(false);
    s.today = b.dataset.womSkip as ISODate;
    s.overnight = '';
    render(null);
    const moved = sweep();
    if (moved) s.overnight = `Overnight, FloorLogic moved it on by itself — ${moved}. Nobody clicked anything.`;
    render(null);
    announce(`Demo clock: ${fmtWeekdayShort(s.today)}. ${s.overnight || `Work order status: ${WO_LABELS[s.status]}.`}${nextStep()}`);
    root.querySelector<HTMLElement>('[data-wom-skip]')?.focus({ preventScroll: true });
  });
  reset.addEventListener('click', () => {
    closeModal(false);
    s = womInitialState(d);
    task.classList.remove('is-done');
    task.textContent = taskText;
    render(null);
    announce(`Started over. ${d.wo} is back at ${WO_LABELS[s.status]}, ${fmtWeekdayShort(s.today)}.`);
    focusNext();
  });

  // Hydrate: the same markup the server rendered, now live.
  render(null);
  root.classList.add('is-live');
}
