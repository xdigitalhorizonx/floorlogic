# Makes the hero's living-room backdrop (public/img/hero-room-2560.webp, -3056.webp, -m.webp).
# Owner, 2026-10-20: picked "3 · Room under the phone" — the headline on clean white, a real, bright,
# symmetric living room showing from the buttons down, around the phone and the cards (a faded, greyed
# photo and a tile pattern were both rejected).
# 2026-10-22: the AI-made room (Flux, mirrored to exact symmetry) read as AI, so it was swapped for a real
# photograph. A real room is never mirror-perfect; this one is symmetric by its own architecture.
#
# Source: Clay Banks, "A living room filled with furniture and a fire place", Hudson, NY, Sony ILCE-7M3,
# published 2024-10-11. https://unsplash.com/photos/a-living-room-filled-with-furniture-and-a-fire-place-qdavoiFWGQc
# Unsplash License (free commercial use, no attribution required): https://unsplash.com/license
# Downloaded 2026-10-22 from https://images.unsplash.com/photo-1728649054288-61f332ee389b (3200 x 2133).
# Steps: crop the 3:2 photo to the hero's wide band (keeping the fireplace on the centre line), export the
# desktop sizes and the phone slice. The page lays a light white veil and fades over it in CSS (HeroCaspar.astro).
#
# Run from the repo root: python tools/hero-room/make-hero-room.py tools/hero-room/source/room-hudson-claybanks.jpg
import os
import sys

from PIL import Image

src = sys.argv[1]
# Where the wide band sits in the photo: 0 = top, 1 = bottom. The hero shows the band's lower half,
# so this keeps the sofas, rug and floor in view and lets the ceiling go.
anchor = float(sys.argv[2]) if len(sys.argv) > 2 else 0.85
out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'img')
photo = Image.open(src).convert('RGB')
W, H = photo.size

# The hero's backdrop ratio (2560 x 1126, ~2.27:1), full photo width.
bh = round(W * 1126 / 2560)
y0 = round((H - bh) * anchor)
img = photo.crop((0, y0, W, y0 + bh))
print('photo', W, 'x', H, 'band y', y0, '..', y0 + bh)


def save(im_, name, width, quality):
    h = round(im_.size[1] * width / im_.size[0])
    path = os.path.join(out_dir, name)
    out = im_ if width == im_.size[0] else im_.resize((width, h), Image.LANCZOS)
    out.save(path, 'WEBP', quality=quality, method=6)
    print(os.path.abspath(path), out.size[0], 'x', out.size[1], os.path.getsize(path), 'bytes')


# Desktop: the whole room at full width (1x screens and 2x screens up to ~1520 CSS px wide).
save(img, 'hero-room-2560.webp', 2560, 74)
save(img, 'hero-room-3056.webp', min(3056, img.size[0]), 70)
# Phone: the centred slice behind the phone mock-up, 0.8 wide:tall, from the full photo height so the
# room isn't cropped to a sliver (1000 px covers 390 CSS px at 2.5x).
cw = int(H * 0.8)
x0 = (W - cw) // 2
save(photo.crop((x0, 0, x0 + cw, H)), 'hero-room-m.webp', 1000, 70)
