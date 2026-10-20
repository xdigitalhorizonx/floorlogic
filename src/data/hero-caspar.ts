/**
 * The home hero's Caspar sample (owner pick 2026-10-20: "the smartphone with the app up in the
 * middle"): what Dale says on the phone, what Caspar answers, the quote draft it fills in and the
 * paper quote it reads and checks.
 *
 * Everything is DERIVED from the one sample dataset (sample-data.ts, never edited here) through the
 * logic library: cartons, square feet, the roll cut, every amount and the total. The spoken words
 * are written out; every number in them comes from the data. The draft rows combine the quote's
 * lines the way the hero shows them (floor · install + demo · stair carpet + pad · stair install +
 * base); their running totals come from computeQuoteTotals, and the last one must equal QT-330's
 * total with the customer's picks (Better + the optional stairs), or the build stops.
 *
 * Fictional: Pinyon Flooring Co., Dale Whitaker (DW), Dev & Anjali Prasad.
 */
import { TIERS } from '../config/site';
import { leads, reps, thread } from './sample-data';
import {
  cartonHint, chosenRowKey, computeQuoteTotals, fmtMoney, laborLineTotal, materialLineTotal, round2,
  type QuoteLabor, type QuoteMaterial, type QuoteSection,
} from '../lib/logic';

const Q = thread.quote;

function fail(what: string): never {
  throw new Error(`hero-caspar: ${what} — the sample quote changed shape; update src/data/hero-caspar.ts`);
}
function section(kind: QuoteSection['kind'], i: number): QuoteSection {
  const s = Q.sections[i];
  if (!s || s.kind !== kind) fail(`section ${i} is not ${kind}`);
  return s;
}

// QT-330: 0 = the floor (Pick One: Good / Better / Best), 1 = install & prep, 2 = stairs (optional).
const floor = section('pickOne', 0);
const install = section('required', 1);
const stairs = section('optional', 2);
if (!Q.selection.optional?.includes(2)) fail('the customer did not add the stairs');

// The customer's pick in the floor section (Better).
const pickKey = chosenRowKey(floor, 0, Q.selection);
const better = pickKey?.startsWith('mat-') ? floor.materials[Number(pickKey.slice(4))] : undefined;
if (!better) fail('no floor pick');
const base = install.materials.find((m) => m.costUOM === 'Linear Ft') ?? fail('no base in install & prep');
const [lvpInstall, demo] = install.labors;
if (!lvpInstall || !demo) fail('install & prep needs the install and the demo labor');
const [carpet, pad] = stairs.materials;
if (!carpet || !pad) fail('the stairs need the carpet and the pad');
const stairLabor = stairs.labors[0] ?? fail('no stair labor');

const hint = cartonHint(better) ?? fail('the floor pick has no cartons');
const area = Q.jobArea.value;
const cut = Q.stairCut;
const steps = Number(stairLabor.quantity);
const baseLf = Number(base.quantity);
const qty2 = (v: unknown) => Number(v).toFixed(2);
/** 12 → 12′, 14 ft 6 in → 14′ 6″ (the app's `14' 6"` with real prime marks). */
const feet = (ft: number, inch = 0) => `${ft}′${inch ? ` ${inch}″` : ''}`;

export interface DraftRow {
  name: string;
  detail: string;
  /** Σ the row's line totals (qty × retail), unrounded. */
  amount: number;
  materials: QuoteMaterial[];
  labors: QuoteLabor[];
}

const row = (name: string, detail: string, materials: QuoteMaterial[], labors: QuoteLabor[]): DraftRow => ({
  name, detail, materials, labors,
  amount: materials.reduce((a, m) => a + materialLineTotal(m), 0) + labors.reduce((a, l) => a + laborLineTotal(l), 0),
});

/** The quote draft's rows, in the order Caspar fills them in. */
export const draftRows: DraftRow[] = [
  row(better.name, `${hint.cartons} cartons · ${qty2(better.quantity)} ${better.costUOM}`, [better], []),
  row(`${lvpInstall.name} + demo`, `${lvpInstall.quantity} ${lvpInstall.uom}`, [], [lvpInstall, demo]),
  row('Sandbar Nylon + 8 lb pad', `${feet(cut.widthFt)} roll, cut ${feet(cut.lengthFt, cut.lengthIn)} · ${qty2(cut.sqyd)} SqYd`, [carpet, pad], []),
  // The base (a material from install & prep) rides on the stair row.
  row(`${stairLabor.name} + base`, `${steps} steps · ${baseLf} ${base.costUOM}`, [base], [stairLabor]),
];

