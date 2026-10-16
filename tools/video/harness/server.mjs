// Offline harness server for filming the FloorLogic app.
// - Binds to 127.0.0.1 ONLY.
// - Serves the exported app pages (index.html, q.html, l.html — `git show origin/main:` from the
//   demo repo, never a live checkout), the app's own scripts/styles (icons.js, mobile.js/.css,
//   caspar.js/.css, document-dates.js), our own config.js (no real keys, no real URL), a local
//   Inter font, the new FloorLogic logo + favicon, and the offline Supabase stand-in.
// - `/mobile` is the phone app: the same index.html (the app switches on location.pathname),
//   exactly like the demo's vercel.json rewrite.
// - /api/* -> 503. Anything unknown -> 404. Nothing is proxied anywhere.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The app's pages and scripts, exported with `git show origin/main:` (never a live checkout).
const SP = process.env.FL_APP_DIR || path.resolve(HERE, '..', 'app-export');
const PUBLIC_DIR = 'C:/dev/floorlogic/public';
const BRAND_DIR = PUBLIC_DIR + '/brand';
const INTER = PUBLIC_DIR + '/fonts/inter-latin-400-800.woff2';

// Own config: never the demo's config.js. The anon key must be non-empty or the
// app refuses to boot ("Supabase config missing"); it is a dummy that no server knows.
// supabase-js itself is the in-memory stand-in (it never uses the URL); the app's few
// direct edge-function calls (`${SUPABASE_URL}/functions/v1/...`: quote email/SMS, the
// "quote approved" notice) land on THIS server, which answers 503 — they never leave 127.0.0.1.
const SB_PREFIX = '/__supabase-offline';
const CONFIG_JS = [
  "// Offline film harness config. No real project URL, no real keys.",
  `window.SUPABASE_URL = location.origin + '${SB_PREFIX}';`,
  "window.SUPABASE_ANON_KEY = 'offline-film-harness';",
  "window.STRIPE_PUBLISHABLE_KEY = '';",
  '',
].join('\n');

// /mobile asks for a web manifest; ours names no icons and no outside URL.
const MANIFEST = JSON.stringify({ name: 'FloorLogic', short_name: 'FloorLogic', start_url: '/mobile', display: 'standalone', background_color: '#ffffff', theme_color: '#0074D3', icons: [] });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

export function brandFile(name) {
  const p = path.join(BRAND_DIR, name);
  return fs.existsSync(p) ? p : null;
}

// The app's sidebar is navy, so it gets the reversed lockup; documents, q.html and the
// phone app's white header get the on-white lockup.
export function logoPaths() {
  return {
    reversed: brandFile('floorlogic-lockup-horizontal-reversed.svg'),
    onWhite: brandFile('floorlogic-lockup-horizontal.svg') || brandFile('floorlogic-lockup.svg'),
    mark: brandFile('floorlogic-mark.svg'),
  };
}

