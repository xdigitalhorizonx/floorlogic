// Offline harness server for filming the FloorLogic app.
// - Binds to 127.0.0.1 ONLY.
// - Serves the LIVE main versions of index.html / q.html (exported with `git show main:`),
//   icons.js, our own config.js (no real keys, no real URL), a local Inter font,
//   the new FloorLogic logo, and the offline Supabase stand-in.
// - /api/* -> 503. Anything unknown -> 404. Nothing is proxied anywhere.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The app's index.html / q.html, exported with `git show main:` (never a live checkout).
const SP = process.env.FL_APP_DIR || path.resolve(HERE, '..', 'app-export');
const BRAND_DIR = 'C:/dev/floorlogic/public/brand';
const INTER = 'C:/dev/floorlogic/public/fonts/inter-latin-400-800.woff2';

// Own config: never the demo's config.js. The anon key must be non-empty or the
// app refuses to boot ("Supabase config missing"); it is a dummy that no server knows.
const CONFIG_JS = [
  "// Offline film harness config. No real project URL, no real keys.",
  "window.SUPABASE_URL = 'https://stub.invalid';",
  "window.SUPABASE_ANON_KEY = 'offline-film-harness';",
  "window.STRIPE_PUBLISHABLE_KEY = '';",
  '',
].join('\n');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webp': 'image/webp',
};

export function brandFile(name) {
  const p = path.join(BRAND_DIR, name);
  return fs.existsSync(p) ? p : null;
}

// Logo choices (filled once the brand agent's files exist). The app's sidebar is navy,
// so the sidebar uses the reversed lockup; documents/q.html sit on white paper.
export function logoPaths() {
  return {
    reversed: brandFile('floorlogic-lockup-horizontal-reversed.svg'),
    onWhite: brandFile('floorlogic-lockup-horizontal.svg') || brandFile('floorlogic-lockup.svg'),
    mark: brandFile('floorlogic-mark.svg'),
  };
}

// The ONLY changes made to the app's markup, all cosmetic and count-asserted (the run
// fails if the source no longer matches): the new FloorLogic logo in the app's logo
// slots; the AI-assistant (Casper) + bug-report buttons, the reminder pop-ups and the
// Take Payment modal's "Charge Card" tab and the closed "Share" header buttons hidden from camera.
const HIDE_INDEX = '<style id="film-harness">#ai-asst-fab,#ai-asst-panel,#bug-fab,#bug-panel,#notif-popup-container,#pay-tab-stripe,.hdr-share-btn,button[onclick^=\"openShareMenu\"]{display:none!important}</style>';
const HIDE_Q = '<style id="film-harness">#chat-bubble,#chat-panel{display:none!important}</style>';
function transformIndex(html) {
  const shareBtns = (html.match(/class="hdr-share-btn"/g) || []).length;
  if (shareBtns !== 3) throw new Error(`index.html: expected 3 Share header buttons to hide, found ${shareBtns}`);
  const swaps = [
    [/const LOGO_DATA_URI='data:image\/png;base64,[A-Za-z0-9+/=]+';/, "const LOGO_DATA_URI='/brand/floorlogic-lockup-horizontal.svg';"],
    ["document.getElementById('sidebar-logo').src=LOGO_DATA_URI;", "document.getElementById('sidebar-logo').src='/brand/floorlogic-lockup-horizontal-reversed.svg';"],
    ['</head>\n<body>\n<div class="app" id="app">', HIDE_INDEX + '</head>\n<body>\n<div class="app" id="app">'],
  ];
  for (const [from, to] of swaps) {
    const n = typeof from === 'string' ? html.split(from).length - 1 : (html.match(new RegExp(from.source, 'g')) || []).length;
    if (n !== 1) throw new Error(`index.html transform expected exactly 1 match, got ${n}: ${String(from).slice(0, 80)}`);
    html = html.replace(from, to);
  }
  return html;
}
function transformQ(html) {
  if ((html.split('</head>').length - 1) !== 1) throw new Error('q.html transform: </head> not unique');
  return html.replace('</head>', HIDE_Q + '</head>');
}

export function startServer({ port = 0, log = () => {} } = {}) {
  const files = {
    '/index.html': path.join(SP, 'demo-main-index.html'),
    '/q.html': path.join(SP, 'demo-main-q.html'),
    '/icons.js': path.join(HERE, 'static', 'icons.js'),
    '/__harness/sb-stub.js': path.join(HERE, 'sb-stub.js'),
    '/__harness/fixture.json': path.join(HERE, 'fixture.json'),
    '/__harness/inter.woff2': INTER,
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const send = (code, type, body, extra = {}) => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
      res.end(body);
    };
    if (p.startsWith('/api/')) { log({ kind: 'api-503', path: p, method: req.method }); return send(503, 'application/json', JSON.stringify({ error: 'offline film harness: /api is disabled' })); }
    if (p === '/config.js') return send(200, MIME['.js'], CONFIG_JS);
    // A blank page on the app's origin that loads only the offline store — used to write
    // off-camera story rows while NO app tab is open (so no stale tab can overwrite them).
    if (p === '/__harness/db.html') return send(200, MIME['.html'], '<!doctype html><meta charset="utf-8"><title>store</title><script src="/config.js"></script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    if (p === '/logo.png') {
      // q.html shows <img src="logo.png"> on white paper.
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
    if (p === '/index.html') return send(200, MIME['.html'], transformIndex(fs.readFileSync(f, 'utf8')));
    if (p === '/q.html') return send(200, MIME['.html'], transformQ(fs.readFileSync(f, 'utf8')));
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
