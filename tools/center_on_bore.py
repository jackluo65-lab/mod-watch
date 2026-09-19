#!/usr/bin/env python3
"""把 800x1000 的零件图按【中央开孔中心】对齐到画布中心 (400,500)。

为什么不用 bbox：
  表壳的 bbox 会被「表冠护桥（向右凸出）」和不对称表耳带偏，实测偏 4~12px。
  配件（表圈/内影圈/插入/表盘）全部围绕画布中心绘制，所以表壳的开孔必须落在 (400,500)，
  否则每一个配件都会整体偏向一侧。

开孔的测量口径：
  开孔 = **最大的、且不接触画布边缘的透明连通域**（scipy.ndimage.label(~mask)）。
  不要用逐行左右轮廓拟合圆 —— 表耳会把拟合带偏。

用法：
  python center_on_bore.py <in.png> [<in2.png> ...] -o <out_dir>            # 单图模式
  python center_on_bore.py --pairs a.png:b.png -o <out_dir>                 # 用 a 的开孔给 b 对齐
  python center_on_bore.py ... --dry                                        # 只报告不写

--pairs 的用途：表圈/内影圈这类圆形零件的开孔圆心与表壳完全一致，
  用同一张图测出的 delta 平移，能保证同心（bbox 在这类图上也可能差 4px）。
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

CANVAS = (800, 1000)
CENTER = (400.0, 500.0)


def bore_center(src):
    """src 可为路径或 PIL.Image。返回 (cx, cy, area)；找不到开孔返回 (None, None, 0)。"""
    im = src if isinstance(src, Image.Image) else Image.open(src)
    a = np.asarray(im.convert("RGBA"))
    mask = a[..., 3] > 8
    holes = ~mask
    lab, n = ndimage.label(holes)
    edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    best, best_sz = 0, 0
    for i in range(1, n + 1):
        if i in edge:
            continue
        sz = int((lab == i).sum())
        if sz > best_sz:
            best, best_sz = i, sz
    if not best:
        return None, None, 0
    by, bx = np.nonzero(lab == best)
    return float(bx.mean()), float(by.mean()), best_sz


def shift(path, out_path, dx, dy, dry=False):
    im = Image.open(path).convert("RGBA")
    if im.size != CANVAS:
        sys.exit(f"画布不是 {CANVAS[0]}x{CANVAS[1]}: {path} -> {im.size}")
    canvas = Image.new("RGBA", im.size, (0, 0, 0, 0))
    canvas.alpha_composite(im, (int(round(dx)), int(round(dy))))
    # 平移后复查：开孔必须落在中心
    cx, cy, _ = bore_center(canvas)
    print(f"   {Path(path).name}  dx={dx:+.1f} dy={dy:+.1f}  -> 开孔 ({cx:.1f}, {cy:.1f})  偏差 ({cx-CENTER[0]:+.1f}, {cy-CENTER[1]:+.1f})")
    if not dry:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(out_path)
    return canvas



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="*", help="输入 PNG")
    ap.add_argument("-o", "--out", required=True, help="输出目录")
    ap.add_argument("--pairs", nargs="*", default=[],
                    help="src:dst，用 src 的开孔 delta 平移 dst（可与 inputs 混用）")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    out_dir = Path(args.out)
    for p in args.inputs:
        p = Path(p)
        cx, cy, area = bore_center(p)
        if cx is None:
            print(f"   跳过 {p.name}（找不到开孔，可能是无孔的圆形零件）")
            continue
        shift(p, out_dir / p.name, CENTER[0] - cx, CENTER[1] - cy, args.dry)

    for pair in args.pairs:
        src, dst = pair.split(":")
        cx, cy, area = bore_center(src)
        if cx is None:
            print(f"   跳过 {dst}（{src} 找不到开孔）")
            continue
        shift(dst, out_dir / Path(dst).name, CENTER[0] - cx, CENTER[1] - cy, args.dry)


if __name__ == "__main__":
    main()
