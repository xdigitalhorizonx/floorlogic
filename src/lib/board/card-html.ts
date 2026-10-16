// The app's own line icons for the hero and the site's feature tiles, plus the work-order /
// invoice cards the hero's story makes. Icons are the app's (its icons.js set:
// 24px grid, 1.75 stroke, currentColor), which the app draws in place of the emoji in its markup
// (🗂️ folder-tab, ⏱️ stopwatch, 🎯 target, 👤 user, 🏢 building, 📐 ruler, 📥 download-tray …).

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Paths copied from the app's icons.js (October build); the carets are drawn filled (FILLED).
const PATHS = {
  phone: 'M22 17v3a2 2 0 0 1-2 2 19 19 0 0 1-17-17 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L8 10a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 1.8-.5l3 .5a2 2 0 0 1 1.7 2z',
  pin: 'M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  user: 'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM4 21a8 8 0 0 1 16 0',
  building: 'M4 3h16v18H4zM9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-4h4v4',
  envelope: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l9 7 9-7',
  search: 'M4 11a7 7 0 1 0 14 0 7 7 0 0 0-14 0zM16 16l4 4',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  note: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM13 4v5h5M8 14l4-4 2 2-4 4H8z',
  ruler: 'M19 19 5 19 19 5zM11 19v-4M14 19v-6M8 19v-2M17 9l-2 2',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 3v4M16 3v4',
  stopwatch: 'M5 14a7 7 0 1 0 14 0 7 7 0 0 0-14 0zM12 14v-4M9 2h6M12 2v3',
  target: 'M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM11 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0z',
  warning: 'M12 4 2.6 20.5h18.8L12 4zM12 10v5M12 18h.01',
  tray: 'M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M7 11l5 5 5-5M12 3v13',
  folder: 'M3 8a2 2 0 0 1 2-2h4l1 2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 12h18',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  swap: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
  caretUp: 'M6 15 12 9l6 6z',
  caretDown: 'M6 9 12 15l6-6z',
  x: 'M6 6l12 12M18 6 6 18',
  edit: 'M14 4l6 6-12 12H2v-6z',
  hammer: 'M14 4l6 6-2 2-2-2-9 9-3-3 9-9-2-2zM8 13l3 3',
  check: 'M5 12.5 10 17.5 19 7',
  mobile: 'M7 3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM11 19h2',
  chevron: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  sparkles: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
} as const;
const FILLED: ReadonlySet<string> = new Set(['caretUp', 'caretDown']);
export type IconName = keyof typeof PATHS;
export const icon = (name: IconName) =>
  FILLED.has(name)
    ? `<svg class="lf-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`
    : `<svg class="lf-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;

/** Work-order / invoice cards that pop out of the story's conversion (badge colours from the app). */
export function docCardHTML(kind: 'wo' | 'inv', number: string, line: string, badge: string, badgeClass: string): string {
  return `<div class="lb-doc lb-doc-${kind}" data-doc="${esc(number)}"><div class="lb-doc-top"><span class="lb-doc-num">${esc(number)}</span><span class="kc-pill ${esc(badgeClass)}">${esc(badge)}</span></div><div class="lb-doc-line">${esc(line)}</div></div>`;
}
