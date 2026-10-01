#!/usr/bin/env python3
"""Give bezels a card thumbnail, the same way the inserts have one.

256x320 WebP on the same 4:5 canvas as the 800x1000 master, so a bezel card looks
identical at a fraction of the weight. By default only entries whose thumb is
missing are built; `--force` rebuilds all of them.

    python tools/prepare_bezel_thumbs.py
    python tools/prepare_bezel_thumbs.py --force
    python tools/prepare_bezel_thumbs.py --dry
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THUMB = (256, 320)          # 0.32x of the 800x1000 masters
DRY = '--dry' in sys.argv
FORCE = '--force' in sys.argv


def main():
    path = os.path.join(ROOT, 'data.json')
    data = json.load(open(path))
    parts = data['parts']['bezel']
    made = skipped = 0
    total = 0
    for part in parts:
        src = part.get('image') or ''
        # placeholder art is shared between many entries — no thumb per entry
        if not src or 'placeholder' in src:
            continue
        src_path = os.path.join(ROOT, src)
        if not os.path.exists(src_path):
            print(f'  ! missing master: {src}')
            continue
        code = os.path.splitext(os.path.basename(src))[0]
        dst_rel = f'img/bezel/thumb/{code}.webp'
        dst = os.path.join(ROOT, dst_rel)
        if part.get('swatch') != dst_rel:
            part['swatch'] = dst_rel
        if os.path.exists(dst) and not FORCE:
            skipped += 1
            continue
        if DRY:
            made += 1
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im = Image.open(src_path).convert('RGBA')
        im.resize(THUMB, Image.LANCZOS).save(dst, format='WEBP', quality=86, method=6)
        made += 1
        total += os.path.getsize(dst)

    if not DRY:
        json.dump(data, open(path, 'w'), indent=2, ensure_ascii=False)
    print(f'{made} thumbs written, {skipped} already there'
          + (f', {total / 1024:.0f} KB total' if made and not DRY else '')
          + (' (dry run)' if DRY else ''))


if __name__ == '__main__':
    main()
