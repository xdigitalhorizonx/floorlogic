"""FloorLogic logo rebuild: source analysis, lattice fit, gradients, wordmark trace, SVG writer.

Coordinates are continuous source-pixel units of the owner's 1254x1254 PNG: pixel (i, j) covers
[i, i+1] x [j, j+1], which is exactly how an SVG with the same user units rasterises.
"""
import json
import os
import subprocess

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure

BG = np.array([254.2, 254.1, 254.2])  # measured paper colour of the source (it is not pure white)
WORD_SPLIT_Y = 795   # empty band between the mark (ends y=770) and the wordmark (starts y=818)
WORD_SPLIT_X = 646   # gap between "Floor" (ends x=627) and "Logic" (starts x=665)
UP = 4               # wordmark trace upscale factor

# bbox centres of the eight mark pieces in the source (only used to name the components)
MARK_PIECES = {
    'F_top': (519.5, 359.0), 'F_stem': (451.0, 526.0), 'F_arm': (584.0, 482.0),
    'L': (781.5, 454.0),
    'T_top': (659.0, 600.0), 'T_left': (525.0, 643.0), 'T_right': (774.0, 653.0), 'T_bottom': (657.0, 710.5),
}
GROUPS = {'F': ['F_top', 'F_stem', 'F_arm'], 'L': ['L'], 'T': ['T_top', 'T_left', 'T_right', 'T_bottom']}


# ----------------------------------------------------------------------------------------------
# source analysis
# ----------------------------------------------------------------------------------------------
def load_source(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64)


class Source:
    """Connected components of the source + each one's anti-aliasing coverage (alpha).

    Coverage is measured against each component's own fitted (linear) ink colour, i.e. the
    threshold is per colour: alpha = projection of (paper - pixel) onto (paper - ink)."""

    def __init__(self, a):
        self.a = a
        H, W, _ = a.shape
        self.H, self.W = H, W
        ink = BG.min() - a.min(axis=2)
        mask = ink > 64
        lab, _ = ndi.label(mask, structure=np.ones((3, 3)))
        self.lab = lab
        yy, xx = np.mgrid[0:H, 0:W]
        self.alpha = np.zeros((H, W), np.float32)
        self.comps = {}
        for cid, sl in enumerate(ndi.find_objects(lab), 1):
            comp = lab == cid
            if comp.sum() < 50:
                continue
            ys, xs = sl
            interior = ndi.binary_erosion(comp, iterations=3)
            if interior.sum() < 30:
                interior = ndi.binary_erosion(comp, iterations=1)
            iy, ix = np.nonzero(interior)
            A = np.stack([np.ones(len(ix)), ix + 0.5, iy + 0.5], 1)
            coef, *_ = np.linalg.lstsq(A, a[iy, ix], rcond=None)
            pad = 8
            y0, y1 = max(ys.start - pad, 0), min(ys.stop + pad, H)
            x0, x1 = max(xs.start - pad, 0), min(xs.stop + pad, W)
            gx = xx[y0:y1, x0:x1] + 0.5
            gy = yy[y0:y1, x0:x1] + 0.5
            fg = coef[0] + gx[..., None] * coef[1] + gy[..., None] * coef[2]
            dfg = BG - fg
            dpx = BG - a[y0:y1, x0:x1]
            al = (dpx * dfg).sum(2) / np.maximum((dfg ** 2).sum(2), 1e-6)
            reg = ndi.binary_dilation(comp[y0:y1, x0:x1], iterations=4)
            sub = lab[y0:y1, x0:x1]
            reg &= ~ndi.binary_dilation((sub > 0) & (sub != cid), iterations=1)
            al = np.where(reg, np.clip(al, 0.0, 1.0), 0.0).astype(np.float32)
            self.alpha[y0:y1, x0:x1] = np.maximum(self.alpha[y0:y1, x0:x1], al)
            self.comps[cid] = dict(id=cid, bbox=(xs.start, ys.start, xs.stop, ys.stop),
                                   center=((xs.start + xs.stop) / 2, (ys.start + ys.stop) / 2),
                                   off=(x0, y0), alpha=al, interior=interior, coef=coef)
        self.mark = {}
        for name, (ex, ey) in MARK_PIECES.items():
            best = min(self.comps.values(), key=lambda c: (c['center'][0] - ex) ** 2 + (c['center'][1] - ey) ** 2)
            dist = np.hypot(best['center'][0] - ex, best['center'][1] - ey)
            assert dist < 15, f'cannot find mark piece {name} (nearest component {dist:.1f}px away)'
            self.mark[name] = best
        self.word_ids = sorted([c['id'] for c in self.comps.values() if c['bbox'][1] >= WORD_SPLIT_Y],
                               key=lambda i: self.comps[i]['bbox'][0])

    def mask(self, region='mark', thr=0.5):
        m = self.alpha >= thr
        if region == 'mark':
            m[WORD_SPLIT_Y:] = False
        elif region == 'word':
            m[:WORD_SPLIT_Y] = False
        return m

    def comp_mask(self, comp):
        m = np.zeros((self.H, self.W), bool)
        x0, y0 = comp['off']
        h, w = comp['alpha'].shape
        m[y0:y0 + h, x0:x0 + w] = comp['alpha'] >= 0.5
        return m

    def contour(self, comp):
        """Longest 0.5-level contour of a component's coverage, continuous (x, y) coordinates."""
        x0, y0 = comp['off']
        cs = measure.find_contours(np.pad(comp['alpha'], 1), 0.5)
        c = max(cs, key=len)
        return np.stack([c[:, 1] - 1 + x0 + 0.5, c[:, 0] - 1 + y0 + 0.5], 1)

    def interior_pixels(self, comps):
        ys, xs = [], []
        for c in comps:
            iy, ix = np.nonzero(c['interior'])
            ys.append(iy)
            xs.append(ix)
        iy, ix = np.concatenate(ys), np.concatenate(xs)
        return np.stack([ix + 0.5, iy + 0.5], 1), self.a[iy, ix]


