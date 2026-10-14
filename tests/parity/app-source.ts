/**
 * Pulls REAL functions out of the live app's exported HTML so parity tests can
 * run them side by side with the site's ports.
 *
 * Source of truth: the FloorLogic demo `main` branch, exported to
 *   demo-main-index.html (28,047 lines) and demo-main-q.html.
 * Set FLOORLOGIC_APP_EXPORT_DIR to the folder holding them. When the exports
 * are present they are extracted live AND checked against the committed
 * snapshot (fixtures/app-source.json); when they are absent the snapshot is
 * used, so the suite still runs on any machine.
 *
 * Refresh the snapshot after re-exporting main:
 *   UPDATE_APP_SNAPSHOT=1 npx vitest run tests/parity/snapshot.test.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_PATH = path.join(HERE, 'fixtures', 'app-source.json');

/** Session scratch folder the exports were written to (2026-10-14). */
const DEFAULT_EXPORT_DIR = 'C:/Users/Landmark/AppData/Local/Temp/claude/C--/d597fd48-77ff-4168-956e-996f00e022e7/scratchpad';
export const EXPORT_DIR = process.env.FLOORLOGIC_APP_EXPORT_DIR || DEFAULT_EXPORT_DIR;
export const EXPORT_FILES = { index: 'demo-main-index.html', q: 'demo-main-q.html' } as const;
export type SourceName = keyof typeof EXPORT_FILES;

// ------------------------------------------------------------ tokenizer ---

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const CLOSERS: Record<string, string> = { '{': '}', '(': ')', '[': ']' };

function skipString(src: string, i: number, quote: string): number {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === quote) return j + 1;
    if (c === '\n') throw new Error(`Unterminated string at ${i}`);
    j++;
  }
  throw new Error(`Unterminated string at ${i}`);
}

function skipTemplate(src: string, i: number): number {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '`') return j + 1;
    if (c === '$' && src[j + 1] === '{') { j = matchBracket(src, j + 1); continue; }
    j++;
  }
  throw new Error(`Unterminated template at ${i}`);
}

function skipRegex(src: string, i: number): number {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '\n') throw new Error(`Unterminated regex at ${i}`);
    if (inClass) { if (c === ']') inClass = false; j++; continue; }
    if (c === '[') { inClass = true; j++; continue; }
    if (c === '/') { j++; while (j < src.length && /[a-z]/i.test(src[j]!)) j++; return j; }
    j++;
  }
  throw new Error(`Unterminated regex at ${i}`);
}

type Prev = { kind: 'start' | 'punct' | 'word' | 'value' | 'close'; text: string };

function regexAllowed(prev: Prev): boolean {
  if (prev.kind === 'start' || prev.kind === 'punct') return true;
  if (prev.kind === 'word') return KEYWORDS_BEFORE_REGEX.has(prev.text);
  if (prev.kind === 'close') return prev.text === '}';
  return false;
}

/**
 * Walk JS from `start`, skipping strings, templates, comments and regex
 * literals while tracking bracket depth. Stops either right after the bracket
 * that brings depth back to zero (`untilBalanced`), or AT the first `;` seen
 * at depth zero (statements). Returns that index.
 */
function walk(src: string, start: number, mode: 'untilBalanced' | 'untilSemicolon'): number {
  const stack: string[] = [];
  let prev: Prev = { kind: 'start', text: '' };
  let i = start;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (mode === 'untilSemicolon' && c === ';' && stack.length === 0) return i;
    if (c === '"' || c === "'") { i = skipString(src, i, c); prev = { kind: 'value', text: '' }; continue; }
    if (c === '`') { i = skipTemplate(src, i); prev = { kind: 'value', text: '' }; continue; }
    if (c === '/' && regexAllowed(prev)) { i = skipRegex(src, i); prev = { kind: 'value', text: '' }; continue; }
    if (c in CLOSERS) { stack.push(CLOSERS[c]!); i++; prev = { kind: 'punct', text: c }; continue; }
    if (c === '}' || c === ')' || c === ']') {
      const want = stack.pop();
      if (want !== c) throw new Error(`Unbalanced '${c}' at ${i} (expected '${want}')`);
      i++;
      if (mode === 'untilBalanced' && stack.length === 0) return i;
      prev = { kind: 'close', text: c };
      continue;
    }
    if (/[A-Za-z_$0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z_$0-9]/.test(src[j]!)) j++;
      const text = src.slice(i, j);
      prev = /^\d/.test(text) ? { kind: 'value', text } : { kind: 'word', text };
      i = j;
      continue;
    }
    prev = { kind: 'punct', text: c };
    i++;
  }
  throw new Error('walk(): ran off the end of the source');
}

/** Index just past the bracket matching the opener at `open`. */
export function matchBracket(src: string, open: number): number {
  const opener = src[open]!;
  if (!(opener in CLOSERS)) throw new Error(`matchBracket: '${opener}' at ${open} is not an opener`);
  return walk(src, open, 'untilBalanced');
}

