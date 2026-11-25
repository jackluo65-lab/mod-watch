#!/usr/bin/env python3
"""Merge 表壳信息.xlsx into data.json: descriptions (zh from the sheet, en written
here) and movement strings. Sizes stay as the site has them — the shop asked for
the website's numbers to win — and a blank cell never wipes an existing value.
"""
import json
import re
import sys
import collections
from openpyxl import load_workbook

SHEET = sys.argv[1] if len(sys.argv) > 1 else '表壳信息.xlsx'
DATA = sys.argv[2] if len(sys.argv) > 2 else 'data.json'

# The sheet still uses the pre-rename codes for one series each
ALIAS = {
    'WS-11': 'SMR-WS-11', 'WS-12': 'SMR-WS-12',
    'WS-16': 'SMR-WS-16', 'WS-17': 'SMR-WS-17',
    'WS-18': 'SMR-WS-18', 'WS-19': 'SMR-WS-19',
    'WS-20': 'SMR-WS-20', 'C-JTF-2': 'VINTAGE-C-JTF-2',
}

COLOR_EN = {
    '银色': 'silver', '黑色': 'black', '金色': 'gold',
    '玫瑰金色': 'rose gold', '玫瑰金': 'rose gold', '蓝色': 'blue',
}

SERIES_EN = {
    'SKX 3.8 Case': 'SKX 3.8 case',
    'SKX 3.8 MORE CASE': 'SKX 3.8 multi-style case',
    'SKX 3.0 Case': 'SKX 3.0 case',
    'SKX Samurai Case': 'Samurai case',
    'SKX Square Case': 'SKX square case',
    'SKX SUB Case': 'SKX Sub case',
    'Turtle Case': 'Turtle case',
    'Classic Case': 'classic multi-style case',
    'Classic Retro Case': 'Classic Retro case',
    'AP Case': 'AP-style case',
    'PRX Case': 'PRX-style case',
    'Nautilus Case': 'Nautilus-style case',
}


def color_of(zh):
    for k, v in COLOR_EN.items():
        if k in zh:
            return v
    return ''


def english(case, zh, code):
    """Turn the sheet's shorthand back into a sentence a customer can read.
    Every sentence is assembled from what the Chinese cell says plus the series
    name — nothing about the case is invented."""
    color = color_of(zh)
    series = SERIES_EN.get(case.get('category', ''), 'case')
    if 'SKX 3.8 潜水表壳' in zh:
        return (f'SKX 3.8 dive case {code}, matte {color} finish. Classic SKX-style dive '
                'case with the crown at 3.8, built for everyday wear.')
    if 'CL经典复古3点位' in zh:
        return f'Classic Retro case {code} with the crown at 3, fully polished {color}.'
    if 'SKX 3点位多风格' in zh:
        finish = ('polished sides with a brushed top' if '侧面光亮' in zh
                  else f'matte {color}')
        return (f'{series} {code} with the crown at 3, shared by the JD, TX, FX and FG '
                f'styles; {finish} finish.')
    if 'SKX-N多风格' in zh:
        finish = ('polished sides with a brushed top' if '侧面光亮' in zh
                  else 'matte finish')
        return (f'SKX-N multi-style 3.8 case {code}, fits the SE, TU, KN, MM and PL '
                f'bezels; {finish}, {color}.')
    if '侧面光亮' in zh:
        return (f'{series} {code}: polished sides, brushed top, {color} finish.')
    if '全拉丝' in zh:
        return f'{series} {code}: fully brushed {color}.'
    if '全光亮' in zh:
        return f'{series} {code}: fully polished {color}.'
    if '哑光' in zh:
        return f'{series} {code}: matte {color} finish.'
    return f'{series} {code}.'


def canon_movement(raw):
    raw = (raw or '').strip()
    if not raw:
        return ''
    tokens = []
    for chunk in re.split(r'[/／]', raw):
        for tok in chunk.replace('、', ' ').split():
            tok = tok.strip().upper()
            if not tok:
                continue
            if tok.isdigit():          # "NH35/36" — the 36 is the second movement
                tok = 'NH' + tok
            if tok not in tokens:
                tokens.append(tok)
    # 4R35 / 4R36 keep their own spelling; NH35 / NH36 too
    return ' / '.join(tokens)


def main():
    wb = load_workbook(SHEET, read_only=True)
    ws = wb.worksheets[0]
    ws.reset_dimensions()
    rows = [tuple(list(r) + [''] * (13 - len(r))) for r in ws.iter_rows(values_only=True)]
    wb.close()

    records = []
    for r in rows[2:]:
        code = (r[0] or '').strip()
        if not code:
            continue
        note = (r[12] or '').strip()
        if note == '示例':          # template sample rows, not shop data
            continue
        records.append(r)

    data = json.load(open(DATA, encoding='utf-8'))
    by_code = {c['code'].strip().upper(): c for c in data['caseSeries']}

    stats = collections.Counter()
    changed = []
    unmatched = []
    for r in records:
        code = r[0].strip().upper()
        case = by_code.get(ALIAS.get(code, code))
        if not case:
            unmatched.append(r[0])
            continue

        zh = str(r[11] or '').strip()
        if zh:
            data_changed = case.get('description') != zh
            case['description'] = zh
            stats['zh'] += 1
        else:
            data_changed = False

        mov = canon_movement(r[10])
        mov_changed = bool(mov) and mov != (case.get('movement') or '')
        if mov_changed:
            case['movement'] = mov
            stats['movement'] += 1

        if zh:
            case['descriptionEn'] = english(case, zh, case['code'])
            stats['en'] += 1

        if zh or mov_changed:
            changed.append({
                'code': case['code'],
                'zh': zh,
                'movement': (f"{mov}" if mov_changed else ''),
            })

    with open(DATA, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(json.dumps({
        'records': len(records),
        'cases_touched': len(changed),
        'stats': dict(stats),
        'unmatched': unmatched,
        'changed': changed,
    }, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
