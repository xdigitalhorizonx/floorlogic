import { initTrialForms } from './trial/trial-form';
import { initVideoDialogs } from './video-dialog';
import { initDyeLot } from './dye-lot';

function initMasthead() {
  const mast = document.querySelector<HTMLElement>('[data-mast]');
  if (!mast) return;
  const onScroll = () => mast.classList.toggle('is-stuck', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  const burger = mast.querySelector<HTMLButtonElement>('[data-burger]');
  const menu = document.getElementById('mast-menu');
  burger?.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!open));
    if (menu) menu.hidden = open;
  });
}

function initReveals() {
  const els = document.querySelectorAll<HTMLElement>('.reveal');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => io.observe(el));
}

export function initSite() {
  initMasthead();
  initReveals();
  initTrialForms();
  initVideoDialogs();
  initDyeLot();
}
