#!/usr/bin/env python3
"""把表针产品照做成配置器用的图层：抠底 → 定位枢轴 → 落到 800x1000 画布。

背景是浅灰渐变、金属高光接近背景色，细秒针柄几乎和背景同亮度（只有深色描边可见），
所以抠图分两路（详见 cut_out 注释）；枢轴用**轮毂圆形轮廓的圆拟合**（不受针尾/针角影响）。

落盘规则：把枢轴放到画布中心 (400,500)，并缩放成「秒针尖端 = 200px」（= 基准 k=1）。
前端再按每个系列的可见口径做 scale：k = (内影圈内孔 − 5) / 200，所以任何系列里
秒针尖端都刚好落在内影圈内孔内侧 5px。

    python tools/prepare_hands.py --src ~/Downloads/表针 --out img/hands
    python tools/prepare_hands.py --src ... --dry
"""
import argparse
import glob
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

CX, CY = 400.0, 500.0          # 画布中心
TIP_BASE = 200.0               # 秒针尖端在画布上的基准半径（k=1）
CARD = 256                     # 卡片缩略图尺寸
CARD_FIT = 214                 # 卡片里内容的最大边长


# ---------- 抠图 ----------
def background_lum(a):
    """边框像素拟合的浅灰背景亮度（每通道二次曲面 → 取亮度）。"""
    h, w, _ = a.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    A = np.c_[np.ones(h * w), xs.ravel(), ys.ravel(), (xs * ys).ravel(),
              (xs * xs).ravel(), (ys * ys).ravel()]
    border = np.zeros((h, w), bool)
    border[:50] = border[-50:] = True
    border[:, :50] = border[:, -50:] = True
    b = a.mean(axis=2).ravel()[border.ravel()]
    coef, *_ = np.linalg.lstsq(A[border.ravel()], b, rcond=None)
    return (A @ coef).reshape(h, w)


def cut_out(path, dark=45, hp_thr=7.0, hp_sigma=10, open_size=9, close_size=17,
            min_area=300, feather=1.1):
    """返回 (RGBA 数组, mask)。

    低频路：亮度比背景暗 > dark 的实心大块，开运算去掉贴身投影晕；
    高频路：暗度的高通 > hp_thr → 细柄的深色描边与针体轮廓（投影是低频，自动排除）。
    """
    a = np.asarray(Image.open(path).convert("RGB")).astype(float)
    lum = a.mean(axis=2)
    d = background_lum(a) - lum

    low = ndimage.binary_opening(d > dark, structure=np.ones((open_size, open_size)))
    low = ndimage.binary_dilation(low, iterations=3)
    hp = d - ndimage.gaussian_filter(d, hp_sigma)
    mask = low | (hp > hp_thr)
    mask = ndimage.binary_closing(mask, structure=np.ones((close_size, close_size)))
    mask = ndimage.binary_fill_holes(mask)
    lab, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        for i, s in enumerate(sizes, 1):
            if s < min_area:
                mask[lab == i] = False

    alpha = np.where(mask, np.clip((d - 10) / 26, 0, 1) * 0.30 + 0.70, 0.0)
    alpha = np.where(d > 60, 1.0, alpha)
    alpha = np.clip(ndimage.gaussian_filter(alpha, feather), 0, 1)
    rgba = np.dstack([np.clip(a, 0, 255), alpha * 255]).astype(np.uint8)
    return rgba, mask


# ---------- 枢轴 ----------
def circle_fit(x, y):
    A = np.c_[2 * x, 2 * y, np.ones(len(x))].astype(np.float64)
    sol, *_ = np.linalg.lstsq(A, (x ** 2 + y ** 2).astype(np.float64), rcond=None)
    cx, cy = sol[0], sol[1]
    return cx, cy, np.sqrt(sol[2] + cx * cx + cy * cy)


def find_pivot(mask, coarse):
    """轮毂外圆的圆心：在粗定位的环带里取轮廓像素做鲁棒圆拟合。"""
    edge = mask & ~ndimage.binary_erosion(mask, iterations=1)
    ys, xs = np.nonzero(edge)
    d = np.hypot(xs - coarse[0], ys - coarse[1])
    best = None
    for lo, hi in ((38, 88), (45, 80), (50, 75), (30, 95)):
        sel = (d > lo) & (d < hi)
        if sel.sum() < 80:
            continue
        X, Y = xs[sel].astype(float), ys[sel].astype(float)
        cx, cy, r = circle_fit(X, Y)
        for _ in range(5):
            res = np.abs(np.hypot(X - cx, Y - cy) - r)
            keep = res < max(2.5, np.percentile(res, 55))
            if keep.sum() < 60 or keep.all():
                break
            X, Y = X[keep], Y[keep]
            cx, cy, r = circle_fit(X, Y)
        good = int((np.abs(np.hypot(X - cx, Y - cy) - r) < 2.5).sum())
        if best is None or good > best[3]:
            best = (cx, cy, r, good)
    if best is None:
        raise RuntimeError("轮毂圆拟合失败")
    return best


