#!/usr/bin/env python3
"""Register the 16 crowns exported from 3.8位表把.psd into data.json.

These crowns are **3.8-only**: they are wired into the 10 case series whose
category is `SKX 3.8 Case` or `SKX 3.8 MORE CASE`; every other series gets an
empty crown list (the wizard auto-skips a step with 0 available parts).
"""
import json
import os
import shutil

from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = '/tmp/crown38'
OUT = os.path.join(ROOT, 'img', 'crown')
CROWN_CATEGORIES = {'SKX 3.8 Case', 'SKX 3.8 MORE CASE'}

FINISH = {
    '亮银':   ('Polished Silver',     '亮银',   'Stainless Steel'),
    '亮黑':   ('Polished Black',      '亮黑',   'Stainless Steel, Black PVD'),
    '亮金':   ('Polished Gold',       '亮金',   'Stainless Steel, Gold PVD'),
    '亮玫金': ('Polished Rose Gold',  '亮玫金', 'Stainless Steel, Rose Gold PVD'),
    '砂银':   ('Brushed Silver',      '砂银',   'Stainless Steel'),
    '砂黑':   ('Brushed Black',       '砂黑',   'Stainless Steel, Black PVD'),
    '砂金':   ('Brushed Gold',        '砂金',   'Stainless Steel, Gold PVD'),
    '砂玫金': ('Brushed Rose Gold',   '砂玫金', 'Stainless Steel, Rose Gold PVD'),
}
TEXTURE = {'直纹': 'Straight Knurl', '齿纹': 'Toothed Knurl', '钻石纹': 'Diamond Knurl'}

# layer name -> (part number, raw layer name); order follows the PSD
LAYERS = [
    ('WC-E-1', 'WC-E-1 亮银 直纹'),
    ('WC-E-2', 'WC-E-2 亮黑直纹'),
    ('WC-O-3', 'WC-O-3  亮金 直纹'),
    ('WC-O-4', 'WC-O-4 亮玫金 直纹'),
    ('WC-J-2', 'WC-J-2 砂银 直纹'),
    ('WC-J-1', 'WC-J-1 砂黑 直纹'),
    ('WC-J-3', 'WC-J-3 砂金 直纹'),
    ('WC-J-4', 'WC-J-4 砂玫金 直纹'),
    ('WC-B-1', 'WC-B-1 亮银 齿纹'),
    ('WC-C-2', 'WC-C-2 亮黑 齿纹'),
    ('WC-C-3', 'WC-C-3 亮金 齿纹'),
    ('WC-C-4', 'WC-C-4 亮玫金 齿纹'),
    ('WC-A-1', 'WC-A-1 亮银 钻石纹'),
    ('WC-M-2', 'WC-M-2 亮黑 钻石纹'),
    ('WC-A-3', 'WC-A-3 亮金 钻石纹'),
    ('WC-M-4', 'WC-M-4 亮玫金 钻石纹'),
]


THUMB_DIR = os.path.join(OUT, 'thumb')
THUMB_SIZE = 256


def content_bbox(path):
    arr = np.array(Image.open(path).convert('RGBA'))
    ys, xs = np.where(arr[..., 3] > 10)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def make_thumbs(names):
    """Cards show a 32px circular swatch with object-fit:cover. The crown only
    occupies ~120x100 px in one corner of the 800x1000 canvas, so it would
    render as a 5px speck. Emit a tightly cropped `swatch` thumbnail instead —
    the preview still uses the full-canvas `image`."""
    os.makedirs(THUMB_DIR, exist_ok=True)
    boxes = [content_bbox(os.path.join(OUT, n + '.png')) for n in names]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = int(round(max(x1 - x0, y1 - y0) * 1.35))          # one framing for all
    box = (round(cx - side / 2), round(cy - side / 2),
           round(cx + side / 2), round(cy + side / 2))
    print(f'thumb crop box: {box} (side {side})')
    for n in names:
        im = Image.open(os.path.join(OUT, n + '.png')).convert('RGBA').crop(box)
        im = im.resize((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
        im.save(os.path.join(THUMB_DIR, n + '.png'))
    return box


def median_color(path):
    arr = np.array(Image.open(path).convert('RGBA'))
    m = arr[..., 3] > 200
    if not m.any():
        return '#c0c0c0'
    rgb = arr[..., :3][m]
    return '#%02x%02x%02x' % tuple(int(v) for v in np.median(rgb, axis=0))


def parse(name: str):
    """`WC-E-2 亮黑直纹` -> ('WC-E-2', '亮黑', '直纹').

    Finish and texture may or may not be space separated, so normalise by
    stripping the texture suffix first and treating the rest as the finish.
    """
    toks = name.split()
    no = toks[0]
    rest = ''.join(toks[1:])
    texture = next((k for k in TEXTURE if rest.endswith(k)), None)
    head = rest[:-len(texture)] if texture else rest
    finish = next((k for k in FINISH if head == k or rest.startswith(k)), None)
    return no, finish, texture


def main():
    data_path = os.path.join(ROOT, 'data.json')
    shutil.copy(data_path, os.path.join(ROOT, 'tools', 'data.json.bak-before-crown'))
    d = json.load(open(data_path, encoding='utf-8'))

    os.makedirs(OUT, exist_ok=True)
    for no, _ in LAYERS:
        src = os.path.join(SRC, no + '.png')
        dst = os.path.join(OUT, no + '.png')
        shutil.copy(src, dst)

    make_thumbs([no for no, _ in LAYERS])

    parts = []
    for no, raw in LAYERS:
        _, finish, texture = parse(raw)
        f_en, f_zh, material = FINISH[finish]
        t_en = TEXTURE[texture]
        parts.append({
            'id': no.lower(),
            'name': f'{no} {f_en}, {t_en}',
            'nameZh': f'{no} {f_zh} {texture}',
            'series': 'skx38',
            'color': median_color(os.path.join(OUT, no + '.png')),
            'material': material,
            'description': f'3.8 位表把 {f_zh} {texture}，仅适配 SKX 3.8 / 3.8 MORE 表壳。',
            'descriptionEn': (f'3.8 o\'clock crown, {f_en.lower()}, '
                               f'{t_en.lower()} — SKX 3.8 / 3.8 MORE cases only.'),
            'image': f'img/crown/{no}.png',
            'swatch': f'img/crown/thumb/{no}.png',
            'category': 'SKX 3.8 Case,SKX 3.8 MORE CASE',
        })
    d['parts']['crown'] = parts
    ids = [p['id'] for p in parts]

    wired = 0
    for c in d['caseSeries']:
        c.setdefault('compatibleParts', {})
        c['compatibleParts']['crown'] = list(ids) if c.get('category') in CROWN_CATEGORIES else []
        wired += 1 if c['compatibleParts']['crown'] else 0

    with open(data_path, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

    print(f'crown parts: {len(parts)}')
    print(f'wired into {wired} of {len(d["caseSeries"])} case series '
          f'({", ".join(sorted(CROWN_CATEGORIES))})')
    for p in parts[:3]:
        print(' ', json.dumps(p, ensure_ascii=False))


if __name__ == '__main__':
    main()
