// Run `load` once, the first time any matching element comes within ~1 screen of the viewport.
// Keeps below-the-fold demo code off the critical path (it's fetched and run on approach).
// Hidden elements (e.g. inactive tabs) never intersect, so they load when they're first shown.
export function whenNear(selector: string, load: () => unknown, margin = '800px') {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) { load(); return; }
  let done = false;
  const io = new IntersectionObserver((entries) => {
    if (done || !entries.some((e) => e.isIntersecting)) return;
    done = true;
    io.disconnect();
    load();
  }, { rootMargin: margin });
  els.forEach((el) => io.observe(el));
}
