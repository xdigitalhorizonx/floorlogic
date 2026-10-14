// 127.0.0.1-only static server for the compositor page and its inputs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.resolve(HERE, '..');
const MOUNTS = {
  '/comp/': HERE,
  '/stills/': path.join(VIDEO, 'capture', 'stills'),
  '/capture/': path.join(VIDEO, 'capture'),
  '/fonts/': 'C:/dev/floorlogic/public/fonts',
  '/brand/': 'C:/dev/floorlogic/public/brand',
  '/gsap/': 'C:/dev/floorlogic/node_modules/gsap/dist',
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

export function startCompServer(port = 0) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/capture/manifest.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('window.__MANIFEST = ' + fs.readFileSync(path.join(VIDEO, 'capture', 'manifest.json'), 'utf8') + ';');
    }
    const m = Object.keys(MOUNTS).find((k) => p.startsWith(k));
    if (!m) { res.writeHead(404); return res.end(); }
    const f = path.join(MOUNTS[m], p.slice(m.length));
    if (!path.resolve(f).startsWith(path.resolve(MOUNTS[m])) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf ' + p); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, port: server.address().port })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startCompServer(+(process.argv[2] || 4180)).then(({ port }) => console.log(`comp on http://127.0.0.1:${port}/comp/index.html`));
}
