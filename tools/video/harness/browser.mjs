// Network-isolated headless Chrome for filming the FloorLogic app.
// Isolation layers (all on, always):
//   1. --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"  (no DNS for anything else)
//      + a dead proxy for everything but 127.0.0.1 (belt and braces)
//   2. Request interception on every page: only http://127.0.0.1:<port> continues. The few
//      outside URLs the app asks for are ANSWERED LOCALLY (LOCAL_ANSWERS below: supabase-js ->
//      the offline stand-in, Google Fonts -> local Inter, Stripe.js -> an inert script, the
//      weather API -> 503). Every other request is failed and logged.
//   3. Network.setBlockedURLs for supabase / landmark / the live demo / vercel.app.
// assertClean() throws if a forbidden host (supabase, landmark, the live demo, vercel.app,
// openai, dialpad) was ever attempted, or if ANY outside request reached the block rule
// (i.e. the app asked for something no local answer covers) — a run fails on any leak.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(HERE, '../package.json')); // tools/video/node_modules
const puppeteer = require('puppeteer-core');

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FORBIDDEN_HOST = /supabase|landmark|floorlogicdemo|vercel\.app|openai|dialpad/i;

// Outside URLs the app asks for in normal use, answered on this machine (never forwarded).
//   with: what the log says; body/status/type: the local response.
const LOCAL_ANSWERS = [
  { re: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, with: 'offline supabase stand-in', type: 'text/javascript; charset=utf-8', body: (ctx) => ctx.stubSource() },
  { re: /^https:\/\/fonts\.googleapis\.com\/css2/, with: 'local Inter woff2', type: 'text/css; charset=utf-8', body: (ctx) => ctx.interCss() },
  // index.html loads Stripe.js up front (card payments). Card payments are off camera
  // (the Charge Card tab is hidden), so an inert script stands in: window.Stripe stays unset.
  { re: /^https:\/\/js\.stripe\.com\/v3\/?$/, with: 'inert script (Stripe off)', type: 'text/javascript; charset=utf-8', body: () => '/* offline film harness: Stripe.js is not loaded */\n' },
  // The topbar weather chip fetches Open-Meteo on boot. Answered with an error (no invented
  // weather): the app shows its own "no weather" state.
  { re: /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/, with: '503 (weather off in the harness)', status: 503, type: 'application/json', body: () => JSON.stringify({ error: true, reason: 'offline film harness' }) },
];