// ---------------------------------------------------------------- never on camera --
// The ONLY changes made to the app's markup, all cosmetic. Every swap is count-asserted
// (the run fails if the source no longer matches), so an app update can never silently
// put something back on camera.
//
// Hidden (display:none) — the "never on camera" list. Everything here is an action that would
// reach a real phone, mail or payment system (or name a real person), so it never appears:
//   #ai-asst-fab, #ai-asst-panel      the older "Casper" AI assistant bubble (/api/assistant)
//   #bug-fab, #bug-panel              bug-report button
//   #notif-popup-container            reminder pop-ups
//   #pay-tab-stripe                   Take Payment's "Charge Card" tab (Stripe)
//   .hdr-share-btn, openShareMenu     quote / WO / invoice Share menus (Email, SMS, "Erick button", links)
//   openLeadShareMenu                 a lead's Share menu (lead link, "Erick button" e-mail)
//   openQuoteEmailModal, sendQuoteSMS quote detail's Email / SMS buttons
//   openUlSendModal                   Settings → Users "e-mail login" button
//   .call-log-card, #new-calls-badge  the Dialpad call log on Leads and its nav badge
//   M.textMenu                        the phone app's Text button (texts from the business line via Dialpad)
//   #m-offer                          "Open the phone app" banner (phones on the desktop site)
//   #sync-trouble-bar                 sync-failure banner (would only ever show a harness fault)
// Call / e-mail / directions LINKS (tel:, mailto:, maps) stay: they only show the cast's
// fictional (775) 555-01xx / 555-05xx numbers and .test addresses, which every screenshot checks.
export const NEVER_ON_CAMERA_INDEX = [
  '#ai-asst-fab', '#ai-asst-panel', '#bug-fab', '#bug-panel', '#notif-popup-container', '#pay-tab-stripe',
  '.hdr-share-btn', 'button[onclick^="openShareMenu"]', 'button[onclick^="openLeadShareMenu"]',
  'button[onclick^="openQuoteEmailModal"]', 'button[onclick^="sendQuoteSMS"]', 'button[onclick^="openUlSendModal"]',
  '.call-log-card', '#new-calls-badge', '[onclick^="M.textMenu"]', '#m-offer', '#sync-trouble-bar',
];
export const NEVER_ON_CAMERA_Q = ['#chat-bubble', '#chat-panel'];
// Text that may never be on screen (checked on every still): the real business's name, owner,
// foundation-sandbox name, toll-free line and contractor license; the old assistant's name;
// card charging; the phone system.
export const BANNED_ON_CAMERA = [/landmark/i, /\berick\b/i, /foundation/i, /855[\s.-]*457[\s.-]*2197/, /0088180/, /casper/i, /charge card/i, /dialpad/i];
const HIDE_INDEX = `<style id="film-harness">${NEVER_ON_CAMERA_INDEX.join(',')}{display:none!important}`
  // the single-image logo keeps the collapsed (icon-only) sidebar tidy: show just the mark
  + '.sidebar.collapsed .logo img{width:34px;height:30px;object-fit:cover;object-position:0 50%}'
  // with Text hidden the phone app's Call / Email / Directions bar closes up to 3 even columns
  + '.m-cbar:has(> [onclick^="M.textMenu"]){grid-template-columns:repeat(3,1fr)}'
  + '</style>';
const HIDE_Q = `<style id="film-harness">${NEVER_ON_CAMERA_Q.join(',')}{display:none!important}</style>`;

const SIDEBAR_LOGO_FROM = '<div class="logo">\n      <img class="logo-mark" src="/floorlogic-mark-dark.png" alt="FloorLogic" width="39" height="40">\n      <span class="logo-text"><img class="logo-word" src="/floorlogic-wordmark-dark.png" alt="" width="129" height="27"></span>\n    </div>';
const SIDEBAR_LOGO_TO = '<div class="logo">\n      <img src="/brand/floorlogic-lockup-horizontal-reversed.svg" alt="FloorLogic" style="height:32px;width:auto;display:block">\n    </div>';

function swapAll(html, swaps, file) {
  for (const [from, to, want = 1] of swaps) {
    const n = typeof from === 'string' ? html.split(from).length - 1 : (html.match(new RegExp(from.source, 'g')) || []).length;
    if (n !== want) throw new Error(`${file} transform expected exactly ${want} match(es), got ${n}: ${String(from).slice(0, 100)}`);
    html = typeof from === 'string' ? html.split(from).join(to) : html.replace(new RegExp(from.source, 'g'), to);
  }
  return html;
}

export function transformIndex(html) {
  // The export may carry CRLF (git autocrlf); the browser does not care, the anchors below do.
  html = html.replace(/\r\n/g, '\n');
  const shareBtns = (html.match(/class="hdr-share-btn"/g) || []).length;
  if (shareBtns !== 3) throw new Error(`index.html: expected 3 Share header buttons to hide, found ${shareBtns}`);
  return swapAll(html, [
    // documents (quote / WO / invoice print headers + PDF export) — the logo on white paper
    [/const LOGO_DATA_URI='data:image\/png;base64,[A-Za-z0-9+/=]+';/, "const LOGO_DATA_URI='/brand/floorlogic-lockup-horizontal.svg';"],
    // the navy sidebar: the demo's old mark + wordmark -> the new reversed lockup
    [SIDEBAR_LOGO_FROM, SIDEBAR_LOGO_TO],
    // the email composer's sign-off logo points at the live demo; never let it be requested
    ["const logoUrl='https://floorlogicdemo.vercel.app/logo.png';", "const logoUrl='/logo.png';"],
    ['</head>\n<body>\n<div class="app" id="app">', HIDE_INDEX + '</head>\n<body>\n<div class="app" id="app">'],
  ], 'index.html');
}
export function transformQ(html) {
  html = html.replace(/\r\n/g, '\n');
  return swapAll(html, [['</head>', HIDE_Q + '</head>']], 'q.html');
}

