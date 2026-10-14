/**
 * Work-order module ("Run the install"): WO-330's header and the ONE status-driven
 * button the real app puts there (main L14572), walked through the app's own
 * sequence. Labels, colours, Manage POs, the Mark as Paid… lock, transitions and
 * toasts all come from src/lib/logic/wo-stages; invoice status from due-now.
 *
 * The dialogs are the app's, sized for the module:
 *   Order Materials  main L18381-18547 (tick lines → Finish → "✓ N POs marked as ordered")
 *   Schedule Install main L16836-16911 (Install Date + Assigned Installer, installers only)
 *   Invoice / Take Payment main L15990, L18236, L18355
 *   Installer payout ("💵 Add Payment — …") main L16942, L18134-18209
 *
 * Fictional sample data; nothing is saved or sent anywhere.
 */
import gsap from 'gsap';
import {
  WO_LABELS, WO_BUCKETS, MANAGE_POS, MARK_PAID_DISABLED_TITLE, JOB_STATUS_COLOR_NAMES, INVOICE_STATUS_COLOR_NAMES,
  APP_BADGE_TINT, siteHex, woPrimaryAction, showsManagePOs, woTransition, completeToast, markPaidToast, scheduleToast,
  invoiceStatus, fmtMoney, fmtDate, fmtQty, addDays, round2,
} from '../lib/logic';
import type { WoStatus, WoPrimary, ISODate, InvoiceStatus, ColorName } from '../lib/logic';

// ------------------------------------------------------------------ data --

export interface WomLine { name: string; matNum: string; vendor: string; uom: string; qty: number; cost: number }
export interface WomPerson { id: string; name: string; trade: string }
export interface WomData {
  wo: string;
  customer: string;
  initials: string;
  phone: string;
  /** Site, for the payout row (sample leads carry a city only). */
  site: string;
  issued: ISODate;
  /** The module's clock: the day the quote was approved and WO-330 created. */
  today: ISODate;
  rep: string;
  invoice: { number: string; total: number };
  /** People who can be put on the job (the app filters to the Installer trade). */
  people: WomPerson[];
  lines: WomLine[];
  /** Σ labor qty × company cost — the payout modal's "Est. Labor Owed". */
  laborOwed: number;
  start: WoStatus;
}
export interface WomPayment { amount: number; method: string; date: ISODate; checkNumber?: string }
export interface WomPO { ordered: boolean; poNumber: string; orderDate: ISODate; eta: ISODate }
export interface WomState {
  status: WoStatus;
  scheduledDate: ISODate | '';
  crew: string;
  pos: WomPO[];
  payments: WomPayment[];
}

export function womInitialState(d: WomData): WomState {
  return {
    status: d.start,
    scheduledDate: '',
    crew: '',
    // PO # auto-numbers `${WO}-${n}`; Order Date = today; Est. Delivery = two weeks out (main L18402-18404).
    pos: d.lines.map((_, i) => ({ ordered: false, poNumber: `${d.wo}-${i + 1}`, orderDate: d.today, eta: addDays(d.today, 14) })),
    payments: [],
  };
}

