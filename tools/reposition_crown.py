#!/usr/bin/env python
"""
Reposition 3.8 crowns onto the crown tube hole of the SKX 3.8 / 3.8 MORE cases.

Everything is measured, nothing is hard-coded by eye:

  * case centre  C          -> extreme-value ellipse fit of the case alpha mask
  * tube hole    PHI_HOLE   -> centroid of the DARK blob sitting on the case edge
                               in the 1..5 o'clock sector (measured 22.4 deg for
                               SKX-B-1; the 3.0-position series measure ~0 deg,
                               which is exactly what "3.8 crown" means)
  * crown axis              -> tip (left-most pixel) -> head centre, per crown
  * L                       -> along-axis distance tip -> farthest crown pixel

Each crown is rotated about its own tip so that its axis points along PHI_HOLE,
then translated so that

      outer tip radius  =  r_case(PHI_HOLE) + PROTRUDE

i.e. the head sticks out PROTRUDE px past the case edge (0.14 R, taken from the
reference photo of a real assembled watch).  The tube therefore stays well
inside the case silhouette, and because the crown layer renders BELOW the case
layer its front is covered -- matching the real assembly.

Re-runnable: always reads the pristine exports from SRC (never its own output).
"""
import argparse
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = '/tmp/crown38'                     # pristine PSD exports (full 800x1000 canvas)
OUT_DIR = os.path.join(HERE, 'img', 'crown')
THUMB_DIR = os.path.join(OUT_DIR, 'thumb')

# ---- placement parameters ---------------------------------------------------
CASE = os.path.join(HERE, 'img/cases/skx38/SKX-B-1.png')
PROTRUDE = 38          # px the crown head sticks out past the case edge (~0.13 R)
# Final hand nudge on the 800x1000 canvas, applied AFTER the radial placement.
# Negative X = left, positive Y = down. Requested by the user after eyeballing the
# render: the crown read a touch too far up-right, so shift it slightly down-left.
NUDGE_X = -5
NUDGE_Y = +5
# Calibrated against the factory reference photo: its crown head is centred at t=0.843
# (a fraction of the case outer radius) with the head spanning t 0.554..1.131.
# 38 reproduces that as 0.844 / 0.564..1.124. 44 put the head at 0.920 - i.e. the head
# sat OUTSIDE the case's crown notch instead of nestled in its centre.
THUMB = 256
# -----------------------------------------------------------------------------


def ellipse_extreme(mask):
    """Case centre + radii, robust against lugs."""
    H, W = mask.shape
    ys, xs = np.where(mask)
    cy0 = (ys.min() + ys.max()) / 2.0
    y0, y1 = max(0, int(cy0) - 40), min(H, int(cy0) + 40)
    band = mask[y0:y1]
    rows = np.where(band.any(1))[0]
    L = np.array([np.where(band[i])[0].min() for i in rows])
    R = np.array([np.where(band[i])[0].max() for i in rows])
    cx = (np.median(L) + np.median(R)) / 2.0
    Rx = (np.median(R) - np.median(L)) / 2.0
    x0, x1 = max(0, int(cx) - 40), min(W, int(cx) + 40)
    cb = mask[:, x0:x1]
    cols = np.where(cb.any(0))[0]
    T = np.array([np.where(cb[:, i])[0].min() for i in cols])
    B = np.array([np.where(cb[:, i])[0].max() for i in cols])
    cy = (np.median(T) + np.median(B)) / 2.0
    Ry = (np.median(B) - np.median(T)) / 2.0
    return np.array([cx, cy, Rx, Ry])


def case_geometry(path):
    a = np.array(Image.open(path).convert('RGBA'))
    al = a[..., 3] > 20
    lum = a[..., :3].mean(2)
    C = ellipse_extreme(al)[:2]
    R = ellipse_extreme(al)[2:]

    # outer boundary radius in PIXEL space, per degree
    ys, xs = np.where(al)
    dx, dy = xs - C[0], ys - C[1]
    phi = np.degrees(np.arctan2(dy, dx))
    rad = np.hypot(dx, dy)
    bins = np.arange(-180.0, 180.0, 1.0)
    idx = np.clip(np.floor(phi + 180).astype(int), 0, 359)
    prof = np.zeros(360)
    np.maximum.at(prof, idx, rad)
    for i in range(360):                      # fill empty bins by neighbour
        if prof[i] == 0:
            prof[i] = max(prof[i - 1], prof[(i + 1) % 360])

    # tube hole = compact DARK blob sitting on the case edge, 1..5 o'clock
    cand = (lum[ys, xs] < 130) & (rad > 0.90 * prof[idx]) & \
           (rad < 1.05 * prof[idx]) & (phi > -5) & (phi < 60)
    m = np.zeros(al.shape, bool)
    m[ys[cand], xs[cand]] = True
    m = ndimage.binary_closing(m, np.ones((3, 3)))
    lab, n = ndimage.label(m)
    best = None
    for i in range(1, n + 1):
        yy, xx = np.where(lab == i)
        if len(xx) < 20:
            continue
        w, h = xx.max() - xx.min(), yy.max() - yy.min()
        if max(w, h) > 90:
            continue
        hx, hy = xx.mean(), yy.mean()
        ph = math.degrees(math.atan2(hy - C[1], hx - C[0]))
        rr = math.hypot(hx - C[0], hy - C[1])
        score = abs(rr / prof[int(math.floor(ph + 180)) % 360] - 0.99)
        if best is None or score < best[0]:
            best = (score, ph, rr, (hx, hy), len(xx))
    if best is None:
        raise SystemExit('could not locate the tube hole on ' + path)
    phi_hole = best[1]
    return C, R, prof, phi_hole, best[3], best[4]


