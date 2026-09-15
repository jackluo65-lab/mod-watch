#!/usr/bin/env python3
"""Export every leaf layer of the 3.8 crown PSD as a full-canvas transparent PNG.

Geometry contract for this part type: **position and size are preserved exactly**
(no centring, no resizing). The crown has to stay seated against the case flank at
the 3:8 o'clock position, so its offset inside the 800x1000 canvas IS the data.

Usage:
  /Users/mac/.workbuddy/binaries/python/envs/default/bin/python \
      tools/export_crown_psd.py <psd> -o img/crown
"""
import argparse
import os
import re
import sys

import numpy as np
from PIL import Image
from psd_tools import PSDImage

UNSAFE = re.compile(r'[\\/:*?"<>|]')


def sanitize(name: str) -> str:
    """Strip hidden-layer markers and filesystem-unsafe characters."""
    for marker in ('隐藏图层', 'hidden', 'Hidden', '（不可见）', '(不可见)'):
        name = name.replace(marker, '')
    return UNSAFE.sub('_', name).strip().strip('.') or 'layer'


def part_no(name: str) -> str:
    """Part number = first whitespace-delimited token of the layer name."""
    return name.split()[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('psd')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--skip-bg', default='图层 0',
                    help='layer name of the full-canvas reference photo to skip')
    args = ap.parse_args()

    psd = PSDImage.open(args.psd)
    os.makedirs(args.out, exist_ok=True)
    print(f'canvas {psd.width}x{psd.height}')

    n = 0
    for layer in psd.descendants():
        if layer.is_group():
            continue
        raw = layer.name
        if raw == args.skip_bg:
            # Keep it out of the catalogue: not a part number, it is the
            # reference photo used to position the crowns.
            pil = layer.topil()
            if pil is not None:
                arr = np.array(pil.convert('RGBA'))
                print(f'  skip {raw!r}: {arr.shape}, opaque '
                      f'{(arr[..., 3] > 10).mean():.1%}')
            continue

        # topil() (not composite()) -> works for hidden layers too
        pil = layer.topil()
        if pil is None:
            print(f'  !! {raw!r}: topil() returned None', file=sys.stderr)
            continue
        pil = pil.convert('RGBA')

        canvas = Image.new('RGBA', (psd.width, psd.height), (0, 0, 0, 0))
        canvas.paste(pil, (layer.left, layer.top), pil)

        no = sanitize(part_no(raw))
        out = os.path.join(args.out, no + '.png')
        canvas.save(out)

        arr = np.array(canvas)
        alpha = arr[..., 3]
        ys, xs = np.where(alpha > 10)
        if len(xs) == 0:
            print(f'  !! {no}: 0% opaque -> export is empty', file=sys.stderr)
        bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else None
        print(f'  {no:8s} <- {raw!r}  pos=({layer.left},{layer.top}) '
              f'opaque={(alpha > 10).mean():.2%} bbox={bbox}')
        n += 1

    print(f'exported {n} layers -> {args.out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
