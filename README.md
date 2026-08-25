# FloorLogic — marketing homepage

> **FloorLogic — The last flooring software you'll ever need.**
> The product-branded resale of the flooring ERP running Landmark Flooring
> (repo `xdigitalhorizonx/landmark-flooring-app`, live at `landmarkflooring.app`).
> v4 **"THE INSTALL"** — the whole page is one continuous, scroll-driven
> 3D shot (2026-08-25; supersedes Night Shift v3 / PR #2, Field Sheet
> v2 / PR #1, and the Cobalt Ink 3D-hero site on main).

Static site, no build step: `index.html` + `css/` + `js/` + `fonts/` + `assets/`.
Open `index.html` or serve the folder with any static server.

## THE INSTALL — one continuous shot

The steal (per the owner: "steal an idea if you have to") is the
igloo.inc / Apple product-page mechanic: a fixed full-viewport 3D scene
with scroll as the film scrubber. The scene is our own photoreal room —
procedural oak, storefront window, true shadow-mapped sun (the engine
that ran the previous production hero), refactored from time-driven to
progress-driven in `js/vendor/install3d.js` (source of truth:
`install.src.js`, esbuild-bundled; three.js, deterministic, zero image
assets).

Scroll drives five acts over ~930vh (`js/film.js` + GSAP ScrollTrigger):
1. **Open** — bare subfloor, sun pool through the window, glass intro
   panel + trial form + module strip.
2. **The install** — the floor lays itself under your scroll: each board
   falls inside a small trailing window, so a WAVE of boards chases the
   scroll speed. Caption cards drift past.
3. **The quote** — the faithful New Quote recreation rides sticky while
   its line items type in and all eight totals climb, scrubbed; APPROVED
   slams.
4. **The ripple** — customer phone APPROVED → work order CREATED →
   invoice PAID, real captures in window chrome, scrub-staggered.
5. **Landing** — camera pulls up into golden hour; margin close-line +
   proof CTA. Below the film: the standard sections (screens, proof,
   capabilities, census, story, pricing, FAQ, closer) in the Night Shift
   dark skin.

Camera path, lay progress, and light grade are keyframed against film
progress with damped targets (buttery scrub). Engine API:
`__flInstall.setProgress/snapP/progress/planks`; debug params:
`?filmp=0..1` freezes the film, `?flat=1` forces static mode.

**Fallbacks:** no WebGL / under 880px / reduced motion / no JS never get
the `.film-3d` class — the page renders as a complete static site over
`assets/room-poster.jpg` (a real 1920px render from this engine), acts
flowing as normal sections. Verified both modes headlessly (SwiftShader
renders the film in headless Edge; 28-assert suite includes a real
scroll-through with `smooth = 1.000`).

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
