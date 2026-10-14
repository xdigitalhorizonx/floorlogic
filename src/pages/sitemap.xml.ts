import { SITE } from '../config/site';
const PAGES = ['/', '/pricing', '/compare', '/start', '/about', '/privacy', '/terms'];
export function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map((p) => `  <url><loc>${new URL(p, SITE.url).toString().replace(/\/$/, p === '/' ? '/' : '')}</loc><lastmod>2026-10-14</lastmod></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
