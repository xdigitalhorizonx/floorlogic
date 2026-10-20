"""Build the home hero's handwriting subsets of Caveat (OFL) — one static woff2 per weight.

The paper quote sheet in the hero (src/components/site/HeroCaspar.astro) is the only Caveat text on
the site, so the font is cut down to exactly what the sheet draws (~15 KB for both weights).

usage (python with fonttools, brotli and uharfbuzz):
  node <fonts skill>/scripts/selfhost-font.mjs --google "Caveat:wght@500;700" --subsets latin --out <tmp>
  python -X utf8 -I tools/fonts/caveat-hero.py <tmp>/caveat-latin-500-700.woff2 public/fonts \
      tools/fonts/caveat-hero-600.txt tools/fonts/caveat-hero-700.txt

caveat-hero-600.txt / -700.txt hold the sheet's text at each weight (rows + total / the title), one
line per line on the sheet. tests/logic/hero-caspar.test.ts fails when the sheet's text (which
comes from the sample data) needs a character these files do not hold: add the line, re-run.
/fonts/* is served `immutable` for a year (vercel.json): give a rebuilt file a new name.

For each weight the script
  1. instances the variable font to a static one (wght=600 / 700),
  2. adds U+2248 ≈ as a composite of two of Caveat's own tildes (Caveat has no ≈),
  3. shapes every line with HarfBuzz (calt, kern, liga on, as browsers do) and keeps exactly the
     glyphs that shaping uses, plus the plain digits 0-9 at 600 (amounts come from the data),
  4. subsets with layout closure off, saves woff2, and re-shapes the text with the subset to prove
     the glyph run is unchanged.
"""
import io
import sys

import uharfbuzz as hb
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.varLib import instancer

SRC, OUT, CHARS600, CHARS700 = sys.argv[1:5]
DIGITS = '0123456789'


def static_instance(wght):
    f = TTFont(SRC, lazy=False)
    f.ensureDecompiled()
    return instancer.instantiateVariableFont(f, {'wght': wght})


def add_approx(font):
    """≈ (U+2248) = two Caveat tildes, one above the other, on the tilde's advance."""
    glyf, hmtx, cmap = font['glyf'], font['hmtx'], font['cmap']
    tilde = font.getBestCmap()[ord('~')]
    t = glyf[tilde]
    t.recalcBounds(glyf)
    gap = round((t.yMax - t.yMin) * 0.95)
    comp = Glyph()
    comp.numberOfContours = -1
    comp.components = []
    for dy in (gap // 2, -(gap - gap // 2)):
        c = GlyphComponent()
        c.glyphName, c.x, c.y, c.flags = tilde, 0, dy, 0x4  # ROUND_XY_TO_GRID
        comp.components.append(c)
    name = 'approxequal'
    order = font.getGlyphOrder() + [name]
    font.setGlyphOrder(order)
    glyf.glyphs[name] = comp
    glyf.glyphOrder = order
    hmtx.metrics[name] = hmtx.metrics[tilde]
    for table in cmap.tables:
        if table.isUnicode():
            table.cmap[0x2248] = name
    font['maxp'].numGlyphs = len(order)
    return font


def to_bytes(font, flavor=None):
    b = io.BytesIO()
    font.flavor = flavor
    font.save(b)
    return b.getvalue()


def shape(data, lines):
    face = hb.Face(data)
    hbfont = hb.Font(face)
    out = []
    for line in lines:
        buf = hb.Buffer()
        buf.add_str(line)
        buf.guess_segment_properties()
        hb.shape(hbfont, buf, {'calt': True, 'kern': True, 'liga': True})
        out.append([i.codepoint for i in buf.glyph_infos])
    return out


def build(wght, chars_file, digits=True):
    lines = [l for l in open(chars_file, encoding='utf-8').read().splitlines() if l.strip()]
    data = to_bytes(add_approx(static_instance(wght)))
    font = TTFont(io.BytesIO(data))  # reloaded: integer outlines, as saved
    order = font.getGlyphOrder()
    runs = shape(data, lines)
    used = {order[g] for run in runs for g in run}
    cmap = font.getBestCmap()
    extra = DIGITS if digits else ''
    used |= {cmap[ord(c)] for c in extra}
    if '.notdef' in used:
        missing = sorted({c for l in lines for c in l if ord(c) not in cmap})
        sys.exit(f'wght {wght}: no glyph for {missing}')
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.layout_closure = False
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep the copyright + OFL licence records
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    s = subset.Subsetter(opts)
    unicodes = sorted({ord(c) for l in lines for c in l} | {ord(c) for c in extra})
    s.populate(glyphs=sorted(used), unicodes=unicodes)
    s.subset(font)
    path = f'{OUT}/caveat-hero-{wght}.woff2'
    font.flavor = 'woff2'
    font.save(path)
    # Prove it: the subset shapes the same text to the same glyphs.
    sub = TTFont(path)
    sub_order = sub.getGlyphOrder()
    sub_runs = shape(to_bytes(sub, None), lines)
    def key(f, name):
        coords, _, _ = f['glyf'][name].getCoordinates(f['glyf'])
        return (f['hmtx'][name][0], tuple(map(tuple, coords)))
    want = [[key(font, font.getGlyphOrder()[g]) for g in run] for run in shape(to_bytes(font, None), lines)]
    got = [[key(sub, sub_order[g]) for g in run] for run in sub_runs]
    if want != got:
        sys.exit(f'wght {wght}: subset shapes differently\n{want}\n{got}')
    size = len(open(path, 'rb').read())
    print(f'{path}: {len(sub_order)} glyphs, {size} bytes, {len(lines)} lines shape identically')


build(600, CHARS600)
build(700, CHARS700, digits=False)  # the title: a name and a town
