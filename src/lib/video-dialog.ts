import { track } from './analytics';

export function initVideoDialogs() {
  const dlg = document.getElementById('video-dialog') as HTMLDialogElement | null;
  if (!dlg) return;
  const video = dlg.querySelector('video');
  document.querySelectorAll<HTMLElement>('[data-video-open]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const at = Number(btn.dataset.videoAt || 0);
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      if (video) {
        if (!video.getAttribute('poster') && video.dataset.poster) video.poster = video.dataset.poster;
        try { video.currentTime = at; } catch { /* metadata not loaded yet */ }
        video.play().catch(() => { /* autoplay with sound blocked — controls are visible */ });
      }
      track('demo_video_open', { at });
    });
  });
  const close = () => { video?.pause(); dlg.close(); };
  dlg.querySelector('[data-video-close]')?.addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => video?.pause());
}
