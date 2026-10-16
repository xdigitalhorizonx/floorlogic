/**
 * "Know the profit" — WO-330's own Job Costing page in today's app (renderJobCostingDetail,
 * main L32113-32260): the header with its lifecycle button (💰 Mark Paid, `jcMarkGroupPaid`
 * L29577), the seven-figure bar (`_jcMetricBar`), 📐 Estimate vs Actual (materials = POs incl.
 * estimated freight, labor, supplies & other, card processing), the profit box with the commission
 * sign-off (`toggleCommissionReadyGroup` L29618), 🧾 Billing, 📦 Purchase orders, and 🧾 Recorded
 * Costs with ➕ Add Cost (`openJobCostModal` L31470, `saveJobCost` L31557), edit / delete and the
 * ✅ paid toggle (`toggleJobCostPaid` L31610). Privacy Mode blurs margin and profit.
 *
 * Every figure comes from job-costing.ts (`jobFinance` = the app's `_jobFinance`,
 * `jobCostingMetrics`, `bucketDelta`, …). The story is set the morning the installer is paid
 * out: the invoice is collected, the POs and a supplies run are recorded, the payout is not yet.
 * Fictional sample data; nothing is saved or sent anywhere.
 */
import gsap from 'gsap';
import {
  jobFinance, jobCostingMetrics, bucketDelta, commissionOwed, markGroupPaid, poTotal, jobCostAmount, nextJobCostNumber, jobCostDescription,
  jobCostRefusal, jobCostAddedToast, jobCostDeleteConfirm, jobCostPaidTitle, jobCostSubline, materialsBucketNote, laborBucketNote, marginLine,
  commissionSignOffText, commissionSignOffAllowed, commissionSignOffToast, JOB_COST_KINDS, JOB_COST_CATEGORIES, JOB_COST_METHODS, JOB_COST_UPDATED,
  JOB_COST_DELETED, JOB_COST_NEED_DESC, CARD_FEE, PRIVACY_MODE, JOB_STATUS_COLOR_NAMES, WO_LABELS, fmtMoney, fmtDate, round2,
} from '../lib/logic';
import type { JobFinance, JobCostKind, CostLine, Payment, ISODate, WoStatus } from '../lib/logic';
import { iconSvg, withAppIcons } from '../data/modules/app-icons';
import { appToaster } from '../data/modules/app-toast';

export interface JcmEntry {
  id: string;
  number: string;
  kind: JobCostKind;
  category: string;
  description: string;
  amount: number;
  quantity: number;
  unitCost: number;
  paid: boolean;
  paidDate: ISODate | null;
  method: string;
  checkNumber: string;
  /** The cost's own date (`costDate`). */
  date: ISODate;
  contractorId: string;
  contractorName: string;
  vendor: string;
  notes: string;
}
export interface JcmPO { number: string; poNumber: string; productName: string; vendor: string; totalCost: number; freight: number; status: string }
export interface JcmData {
  wo: string;
  customer: string;
  /** The job's address line (`_jcAddrOr`; sample leads carry a city only). */
  site: string;
  status: WoStatus;
  /** The page's "today". */
  today: ISODate;
  rep: { name: string; rate: number };
  installer: { id: string; name: string };
  people: Array<{ id: string; name: string }>;
  vendors: string[];
  supplies: Array<{ id: string; name: string; unitCost: number; uom: string }>;
  materials: CostLine[];
  labors: CostLine[];
  invoice: { number: string; subtotal: number; tax: number; total: number; status: string; payments: Payment[] };
  pos: JcmPO[];
  entries: JcmEntry[];
  /** The cost still to be recorded — the installer's payout — offered pre-filled the first time. */
  draft: JcmEntry;
}
export interface JcmState {
  entries: JcmEntry[];
  status: WoStatus;
  /** When the commission was signed off for payout (`commissionReadyAt`). */
  signedOffAt: string | null;
  privacy: boolean;
  draftUsed: boolean;
}

