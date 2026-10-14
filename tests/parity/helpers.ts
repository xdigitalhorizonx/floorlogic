/** Shared helpers for the parity tests. */
import type { QuoteSection, QuoteSelection } from '../../src/lib/logic';

/** Small deterministic PRNG (mulberry32) so random grids are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
export const money = (r: () => number, max: number): number => Math.round(r() * max * 100) / 100;

/** A Date whose "now" is fixed — passed into sandboxes as `Date`. */
export function fixedDate(nowMs: number): DateConstructor {
  class FixedDate extends Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(nowMs);
      else super(...(args as [string | number | Date]));
    }
    static now(): number {
      return nowMs;
    }
  }
  return FixedDate as unknown as DateConstructor;
}

/** Visible text of an HTML fragment: tags dropped, common entities decoded, spaces collapsed. */
export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** A fake DOM element that records what the app writes into it. */
export function recorderDocument() {
  const els = new Map<string, { id: string; textContent: string; value: string; innerHTML: string }>();
  const get = (id: string) => {
    let el = els.get(id);
    if (!el) {
      el = { id, textContent: '', value: '', innerHTML: '' };
      els.set(id, el);
    }
    return el;
  };
  return { els, document: { getElementById: get, activeElement: null, querySelectorAll: () => [], body: { classList: { remove() {}, add() {} } } } };
}

export interface AppQuote {
  sections: Array<{ title: string; optional?: boolean; multipleChoice?: boolean; chosenRowKey?: string }>;
  materials: Array<Record<string, unknown> & { _section: number }>;
  labors: Array<Record<string, unknown> & { _section: number }>;
  taxRate: number;
  taxExempt: boolean;
  [k: string]: unknown;
}

/** The site's section-nested quote → the app's flat arrays with `_section` (section order preserved). */
export function toAppQuote(sections: readonly QuoteSection[], taxRate: number, taxExempt = false): AppQuote {
  return {
    sections: sections.map((s) => ({
      title: s.title,
      ...(s.kind === 'optional' ? { optional: true } : {}),
      ...(s.kind === 'pickOne' ? { multipleChoice: true } : {}),
      ...(s.chosenRowKey ? { chosenRowKey: s.chosenRowKey } : {}),
    })),
    materials: sections.flatMap((s, i) => s.materials.map((m) => ({ ...m, item: m.name, _section: i }))),
    labors: sections.flatMap((s, i) => s.labors.map((l) => ({ ...l, _section: i }))),
    taxRate,
    taxExempt,
  };
}

/** The customer's picks → the app's `selectedOptions` (what q.html records on approval). */
export function toSelectedOptions(sections: readonly QuoteSection[], sel: QuoteSelection | null) {
  if (!sel) return [];
  const out: Array<{ idx: number; title: string; mode: string; rowKey?: string }> = [];
  for (const i of sel.optional ?? []) out.push({ idx: i, title: sections[i]!.title, mode: 'optional' });
  for (const [i, key] of Object.entries(sel.pickOne ?? {})) out.push({ idx: Number(i), title: sections[Number(i)]!.title, mode: 'mc', rowKey: key });
  return out;
}
