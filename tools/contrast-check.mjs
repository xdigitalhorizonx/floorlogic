// WCAG 2.x contrast audit for FloorLogic tokens (v3 — Night Shift).
// Usage: node tools/contrast-check.mjs
// Exits 1 if any used text/background pairing fails its required ratio,
// or if a hex literal appears outside css/tokens.css.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function parseTokens(css) {
  // merge every :root block (site palette + the documented APP SCOPE block)
  const tokens = {};
  for (const block of css.matchAll(/:root\s*\{([\s\S]*?)\}/g)) {
    for (const [, name, hex] of block[1].matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
      tokens[name] = hex;
    }
  }
  return tokens;
}

function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(join(root, 'css', 'tokens.css'), 'utf8');
const tokens = parseTokens(css);

// Every fg/bg pairing the site actually renders. min = required ratio.
// Body copy is held to 7:1; secondary/annotation text to 4.5:1; cobalt as a
// non-text UI color (borders, underline, focus) to 3:1. Stamps land on the
// light app windows, so they check against --fl-card.
const pairs = [
  // dark stage
  ['text', 'bg', 7], ['text', 'panel', 7], ['text', 'panel-2', 7],
  ['text-soft', 'bg', 4.5], ['text-soft', 'panel', 4.5], ['text-soft', 'panel-2', 4.5],
  ['text-faint', 'bg', 4.5], ['text-faint', 'panel', 4.5], ['text-faint', 'panel-2', 4.5],
  ['sky', 'bg', 4.5], ['sky', 'panel', 4.5], ['sky', 'panel-2', 4.5],
  ['go', 'bg', 4.5], ['go', 'panel', 4.5],
  ['stop', 'bg', 4.5], ['stop', 'panel', 4.5],
  ['fl-white', 'cobalt', 4.5],      // primary button label
  ['cobalt', 'bg', 3],              // non-text UI: underline, focus, borders
  // stamps on the light windows
  ['stamp-go', 'fl-card', 4.5], ['stamp-stop', 'fl-card', 4.5],
  // app scope core (the builder recreation)
  ['fl-text', 'fl-bg', 7], ['fl-text', 'fl-card', 7],
  ['fl-muted', 'fl-card', 4.5], ['fl-white', 'fl-cta', 4.5],
];

let failures = 0;
console.log('=== Night Shift (single dark theme) + app scope ===');
for (const [fg, bg, min] of pairs) {
  if (!tokens[fg] || !tokens[bg]) { console.log(`SKIP ${fg}/${bg} (token missing)`); failures++; continue; }
  const r = ratio(tokens[fg], tokens[bg]);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  --${fg} on --${bg}  ${r.toFixed(2)}:1  (min ${min}:1)`);
}

// Hex literals are only allowed in css/tokens.css.
console.log('\n=== hex-outside-tokens scan ===');
const offenders = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === 'fonts') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(css|html|js|mjs|svg)$/.test(name)) continue;
    const rel = relative(root, p).replaceAll('\\', '/');
    // favicon.svg is a standalone asset that cannot reference CSS custom
    // properties; js/vendor/ is minified third-party code (GSAP).
    if (rel === 'css/tokens.css' || rel === 'favicon.svg' || rel.startsWith('tools/') || rel.startsWith('js/vendor/')) continue;
    const src = readFileSync(p, 'utf8');
    // (?<!&) skips HTML numeric character references like &#128274;; the
    // length alternation only matches valid CSS hex lengths (3/4/6/8), so
    // prose like a license number "NV #0074221" does not false-positive.
    for (const [hex] of src.matchAll(/(?<!&)#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3,4})\b/g)) {
      offenders.push(`${rel}: ${hex}`);
    }
  }
}
walk(root);
if (offenders.length) {
  failures += offenders.length;
  for (const o of offenders) console.log('FAIL  ' + o);
} else {
  console.log('PASS  no hex literals outside css/tokens.css');
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
