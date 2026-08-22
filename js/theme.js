/* Theme: DARK is the default (owner's call, 2026-08-22 — overrides the color
   spec's light-default rule for this marketing page). A stored choice always
   wins; system preference is never consulted. Runs before first paint. */
(function () {
  document.documentElement.classList.add('js'); // gates scroll-reveal styling
  var stored = null;
  try { stored = localStorage.getItem('floorlogic-theme'); } catch (e) {}
  if (stored !== 'light') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

function floorlogicToggleTheme() {
  var root = document.documentElement;
  var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  if (next === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
  try { localStorage.setItem('floorlogic-theme', next); } catch (e) {}
  var btn = document.querySelector('[data-theme-toggle]');
  if (btn) btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
}
