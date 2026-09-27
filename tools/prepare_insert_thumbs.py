#!/usr/bin/env python3
"""Give every insert a card thumbnail.

The insert step renders a card per catalogue entry — 125 of them — and each used to
load its 800x1000 master (160 KB and up). With lazy loading only the visible cards are
fetched, but a screenful is still megabytes over a phone connection. 256x320 WebP on
the same 4:5 canvas keeps the card looking identical at ~1/15th of the weight.

    python tools/prepare_insert_thumbs.py           # fill in missing thumbs
    python tools/prepare_insert_thumbs.py --force   # rebuild all
    python tools/prepare_insert_thumbs.py --dry
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
    inserts = data['parts']['insert']
    made = skipped = 0
    total = 0
    for part in inserts:
        src = part.get('image')
        if not src:
            continue
        src_path = os.path.join(ROOT, src)
        if not os.path.exists(src_path):
            print(f'  ! missing master: {src}')
            continue
        code = os.path.splitext(os.path.basename(src))[0]
        dst_rel = f'img/insert/thumb/{code}.webp'
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
    sizes = [os.path.getsize(os.path.join(ROOT, p['swatch'])) for p in inserts if p.get('swatch')]
    if sizes:
        print(f'swatch set: {len(sizes)} files, {sum(sizes)/1024/1024:.2f} MB, '
              f'avg {sum(sizes)/len(sizes)/1024:.0f} KB')


if __name__ == '__main__':
    main()
