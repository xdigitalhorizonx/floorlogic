/**
 * Job-costing module ("Know the profit"): WO-330's Job Costing page (main
 * L26482-26560) — estimate vs actual by bucket, recorded costs, billing, and
 * the profit box Privacy Mode blurs (main L2989-2992, toggle L23978).
 *
 * Every figure comes from job-costing.ts: `jobFinance` (the app's
 * `_jobFinance`), `varianceView` / `bucketDelta` for the variance cells,
 * `JOB_COST_KINDS`, `CARD_FEE`, `PRIVACY_MODE`. The story is set the day the
 * balance cleared: materials, freight and supplies are recorded, the installer
 * isn't paid yet, so Labor still counts the quoted figure. Adding a cost
 * re-runs `jobFinance` and the numbers move.
 * Fictional sample data; nothing is saved or sent anywhere.
 */
import gsap from 'gsap';
import {
  jobFinance, varianceView, bucketDelta, JOB_COST_KINDS, CARD_FEE, PRIVACY_MODE, JOB_STATUS_COLOR_NAMES, WO_LABELS,
  fmtMoney, fmtDate, round2,
} from '../lib/logic';
import type { JobFinance, JobCostEntry, JobCostKind, CostLine, Payment, ISODate, WoStatus } from '../lib/logic';

export interface JcmEntry extends JobCostEntry {
  number: string;
  kind: JobCostKind;
  date: ISODate;
  /** Contractor or vendor — the "Who / Where" column. */
  who: string;
  method?: string;
}
export interface JcmData {
  wo: string;
  customer: string;
  /** The job's address line (sample leads carry a city only). */
  site: string;
  status: WoStatus;
  /** The page's "today": the day IN-330 was paid in full. */
  today: ISODate;
  rep: { name: string; rate: number };
  installer: string;
  materials: CostLine[];
  labors: CostLine[];
  invoice: { number: string; subtotal: number; tax: number; total: number; status: string; payments: Payment[] };
  pos: Array<{ number: string; productName: string; totalCost: number; status: string }>;
  entries: JcmEntry[];
  /** The cost still to be entered — pre-filled in the form. */
  draft: { kind: JobCostKind; description: string; amount: number };
  nextNumber: number;
}
export interface JcmState { entries: JcmEntry[]; nextNumber: number; privacy: boolean; added: number }

