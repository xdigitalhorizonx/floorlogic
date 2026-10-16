// The hero on phones: the app's phone version (/mobile) — the Leads screen (search, stage segments,
// the list) and a lead's page (stage ribbon, next step, details, quotes, notes, Mark lost), with the
// app's date sheets and its new-lead sheet. Loaded only below 900px; the records and the story live
// in living-board.ts, so both views always show the same leads.
import { changeStatus, setSurveyDate, type LeadStatus } from '../lib/logic/lead-pipeline';
import { findDuplicates, quickAddValues } from '../lib/logic/lead-list';
import { phoneAddedToast, phoneFollowUpToast, phoneLostText, phoneLostToast, PHONE_LOST_CONFIRM, PHONE_NEED, phoneStageTap, type PhoneSeg } from '../lib/logic/lead-phone';
import { confirmSheetHTML, dupSheetHTML, followUpSheetHTML, newLeadSheetHTML, phoneLeadHTML, phoneListHTML, phoneSegsHTML, surveySheetHTML } from '../lib/board/phone-html';
import { listCtx } from '../lib/logic/lead-list';
import type { HeroApi, HeroView, NewLeadValues } from './hero-api';

export function mountPhoneView(api: HeroApi): HeroView {
  const phone = api.root.querySelector<HTMLElement>('[data-phone]')!;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => phone.querySelector<T>(sel)!;
  const mListScr = $('[data-m-list-scr]');
  const mLeadScr = $('[data-m-lead-scr]');
  const mLeadEl = $('[data-m-lead]');
  const mSegsEl = $('[data-m-segs]');
  const mListEl = $('[data-m-list]');
  const mQ = $<HTMLInputElement>('[data-m-q]');
  const mSheet = $<HTMLDialogElement>('[data-m-sheet]');
  const mSheetH = $('[data-m-sheet-h]');
  const mSheetBody = $('[data-m-sheet-body]');
  const mToast = $('[data-m-toast]');
  const TODAY = api.today;

  let seg: PhoneSeg = 'active';
  let openId: string | null = null;
  let pending: NewLeadValues | null = null;
  let onYes: (() => void) | null = null;

  function draw() {
    const leads = api.leads();
    mSegsEl.innerHTML = phoneSegsHTML(leads, seg);
    mListEl.innerHTML = phoneListHTML(leads, seg, mQ.value, TODAY);
    const l = api.getLead(openId);
    // The lead left the list (QT-330 approved and converted): back to the Leads screen.
    if (openId && !l) { openId = null; showList(); }
    if (l) mLeadEl.innerHTML = phoneLeadHTML(l, listCtx(TODAY, api.reps, api.quotes()));
  }
  function showList(focusRow?: string) {
    mLeadScr.hidden = true;
    mListScr.hidden = false;
    if (focusRow) mListEl.querySelector<HTMLElement>(`[data-open="${CSS.escape(focusRow)}"]`)?.focus({ preventScroll: true });
  }
  function openLead(id: string) {
    openId = id;
    draw();
    mListScr.hidden = true;
    mLeadScr.hidden = false;
    // The app opens a lead at the top of its page.
    const top = phone.getBoundingClientRect().top;
    if (top < 0) window.scrollBy({ top: top - 12, behavior: 'instant' as ScrollBehavior });
    mLeadScr.querySelector<HTMLElement>('[data-act="m-back"]')?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------- sheets --
  function openSheet(title: string, html: string) {
    mSheetH.textContent = title;
    mSheetBody.innerHTML = html;
    if (!mSheet.open) mSheet.showModal();
    mSheet.append(mToast); // a toast raised while a sheet is open shows above it
    mSheetBody.querySelector<HTMLElement>('input[name="name"]')?.focus();
  }
  function closeSheet() {
    if (mSheet.open) mSheet.close();
    phone.append(mToast);
  }
  mSheet.addEventListener('close', () => { phone.append(mToast); });

  /** `M.newLead` → `_createLeadRecord`, after the same duplicate check; the new lead's page opens. */
  function create(v: NewLeadValues, dupOk: boolean) {
    if (!dupOk) {
      const d = findDuplicates(v, api.leads(), api.customers());
      if (d.length) { pending = v; openSheet('Already on file?', dupSheetHTML(d)); return; }
    }
    const lead = api.createLead(v);
    closeSheet();
    api.toast(phoneAddedToast(lead));
    api.draw();
    openLead(lead.id);
    api.track('hero_m_add', {});
  }

  // ------------------------------------------------------------------- input --
  /** A date box that is still being typed (Chrome reports "0002-10-16" after the first year digit). */
  const partialDate = (v: string) => !!v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number(v.slice(0, 4)) < 2000);
  phone.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === mSheet) { closeSheet(); return; }
    const segBtn = t.closest<HTMLElement>('[data-seg]');
    if (segBtn) { seg = segBtn.dataset.seg as PhoneSeg; draw(); mSegsEl.querySelector<HTMLElement>(`[data-seg="${seg}"]`)?.focus({ preventScroll: true }); return; }
    const open = t.closest<HTMLElement>('[data-open]');
    if (open) { openLead(open.dataset.open!); api.track('hero_m_open', {}); return; }
    const l = api.getLead(openId);
    const pipe = t.closest<HTMLElement>('[data-stage]');
    if (pipe && l) {
      // M.leadStage: Survey opens the date sheet; back to New from a scheduled survey clears the date.
      const tap = phoneStageTap(l, pipe.dataset.stage as LeadStatus);
      if (tap.kind === 'surveySheet') openSheet('Site survey', surveySheetHTML(l, TODAY));
      else if (tap.kind === 'clearSurvey') { api.putLead({ ...l, ...setSurveyDate(l, null, TODAY).lead }); api.toast(tap.toast); api.draw(); }
      else if (tap.kind === 'move') { api.putLead(changeStatus(l, tap.to, TODAY)); api.toast(tap.toast); api.draw(); }
      return;
    }
    const next = t.closest<HTMLElement>('[data-next]')?.dataset.next;
    if (next && l) {
      if (next === 'survey') openSheet('Site survey', surveySheetHTML(l, TODAY));
      else if (next === 'followUp') openSheet('Follow-up date', followUpSheetHTML(l, TODAY));
      else if (next === 'quote') {
        // "Start quote" / "Build quote": the working quote builder is the first tab of the tour below.
        document.getElementById('tab-quote')?.click();
        document.getElementById('product')?.scrollIntoView({ behavior: api.reduce.matches ? 'auto' : 'smooth' });
      }
      return;
    }
    const day = t.closest<HTMLElement>('[data-day]');
    if (day && l) {
      const iso = day.dataset.day!;
      const isFollowUp = mSheetH.textContent === 'Follow-up date';
      closeSheet();
      if (isFollowUp) { api.followUp(l.id, iso); api.toast(phoneFollowUpToast(iso, TODAY)); } else api.survey(l.id, iso);
      return;
    }
    const chip = t.closest<HTMLButtonElement>('.m-chipbtn[data-v]');
    if (chip) {
      // A chip group picks one (or none) and fills its hidden field.
      const g = chip.closest<HTMLElement>('[data-chips]')!;
      const on = !chip.classList.contains('on');
      g.querySelectorAll('.m-chipbtn').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      if (on) { chip.classList.add('on'); chip.setAttribute('aria-pressed', 'true'); }
      g.parentElement!.querySelector<HTMLInputElement>('input[type=hidden]')!.value = on ? chip.dataset.v! : '';
      return;
    }
    const dup = t.closest<HTMLElement>('.m-dup');
    if (dup) { closeSheet(); pending = null; if (api.getLead(dup.dataset.id)) openLead(dup.dataset.id!); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'm-new') { openSheet('New lead', newLeadSheetHTML(api.reps)); api.track('hero_m_new', {}); }
    else if (act === 'm-back') { const was = openId; openId = null; showList(was ?? undefined); }
    else if (act === 'm-close' || act === 'm-no') closeSheet();
    else if (act === 'm-survey-save' && l) { const v = mSheetBody.querySelector<HTMLInputElement>('#m-survey-d')!.value; if (!v || partialDate(v)) return; closeSheet(); api.survey(l.id, v); }
    else if (act === 'm-survey-clear' && l) { closeSheet(); api.survey(l.id, ''); api.toast('Survey date cleared'); }
    else if (act === 'm-fu-save' && l) { const v = mSheetBody.querySelector<HTMLInputElement>('#m-fu-d')!.value; if (partialDate(v)) return; closeSheet(); api.followUp(l.id, v); api.toast(phoneFollowUpToast(v, TODAY)); }
    else if (act === 'm-note' && l) {
      const ta = mLeadEl.querySelector<HTMLTextAreaElement>('#m-note-in')!;
      if (!ta.value.trim()) { ta.focus(); return; }
      api.addNote(l.id, ta.value);
      api.toast('Note added');
    } else if (act === 'm-lost' && l) {
      onYes = () => { const cur = api.getLead(l.id); if (!cur) return; api.putLead(changeStatus(cur, 'lost', TODAY)); api.toast(phoneLostToast(cur.name)); api.draw(); };
      openSheet(PHONE_LOST_CONFIRM.title, confirmSheetHTML(phoneLostText(l.name), PHONE_LOST_CONFIRM.yes, true));
    } else if (act === 'm-yes') { const f = onYes; onYes = null; closeSheet(); window.setTimeout(() => f?.(), 30); }
    else if (act === 'm-dup-go' && pending) { const v = pending; pending = null; create(v, true); }
  });
  phone.addEventListener('submit', (e) => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-m-form]');
    if (!form) return;
    e.preventDefault();
    const need = (name: 'name' | 'phone') => {
      const el = form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      if (el.value.trim()) return false;
      el.classList.add('m-bad'); el.focus(); api.toast(PHONE_NEED[name], 'warning'); return true;
    };
    if (need('name') || need('phone')) return;
    const fd = new FormData(form);
    const g = (k: string) => String(fd.get(k) ?? '');
    create({ ...quickAddValues({ type: g('type'), name: g('name'), phone: g('phone'), email: g('email'), address: g('address'), source: g('source'), salesRepId: g('salesRepId') }), projectType: g('projectType'), siteSurveyDate: g('siteSurveyDate'), noteText: g('noteText') }, false);
  });
  phone.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.matches('[data-m-q]')) { mListEl.innerHTML = phoneListHTML(api.leads(), seg, t.value, TODAY); return; }
    if (t.matches('#m-note-in')) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }
    if (t.classList.contains('m-bad') && t.value.trim()) t.classList.remove('m-bad');
  });

  return { draw };
}