// ------------------------------------------------------- pure renderers --
// Used by WorkOrderModule.astro for the server-rendered picture and by the
// island after every change, so both always agree.

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
/** Labels without their leading emoji, for screen-reader announcements. */
export function plain(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

const paidTotal = (s: WomState): number => round2(s.payments.reduce((a, p) => a + p.amount, 0));

export function womInvoiceStatus(d: WomData, s: WomState): InvoiceStatus {
  return invoiceStatus(d.invoice.total, s.payments);
}

export function womPrimary(d: WomData, s: WomState): WoPrimary {
  return woPrimaryAction(s.status, { hasLinkedInvoice: true, anyInvoicePaid: womInvoiceStatus(d, s) === 'paid' });
}

export interface PrimaryView { kind: 'button' | 'text' | 'none'; action: string; text: string; cls: string; locked: boolean; title: string }

export function womPrimaryView(d: WomData, s: WomState): PrimaryView {
  const p = womPrimary(d, s);
  if (!p) return { kind: 'none', action: '', text: '', cls: 'a-btn wom-primary', locked: true, title: '' };
  if (p.kind === 'text') return { kind: 'text', action: '', text: p.label, cls: 'a-btn wom-primary wom-primary-text', locked: true, title: '' };
  const variant = p.variant === 'success' ? 'a-success' : p.variant === 'warning' ? 'a-warning' : 'a-primary';
  return { kind: 'button', action: p.action, text: p.label, cls: `a-btn ${variant} wom-primary${p.enabled ? '' : ' is-locked'}`, locked: !p.enabled, title: p.title ?? '' };
}

export function womPill(status: WoStatus): { cls: string; label: string } {
  return { cls: `a-pill a-${JOB_STATUS_COLOR_NAMES[status]} wom-pill`, label: WO_LABELS[status] };
}

type Bucket = (typeof WO_BUCKETS)[number];
/** On Hold is the app's optional column, drawn only when a job sits in it (main L18573). */
const BOARD: readonly Bucket[] = WO_BUCKETS.filter((b) => b.key !== 'on_hold');

export function womBucket(status: WoStatus): Bucket | null {
  return WO_BUCKETS.find((b) => (b.statuses as readonly WoStatus[]).includes(status)) ?? null;
}

export function renderWomBoard(d: WomData, s: WomState): string {
  const cur = womBucket(s.status);
  const cols = BOARD.map((b) => {
    const on = cur?.key === b.key;
    const color = b.color as ColorName;
    return `<li class="wom-col${on ? ' is-on' : ''}" data-bucket="${b.key}" style="--c:${siteHex(color)};--t:${APP_BADGE_TINT[color]}"${on ? ' aria-current="step"' : ''}>`
      + `<span class="wom-col-i" aria-hidden="true">${b.icon}</span><span class="wom-col-l">${esc(b.label)}</span>`
      + `<span class="wom-slot">${on ? `<span class="wom-chip" data-wom-chip aria-hidden="true">${esc(d.wo)}</span>` : ''}</span></li>`;
  }).join('');
  const cap = cur ? `${cur.icon} ${esc(cur.label)}${cur.sub ? ` <span class="wom-cap-sub">· ${esc(cur.sub)}</span>` : ''}` : '—';
  return `<p class="wom-board-cap"><span class="wom-cap-k">Job board</span> <span data-wom-cap>${cap}</span></p><ol class="wom-cols" aria-label="Job board columns">${cols}</ol>`;
}

export function renderWomMeta(d: WomData, s: WomState): string {
  const crew = d.people.find((p) => p.id === s.crew)?.name ?? '';
  return `<div><dt>Issued</dt><dd>${fmtDate(d.issued)}</dd></div>`
    + `<div><dt>Scheduled</dt><dd>${s.scheduledDate ? fmtDate(s.scheduledDate) : '—'}</dd></div>`
    + `<div><dt>Installer</dt><dd>${crew ? esc(crew) : '—'}</dd></div>`
    + `<div><dt>Sales Rep</dt><dd>${esc(d.rep)}</dd></div>`;
}

export function invLabel(st: InvoiceStatus): string {
  return st.charAt(0).toUpperCase() + st.slice(1);
}

export function renderWomInv(d: WomData, s: WomState): string {
  const st = womInvoiceStatus(d, s);
  const bal = round2(d.invoice.total - paidTotal(s));
  const pill = `<span class="a-pill a-${INVOICE_STATUS_COLOR_NAMES[st]}">${invLabel(st)}</span>`;
  const tail = st === 'paid'
    ? `<span class="wom-inv-done">✅ Paid in Full</span>`
    : `<span class="wom-inv-arrow" aria-hidden="true">→</span><button type="button" class="wom-inv-btn" data-wom-pay>Record payment</button><span class="wom-inv-bal">Balance <span class="num">${fmtMoney(bal)}</span></span>`;
  return `<span class="wom-inv-k"><span aria-hidden="true">🧾</span> Invoice ${esc(d.invoice.number)}:</span> ${pill}${tail}`;
}

export function renderWomMats(d: WomData, s: WomState): string {
  return d.lines.map((l, i) => {
    const po = s.pos[i]!;
    const cell = po.ordered
      ? `<span class="wom-po is-on">✓ PO ${esc(po.poNumber)}</span><span class="wom-eta is-on">🚚 Est. delivery: ${fmtDate(po.eta)}</span>`
      : `<span class="wom-po">○ Not ordered</span><span class="wom-eta">🚚 Est. delivery: —</span>`;
    const qty = `<span class="num">${fmtQty(l.qty)}</span> <span class="wom-uom">${esc(l.uom)}</span>`;
    return `<tr><td><span class="wom-mname">${esc(l.name)}</span><span class="wom-msub">#${esc(l.matNum)} · ${esc(l.vendor)}</span><span class="wom-mqty" aria-hidden="true">${qty}</span></td>`
      + `<td class="r wom-qcol">${qty}</td><td>${cell}</td></tr>`;
  }).join('');
}

// ----------------------------------------------------------- the island --

type ToastType = 'success' | 'info' | 'warning' | 'error';
const TOAST_ICON: Record<ToastType, string> = { success: '✅', info: 'ℹ️', warning: '⚠️', error: '❌' };
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
  const main = $('[data-wom-main]');
  const board = $('[data-wom-board]');
  const pill = $('[data-wom-pill]');
  const meta = $('[data-wom-meta]');
  const inv = $('[data-wom-inv]');
  const mats = $('[data-wom-mats]');
  const primary = $<HTMLButtonElement>('[data-wom-primary]');
  const posBtn = $<HTMLButtonElement>('[data-wom-pos]');
  const lock = $('[data-wom-lock]');
  const overlay = $('[data-wom-modal]');
  const toastEl = $('[data-wom-toast]');
  const live = $('[data-wom-live]');
  const task = $('[data-task]');
  const reset = $<HTMLButtonElement>('[data-wom-reset]');
  const taskText = task.textContent || '';

  // ---- motion: small beats only, instant under reduced motion ----
  const fx = {
    pop: (_el: Element) => {},
    slide: (_el: Element, _dx: number, _dy: number) => {},
    open: (_box: Element) => {},
    nudge: (_el: Element) => {},
  };
  gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const { motion } = ctx.conditions as { motion: boolean };
    if (!motion) {
      fx.pop = () => {}; fx.slide = () => {}; fx.open = () => {}; fx.nudge = () => {};
      return;
    }
    fx.pop = (el) => { gsap.fromTo(el, { scale: 0.93 }, { scale: 1, duration: 0.4, ease: 'back.out(2.4)', clearProps: 'transform' }); };
    fx.slide = (el, dx, dy) => { gsap.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.6, ease: 'power3.inOut', clearProps: 'transform' }); };
    fx.open = (box) => { gsap.fromTo(box, { y: 14, scale: 0.985, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' }); };
    fx.nudge = (el) => { gsap.fromTo(el, { x: 0 }, { keyframes: { x: [0, -5, 5, -3, 3, 0] }, duration: 0.45, ease: 'none', clearProps: 'transform' }); };
  });

  // ---- feedback ----
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
    liveTimer = window.setTimeout(() => { live.textContent = msg; }, 60);
  }

  // ---- render ----
  function render(prev: WoStatus | null): void {
    const chipFrom = root.querySelector('[data-wom-chip]')?.getBoundingClientRect() ?? null;
    board.innerHTML = renderWomBoard(d, s);
    const chip = root.querySelector('[data-wom-chip]');
    if (chip && chipFrom && prev && prev !== s.status) {
      const to = chip.getBoundingClientRect();
      const dx = chipFrom.left - to.left;
      const dy = chipFrom.top - to.top;
      if (Math.abs(dx) + Math.abs(dy) > 1) fx.slide(chip, dx, dy);
    }
    const p = womPill(s.status);
    pill.className = p.cls;
    pill.textContent = p.label;
    meta.innerHTML = renderWomMeta(d, s);
    inv.innerHTML = renderWomInv(d, s);
    mats.innerHTML = renderWomMats(d, s);
    posBtn.hidden = !showsManagePOs(s.status);

    const v = womPrimaryView(d, s);
    primary.className = v.cls;
    primary.textContent = v.text;
    primary.dataset.action = v.action;
    primary.hidden = v.kind === 'none';
    if (v.locked) primary.setAttribute('aria-disabled', 'true'); else primary.removeAttribute('aria-disabled');
    if (v.title) primary.title = v.title; else primary.removeAttribute('title');
    const isLock = v.kind === 'button' && v.locked;
    lock.hidden = !isLock;
    if (isLock) primary.setAttribute('aria-describedby', lock.id); else primary.removeAttribute('aria-describedby');

    if (prev && prev !== s.status) {
      fx.pop(pill);
      fx.pop(primary);
    }
    if (s.status === 'paid') markDone();
    reset.hidden = !(s.status !== d.start || s.payments.length || s.pos.some((x) => x.ordered));
  }

  function markDone(): void {
    if (task.classList.contains('is-done')) return;
    task.classList.add('is-done');
    task.textContent = `Done: ${d.wo} went from ordering materials to paid in full.`;
    fx.pop(task);
  }

  /** What the button offers now, for the status announcement. */
  function nextStep(): string {
    const v = womPrimaryView(d, s);
    if (v.kind !== 'button') return '';
    return v.locked ? ` Next: ${plain(v.text)}, locked until the invoice is paid.` : ` Next: ${plain(v.text)}.`;
  }

  /** Apply a new status, then toast (live) and announce the new status and next step. */
  function moveTo(next: WoStatus, msg: string, type: ToastType = 'success'): void {
    const prev = s.status;
    s.status = next;
    render(prev);
    toast(msg, type);
    announce(`Work order status: ${WO_LABELS[s.status]}.${nextStep()}`);
  }

  // ---- modal plumbing (contained in the app frame, like the app's centered modal) ----
  let opener: HTMLElement | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;

  function openModal(html: string, opts: { labelledBy: string; focus?: string; alert?: boolean; wide?: boolean }): HTMLElement {
    const active = document.activeElement as HTMLElement | null;
    opener = active && active !== document.body && root.contains(active) ? active : primary;
    overlay.innerHTML = `<div class="wom-dlg${opts.wide ? ' wom-dlg-wide' : ''}" role="${opts.alert ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${opts.labelledBy}">${html}</div>`;
    overlay.hidden = false;
    main.inert = true;
    const box = overlay.firstElementChild as HTMLElement;
    fx.open(box);
    const first = (opts.focus ? box.querySelector<HTMLElement>(opts.focus) : null) ?? box.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
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
    return box;
  }

  function closeModal(focusPrimary = false): void {
    if (overlay.hidden) return;
    if (onKey) overlay.removeEventListener('keydown', onKey);
    onKey = null;
    overlay.hidden = true;
    overlay.innerHTML = '';
    main.inert = false;
    const back = !focusPrimary && opener && opener.isConnected && !opener.hidden ? opener : primary;
    back.focus({ preventScroll: true });
    opener = null;
  }

  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });

  const dlgHead = (id: string, title: string) =>
    `<div class="wom-dlg-h"><h4 id="${id}">${title}</h4><button type="button" class="wom-x" data-close aria-label="Close">✕</button></div>`;

  // ---------------------------------------------------- Order Materials --
  function openOrderMaterials(): void {
    const sel = s.pos.map(() => false);
    const orderable = () => s.pos.map((p, i) => (p.ordered ? -1 : i)).filter((i) => i >= 0);
    const done = orderable().length === 0;
    const title = `📦 ${done ? 'Manage POs' : 'Order Materials'} — ${esc(d.wo)} · ${esc(d.customer)}`;
    const info = done
      ? 'Every material line is either allocated from on-hand inventory or already has a PO. Rows are shown for reference — no action required. Re-open this window any time to review.'
      : 'Tick the checkbox on each line you’ve placed an order for. PO #s are auto-numbered (editable). Order Date defaults to today; Est. Delivery defaults to two weeks out (editable, not required). Pressing <strong>Finish</strong> creates the selected POs in the <strong>Ordered</strong> tab. Unticked lines stay here for next time. Rows already allocated or PO’d show as locked.';
    const lines = d.lines.map((l, i) => {
      const po = s.pos[i]!;
      const locked = po.ordered;
      const ro = locked ? ' readonly disabled' : '';
      return `<div class="wom-line" data-om-row="${i}" data-fate="${locked ? 'ordered' : 'none'}">
        <div class="wom-line-h">
          <input type="checkbox" id="wom-om-${i}" data-om-line="${i}"${locked ? ' checked disabled' : ''} title="${locked ? 'This line is already ordered' : 'Select this line to mark as ordered'}">
          <label class="wom-line-name" for="wom-om-${i}"><b>${esc(l.name)}</b><span>#${esc(l.matNum)} · ${esc(l.vendor)}</span></label>
          <span class="a-pill ${locked ? 'a-blue' : 'a-gray'}" data-om-fate>${locked ? '✓ PO created' : '○ Not selected'}</span>
        </div>
        <div class="wom-line-f">
          <div><span class="a-label">Quantity</span><span class="wom-ro num">${fmtQty(l.qty)} ${esc(l.uom)}</span></div>
          <div><span class="a-label">Cost / Unit</span><span class="wom-ro num">${fmtMoney(l.cost)}</span><span class="wom-lt">Line total: <b class="num">${fmtMoney(l.qty * l.cost)}</b></span></div>
          <div><label class="a-label" for="wom-om-po-${i}">PO #</label><input class="a-input" id="wom-om-po-${i}" data-om-po="${i}" value="${esc(po.poNumber)}" placeholder="Auto-generated"${ro}></div>
          <div><label class="a-label" for="wom-om-od-${i}">Order Date</label><input class="a-input" type="date" id="wom-om-od-${i}" data-om-od="${i}" value="${po.orderDate}"${ro}></div>
          <div><label class="a-label" for="wom-om-ed-${i}">Est. Delivery</label><input class="a-input" type="date" id="wom-om-ed-${i}" data-om-ed="${i}" value="${po.eta}"${ro}></div>
        </div>
      </div>`;
    }).join('');
    const box = openModal(
      dlgHead('wom-om-h', title)
      + `<div class="wom-dlg-b"><div class="wom-info">💡 <strong>How this works:</strong> ${info}</div>`
      + (done ? '' : `<div class="wom-selall"><input type="checkbox" id="wom-om-all" data-om-all><label for="wom-om-all">Select all orderable</label><span class="wom-selcount" data-om-count aria-live="polite"></span></div>`)
      + `<div class="wom-tiles" data-om-tiles></div><div class="wom-lines">${lines}</div></div>`
      + `<div class="wom-dlg-f"><button type="button" class="a-btn a-outline" data-close>${done ? 'Close' : 'Cancel'}</button>${done ? '' : '<button type="button" class="a-btn a-primary" data-om-finish>Finish</button>'}</div>`,
      { labelledBy: 'wom-om-h', wide: true, focus: done ? '[data-close]' : '[data-om-line]:not([disabled])' },
    );

    function sync(): void {
      const ord = orderable();
      const selectedCount = ord.filter((i) => sel[i]).length;
      const locked = s.pos.length - ord.length;
      const skipped = ord.length - selectedCount;
      const total = d.lines.reduce((a, l, i) => a + (sel[i] ? l.qty * l.cost : 0), 0);
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
        if (s.pos[i]!.ordered) return;
        row.dataset.fate = sel[i] ? 'selected' : 'none';
        const fate = row.querySelector('[data-om-fate]')!;
        fate.className = `a-pill ${sel[i] ? 'a-green' : 'a-gray'}`;
        fate.textContent = sel[i] ? '✓ Will be marked Ordered' : '○ Not selected';
      });
    }
    sync();

    box.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches('[data-om-line]')) { sel[Number(t.dataset.omLine)] = t.checked; sync(); }
      else if (t.matches('[data-om-all]')) {
        orderable().forEach((i) => { sel[i] = t.checked; });
        box.querySelectorAll<HTMLInputElement>('[data-om-line]:not([disabled])').forEach((cb) => { cb.checked = t.checked; });
        sync();
      } else if (t.matches('[data-om-po]')) s.pos[Number(t.dataset.omPo)]!.poNumber = t.value.trim();
      else if (t.matches('[data-om-od]')) s.pos[Number(t.dataset.omOd)]!.orderDate = (t.value || d.today) as ISODate;
      else if (t.matches('[data-om-ed]')) s.pos[Number(t.dataset.omEd)]!.eta = (t.value || addDays(d.today, 14)) as ISODate;
    });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (t.matches('[data-om-finish]')) {
        // submitOrderMaterials (main L18501-18547)
        const picked = orderable().filter((i) => sel[i] && d.lines[i]!.qty > 0);
        if (!picked.length) { toast('Tick at least one line to mark as ordered', 'warning'); return; }
        if (picked.some((i) => !s.pos[i]!.poNumber)) { toast('Every selected line needs a PO #', 'warning'); return; }
        picked.forEach((i) => { s.pos[i]!.ordered = true; });
        const n = picked.length;
        closeModal(true);
        moveTo(woTransition(s.status, { type: 'materialsOrdered' }), `✓ ${n} PO${n === 1 ? '' : 's'} marked as ordered`);
      }
    });
  }

  // ---------------------------------------------------- Schedule Install --
  function openSchedule(): void {
    // Only people whose trade is Installer are offered (main L16846).
    const installers = d.people.filter((p) => /installer/i.test(p.trade)).slice().sort((a, b) => a.name.localeCompare(b.name));
    const opts = installers.map((p) => `<option value="${esc(p.id)}"${s.crew === p.id ? ' selected' : ''}>${esc(p.name)}${p.trade ? ` · ${esc(p.trade)}` : ''} 🔧</option>`).join('');
    const box = openModal(
      dlgHead('wom-sc-h', `📅 Schedule Install · ${esc(d.wo)}`)
      + `<div class="wom-dlg-b"><div class="wom-custbox"><span class="a-label">Customer</span><div><strong>${esc(d.customer)}</strong> · ${esc(d.phone)}</div></div>
        <div class="wom-formrow">
          <div class="wom-fg"><label for="wom-sc-date">Install Date <span class="wom-req" aria-hidden="true">*</span></label><input class="a-input" type="date" id="wom-sc-date" value="${s.scheduledDate}"></div>
          <div class="wom-fg"><label for="wom-sc-inst">Assigned Installer</label><select class="a-select" id="wom-sc-inst"><option value="">— Unassigned —</option>${opts}</select></div>
        </div>
        <p class="wom-help">Setting a date flips the WO to <strong>Scheduled</strong>. You can save just an installer without a date — the WO stays in <strong>Ready to Schedule</strong> until you pick one.</p></div>`
      + `<div class="wom-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-sc-save>📅 Schedule</button></div>`,
      { labelledBy: 'wom-sc-h', focus: '#wom-sc-date' },
    );
    const dateEl = box.querySelector<HTMLInputElement>('#wom-sc-date')!;
    dateEl.addEventListener('click', () => { try { dateEl.showPicker?.(); } catch { /* not allowed here */ } });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-sc-save]')) return;
      // saveScheduleJob (main L16882-16910)
      const date = (dateEl.value || '') as ISODate | '';
      const crew = box.querySelector<HTMLSelectElement>('#wom-sc-inst')!.value;
      const crewName = d.people.find((p) => p.id === crew)?.name ?? '';
      const msg = scheduleToast(d.wo, date || null, crewName || null);
      if (!date && !crew) { toast(msg, 'warning'); return; }
      const next = woTransition(s.status, { type: 'schedule', date: date || null, installer: crew || null });
      s.scheduledDate = date;
      s.crew = crew;
      closeModal(true);
      moveTo(next, msg);
    });
  }

  // ----------------------------------------- Invoice + Take Payment --
  function invoiceTotalsHTML(): string {
    const paid = paidTotal(s);
    const bal = round2(d.invoice.total - paid);
    const rows = s.payments.length
      ? `<table class="wom-ptable"><thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col" class="r">Amount</th></tr></thead><tbody>${s.payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.method)}${p.checkNumber ? ` <span class="wom-chk">#${esc(p.checkNumber)}</span>` : ''}</td><td class="r num wom-green">${fmtMoney(p.amount)}</td></tr>`).join('')}<tr class="wom-ptd"><td colspan="2">Paid to date</td><td class="r num wom-green">${fmtMoney(paid)}</td></tr></tbody></table>`
      : '<p class="wom-nopay">No payments recorded yet.</p>';
    return `<table class="wom-itot"><tbody><tr><td>Total</td><td class="num">${fmtMoney(d.invoice.total)}</td></tr><tr class="wom-green"><td>Paid</td><td class="num">-${fmtMoney(paid)}</td></tr><tr class="wom-bal${bal > 0 ? ' is-due' : ''}"><td>Balance Due</td><td class="num">${fmtMoney(bal)}</td></tr></tbody></table><div class="wom-pays"><h5>💳 Payments</h5>${rows}</div>`;
  }

  function openInvoice(): void {
    const st = womInvoiceStatus(d, s);
    const box = openModal(
      dlgHead('wom-iv-h', `🧾 Invoice ${esc(d.invoice.number)} <span class="a-pill a-${INVOICE_STATUS_COLOR_NAMES[st]}">${invLabel(st)}</span>`)
      + `<div class="wom-dlg-b"><p class="wom-sub">${esc(d.customer)} · final invoice for ${esc(d.wo)}</p>${invoiceTotalsHTML()}</div>`
      + `<div class="wom-dlg-f"><button type="button" class="a-btn a-outline" data-close>Close</button>${st !== 'paid' ? '<button type="button" class="a-btn a-success" data-iv-take>💰 Take Payment</button>' : ''}</div>`,
      { labelledBy: 'wom-iv-h', focus: '[data-iv-take]' },
    );
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) closeModal();
      else if (t.matches('[data-iv-take]')) { const back = opener; closeModal(); opener = back; openTakePayment(back); }
    });
  }

  function openTakePayment(returnTo: HTMLElement | null = null): void {
    const bal = Math.max(0, round2(d.invoice.total - paidTotal(s)));
    const box = openModal(
      dlgHead('wom-tp-h', `💰 Take Payment — ${esc(d.invoice.number)}`)
      + `<div class="wom-dlg-b"><div class="wom-tabs"><span class="wom-tab is-on">📝 Record Payment</span><span class="wom-tab is-off" title="Card charges open Stripe’s card form in the live app">💳 Charge Card<span class="sr-only"> (runs through Stripe in the live app)</span></span></div>
        <div class="wom-fg"><label for="wom-tp-amt">Amount</label><input class="a-input num" id="wom-tp-amt" type="number" step="0.01" min="0" inputmode="decimal" value="${bal.toFixed(2)}"></div>
        <div class="wom-fg"><label for="wom-tp-method">Method</label><select class="a-select" id="wom-tp-method"><option>Cash</option><option>Check</option><option>Bank Transfer</option><option>Other</option></select></div>
        <div class="wom-fg" data-tp-chk hidden><label for="wom-tp-chk">Check #</label><input class="a-input" id="wom-tp-chk" type="text" placeholder="e.g. 1042"></div>
        <div class="wom-fg"><label for="wom-tp-date">Date</label><input class="a-input" id="wom-tp-date" type="date" value="${d.today}"></div></div>`
      + `<div class="wom-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-tp-save>Record Payment</button></div>`,
      { labelledBy: 'wom-tp-h', focus: '#wom-tp-amt' },
    );
    if (returnTo) opener = returnTo;
    const method = box.querySelector<HTMLSelectElement>('#wom-tp-method')!;
    method.addEventListener('change', () => { box.querySelector<HTMLElement>('[data-tp-chk]')!.hidden = method.value !== 'Check'; });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-tp-save]')) return;
      // recordPayment (main L18355)
      const amt = Number(box.querySelector<HTMLInputElement>('#wom-tp-amt')!.value);
      if (!amt || amt <= 0) { toast('Enter valid amount', 'warning'); return; }
      const chk = box.querySelector<HTMLInputElement>('#wom-tp-chk')!.value.trim();
      const pay: WomPayment = { amount: round2(amt), method: method.value, date: (box.querySelector<HTMLInputElement>('#wom-tp-date')!.value || d.today) as ISODate };
      if (pay.method === 'Check' && chk) pay.checkNumber = chk;
      s.payments.push(pay);
      const st = womInvoiceStatus(d, s);
      const msg = `Payment of ${fmtMoney(pay.amount)} recorded on ${d.invoice.number}`;
      closeModal(true);
      // Paid in full → a WO waiting at Final Invoice moves on by itself (main L24743).
      const next = st === 'paid' ? woTransition(s.status, { type: 'invoicePaid' }) : s.status;
      if (next !== s.status) moveTo(next, msg);
      else {
        render(null);
        toast(msg);
        announce(`Invoice ${d.invoice.number}: ${invLabel(st)}. Work order status: ${WO_LABELS[s.status]}.${nextStep()}`);
      }
    });
  }

  // ------------------------------------------------ installer payout --
  function openPayout(): void {
    const crew = d.people.find((p) => p.id === s.crew);
    if (!crew) {
      // openWOPaymentModal without an installer (main L16942): the app's confirm().
      const box = openModal(
        dlgHead('wom-cf-h', `Mark ${esc(d.wo)} as Paid?`)
        + `<div class="wom-dlg-b"><p class="wom-confirm">No installer assigned to ${esc(d.wo)}.</p><p class="wom-confirm">Assign one first to record a payment to a technician, or mark this WO Paid without recording a payment?</p><p class="wom-confirm wom-muted">OK → mark Paid without payment<br>Cancel → go back and assign an installer first</p></div>`
        + `<div class="wom-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-cf-ok>OK</button></div>`,
        { labelledBy: 'wom-cf-h', alert: true, focus: '[data-cf-ok]' },
      );
      box.addEventListener('click', (e) => {
        const t = (e.target as HTMLElement).closest('button');
        if (!t) return;
        if (t.matches('[data-close]')) closeModal();
        else if (t.matches('[data-cf-ok]')) { closeModal(true); moveTo(woTransition(s.status, { type: 'markPaid' }), markPaidToast(d.wo)); }
      });
      return;
    }
    const owed = d.laborOwed;
    const pl = womPill(s.status);
    const box = openModal(
      dlgHead('wom-py-h', `💵 Add Payment — ${esc(crew.name)}`)
      + `<div class="wom-dlg-b"><div class="wom-owed"><div><span class="wom-owed-k" title="From the work orders’ quoted labor — the actual payout is whatever you type on each row">Est. Labor Owed</span><b class="num">${fmtMoney(owed)}</b></div><div class="r"><span class="wom-owed-k">Selected</span><b class="num wom-green" data-py-sel>${fmtMoney(owed)}</b></div></div>
        <div class="wom-formrow">
          <div class="wom-fg"><label for="wom-py-amt">Amount <span class="wom-req" aria-hidden="true">*</span></label><input class="a-input num" id="wom-py-amt" type="number" step="0.01" min="0.01" inputmode="decimal" value="${owed.toFixed(2)}"></div>
          <div class="wom-fg"><label for="wom-py-method">Method</label><select class="a-select" id="wom-py-method"><option>Cash</option><option>Check</option><option>Venmo</option><option>Zelle</option><option>ACH / Bank Transfer</option><option>Credit Card</option><option>Other</option></select></div>
        </div>
        <p class="wom-help">What is this paying for? <span>(labor marks the work order Paid)</span></p>
        <label class="wom-pyrow"><input type="checkbox" checked disabled><span class="wom-pyrow-t"><strong>📍 ${esc(d.site)}</strong> <span class="wom-mono">${esc(d.wo)}</span> <span class="${pl.cls}">${esc(pl.label)}</span> <span class="wom-this">▸ THIS WO</span><span class="wom-pyrow-s">${esc(d.customer)}${s.scheduledDate ? ` · Scheduled ${fmtDate(s.scheduledDate)}` : ''}</span></span><b class="num">${fmtMoney(owed)}</b></label></div>`
      + `<div class="wom-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-py-save>💾 Record Payment</button></div>`,
      { labelledBy: 'wom-py-h', focus: '#wom-py-amt' },
    );
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (!t.matches('[data-py-save]')) return;
      // saveTechPayment (main L18209): a labor payment marks the WO Paid.
      const amt = Number(box.querySelector<HTMLInputElement>('#wom-py-amt')!.value);
      if (!(amt > 0)) { toast('Enter a valid amount', 'warning'); return; }
      closeModal(true);
      moveTo(woTransition(s.status, { type: 'markPaid' }), `✓ Payment ${fmtMoney(amt)} recorded · 1 WO marked Paid`);
    });
  }

  // ------------------------------------------------------------ wiring --
  let hintTimer = 0;
  primary.addEventListener('click', () => {
    const v = womPrimaryView(d, s);
    if (v.kind !== 'button') return;
    if (v.locked) {
      // The app's button ignores clicks; here we point at what unlocks it.
      announce(`${MARK_PAID_DISABLED_TITLE}. Use Record payment on invoice ${d.invoice.number}.`);
      fx.nudge(inv);
      inv.classList.add('is-hint');
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => inv.classList.remove('is-hint'), 1800);
      return;
    }
    switch (v.action) {
      case 'orderMaterials': openOrderMaterials(); break;
      case 'schedule': openSchedule(); break;
      case 'complete': {
        // completeJob (main L16915-16940)
        const next = woTransition(s.status, { type: 'complete', anyInvoicePaid: womInvoiceStatus(d, s) === 'paid' });
        moveTo(next, completeToast(d.wo, next));
        break;
      }
      case 'viewFinalInvoice': openInvoice(); break;
      case 'markPaid': openPayout(); break;
    }
  });
  posBtn.title = MANAGE_POS.title;
  posBtn.addEventListener('click', openOrderMaterials);
  inv.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-wom-pay]')) openTakePayment();
  });
  reset.addEventListener('click', () => {
    closeModal();
    s = womInitialState(d);
    task.classList.remove('is-done');
    task.textContent = taskText;
    render(null);
    announce(`Started over. ${d.wo} is back at ${WO_LABELS[s.status]}.`);
    primary.focus();
  });

  render(null);
}
