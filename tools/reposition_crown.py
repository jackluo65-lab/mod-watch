#!/usr/bin/env python
"""
Reposition 3.8 crowns onto the crown pocket of the SKX 3.8 / 3.8 MORE cases.

Ground truth measured from the case photos (img/cases/skx38/SKX-B-1.png etc.):
  - ring center           C = (399.5, 499.5)
  - crown-tube pocket     P = (647, 573)   (recessed edge between the two guards)
  - crown axis angle     TH = 16.5 deg below 3 o'clock (upper guard tip ~12deg,
                          lower guard ~18.4deg)
The crown layers exported from the PSD point horizontally (tube -> head, +x).
We rotate each crown about its head center so the tube axis points at C,
then translate so the tube tip tucks TUCK px under the case edge at P.

The crown then renders BELOW the case layer, so its front (tube) is covered
by the case / crown guards — matching the real assembly.

Re-runnable: always reads the pristine exports from SRC (never its own output).
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = '/tmp/crown38'                     # pristine PSD exports (full 800x1000 canvas)
OUT_DIR = os.path.join(HERE, 'img', 'crown')
THUMB_DIR = os.path.join(OUT_DIR, 'thumb')

# ---- placement parameters (tweak here) ------------------------------------
THETA = 16.5        # deg, crown axis below 3 o'clock
POCKET = (647, 573)  # (x, y) where the tube enters the case
TUCK = 20           # px of tube tip hidden under the case edge
THUMB = 256
# ---------------------------------------------------------------------------

U = (math.cos(math.radians(THETA)), math.sin(math.radians(THETA)))


def head_geometry(path):
    """Return (tip_xy, head_center_xy) of a full-canvas crown export."""
    a = np.array(Image.open(path).convert('RGBA'))
    al = a[..., 3] > 10
    ys, xs = np.where(al)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    # column heights -> head = columns at least 40% of max height
    h = al[y0:y1 + 1, x0:x1 + 1].sum(axis=0)
    head_cols = np.where(h >= 0.4 * h.max())[0]
    hx0, hx1 = x0 + head_cols.min(), x0 + head_cols.max()
    m = al[:, hx0:hx1 + 1]
    yy, xx = np.where(m)
    head_c = (float(xx.mean()) + hx0, float(yy.mean()))
    # tube tip: leftmost opaque pixel, take median y of that column
    tip_col = al[:, x0]
    tip_y = float(np.median(np.where(tip_col)[0]))
    return (x0, tip_y), head_c


def transform(path):
    img = Image.open(path).convert('RGBA')
    tip, hc = head_geometry(path)
    # The PSD crowns are ALREADY drawn at the correct ~16-17.5 deg tilt
    # (tube tip sits ~20px above the head center, pointing at the case
    # center). So no rotation — pure translation.
    tgt = (POCKET[0] - U[0] * TUCK, POCKET[1] - U[1] * TUCK)
    dx, dy = round(tgt[0] - tip[0]), round(tgt[1] - tip[1])
    canvas = Image.new('RGBA', img.size, (0, 0, 0, 0))
    canvas.paste(img, (dx, dy), img)
    return canvas, (dx, dy), tip, hc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='only report, do not write')
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(SRC) if f.endswith('.png') and f[0].isupper())
    boxes = []
    for f in files:
        src = os.path.join(SRC, f)
        out, (dx, dy), rtip, hc = transform(src)
        a = np.array(out)
        al = a[..., 3] > 10
        ys, xs = np.where(al)
        box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        boxes.append(box)
        # predicted head center after transform
        phc = (hc[0] + dx, hc[1] + dy)
        print(f'{f:14s} shift=({dx:+4d},{dy:+4d}) bbox={box} head_center=({phc[0]:.0f},{phc[1]:.0f})')
        if not args.dry:
            out.save(os.path.join(OUT_DIR, f))

    if args.dry:
        return

    # unified swatch crop: union bbox + 35% padding, made square
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    w, h = x1 - x0, y1 - y0
    pad = int(max(w, h) * 0.35)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    side = max(w, h) + 2 * pad
    crop = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    print('swatch crop box:', crop)
    os.makedirs(THUMB_DIR, exist_ok=True)
    for f in files:
        img = Image.open(os.path.join(OUT_DIR, f)).convert('RGBA')
        img.crop(crop).resize((THUMB, THUMB), Image.LANCZOS).save(os.path.join(THUMB_DIR, f))
    print('done:', len(files), 'crowns + thumbs')


if __name__ == '__main__':
    main()
