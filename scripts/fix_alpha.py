# -*- coding: utf-8 -*-
"""
统一美术修复工具：按问题类型批量修复 PNG 透明通道。

模式说明（mode 参数）：
  strip      - P0 假透明：RGB 无 alpha → 基于四角种子色的 flood-fill 抠图，生成真透明 RGBA
  clean      - P1 通道脏：已有 alpha 但 alpha=0 区域残留 RGB → 置 0；边缘二值化 → 羽化
  blackhalo  - P1 黑晕：alpha>0 但 RGB 接近黑的"半透明黑底" → 转真透明 + 羽化
  feather    - P2 边缘残留：alpha 过渡像素少/黑边彩边 → 轻腐蚀 + 高斯羽化
  webp       - P3 体积：场景背景图（无 alpha 需求）转 webp 压缩

用法：
  python fix_alpha.py strip  <src.png> [dst.png]
  python fix_alpha.py clean  <src.png> [dst.png]
  python fix_alpha.py blackhalo <src.png> [dst.png]
  python fix_alpha.py feather <src.png> [dst.png]
  python fix_alpha.py webp   <src.png> [dst.webp] [quality]
默认 dst 为覆盖原文件（就地修复）；webp 模式必给 dst。
"""
import sys, os
from collections import deque
from PIL import Image, ImageFilter

def load_rgba(p):
    img = Image.open(p)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    return img

def save(img, dst, overwrite_ok=True):
    if os.path.abspath(dst) == os.path.abspath(sys.argv[2]) or overwrite_ok:
        img.save(dst, "PNG")
    print(f"  saved: {dst}")

def stats(img, tag=""):
    rgba = img.convert("RGBA")
    a = rgba.getchannel("A")
    hist = a.histogram()
    total = sum(hist)
    a0 = hist[0] / total
    a255 = hist[255] / total
    mid = 1 - a0 - a255
    print(f"  {tag} alpha0={a0:.2%} alpha255={a255:.2%} mid={mid:.2%}")
    return mid

# ---------------- P0: 假透明 flood-fill 抠图 ----------------
def mode_strip(src, dst):
    img = load_rgba(src)
    w, h = img.size
    px = img.load()

    # 四角种子色（各取 12x12 平均）
    def corner_avg(cx, cy):
        rs = gs = bs = 0; n = 0
        for x in range(max(0, cx - 6), min(w, cx + 6)):
            for y in range(max(0, cy - 6), min(h, cy + 6)):
                r, g, b, _ = px[x, y]
                rs += r; gs += g; bs += b; n += 1
        return (rs // n, gs // n, bs // n) if n else (255, 255, 255)
    seeds = [corner_avg(0, 0), corner_avg(w - 1, 0), corner_avg(0, h - 1), corner_avg(w - 1, h - 1)]

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        if a < 255 and a > 0:
            return False
        # 与任一四角种子色接近（色差 < 45）→ 背景候选
        for (sr, sg, sb) in seeds:
            if abs(r - sr) <= 45 and abs(g - sg) <= 45 and abs(b - sb) <= 45:
                return True
        return False

    visited = [[False] * w for _ in range(h)]
    q = deque()
    for cx, cy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if is_bg(cx, cy):
            q.append((cx, cy)); visited[cy][cx] = True

    bg_count = 0
    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        bg_count += 1
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and is_bg(nx, ny):
                visited[ny][nx] = True
                q.append((nx, ny))

    print(f"  flood-fill removed {bg_count} bg pixels ({bg_count / (w * h):.1%})")
    img.save(dst, "PNG")
    stats(img, "after-strip")

# ---------------- P1: 通道脏清理 + 二值化羽化 ----------------
def mode_clean(src, dst):
    img = load_rgba(src)
    w, h = img.size
    px = img.load()

    # 1) alpha=0 区域 RGB 置 0（清掉埋在透明区的颜色）
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 and (r or g or b):
                px[x, y] = (0, 0, 0, 0)

    # 2) 对 alpha 做 1px 高斯羽化（让 0/255 二值边产生过渡）
    a_ch = img.getchannel("A")
    a_blur = a_ch.filter(ImageFilter.GaussianBlur(1.2))
    img.putalpha(a_blur)
    stats(img, "after-clean")
    img.save(dst, "PNG")

# ---------------- P1: 黑晕（半透明黑底）转真透明 ----------------
def mode_blackhalo(src, dst):
    img = load_rgba(src)
    w, h = img.size
    px = img.load()

    # 1) alpha < 130 且 RGB 均 < 85 → 半透明黑底 → 完全透明
    # 2) alpha 0-254 且 RGB 均 < 40 → 黑晕 → 完全透明（保留 alpha 255 的主体暗色）
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (0, 0, 0, 0)
            elif a < 255 and r < 85 and g < 85 and b < 85:
                px[x, y] = (0, 0, 0, 0)
                changed += 1
            elif a == 255 and r < 40 and g < 40 and b < 40:
                # 主体纯黑轮廓线（若成片则也是黑底残留），单像素不误伤
                px[x, y] = (0, 0, 0, 0)
                changed += 1

    # 3) 边缘羽化恢复过渡
    a_ch = img.getchannel("A")
    a_blur = a_ch.filter(ImageFilter.GaussianBlur(1.0))
    img.putalpha(a_blur)
    print(f"  halo->transparent px: {changed}")
    stats(img, "after-blackhalo")
    img.save(dst, "PNG")

# ---------------- P2: 边缘残留（黑边/彩边）轻腐蚀 + 羽化 ----------------
def mode_feather(src, dst):
    img = load_rgba(src)
    w, h = img.size
    a_ch = img.getchannel("A")

    # 1) alpha 轻腐蚀 1px：吃掉边缘残留（黑边/彩边多在过渡带）
    a_erode = a_ch.filter(ImageFilter.MinFilter(3))
    # 2) 高斯羽化恢复过渡
    a_soft = a_erode.filter(ImageFilter.GaussianBlur(0.9))
    img.putalpha(a_soft)
    stats(img, "after-feather")
    img.save(dst, "PNG")

# ---------------- P3: webp 压缩 ----------------
def mode_webp(src, dst, quality=82):
    img = Image.open(src)
    if img.mode in ("RGBA", "LA"):
        img.save(dst, "WEBP", quality=quality, method=6, lossless=False)
    else:
        img.convert("RGB").save(dst, "WEBP", quality=quality, method=6, lossless=False)
    s1 = os.path.getsize(src); s2 = os.path.getsize(dst)
    print(f"  {os.path.basename(src)}: {s1/1024:.0f}KB -> {s2/1024:.0f}KB ({s2/s1*100:.0f}%)  -> {dst}")

if __name__ == "__main__":
    mode = sys.argv[1]
    src = sys.argv[2]
    dst = sys.argv[3] if len(sys.argv) > 3 else src
    if mode == "strip": mode_strip(src, dst)
    elif mode == "clean": mode_clean(src, dst)
    elif mode == "blackhalo": mode_blackhalo(src, dst)
    elif mode == "feather": mode_feather(src, dst)
    elif mode == "webp": mode_webp(src, dst, int(sys.argv[4]) if len(sys.argv) > 4 else 82)
    else: print("unknown mode"); sys.exit(1)