# ----------------------------------------------------------------------------------------------
# polygon fitting
# ----------------------------------------------------------------------------------------------
def raw_polygon(pts, eps=2.0, trim=3.0):
    """Corner detection + per-edge total-least-squares line fit (points near corners dropped)."""
    approx = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), eps, True).reshape(-1, 2)
    idx = sorted({int(np.argmin(((pts - v) ** 2).sum(1))) for v in approx})
    edges = []
    for k in range(len(idx)):
        i0, i1 = idx[k], idx[(k + 1) % len(idx)]
        seg = pts[i0:i1 + 1] if i1 > i0 else np.concatenate([pts[i0:], pts[:i1 + 1]])
        p0, p1 = seg[0], seg[-1]
        keep = (np.linalg.norm(seg - p0, axis=1) > trim) & (np.linalg.norm(seg - p1, axis=1) > trim)
        s = seg[keep] if keep.sum() >= 4 else seg
        m = s.mean(0)
        _, _, vt = np.linalg.svd(s - m)
        d = vt[0]
        if np.dot(d, p1 - p0) < 0:
            d = -d
        r = (s - m) @ np.array([-d[1], d[0]])
        edges.append(dict(pts=s, mid=m, dir=d, resid=float(np.abs(r).max())))
    return edges


def _intersect(l1, l2):
    p, r = l1
    q, s = l2
    t = np.linalg.solve(np.array([r, -s]).T, q - p)
    return p + t[0] * r


def free_polygon(edges):
    lines = [(e['mid'], e['dir']) for e in edges]
    return np.array([_intersect(lines[k - 1], lines[k]) for k in range(len(lines))])


def family(e):
    d = e['dir']
    if abs(d[0]) < 0.25 * abs(d[1]):
        return 'x'
    return 'u' if d[1] / d[0] < 0 else 'v'


