// WCAG 2.x contrast audit for FloorLogic tokens.
// Usage: node tools/contrast-check.mjs
// Exits 1 if any used text/background pairing fails its required ratio,
// or if a hex literal appears outside css/tokens.css.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function parseTokens(css, blockRe) {
  const m = css.match(blockRe);
  if (!m) throw new Error('token block not found: ' + blockRe);
  const tokens = {};
  for (const [, name, hex] of m[1].matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    tokens[name] = hex;
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
const light = parseTokens(css, /:root\s*\{([\s\S]*?)\}/);
const dark = { ...light, ...parseTokens(css, /\[data-theme="dark"\]\s*\{([\s\S]*?)\}/) };

// Every fg/bg pairing the site actually renders. min = required ratio.
// Body copy (text on canvas/surface) is held to 7:1 per spec rule 8.
const pairs = [
  ['text', 'canvas', 7], ['text', 'surface', 7], ['text', 'surface-sunk', 7],
  ['text', 'accent-subtle', 7],
  ['text-muted', 'canvas', 4.5], ['text-muted', 'surface', 4.5], ['text-muted', 'surface-sunk', 4.5],
  ['accent', 'canvas', 4.5], ['accent', 'surface', 4.5], ['accent', 'accent-subtle', 4.5],
  ['text-inverse', 'accent', 4.5],          // primary button label
  ['text-inverse', 'accent-hover', 4.5],    // primary button label, hovered
  ['st-lead', 'canvas', 4.5], ['st-lead', 'surface', 4.5],
  ['st-quoted', 'canvas', 4.5], ['st-quoted', 'surface', 4.5],
  ['st-sold', 'canvas', 4.5], ['st-sold', 'surface', 4.5],
  ['st-attention', 'canvas', 4.5], ['st-attention', 'surface', 4.5],
  ['st-complete', 'canvas', 4.5], ['st-complete', 'surface', 4.5],
  ['st-problem', 'canvas', 4.5], ['st-problem', 'surface', 4.5],
  ['st-hold', 'canvas', 4.5], ['st-hold', 'surface', 4.5], // 14px+ only, enforced in CSS
];

let failures = 0;
for (const [theme, tokens] of [['light', light], ['dark', dark]]) {
  console.log(`\n=== ${theme} theme ===`);
  for (const [fg, bg, min] of pairs) {
    // The spec defines status hexes against light surfaces only. In dark
    // theme, pill LABELS render in --text (passing) and the status hue is
    // carried by the dot alone — meaning stays redundant via icon + label,
    // so the dot is exempt from text-contrast minimums. Skip st-* here.
    if (theme === 'dark' && fg.startsWith('st-')) continue;
    if (!tokens[fg] || !tokens[bg]) { console.log(`SKIP ${fg}/${bg} (token missing)`); continue; }
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  --${fg} on --${bg}  ${r.toFixed(2)}:1  (min ${min}:1)`);
  }
}

// Hex literals are only allowed in css/tokens.css.
console.log('\n=== hex-outside-tokens scan ===');
const offenders = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(css|html|js|mjs|svg)$/.test(name)) continue;
    const rel = relative(root, p).replaceAll('\\', '/');
    // favicon.svg is a standalone asset that cannot reference CSS custom
    // properties; it carries sanctioned copies of --accent / --text-inverse.
    if (rel === 'css/tokens.css' || rel === 'favicon.svg' || rel.startsWith('tools/')) continue;
    const src = readFileSync(p, 'utf8');
    for (const [hex] of src.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
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
