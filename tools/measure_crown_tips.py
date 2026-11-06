#!/usr/bin/env python3
"""量每条 4 点位表把画稿的杆尾位置，和 WC-E-1 比对，超出 ±10px 带宽的写入 crownShift。

杆尾 = 沿主轴（PCA）投影两端中「更细」的一端。基准 wc-e-1 ≈ (595,579)。
用法：/Users/mac/.workbuddy/binaries/python/envs/default/bin/python tools/measure_crown_tips.py
加 --write 把校正写回 data.json，默认只打印。
"""
import json, sys
import numpy as np
from PIL import Image

ROOT = '/Users/mac/Documents/GitHub/mod-watch'
BAND = 10  # 主流画稿彼此相差 ±5px，超出 10px 视为摆放偏差


def stem_tip(path):
    a = np.array(Image.open(path).convert('RGBA'))[:, :, 3]
    ys, xs = np.nonzero(a > 25)
    if len(xs) < 100:
        return None
    pts = np.stack([xs, ys], 1).astype(float)
    q = pts - pts.mean(0)
    w, v = np.linalg.eigh(np.cov(q.T))
    ax = v[:, np.argmax(w)]
    if ax[0] < 0:
        ax = -ax
    proj = q @ ax
    perp = q @ np.array([-ax[1], ax[0]])
    lo, hi = proj.min(), proj.max()
    span = hi - lo
    ends = []
    for sgn, (r0, r1) in ((1, (lo, lo + span * 0.15)), (-1, (hi - span * 0.15, hi))):
        m = (proj >= r0) & (proj <= r1)
        ends.append((np.percentile(perp[m], 90) - np.percentile(perp[m], 10) if m.any() else 1e9, sgn, m))
    w_, sgn, m = min(ends, key=lambda e: e[0])
    idx = np.where(m)[0]
    return pts[idx[np.argmax(proj[idx]) if sgn == 1 else np.argmin(proj[idx])]]


def main():
    write = '--write' in sys.argv
    d = json.load(open(f'{ROOT}/data.json'))
    base = stem_tip(next(p for p in d['parts']['crown'] if p['id'] == 'wc-e-1')['image'])
    print(f'基准 wc-e-1 杆尾 = ({base[0]:.0f},{base[1]:.0f})')
    fixed = []
    for p in d['parts']['crown']:
        if 'placeholder' in p['image'] or (p.get('crownPos') or 3) != 4 or p['id'] == 'wc-e-1':
            continue
        tip = stem_tip(p['image'])
        dx, dy = base[0] - tip[0], base[1] - tip[1]
        flag = '  <- crownShift' if (abs(dx) > BAND or abs(dy) > BAND) else ''
        print(f"{p['id']:12} tip=({tip[0]:.0f},{tip[1]:.0f})  dx={dx:+.0f} dy={dy:+.0f}{flag}")
        if flag:
            p['crownShift'] = [round(dx), round(dy)]
            fixed.append(p['id'])
    if write:
        with open(f'{ROOT}/data.json', 'w') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print('已写入 data.json:', fixed)


if __name__ == '__main__':
    main()