export async function launchIsolated({ port, freezeAt, logPath, stubSource }) {
  const origin = `http://127.0.0.1:${port}`;
  const isoLog = [];          // every non-local request attempt + outcome
  const pageErrors = [];
  const consoleErrors = [];
  const record = (e) => { isoLog.push({ at: new Date().toISOString(), ...e }); if (logPath) fs.appendFileSync(logPath, JSON.stringify(isoLog[isoLog.length - 1]) + '\n'); };

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,                         // new headless (== --headless=new)
    defaultViewport: null,
    args: [
      '--headless=new',
      '--mute-audio',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--proxy-server=http://127.0.0.1:9',
      '--proxy-bypass-list=127.0.0.1',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-pings',
      '--disable-domain-reliability',
      '--disable-client-side-phishing-detection',
      '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,AutofillServerCommunication,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--lang=en-US',
      '--force-color-profile=srgb',
      '--autoplay-policy=user-gesture-required',
    ],
  });

  // "Copy Customer Link" writes to the clipboard; allow it for the local origin only.
  try { await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']); } catch (_) {}
  // Popups / new targets get the same treatment (and are logged).
  browser.on('targetcreated', async (t) => {
    if (t.type() === 'page') {
      if (!t.opener()) return;               // our own newPage(); isolated there
      record({ kind: 'popup-target', url: t.url() });
      try { const p = await t.page(); if (p && !p.__flIsolated) await isolatePage(p); } catch (_) {}
    } else if (t.type() !== 'browser') {
      record({ kind: 'target', type: t.type(), url: t.url() });
    }
  });

  const interCss = () => `@font-face{font-family:'Inter';font-style:normal;font-weight:300 800;font-display:block;src:url(${origin}/__harness/inter.woff2) format('woff2');}`;
  const answerCtx = { stubSource, interCss };

  async function isolatePage(page) {
    page.__flIsolated = true;
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*', '*supabase.in*', '*supabase.io*', '*landmark*', '*floorlogicdemo*', '*vercel.app*'] });
    cdp.on('Network.requestWillBeSent', (e) => {
      const u = e.request.url;
      if (u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return;
      record({ kind: 'attempt', url: u, type: e.type, initiator: e.initiator && e.initiator.type });
    });
    cdp.on('Network.loadingFailed', (e) => { if (e.blockedReason || /BLOCKED|NAME_NOT_RESOLVED|PROXY/.test(e.errorText || '')) record({ kind: 'failed', requestId: e.requestId, reason: e.blockedReason || e.errorText }); });
    cdp.on('Network.webSocketCreated', (e) => record({ kind: 'websocket-attempt', url: e.url }));
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (u.startsWith(origin + '/') || u === origin) return req.continue();
      if (u.startsWith('data:') || u.startsWith('blob:')) return req.continue();
      // Answered locally (never leaves the machine):
      const ans = LOCAL_ANSWERS.find((a) => a.re.test(u));
      if (ans) {
        record({ kind: 'answered-locally', url: u, with: ans.with });
        return req.respond({ status: ans.status || 200, contentType: ans.type, headers: { 'Access-Control-Allow-Origin': '*' }, body: ans.body(answerCtx) });
      }
      record({ kind: 'blocked', url: u, resourceType: req.resourceType() });
      return req.abort('blockedbyclient');
    });
    page.on('pageerror', (e) => pageErrors.push({ url: page.url(), msg: String(e && e.message || e).split('\n')[0] }));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push({ url: page.url(), msg: m.text().slice(0, 300) }); });
    await page.emulateTimezone('America/Los_Angeles');
    try { await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' }); } catch (_) {}
    await setClock(page, freezeAt || 0);
    // WebSocket/EventSource guards (the stand-in never opens one; this makes sure nothing else does).
    await page.evaluateOnNewDocument(() => {
      const guard = (Name) => {
        const Real = window[Name]; if (!Real) return;
        window[Name] = function (url, ...rest) {
          const u = String(url);
          if (!/^(wss?|https?):\/\/127\.0\.0\.1[:/]/.test(u)) { console.error('[harness] blocked ' + Name + ' to ' + u); throw new Error('offline film harness: ' + Name + ' blocked'); }
          return new Real(url, ...rest);
        };
      };
      guard('WebSocket'); guard('EventSource');
    });
    return page;
  }

  // Demo clock: a fixed start instant that keeps ticking (so timers/debounces work).
  // Applies to the next navigation; window.__flSetNow(ms) moves it without a reload.
  async function setClock(page, ms) {
    if (page.__flClockId) { try { await page.removeScriptToEvaluateOnNewDocument(page.__flClockId); } catch (_) {} }
    const r = await page.evaluateOnNewDocument((freezeMs) => {
      if (!freezeMs) return;
      const RealDate = Date; let base = freezeMs; let perf0 = performance.now();
      const nowMs = () => base + (performance.now() - perf0);
      class FDate extends RealDate {
        constructor(...a) { if (a.length === 0) super(nowMs()); else super(...a); }
        static now() { return Math.floor(nowMs()); }
      }
      window.Date = FDate;
      window.__flSetNow = (ms) => { base = ms; perf0 = performance.now(); };
    }, ms || 0);
    page.__flClockId = r && r.identifier;
    page.__flClockMs = ms;
    try { await page.evaluate((m) => window.__flSetNow && window.__flSetNow(m), ms); } catch (_) {}
  }

  async function newPage({ width, height, dpr, mobile = false, clock } = {}) {
    const page = await browser.newPage();
    await isolatePage(page);
    if (clock) await setClock(page, typeof clock === 'number' ? clock : Date.parse(clock));
    await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
    if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    return page;
  }

  function forbiddenAttempts() {
    return isoLog.filter((e) => e.url && (() => { try { return FORBIDDEN_HOST.test(new URL(e.url).hostname); } catch (_) { return /supabase\.(co|in|io)|landmark|floorlogicdemo|vercel\.app/i.test(e.url); } })());
  }
  // Outside requests no local answer covers (refused at the interception layer).
  function unansweredAttempts() { return isoLog.filter((e) => e.kind === 'blocked' || e.kind === 'websocket-attempt'); }
  function assertClean() {
    const bad = forbiddenAttempts();
    if (bad.length) { const err = new Error('ISOLATION FAILURE: forbidden host attempted: ' + [...new Set(bad.map((b) => b.url))].join(', ')); err.bad = bad; throw err; }
    const stray = unansweredAttempts();
    if (stray.length) { const err = new Error('ISOLATION FAILURE: outside request(s) with no local answer: ' + [...new Set(stray.map((b) => b.url))].join(', ')); err.bad = stray; throw err; }
  }
  return { browser, newPage, setClock, isoLog, pageErrors, consoleErrors, assertClean, forbiddenAttempts, unansweredAttempts, origin };
}