/** The draft's total after each row lands (materials taxed, labor not), from computeQuoteTotals. */
export const runningTotals: number[] = draftRows.map((_, i) => {
  const rows = draftRows.slice(0, i + 1);
  return computeQuoteTotals({
    sections: [{ title: 'Quote draft', kind: 'required', materials: rows.flatMap((r) => r.materials), labors: rows.flatMap((r) => r.labors) }],
    taxRate: Q.taxRate,
    taxExempt: Q.taxExempt,
  }).total;
});
export const total = Q.totals.total;
if (Math.abs(runningTotals[runningTotals.length - 1]! - total) > 0.001) fail(`the draft rows add up to ${runningTotals.at(-1)}, not ${total}`);
// Every line the approval put on IN-330, each exactly once.
const rowLines = draftRows.flatMap((r) => [...r.materials, ...r.labors]);
if (rowLines.length !== thread.invoice.lines.length || new Set(rowLines).size !== rowLines.length) fail('the draft rows do not hold the approved lines once each');
if (Math.abs(draftRows.reduce((a, r) => a + r.amount, 0) - thread.invoice.raw.subtotal) > 0.001) fail('the draft rows do not add up to the invoice subtotal');

const last = Q.customerName.split(' ').at(-1)!;
const town = Q.siteCity.split(',')[0]!;
/** "$8,600": the rough total a dealer writes on the paper sheet. */
const roughTotal = '$' + (Math.round(total / 100) * 100).toLocaleString('en-US');
const casparPlan = TIERS.find((t) => t.includes.some((i) => i.startsWith('Caspar')))?.name ?? fail('no plan includes Caspar');

export type Part = string | { b: string };
export interface ChatMsg { who: 'me' | 'cs'; parts: Part[] }

export const HERO_CASPAR = {
  user: { initials: reps[0]!.initials, name: reps[0]!.name },
  /** The Leads tab's badge: leads still New. */
  newLeads: leads.filter((l) => l.status === 'new').length,
  screen: { title: 'Caspar', sub: 'Beta · build a quote by talking or with a photo' },
  /** The app's own words (caspar.js statusText / the PTT button). */
  status: { listening: 'Listening…', thinking: 'Thinking…', talking: 'Talking' },
  ptt: { idle: 'Hold to talk', holding: 'Listening… let go to send' },
  chat: [
    { who: 'me', parts: [`${last} job. Great room and kitchen, ${area} square feet, Summit XL in smoked hickory.`] },
    { who: 'cs', parts: ['That’s ', { b: `${hint.cartons} cartons` }, ` for ${area} sq ft. Want base and demo on it too?`] },
    { who: 'me', parts: [`Yes. And ${steps} stairs in Sandbar carpet, 8 lb pad.`] },
    { who: 'cs', parts: ['Added a ', { b: `${feet(cut.widthFt)} roll cut ${feet(cut.lengthFt, cut.lengthIn)}` }, '. Your draft is ', { b: fmtMoney(total) }, '.'] },
  ] as ChatMsg[],
  draft: {
    title: 'Quote draft',
    ok: 'Looks good',
    who: `${Q.customerName} · ${Q.siteCity}`,
    /** The app's empty draft (caspar.js), shown until the first row lands. */
    empty: 'No lines yet. Tell Caspar what the job needs, or scan a paper quote.',
    rows: draftRows.map((r) => ({ name: r.name, detail: r.detail, amount: fmtMoney(round2(r.amount)) })),
    totalLabel: 'Total',
    taxNote: `${Q.taxCounty} tax on materials`,
    total: fmtMoney(total),
    tax: fmtMoney(Q.totals.tax),
  },
  paper: {
    title: `${last} — ${town}`,
    rows: [
      ['Great rm + kitchen', `${area} sf`],
      ['Summit XL — smoked hickory'],
      [`Base ${baseLf} lf · demo carpet`],
      [`Stairs ${steps} — Sandbar + 8# pad`],
    ] as string[][],
    total: ['Total', `≈ ${roughTotal}`],
    checked: `Read and checked — exact total ${fmtMoney(total)}`,
  },
  labels: { paper: ['Or snap the paper one', 'Photo'], draft: ['The quote it fills in', 'Draft'], snap: 'Snap', fills: 'Fills in' },
  beta: `Caspar is in beta on the ${casparPlan} plan. You check every quote before it goes out.`,
  /** For the replay's count-up: the total after each row (and 0 before the first). */
  steps: [0, ...runningTotals],
};

const plain = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : p.b)).join('');

/** What a screen reader gets instead of the phone, the paper and the draft (all aria-hidden). */
export const heroCasparSummary = {
  intro: 'A sample with made-up data: Dale talks a job through with Caspar on the FloorLogic phone app.',
  chat: HERO_CASPAR.chat.map((m) => `${m.who === 'me' ? 'Dale' : 'Caspar'}: “${plain(m.parts)}”`),
  draft: `The quote draft Caspar fills in for ${Q.customerName}, ${Q.siteCity}:`,
  rows: HERO_CASPAR.draft.rows.map((r) => `${r.name}, ${r.detail.replace(' · ', ', ')}: ${r.amount}`),
  total: `Total ${HERO_CASPAR.draft.total}, with ${HERO_CASPAR.draft.tax} ${Q.taxCounty} tax on materials.`,
  paper: `Or snap the paper quote: Caspar reads the handwritten sheet (total about ${roughTotal}) and checks it. Exact total ${HERO_CASPAR.draft.total}.`,
  done: `Sample finished: Caspar filled in a quote draft for ${Q.customerName}, total ${HERO_CASPAR.draft.total}.`,
};
