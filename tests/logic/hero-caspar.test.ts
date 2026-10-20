import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HERO_CASPAR, heroCasparSummary, runningTotals, total } from '../../src/data/hero-caspar';
import { thread } from '../../src/data/sample-data';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The home hero's Caspar sample (approved mockup 2026-10-20): every figure comes from QT-330 with
// the customer's picks (Better + the optional stairs) through the logic library.
describe('the hero\'s Caspar sample', () => {
  it('the quote draft Caspar fills in', () => {
    expect(HERO_CASPAR.draft.rows).toEqual([
      { name: 'Summit XL Rigid Core — Smoked Hickory', detail: '41 cartons · 915.12 SqFt', amount: '$4,484.09' },
      { name: 'LVP Installation + demo', detail: '912 SqFt', amount: '$2,644.80' },
      { name: 'Sandbar Nylon + 8 lb pad', detail: '12′ roll, cut 14′ 6″ · 19.33 SqYd', amount: '$514.18' },
      { name: 'Stair install + base', detail: '13 steps · 180 Linear Ft', amount: '$541.00' },
    ]);
    expect([HERO_CASPAR.draft.total, HERO_CASPAR.draft.tax, HERO_CASPAR.draft.taxNote]).toEqual(['$8,624.70', '$440.63', 'Washoe County tax on materials']);
    expect(HERO_CASPAR.draft.who).toBe('Dev & Anjali Prasad · Reno, NV');
  });
  it('the total is QT-330\'s total as approved; the count-up runs through the running totals', () => {
    expect(total).toBe(thread.quote.totals.total);
    expect(total).toBe(thread.invoice.total);
    expect(runningTotals).toEqual([4854.7, 7499.5, 8056.18, 8624.7]);
    expect(HERO_CASPAR.steps).toEqual([0, 4854.7, 7499.5, 8056.18, 8624.7]);
  });
  it('what Dale and Caspar say carries the same numbers', () => {
    const text = HERO_CASPAR.chat.map((m) => m.parts.map((p) => (typeof p === 'string' ? p : p.b)).join(''));
    expect(text).toEqual([
      'Prasad job. Great room and kitchen, 912 square feet, Summit XL in smoked hickory.',
      'That’s 41 cartons for 912 sq ft. Want base and demo on it too?',
      'Yes. And 13 stairs in Sandbar carpet, 8 lb pad.',
      'Added a 12′ roll cut 14′ 6″. Your draft is $8,624.70.',
    ]);
  });
  it('the paper sheet, the phone and the plan line', () => {
    expect(HERO_CASPAR.paper.title).toBe('Prasad — Reno');
    expect(HERO_CASPAR.paper.rows).toEqual([['Great rm + kitchen', '912 sf'], ['Summit XL — smoked hickory'], ['Base 180 lf · demo carpet'], ['Stairs 13 — Sandbar + 8# pad']]);
    expect(HERO_CASPAR.paper.total).toEqual(['Total', '≈ $8,600']);
    expect(HERO_CASPAR.paper.checked).toBe('Read and checked — exact total $8,624.70');
    expect([HERO_CASPAR.user.initials, HERO_CASPAR.newLeads]).toEqual(['DW', 3]);
    expect(HERO_CASPAR.beta).toBe('Caspar is in beta on the Shop plan. You check every quote before it goes out.');
  });
  it('the handwriting font holds every character the sheet draws (else rebuild it: tools/fonts/caveat-hero.py)', () => {
    const chars = (file: string) => new Set(readFileSync(path.join(ROOT, 'tools/fonts', file), 'utf8').replace(/\s/g, ''));
    const at600 = chars('caveat-hero-600.txt');
    '0123456789'.split('').forEach((d) => at600.add(d));
    const rows = [...HERO_CASPAR.paper.rows.flat(), ...HERO_CASPAR.paper.total].join('').replace(/\s/g, '');
    expect([...rows].filter((c) => !at600.has(c))).toEqual([]);
    const at700 = chars('caveat-hero-700.txt');
    expect([...HERO_CASPAR.paper.title.replace(/\s/g, '')].filter((c) => !at700.has(c))).toEqual([]);
  });
  it('never says AI, Landmark, Erick or Casper', () => {
    const all = JSON.stringify([HERO_CASPAR, heroCasparSummary]);
    for (const word of [/\bAI\b/, /Landmark/i, /Erick/i, /Casper/i]) expect(all).not.toMatch(word);
  });
});
