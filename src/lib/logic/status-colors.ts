/**
 * Status colours: the app's originals and AA-safe site variants.
 *
 * The app paints board column headers as SOLID `var(--<name>)` with white
 * 13px/600 text (main L9128 lead board, L21802 job board), and badges as a
 * 10% tint with darker text (main L1580-1588). Most of the solid colours fail
 * WCAG AA for white text (blue 3.68:1, amber 2.15:1, green 2.54:1…), so the
 * site uses the same hues darkened until white text reaches ≥ 4.5:1. The
 * test suite computes every ratio.
 *
 * Source: main L13-27 (:root light theme), L1580-1588 (badges),
 * L7622-7644 (status → colour name maps), L21252 (job board buckets).
 * Unchanged since the August app.
 */
import type { LeadStatus } from './lead-pipeline';

export type ColorName = 'blue' | 'indigo' | 'amber' | 'pink' | 'green' | 'gray' | 'purple' | 'red' | 'orange';

/** :root light theme, verbatim (main L14-17). */
export const APP_THEME = {
  primary: '#0074D3',
  primaryDark: '#005BA8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  gray: '#6B7280',
  light: '#F3F4F6',
  white: '#FFFFFF',
  black: '#111827',
  border: '#E5E7EB',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  amber: '#F59E0B',
  indigo: '#6366F1',
  pink: '#EC4899',
  green: '#10B981',
  darkGreen: '#059669',
  red: '#DC2626',
  lightGray: '#9CA3AF',
} as const;

/**
 * Solid colour the app paints for each colour name (`var(--name)`).
 * APP BUG: there is no `--orange` in :root, so Final Invoice's solid fill
 * (`var(--orange)`) renders as nothing. '#F97316' is the hue the app's
 * `.badge-orange` tint is built from (rgba(249,115,22,.1), main L1588).
 */
export const APP_SOLID: Readonly<Record<ColorName, string>> = {
  blue: APP_THEME.blue,
  indigo: APP_THEME.indigo,
  amber: APP_THEME.amber,
  pink: APP_THEME.pink,
  green: APP_THEME.green,
  gray: APP_THEME.gray,
  purple: APP_THEME.purple,
  red: APP_THEME.red,
  orange: '#F97316',
};

/** Badge text colours on the 10% tint (main L1580-1588; amber uses --custom-price-fg #B45309). */
export const APP_BADGE_TEXT: Readonly<Record<ColorName, string>> = {
  blue: '#2563EB',
  purple: '#7C3AED',
  amber: '#B45309',
  indigo: '#4F46E5',
  pink: '#BE185D',
  green: '#059669',
  red: '#DC2626',
  gray: '#4B5563',
  orange: '#EA580C',
};

/** Site solids: same hue, dark enough for white text at ≥ 4.5:1. */
export const SITE_SOLID: Readonly<Record<ColorName, string>> = {
  blue: '#2563EB',
  indigo: '#4F46E5',
  amber: '#B45309',
  pink: '#BE185D',
  green: '#047857',
  gray: '#4B5563',
  purple: '#7C3AED',
  red: '#B91C1C',
  orange: '#C2410C',
};

/**
 * Theme roles for the site. Primary #0074D3 already passes with white
 * (4.73:1) so it is kept; success/warning/danger are darkened.
 */
export const SITE_THEME = {
  primary: APP_THEME.primary,
  primaryDark: APP_THEME.primaryDark,
  success: SITE_SOLID.green,
  warning: SITE_SOLID.amber,
  danger: SITE_SOLID.red,
} as const;

export function appHex(name: ColorName): string {
  return APP_SOLID[name];
}
export function siteHex(name: ColorName): string {
  return SITE_SOLID[name];
}

/** Lead status → colour name (main L7622). */
export const LEAD_STATUS_COLOR_NAMES: Readonly<Record<LeadStatus, ColorName>> = {
  new: 'blue',
  site_survey_scheduled: 'indigo',
  send_quote: 'amber',
  follow_up: 'pink',
  approved: 'green',
  lost: 'gray',
};

/** Work-order status → colour name (main L7625). */
export const JOB_STATUS_COLOR_NAMES = {
  order_materials: 'purple',
  materials_ordered: 'indigo',
  ready_to_schedule: 'amber',
  scheduled: 'blue',
  in_progress: 'blue',
  final_invoice: 'orange',
  ready_to_be_paid: 'amber',
  paid: 'green',
  complete: 'green',
  on_hold: 'gray',
  cancelled: 'red',
} as const satisfies Record<string, ColorName>;

/** Invoice status → colour name (main L7644). */
export const INVOICE_STATUS_COLOR_NAMES = {
  unpaid: 'red',
  deposit: 'amber',
  paid: 'green',
  void: 'gray',
} as const satisfies Record<string, ColorName>;

/** Quote status → colour name (main L7623). */
export const QUOTE_STATUS_COLOR_NAMES = {
  draft: 'gray',
  sent: 'blue',
  approved: 'green',
  declined: 'red',
  archived: 'purple',
} as const satisfies Record<string, ColorName>;

// ----------------------------------------------------------- WCAG maths ---

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of '#RRGGBB'. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Badge backgrounds, verbatim (main L1580-1588). Note red's tint is built on
 * #EF4444 (--danger) while the red SOLID is #DC2626 (--red).
 */
export const APP_BADGE_TINT: Readonly<Record<ColorName, string>> = {
  blue: 'rgba(59,130,246,.1)',
  purple: 'rgba(139,92,246,.1)',
  amber: 'rgba(245,158,11,.1)',
  indigo: 'rgba(99,102,241,.1)',
  pink: 'rgba(236,72,153,.1)',
  green: 'rgba(16,185,129,.1)',
  red: 'rgba(239,68,68,.1)',
  gray: 'rgba(107,114,128,.1)',
  orange: 'rgba(249,115,22,.1)',
};
