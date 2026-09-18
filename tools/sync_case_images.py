#!/usr/bin/env python3
"""把共用的 C-JTF 壳身图从 img/cases/classic/ 同步到 explorer 与 pilot。

背景
----
Classic / Explorer / Pilot 三个系列用的是**同一个 C-JTF 壳身**（PSD 名「多风格 单壳」），
只是表圈系列和编号体系不同：

    系列       编号                        表圈
    classic    C-JTF-1/3/4/6/7             B-JD
    explorer   EXPLORER-C-JTF-1/3/4/5/6    B-TX      ← 5、6 对应 classic 的 6、7
    pilot      Pilot-C-JTF-1/3/4/6/7       B-FX      ← 编号与 classic 完全相同

所以 `img/cases/classic/` 是**唯一的源**，改完表壳图后跑一遍本脚本即可。

用法
----
    python tools/sync_case_images.py            # 同步（会先校验居中）
    python tools/sync_case_images.py --dry      # 只报告，不写文件

Vintage（V-JTF-*）**不在**本脚本范围内：它是另一款壳身、有独立的 PSD，
而且每款多一张侧视图（_1.png），不能从 classic 复制。
"""
import argparse
import os
import shutil
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(HERE, 'img', 'cases', 'classic')
W, H = 800, 1000

# 目标系列 -> {classic 型号: 该系列自己的文件名}
MAP = {
    'explorer': {
        'C-JTF-1': 'EXPLORER-C-JTF-1',
        'C-JTF-3': 'EXPLORER-C-JTF-3',
        'C-JTF-4': 'EXPLORER-C-JTF-4',
        'C-JTF-6': 'EXPLORER-C-JTF-5',   # 编号不同：explorer 的 5 = classic 的 6
        'C-JTF-7': 'EXPLORER-C-JTF-6',   #                   6 = classic 的 7
    },
    'pilot': {
        'C-JTF-1': 'Pilot-C-JTF-1',
        'C-JTF-3': 'Pilot-C-JTF-3',
        'C-JTF-4': 'Pilot-C-JTF-4',
        'C-JTF-6': 'Pilot-C-JTF-6',      # 编号与 classic 一致
        'C-JTF-7': 'Pilot-C-JTF-7',
    },
}


def content_bbox(path):
    a = np.array(Image.open(path).convert('RGBA'))
    if a.shape[0] != H or a.shape[1] != W:
        return None
    m = a[..., 3] > 10
    if not m.any():
        return None
    ys, xs = np.where(m)
    return m, (xs.min(), ys.min(), xs.max(), ys.max()), a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='只报告，不写文件')
    args = ap.parse_args()

    if not os.path.isdir(SRC_DIR):
        sys.exit('源目录不存在: %s' % SRC_DIR)

    problems = []
    print('源目录 %s' % os.path.relpath(SRC_DIR, HERE))
    print()

    for series, mapping in MAP.items():
        dst_dir = os.path.join(HERE, 'img', 'cases', series)
        print('=== %s -> %s ===' % (series, os.path.relpath(dst_dir, HERE)))
        for cl_code, dst_code in mapping.items():
            src = os.path.join(SRC_DIR, cl_code + '.png')
            dst = os.path.join(dst_dir, dst_code + '.png')
            if not os.path.exists(src):
                problems.append('缺源文件 %s' % src)
                print('  %-14s -> %-22s  源文件缺失！' % (cl_code, dst_code))
                continue

            r = content_bbox(src)
            if r is None:
                problems.append('%s 不是 %dx%d 或没有不透明像素' % (src, W, H))
                print('  %-14s -> %-22s  源图异常！' % (cl_code, dst_code))
                continue
            m, (x0, y0, x1, y1), _ = r
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            off = abs(cx - W / 2) + abs(cy - H / 2)
            if off > 1.0:
                problems.append('%s 内容未居中: (%.1f,%.1f)' % (src, cx, cy))

            same = os.path.exists(dst) and file_same(src, dst)
            tag = '已是最新' if same else ('将写入' if args.dry else '已写入')
            print('  %-14s -> %-22s  %dx%d 中心(%.0f,%.0f)  %s'
                  % (cl_code, dst_code, x1 - x0 + 1, y1 - y0 + 1, cx, cy, tag))
            if not args.dry and not same:
                os.makedirs(dst_dir, exist_ok=True)
                shutil.copy2(src, dst)
        print()

    if problems:
        print('发现 %d 个问题：' % len(problems))
        for p in problems:
            print('  - %s' % p)
        sys.exit(1)
    print('全部一致%s' % ('（dry run，未写入）' if args.dry else ''))


def file_same(a, b):
    try:
        if os.path.getsize(a) != os.path.getsize(b):
            return False
        with open(a, 'rb') as fa, open(b, 'rb') as fb:
            return fa.read() == fb.read()
    except OSError:
        return False


if __name__ == '__main__':
    main()
