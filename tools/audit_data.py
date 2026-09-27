"""Health-check data.json before you deploy.

Four things go wrong silently in this catalogue, and all four are invisible on the
page — the part just disappears from the list:

  1. a `compatibleParts.<type>` id that no longer exists in `parts.<type>`
     (the filter drops it without a word)
  2. a part whose `category` does not list the case's category
     (`categoryMatches()` is an exact string comparison, `universal` is the wildcard)
  3. an `image` / `swatch` / `views.front` path that is not on disk
  4. an entry with no `code`, so it can never be found by number

    python tools/audit_data.py            # report
    python tools/audit_data.py --quiet    # only the totals, exit 1 on a problem
"""
import json, os, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUIET = '--quiet' in sys.argv


def main():
    d = json.load(open(os.path.join(ROOT, 'data.json')))
    # the audit always looks at the repo root's data.json, but paths inside are
    # repo-relative — run from anywhere, resolve against ROOT
    parts = d['parts']
    step_order = [s['type'] for s in d['stepOrder']] if 'stepOrder' in d else None

    def matches(part, case):
        cat = (part.get('category') or 'universal')
        return cat == 'universal' or case['category'] in [x.strip() for x in cat.split(',')]

    problems = collections.defaultdict(list)

    # --- 3. files on disk -------------------------------------------------
    def check_file(where, value):
        if not value or value.startswith('http'):
            return
        if not os.path.exists(os.path.join(ROOT, value)):
            problems['缺图'].append(f'{where} -> {value}')

    for name, lst in parts.items():
        for p in lst:
            check_file(f'{name}.{p["id"]}.image', p.get('image'))
            check_file(f'{name}.{p["id"]}.swatch', p.get('swatch'))
    for c in d['caseSeries']:
        for k, v in (c.get('views') or {}).items():
            check_file(f'case.{c["id"]}.views.{k}', v)
        check_file(f'case.{c["id"]}.swatch', c.get('swatch'))

    # --- 1/2/4. references, categories, codes -----------------------------
    ids = {t: {p['id'] for p in lst} for t, lst in parts.items()}
    for c in d['caseSeries']:
        cp = c.get('compatibleParts', {})
        for t, refs in cp.items():
            if t not in parts:
                continue
            for r in refs:
                if r not in ids[t]:
                    problems['悬空 id'].append(f'{c["id"]} -> {t}:{r}')
            visible = [p for p in parts[t] if p['id'] in set(refs) and matches(p, c)]
            if refs and not visible:
                problems['0 可见步骤'].append(f'{c["id"]} / {t}（{len(refs)} 个引用全被 category 挡住）')
    # every step type has to be declared for every case, or the wizard shows it empty
    for c in d['caseSeries']:
        for t in (step_order or []):
            if t == 'case':
                continue
            if t not in (c.get('compatibleParts') or {}):
                problems['步骤未声明'].append(f'{c["id"]} 没有 compatibleParts.{t}')

    for name, lst in parts.items():
        for p in lst:
            if not p.get('code'):
                problems['缺编号'].append(f'{name}.{p["id"]}（{p.get("name")}）')
        dup = [k for k, v in collections.Counter(p['code'] for p in lst if p.get('code')).items() if v > 1]
        if dup:
            problems['重复编号'].append(f'{name}: {sorted(dup)[:8]}{" …" if len(dup) > 8 else ""}')

    # --- report -----------------------------------------------------------
    total = sum(len(v) for v in problems.values())
    for k in ['缺图', '悬空 id', '0 可见步骤', '步骤未声明', '缺编号', '重复编号']:
        v = problems.get(k, [])
        mark = '✓' if not v else '✗'
        print(f'{mark} {k}: {len(v)}')
        if v and not QUIET:
            for line in v[:12]:
                print('    ', line)
            if len(v) > 12:
                print(f'     … 还有 {len(v) - 12} 条')

    print()
    print('零件数:', {t: len(l) for t, l in parts.items()})
    print('表壳数:', len(d['caseSeries']), '| 系列数:', len({c['category'] for c in d['caseSeries']}))
    print('合计问题:', total)
    return 1 if total else 0


if __name__ == '__main__':
    sys.exit(main())
