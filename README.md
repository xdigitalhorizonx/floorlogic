# FloorLogic — marketing homepage

> **FloorLogic — The last flooring software you'll ever need.**
> The product-branded resale of the flooring ERP running Landmark Flooring
> (repo `xdigitalhorizonx/landmark-flooring-app`, live at `landmarkflooring.app`).
> Successor to the "Foundation Flooring" homepage — full rename + redesign, 2026-08-22.

Static site, no build step: `index.html` + `css/` + `js/` + `assets/`.
Open `index.html` or serve the folder with any static server.

## Color system

`css/tokens.css` is the **only** file allowed to contain hex values — it implements the
"Color system — flooring CRM UI" spec verbatim (neutral gray chrome, one blue accent,
CVD-safe status ramp, true-neutral `--sample-tray`). One sanctioned exception:
`favicon.svg` is a standalone asset that can't reference CSS custom properties, so it
carries literal copies of `--accent` / `--text-inverse`.

- Light theme is the default; the toggle persists to `localStorage` (`floorlogic-theme`).
  Per spec, system dark preference is deliberately **not** auto-applied.
- Status pills/steps always carry icon + text label + color — color never means anything alone.
- No gradients, no glassmorphism, no shadows, no zebra striping, no tinted rows.

**Audit:** `node tools/contrast-check.mjs` — computes WCAG contrast for every fg/bg
pairing the site renders (both themes) and fails on any hex literal outside `tokens.css`.

## Trial form

Both forms POST to the live Supabase edge function `notify-trial-signup`
(project `bceaexyuwbigpsamurfu`) — the endpoint records the request in
`public.trial_signups` and emails the owner; a PostgREST insert with the
publishable key is the fallback. Same wiring the Foundation site verified
end-to-end on 2026-08-14; only the `source` prefix changed (`floorlogic-site-v1:*`).
Honeypot field: `website`.

## Facts policy

Everything on the page traces to the verified feature inventory in
`H:\My Drive\The Dead Sea Scrolls\Claude Hobby\clients\foundation-flooring-software\brand.md` (§2).
Production stats are dated (2026-08-14); the 8-vendor free-trial census is dated
(2026-08-15) and due for re-verification **2026-11-15**. No testimonials, customer
counts, ratings, or logos — one production user (Landmark), and the page says so.
Product screenshots are the real app captured from the demo sandbox (invented
"Summit Ridge Flooring"-style data), cropped to exclude the old Foundation sidebar branding.

## Pre-publish TODOs (owner decisions)

- **Final domain** — then add, in one edit: `<link rel="canonical">`, `og:url`,
  `og:image` (absolute), and a `sitemap.xml` (+ `Sitemap:` line in `robots.txt`).
- Terms & Privacy pages, and footer links to them.
- The `<title>` lives in FOUR places (title, og:title, twitter:title, JSON-LD WebPage
  name) — change all four together, always.
- Rename note: the in-app screenshots still say "Foundation" in the (cropped-out)
  sidebar; recapture after the app itself is rebranded to FloorLogic.
