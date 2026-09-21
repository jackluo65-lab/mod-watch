#!/usr/bin/env python3
"""Stamp every catalogue entry with its `code` — the factory model number.

The My Build panel shows a part number per row, and the number lookup resolves a
typed number back to a part, so the number has to live in the data rather than be
guessed in the browser. It comes from the artwork file name, which is how the
factory names parts:

    img/cases/skx38/SKX-B-1.png        -> SKX-B-1
    img/bezel/B-JD-1.png               -> B-JD-1
    img/chapterRing/cr-g-3.png         -> CR-G-3
    img/dial/d207/WD-D1067.png         -> D1067      (drops the shop prefix)
    img/placeholder/blank.png          -> (none)     placeholder-only parts have no number

Idempotent: run it after importing parts from a new PSD. Pass --force to recompute
codes that already exist, --dry to only report.

    python tools/add_part_codes.py
    python tools/add_part_codes.py --dry
"""
import json, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = '--dry' in sys.argv
FORCE = '--force' in sys.argv

def code_from_file(src):
    """Model number from the artwork file name; '' for placeholders / no art."""
    if not src or 'placeholder' in src:
        return ''
    stem = os.path.splitext(os.path.basename(src))[0]
    m = re.match(r'^WD-(D\d+)$', stem, re.I)     # dials carry a shop prefix
    if m:
        stem = m.group(1)
    return stem.upper()

def token_code(*names):
    """Fallback: a model-looking token inside the display name."""
    for s in names:
        if not s:
            continue
        m = re.search(r'\b([A-Z]{1,4}(?:-[A-Z0-9]{1,4}){1,4})\b', s)
        if m:
            return m.group(1)
    return ''

def stamp(entry, code):
    """Put `code` right after `id`, keeping the rest of the key order."""
    if 'code' in entry and not FORCE:
        return False
    out = {}
    for k, v in entry.items():
        out[k] = v
        if k == 'id' and not (entry.get('code') and not FORCE):
            out['code'] = code
    if 'code' not in out:
        out['code'] = code
    entry.clear()
    entry.update(out)
    return True

def main():
    path = os.path.join(ROOT, 'data.json')
    data = json.load(open(path))
    added = 0
    missing = collections.Counter()

    for c in data['caseSeries']:
        code = code_from_file((c.get('views') or {}).get('front')) or token_code(c.get('name'), c.get('nameZh'))
        if not code:
            missing['caseSeries'] += 1
        if stamp(c, code):
            added += 1

    for ptype, lst in data['parts'].items():
        for part in lst:
            code = code_from_file(part.get('image')) or token_code(part.get('name'), part.get('nameZh'))
            if not code:
                missing[ptype] += 1
            if stamp(part, code):
                added += 1

    if not DRY:
        json.dump(data, open(path, 'w'), indent=2, ensure_ascii=False)

    print(f'{added} entries stamped' + (' (dry run)' if DRY else ''))
    if missing:
        print('no model number (placeholder-only parts, expected):')
        for k, v in sorted(missing.items()):
            print(f'   {k}: {v}')
    # A duplicate number inside one type is normal (a dial exists in two disc sizes,
    # a ring in generic + AP flavour) — the lookup prefers the compatible copy.
    for ptype, lst in data['parts'].items():
        dups = [k for k, v in collections.Counter(p['code'] for p in lst if p['code']).items() if v > 1]
        if dups:
            print(f'note: {ptype} has {len(dups)} repeated numbers (e.g. {", ".join(dups[:4])}) — resolved by compatibility at lookup time')

if __name__ == '__main__':
    main()
