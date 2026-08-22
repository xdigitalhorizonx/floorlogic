/* Theme: light is the default; the user's explicit choice persists.
   Per spec, never auto-switch to dark from system preference —
   only a stored override changes the theme. Runs before first paint. */
(function () {
  document.documentElement.classList.add('js'); // gates scroll-reveal styling
  var stored = null;
  try { stored = localStorage.getItem('floorlogic-theme'); } catch (e) {}
  if (stored === 'dark') {
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
