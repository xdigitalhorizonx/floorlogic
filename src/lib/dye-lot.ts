// Easter egg "DYE LOT" — every roll of carpet carries a dye lot, and rolls from different lots
// never quite match. Type DYELOT, enter the Konami code, or tap the logo mark 5 times and the
// whole site's blues switch to another lot. Instant (no motion), session only, AA-checked.

const LOTS = [
  { id: '4471-A', vars: {} as Record<string, string> },
  { id: '4471-B', vars: { '--blue': '#3550c4', '--blue-hover': '#2a41a3', '--blue-ink': '#2f48b8', '--dot': '#4a63e0', '--ice-50': '#f6f7fe', '--ice-100': '#eef0fd', '--ice-200': '#e3e6fa', '--ice-300': '#d6dbf6', '--glow': '#d9ddf8', '--navy-700': '#26408f' } },
  { id: '4471-C', vars: { '--blue': '#0b6f8f', '--blue-hover': '#095a74', '--blue-ink': '#0a6582', '--dot': '#0e86ab', '--ice-50': '#f5fafb', '--ice-100': '#eaf5f8', '--ice-200': '#dbedf2', '--ice-300': '#cbe5ec', '--glow': '#d2e9ef', '--navy-700': '#0f5870' } },
];
const SEQ_KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

let lot = 0;

function apply(i: number) {
  lot = i % LOTS.length;
  const root = document.documentElement;
  for (const l of LOTS) for (const k of Object.keys(l.vars)) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(LOTS[lot].vars)) root.style.setProperty(k, v);
  try { sessionStorage.setItem('fl-dye-lot', String(lot)); } catch { /* fine */ }
}

function toast(msg: string) {
  let el = document.getElementById('dye-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dye-toast';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:90;background:#02315b;color:#fff;padding:12px 18px;border-radius:10px;font:600 15px/1.35 var(--font-body);box-shadow:0 12px 30px -10px rgba(2,49,91,.5);max-width:min(92vw,460px);text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout((el as HTMLElement & { _t?: number })._t);
  (el as HTMLElement & { _t?: number })._t = window.setTimeout(() => { el!.hidden = true; }, 4200);
}

function next() {
  apply(lot + 1);
  toast(lot === 0
    ? `Back to dye lot ${LOTS[0].id}. Matches the rest of the job.`
    : `Dye lot ${LOTS[lot].id}. Colors may vary slightly between rolls.`);
}

export function initDyeLot() {
  try { const s = Number(sessionStorage.getItem('fl-dye-lot') || 0); if (s) apply(s); } catch { /* fine */ }
  let typed = '';
  let k = 0;
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    k = e.key === SEQ_KONAMI[k] || e.key.toLowerCase() === SEQ_KONAMI[k] ? k + 1 : (e.key === SEQ_KONAMI[0] ? 1 : 0);
    if (k === SEQ_KONAMI.length) { k = 0; next(); return; }
    if (e.key.length === 1) {
      typed = (typed + e.key.toUpperCase()).slice(-6);
      if (typed === 'DYELOT') { typed = ''; next(); }
    }
  });
  let taps = 0;
  let last = 0;
  document.querySelectorAll<HTMLElement>('[data-dye-tap]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const now = Date.now();
      taps = now - last < 600 ? taps + 1 : 1;
      last = now;
      if (taps >= 5) { e.preventDefault(); taps = 0; next(); }
    });
  });
  console.log('%cFloorLogic%c  Every roll has a dye lot. Type DYELOT to see ours.', 'font:800 14px sans-serif;color:#02315b', 'font:500 12px sans-serif;color:#5b6270');
}
