#!/usr/bin/env python3
"""Export the flat (平面) ceramic inserts from the factory PSD.

The catalogue already ships 107 sloped inserts; this PSD holds the flat ones. Each
layer becomes a full-canvas 800x1000 transparent PNG centred on (400,500), the same
geometry the sloped ones use, plus a 256x320 WebP card thumbnail (the wizard renders
a card per insert, so masters would be megabytes per step).

    python tools/prepare_flat_inserts.py                 # write img/insert/<CODE>.png
    python tools/prepare_flat_inserts.py --dry           # measure only
    python tools/prepare_flat_inserts.py --psd <path>
"""
import os, re, sys, json
import numpy as np
from PIL import Image
from psd_tools import PSDImage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PSD = os.path.expanduser('~/Downloads/平面 陶瓷圈.psd')
if '--psd' in sys.argv:
    PSD = os.path.expanduser(sys.argv[sys.argv.index('--psd') + 1])
DRY = '--dry' in sys.argv

CW, CH = 800, 1000          # every insert artwork in the catalogue uses this canvas
CX, CY = 400, 500           # ...and is centred here
THUMB = (256, 320)          # same 4:5 canvas, 0.32x


def code_of(layer_name):
    """'SN-8 拷贝' -> 'SN-8'"""
    s = (layer_name or '').strip()
    m = re.match(r'^([A-Za-z]{1,4}-\d+[A-Za-z]?)', s)
    return (m.group(1) if m else s).upper()


def measure(alpha):
    """bore and outer radius measured along the centre row."""
    row = alpha[CY, :]
    nz = np.nonzero(row > 8)[0]
    if not len(nz):
        return None, None
    outer = int(nz.max() - CX)
    inner = None
    for x in range(CX, CW):
        if row[x] > 8:
            inner = int(x - CX)
            break
    return inner, outer


def main():
    psd = PSDImage.open(PSD)
    out_dir = os.path.join(ROOT, 'img', 'insert')
    thumb_dir = os.path.join(out_dir, 'thumb')
    os.makedirs(thumb_dir, exist_ok=True)
    measured, made = {}, 0

    for group in psd:
        if not group.is_group():
            continue
        for layer in group:
            im = layer.topil()
            if im is None:
                print(f'  ! {layer.name}: no pixels')
                continue
            im = im.convert('RGBA')
            code = code_of(layer.name)
            canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
            canvas.paste(im, (CX - im.width // 2, CY - im.height // 2), im)
            alpha = np.array(canvas)[:, :, 3]
            inner, outer = measure(alpha)
            measured[code] = {'inner': inner, 'outer': outer, 'layer': layer.name}
            print(f'  {code:<8} 内容 {im.width}x{im.height}  内孔 r{inner}  外缘 r{outer}')
            if DRY:
                continue
            dst = os.path.join(out_dir, code + '.png')
            if os.path.exists(dst):
                print(f'    ⚠️ 已存在，跳过（先确认不是别的零件）：{dst}')
                continue
            canvas.save(dst, optimize=True)
            small = canvas.resize(THUMB, Image.LANCZOS)
            small.save(os.path.join(thumb_dir, code + '.webp'), format='WEBP', quality=86, method=6)
            made += 1

    print(f'\n{made} 张导出' + '（dry run）' if DRY else f'\n{made} 张导出到 img/insert/')
    print(json.dumps(measured, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