function lineOf(src: string, index: number): number {
  let n = 1;
  for (let k = 0; k < index; k++) if (src.charCodeAt(k) === 10) n++;
  return n;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Extracted {
  line: number;
  code: string;
}

/** `function name(…){…}` — must be defined exactly once. */
export function extractFunction(src: string, name: string): Extracted {
  const re = new RegExp(`(^|[^.\\w$])function\\s+${esc(name)}\\s*\\(`, 'g');
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) throw new Error(`extractFunction(${name}): ${hits.length} definitions`);
  const m = hits[0]!;
  const start = m.index! + m[1]!.length;
  const paren = src.indexOf('(', start);
  const afterParams = matchBracket(src, paren);
  const brace = src.indexOf('{', afterParams);
  if (src.slice(afterParams, brace).trim() !== '') throw new Error(`extractFunction(${name}): no body after params`);
  const end = matchBracket(src, brace);
  return { line: lineOf(src, start), code: src.slice(start, end) };
}

/** `const NAME=…;` (also catches `const A=1, B=2;`) — must be declared exactly once. */
export function extractConst(src: string, name: string): Extracted {
  const re = new RegExp(`(^|[\\s;}])const\\s+${esc(name)}\\s*=`, 'g');
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) throw new Error(`extractConst(${name}): ${hits.length} declarations`);
  const m = hits[0]!;
  const start = m.index! + m[1]!.length;
  const eq = src.indexOf('=', start);
  const end = walk(src, eq + 1, 'untilSemicolon');
  return { line: lineOf(src, start), code: src.slice(start, end + 1) };
}

/** A literal snippet located by a regex (for copy that lives inside templates/CSS). */
export function extractText(src: string, re: RegExp): Extracted {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const hits = [...src.matchAll(new RegExp(re.source, flags))];
  if (hits.length !== 1) throw new Error(`extractText(${re}): ${hits.length} matches`);
  return { line: lineOf(src, hits[0]!.index!), code: hits[0]![0] };
}

// ------------------------------------------------------------- manifest ---

type Item = { source: SourceName } & ({ fn: string } | { constName: string } | { text: string; re: RegExp });

const fn = (source: SourceName, ...names: string[]): Item[] => names.map((n) => ({ source, fn: n }));
const cst = (source: SourceName, ...names: string[]): Item[] => names.map((n) => ({ source, constName: n }));

