#!/usr/bin/env python3
"""Turn tight-cropped round dial photos into configurator-ready layers.

The dial art arrives as a square PNG cropped flush to the disc, so every file has
a different radius. The configurator wants all of them on the shared 800x1000
canvas with the disc centred on (400,500) at one agreed radius — the parts stack
around that point, so a dial placed anywhere else shows off-centre against the
case, the chapter ring and the hands.

    python tools/prepare_dials.py --src <dir> --out img/dial --radius 208

Writes <out>/<model>.png (800x1000) and <out>/thumb/<model>.png (256 card).
Model id comes from the file name: WD-D0220_White-Dial.png -> WD-D0220.
"""
import argparse
import os
import re

import numpy as np
from PIL import Image, ImageDraw

CANVAS = (800, 1000)
CX, CY = 400, 500
THUMB_BOX = 256
THUMB_DISC = 232          # matches the crystal card rule
THUMB_BG = (245, 245, 246)


def disc_geometry(im):
    """Radius and centre of the disc, from its alpha bounding box."""
    a = np.asarray(im.convert("RGBA"))
    ys, xs = np.nonzero(a[..., 3] > 8)
    if not len(xs):
        raise ValueError("empty layer")
    return ((xs.max() - xs.min() + 1) / 2.0,
            (xs.min() + xs.max()) / 2.0,
            (ys.min() + ys.max()) / 2.0)


def dominant_color(im):
    a = np.asarray(im.convert("RGBA"))
    m = a[..., 3] > 200
    if not m.any():
        m = a[..., 3] > 8
    c = a[..., :3][m].mean(axis=0)
    return "#%02x%02x%02x" % (int(c[0]), int(c[1]), int(c[2]))


def card(radius_px, ss=3):
    big = Image.new("L", (THUMB_BOX * ss, THUMB_BOX * ss), 0)
    c = THUMB_BOX * ss / 2.0
    ImageDraw.Draw(big).ellipse((c - radius_px * ss, c - radius_px * ss,
                                 c + radius_px * ss, c + radius_px * ss), fill=255)
    return big.resize((THUMB_BOX, THUMB_BOX), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", default="img/dial")
    ap.add_argument("--radius", type=float, default=208.0,
                    help="disc radius on the 800x1000 canvas")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    os.makedirs(os.path.join(args.out, "thumb"), exist_ok=True)
    rows = []
    for name in sorted(os.listdir(args.src)):
        if not name.lower().endswith(".png") or name.startswith("."):
            continue
        model = re.split(r"[_]", name)[0]
        src = os.path.join(args.src, name)
        im = Image.open(src).convert("RGBA")
        r, cx, cy = disc_geometry(im)
        s = args.radius / r
        size = (int(round(im.width * s)), int(round(im.height * s)))
        small = im.resize(size, Image.LANCZOS)

        layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        layer.alpha_composite(small, (int(round(CX - cx * s)), int(round(CY - cy * s))))

        # assert the disc really landed on (400,500) at the target radius
        r2, cx2, cy2 = disc_geometry(layer)
        assert abs(cx2 - CX) <= 1 and abs(cy2 - CY) <= 1, f"{model}: off-centre ({cx2},{cy2})"
        assert abs(r2 - args.radius) <= 1.5, f"{model}: radius {r2} != {args.radius}"

        if args.dry:
            rows.append((model, r, r2, cx2, cy2))
            continue

        layer.save(os.path.join(args.out, model + ".png"))

        cardim = Image.new("RGBA", (THUMB_BOX, THUMB_BOX), THUMB_BG + (255,))
        crop = layer.crop((int(round(CX - args.radius)), int(round(CY - args.radius)),
                           int(round(CX + args.radius)), int(round(CY + args.radius))))
        crop = crop.resize((THUMB_DISC, THUMB_DISC), Image.LANCZOS)
        cardim.alpha_composite(crop, ((THUMB_BOX - THUMB_DISC) // 2,) * 2)
        cardim.save(os.path.join(args.out, "thumb", model + ".png"))
        rows.append((model, r, r2, cx2, cy2))

    print(f"{'model':12} {'源半径':>8} {'成品半径':>9} {'圆心':>16}")
    for m, r0, r1, x, y in rows:
        print(f"{m:12} {r0:8.1f} {r1:9.1f} ({x:6.1f},{y:6.1f})")
    print(f"\n{len(rows)} 张 → {args.out}/")


if __name__ == "__main__":
    main()
