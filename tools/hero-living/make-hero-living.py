# Makes the hero's living-room watermark (public/img/hero-living-2400.webp + hero-living-m.webp).
# Owner, 2026-10-20: "a very very light background (almost like a watermark) of a nice living room ...
# super light edge to edge". Picked strength: 12%.
#
# Source: Replicate black-forest-labs/flux-1.1-pro-ultra, 2026-10-20, seed 4102, 21:9 (AI-generated room,
# no people, no brand): a bright Scandinavian living room, pale oak herringbone floor, centred window,
# matching shelves. Steps: find the room's own vertical centre line, mirror its right half so the room is
# exactly symmetric (owner: symmetry, nothing lopsided), take most of the colour out (55% grey), wash it
# 88% into the page's ice blue (--ice-50 #f4f8fe), then export desktop + phone sizes.
#
# Run from the repo root: python tools/hero-living/make-hero-living.py tools/hero-living/source/living-flux.webp
import os
import sys

import numpy as np
from PIL import Image

STRENGTH = 0.12   # how much of the photo survives the wash (owner picked 12% from 8 / 12 / 16)
GREY = 0.55       # share of the photo turned grey, so the brand blues stay in charge
ICE_50 = np.array([244, 248, 254], np.float32)

src = sys.argv[1]
out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'img')
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W = im.shape[:2]

# 1) The room's own vertical axis: the column where the left and right halves match best.
gray = im.mean(axis=2)
band = gray[int(H * 0.08):int(H * 0.62)]
best = None
for c in range(W // 2 - 120, W // 2 + 121, 2):
    w = min(c, W - c, 1100) - 10
    d = float(np.mean(np.abs(band[:, c - w:c] - band[:, c:c + w][:, ::-1])))
    if best is None or d < best[1]:
        best = (c, d)
c = best[0]

# 2) Exact symmetry from the right half (it has the windows at both outer edges).
right = im[:, c:]
sym = np.concatenate([right[:, ::-1], right], axis=1)
print('axis', c, 'mirrored', sym.shape[1], 'x', sym.shape[0])

# 3) Mostly grey, then washed into the page colour.
lum = (0.299 * sym[..., 0] + 0.587 * sym[..., 1] + 0.114 * sym[..., 2])[..., None]
soft = sym * (1 - GREY) + lum * GREY
washed = (ICE_50 * (1 - STRENGTH) + soft * STRENGTH).clip(0, 255).astype(np.uint8)
img = Image.fromarray(washed)


def save(im_, name, width, quality):
    h = round(im_.size[1] * width / im_.size[0])
    path = os.path.join(out_dir, name)
    im_.resize((width, h), Image.LANCZOS).save(path, 'WEBP', quality=quality, method=6)
    print(os.path.abspath(path), width, 'x', h, os.path.getsize(path), 'bytes')


# Desktop: the whole room across the width (shown at 100% width, faded out before the stage).
save(img, 'hero-living-2400.webp', 2400, 72)
# Phone: the centred slice (window, sofa, shelves) about 0.62 wide:tall, 2x for a 390px screen.
sh = img.size[1]
cw = int(sh * 0.62)
x0 = (img.size[0] - cw) // 2
save(img.crop((x0, 0, x0 + cw, sh)), 'hero-living-m.webp', 760, 70)
