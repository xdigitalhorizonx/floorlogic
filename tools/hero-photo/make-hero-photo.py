# Prepares the hero background photo (public/img/hero-room-*.webp) from the generated source.
# Source: Replicate black-forest-labs/flux-1.1-pro-ultra, 2026-10-14, seed 1679, 21:9 (AI-generated
# room, no people, no brand). Steps: remove the recessed ceiling lights, mirror the left half about the
# room's own center line so the room is exactly symmetric, then export desktop + phone sizes.
# Run: python tools/hero-photo/make-hero-photo.py tools/hero-photo/source/room-b-flux.webp
import os, sys
import cv2
import numpy as np

src = sys.argv[1]
out_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'img')
im = cv2.imread(src, cv2.IMREAD_COLOR)
H, W = im.shape[:2]

# 1) Ceiling lights: small dark blobs in the bright top band -> inpaint from the surrounding ceiling.
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
top = int(H * 0.30)
mask = np.zeros((H, W), np.uint8)
dark = (gray[:top] < 200).astype(np.uint8)
n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
for i in range(1, n):
    x, y, w, h, area = stats[i]
    if area < 4000 and w < 140 and h < 60:   # light fixtures, not beam edges
        mask[y:y + h, x:x + w][labels[y:y + h, x:x + w] == i] = 255
mask = cv2.dilate(mask, np.ones((9, 9), np.uint8), iterations=2)
im = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA)

# 2) Exact symmetry: find the room's own vertical axis, mirror the left half onto the right.
band = gray[int(H * 0.10):int(H * 0.60)].astype(np.float32)
best = None
for c in range(W // 2 - 60, W // 2 + 61, 2):
    w = min(c, W - c, 900) - 10
    d = float(np.mean(np.abs(band[:, c - w:c] - band[:, c:c + w][:, ::-1])))
    if best is None or d < best[1]:
        best = (c, d)
c = best[0]
left = im[:, :c]
sym = np.concatenate([left, left[:, ::-1]], axis=1)
print('axis', c, 'size', sym.shape[1], 'x', sym.shape[0])

def save(img, name, width, quality):
    h = round(img.shape[0] * width / img.shape[1])
    r = cv2.resize(img, (width, h), interpolation=cv2.INTER_AREA)
    path = os.path.join(out_dir, name)
    cv2.imwrite(path, r, [cv2.IMWRITE_WEBP_QUALITY, quality])
    print(os.path.abspath(path), os.path.getsize(path))

save(sym, 'hero-room-3144.webp', sym.shape[1], 74)
save(sym, 'hero-room-2400.webp', 2400, 74)
# Phone: a centered crop (about 0.63 wide:tall) at 2x for a 390px-wide screen.
cw = int(sym.shape[0] * 0.63)
x0 = (sym.shape[1] - cw) // 2
save(sym[:, x0:x0 + cw], 'hero-room-m.webp', 720, 58)   # washed at ~65%, so a light encode is invisible
