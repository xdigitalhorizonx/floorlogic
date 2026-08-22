/* Theme: DARK is the default (bare :root in tokens.css = dark; owner's call,
   2026-08-22). A stored choice always wins; system preference is never
   consulted. Runs before first paint so a stored light choice never flashes. */
(function () {
  document.documentElement.classList.add('js'); // gates scroll-reveal styling
  var stored = null;
  try { stored = localStorage.getItem('floorlogic-theme'); } catch (e) {}
  if (stored === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

function floorlogicToggleTheme() {
  var root = document.documentElement;
  var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  if (next === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
  try { localStorage.setItem('floorlogic-theme', next); } catch (e) {}
  var btn = document.querySelector('[data-theme-toggle]');
  if (btn) btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
}