def crown_geometry(path):
    """(tip, axis_deg, L, head_centre) of a pristine full-canvas crown export."""
    a = np.array(Image.open(path).convert('RGBA'))
    al = a[..., 3] > 20
    ys, xs = np.where(al)
    x0 = xs.min()
    tip = (float(x0), float(np.median(ys[xs == x0])))
    h = al[ys.min():ys.max() + 1, x0:xs.max() + 1].sum(0)
    hcols = np.where(h >= 0.6 * h.max())[0]
    hx0, hx1 = x0 + hcols.min(), x0 + hcols.max()
    hm = al[:, hx0:hx1 + 1]
    yy, xx = np.where(hm)
    head_c = (float(xx.mean()) + hx0, float(yy.mean()))
    axis = math.degrees(math.atan2(head_c[1] - tip[1], head_c[0] - tip[0]))
    ux, uy = math.cos(math.radians(axis)), math.sin(math.radians(axis))
    L = float(((xs - tip[0]) * ux + (ys - tip[1]) * uy).max())
    return tip, axis, L, head_c


def transform(path, C, prof, phi_hole):
    img = Image.open(path).convert('RGBA')
    tip, axis, L, hc = crown_geometry(path)
    rot = phi_hole - axis
    rotated = img.rotate(-rot, resample=Image.BICUBIC, center=tip, expand=False)
    # after rotating about `tip` the tip stays put (it is the rotation centre)
    r_edge = prof[int(math.floor(phi_hole + 180)) % 360]
    ph = math.radians(phi_hole)
    ux, uy = math.cos(ph), math.sin(ph)
    tgt = (C[0] + (r_edge + PROTRUDE - L) * ux + NUDGE_X,
           C[1] + (r_edge + PROTRUDE - L) * uy + NUDGE_Y)
    dx, dy = round(tgt[0] - tip[0]), round(tgt[1] - tip[1])
    canvas = Image.new('RGBA', img.size, (0, 0, 0, 0))
    canvas.paste(rotated, (dx, dy), rotated)
    return canvas, dict(rot=rot, dx=dx, dy=dy, tip=tip, axis=axis, L=L,
                        r_edge=r_edge, outer=r_edge + PROTRUDE)


def main():
    global PROTRUDE, NUDGE_X, NUDGE_Y
    NUDGE_X, NUDGE_Y = -5, 5
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='only report, do not write')
    ap.add_argument('--protrude', type=float, default=PROTRUDE)
    ap.add_argument('--nudge-x', type=float, default=NUDGE_X)
    ap.add_argument('--nudge-y', type=float, default=NUDGE_Y)
    args = ap.parse_args()
    PROTRUDE = args.protrude
    NUDGE_X, NUDGE_Y = args.nudge_x, args.nudge_y

    C, R, prof, phi_hole, hole_xy, npx = case_geometry(CASE)
    r_edge = prof[int(math.floor(phi_hole + 180)) % 360]
    print('case %s' % os.path.relpath(CASE, HERE))
    print('  centre=(%.1f,%.1f) Rx=%.1f Ry=%.1f' % (C[0], C[1], R[0], R[1]))
    print('  tube hole  phi=%.1f deg  at (%.1f,%.1f)  n=%d px' % (phi_hole, hole_xy[0], hole_xy[1], npx))
    print('  case edge radius at that angle = %.1f px   -> outer tip = %.1f px'
          % (r_edge, r_edge + PROTRUDE))

    files = sorted(f for f in os.listdir(SRC) if f.endswith('.png') and f[0].isupper())
    boxes = []
    for f in files:
        out, info = transform(os.path.join(SRC, f), C, prof, phi_hole)
        a = np.array(out)
        al = a[..., 3] > 10
        ys, xs = np.where(al)
        box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        boxes.append(box)
        print('  %-14s axis %5.1f -> rot %+5.1f  L=%5.1f  shift=(%+4d,%+4d) bbox=%s'
              % (f, info['axis'], info['rot'], info['L'], info['dx'], info['dy'], box))
        if not args.dry:
            out.save(os.path.join(OUT_DIR, f))

    if args.dry:
        return

    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    w, h = x1 - x0, y1 - y0
    pad = int(max(w, h) * 0.35)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    side = max(w, h) + 2 * pad
    crop = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    print('  swatch crop box:', crop)
    os.makedirs(THUMB_DIR, exist_ok=True)
    for f in files:
        img = Image.open(os.path.join(OUT_DIR, f)).convert('RGBA')
        img.crop(crop).resize((THUMB, THUMB), Image.LANCZOS).save(os.path.join(THUMB_DIR, f))
    print('done:', len(files), 'crowns + thumbs')


if __name__ == '__main__':
    main()
