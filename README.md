# FloorLogic — marketing homepage

> **FloorLogic — The last flooring software you'll ever need.**
> The product-branded resale of the flooring ERP running Landmark Flooring
> (repo `xdigitalhorizonx/landmark-flooring-app`, live at `landmarkflooring.app`).
> v2 identity **"Field Sheet"** — full from-scratch redesign, 2026-08-24
> (supersedes the Cobalt Ink dark site of 2026-08-22).

Static site, no build step: `index.html` + `css/` + `js/` + `fonts/` + `assets/`.
Open `index.html` or serve the folder with any static server.

## The Field Sheet identity

The page speaks the visual language of the trade's own paperwork — takeoff
drawings, dimension lines, chalk, rubber stamps, spec schedules — instead of
generic SaaS. Rules (enforced in `css/tokens.css`, the **only** file allowed
to contain hex):

- **Paper is the brand.** One deliberate warm-light theme; no dark mode, no toggle.
- Square corners, hairline rules, hard offset shadows (print/stamp language) —
  never soft blurs. Gradients only as line patterns (grid, hatch), never washes.
- Type: **Archivo** variable (display at `font-stretch:125%` weight 800) +
  **IBM Plex Mono** for every number, label, and annotation. Both vendored as
  woff2 in `fonts/` — no font CDN at runtime.
- Sanctioned hex exceptions: `favicon.svg` (standalone asset; copies of
  `--ink`/`--blaze`) and `js/vendor/` (minified third-party GSAP).

**Audit:** `node tools/contrast-check.mjs` — WCAG contrast for every fg/bg
pairing the site renders, plus the hex-outside-tokens scan.

## Motion

One library on the page: vendored **GSAP** (`js/vendor/gsap.min.js` +
ScrollTrigger + DrawSVG). `js/hero.js` draws the hero takeoff board — walls,
dimensions, room hatching with a blaze "current course" sweep, the counting
tally, the APPROVED stamp, the seven legend chips. `js/scroll.js` runs the
proof counters and scroll stamps.

- The SVG board is authored at its **finished state**: with no JS or with
  `prefers-reduced-motion`, the page renders complete and static. All initial
  hide/offset states are set from JS only.
- `.reveal` hiding is scoped to `html.js` (set by an inline snippet), so no-JS
  never hides content.
- Click / Enter on the board replays the takeoff.
- Deterministic frames for headless verification: `?tkt=end` jumps the
  timeline to the end, `?tkt=<seconds>` freezes it mid-flight.

## Trial form

Both forms POST to the live Supabase edge function `notify-trial-signup`
(project `bceaexyuwbigpsamurfu`) — the endpoint records the request in
`public.trial_signups` and emails the owner; a PostgREST insert with the
publishable key is the fallback. Same wiring the Foundation site verified
end-to-end on 2026-08-14; source prefix `floorlogic-site-v1:*`.
Honeypot field: `website`.

## Facts policy

Everything on the page traces to the verified feature inventory in
`H:\My Drive\The Dead Sea Scrolls\Claude Hobby\clients\foundation-flooring-software\brand.md` (§2).
Production stats are dated (2026-08-14); the 8-vendor free-trial census is dated
(2026-08-15, roll-up note re-checked 2026-08-24) and due for re-verification
**2026-11-15**. No testimonials, customer counts, ratings, or logos — one
production user (Landmark), and the page says so. Product screenshots are the
real app captured from the demo sandbox (invented demo-company data), cropped
to exclude the old Foundation sidebar branding. The hero secondary CTA links
the public sandbox demo at `floorlogicdemo.vercel.app`.

## Pre-publish TODOs (owner decisions)

- **Final domain** — then add, in one edit: `<link rel="canonical">`, `og:url`,
  `og:image` (absolute), and a `sitemap.xml` (+ `Sitemap:` line in `robots.txt`).
- Terms & Privacy pages, and footer links to them.
- The `<title>` lives in FOUR places (title, og:title, twitter:title, JSON-LD
  WebPage name) — change all four together, always.
- Rename note: the in-app screenshots still say "Foundation" in the
  (cropped-out) sidebar; recapture after the app itself is rebranded.
