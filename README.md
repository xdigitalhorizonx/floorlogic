# FloorLogic — marketing homepage

> **FloorLogic — The last flooring software you'll ever need.**
> The product-branded resale of the flooring ERP running Landmark Flooring
> (repo `xdigitalhorizonx/landmark-flooring-app`, live at `landmarkflooring.app`).
> v3 identity **"Night Shift"** — from-scratch redesign, 2026-08-24
> (supersedes Field Sheet v2 / PR #1 and the Cobalt Ink 3D site).

Static site, no build step: `index.html` + `css/` + `js/` + `fonts/` + `assets/`.
Open `index.html` or serve the folder with any static server.

## The Night Shift identity

The shop office after close: a dark navy stage, one screen glowing — the
product is the light source. Real app windows (and the faithful New Quote
recreation) sit luminous on the dark ground; site chrome borrows the app's
own button/radius language so page and product read as one system.
Rules (enforced in `css/tokens.css`, the **only** file allowed hex):

- One deliberate dark look. No theme toggle, no grids, no paper textures.
- Soft elevation glows (rgba derived from tokens); rounded app-like corners.
- Type: **Archivo** variable (display at `font-stretch:125%`) + **IBM Plex
  Mono**, vendored woff2 in `fonts/` — no font CDN.
- The `--fl-*` APP SCOPE block carries the product UI's verbatim light
  palette for the builder recreation and window chrome (documented
  exemption, same reason the real screenshots are exempt).
- Sanctioned hex exceptions: `favicon.svg`, `js/vendor/` (minified GSAP).

**Audit:** `node tools/contrast-check.mjs` — WCAG contrast for every
rendered fg/bg pairing plus the hex-outside-tokens scan.

## Motion (one library: vendored GSAP + ScrollTrigger + DrawSVG)

- **Hero (`js/hero.js`)** — the app's New Quote screen, ported verbatim
  from the shipped full-page mockup at near-full size (zoom 0.85), builds
  itself: window rises from the dark, sections install, line 1 types in,
  all eight totals climb (real math — 8.265% tax on materials, $4,615.37
  grand, 36.5% margin), APPROVED slams, the seven module chips light up.
  A subtle 3D lean flattens on scroll (desktop only). Click/Enter replays.
  `?tkt=end|<seconds>` freezes the timeline for headless shots.
- **Follow the job (`js/story.js`)** — pinned scroll story: one scroll
  drives the same QT-322 through the shop — customer phone APPROVED →
  work order CREATED → invoice PAID → job costing 36.5% MARGIN — using
  real app captures in window chrome. Desktop-only pin (matchMedia);
  narrow screens, reduced motion, and no-JS get the four windows stacked
  statically with stamps landed. `?story=N` freezes stage N.
- `js/scroll.js` — proof counters and small scroll pops.
- Everything is authored at its finished state: no-JS and
  `prefers-reduced-motion` render the complete page.

## Trial form

Both forms POST to the live Supabase edge function `notify-trial-signup`
(project `bceaexyuwbigpsamurfu`); PostgREST insert with the publishable key
is the fallback. Same wiring verified end-to-end 2026-08-14; source prefix
`floorlogic-site-v1:*`. Honeypot field: `website`.

## Facts policy

Everything traces to the verified feature inventory in
`H:\My Drive\The Dead Sea Scrolls\Claude Hobby\clients\foundation-flooring-software\brand.md` (§2).
Production stats dated 2026-08-14; the 8-vendor free-trial census dated
2026-08-15 (roll-up note re-checked 2026-08-24), due for re-verification
**2026-11-15**. No testimonials, customer counts, ratings, or logos — one
production user (Landmark), and the page says so. Screenshots are the real
app with invented demo-company data. The live sandbox demo
(`floorlogicdemo.vercel.app`) is linked from the hero and footer.

## Pre-publish TODOs (owner decisions)

- **Final domain** — then add, in one edit: canonical, `og:url`, `og:image`
  (absolute), and `sitemap.xml` (+ `Sitemap:` line in `robots.txt`).
- Terms & Privacy pages, and footer links to them.
- The `<title>` lives in FOUR places (title, og:title, twitter:title,
  JSON-LD WebPage name) — change all four together, always.
- Screenshots still say "Foundation" in the cropped-out sidebar; recapture
  after the app itself is rebranded.
