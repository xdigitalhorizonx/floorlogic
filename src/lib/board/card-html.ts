// The app's own line icons for the site's feature tiles (OnTheRoad.astro). Icons are the app's (its
// icons.js set: 24px grid, 1.75 stroke, currentColor), which the app draws in place of the emoji in
// its markup. (The hero's board and its work-order / invoice cards used to live here too; the
// Caspar hero replaced them on 2026-10-20.)

// Paths copied from the app's icons.js (October build).
const PATHS = {
  phone: 'M22 17v3a2 2 0 0 1-2 2 19 19 0 0 1-17-17 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L8 10a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 1.8-.5l3 .5a2 2 0 0 1 1.7 2z',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 3v4M16 3v4',
  mobile: 'M7 3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM11 19h2',
  sparkles: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
} as const;
export type IconName = keyof typeof PATHS;
export const icon = (name: IconName) =>
  `<svg class="lf-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
