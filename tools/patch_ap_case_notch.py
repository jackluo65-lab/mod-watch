#!/usr/bin/env python3
"""Fill the 12 o'clock notch cut out of the AP case artwork.

Background
----------
The factory's AP case drawing (and its matching bezel drawing) has a semicircular
notch in the material at 12 o'clock: the bore is r191 but the metal only starts at
r~201, leaving a ~23px wide, ~10px deep bite. In the assembled preview the dial
covers it, but on the steps *before* a dial is chosen (bezel / chapter ring /
crystal) it shows the page background as a hole right at 12 o'clock.

What this does
--------------
Bakes the metal back in, using a polar-domain fill so the radial shading of the
bore wall continues across the bite: every notch pixel takes the **median colour
of the opaque pixels at the same radius, a few degrees to either side** (repeated
until enough samples accumulate). A naive "sample the nearest neighbours along the
arc" fill instead picks up the dark inner-wall ring and leaves a grey smudge — see
the git history.

The bezel is deliberately NOT touched: it keeps its matching notch, which is what
lets the dial show through there — exactly as the user described
(「这个按理说表盘遮住的」).

    python tools/patch_ap_case_notch.py --dry
    python tools/patch_ap_case_notch.py
    python tools/patch_ap_case_notch.py --verify
"""
import argparse
import os
import numpy as np
from PIL import Image
from scipy import ndimage

CASES = [f"img/cases/ap/C-AP-{n}.png" for n in (1, 2, 3, 4)]
CX, CY = 400.0, 500.0
ANG_LIMIT = 22.0       # 缺口识别：12 点两侧多少度以内算缺口
FILL_ANG = 40.0        # 取样窗口：两侧各取多少度
REACH = 26             # 缺口半径外的搜索深度
MIN_SAMPLES = 8        # 每个半径至少攒够多少不透明样本才落笔
SKIP_DEG = 6.0         # 先跳过缺口自带的深色描边，再开始取样


def geometry(alpha):
    ys, xs = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
    rr = np.hypot(xs - CX, ys - CY)
    ang = np.degrees(np.arctan2(xs - CX, -(ys - CY)))        # 0 = 12 点
    return rr, ang


def bore_radius(rr, ang, comp):
    away = np.abs(ang) > 40
    sel = comp & away
    bins = ((ang[sel] + 90) // 1).astype(int)
    maxima = [rr[sel][bins == b].max() for b in np.unique(bins)]
    return float(np.median(maxima))


def analyse(path):
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float64)
    alpha = a[..., 3]
    lab, n = ndimage.label(alpha <= 8)
    edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    best, size = 0, 0
    for i in range(1, n + 1):
        if i in edge:
            continue
        s = int((lab == i).sum())
        if s > size:
            best, size = i, s
    comp = lab == best
    rr, ang = geometry(alpha)
    Rb = bore_radius(rr, ang, comp)
    notch = comp & (rr > Rb + 0.5)
    fill = (rr > Rb - 0.5) & (rr < Rb + REACH) & (np.abs(ang) < ANG_LIMIT) & (alpha < 250)
    return a, alpha, rr, ang, Rb, notch, fill


def polar_sample(a, alpha, radius, ang_deg, direction):
    """沿同一半径向外侧角度取样，返回不透明像素颜色列表。"""
    cols = []
    for step in np.arange(SKIP_DEG, FILL_ANG, 0.35):
        t = np.radians(ang_deg + direction * step)
        x = int(round(CX + radius * np.sin(t)))
        y = int(round(CY - radius * np.cos(t)))
        if not (0 <= x < a.shape[1] and 0 <= y < a.shape[0]):
            break
        if alpha[y, x] > 200:
            cols.append(a[y, x, :3])
            if len(cols) >= MIN_SAMPLES:
                break
    return cols


def patch(path, dry=False):
    a, alpha, rr, ang, Rb, notch, fill = analyse(path)
    ys, xs = np.nonzero(fill)
    if not len(ys):
        print(f"  {path}: 无缺口")
        return 0
    out = a.copy()
    rows = {}                                   # 半径(0.5px 量化) → 已算好的中位色
    miss = 0
    for y, x in zip(ys, xs):
        key = round(rr[y, x] * 2) / 2
        if key not in rows:
            cols = polar_sample(a, alpha, key, 0.0, -1) + polar_sample(a, alpha, key, 0.0, +1)
            if len(cols) < 6:
                rows[key] = None
            else:
                rows[key] = np.median(np.array(cols), axis=0)
        col = rows[key]
        if col is None:
            miss += 1
            continue
        out[y, x, :3] = col
        out[y, x, 3] = 255
    if not dry:
        Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(path)
    print(f"  {path}: 开孔 R={Rb:.1f}  缺口 {int(notch.sum())}px  填充 {len(ys) - miss}px"
          f"{'（' + str(miss) + 'px 无样本）' if miss else ''}{'  [dry-run]' if dry else ''}")
    return len(ys) - miss


def verify(path):
    a = np.asarray(Image.open(path).convert("RGBA"))
    rr, ang = geometry(a[..., 3])
    band = (np.abs(ang) < 18) & (rr > 193) & (rr < 215)
    ys, xs = np.nonzero(band & (a[..., 3] < 200))
    print(f"  {path}: 12 点 r193-215 内半透明/透明像素 {len(ys)} 个 {'✅' if len(ys) == 0 else '⚠️'}"
          + (f"  r={rr[ys, xs].min():.1f}..{rr[ys, xs].max():.1f}" if len(ys) else ""))
    return len(ys)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--verify", action="store_true")
    args = ap.parse_args()
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    for p in CASES:
        if args.verify:
            verify(p)
        else:
            patch(p, dry=args.dry)
