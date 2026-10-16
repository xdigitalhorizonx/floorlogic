/**
 * The app's own line icons, for the try-it modules.
 *
 * FloorLogic writes emoji in its markup ("📦 Order Materials") and swaps the
 * mapped ones for these SVG line icons at run time (icons.js "Landmark Icon
 * Set v1": 24×24 viewBox, 1.75 stroke, currentColor; demo-main-index.html
 * L34086-34155 walks the text nodes of every re-rendered screen and modal).
 * Toasts, the docked totals panel and the customer's page (q.html) are not
 * swept, so they keep plain emoji — the modules do the same.
 *
 * Only the icons the modules use are copied here, verbatim from
 * tools/video/app-export/icons.js.
 */

type IconDef = string | { d: string; fill: string };

const ICONS: Readonly<Record<string, IconDef>> = {
  note: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM13 4v5h5M8 14l4-4 2 2-4 4H8z',
  hammer: 'M14 4l6 6-2 2-2-2-9 9-3-3 9-9-2-2zM8 13l3 3',
  receipt: 'M5 3h14v18l-2-1-2 1-2-1-2 1-2-1-2 1-2-1zM8 7h8M8 11h8M8 15h5',
  box: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M3 7l9 4 9-4M12 11v10M7.5 5l9 4',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 3v4M16 3v4',
  'check-circle': 'M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0zM8 12.5l3 3 5-6',
  'money-bag': 'M9 5h6l1-3-3 1-1-1-1 1-3-1zM5 14c0-4 3-8 7-8s7 4 7 8a7 7 0 0 1-14 0zM10 11h4M11 14h2a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h3M12 10v11',
  document: 'M5 3h9l5 5v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM13 3v6h6M8 13h8M8 17h5',
  calculator: 'M6 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zM8 6h8v3H8zM8.5 13h.01M12 13h.01M15.5 13h.01M8.5 17h.01M12 17h.01M15.5 17h.01',
  ruler: 'M19 19 5 19 19 5zM11 19v-4M14 19v-6M8 19v-2M17 9l-2 2',
  brick: 'M3 5h18v14H3zM3 9h18M3 14h18M10 5v4M14 9v5M9 14v5',
  card: 'M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 11h20',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  'lock-open': 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0',
  radio: 'M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  sparkles: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  'swap-vertical': 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
  clipboard: 'M9 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 4h6',
  truck: 'M3 7a1 1 0 0 1 1-1h10v10H3zM14 10h4l3 3v3h-7zM6 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM15 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  briefcase: 'M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
  'hard-hat': 'M3 18h18M5 18v-2a7 7 0 0 1 14 0v2M9 11V7a3 3 0 0 1 6 0v4',
  'edit-pencil': 'M14 4l6 6-12 12H2v-6z',
  paperclip: 'M21 11 11.5 20.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-9.5 9.5a2 2 0 0 1-3-3l8.5-8.5',
  plus: 'M12 5v14M5 12h14',
  cash: 'M3 7h18v10H3zM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM6 10v.01M18 14v.01',
  cabinet: 'M4 3h16v18H4zM4 9h16M4 15h16M11 6h2M11 12h2M11 18h2',
  x: 'M6 6l12 12M18 6 6 18',
  'arrow-right': 'M4 12h15M13 6l6 6-6 6',
  'arrow-left': 'M20 12H5M11 6l-6 6 6 6',
  check: 'M5 12.5 10 17.5 19 7',
  warning: 'M12 4 2.6 20.5h18.8L12 4zM12 10v5M12 18h.01',
  lightbulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.6.7-1 1.5-1 2.5v.5H9V16c0-1-.4-1.8-1-2.5A6 6 0 0 1 12 3z',
  sunglasses: 'M2 8h20M4 8v3a4 4 0 0 0 7.5 2h1A4 4 0 0 0 20 11V8',
  tag: 'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9zM7.5 7.5h.01',
  'chart-bar': 'M3 21h18M7 13v6M12 9v10M17 5v14',
  users: 'M5 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM2 19a6 6 0 0 1 12 0M14 5.2a3 3 0 1 1 0 5.6M16 14a6 6 0 0 1 6 6',
  user: 'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM4 21a8 8 0 0 1 16 0',
  palette: 'M12 3a9 9 0 1 0 8 13c.5-1.2-.5-2.5-1.8-2.5h-1.7a3 3 0 0 1 0-6h.5C18.5 7.5 19 6 18 4.5A9 9 0 0 0 12 3zM7 11h.01M8 16h.01M13 17h.01M15 7h.01',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'folder-tab': 'M3 8a2 2 0 0 1 2-2h4l1 2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 12h18',
  cart: 'M3 4h2l2 12h12l2-8H6.5M10 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  tools: 'M14 4l6 6-2 2-6-6zM12 6l-9 9 3 3 9-9M9 13l3 3',
  trash: 'M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L18.5 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7',
  'upload-tray': 'M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M7 8l5-5 5 5M12 3v13',
  save: 'M5 4h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM7 4v6h9V4M7 14h10v6H7z',
  prohibit: 'M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM6.3 6.3l11.4 11.4',
  dot: { d: 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z', fill: 'currentColor' },
  wrench: 'M19 5a3 3 0 1 1-3.5 4.85L4.5 20.5 3 19 13.65 8.35A3 3 0 1 1 19 5z',
  shuffle: 'M3 6h3.5L19 18h2M3 18h3.5L10 13M14 11l5-5h2M17 3l4 3-4 3M17 15l4 3-4 3',
  'caret-down-sm': { d: 'M7 10 12 14l5-4z', fill: 'currentColor' },
  'x-circle': 'M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0zM9 9l6 6M15 9l-6 6',
  scroll: 'M5 7a3 3 0 0 1 3-3h11a2 2 0 0 1 2 2v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7M5 18a3 3 0 0 0 3 3M9 9h7M9 13h7',
  write: 'M5 20h14M14 5l5 5-9 9H5v-5z',
  pin: 'M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  home: 'M3 12 12 3l9 9M5 10v10a1 1 0 0 0 1 1h4v-7h4v7h4a1 1 0 0 0 1-1V10',
  phone: 'M22 17v3a2 2 0 0 1-2 2 19 19 0 0 1-17-17 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L8 10a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 1.8-.5l3 .5a2 2 0 0 1 1.7 2z',
  envelope: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l9 7 9-7',
  search: 'M4 11a7 7 0 1 0 14 0 7 7 0 0 0-14 0zM16 16l4 4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 3 8 3 8H3s3-2 3-8zM10 21a2 2 0 0 0 4 0',
  clock: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zM12 7v5l3 2',
  'arrow-up-bar': 'M12 20V6M6 12l6-6 6 6M5 4h14',
  'arrow-down-bar': 'M12 4v14M6 12l6 6 6-6M5 20h14',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-4',
  'rotate-ccw': 'M3 4v6h6M3.5 13a9 9 0 1 0 2.4-9L3 10',
};

/** The app's emoji → icon map (icons.js EMOJI_MAP), for the emoji the modules print. */
const EMOJI: Readonly<Record<string, string>> = {
  '✕': 'x', '→': 'arrow-right', '✓': 'check', '🗑️': 'trash', '🗑': 'trash', '📋': 'clipboard', '📅': 'calendar',
  '💰': 'money-bag', '🔨': 'hammer', '🏷️': 'tag', '✅': 'check-circle', '📦': 'box', '🔍': 'search', '👤': 'user',
  '📐': 'ruler', '👁️': 'eye', '👁': 'eye', '💡': 'lightbulb', '⚠️': 'warning', '⚠': 'warning', '⇅': 'swap-vertical',
  '✏️': 'edit-pencil', '✏': 'edit-pencil', '📍': 'pin', '📝': 'note', '💾': 'save', '←': 'arrow-left', '▾': 'caret-down-sm',
  '🚫': 'prohibit', '📄': 'document', '⭐': 'sparkles', '🎨': 'palette', '🔀': 'shuffle', '↺': 'rotate-ccw',
  '📤': 'upload-tray', '👷': 'hard-hat', '📞': 'phone', '🏠': 'home', '💳': 'card', '🧱': 'brick', '📜': 'scroll',
  '🧑': 'user', '💼': 'briefcase', '💵': 'cash', '🧾': 'receipt', '↩': 'undo', '📊': 'chart-bar', '🔔': 'bell',
  '✉️': 'envelope', '❌': 'x-circle', '🔧': 'wrench', '⚙️': 'tools', '🕒': 'clock', '🔒': 'lock', '👥': 'users',
  '➕': 'plus', '📧': 'envelope', '🔘': 'radio', '🚚': 'truck', '⬆': 'arrow-up-bar', '⬇': 'arrow-down-bar',
  '🛠️': 'tools', '📆': 'calendar', '●': 'dot', '🕶️': 'sunglasses', '🕐': 'clock', '🗂️': 'folder-tab', '📎': 'paperclip',
  '🗄️': 'cabinet', '🔓': 'lock-open', '✗': 'x', '✨': 'sparkles', '☰': 'menu', '🗂': 'folder-tab', '🛒': 'cart',
  '✍️': 'write', '🗓️': 'calendar', '🧮': 'calculator',
};

/** Longest first, so a two-code-point emoji (🗑️) is matched before its base (🗑) — as icons.js does. */
const KEYS = Object.keys(EMOJI).sort((a, b) => b.length - a.length);
const EMOJI_RE = new RegExp(KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

/** One icon as the app draws it (`LFIcons.svg`): 1em square, inherits the text colour. */
export function iconSvg(name: string, cls = 'lf-icon'): string {
  const def = ICONS[name];
  if (!def) return '';
  const inner = typeof def === 'object' ? def.d : def;
  const paint = typeof def === 'object'
    ? ` fill="${def.fill}" stroke="none"`
    : ' fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em"${paint} class="${cls}" aria-hidden="true" focusable="false"><path d="${inner}"/></svg>`;
}

/** Swap every mapped emoji in a plain text run for its icon (`LFIcons.replace`). */
export function iconText(text: string): string {
  return text.replace(EMOJI_RE, (e) => iconSvg(EMOJI[e]!));
}

/**
 * The app's sidebar, collapsed to its icons (main L4166-4196: data-icon per item), with the
 * screen the module shows marked active (rgba(255,255,255,.12) + an inset 3px #3B82F6 bar).
 * Decorative: the module frames do not navigate.
 */
const RAIL: ReadonlyArray<{ key: string; icon: string }> = [
  { key: 'dashboard', icon: 'chart-bar' },
  { key: 'leads', icon: 'clipboard' },
  { key: 'customers', icon: 'user' },
  { key: 'projects', icon: 'folder' },
  { key: 'quotes', icon: 'note' },
  { key: 'jobs', icon: 'hammer' },
  { key: 'invoices', icon: 'receipt' },
  { key: 'job-costing', icon: 'calculator' },
];
export type RailKey = 'dashboard' | 'leads' | 'customers' | 'projects' | 'quotes' | 'jobs' | 'invoices' | 'job-costing';
export function appRailHtml(active: RailKey): string {
  return '<img class="app-rail-mark" src="/brand/floorlogic-mark-reversed.svg" alt="" width="30" height="31" decoding="async">'
    + RAIL.map((r) => `<span class="app-rail-i${r.key === active ? ' on' : ''}">${iconSvg(r.icon)}</span>`).join('');
}

/** Elements whose text the app's sweep never touches. */
const SKIP = /^(textarea|option|script|style|title|svg)$/i;

/**
 * The app's text-node sweep on an HTML string: mapped emoji in TEXT become
 * line icons; tags, attribute values (titles, input values) and the text of
 * <textarea>/<option>/<script>/<style> stay as written. Markup the modules
 * generate is well-formed, so a tag/text split is enough.
 */
export function withAppIcons(html: string): string {
  const parts = html.split(/(<[^>]+>)/);
  let skip = 0;
  let skipTag = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (!p) continue;
    if (p.charCodeAt(0) === 60 /* < */) {
      const m = /^<\/?\s*([a-zA-Z0-9-]+)/.exec(p);
      const tag = m ? m[1]!.toLowerCase() : '';
      if (skip) {
        if (p.startsWith('</') && tag === skipTag) skip = 0;
      } else if (!p.startsWith('</') && SKIP.test(tag) && !p.endsWith('/>')) {
        skip = 1;
        skipTag = tag;
      }
      continue;
    }
    if (!skip) parts[i] = iconText(p);
  }
  return parts.join('');
}
