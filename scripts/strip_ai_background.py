"""
精确抠图：AI 生成图的白/灰棋盘格背景去除
- HSV 空间判定：棋盘格为中性灰（saturation ≈ 0）+ 高亮（V > 0.75）
- 物体金属/木柄/皮革有色彩（saturation > 0.04）→ 保留
- 物体高光点虽高亮低饱和，但位于中央安全区内 → 保险保留
- 四角 flood-fill 仅在中央安全区外传播，避免侵蚀物体

用法：python strip_bg.py <src.png> <dst.png>
"""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGBA")
w, h = img.size
src_rgb = img.convert("RGB").load()
out_data = img.load()

# 中央物体安全区（通用：25-75% × 15-85%，覆盖所有装备大致范围）
SX0, SX1 = int(w * 0.25), int(w * 0.75)
SY0, SY1 = int(h * 0.15), int(h * 0.85)

# 边缘饱和度阈值（HSV S）：棋盘格中性灰 < 0.04；物体金属/木柄 ≥ 0.05
SAT_THRESHOLD = 0.04
MIN_BRIGHTNESS = 100  # 排除纯黑物体
MAX_BRIGHTNESS = 255

# 步骤 1：用 HSV 判定生成 mask（仅高亮 + 低饱和 = 候选背景）
candidate_bg = [[False] * w for _ in range(h)]
for y in range(h):
    for x in range(w):
        r, g, b = src_rgb[x, y]
        max_ch = max(r, g, b)
        min_ch = min(r, g, b)
        if min_ch < MIN_BRIGHTNESS or max_ch > MAX_BRIGHTNESS:
            continue
        sat = (max_ch - min_ch) / 255.0
        if sat < SAT_THRESHOLD:
            candidate_bg[y][x] = True

# 步骤 2：从四角 BFS，仅传播中央安全区外的候选背景（保护物体不被边缘侵蚀）
visited = [[False] * w for _ in range(h)]
from collections import deque
queue = deque()
for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    if candidate_bg[sy][sx] and not (SX0 <= sx < SX1 and SY0 <= sy < SY1):
        queue.append((sx, sy))
        visited[sy][sx] = True

# 4-连通传播，不进入中央安全区
while queue:
    x, y = queue.popleft()
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
            if SX0 <= nx < SX1 and SY0 <= ny < SY1:
                continue
            if candidate_bg[ny][nx]:
                visited[ny][nx] = True
                queue.append((nx, ny))

# 步骤 3：应用透明——所有候选背景都变透明（safe-zone 内的也透明，BFS 仅控制边界跨越）
for y in range(h):
    for x in range(w):
        if candidate_bg[y][x]:
            r, g, b, _ = out_data[x, y]
            out_data[x, y] = (r, g, b, 0)

img.save(dst, "PNG")

# 统计
total_alpha = sum(out_data[x, y][3] for x in range(w) for y in range(h))
fully_transparent = sum(1 for x in range(w) for y in range(h) if out_data[x, y][3] == 0)
print(f"saved: {dst}")
print(f"size: {w}x{h}")
print(f"avg alpha: {total_alpha / (w * h):.1f}")
print(f"fully-transparent ratio: {fully_transparent / (w * h) * 100:.1f}%")
print(f"safe-zone preserves central object: x[{SX0},{SX1}] y[{SY0},{SY1}]")