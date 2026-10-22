# Makes the hero's living-room backdrop (public/img/hero-room-2560.webp, -3056.webp, -m.webp).
# Owner, 2026-10-20: picked "3 · Room under the phone" — the headline on clean white, a real, bright,
# symmetric living room showing from the buttons down, around the phone and the cards (a faded, greyed
# photo and a tile pattern were both rejected).
#
# Source: Replicate black-forest-labs/flux-1.1-pro-ultra, 2026-10-20, seed 4101, 21:9 (AI-generated room,
# no people, no brand): white living room, centred fireplace, two sofas facing each other, sheer curtains,
# light oak floor. Steps: find the room's own vertical centre line and mirror its right half, so the room
# is exactly symmetric (owner: symmetry, nothing lopsided); then export the desktop sizes and the phone slice.
# The page lays a light white veil and fades over it in CSS (HeroCaspar.astro).
#
# Run from the repo root: python tools/hero-room/make-hero-room.py tools/hero-room/source/room-fireplace-flux.webp
import os
import sys

import numpy as np
from PIL import Image

src = sys.argv[1]
out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'img')
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W = im.shape[:2]

# 1) The room's own vertical axis: the column where the left and right halves match best.
gray = im.mean(axis=2)
band = gray[int(H * 0.05):int(H * 0.75)]
best = None
for c in range(W // 2 - 120, W // 2 + 121, 2):
    w = min(c, W - c, 1200) - 10
    d = float(np.mean(np.abs(band[:, c - w:c] - band[:, c:c + w][:, ::-1])))
    if best is None or d < best[1]:
        best = (c, d)
c = best[0]

# 2) Exact symmetry from the right half (plants, curtains and the outer windows on both sides).
right = im[:, c:]
sym = np.concatenate([right[:, ::-1], right], axis=1).clip(0, 255).astype(np.uint8)
img = Image.fromarray(sym)
print('axis', c, 'room', img.size[0], 'x', img.size[1])


def save(im_, name, width, quality):
    h = round(im_.size[1] * width / im_.size[0])
    path = os.path.join(out_dir, name)
    out = im_ if width == im_.size[0] else im_.resize((width, h), Image.LANCZOS)
    out.save(path, 'WEBP', quality=quality, method=6)
    print(os.path.abspath(path), out.size[0], 'x', out.size[1], os.path.getsize(path), 'bytes')


# Desktop: the whole room at full width (1x screens and 2x screens up to ~1520 CSS px wide).
save(img, 'hero-room-2560.webp', 2560, 74)
save(img, 'hero-room-3056.webp', img.size[0], 70)
# Phone: the centred slice behind the phone mock-up, 0.8 wide:tall (1000 px covers 390 CSS px at 2.5x).
sh = img.size[1]
cw = int(sh * 0.8)
x0 = (img.size[0] - cw) // 2
save(img.crop((x0, 0, x0 + cw, sh)), 'hero-room-m.webp', 1000, 70)