export function startServer({ port = 0, log = () => {} } = {}) {
  const app = (name) => path.join(SP, name);
  // Static files: url path -> file on disk.
  const files = {
    '/icons.js': app('icons.js'),
    '/mobile.js': app('mobile.js'),
    '/mobile.css': app('mobile.css'),
    '/caspar.js': app('caspar.js'),
    '/caspar.css': app('caspar.css'),
    '/document-dates.js': app('document-dates.js'),
    '/l.html': app('l.html'),
    '/favicon.ico': path.join(PUBLIC_DIR, 'favicon.ico'),
    '/favicon-32.png': path.join(PUBLIC_DIR, 'icon-192.png'),
    '/favicon-192.png': path.join(PUBLIC_DIR, 'icon-192.png'),
    '/mobile-icon-180.png': path.join(PUBLIC_DIR, 'apple-touch-icon.png'),
    '/__harness/sb-stub.js': path.join(HERE, 'sb-stub.js'),
    '/__harness/fixture.json': path.join(HERE, 'fixture.json'),
    '/__harness/inter.woff2': INTER,
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let p = decodeURIComponent(url.pathname);
    const send = (code, type, body, extra = {}) => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
      res.end(body);
    };
    if (p.startsWith('/api/')) { log({ kind: 'api-503', path: p, method: req.method }); return send(503, 'application/json', JSON.stringify({ error: 'offline film harness: /api is disabled' })); }
    if (p.startsWith(SB_PREFIX + '/')) { log({ kind: 'edge-fn-503', path: p.slice(SB_PREFIX.length), method: req.method }); return send(503, 'application/json', JSON.stringify({ error: 'offline film harness: edge functions are disabled' }), { 'Access-Control-Allow-Origin': '*' }); }
    if (p === '/config.js') return send(200, MIME['.js'], CONFIG_JS);
    if (p === '/mobile/') return send(302, 'text/plain', 'to /mobile', { Location: '/mobile' + url.search });
    if (p === '/' || p === '/index.html' || p === '/mobile') {
      return send(200, MIME['.html'], transformIndex(fs.readFileSync(app('demo-main-index.html'), 'utf8')));
    }
    if (p === '/q.html') return send(200, MIME['.html'], transformQ(fs.readFileSync(app('demo-main-q.html'), 'utf8')));
    if (p === '/mobile.webmanifest') return send(200, 'application/manifest+json', MANIFEST);
    // A blank page on the app's origin that loads only the offline store — used to write
    // off-camera story rows while NO app tab is open (so no stale tab can overwrite them).
    if (p === '/__harness/db.html') return send(200, MIME['.html'], '<!doctype html><meta charset="utf-8"><title>store</title><script src="/config.js"></script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    if (p === '/logo.png') {
      // q.html, the phone app header and the email sign-off show <img src="/logo.png"> on white.
      const lp = logoPaths().onWhite || logoPaths().reversed;
      if (!lp) return send(404, 'text/plain', 'no logo yet');
      return send(200, MIME[path.extname(lp)] || 'application/octet-stream', fs.readFileSync(lp));
    }
    if (p.startsWith('/brand/')) {
      const f = brandFile(path.basename(p));
      if (!f) return send(404, 'text/plain', 'not found');
      return send(200, MIME[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f));
    }
    if (p === '/__harness/inter.css') {
      return send(200, MIME['.css'], "@font-face{font-family:'Inter';font-style:normal;font-weight:300 800;font-display:block;src:url(/__harness/inter.woff2) format('woff2');}\n");
    }
    const f = files[p];
    if (!f || !fs.existsSync(f)) { log({ kind: '404', path: p }); return send(404, 'text/plain', 'not found'); }
    send(200, MIME[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f));
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || 4173);
  startServer({ port, log: (e) => console.log(JSON.stringify(e)) }).then(({ port }) => console.log(`harness on http://127.0.0.1:${port}/`));
}
