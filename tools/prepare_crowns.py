#!/usr/bin/env python3
"""把一个「专属表把」PSD 导出的图层准备成 img/crown 下的成品图 + 卡片缩略图。

为什么表把要单独一个脚本（和其它零件不同）：
- **表把绝不能居中**。它的位置直接取自 PSD —— 厂家把表壳 PSD 和表把 PSD 画在同一个
  800x1000 版式里，所以表壳图平移了多少，表把图就要平移多少，否则管身穿不进壳的护桥/管孔。
  （实测 CL：不平移会让管身戳进壳侧壁，平移 +19/+17 后正好落在壳的管座上。）
- 表把是唯一带 `swatch` 的零件类型，缩略图是「内容外接框 ×1.18 的方形裁剪 → 256 方图」。

用法：
  python prepare_crowns.py --src <图层目录> --out img/crown --dx 19 --dy 17 \
      --map "WC-CL-1 亮银 南瓜头=WC3-CL-1" --map "WC-CL-3-亮金-南瓜头=WC3-CL-3"

只写文件，不改 data.json —— 脚本会把每个成品的实测主色打印出来，直接抄进条目里。
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CANVAS = (800, 1000)
THUMB_BOX = 256
THUMB_MARGIN = 1.18   # 内容外接框 ×1.18 作为裁剪方框（与既有缩略图配方一致）


def content_bbox(im):
    a = np.asarray(im.convert("RGBA"))
    ys, xs = np.nonzero(a[..., 3] > 8)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def make_thumb(im, box=THUMB_BOX, margin=THUMB_MARGIN):
    x0, y0, x1, y1 = content_bbox(im)
    side = max(x1 - x0 + 1, y1 - y0 + 1) * margin
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    crop = Image.new("RGBA", (int(round(side)), int(round(side))), (0, 0, 0, 0))
    crop.alpha_composite(im, (int(round(-(cx - side / 2))), int(round(-(cy - side / 2)))))
    return crop.resize((box, box), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="PSD 图层导出目录")
    ap.add_argument("--out", default="img/crown", help="输出目录（成品图直接落这里）")
    ap.add_argument("--dx", type=float, default=0.0, help="水平平移（与该系列表壳相同的 delta）")
    ap.add_argument("--dy", type=float, default=0.0, help="垂直平移（与该系列表壳相同的 delta）")
    ap.add_argument("--map", action="append", required=True, help="源图层名（不含 .png）=输出名")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    src, out = Path(args.src), Path(args.out)
    thumb_dir = out / "thumb"

    for m in args.map:
        s, _, dst = m.partition("=")
        src_png = src / f"{s}.png"
        if not src_png.exists():
            sys.exit(f"源图层不存在: {src_png}")
        if (out / f"{dst}.png").exists():
            sys.exit(f"⚠️ 目标已存在，拒绝覆盖: {out / (dst + '.png')}  ← 先确认是不是同一个零件")

        im = Image.open(src_png).convert("RGBA")
        if im.size != CANVAS:
            sys.exit(f"画布不是 {CANVAS[0]}x{CANVAS[1]}: {src_png} -> {im.size}")
        moved = Image.new("RGBA", im.size, (0, 0, 0, 0))
        moved.alpha_composite(im, (int(round(args.dx)), int(round(args.dy))))

        x0, y0, x1, y1 = content_bbox(moved)
        op = np.asarray(moved)[..., 3] > 200
        col = np.asarray(moved)[..., :3][op].mean(axis=0)
        print(f"   {dst}: bbox=({x0},{y0})-({x1},{y1})  主色 "
              f"#{int(col[0]):02x}{int(col[1]):02x}{int(col[2]):02x}")

        if not args.dry:
            out.mkdir(parents=True, exist_ok=True)
            thumb_dir.mkdir(parents=True, exist_ok=True)
            moved.save(out / f"{dst}.png")
            make_thumb(moved).save(thumb_dir / f"{dst}.png")


if __name__ == "__main__":
    main()