export function jcmInitialState(d: JcmData): JcmState {
  return { entries: d.entries.map((e) => ({ ...e })), status: d.status, signedOffAt: null, privacy: false, draftUsed: false };
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function jcmFinance(d: JcmData, s: JcmState): JobFinance {
  return jobFinance({
    materials: d.materials,
    labors: d.labors,
    invoices: [{ subtotal: d.invoice.subtotal, tax: d.invoice.tax, total: d.invoice.total, payments: d.invoice.payments, status: d.invoice.status }],
    // A PO costs the job its goods PLUS its estimated freight (`_jpoTotal`).
    pos: d.pos.map((p) => ({ status: p.status, totalCost: p.totalCost, freight: p.freight })),
    costs: s.entries.map((e) => ({ ...e, status: 'active' as const })),
    reps: [d.rep],
  });
}

const kindOf = (k: JobCostKind) => JOB_COST_KINDS.find((x) => x.key === k) ?? JOB_COST_KINDS[JOB_COST_KINDS.length - 1]!;
const TONE: Record<string, string> = { danger: 'jcm-red', success: 'jcm-green', gray: 'jcm-gray' };
const METRIC_TONE: Record<string, string> = { blue: 'jcm-blue', red: 'jcm-red', green: 'jcm-green', amber: 'jcm-amber' };

export function jcmStatusPill(status: WoStatus): string {
  return `<span class="a-pill a-${JOB_STATUS_COLOR_NAMES[status]}">${WO_LABELS[status]}</span>`;
}

/** The header's right side: the status badge, then the lifecycle button for that stage. */
export function renderJcmActions(s: JcmState): string {
  const btn = s.status === 'ready_to_be_paid'
    ? '<button type="button" class="a-btn a-primary jcm-markpaid" data-jcm-markpaid title="Costed and paid out — close the job; it moves off the board to Projects → Archive">💰 Mark Paid</button>'
    : '';
  return `<span class="jcm-hstatus" data-jcm-hstatus>${jcmStatusPill(s.status)}</span>${btn}`;
}

/** The seven-figure bar (`_jcMetricBar`, main L32171-32177). */
export function renderJcmMetrics(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  return jobCostingMetrics(f, { count: s.entries.length }).map((m) => `<div class="jcm-m" title="${esc(m.title)}"><div class="jcm-m-l">${esc(m.label)}</div>`
    + `<div class="jcm-m-v num ${m.tone ? METRIC_TONE[m.tone] : ''}"><span${m.private ? ' class="is-private"' : ''} data-jcm-m="${m.label.toLowerCase().replace(/\s+/g, '-')}">${esc(m.value)}</span></div>`
    + `<div class="jcm-m-n">${esc(m.note)}</div></div>`).join('');
}

/** 📐 Estimate vs Actual rows (main L32185-32190). */
export function renderJcmBuckets(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  const row = (label: string, est: number | null, act: number, note: string, key: string): string => {
    const dl = bucketDelta(est, act);
    // On a narrow screen the note moves to its own full-width line under the bucket (the inline copy stays for screen readers).
    return `<tr data-bucket="${key}"${note ? ' class="has-note"' : ''}><th scope="row"><span class="jcm-bl">${label}</span>${note ? `<span class="jcm-note">${esc(note)}</span>` : ''}</th>`
      + `<td class="num jcm-est">${est == null ? '—' : fmtMoney(est)}</td><td class="num jcm-act">${fmtMoney(act)}</td><td class="num ${TONE[dl.tone]}">${dl.text}</td></tr>`
      + (note ? `<tr class="jcm-noterow" aria-hidden="true"><td colspan="4">${esc(note)}</td></tr>` : '');
  };
  const poCount = d.pos.filter((p) => p.status !== 'cancelled').length;
  const fee = f.feeCost > 0.005
    ? `<tr data-bucket="fees" title="What the card processor kept — ${CARD_FEE.pct}% + ${fmtMoney(CARD_FEE.fixed)} on card payments"><th scope="row"><span class="jcm-bl">💳 Card processing</span></th><td class="num jcm-est">—</td><td class="num jcm-act">${fmtMoney(f.feeCost)}</td><td class="num jcm-gray">—</td></tr>`
    : '';
  const v = f.actual - f.estimate;
  return row('🧱 Materials', f.matQuoted, f.matCost, materialsBucketNote(f, poCount), 'material')
    + row('🔨 Labor', f.laborQuoted, f.laborCost, laborBucketNote(f), 'labor')
    + row('🔩 Supplies &amp; other', null, f.otherCost, 'never estimated on the work order', 'other')
    + fee
    + `<tr class="jcm-total"><th scope="row">Total Cost</th><td class="num jcm-est">${fmtMoney(f.estimate)}</td><td class="num jcm-act">${fmtMoney(f.actual)}</td>`
    + `<td class="num ${v > 0.005 ? 'jcm-red' : 'jcm-green'}">${Math.abs(v) < 0.005 ? '—' : (v > 0 ? '+' : '−') + fmtMoney(Math.abs(v))}</td></tr>`;
}

/**
 * The profit box (main L32191-32202), blurred by Privacy Mode. The app also lists "− Card
 * processing" here although "− Cost" already includes it (`_jcActual` adds feeCost), so its
 * rows don't add up; the site lists the fee once — in the bucket table — so the rows sum to Job Profit.
 */
export function renderJcmProfit(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  const src = f.revSource === 'invoice' ? '(invoiced)' : '(quoted)';
  const m = marginLine(f);
  const signoff = f.reps.length && f.commission > 0.005
    ? `<div class="jcm-signoff"><span data-jcm-signtext>${esc(commissionSignOffText(s.signedOffAt, s.status))}</span>`
      + (s.signedOffAt
        ? '<button type="button" class="a-btn a-btn-sm jcm-ready is-on" data-jcm-signoff aria-pressed="true" title="Click to un-mark">✓ Ready to pay</button>'
        : commissionSignOffAllowed(s.status)
          ? '<button type="button" class="a-btn a-outline a-btn-sm jcm-ready" data-jcm-signoff aria-pressed="false" title="Queue this commission for the next payout run">Mark ready to pay</button>'
          : '<button type="button" class="a-btn a-outline a-btn-sm jcm-ready" disabled title="Commissions are only paid once the job is complete and the final invoice is collected in full">Mark ready to pay</button>')
      + '</div>'
    : '';
  return `<div class="jcm-pl"><span>Revenue ${src}</span><span class="num">${fmtMoney(f.revenue)}</span></div>`
    + `<div class="jcm-pl" title="Collected for the state, not earned by the job — it is never part of revenue, profit or a commission basis"><span>Sales tax ${f.taxSource === 'invoice' ? '(invoiced)' : '(quoted)'} <small>not revenue</small></span><span class="num">${fmtMoney(f.tax)}</span></div>`
    + `<div class="jcm-pl" title="Materials, labor, supplies & other, and card processing"><span>− Cost</span><span class="num">${fmtMoney(f.actual)}</span></div>`
    + `<div class="jcm-pl jcm-pl-comm"><span>− Commission${f.reps.length ? ` <small>· ${f.reps.map((r) => esc(r.name)).join(', ')}</small>` : ''}</span><span class="num">${fmtMoney(f.commission)}</span></div>`
    + signoff
    + `<div class="jcm-jp"><span>Job Profit</span><span class="num ${f.profit >= 0 ? 'jcm-green' : 'jcm-red'}" data-jcm-profit>${fmtMoney(f.profit)}</span></div>`
    + `<div class="jcm-mb" title="Revenue less cost, before the commission. The commission is a share OF this, so counting it again would make a job look worse the better it sold."><span>Margin before commission</span><span class="num">${m.before}${m.after ? ` <span class="jcm-after">· ${m.after}</span>` : ''}</span></div>`;
}

export function renderJcmBilling(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  return `<div class="jcm-pl"><span>Invoiced (with tax)</span><span class="num">${fmtMoney(f.invTotal)}</span></div>`
    + `<div class="jcm-pl"><span>Collected</span><span class="num jcm-green">${fmtMoney(f.collected)}</span></div>`
    + `<div class="jcm-pl jcm-out"><span>Outstanding</span><span class="num ${f.outstanding > 0.005 ? 'jcm-red' : 'jcm-green'}">${fmtMoney(f.outstanding)}</span></div>`;
}

/** 📦 Purchase orders (main L32217-32226): PO # (else its JPO number) · product · status, goods + estimated freight. */
export function renderJcmPOs(d: JcmData): string {
  return d.pos.map((p) => {
    const tag = p.status === 'cancelled' ? 'cancelled' : p.status === 'received' ? 'received' : p.status === 'pending' ? 'not ordered' : '';
    const fr = p.freight > 0 ? ` <span class="jcm-frt" title="Includes ${fmtMoney(p.freight)} estimated freight">incl. freight</span>` : '';
    return `<div class="jcm-po"><span class="jcm-po-t"><span>${esc(p.poNumber || p.number)} · ${esc(p.productName)}</span>${tag ? ` <span class="jcm-po-tag">· ${tag}</span>` : ''}</span><span class="num jcm-po-v">${fmtMoney(poTotal(p))}${fr}</span></div>`;
  }).join('');
}

/** Recorded Costs' header line (main L32231): "$1,733.50 total · $0.00 unpaid". */
export function renderJcmCostsHead(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  return `${fmtMoney(f.costs.total)} total · <span class="${f.costs.unpaid > 0.005 ? 'jcm-warn' : ''}">${fmtMoney(f.costs.unpaid)} unpaid</span>`;
}

/** Recorded Costs rows (main L32246-32254), newest first. */
export function renderJcmRows(s: JcmState): string {
  const rows = s.entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  if (!rows.length) {
    return '<tr><td colspan="6"><div class="jcm-empty"><div class="jcm-empty-i" aria-hidden="true">🧾</div><h6>Nothing recorded yet</h6><p>Add a contractor payment, a receipt, or the misc supplies this job ate through.</p></div></td></tr>';
  }
  return rows.map((x) => {
    const k = kindOf(x.kind);
    const sub = jobCostSubline(x);
    const who = x.contractorName || x.vendor || '—';
    return `<tr data-jc="${esc(x.id)}"><td class="jcm-date">${fmtDate(x.date)}<span class="jcm-mono">${esc(x.number)}</span></td>`
      + `<td class="jcm-costc"><span class="jcm-cost">${k.icon} ${esc(x.description)}</span>${sub ? `<span class="jcm-ksub">${esc(sub)}</span>` : ''}</td>`
      + `<td class="jcm-who">${esc(who)}${x.notes ? `<span class="jcm-ksub">${esc(x.notes)}</span>` : ''}</td><td class="num jcm-amt">${fmtMoney(jobCostAmount(x))}</td>`
      + `<td class="jcm-paidc"><button type="button" class="jcm-paid${x.paid ? ' is-paid' : ''}" data-jcm-paid="${esc(x.id)}" aria-pressed="${x.paid}" title="${esc(jobCostPaidTitle(x))}"><span aria-hidden="true">✅</span><span class="sr-only">Paid: ${esc(x.number)}</span></button>${x.paid && x.checkNumber ? `<span class="jcm-mono jcm-chk" title="Check number">#${esc(x.checkNumber)}</span>` : ''}</td>`
      + `<td class="jcm-actc"><button type="button" class="a-btn a-outline a-btn-sm jcm-edit" data-jcm-edit="${esc(x.id)}" title="Edit" aria-label="Edit ${esc(x.number)}">✏️</button></td></tr>`;
  }).join('');
}

/** One sentence for screen readers after a change. */
export function jcmSummary(f: JobFinance): string {
  const v = f.actual - f.estimate;
  return `Actual cost ${fmtMoney(f.actual)}, ${(v > 0.005 ? '+' : v < -0.005 ? '−' : '') + fmtMoney(Math.abs(v))} ${v > 0.005 ? 'over' : 'under'} the estimate. Margin ${f.margin.toFixed(1)}% before commission; job profit ${fmtMoney(f.profit)}.`;
}

// ----------------------------------------------------------- the island --

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initJobCostingModules(): void {
  document.querySelectorAll<HTMLElement>('[data-jcm]').forEach(initOne);
}

function initOne(root: HTMLElement): void {
  if (root.dataset.jcmReady) return;
  root.dataset.jcmReady = '1';
  const dataEl = root.querySelector('[data-jcm-data]');
  if (!dataEl) return;
  const d = JSON.parse(dataEl.textContent || '{}') as JcmData;
  let s = jcmInitialState(d);

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const app = $('[data-jcm-app]');
  const subPill = $('[data-jcm-subpill]');
  const actions = $('[data-jcm-actions]');
  const metrics = $('[data-jcm-metrics]');
  const buckets = $('[data-jcm-buckets]');
  const profit = $('[data-jcm-profitbox]');
  const billing = $('[data-jcm-billing]');
  const costsHead = $('[data-jcm-costshead]');
  const rows = $('[data-jcm-rows]');
  const privBtn = $<HTMLButtonElement>('[data-jcm-priv]');
  const addBtn = $<HTMLButtonElement>('[data-jcm-addcost]');
  const dlg = $<HTMLDialogElement>('[data-jcm-dlg]');
  const toastEl = $('[data-jcm-toast]');
  const live = $('[data-jcm-live]');
  const task = $('[data-task]');
  const reset = $<HTMLButtonElement>('[data-jcm-reset]');
  const taskText = task.textContent || '';

  const fx = { open: (_el: Element) => {}, flash: (_els: Element[]) => {} };
  gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const { motion } = ctx.conditions as { motion: boolean };
    if (!motion) { fx.open = () => {}; fx.flash = () => {}; return; }
    fx.open = (box) => { gsap.fromTo(box, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: 'transform,opacity' }); };
    // A changed figure washes blue for a moment (colour only — nothing moves or scales).
    fx.flash = (els) => { if (els.length) gsap.fromTo(els, { backgroundColor: 'rgba(0,116,211,.18)' }, { backgroundColor: 'rgba(0,116,211,0)', duration: 1, ease: 'power1.out', clearProps: 'backgroundColor' }); };
  });

  // The app's showToast; lifted above the Add Job Cost window while it is open.
  const toast = appToaster(toastEl, dlg);
  let liveTimer = 0;
  function announce(msg: string): void {
    window.clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = window.setTimeout(() => { live.textContent = msg; }, 80);
  }

  function render(prev: JobFinance | null = null): void {
    const f = jcmFinance(d, s);
    subPill.innerHTML = jcmStatusPill(s.status);
    actions.innerHTML = withAppIcons(renderJcmActions(s));
    metrics.innerHTML = renderJcmMetrics(d, s);
    buckets.innerHTML = withAppIcons(renderJcmBuckets(d, s));
    profit.innerHTML = renderJcmProfit(d, s);
    profit.classList.toggle('is-loss', f.profit < 0);
    billing.innerHTML = renderJcmBilling(d, s);
    costsHead.innerHTML = renderJcmCostsHead(d, s);
    rows.innerHTML = withAppIcons(renderJcmRows(s));
    reset.hidden = !(s.entries.length !== d.entries.length || s.status !== d.status || s.signedOffAt || s.privacy
      || s.entries.some((e, i) => JSON.stringify(e) !== JSON.stringify(d.entries[i])));
    if (prev) {
      // Wash the figures that moved.
      const moved: Element[] = [];
      const pairs: Array<[string, number, number]> = [['actual', prev.actual, f.actual], ['variance', prev.variance, f.variance], ['margin', prev.margin, f.margin], ['profit', prev.profit, f.profit]];
      for (const [k, a, b] of pairs) if (Math.abs(a - b) > 0.0001) { const el = metrics.querySelector(`[data-jcm-m="${k}"]`)?.parentElement; if (el) moved.push(el); }
      if (Math.abs(prev.laborCost - f.laborCost) > 0.0001) { const el = buckets.querySelector('[data-bucket="labor"]'); if (el) moved.push(el); }
      if (Math.abs(prev.matCost - f.matCost) > 0.0001) { const el = buckets.querySelector('[data-bucket="material"]'); if (el) moved.push(el); }
      if (Math.abs(prev.otherCost - f.otherCost) > 0.0001) { const el = buckets.querySelector('[data-bucket="other"]'); if (el) moved.push(el); }
      fx.flash(moved);
    }
  }

  // ---- dialogs (the app's openModal look) — a native modal <dialog>: page inert, Esc closes ----
  let opener: HTMLElement | null = null;
  function openModal(html: string, opts: { labelledBy: string; focus?: string; alert?: boolean; width?: number; icons?: boolean; describedBy?: string }): HTMLElement {
    closeModal(false);
    const active = document.activeElement as HTMLElement | null;
    opener = active && active !== document.body && root.contains(active) ? active : null;
    dlg.style.setProperty('--dlg-w', `${opts.width ?? 480}px`);
    dlg.setAttribute('aria-labelledby', opts.labelledBy);
    if (opts.describedBy) dlg.setAttribute('aria-describedby', opts.describedBy); else dlg.removeAttribute('aria-describedby');
    if (opts.alert) dlg.setAttribute('role', 'alertdialog'); else dlg.removeAttribute('role');
    dlg.innerHTML = `<div class="a-dlg">${opts.icons === false ? html : withAppIcons(html)}</div>`;
    dlg.showModal();
    const box = dlg.querySelector<HTMLElement>('.a-dlg')!;
    fx.open(box);
    const first = (opts.focus ? box.querySelector<HTMLElement>(opts.focus) : null) ?? box.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    return box;
  }
  function closeModal(restore = true, to: HTMLElement | null = null): void {
    if (!dlg.open) return;
    dlg.close();
    dlg.innerHTML = '';
    if (restore) {
      const back = to ?? (opener && opener.isConnected ? opener : null) ?? addBtn;
      back.focus({ preventScroll: true });
    }
    opener = null;
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeModal(); });
  const dlgHead = (id: string, title: string) => `<div class="a-dlg-h"><h4 id="${id}">${title}</h4><button type="button" class="a-x" data-close aria-label="Close">✕</button></div>`;

  /** The app's confirm() — plain text, as the browser prints it: the first line as the title, the rest as the body, OK / Cancel. */
  function confirmBox(message: string, onOk: () => void): void {
    const [title, ...rest] = message.split('\n');
    const body = rest.join('\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
    const box = openModal(
      withAppIcons(dlgHead('jcm-cf-h', esc(title ?? '')))
      + (body ? `<div class="a-dlg-b" id="jcm-cf-b">${body}</div>` : '')
      + '<div class="a-dlg-f"><button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-cf-ok>OK</button></div>',
      { labelledBy: 'jcm-cf-h', alert: true, focus: '[data-cf-ok]', icons: false, describedBy: body ? 'jcm-cf-b' : undefined },
    );
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-close]')) closeModal();
      else if (t.matches('[data-cf-ok]')) onOk();
    });
  }

  // ---- ➕ Add / ✏️ Edit Job Cost (openJobCostModal, main L31470) ----
  function openCostModal(edit: JcmEntry | null): void {
    const today = d.today;
    // The first ➕ Add Cost offers the installer's payout, filled in; after that the app's blank form.
    const prefill = !edit && !s.draftUsed;
    const c: Partial<JcmEntry> = edit ?? (prefill ? d.draft : {});
    const k: JobCostKind = (edit?.kind ?? (prefill ? d.draft.kind : 'receipt'));
    const paid = edit ? edit.paid : prefill ? d.draft.paid : true;
    const kindBtns = JOB_COST_KINDS.map((x) => `<button type="button" class="a-btn a-outline a-btn-sm jcm-kbtn" data-kind="${x.key}" aria-pressed="${x.key === k}">${x.icon} ${x.label}</button>`).join('');
    const opt = (v: string, label: string, sel: boolean) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
    const cats = JOB_COST_CATEGORIES.map((x) => opt(x, x, x === (c.category || kindOf(k).cat))).join('');
    const vendors = opt('', '— None —', !c.vendor) + d.vendors.map((v) => opt(v, v, v === c.vendor)).join('');
    const people = opt('', '— Not linked to a person —', !c.contractorId) + d.people.map((p) => opt(p.id, p.name, p.id === c.contractorId)).join('');
    const sups = opt('', '— Pick from catalog, or just type below —', true) + d.supplies.map((x) => opt(x.id, `${x.name} · ${fmtMoney(x.unitCost)}/${x.uom}`, false)).join('');
    const methods = JOB_COST_METHODS.map((m) => opt(m, m || '—', m === (c.method ?? ''))).join('');
    const amt = c.amount != null ? jobCostAmount({ kind: k, amount: c.amount, quantity: c.quantity, unitCost: c.unitCost }) : 0;
    const title = edit ? `✏️ Edit Job Cost · ${esc(edit.number)}` : '➕ Add Job Cost';
    const box = openModal(
      dlgHead('jcm-jc-h', title)
      + `<div class="a-dlg-b jcm-form">
          ${prefill ? `<div class="a-info" role="note">${esc(d.installer.name)}’s install payout isn’t recorded yet, so it’s filled in. Change it, or pick another kind.</div>` : ''}
          <div class="a-field"><span class="a-flabel" id="jcm-k-l">What kind of cost?</span><div class="jcm-kinds" role="group" aria-labelledby="jcm-k-l">${kindBtns}</div></div>
          <div class="a-row2">
            <div class="a-field"><label for="jcm-f-job">Job / Work Order <span class="a-req" aria-hidden="true">*</span></label><select class="a-select" id="jcm-f-job">${opt(d.wo, `${d.wo} · ${d.customer}`, true)}</select></div>
            <div class="a-field"><label for="jcm-f-date">Date</label><input class="a-input" id="jcm-f-date" type="date" value="${esc(c.date || today)}"></div>
          </div>
          <div class="a-field" data-row="supply"><label for="jcm-f-sup">Supply Item</label><select class="a-select" id="jcm-f-sup">${sups}</select></div>
          <div class="a-field"><label for="jcm-f-desc">Description <span class="a-req" data-desc-req aria-hidden="true">*</span><span class="jcm-opt" data-desc-opt>(optional)</span></label><input class="a-input" id="jcm-f-desc" type="text" value="${esc(c.description ?? '')}" placeholder="What was bought or done" autocomplete="off"></div>
          <div class="a-field" data-row="contractor"><label for="jcm-f-who">Contractor / Installer</label><select class="a-select" id="jcm-f-who">${people}</select></div>
          <div class="a-row2">
            <div class="a-field" data-row="vendor"><label for="jcm-f-vendor">Vendor / Store</label><select class="a-select" id="jcm-f-vendor">${vendors}</select></div>
            <div class="a-field"><label for="jcm-f-cat">Expense Category</label><select class="a-select" id="jcm-f-cat">${cats}</select></div>
          </div>
          <div class="a-row2">
            <div class="a-field"><label for="jcm-f-qty">Qty</label><input class="a-input num" id="jcm-f-qty" type="number" step="0.01" inputmode="decimal" value="${c.quantity != null ? Number(c.quantity) || 1 : 1}"></div>
            <div class="a-field"><label for="jcm-f-unit">Unit Cost</label><input class="a-input num" id="jcm-f-unit" type="number" step="0.01" inputmode="decimal" value="${c.unitCost ? Number(c.unitCost) : ''}" placeholder="0.00"></div>
          </div>
          <div class="a-field"><label for="jcm-f-amt">Total Amount <span class="a-req" aria-hidden="true">*</span></label><input class="a-input num jcm-amtin" id="jcm-f-amt" type="number" step="0.01" inputmode="decimal" value="${amt ? amt.toFixed(2) : ''}" placeholder="0.00" aria-describedby="jcm-f-amt-h"><div class="a-help" id="jcm-f-amt-h">Qty × unit cost fills this in — override it for a receipt that doesn't split neatly.</div></div>
          <label class="jcm-check"><input type="checkbox" id="jcm-f-paid"${paid ? ' checked' : ''}> Already paid</label>
          <div class="jcm-paidrow" data-row="paid">
            <div class="a-field"><label for="jcm-f-pdate">Paid Date</label><input class="a-input" id="jcm-f-pdate" type="date" value="${esc(c.paidDate || c.date || today)}" aria-describedby="jcm-f-pdate-h"><div class="a-help" id="jcm-f-pdate-h">The P&amp;L counts this cost on this date.</div></div>
            <div class="a-field"><label for="jcm-f-method">Method</label><select class="a-select" id="jcm-f-method">${methods}</select></div>
            <div class="a-field" data-row="check"><label for="jcm-f-chk">Check #</label><input class="a-input" id="jcm-f-chk" type="text" value="${esc(c.checkNumber ?? '')}" placeholder="e.g. 1042" autocomplete="off"></div>
          </div>
          <div class="a-field"><label for="jcm-f-notes">Notes</label><textarea class="a-input jcm-notes" id="jcm-f-notes" rows="2" placeholder="Optional">${esc(c.notes ?? '')}</textarea></div>
        </div>`
      + `<div class="a-dlg-f">${edit ? '<button type="button" class="a-btn a-danger jcm-del" data-jc-del>🗑️ Delete</button>' : ''}<button type="button" class="a-btn a-outline" data-close>Cancel</button><button type="button" class="a-btn a-primary" data-jc-save>${edit ? 'Save Changes' : 'Add Cost'}</button></div>`,
      { labelledBy: 'jcm-jc-h', width: 640, focus: edit ? '#jcm-f-desc' : '[data-kind][aria-pressed="true"]' },
    );
    const q = <T extends HTMLElement>(sel: string) => box.querySelector<T>(sel)!;
    const kindIn = { value: k };
    const show = (row: string, on: boolean) => { box.querySelectorAll<HTMLElement>(`[data-row="${row}"]`).forEach((r) => { r.hidden = !on; }); };
    // jcSetKind (main L31515): the kind decides which fields matter; nothing typed is thrown away.
    const setKind = (kind: JobCostKind, initial: boolean) => {
      kindIn.value = kind;
      box.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
      show('supply', kind === 'supply');
      show('contractor', kind === 'contractor');
      show('vendor', kind !== 'contractor');
      q('[data-desc-req]').hidden = kind === 'contractor';
      q('[data-desc-opt]').hidden = kind !== 'contractor';
      if (!initial) q<HTMLSelectElement>('#jcm-f-cat').value = kindOf(kind).cat;
    };
    const togglePaid = () => {
      const on = q<HTMLInputElement>('#jcm-f-paid').checked;
      show('paid', on);
      show('check', on && q<HTMLSelectElement>('#jcm-f-method').value === 'Check');
    };
    const recalc = () => {
      const qty = Number(q<HTMLInputElement>('#jcm-f-qty').value) || 0;
      const unit = Number(q<HTMLInputElement>('#jcm-f-unit').value) || 0;
      if (qty * unit > 0) q<HTMLInputElement>('#jcm-f-amt').value = round2(qty * unit).toFixed(2);
    };
    setKind(k, true);
    togglePaid();
    q('#jcm-f-qty').addEventListener('input', recalc);
    q('#jcm-f-unit').addEventListener('input', recalc);
    q('#jcm-f-paid').addEventListener('change', togglePaid);
    q('#jcm-f-method').addEventListener('change', togglePaid);
    q<HTMLSelectElement>('#jcm-f-sup').addEventListener('change', (e) => {
      // jcPickSupply: fills an empty description and the unit cost.
      const sup = d.supplies.find((x) => x.id === (e.target as HTMLSelectElement).value);
      if (!sup) return;
      const desc = q<HTMLInputElement>('#jcm-f-desc');
      if (!desc.value.trim()) desc.value = sup.name;
      q<HTMLInputElement>('#jcm-f-unit').value = String(sup.unitCost);
      recalc();
    });
    const kinds = Array.from(box.querySelectorAll<HTMLButtonElement>('[data-kind]'));
    q('.jcm-kinds').addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
      const i = kinds.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0) return;
      e.preventDefault();
      kinds[(i + (key === 'ArrowRight' ? 1 : kinds.length - 1)) % kinds.length]!.focus();
    });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.matches('[data-kind]')) { setKind(t.dataset.kind as JobCostKind, false); return; }
      if (t.matches('[data-close]')) { closeModal(); return; }
      if (t.matches('[data-jc-del]') && edit) { askDelete(edit); return; }
      if (!t.matches('[data-jc-save]')) return;
      // saveJobCost (main L31557)
      const kind = kindIn.value as JobCostKind;
      const descIn = q<HTMLInputElement>('#jcm-f-desc');
      const amtIn = q<HTMLInputElement>('#jcm-f-amt');
      const amount = Number(amtIn.value) || 0;
      const refusal = jobCostRefusal(descIn.value, kind, amount);
      if (refusal) { toast(refusal, 'error'); announce(refusal); (refusal === JOB_COST_NEED_DESC ? descIn : amtIn).focus(); return; }
      const person = d.people.find((p) => p.id === q<HTMLSelectElement>('#jcm-f-who').value);
      const isPaid = q<HTMLInputElement>('#jcm-f-paid').checked;
      const costDate = (q<HTMLInputElement>('#jcm-f-date').value || today) as ISODate;
      const method = isPaid ? q<HTMLSelectElement>('#jcm-f-method').value : '';
      const rec: Omit<JcmEntry, 'id' | 'number'> = {
        kind,
        description: jobCostDescription(descIn.value, kind, person?.name ?? ''),
        category: q<HTMLSelectElement>('#jcm-f-cat').value || kindOf(kind).cat,
        vendor: kind === 'contractor' ? '' : q<HTMLSelectElement>('#jcm-f-vendor').value.trim(),
        contractorId: kind === 'contractor' && person ? person.id : '',
        contractorName: kind === 'contractor' && person ? person.name : '',
        date: costDate,
        quantity: Number(q<HTMLInputElement>('#jcm-f-qty').value) || 1,
        unitCost: Number(q<HTMLInputElement>('#jcm-f-unit').value) || 0,
        amount: round2(amount),
        paid: isPaid,
        paidDate: isPaid ? ((q<HTMLInputElement>('#jcm-f-pdate').value || costDate) as ISODate) : null,
        method,
        checkNumber: isPaid && method === 'Check' ? q<HTMLInputElement>('#jcm-f-chk').value.trim() : '',
        notes: q<HTMLTextAreaElement>('#jcm-f-notes').value.trim(),
      };
      const before = jcmFinance(d, s);
      let msg: string;
      if (edit) {
        const x = s.entries.find((y) => y.id === edit.id);
        if (x) Object.assign(x, rec);
        msg = JOB_COST_UPDATED;
      } else {
        const number = nextJobCostNumber(s.entries.map((y) => y.number));
        s.entries.push({ id: number.toLowerCase(), number, ...rec });
        if (prefill) s.draftUsed = true;
        msg = jobCostAddedToast(kind, rec.amount);
      }
      render(before);
      closeModal(true, edit ? null : addBtn);
      const after = jcmFinance(d, s);
      toast(msg);
      announce(`${msg}. ${jcmSummary(after)}`);
      if (!task.classList.contains('is-done') && !edit) {
        const a = before.margin.toFixed(1), b = after.margin.toFixed(1);
        task.classList.add('is-done');
        task.textContent = a === b ? `Done: cost added; margin holds at ${b}%.` : `Done: margin moved from ${a}% to ${b}% before commission.`;
      }
    });
  }

  function askDelete(x: JcmEntry): void {
    // deleteJobCost (main L31600): the app's confirm().
    confirmBox(jobCostDeleteConfirm(x), () => {
      const before = jcmFinance(d, s);
      s.entries = s.entries.filter((y) => y.id !== x.id);
      render(before);
      closeModal(true, addBtn);
      toast(JOB_COST_DELETED);
      announce(`${JOB_COST_DELETED}. ${jcmSummary(jcmFinance(d, s))}`);
    });
  }

  // ---- 💰 Mark Paid (jcMarkGroupPaid, main L29577) ----
  function markPaid(): void {
    const f = jcmFinance(d, s);
    const owed = commissionOwed(f.commission, [{ commissionPaidAt: null, repRates: [d.rep.rate] }]);
    const step = markGroupPaid([{ number: d.wo, status: s.status }], owed);
    if (!step.ok) { toast(step.toast, step.toastKind); announce(step.toast); return; }
    confirmBox(step.confirm!, () => {
      s.status = step.to;
      render(null);
      closeModal(true, root.querySelector<HTMLElement>('[data-jcm-subline]'));
      toast(step.toast);
      announce(`${step.toast}. Status: ${WO_LABELS[s.status]}.`);
    });
  }

  actions.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-jcm-markpaid]')) markPaid(); });
  addBtn.addEventListener('click', () => openCostModal(null));

  rows.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const ed = t.closest<HTMLButtonElement>('[data-jcm-edit]');
    if (ed) { const x = s.entries.find((y) => y.id === ed.dataset.jcmEdit); if (x) openCostModal(x); return; }
    const b = t.closest<HTMLButtonElement>('[data-jcm-paid]');
    if (!b) return;
    // toggleJobCostPaid (main L31610): paid / unpaid moves the unpaid total, not the cost.
    const x = s.entries.find((y) => y.id === b.dataset.jcmPaid);
    if (!x) return;
    x.paid = !x.paid;
    if (x.paid && !x.paidDate) x.paidDate = x.date || d.today;
    const id = x.id;
    render(null);
    rows.querySelector<HTMLButtonElement>(`[data-jcm-paid="${CSS.escape(id)}"]`)?.focus();
    announce(`${x.number} marked ${x.paid ? 'paid' : 'unpaid'}. ${fmtMoney(jcmFinance(d, s).costs.unpaid)} unpaid.`);
  });

  profit.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-jcm-signoff]')) return;
    // toggleCommissionReadyGroup (main L29618)
    const ready = !s.signedOffAt;
    if (ready && !commissionSignOffAllowed(s.status)) return;
    s.signedOffAt = ready ? d.today : null;
    render(null);
    profit.querySelector<HTMLElement>('[data-jcm-signoff]')?.focus();
    const msg = commissionSignOffToast(d.wo, ready);
    toast(msg);
    announce(`${msg}. ${commissionSignOffText(s.signedOffAt, s.status)}.`);
  });

  function setPrivacy(on: boolean, withToast: boolean): void {
    // togglePrivacyMode (main L3592): blur, not remove; the eye becomes sunglasses.
    s.privacy = on;
    app.dataset.privacy = on ? 'on' : 'off';
    privBtn.setAttribute('aria-pressed', String(on));
    privBtn.innerHTML = iconSvg(on ? 'sunglasses' : 'eye');
    if (withToast) {
      const msg = on ? '🕶️ Privacy mode on — cost & margin hidden' : '👁 Privacy mode off — internal data visible';
      toast(msg, 'info');
      announce(on ? 'Privacy mode on — margin and profit hidden.' : 'Privacy mode off — internal data visible.');
    }
  }
  privBtn.addEventListener('click', () => { setPrivacy(!s.privacy, true); render(null); });

  reset.addEventListener('click', () => {
    closeModal(false);
    s = jcmInitialState(d);
    setPrivacy(false, false);
    task.classList.remove('is-done');
    task.textContent = taskText;
    render(null);
    announce(`Started over. ${jcmSummary(jcmFinance(d, s))}`);
    addBtn.focus();
  });

  privBtn.title = PRIVACY_MODE.tooltip;
  setPrivacy(false, false);
  render(null);
  root.classList.add('is-live');
}
