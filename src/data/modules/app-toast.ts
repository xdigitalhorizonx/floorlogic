/**
 * The app's showToast (white card, coloured 4px edge, icon, top-right, ~3 s) for the try-it modules.
 *
 * A toast normally sits in its frame's sticky dock (.a-tdock). While one of the module's modal
 * <dialog>s is open the page behind it is inert and covered by the backdrop, so a toast raised
 * then — a refusal like "Enter valid amount" — is lifted into the top layer instead (a manual
 * popover shown after the dialog), the way the app's toasts sit above its modals.
 */
export type AppToastType = 'success' | 'info' | 'warning' | 'error';

const ICON: Record<AppToastType, string> = { success: '✅', info: 'ℹ️', warning: '⚠️', error: '❌' };
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type PopoverEl = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

export function appToaster(el: HTMLElement, dlg: HTMLDialogElement | null, ms = 3200): (msg: string, type?: AppToastType) => void {
  const pe = el as PopoverEl;
  const canLift = typeof pe.showPopover === 'function';
  let timer = 0;
  let lowerTimer = 0;
  const lower = () => {
    if (!el.hasAttribute('popover')) return;
    try { pe.hidePopover?.(); } catch { /* already closed */ }
    el.removeAttribute('popover');
  };
  return (msg, type = 'success') => {
    window.clearTimeout(timer);
    window.clearTimeout(lowerTimer);
    el.classList.remove('is-on');
    lower();
    el.dataset.type = type;
    el.innerHTML = `<span class="a-toast-ic" aria-hidden="true">${ICON[type]}</span><span>${esc(msg)}</span>`;
    if (canLift && dlg?.open) {
      el.setAttribute('popover', 'manual');
      try { pe.showPopover!(); } catch { el.removeAttribute('popover'); }
    }
    void el.offsetWidth;
    el.classList.add('is-on');
    timer = window.setTimeout(() => {
      el.classList.remove('is-on');
      // Back to the dock once it has faded.
      lowerTimer = window.setTimeout(lower, 320);
    }, ms);
  };
}
