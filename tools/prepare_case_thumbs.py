#!/usr/bin/env python3
"""Build small thumbnails for the case-series cards.

The wizard renders a card for every one of the 55 cases the moment the page opens,
and it used the 800x1000 master PNG for each — 18 MB before the first pixel of the
preview. These thumbs keep the master's 4:5 canvas (so `object-fit: contain` shows
the case at exactly the same size) at 0.64x and go out as WebP: 300-430 KB per card
becomes ~30 KB. WebP is safe here — iOS 14+, every X5/Chromium WeChat build and all
current browsers decode it.

    python tools/prepare_case_thumbs.py            # write img/cases/<series>/thumb/<NAME>.webp
    python tools/prepare_case_thumbs.py --dry      # report only
    python tools/prepare_case_thumbs.py --png      # keep PNG instead (much heavier)
"""
import json, os, sys
from PIL import Image

SCALE = 0.64           # 800x1000 -> 512x640
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = '--dry' in sys.argv
AS_PNG = '--png' in sys.argv
EXT = '.png' if AS_PNG else '.webp'

def main():
    data = json.load(open(os.path.join(ROOT, 'data.json')))
    made = skipped = 0
    total = 0
    for cs in data['caseSeries']:
        front = (cs.get('views') or {}).get('front')
        if not front:
            print(f'  ! {cs["id"]}: no front view'); skipped += 1; continue
        src = os.path.join(ROOT, front)
        if not os.path.exists(src):
            print(f'  ! {cs["id"]}: missing {front}'); skipped += 1; continue
        im = Image.open(src).convert('RGBA')
        w, h = im.size
        out_size = (round(w * SCALE), round(h * SCALE))
        dst = os.path.join(os.path.dirname(src), 'thumb', os.path.splitext(os.path.basename(src))[0] + EXT)
        if DRY:
            made += 1; continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        small = im.resize(out_size, Image.LANCZOS)
        if AS_PNG:
            small.save(dst, optimize=True)
        else:
            small.save(dst, format='WEBP', quality=86, method=6)
        made += 1
        total += os.path.getsize(dst)
        print(f'  {cs["id"]:<18} {w}x{h} -> {out_size[0]}x{out_size[1]}  {os.path.getsize(dst)//1024} KB')
    print(f'\n{made} thumbs, {skipped} skipped' + (f', {total/1024/1024:.2f} MB total' if not DRY else ' (dry run)'))

if __name__ == '__main__':
    main()