/** Everything the parity tests run or read. */
export const MANIFEST: Item[] = [
  ...fn('q', 'termRule', 'invoiceAgeDays', 'computeDueNow', 'fmt$', 'plusDays', 'fmtDate', 'esc'),
  ...fn(
    'index',
    // formatting + dates
    'fmt$', '_isoDay', 'fmtDate', 'daysBetween', 'statusBadge',
    // cartons + roll
    'setQBMaterialQty', 'qbRecalcRollQty', '_qbInchFrac', 'qbBuildQtyExtraHtml', '_qbFmtQty', '_coverageUnits',
    'applyAreaQty', 'openLaborRoundupModal', 'roundupLaborQty',
    // quote totals
    'qbFastRecalc', 'qbRefreshDownPaymentAmt', 'qbMcIsChosen', 'qbMcChosenRowKey', 'qbMcSectionLocalIdx', 'qbMcDefaultRowKey',
    '_qbSecActive', '_quoteSecActive', '_choiceActiveIdxs', '_choiceGroups', '_mqTotals', '_mqSecActive', '_computeTotalsData',
    'qbChosenSectionsAndRows', 'qbFilterChosenItems', 'applyCustomerSelectionToQuote', '_refreshQuoteStoredTotals', 'approveQuote',
    // tax
    '_nvTaxResult', 'getTaxRateFromAddress',
    // leads
    'kanbanDrop', 'advanceLead', 'approveLead', 'changeLeadStatus', 'setLeadSurveyDate', 'getFollowUpState', 'isLeadStale', 'getLeadStageAgeDays',
    // work orders
    'completeJob', 'markJobPaid', 'saveScheduleJob', '_matMaybeAdvance', '_jobMatState', '_jobMatLines', '_matLineOrdered', '_matLineIn', '_advanceJobToReady',
    // invoices + job costing
    'acctRecordInvPayment', '_invPaidAmt', '_jobFinance', '_jcRollup', '_jcForJob', '_jcAll', '_jcAmount', '_jcBucket', '_jobRepShares',
    '_invProcessingFees', '_payProcessingFee', '_isCardPayment', '_cardFeeRate', '_jcEstimate', '_jcActual',
  ),
  ...cst(
    'index',
    'LEAD_STATUSES', 'LEAD_STATUS_LABELS', 'LEAD_STATUS_COLORS', 'QUOTE_STATUS_COLORS', 'JOB_STATUS_COLORS', 'JOB_STATUS_LABELS', 'INV_STATUS_COLORS',
    'NV_COUNTY_TAX', 'NV_CITY_COUNTY', 'NV_ZIP_COUNTY', 'NV_ZIP3_COUNTY', 'LEAD_STALE_DAYS', 'PIPELINE_STAGES', 'JOB_BUCKETS', 'JC_KINDS',
    'CARD_FEE_PCT_DEFAULT',
  ),
  { source: 'index', text: 'root-css', re: /:root\{[^}]*\}/ },
  { source: 'index', text: 'badge-css', re: /\.badge-blue\{[^\n]*\n(?:\.badge-[a-z]+\{[^\n]*\n){8}/ },
  { source: 'index', text: 'default-payment-terms', re: /systemPaymentTerms:\[[^\]]*\]/ },
  { source: 'index', text: 'wo-mark-paid-btn', re: /const _woAnyInvPaid=[\s\S]*?Mark as Paid…<\/button>`;/ },
  { source: 'index', text: 'wo-header-buttons', re: /\$\{j\.status==='order_materials'\?`<button[\s\S]*?Paid in Full<\/span>`:''\}/ },
  { source: 'index', text: 'lead-card-actions', re: /let primaryHTML;\n[\s\S]*?\n {2}\/\/ Action bar/ },
  { source: 'index', text: 'privacy-css', re: /\[data-privacy="on"\] \.qb-private,[^\n]*\n[^\n]*\n[^\n]*/ },
  { source: 'index', text: 'privacy-tooltip', re: /data-tip="Privacy Mode — [^"]*"/ },
  // The live invoice's PAYMENT box, as the whole IIFE so it can be executed.
  { source: 'q', text: 'payment-box', re: /\(function\(\)\{\n\s*\/\/ Invoice-only: the PAYMENT area[\s\S]*?\n {10}\}\)\(\)/ },
];

export function itemKey(item: Item): string {
  if ('fn' in item) return `${item.source}:fn:${item.fn}`;
  if ('constName' in item) return `${item.source}:const:${item.constName}`;
  return `${item.source}:text:${item.text}`;
}

// --------------------------------------------------------------- loading ---

export interface Snapshot {
  generated: string;
  sources: Record<SourceName, { file: string; lines: number; sha256: string }>;
  items: Record<string, Extracted>;
}

export function exportsAvailable(): boolean {
  return Object.values(EXPORT_FILES).every((f) => existsSync(path.join(EXPORT_DIR, f)));
}

function readExport(name: SourceName): string {
  // Normalise line endings so hashes/line numbers do not depend on checkout settings.
  return readFileSync(path.join(EXPORT_DIR, EXPORT_FILES[name]), 'utf8').replace(/\r\n/g, '\n');
}

/** Extract every manifest item from the exports on disk. */
export function extractLive(): Snapshot {
  const srcs = { index: readExport('index'), q: readExport('q') };
  const items: Record<string, Extracted> = {};
  for (const item of MANIFEST) {
    const src = srcs[item.source];
    items[itemKey(item)] = 'fn' in item ? extractFunction(src, item.fn) : 'constName' in item ? extractConst(src, item.constName) : extractText(src, item.re);
  }
  const meta = (name: SourceName) => ({
    file: EXPORT_FILES[name],
    lines: srcs[name].split('\n').length,
    sha256: createHash('sha256').update(srcs[name]).digest('hex'),
  });
  return { generated: 'demo main export, 2026-10-14', sources: { index: meta('index'), q: meta('q') }, items };
}

export function readSnapshot(): Snapshot | null {
  return existsSync(SNAPSHOT_PATH) ? (JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot) : null;
}

export function writeSnapshot(s: Snapshot): void {
  mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(s, null, 1) + '\n', 'utf8');
}

let cached: { snapshot: Snapshot; origin: 'live' | 'snapshot' } | null = null;

/** The app source to test against: live exports when present, else the committed snapshot. */
export function appSource(): { snapshot: Snapshot; origin: 'live' | 'snapshot' } {
  if (cached) return cached;
  if (exportsAvailable()) cached = { snapshot: extractLive(), origin: 'live' };
  else {
    const s = readSnapshot();
    if (!s) throw new Error(`No app exports in ${EXPORT_DIR} and no snapshot at ${SNAPSHOT_PATH}`);
    cached = { snapshot: s, origin: 'snapshot' };
  }
  return cached;
}

/** One extracted item's code. */
export function code(key: string): string {
  const it = appSource().snapshot.items[key];
  if (!it) throw new Error(`app source has no ${key}`);
  return it.code;
}
export function lineOfItem(key: string): number {
  return appSource().snapshot.items[key]!.line;
}

/**
 * Evaluate app functions/consts together in one scope. `globals` become
 * parameters, so the app code sees them as free variables (data, window,
 * document, showToast…). Returns the named bindings.
 */
export function sandbox<T extends Record<string, unknown>>(
  source: SourceName,
  names: { fns?: string[]; consts?: string[]; exportNames?: string[] },
  globals: Record<string, unknown> = {},
): T {
  const parts = [
    ...(names.consts ?? []).map((c) => code(`${source}:const:${c}`)),
    ...(names.fns ?? []).map((f) => code(`${source}:fn:${f}`)),
  ];
  const exported = [...(names.fns ?? []), ...(names.exportNames ?? names.consts ?? [])];
  const ids = Object.keys(globals);
  const body = `${parts.join('\n')}\nreturn { ${exported.map((n) => `${JSON.stringify(n)}: ${n}`).join(', ')} };`;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(...ids, body) as (...args: unknown[]) => T;
  return factory(...ids.map((k) => globals[k]));
}
