#!/usr/bin/env python3
"""Make a "thin band" copy of a chapter-ring set.

The generic rings carry a band from r187.6 (bore) to r209.8 (outer edge). The
renderer scales a ring so its OUTER edge just tucks under the aperture:
`k = (aperture + 4) / 209.5`, so the visible band is `aperture - 187.6 * k`. With a
~210px aperture that is an 18px band and the dial can only reach r191.

For a family that wants a **bigger dial**, keep the outer edge where the formula
expects it (209.5) and move the bore outwards instead. The band then becomes
`aperture - 199.4 * k`, and the dial's visible radius grows to `199.4 * k`:

    aperture 210 (insert fitted)  →  dial 191.6 → 203.7,  band 18.4 → 6.3px
    aperture 227 (no insert)      →  dial 207.0 → 220.1,  band 20.2 → 7.1px

This is a **radial remap**: every output pixel at radius r samples the source at
`SRC_IN + (r - to_in) * (SRC_OUT - SRC_IN) / (to_out - to_in)`, same angle. The tick
marks keep their angular width and get compressed radially, which is what a thin
chapter ring actually looks like.

No `index.html` change is needed, and `prefit` must NOT be set — these rings still
have to follow the aperture (insert vs bezel).

    python tools/prepare_chapter_rings.py --out img/chapterRing/vintage
    python tools/prepare_chapter_rings.py --dry      # report only
"""
import argparse
import glob
import os
import numpy as np
from PIL import Image

CX, CY = 400.0, 500.0
SRC_IN, SRC_OUT = 187.6, 209.8      # 通用环带（实测）
TO_IN, TO_OUT = 199.4, 209.5        # 薄环带：外缘保持公式期望的 209.5，内孔外移


def remap(path, to_in, to_out):
    src = np.asarray(Image.open(path).convert("RGBA"))
    ys, xs = np.mgrid[0:src.shape[0], 0:src.shape[1]]
    rr = np.hypot(xs - CX, ys - CY)
    ang = np.arctan2(xs - CX, -(ys - CY))
    scale = (SRC_OUT - SRC_IN) / (to_out - to_in)
    r_src = SRC_IN + (rr - to_in) * scale
    inside = (rr >= to_in) & (rr <= to_out)
    sx = np.round(CX + r_src * np.sin(ang)).astype(int)
    sy = np.round(CY - r_src * np.cos(ang)).astype(int)
    ok = inside & (sx >= 0) & (sx < src.shape[1]) & (sy >= 0) & (sy < src.shape[0])
    out = np.zeros_like(src)
    out[ok] = src[sy[ok], sx[ok]]
    return out


def measure(a):
    alpha = a[..., 3]
    ys, xs = np.nonzero(alpha > 8)
    outer = (xs.max() - xs.min() + 1) / 2
    inner = np.hypot(xs - CX, ys - CY)
    # 内孔：半径方向上第一个不透明处（沿 -x 方向避开可能的缺口）
    row = alpha[500]
    left = np.nonzero(row)[0]
    bore = CX - left.min() if len(left) else float("nan")
    return outer, bore


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="img/chapterRing")
    ap.add_argument("--out", required=True)
    ap.add_argument("--to-inner", type=float, default=TO_IN)
    ap.add_argument("--to-outer", type=float, default=TO_OUT)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    if not args.dry:
        os.makedirs(args.out, exist_ok=True)

    files = sorted(f for f in glob.glob(os.path.join(args.src, "*.png")))
    print(f"{len(files)} 个内影圈 → {args.out}（环带 {SRC_IN}-{SRC_OUT} → "
          f"{args.to_inner}-{args.to_outer}）")
    for p in files:
        a = remap(p, args.to_inner, args.to_outer)
        stem = os.path.basename(p)
        if not args.dry:
            Image.fromarray(a).save(os.path.join(args.out, stem))
        outer, bore = measure(a)
        ys, xs = np.nonzero(a[..., 3] > 8)
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        flag = "✅" if abs(cx - CX) <= 1 and abs(cy - CY) <= 1 else "⚠️"
        if files.index(p) < 3 or flag != "✅":
            print(f"   {stem:14} 外缘 {outer:6.1f}  内孔 {bore:6.1f}  圆心 ({cx:.1f},{cy:.1f}) {flag}"
                  f"{'  [dry-run]' if args.dry else ''}")