# Lattice line families:  'x': x = c   'u': y + su*x = c (rises to the right)   'v': y - sv*x = c (falls)
# Which source edge sits on which named lattice line (edges sorted by offset within a family):
EDGE_MAP = {
    'F_top': {'x': ['F_xl', 'F_xr'], 'u': ['F_u1', 'F_u2']},
    'F_stem': {'x': ['F_xl', 'F_xs'], 'u': ['F_u3', 'F_u4']},
    'F_arm': {'x': ['F_xa', 'F_xr'], 'u': ['F_u5', 'F_u6']},
    'L': {'x': ['L_x1', 'L_x2', 'L_x3'], 'v': ['L_v1', 'L_v2', 'L_v3']},
    'T_top': {'u': ['T_u1b', 'T_u2'], 'v': ['T_v1', 'T_v2']},
    'T_right': {'u': ['T_u3', 'T_u4'], 'v': ['T_v1', 'T_v2']},
    'T_left': {'u': ['T_u1a', 'T_u2'], 'v': ['T_v3', 'T_v4']},
    'T_bottom': {'u': ['T_u3', 'T_u4'], 'v': ['T_v3', 'T_v4']},
}


def line_fam(name):
    return name.split('_')[1][0]


def collect_edges(src, s=0.5):
    """Contour points of every source edge, grouped by the named lattice line they belong to."""
    obs, raw = {}, {}
    for piece, fmap in EDGE_MAP.items():
        edges = raw_polygon(src.contour(src.mark[piece]))
        raw[piece] = free_polygon(edges)
        byfam = {}
        for e in edges:
            byfam.setdefault(family(e), []).append(e)
        for fam, names in fmap.items():
            es = byfam.get(fam, [])
            assert len(es) == len(names), f"{piece}: expected {len(names)} '{fam}' edges, found {len(es)}"
            if fam == 'x':
                key = lambda e: e['mid'][0]
            elif fam == 'u':
                key = lambda e: e['mid'][1] + s * e['mid'][0]
            else:
                key = lambda e: e['mid'][1] - s * e['mid'][0]
            for nm, e in zip(names, sorted(es, key=key)):
                obs.setdefault(nm, []).append(e['pts'])
    return {k: np.concatenate(v) for k, v in obs.items()}, raw


def _nvec(fam, su, sv):
    if fam == 'x':
        return np.array([1.0, 0.0])
    if fam == 'u':
        return np.array([su, 1.0])
    return np.array([-sv, 1.0])


def fit_lattice(obs, su=0.5, sv=0.5, constraints=()):
    """Least-squares line offsets (perpendicular residuals) with fixed lattice directions, subject to
    linear equality constraints [({line: weight}, rhs), ...] on the un-normalised offsets
    (x for 'x' lines, y+su*x for 'u' lines, y-sv*x for 'v' lines)."""
    names = sorted(obs)
    idx = {n: i for i, n in enumerate(names)}
    rows, rhs = [], []
    for n in names:
        nv = _nvec(line_fam(n), su, sv)
        nn = np.linalg.norm(nv)
        P = obs[n]
        r = np.zeros((len(P), len(names)))
        r[:, idx[n]] = 1.0 / nn
        rows.append(r)
        rhs.append(P @ nv / nn)
    A, b = np.concatenate(rows), np.concatenate(rhs)
    if constraints:
        C = np.zeros((len(constraints), len(names)))
        d = np.zeros(len(constraints))
        for i, (w, r) in enumerate(constraints):
            for n, wt in w.items():
                C[i, idx[n]] += wt
            d[i] = r
        K = np.block([[2 * A.T @ A, C.T], [C, np.zeros((len(d), len(d)))]])
        c = np.linalg.solve(K, np.concatenate([2 * A.T @ b, d]))[:len(names)]
    else:
        c, *_ = np.linalg.lstsq(A, b, rcond=None)
    res = A @ c - b
    return {n: float(c[idx[n]]) for n in names}, float(np.sqrt((res ** 2).mean())), float(np.abs(res).max())


