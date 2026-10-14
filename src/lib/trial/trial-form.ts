import { submitTrial, type TrialPayload } from './submit-trial';
import { track } from '../analytics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KEY = 'fl-trial-email';
const OFFICE = { phone: '(775) 237-8898', tel: 'tel:+17752378898', email: 'brandon@digitalhorizon.dev' };

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function remember(email: string) {
  try { sessionStorage.setItem(KEY, email); } catch { /* storage blocked — fine */ }
}
function recall(): string {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}

function showError(el: HTMLElement | null, input: HTMLInputElement | null, msg: string) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

export function initTrialForms() {
  // Masthead mini form: validate, remember the email for this tab, go to /start.
  document.querySelectorAll<HTMLFormElement>('[data-mast-trial]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector<HTMLInputElement>('input[type=email]')!;
      const v = input.value.trim();
      if (!EMAIL_RE.test(v)) { input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      remember(v);
      track('trial_intent', { step: 1, source: 'masthead' });
      location.href = '/start#signup';
    });
  });

  document.querySelectorAll<HTMLFormElement>('form[data-trial]').forEach((form) => {
    const source = form.dataset.source || 'site';
    const email = form.querySelector<HTMLInputElement>('input[type=email]')!;
    const err1 = form.querySelector<HTMLElement>('[data-err]');
    const step2 = form.querySelector<HTMLFieldSetElement>('.tc-step2')!;
    const err2 = form.querySelector<HTMLElement>('[data-err2]');
    const result = form.querySelector<HTMLElement>('[data-result]')!;
    let stage: 1 | 2 | 3 = 1;

    const openStep2 = (focus = true) => {
      stage = 2;
      step2.hidden = false;
      if (focus) form.querySelector<HTMLInputElement>('[name=company_name]')?.focus();
    };

    // /start: carry the email over from the masthead and jump straight to step 2.
    if (form.dataset.prefill !== undefined || source.startsWith('start')) {
      const saved = recall();
      if (saved && !email.value) { email.value = saved; openStep2(false); }
    }

    email.addEventListener('input', () => { if (email.getAttribute('aria-invalid') === 'true') showError(err1, email, ''); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = email.value.trim();
      if (!EMAIL_RE.test(v)) {
        showError(err1, email, v ? 'That email doesn’t look right. Check it and try again.' : 'Enter your work email to start.');
        email.focus();
        return;
      }
      showError(err1, email, '');
      remember(v);
      if (stage === 1) { track('trial_intent', { step: 1, source }); openStep2(); return; }
      if (stage === 3) return;

      const fd = new FormData(form);
      const company = String(fd.get('company_name') || '').trim();
      const name = String(fd.get('full_name') || '').trim();
      const companyEl = form.querySelector<HTMLInputElement>('[name=company_name]')!;
      const nameEl = form.querySelector<HTMLInputElement>('[name=full_name]')!;
      companyEl.setAttribute('aria-invalid', company ? 'false' : 'true');
      nameEl.setAttribute('aria-invalid', name ? 'false' : 'true');
      if (!company || !name) {
        showError(err2, null, 'Add your company name and your name.');
        (company ? nameEl : companyEl).focus();
        return;
      }
      showError(err2, null, '');

      const payload: TrialPayload = {
        email: v.toLowerCase(),
        company_name: company,
        full_name: name,
        phone: String(fd.get('phone') || '').trim() || undefined,
        crew_size: String(fd.get('crew_size') || '') || undefined,
        current_tool: String(fd.get('current_tool') || '') || undefined,
        source,
      };
      const btn = form.querySelector<HTMLButtonElement>('.tc-go')!;
      btn.disabled = true;
      btn.textContent = 'One moment…';
      const res = await submitTrial(payload);
      track('trial_intent', { step: 2, source, state: res.state });
      stage = 3;
      step2.hidden = true;
      form.querySelector<HTMLElement>('.tc-step1')!.hidden = true;

      if (res.state === 'not-open') {
        const lines = [
          `Company: ${payload.company_name}`,
          `Name: ${payload.full_name}`,
          `Email: ${payload.email}`,
          payload.phone ? `Phone: ${payload.phone}` : '',
          payload.crew_size ? `Team size: ${payload.crew_size}` : '',
          payload.current_tool ? `Runs the shop today: ${payload.current_tool}` : '',
        ].filter(Boolean).join('\n');
        const mailto = `mailto:${OFFICE.email}?subject=${encodeURIComponent(`FloorLogic free trial — ${payload.company_name}`)}&body=${encodeURIComponent(`Please save me a spot for the 14-day FloorLogic trial.\n\n${lines}\n`)}`;
        result.innerHTML = `
          <p class="tc-r-title"><strong>Thanks, ${esc(payload.full_name.split(' ')[0])}. Free trials open soon.</strong></p>
          <p class="tc-r-body">Online signup isn’t switched on yet, so nothing was saved or sent. Send us a quick note (we filled it in for you) or call, and we’ll save ${esc(payload.company_name)} a spot.</p>
          <div class="tc-r-actions">
            <a class="btn btn-primary" href="${mailto}">Email us your details</a>
            <a class="btn btn-ghost" href="${OFFICE.tel}">Call ${OFFICE.phone}</a>
          </div>`;
      } else if (res.state === 'ok') {
        result.innerHTML = `<p class="tc-r-title"><strong>You’re in.</strong></p><p class="tc-r-body">Check ${esc(payload.email)} for your login.</p>`;
      } else {
        result.innerHTML = `<p class="tc-r-title"><strong>That didn’t go through.</strong></p><p class="tc-r-body">Please call ${OFFICE.phone} or email ${OFFICE.email}.</p>`;
      }
      result.hidden = false;
      result.focus();
    });
  });
}