def hand_tips(mask, pivot):
    ys, xs = np.nonzero(mask)
    v = np.stack([xs - pivot[0], ys - pivot[1]], 1).astype(float)
    rr = np.hypot(v[:, 0], v[:, 1])
    nn = v / np.maximum(rr, 1e-6)[:, None]
    ang = np.degrees(np.arctan2(v[:, 1], v[:, 0]))
    hist, edges = np.histogram(ang, bins=np.arange(-180, 180, 1.0))
    picked = []
    for i in np.argsort(hist)[::-1]:
        c = edges[i] + 0.5
        if all(abs(((c - p + 180) % 360) - 180) > 18 for p in picked):
            picked.append(c)
        if len(picked) == 3:
            break
    out = []
    for g in sorted(picked):
        t = np.radians(g)
        u = np.array([np.cos(t), np.sin(t)])
        m = (nn @ u) > np.cos(np.radians(3))
        out.append((round(float(g)), float(rr[m].max())))
    return out


COARSE = {"H-11": (455, 611), "H-12": (440, 650), "H-13": (416, 649), "H-4": (390, 625)}


def prepare(path, out_dir, dry=False, card_bg=(245, 245, 246)):
    stem = os.path.basename(path)[:-4]                 # "H-11 玫瑰金"
    model = stem.split()[0]                            # "H-11"
    rgba, mask = cut_out(path)
    px, py, hub_r, good = find_pivot(mask, COARSE.get(model, (430, 620)))
    tips = hand_tips(mask, (px, py))
    tip_sec = max(t for _, t in tips)                 # 秒针最长
    s = TIP_BASE / tip_sec

    src = Image.fromarray(rgba)
    small = src.resize((max(1, round(src.width * s)), max(1, round(src.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (800, 1000), (0, 0, 0, 0))
    canvas.alpha_composite(small, (round(CX - px * s), round(CY - py * s)))

    # 卡片缩略图：整幅按比例放进 214px，浅灰底
    card = Image.new("RGBA", (CARD, CARD), card_bg + (255,))
    th = canvas.copy()
    th.thumbnail((CARD_FIT, CARD_FIT), Image.LANCZOS)
    card.alpha_composite(th, ((CARD - th.width) // 2, (CARD - th.height) // 2))

    if not dry:
        os.makedirs(out_dir, exist_ok=True)
        os.makedirs(os.path.join(out_dir, "thumb"), exist_ok=True)
        canvas.save(os.path.join(out_dir, f"{model}.png"))
        card.save(os.path.join(out_dir, "thumb", f"{model}.png"))

    # 复核：落在画布上的枢轴与尖端
    ys, xs = np.nonzero(np.asarray(canvas)[..., 3] > 140)
    rr = np.hypot(xs - CX, ys - CY)
    op = np.asarray(canvas)[..., 3] > 200
    col = np.asarray(canvas)[..., :3][op].mean(axis=0).astype(int)
    print(f"  {stem:12} 源枢轴 ({px:6.1f},{py:6.1f}) 轮毂R {hub_r:5.1f}（拟合 {good}px）"
          f" 缩放 {s:.4f} → 画布 秒针尖端 {TIP_BASE:.0f}px 轮毂R {hub_r * s:4.1f} "
          f"最长 {rr.max():.1f}px 主色 #{col[0]:02x}{col[1]:02x}{col[2]:02x}"
          f"{'  [dry-run]' if dry else ''}")
    for g, t in tips:
        print(f"      针 {g:5.0f}° → 画布 {t * s:6.1f}px")
    return dict(model=model, pivot=(px, py), hub_r=hub_r, scale=s, tips=tips)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    files = sorted(glob.glob(os.path.join(os.path.expanduser(args.src), "*.png")))
    print(f"{len(files)} 套表针 → {args.out}")
    for p in files:
        prepare(os.path.expanduser(p), args.out, dry=args.dry)
