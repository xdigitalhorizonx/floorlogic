// WCAG 2.x contrast audit for FloorLogic tokens (v2 — Field Sheet).
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
// Field Sheet is a single deliberate light theme: bare :root only.
const tokens = parseTokens(css, /:root\s*\{([\s\S]*?)\}/);

// Every fg/bg pairing the site actually renders. min = required ratio.
// Body copy is held to 7:1; secondary/annotation text to 4.5:1; the blaze
// accent is 3:1 as a non-text UI color (borders, underline, shadows) and is
// never used for body-size text on paper (blaze-deep carries that role).
const pairs = [
  // paper surfaces
  ['ink', 'paper', 7], ['ink', 'paper-high', 7], ['ink', 'paper-dim', 7],
  ['ink-soft', 'paper', 4.5], ['ink-soft', 'paper-high', 4.5],
  ['ink-faint', 'paper', 4.5], ['ink-faint', 'paper-high', 4.5],
  ['chalk', 'paper', 4.5], ['chalk', 'paper-high', 4.5],
  ['accent-deep', 'paper', 4.5], ['accent-deep', 'paper-high', 4.5],
  ['stamp-go', 'paper', 4.5], ['stamp-go', 'paper-high', 4.5],
  ['stamp-stop', 'paper', 4.5], ['stamp-stop', 'paper-high', 4.5],
  ['accent', 'paper', 3],           // non-text UI: underline, borders, marks
  ['hatch', 'paper-high', 3],       // non-text UI: hatch strokes, swatches
  ['paper-high', 'accent', 4.5],    // primary button label on cobalt fill
  // ink surfaces (closer + footer + compare thead)
  ['paper-high', 'ink', 7],         // headings, button labels, links on ink
  ['rule', 'ink', 4.5],             // footer body text, closer lead/micro
  ['sky', 'ink', 4.5],              // closer kicker + accent words on navy
];

let failures = 0;
console.log('=== Field Sheet (single light theme) ===');
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
    // properties; it carries sanctioned copies of --ink / --blaze.
    // js/vendor/ is minified third-party code (GSAP).
    if (rel === 'css/tokens.css' || rel === 'favicon.svg' || rel.startsWith('tools/') || rel.startsWith('js/vendor/')) continue;
    const src = readFileSync(p, 'utf8');
    // (?<!&) skips HTML numeric character references like &#128274;; the
    // length alternation only matches valid CSS hex lengths (3/4/6/8), so
    // prose like a license number "NV #0074221" doesn't false-positive.
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