def equal_gap(a0, a1, b0, b1, su=0.5, sv=0.5):
    """Constraint: perpendicular gap between lines a0->a1 equals the gap b0->b1."""
    na = np.linalg.norm(_nvec(line_fam(a0), su, sv))
    nb = np.linalg.norm(_nvec(line_fam(b0), su, sv))
    return ({a1: 1 / na, a0: -1 / na, b1: -1 / nb, b0: 1 / nb}, 0.0)


def lattice_polygons(off, su=0.5, sv=0.5):
    def xu(x, c):
        return (x, c - su * x)

    def xv(x, c):
        return (x, c + sv * x)

    def uv(a, b):
        x = (a - b) / (su + sv)
        return (x, a - su * x)

    o = off
    polys = {}
    for piece, (xa, xb, ua, ub) in {'F_top': ('F_xl', 'F_xr', 'F_u1', 'F_u2'),
                                    'F_stem': ('F_xl', 'F_xs', 'F_u3', 'F_u4'),
                                    'F_arm': ('F_xa', 'F_xr', 'F_u5', 'F_u6')}.items():
        polys[piece] = [xu(o[xa], o[ua]), xu(o[xb], o[ua]), xu(o[xb], o[ub]), xu(o[xa], o[ub])]
    polys['L'] = [xv(o['L_x1'], o['L_v1']), xv(o['L_x2'], o['L_v1']), xv(o['L_x2'], o['L_v2']),
                  xv(o['L_x3'], o['L_v2']), xv(o['L_x3'], o['L_v3']), xv(o['L_x1'], o['L_v3'])]
    for piece, (ua, ub, va, vb) in {'T_top': ('T_u1b', 'T_u2', 'T_v1', 'T_v2'),
                                    'T_right': ('T_u3', 'T_u4', 'T_v1', 'T_v2'),
                                    'T_left': ('T_u1a', 'T_u2', 'T_v3', 'T_v4'),
                                    'T_bottom': ('T_u3', 'T_u4', 'T_v3', 'T_v4')}.items():
        polys[piece] = [uv(o[ua], o[va]), uv(o[ub], o[va]), uv(o[ub], o[vb]), uv(o[ua], o[vb])]
    return {k: np.array(v, float) for k, v in polys.items()}


def build_mark(src, mode='lattice'):
    """mode 'lattice': exact 2:1 dimetric lattice (slope 0.5), shared grid lines, equal plank gaps,
    equal floor gaps, floor back corner under the room corner.  mode 'traced': free polygons."""
    obs, raw = collect_edges(src)
    if mode == 'traced':
        return {k: np.asarray(v) for k, v in raw.items()}, {}
    cons = [equal_gap('F_u2', 'F_u3', 'F_xs', 'F_xa'),          # F plank gaps equal
            equal_gap('T_u2', 'T_u3', 'T_v2', 'T_v3'),          # floor gaps equal
            ({'T_u1b': 1.0, 'T_v1': -1.0, 'F_xr': -0.5, 'L_x1': -0.5}, 0.0)]  # floor corner x = room corner x
    off, rms, mx = fit_lattice(obs, 0.5, 0.5, cons)
    return lattice_polygons(off), dict(offsets=off, edge_rms=rms, edge_max=mx)


def polygon_area(P):
    P = np.asarray(P)
    return 0.5 * (np.dot(P[:, 0], np.roll(P[:, 1], -1)) - np.dot(P[:, 1], np.roll(P[:, 0], -1)))


def inset_polygon(P, d):
    """Offset every edge of a simple polygon inwards by d (vertices re-intersected)."""
    P = np.asarray(P, float)
    sgn = 1.0 if polygon_area(P) > 0 else -1.0
    n = len(P)
    lines = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        e = (b - a) / np.linalg.norm(b - a)
        nin = sgn * np.array([-e[1], e[0]])
        lines.append((a + nin * d, e))
    return np.array([_intersect(lines[i - 1], lines[i]) for i in range(n)])


# ----------------------------------------------------------------------------------------------
# colour
# ----------------------------------------------------------------------------------------------
def hexc(c):
    c = np.clip(np.round(np.asarray(c, float)), 0, 255).astype(int)
    h = '#%02x%02x%02x' % tuple(c)
    if h[1] == h[2] and h[3] == h[4] and h[5] == h[6]:
        h = '#' + h[1] + h[3] + h[5]
    return h