export function jcmInitialState(d: JcmData): JcmState {
  return { entries: d.entries.map((e) => ({ ...e })), nextNumber: d.nextNumber, privacy: false, added: 0 };
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function jcmFinance(d: JcmData, s: JcmState): JobFinance {
  return jobFinance({
    materials: d.materials,
    labors: d.labors,
    invoices: [{ subtotal: d.invoice.subtotal, tax: d.invoice.tax, total: d.invoice.total, payments: d.invoice.payments, status: d.invoice.status }],
    pos: d.pos.map((p) => ({ status: p.status, totalCost: p.totalCost })),
    costs: s.entries,
    reps: [d.rep],
  });
}

const kindOf = (k: JobCostKind) => JOB_COST_KINDS.find((x) => x.key === k) ?? JOB_COST_KINDS[JOB_COST_KINDS.length - 1]!;
const TONE: Record<string, string> = { danger: 'jcm-red', success: 'jcm-green', gray: 'jcm-gray' };
export const marginText = (f: JobFinance): string => `${f.margin.toFixed(1)}% margin`;
const varText = (v: number): string => (v > 0 ? '+' : '') + fmtMoney(Math.abs(v));

/** `_acctStatCard` (main L24936). */
function statCard(label: string, value: string, sub: string, color: string, key: string, extra = ''): string {
  return `<div class="jcm-stat ${color}"${extra}><div class="jcm-stat-v num" data-jcm-num="${key}">${value}</div><div class="jcm-stat-l">${label}</div><div class="jcm-stat-s">${sub}</div></div>`;
}

export function renderJcmStats(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  const v = varianceView(f.actual, f.estimate);
  const n = s.entries.length;
  return statCard('Estimated Cost', fmtMoney(f.estimate), 'quoted materials + labor', 'is-blue', 'estimate')
    + statCard('Actual Cost', fmtMoney(f.actual), `${n} recorded cost${n === 1 ? '' : 's'}`, '', 'actual')
    + statCard('Variance', v.text, v.label, v.tone === 'red' ? 'is-red' : 'is-green', 'variance')
    + `<div class="jcm-stat ${f.profit >= 0 ? 'is-green' : 'is-red'}"><div class="jcm-stat-v num is-private" data-jcm-num="profit">${fmtMoney(f.profit)}</div><div class="jcm-stat-l">Profit</div><div class="jcm-stat-s is-private" data-jcm-num="margin">${marginText(f)}</div></div>`
    + statCard('Sales Tax', fmtMoney(f.tax), f.taxSource === 'invoice' ? 'invoiced — held for the state' : 'quoted on the work order', 'is-amber', 'tax');
}

/** Estimate vs Actual rows (main L26494-26527). */
export function renderJcmBuckets(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  const row = (label: string, est: number | null, act: number, note: string, key: string): string => {
    const dl = bucketDelta(est, act);
    return `<tr data-bucket="${key}"${note ? ' class="has-note"' : ''}><th scope="row">${label}${note ? `<span class="jcm-note">${esc(note)}</span>` : ''}</th>`
      + `<td class="num jcm-est">${est == null ? '—' : fmtMoney(est)}</td><td class="num jcm-act">${fmtMoney(act)}</td><td class="num ${TONE[dl.tone]}">${dl.text}</td></tr>`
      + (note ? `<tr class="jcm-noterow" aria-hidden="true"><td colspan="4">${esc(note)}</td></tr>` : '');
  };
  const poCount = d.pos.filter((p) => p.status !== 'cancelled').length;
  const matNote = f.matActual
    ? [poCount ? `${poCount} PO${poCount === 1 ? '' : 's'} ${fmtMoney(f.poCost)}` : '', f.costs.material ? `${fmtMoney(f.costs.material)} in receipts` : ''].filter(Boolean).join(' + ')
    : 'nothing recorded yet — showing quoted';
  const feeNote = `${CARD_FEE.pct}% + ${fmtMoney(CARD_FEE.fixed)} on card payments`;
  const fee = f.feeCost > 0.005
    ? `<tr data-bucket="fees" class="has-note" title="What the card processor kept — ${feeNote}"><th scope="row">💳 Card processing<span class="jcm-note">${feeNote}</span></th><td class="num jcm-est">—</td><td class="num jcm-act">${fmtMoney(f.feeCost)}</td><td class="num jcm-gray">—</td></tr>`
      + `<tr class="jcm-noterow" aria-hidden="true"><td colspan="4">${feeNote}</td></tr>`
    : '';
  const tot = bucketDelta(f.estimate, f.actual);
  const totTone = varianceView(f.actual, f.estimate).tone === 'red' ? 'jcm-red' : 'jcm-green';
  return row('🧱 Materials', f.matQuoted, f.matCost, matNote, 'material')
    + row('🔨 Labor', f.laborQuoted, f.laborCost, f.laborActual ? 'contractor payments recorded' : 'nothing recorded yet — showing quoted', 'labor')
    + row('🔩 Supplies &amp; other', null, f.otherCost, 'never estimated on the work order', 'other')
    + fee
    + `<tr class="jcm-total"><th scope="row">Total Cost</th><td class="num jcm-est">${fmtMoney(f.estimate)}</td><td class="num jcm-act">${fmtMoney(f.actual)}</td><td class="num ${totTone}">${tot.text}</td></tr>`;
}

/**
 * Profit box (main L26529-26541), blurred by Privacy Mode. The app also lists
 * "− Card processing" here although "− Cost" already includes it (`_jcActual`
 * adds feeCost), so its rows don't add up; the site lists the fee once — in
 * the bucket table — and the rows below sum exactly to Job Profit.
 */
export function renderJcmProfit(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  const src = f.revSource === 'invoice' ? '(invoiced)' : '(quoted)';
  return `<div class="jcm-pl"><span>Revenue ${src}</span><span class="num">${fmtMoney(f.revenue)}</span></div>`
    + `<div class="jcm-pl" title="Collected for the state, not earned by the job — it is never part of revenue, profit or a commission basis"><span>Sales tax ${f.taxSource === 'invoice' ? '(invoiced)' : '(quoted)'} <small>not revenue</small></span><span class="num">${fmtMoney(f.tax)}</span></div>`
    + `<div class="jcm-pl" title="Materials, labor, supplies and card processing"><span>− Cost</span><span class="num">${fmtMoney(f.actual)}</span></div>`
    + `<div class="jcm-pl"><span>− Commission${f.reps.length ? ` <small>· ${f.reps.map((r) => esc(r.name)).join(', ')}</small>` : ''}</span><span class="num">${fmtMoney(f.commission)}</span></div>`
    + `<div class="jcm-pl jcm-profit ${f.profit >= 0 ? 'jcm-green' : 'jcm-red'}"><span>Job Profit</span><span class="num"><b data-jcm-profit>${fmtMoney(f.profit)}</b> <small>(${f.margin.toFixed(1)}%)</small></span></div>`;
}

export function renderJcmBilling(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  return `<div class="jcm-pl"><span>Invoiced (with tax)</span><span class="num">${fmtMoney(f.invTotal)}</span></div>`
    + `<div class="jcm-pl"><span>Collected</span><span class="num jcm-green">${fmtMoney(f.collected)}</span></div>`
    + `<div class="jcm-pl jcm-out"><span>Outstanding</span><span class="num ${f.outstanding > 0.005 ? 'jcm-red' : 'jcm-green'}">${fmtMoney(f.outstanding)}</span></div>`;
}

export function renderJcmCostsHead(d: JcmData, s: JcmState): string {
  const f = jcmFinance(d, s);
  return `${fmtMoney(f.costs.total)} total · <span class="${f.costs.unpaid > 0.005 ? 'jcm-warn' : ''}">${fmtMoney(f.costs.unpaid)} unpaid</span>`;
}

/** Recorded Costs rows (main L26547-26556), newest first. */
export function renderJcmRows(s: JcmState): string {
  const rows = s.entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  if (!rows.length) return '<tr><td colspan="5" class="jcm-empty">Nothing recorded yet</td></tr>';
  return rows.map((x) => {
    const k = kindOf(x.kind);
    const qty = Number(x.quantity) || 1;
    // The kind, then the category when it differs from the kind's own, then qty × unit (main L26551).
    const sub = [esc(k.label), x.category && x.category !== k.cat ? esc(x.category) : '', qty !== 1 ? `${qty} × ${fmtMoney(x.unitCost ?? 0)}` : ''].filter(Boolean).join(' · ');
    const paidTitle = x.paid ? `Paid${x.method ? ` by ${x.method}` : ''} — click to mark unpaid` : 'Not paid — click to mark paid';
    return `<tr data-jc="${esc(x.number)}"><td class="jcm-date">${fmtDate(x.date)}<span class="jcm-mono">${esc(x.number)}</span></td>`
      + `<td><span class="jcm-cost"><span aria-hidden="true">${k.icon}</span> ${esc(x.description)}</span><span class="jcm-ksub">${sub}</span>${x.who ? `<span class="jcm-whosub" aria-hidden="true">${esc(x.who)}</span>` : ''}<span class="jcm-datesub" aria-hidden="true">${fmtDate(x.date)} · ${esc(x.number)}</span></td>`
      + `<td class="jcm-who">${esc(x.who || '—')}</td><td class="num jcm-amt">${fmtMoney(x.amount ?? 0)}</td>`
      + `<td class="jcm-paidc"><button type="button" class="jcm-paid${x.paid ? ' is-paid' : ''}" data-jcm-paid="${esc(x.number)}" aria-pressed="${x.paid ? 'true' : 'false'}" title="${paidTitle}"><span aria-hidden="true">✅</span><span class="sr-only">Paid: ${esc(x.number)}</span></button></td></tr>`;
  }).join('');
}

export function jcmStatusPill(status: WoStatus): string {
  return `<span class="a-pill a-${JOB_STATUS_COLOR_NAMES[status]}">${WO_LABELS[status]}</span>`;
}

/** One sentence for screen readers after a change. */
export function jcmSummary(f: JobFinance): string {
  const v = varianceView(f.actual, f.estimate);
  return `Actual cost ${fmtMoney(f.actual)}, ${v.text} ${v.label}. Job profit ${fmtMoney(f.profit)}, ${marginText(f)}.`;
}

// ----------------------------------------------------------- the island --

type ToastType = 'success' | 'info' | 'warning' | 'error';
const TOAST_ICON: Record<ToastType, string> = { success: '✅', info: 'ℹ️', warning: '⚠️', error: '❌' };

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
  const stats = $('[data-jcm-stats]');
  const buckets = $('[data-jcm-buckets]');
  const profit = $('[data-jcm-profitbox]');
  const billing = $('[data-jcm-billing]');
  const costsHead = $('[data-jcm-costshead]');
  const rows = $('[data-jcm-rows]');
  const form = $<HTMLFormElement>('[data-jcm-form]');
  const desc = $<HTMLInputElement>('[data-jcm-desc]');
  const amount = $<HTMLInputElement>('[data-jcm-amount]');
  const privBtn = $<HTMLButtonElement>('[data-jcm-priv]');
  const addBtn = $<HTMLButtonElement>('[data-jcm-addcost]');
  const hint = $('[data-jcm-hint]');
  const toastEl = $('[data-jcm-toast]');
  const live = $('[data-jcm-live]');
  const task = $('[data-task]');
  const reset = $<HTMLButtonElement>('[data-jcm-reset]');
  const taskText = task.textContent || '';

  type Count = (el: Element, from: number, to: number, fmt: (n: number) => string, final: string) => void;
  const fx: { pop: (el: Element) => void; count: Count } = {
    pop: () => {},
    count: (el, _f, _t, _fmt, final) => { el.textContent = final; },
  };
  gsap.matchMedia().add({ motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const { motion } = ctx.conditions as { motion: boolean };
    if (!motion) {
      fx.pop = () => {};
      fx.count = (el, _f, _t, _fmt, final) => { el.textContent = final; };
      return;
    }
    fx.pop = (el) => { gsap.fromTo(el, { scale: 0.94 }, { scale: 1, duration: 0.4, ease: 'back.out(2.2)', clearProps: 'transform' }); };
    fx.count = (el, from, to, fmt, final) => {
      if (Math.abs(to - from) < 0.005) { el.textContent = final; return; }
      const o = { v: from };
      el.textContent = fmt(from);
      gsap.to(o, { v: to, duration: 0.8, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(o.v); }, onComplete: () => { el.textContent = final; } });
    };
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

  function render(prev: JobFinance | null): void {
    const f = jcmFinance(d, s);
    stats.innerHTML = renderJcmStats(d, s);
    buckets.innerHTML = renderJcmBuckets(d, s);
    profit.innerHTML = renderJcmProfit(d, s);
    billing.innerHTML = renderJcmBilling(d, s);
    costsHead.innerHTML = renderJcmCostsHead(d, s);
    rows.innerHTML = renderJcmRows(s);
    profit.classList.toggle('is-loss', f.profit < 0);
    hint.hidden = s.added > 0 || !d.draft.description;
    if (prev) {
      const num = (k: string) => stats.querySelector(`[data-jcm-num="${k}"]`)!;
      fx.count(num('actual'), prev.actual, f.actual, fmtMoney, fmtMoney(f.actual));
      fx.count(num('variance'), prev.variance, f.variance, varText, varianceView(f.actual, f.estimate).text);
      fx.count(num('profit'), prev.profit, f.profit, fmtMoney, fmtMoney(f.profit));
      fx.count(num('margin'), prev.margin, f.margin, (n) => `${n.toFixed(1)}% margin`, marginText(f));
    }
    reset.hidden = !s.added && !s.privacy && s.entries.every((e, i) => e.paid === d.entries[i]?.paid);
  }

  function setKind(kind: JobCostKind): void {
    const r = form.querySelector<HTMLInputElement>(`input[name="jcm-kind"][value="${kind}"]`);
    if (r) r.checked = true;
  }
  function fillDraft(): void {
    setKind(d.draft.kind);
    desc.value = d.draft.description;
    amount.value = d.draft.amount ? d.draft.amount.toFixed(2) : '';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // saveJobCost (main L26112-26158)
    const kind = (form.querySelector<HTMLInputElement>('input[name="jcm-kind"]:checked')?.value ?? 'receipt') as JobCostKind;
    const text = desc.value.trim();
    const amt = Number(amount.value) || 0;
    if (!text) { toast('Describe what this cost was for', 'error'); desc.focus(); return; }
    if (!(amt > 0)) { toast('Enter an amount greater than zero', 'error'); amount.focus(); return; }
    const before = jcmFinance(d, s);
    const k = kindOf(kind);
    s.entries.push({
      number: `JC-${String(s.nextNumber).padStart(3, '0')}`, kind, category: k.cat, description: text, amount: round2(amt),
      paid: true, status: 'active', date: d.today, who: kind === 'contractor' ? d.installer : '',
    });
    s.nextNumber += 1;
    s.added += 1;
    render(before);
    const after = jcmFinance(d, s);
    toast(`${k.label} added · ${fmtMoney(round2(amt))}`);
    announce(jcmSummary(after));
    // The app's ➕ Add Cost opens on Receipt / purchase with empty fields.
    setKind('receipt');
    desc.value = '';
    amount.value = '';
    if (!task.classList.contains('is-done')) {
      const a = before.margin.toFixed(1), b = after.margin.toFixed(1);
      task.classList.add('is-done');
      task.textContent = a === b ? `Done: cost added; margin holds at ${b}%.` : `Done: margin moved from ${a}% to ${b}%.`;
      fx.pop(task);
    }
  });

  rows.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-jcm-paid]');
    if (!b) return;
    // toggleJobCostPaid (main L26166): paid/unpaid moves the unpaid total, not the cost.
    const x = s.entries.find((y) => y.number === b.dataset.jcmPaid);
    if (!x) return;
    x.paid = !x.paid;
    const id = x.number;
    render(null);
    rows.querySelector<HTMLButtonElement>(`[data-jcm-paid="${CSS.escape(id)}"]`)?.focus();
    announce(`${id} marked ${x.paid ? 'paid' : 'unpaid'}. ${fmtMoney(jcmFinance(d, s).costs.unpaid)} unpaid.`);
  });

  privBtn.addEventListener('click', () => {
    // togglePrivacyMode (main L23978): blur, not remove.
    s.privacy = !s.privacy;
    if (s.privacy) app.dataset.privacy = 'on'; else delete app.dataset.privacy;
    privBtn.setAttribute('aria-pressed', String(s.privacy));
    privBtn.classList.toggle('is-on', s.privacy);
    privBtn.querySelector('[data-jcm-privicon]')!.textContent = s.privacy ? '🕶️' : '👁';
    toast(s.privacy ? '🕶️ Privacy mode on — cost & margin hidden' : '👁 Privacy mode off — internal data visible', 'info');
    render(null);
  });

  addBtn.addEventListener('click', () => {
    desc.focus();
    desc.scrollIntoView({ block: 'nearest' });
  });

  reset.addEventListener('click', () => {
    s = jcmInitialState(d);
    delete app.dataset.privacy;
    privBtn.setAttribute('aria-pressed', 'false');
    privBtn.classList.remove('is-on');
    privBtn.querySelector('[data-jcm-privicon]')!.textContent = '👁';
    task.classList.remove('is-done');
    task.textContent = taskText;
    fillDraft();
    render(null);
    announce(`Started over. ${jcmSummary(jcmFinance(d, s))}`);
    desc.focus();
  });

  privBtn.title = PRIVACY_MODE.tooltip;
  render(null);
}
