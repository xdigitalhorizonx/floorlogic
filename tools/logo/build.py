"""Rebuild the FloorLogic logo + icon set from the owner's raster (see README.md).

    python -I tools/logo/build.py --src "<floorlogic-logo-2026-10-source.png>"

Writes public/brand/*.svg, public/favicon.svg|.ico, apple-touch-icon.png, icon-*.png and
site.webmanifest, then runs QA (IoU vs the source + contact sheet) into --work.
Node helpers (potrace, resvg) are installed into --work, never into the site's node_modules.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import flogo as fl  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
NODE_DIR = os.path.join(HERE, 'node')
NODE_DEPS = {'potrace': '2.1.8', '@resvg/resvg-js': '2.6.2'}
DEFAULT_SRC = 'H:/My Drive/The Dead Sea Scrolls/Brand Assets/floorlogic/logos/floorlogic-logo-2026-10-source.png'

# Layout constants (in source units unless noted)
H_MARK_TO_CAP = 1.25      # horizontal lockup: mark height = 1.25 x cap height
H_GAP_TO_CAP = 0.42       # horizontal lockup: gap mark -> wordmark = 0.42 x cap height
FAV_INSET = 8.0           # favicon: extra inset per piece edge (gaps ~1px at 16px)
FAV_PAD = 0.02            # favicon: padding around the mark (fraction of the square)
REV = dict(floor='#ffffff', logic='#c9d1dc', dot='#3b9bff')
MASKABLE_BG = '#f3f8fd'


def ensure_node(work):
    base = os.path.join(work, 'node')
    nm = os.path.join(base, 'node_modules')
    if all(os.path.exists(os.path.join(nm, *p.split('/'), 'package.json')) for p in NODE_DEPS):
        return nm
    os.makedirs(base, exist_ok=True)
    pj = os.path.join(base, 'package.json')
    if not os.path.exists(pj):
        with open(pj, 'w') as f:
            json.dump({'name': 'floorlogic-logo-tools', 'private': True}, f)
    npm = shutil.which('npm') or shutil.which('npm.cmd')
    subprocess.run([npm, 'install', '--no-audit', '--no-fund', '--prefix', base]
                   + [f'{k}@{v}' for k, v in NODE_DEPS.items()], check=True)
    return nm


def affine(k, tx, ty):
    return lambda p: (k * p[0] + tx, k * p[1] + ty)


def union_bbox(boxes):
    mins = np.min([b[0] for b in boxes], 0)
    maxs = np.max([b[1] for b in boxes], 0)
    return mins, maxs


def snap_box(lo, hi, q=0.1):
    lo = np.floor(np.asarray(lo) / q) * q
    hi = np.ceil(np.asarray(hi) / q) * q
    return lo, hi


class Model:
    """Everything in source units: mark polygons + gradients, wordmark subpaths + colours."""

    def __init__(self, polys, grads, letters, circle, wc, choice):
        self.polys = polys
        self.grads = grads
        self.circle = circle
        self.wc = wc
        self.mark_sp = {g: [fl.poly_subpath(polys[p]) for p in pcs] for g, pcs in fl.GROUPS.items()}
        self.word_sp = {'Floor': [], 'Logic': []}
        for l in letters:
            sps = l['poly'] if choice[l['cid']] == 'poly' else l['traced']
            self.word_sp[l['group']].extend(sps)
        floor_f = min((l for l in letters if l['group'] == 'Floor'), key=lambda l: l['off'][0])
        sp = floor_f['poly'] or floor_f['traced']
        lo, hi = fl.subpaths_bbox(sp, lambda p: p)
        self.cap_top, self.baseline = float(lo[1]), float(hi[1])
        self.cap_h = self.baseline - self.cap_top

    def mark_bbox(self, T):
        return fl.subpaths_bbox([sp for g in self.mark_sp.values() for sp in g], T)

    def word_bbox(self, T):
        lo, hi = fl.subpaths_bbox(self.word_sp['Floor'] + self.word_sp['Logic'], T)
        cx, cy, r = self.circle
        c = np.asarray(T((cx, cy)))
        k = np.asarray(T((1, 0))) - np.asarray(T((0, 0)))
        rr = r * np.hypot(*k)
        return np.minimum(lo, c - rr), np.maximum(hi, c + rr)

    # -- svg fragments ----------------------------------------------------------------------
    def mark_parts(self, prefix, T, nd, rev=False):
        cf = fl.reverse_color if rev else None
        gid = {'F': 'f', 'L': 'l', 'T': 'g'}  # (-t is the <title>)
        defs = ''.join(fl.gradient_xml(f'{prefix}-{gid[k]}', self.grads[k], T, nd, cf) for k in ('F', 'L', 'T'))
        body = ''.join(f'<path fill="url(#{prefix}-{gid[k]})" d="{fl.path_d(self.mark_sp[k], T, nd)}"/>'
                       for k in ('F', 'L', 'T'))
        return defs, body

    def word_parts(self, prefix, T, nd, rev=False):
        cx, cy, r = self.circle
        c = np.asarray(T((cx, cy)))
        k = np.hypot(*(np.asarray(T((1, 0))) - np.asarray(T((0, 0)))))
        if rev:
            defs = ''
            floor_fill, logic_fill, dot_fill = REV['floor'], REV['logic'], REV['dot']
        else:
            defs = fl.gradient_xml(f'{prefix}-w', self.wc['logic'], T, nd)
            floor_fill, logic_fill, dot_fill = fl.hexc(self.wc['floor']), f'url(#{prefix}-w)', fl.hexc(self.wc['dot'])
        body = (f'<path fill="{floor_fill}" fill-rule="evenodd" d="{fl.path_d(self.word_sp["Floor"], T, nd)}"/>'
                f'<path fill="{logic_fill}" fill-rule="evenodd" d="{fl.path_d(self.word_sp["Logic"], T, nd)}"/>'
                f'<circle fill="{dot_fill}" cx="{fl.fnum(c[0], nd)}" cy="{fl.fnum(c[1], nd)}" r="{fl.fnum(r * k, nd)}"/>')
        return defs, body


def build_svgs(m, out_brand):
    """Returns {filename: (svg_text, layout)}; layout = source->file transforms for QA."""
    files = {}
    ident = lambda p: p

    # mark
    lo, hi = snap_box(*m.mark_bbox(ident))
    T = affine(1, -lo[0], -lo[1])
    for rev, name, pre in ((False, 'floorlogic-mark.svg', 'flm'), (True, 'floorlogic-mark-reversed.svg', 'flmr')):
        defs, body = m.mark_parts(pre, T, 2, rev)
        files[name] = (fl.svg_doc(pre, hi[0] - lo[0], hi[1] - lo[1], defs, body),
                       dict(mark=dict(k=1, tx=-lo[0], ty=-lo[1]), size=(hi - lo).tolist()))

    # stacked lockup (geometry exactly as the original)
    lo, hi = snap_box(*union_bbox([m.mark_bbox(ident), m.word_bbox(ident)]))
    T = affine(1, -lo[0], -lo[1])
    for rev, name, pre in ((False, 'floorlogic-lockup-stacked.svg', 'fls'),
                           (True, 'floorlogic-lockup-stacked-reversed.svg', 'flsr')):
        d1, b1 = m.mark_parts(pre, T, 2, rev)
        d2, b2 = m.word_parts(pre, T, 2, rev)
        files[name] = (fl.svg_doc(pre, hi[0] - lo[0], hi[1] - lo[1], d1 + d2, b1 + b2),
                       dict(mark=dict(k=1, tx=-lo[0], ty=-lo[1]), word=dict(k=1, tx=-lo[0], ty=-lo[1]),
                            size=(hi - lo).tolist()))

    # horizontal lockup: mark left, wordmark right, mark centred on the cap-height band
    mlo, mhi = m.mark_bbox(ident)
    mh = mhi[1] - mlo[1]
    k = H_MARK_TO_CAP * m.cap_h / mh
    wlo, whi = m.word_bbox(ident)
    gap = H_GAP_TO_CAP * m.cap_h
    mid = (m.cap_top + m.baseline) / 2
    mtx = wlo[0] - gap - k * (mhi[0] - mlo[0]) - k * mlo[0]
    mty = mid - k * (mlo[1] + mhi[1]) / 2
    Tm0 = affine(k, mtx, mty)
    lo, hi = snap_box(*union_bbox([m.mark_bbox(Tm0), m.word_bbox(ident)]))
    Tm = affine(k, mtx - lo[0], mty - lo[1])
    Tw = affine(1, -lo[0], -lo[1])
    for rev, name, pre in ((False, 'floorlogic-lockup-horizontal.svg', 'flh'),
                           (True, 'floorlogic-lockup-horizontal-reversed.svg', 'flhr')):
        d1, b1 = m.mark_parts(pre, Tm, 2, rev)
        d2, b2 = m.word_parts(pre, Tw, 2, rev)
        files[name] = (fl.svg_doc(pre, hi[0] - lo[0], hi[1] - lo[1], d1 + d2, b1 + b2),
                       dict(mark=dict(k=k, tx=mtx - lo[0], ty=mty - lo[1]), word=dict(k=1, tx=-lo[0], ty=-lo[1]),
                            size=(hi - lo).tolist()))
    os.makedirs(out_brand, exist_ok=True)
    for name, (svg, _) in files.items():
        with open(os.path.join(out_brand, name), 'w', encoding='utf-8', newline='') as f:
            f.write(svg)
    return files


def favicon_svg(m, inset=FAV_INSET, pad=FAV_PAD):
    """Simplified mark for 16-32 px: flat fills (gradient sampled at each piece's centre), every
    piece inset so the plank/tile gaps survive small sizes; dark-mode palette via media query."""
    pieces = []
    for g, pcs in fl.GROUPS.items():
        for p in pcs:
            P = fl.inset_polygon(m.polys[p], inset) if inset else m.polys[p]
            col = fl.gradient_at(m.grads[g], m.polys[p].mean(0))
            pieces.append((P, fl.hexc(col), fl.hexc(fl.reverse_color(col))))
    allp = np.concatenate([p for p, *_ in pieces])
    lo, hi = allp.min(0), allp.max(0)
    side = (hi - lo).max() / (1 - 2 * pad)
    c = (lo + hi) / 2
    s = 64.0 / side  # 64-unit square viewBox
    T = affine(s, 32 - s * c[0], 32 - s * c[1])
    classes = {}
    for _, light, dark in pieces:
        classes.setdefault((light, dark), 'abcdefgh'[len(classes)])
    css = ''.join(f'.{v}{{fill:{l}}}' for (l, d), v in classes.items())
    css_dark = ''.join(f'.{v}{{fill:{d}}}' for (l, d), v in classes.items())
    paths = {}
    for P, light, dark in pieces:
        paths.setdefault(classes[(light, dark)], []).append(fl.poly_subpath(P))
    body = ''.join(f'<path class="{cls}" d="{fl.path_d(sps, T, 2)}"/>' for cls, sps in paths.items())
    defs = ''
    style = f'<style>{css}@media(prefers-color-scheme:dark){{{css_dark}}}</style>'
    svg = fl.svg_doc('flf', 64, 64, defs, style + body)
    return svg, dict(k=s, tx=32 - s * c[0], ty=32 - s * c[1])


def icon_svg(m, size, box_frac, bg=None, maskable_radius=None):
    """Full-detail mark centred on a square canvas (for PNG icons)."""
    ident = lambda p: p
    lo, hi = m.mark_bbox(ident)
    c = (lo + hi) / 2
    if maskable_radius is not None:
        verts = np.concatenate([m.polys[p] for p in m.polys])
        r = np.sqrt(((verts - c) ** 2).sum(1)).max()
        k = maskable_radius * size / r
    else:
        k = box_frac * size / (hi - lo).max()
    T = affine(k, size / 2 - k * c[0], size / 2 - k * c[1])
    defs, body = m.mark_parts('fli', T, 3)
    rect = f'<rect width="{size}" height="{size}" fill="{bg}"/>' if bg else ''
    return fl.svg_doc('fli', size, size, defs, rect + body)


def write_icons(m, out, work, node_modules):
    fav, fav_layout = favicon_svg(m)
    with open(os.path.join(out, 'favicon.svg'), 'w', encoding='utf-8', newline='') as f:
        f.write(fav)
    jobs = [
        dict(svgText=fav, out=os.path.join(work, 'fav-16.png'), width=16),
        dict(svgText=fav, out=os.path.join(work, 'fav-32.png'), width=32),
        dict(svgText=fav, out=os.path.join(work, 'fav-48.png'), width=48),
        dict(svgText=icon_svg(m, 180, 0.70, bg='#ffffff'), out=os.path.join(out, 'apple-touch-icon.png'), width=180),
        dict(svgText=icon_svg(m, 192, 0.86), out=os.path.join(out, 'icon-192.png'), width=192),
        dict(svgText=icon_svg(m, 512, 0.86), out=os.path.join(out, 'icon-512.png'), width=512),
        dict(svgText=icon_svg(m, 512, None, bg=MASKABLE_BG, maskable_radius=0.36),
             out=os.path.join(out, 'icon-maskable-512.png'), width=512),
    ]
    fl.resvg_render(jobs, work, node_modules, NODE_DIR, tag='icons')
    # apple-touch / maskable must be opaque; re-save all PNGs optimised
    for j in jobs[3:]:
        im = Image.open(j['out'])
        if 'apple' in j['out'] or 'maskable' in j['out']:
            im = im.convert('RGB')
        im.save(j['out'], optimize=True)
    frames = [Image.open(os.path.join(work, f'fav-{s}.png')).convert('RGBA') for s in (16, 32, 48)]
    frames[2].save(os.path.join(out, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)],
                   append_images=frames[:2])
    manifest = {
        'name': 'FloorLogic',
        'short_name': 'FloorLogic',
        'start_url': '/',
        'icons': [
            {'src': '/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': '/icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
        'theme_color': '#FFFFFF',
        'background_color': '#FFFFFF',
    }
    with open(os.path.join(out, 'site.webmanifest'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    return fav_layout


def choose_letters(src, letters, work, node_modules):
    """Use the exact axis-aligned polygon for rectilinear letters (F, l, L, i) unless it fits the
    source worse than the potrace outline by more than 0.002 IoU."""
    jobs, keys = [], []
    for l in letters:
        for kind in ('traced', 'poly'):
            if l[kind] is None:
                continue
            d = fl.path_d(l[kind], lambda p: p, 3)
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {src.W} {src.H}">'
                   f'<path fill-rule="evenodd" d="{d}"/></svg>')
            jobs.append(dict(svgText=svg, out=os.path.join(work, f'letter-{l["cid"]}-{kind}.png'), width=src.W))
            keys.append((l['cid'], kind))
    outs = fl.resvg_render(jobs, work, node_modules, NODE_DIR, tag='letters')
    scores = {}
    for (cid, kind), o in zip(keys, outs):
        scores.setdefault(cid, {})[kind] = fl.iou(fl.png_alpha(o) >= 0.5, src.comp_mask(src.comps[cid]))
    choice = {}
    for l in letters:
        s = scores[l['cid']]
        choice[l['cid']] = 'poly' if 'poly' in s and s['poly'] >= s['traced'] - 0.002 else 'traced'
    return choice, scores


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', default=DEFAULT_SRC, help='owner raster (1254x1254 PNG)')
    ap.add_argument('--out', default=os.path.join(REPO, 'public'), help='site public/ folder')
    ap.add_argument('--work', default=os.path.join(tempfile.gettempdir(), 'floorlogic-logo'),
                    help='scratch folder (node tools, masks, renders, QA)')
    ap.add_argument('--mark', choices=['lattice', 'traced'], default='lattice',
                    help='lattice = exact 2:1 rebuild (default); traced = free polygons that follow the raster')
    ap.add_argument('--no-qa', action='store_true')
    args = ap.parse_args()
    os.makedirs(args.work, exist_ok=True)
    node_modules = ensure_node(args.work)

    src = fl.Source(fl.load_source(args.src))
    polys, info = fl.build_mark(src, args.mark)
    grads = fl.mark_gradients(src, polys)
    letters, circle, dot = fl.trace_wordmark(src, args.work, node_modules, NODE_DIR)
    choice, letter_scores = choose_letters(src, letters, args.work, node_modules)
    wc = fl.word_colours(src, letters, dot)
    m = Model(polys, grads, letters, circle, wc, choice)

    files = build_svgs(m, os.path.join(args.out, 'brand'))
    fav_layout = write_icons(m, args.out, args.work, node_modules)

    summary = dict(
        src=args.src, mark_mode=args.mark, lattice=info,
        polys={k: v.round(3).tolist() for k, v in polys.items()},
        gradients=grads, word_colours=dict(floor=fl.hexc(wc['floor']), dot=fl.hexc(wc['dot']), logic=wc['logic']),
        dot_circle=list(map(float, circle)), cap_top=m.cap_top, baseline=m.baseline, cap_h=m.cap_h,
        letters={str(l['cid']): dict(group=l['group'], choice=choice[l['cid']], iou=letter_scores[l['cid']]) for l in letters},
        layouts={k: v[1] for k, v in files.items()}, favicon_layout=fav_layout,
    )
    with open(os.path.join(args.work, 'model.json'), 'w') as f:
        json.dump(summary, f, indent=1, default=float)
    print(f"mark: {args.mark}  edge rms {info.get('edge_rms', 0):.2f}px  cap height {m.cap_h:.2f}")
    for name, (svg, _) in files.items():
        print(f'  brand/{name}  {len(svg.encode())} B')
    for cid, s in summary['letters'].items():
        print(f"  letter {cid} {s['group']}: {s['choice']}  " + ' '.join(f'{k} {v:.4f}' for k, v in s['iou'].items()))
    if not args.no_qa:
        import qa
        qa.run(src, args.out, args.work, node_modules, summary)


if __name__ == '__main__':
    main()