def _lin(c):
    c = np.asarray(c, float) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _unlin(l):
    l = np.clip(np.asarray(l, float), 0, 1)
    return np.where(l <= 0.0031308, 12.92 * l, 1.055 * l ** (1 / 2.4) - 0.055) * 255


def to_oklch(rgb):
    r, g, b = _lin(rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return np.array([L, np.hypot(A, B), np.degrees(np.arctan2(B, A))])


def from_oklch(lch):
    L, C, h = lch
    A, B = C * np.cos(np.radians(h)), C * np.sin(np.radians(h))
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return _unlin([r, g, b])


def luminance(rgb):
    r, g, b = _lin(rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(c1, c2):
    a, b = luminance(c1), luminance(c2)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def parse_hex(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


# Reversed (on-navy) palette: same hue and chroma, OKLab lightness lifted from the source band
# 0.30-0.46 into 0.62-0.80, so every plane keeps >= 3:1 contrast on #0F1A2E..#1E3A5F
# without going pastel.
REV_L = (0.30, 0.46, 0.62, 0.80)   # source lightness band -> reversed band (linear map)
REV_CHROMA = 1.0


def reverse_color(rgb):
    L, C, h = to_oklch(rgb)
    a0, a1, b0, b1 = REV_L
    L2 = b0 + (L - a0) * (b1 - b0) / (a1 - a0)
    return from_oklch([min(max(L2, 0.0), 0.95), C * REV_CHROMA, h])


# ----------------------------------------------------------------------------------------------
# gradients
# ----------------------------------------------------------------------------------------------
def _hat_basis(t, knots):
    B = np.zeros((len(t), len(knots)))
    for k in range(len(knots)):
        if k > 0:
            m = (t >= knots[k - 1]) & (t <= knots[k])
            B[m, k] = (t[m] - knots[k - 1]) / (knots[k] - knots[k - 1])
        if k < len(knots) - 1:
            m = (t >= knots[k]) & (t <= knots[k + 1])
            B[m, k] = (knots[k + 1] - t[m]) / (knots[k + 1] - knots[k])
    return B


def _fit_stops(t, cols, knots):
    B = _hat_basis(t, knots)
    stops, *_ = np.linalg.lstsq(B, cols, rcond=None)
    rms = np.sqrt(((B @ stops - cols) ** 2).mean(0))
    return stops, rms


def fit_gradient(P, cols, verts, nstops=3, direction=None, snap=None):
    """One userSpaceOnUse linear gradient over a set of pixels.
    P: pixel centres (N,2), cols: colours (N,3), verts: polygon vertices spanning the gradient.
    direction: fixed unit vector, else the principal direction of the fitted colour field;
    snap: candidate 'clean' direction used when it costs < 0.35 levels RMS.
    Inner stop positions are optimised on a 0.02 grid."""
    if direction is None:
        A = np.stack([np.ones(len(P)), P[:, 0], P[:, 1]], 1)
        coef, *_ = np.linalg.lstsq(A, cols, rcond=None)
        g = coef[1:].T
        _, _, vt = np.linalg.svd(g)
        d = vt[0]
        if (g @ d).sum() < 0:
            d = -d
    else:
        d = np.asarray(direction, float)
    d = d / np.linalg.norm(d)

    def solve(d):
        tv = verts @ d
        t0, t1 = tv.min(), tv.max()
        t = (P @ d - t0) / (t1 - t0)
        grid = np.arange(0.06, 0.95, 0.02)
        best = None
        if nstops == 2:
            cands = [[0.0, 1.0]]
        elif nstops == 3:
            cands = [[0.0, k, 1.0] for k in grid]
        else:
            cands = [[0.0, k1, k2, 1.0] for k1 in grid for k2 in grid if k2 > k1 + 0.05]
        for kn in cands:
            stops, rms = _fit_stops(t, cols, np.array(kn))
            score = rms.sum()
            if best is None or score < best[0]:
                best = (score, kn, stops, rms)
        return t0, t1, best

    t0, t1, best = solve(d)
    if snap is not None:
        ds = np.asarray(snap, float) / np.linalg.norm(snap)
        if np.dot(ds, d) < 0:
            ds = -ds
        t0s, t1s, bs = solve(ds)
        if bs[0] <= best[0] + 0.35 * 3:
            d, t0, t1, best = ds, t0s, t1s, bs
    _, knots, stops, rms = best
    cen = verts.mean(0)
    perp = cen - d * (cen @ d)
    return dict(p0=(d * t0 + perp).tolist(), p1=(d * t1 + perp).tolist(), dir=d.tolist(),
                stops=[(float(k), np.clip(c, 0, 255).tolist()) for k, c in zip(knots, stops)],
                rms=rms.tolist())


def gradient_at(g, p):
    p0, p1 = np.array(g['p0']), np.array(g['p1'])
    t = np.clip(np.dot(np.asarray(p) - p0, p1 - p0) / np.dot(p1 - p0, p1 - p0), 0, 1)
    ks = [k for k, _ in g['stops']]
    cs = np.array([c for _, c in g['stops']])
    return np.array([np.interp(t, ks, cs[:, ch]) for ch in range(3)])


def mark_gradients(src, polys):
    out = {}
    for grp, pieces in GROUPS.items():
        P, cols = src.interior_pixels([src.mark[p] for p in pieces])
        verts = np.concatenate([polys[p] for p in pieces])
        if grp == 'F':
            out[grp] = fit_gradient(P, cols, verts, 3, snap=(1, 0))
        elif grp == 'L':
            out[grp] = fit_gradient(P, cols, verts, 3, snap=(0, -1))
        else:
            out[grp] = fit_gradient(P, cols, verts, 4)
    return out


# ----------------------------------------------------------------------------------------------
# wordmark
# ----------------------------------------------------------------------------------------------
def node_env(node_modules):
    return dict(os.environ, NODE_PATH=node_modules)


def trace_masks(files, params, work, node_modules, node_dir):
    jf = os.path.join(work, 'trace-job.json')
    of = os.path.join(work, 'trace-out.json')
    with open(jf, 'w') as f:
        json.dump(dict(params=params, files=files), f)
    subprocess.run(['node', os.path.join(node_dir, 'trace.cjs'), jf, of], check=True,
                   env=node_env(node_modules), capture_output=True)
    with open(of) as f:
        return json.load(f)


def rectilinear_polygon(src, comp):
    """Axis-aligned polygon for letters made only of horizontal/vertical edges (F, l, L, i).
    Returns vertices or None when the letter is not rectilinear."""
    edges = raw_polygon(src.contour(comp), eps=1.5)
    if len(edges) > 14:
        return None
    kinds = []
    for e in edges:
        d = e['dir']
        if abs(d[0]) < 0.035:
            kinds.append('v')
        elif abs(d[1]) < 0.035:
            kinds.append('h')
        else:
            return None
        if e['resid'] > 0.9:
            return None
    if any(kinds[i] == kinds[i - 1] for i in range(len(kinds))):
        return None
    vals = [e['pts'][:, 0].mean() if k == 'v' else e['pts'][:, 1].mean() for e, k in zip(edges, kinds)]
    verts = []
    for i in range(len(edges)):
        a, b = (i - 1) % len(edges), i
        x = vals[a] if kinds[a] == 'v' else vals[b]
        y = vals[a] if kinds[a] == 'h' else vals[b]
        verts.append((x, y))
    return np.array(verts)


def trace_wordmark(src, work, node_modules, node_dir, params=None):
    """Per letter: coverage (per-colour threshold) -> 4x LANCZOS -> >=0.5 -> potrace.
    The tittle becomes a true circle (centre = coverage centroid, r = sqrt(area/pi))."""
    params = params or dict(alphaMax=1.0, optTolerance=0.2, turdSize=2)
    os.makedirs(os.path.join(work, 'masks'), exist_ok=True)
    letters, dot = [], None
    for cid in src.word_ids:
        c = src.comps[cid]
        med = np.median(src.a[np.nonzero(c['interior'])], 0)
        if med[2] - med[0] > 120:
            dot = cid
            continue
        al = c['alpha']
        h, w = al.shape
        big = np.asarray(Image.fromarray(al.astype(np.float32), 'F').resize((w * UP, h * UP), Image.LANCZOS)) >= 0.5
        f = os.path.join(work, 'masks', f'letter-{cid}.png')
        Image.fromarray(np.where(big, 0, 255).astype(np.uint8)).save(f)
        letters.append(dict(cid=cid, file=f, off=c['off'],
                            group='Floor' if c['center'][0] < WORD_SPLIT_X else 'Logic'))
    traced = trace_masks([l['file'] for l in letters], params, work, node_modules, node_dir)
    for l, t in zip(letters, traced):
        ox, oy = l['off']
        sps = []
        for p in t['paths']:
            sp = [('M', (ox + p['start'][0] / UP, oy + p['start'][1] / UP))]
            for s in p['segs']:
                pts = [(ox + x / UP, oy + y / UP) for x, y in s['p']]
                if s['t'] == 'C':
                    sp.append(('C', *pts))
                else:
                    sp.extend([('L', pts[0]), ('L', pts[1])])
            sps.append(sp)
        l['traced'] = sps
        poly = rectilinear_polygon(src, src.comps[l['cid']])
        l['poly'] = None if poly is None else [[('M', tuple(poly[0]))] + [('L', tuple(v)) for v in poly[1:]]]
    d = src.comps[dot]
    al = d['alpha'].astype(np.float64)
    yy, xx = np.mgrid[0:al.shape[0], 0:al.shape[1]]
    m0 = al.sum()
    circle = ((al * (xx + 0.5)).sum() / m0 + d['off'][0], (al * (yy + 0.5)).sum() / m0 + d['off'][1], np.sqrt(m0 / np.pi))
    return letters, circle, dot


def word_colours(src, letters, dot):
    floor = [src.comps[l['cid']] for l in letters if l['group'] == 'Floor']
    logic = [src.comps[l['cid']] for l in letters if l['group'] == 'Logic']
    _, cf = src.interior_pixels(floor)
    P, cl = src.interior_pixels(logic)
    y0 = min(c['bbox'][1] for c in logic)
    y1 = max(c['bbox'][3] for c in logic)
    x0 = min(c['bbox'][0] for c in logic)
    verts = np.array([[x0, y0], [x0, y1]], float)
    g = fit_gradient(P, cl, verts, 3, direction=(0, 1))
    _, cd = src.interior_pixels([src.comps[dot]])
    return dict(floor=np.median(cf, 0), logic=g, dot=np.median(cd, 0))


# ----------------------------------------------------------------------------------------------
# SVG writing
# ----------------------------------------------------------------------------------------------
def fnum(v, nd):
    s = f'{v:.{nd}f}'
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    if s.startswith('0.'):
        s = s[1:]
    elif s.startswith('-0.'):
        s = '-' + s[2:]
    if s in ('-0', '', '-'):
        s = '0'
    return s


def _join(tokens):
    out = ''
    prev_num = False
    for t in tokens:
        is_num = not t[0].isalpha()
        if is_num and prev_num and not t.startswith('-'):
            out += ' '
        out += t
        prev_num = is_num
    return out


def path_d(subpaths, T, nd):
    """Compact path data: absolute M per subpath, relative c/l/h/v, implicit repeats, z."""
    tok = []
    for sp in subpaths:
        cur = None
        last_cmd = None
        for seg in sp:
            kind = seg[0]
            pts = [np.round(np.asarray(T(p), float), nd) for p in seg[1:]]
            if kind == 'M':
                tok += ['M', fnum(pts[0][0], nd), fnum(pts[0][1], nd)]
                cur = pts[0]
                last_cmd = 'M'
                continue
            if kind == 'L':
                dx, dy = pts[0] - cur
                if abs(dx) < 1e-9 and abs(dy) < 1e-9:
                    continue
                if abs(dy) < 1e-9:
                    cmd, nums = 'h', [dx]
                elif abs(dx) < 1e-9:
                    cmd, nums = 'v', [dy]
                else:
                    cmd, nums = 'l', [dx, dy]
                cur = pts[0]
            else:
                rel = [p - cur for p in pts]
                cmd, nums = 'c', [v for p in rel for v in p]
                cur = pts[2]
            if cmd != last_cmd:
                tok.append(cmd)
            tok += [fnum(v, nd) for v in nums]
            last_cmd = cmd
        tok.append('z')
    return _join(tok)


def poly_subpath(P):
    return [('M', tuple(P[0]))] + [('L', tuple(v)) for v in P[1:]]


def _bez(t, p0, p1, p2, p3):
    s = 1 - t
    return s ** 3 * p0 + 3 * s * s * t * p1 + 3 * s * t * t * p2 + t ** 3 * p3


def subpaths_bbox(subpaths, T):
    pts = []
    for sp in subpaths:
        cur = None
        for seg in sp:
            q = [np.asarray(T(p), float) for p in seg[1:]]
            if seg[0] in ('M', 'L'):
                pts.append(q[0])
                cur = q[0]
            else:
                p0, p1, p2, p3 = cur, q[0], q[1], q[2]
                pts += [p0, p3]
                for ax in (0, 1):
                    a = -p0[ax] + 3 * p1[ax] - 3 * p2[ax] + p3[ax]
                    b = 2 * (p0[ax] - 2 * p1[ax] + p2[ax])
                    c = p1[ax] - p0[ax]
                    roots = []
                    if abs(a) < 1e-12:
                        if abs(b) > 1e-12:
                            roots = [-c / b]
                    else:
                        disc = b * b - 4 * a * c
                        if disc >= 0:
                            r = np.sqrt(disc)
                            roots = [(-b + r) / (2 * a), (-b - r) / (2 * a)]
                    pts += [_bez(t, p0, p1, p2, p3) for t in roots if 0 < t < 1]
                cur = p3
    pts = np.array(pts)
    return pts.min(0), pts.max(0)


def gradient_xml(gid, g, T, nd, colour_fn=None):
    p0 = np.asarray(T(g['p0']), float)
    p1 = np.asarray(T(g['p1']), float)
    stops = ''.join(f'<stop offset="{fnum(k, 3)}" stop-color="{hexc(colour_fn(c) if colour_fn else c)}"/>'
                    for k, c in g['stops'])
    return (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{fnum(p0[0], nd)}" y1="{fnum(p0[1], nd)}" '
            f'x2="{fnum(p1[0], nd)}" y2="{fnum(p1[1], nd)}">{stops}</linearGradient>')


def svg_doc(prefix, w, h, defs, body, nd=2):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fnum(w, nd)} {fnum(h, nd)}" role="img" '
            f'aria-labelledby="{prefix}-t"><title id="{prefix}-t">FloorLogic</title>'
            + (f'<defs>{defs}</defs>' if defs else '') + body + '</svg>')


# ----------------------------------------------------------------------------------------------
# rendering (resvg via node)
# ----------------------------------------------------------------------------------------------
def resvg_render(jobs, work, node_modules, node_dir, tag='render'):
    """jobs: [{svgText|svg, out, width|height|zoom, background?}] -> list of PNG paths."""
    jf = os.path.join(work, f'{tag}-jobs.json')
    with open(jf, 'w') as f:
        json.dump(jobs, f)
    subprocess.run(['node', os.path.join(node_dir, 'render.cjs'), jf], check=True,
                   env=node_env(node_modules), capture_output=True)
    return [j['out'] for j in jobs]


def png_alpha(path):
    return np.asarray(Image.open(path).convert('RGBA'))[..., 3] / 255.0


def iou(m1, m2):
    return float((m1 & m2).sum() / max((m1 | m2).sum(), 1))
