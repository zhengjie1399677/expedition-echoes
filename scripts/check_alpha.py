# -*- coding: utf-8 -*-
"""
美术资源 Alpha 通道审查脚本
逐张检测 public/assets 下 PNG：
  1. 是否真含 Alpha 通道（RGBA/LA/调色板+透明）
  2. 假透明检测：整图 alpha=255（纯色背景填充模拟透明）
  3. 边缘锯齿：alpha 仅 0/255 二值、无中间过渡（硬边）
  4. 残留背景色：透明边缘像素 RGB 与背景色近似（白边/黑边/彩边）
  5. 通道不干净：alpha=0 区域仍残留颜色信息 / 杂散像素
"""
import os, sys, json, glob
from collections import Counter
from PIL import Image

ROOT = r"D:\projects\expedition-inn\public\assets"
OUT = r"D:\projects\expedition-inn\tmp\alpha_report.json"

def analyze(path):
    rel = os.path.relpath(path, ROOT).replace("\\", "/")
    img = Image.open(path)
    mode = img.mode
    size = img.size
    n_px = size[0] * size[1]
    info = {"path": rel, "mode": mode, "size": f"{size[0]}x{size[1]}", "issues": [], "stats": {}}
    # 场景背景图（world/）设计上不需要透明通道，豁免 FATAL 判定
    IS_SCENE = rel.startswith("world/")

    # --- 是否有真透明 ---
    has_alpha_channel = "A" in mode or (mode == "P" and "transparency" in img.info)
    info["has_alpha_channel"] = has_alpha_channel

    # 统一转 RGBA 分析
    rgba = img.convert("RGBA")
    a = rgba.getchannel("A")
    ah = a.histogram()  # 256 bins
    total = sum(ah)
    alpha0 = ah[0]
    alpha255 = ah[255]
    mid = total - alpha0 - alpha255
    opaque_ratio = alpha255 / total
    transparent_ratio = alpha0 / total

    info["stats"]["opaque_px_ratio"] = round(opaque_ratio, 4)
    info["stats"]["transparent_px_ratio"] = round(transparent_ratio, 4)
    info["stats"]["mid_alpha_px"] = mid
    info["stats"]["mid_alpha_ratio"] = round(mid / total, 4)

    # --- 1. 假透明：完全不透明（alpha=255 全图）---
    if not has_alpha_channel:
        if IS_SCENE:
            info["issues"].append("场景背景图: RGB 全幅设计正确，无需透明通道")
        else:
            info["issues"].append("FATAL_无透明通道: 格式为 RGB/P（无 alpha），若需透明必须重导出")
    elif opaque_ratio == 1.0 and alpha0 == 0:
        # 全不透明：检查是否为纯色/渐变背景填充的"假透明"
        rgb = rgba.convert("RGB")
        corners = [rgb.getpixel((0, 0)), rgb.getpixel((size[0]-1, 0)),
                   rgb.getpixel((0, size[1]-1)), rgb.getpixel((size[0]-1, size[1]-1))]
        info["stats"]["corners"] = corners
        # 采样背景区域（四周边缘带）的颜色种类
        edge_colors = Counter()
        step = max(1, size[0] // 50)
        for x in range(0, size[0], step):
            edge_colors[rgb.getpixel((x, 0))] += 1
            edge_colors[rgb.getpixel((x, size[1]-1))] += 1
        for y in range(0, size[1], step):
            edge_colors[rgb.getpixel((0, y))] += 1
            edge_colors[rgb.getpixel((size[0]-1, y))] += 1
        unique_edges = len(edge_colors)
        top1, top1n = edge_colors.most_common(1)[0] if edge_colors else (None, 0)
        info["stats"]["edge_unique_colors"] = unique_edges
        info["stats"]["edge_dominant_color"] = list(top1) if top1 else None
        if unique_edges <= 3 and top1n > 0.6 * (4 * (size[0]//step + size[1]//step)):
            info["issues"].append(f"假透明风险: 全图不透明且四周边框基本为单一颜色 {top1}（占 {top1n} 采样），疑似用纯色背景模拟透明")
        else:
            info["issues"].append("全图不透明(alpha=255): 无透明区域，可能是完整背景图(场景类可接受)，若为角色/图标则需抠图")

    # --- 2. 边缘锯齿：中间过渡像素过少 ---
    mid_ratio = mid / total
    # 像素画（pixel/）的二值化 alpha 是风格特性，豁免锯齿判定
    IS_PIXELART = rel.startswith("pixel/")
    if has_alpha_channel and alpha0 > 0 and opaque_ratio < 0.999 and not IS_PIXELART:
        if mid_ratio < 0.005:
            info["issues"].append(f"严重锯齿: 半透明过渡像素仅 {mid_ratio:.2%}（alpha 基本 0/255 二值化），边缘未做抗锯齿羽化")
        elif mid_ratio < 0.02:
            info["issues"].append(f"边缘偏硬: 半透明过渡像素 {mid_ratio:.2%}（偏少），边缘可能有轻微锯齿")

    # --- 3. 残留背景色（白边/黑边/彩边检测）---
    # 对每个 alpha 在 (0,255) 的过渡像素，比较 RGB 与相邻透明像素的 RGB
    px = rgba.load()
    # 采样检测：取过渡像素与相邻 alpha=0 像素，看 RGB 距离
    fringe = []
    # 先收集 alpha=0 区域的平均色（背景色参考）
    bg_pts = []
    xs, ys = size
    for i in range(0, xs, max(1, xs // 64)):
        for j in range(0, ys, max(1, ys // 64)):
            r, g, b, aa = px[i, j]
            if aa == 0:
                bg_pts.append((r, g, b))
    if bg_pts:
        bg_r = sum(p[0] for p in bg_pts) // len(bg_pts)
        bg_g = sum(p[1] for p in bg_pts) // len(bg_pts)
        bg_b = sum(p[2] for p in bg_pts) // len(bg_pts)
    else:
        bg_r = bg_g = bg_b = -1
    info["stats"]["transparent_bg_color"] = [bg_r, bg_g, bg_b]

    if has_alpha_channel and alpha0 > 0:
        # 逐行扫描过渡像素与其外圈透明像素的色差
        diff_samples = []
        white_edge = black_edge = color_edge = 0
        for j in range(1, ys - 1):
            row = j
            for i in range(1, xs - 1):
                r, g, b, aa = px[i, j]
                if 0 < aa < 255:
                    # 看相邻像素中 alpha=0 的
                    for di, dj in ((1,0),(-1,0),(0,1),(0,-1)):
                        nr, ng, nb, na = px[i+di, j+dj]
                        if na == 0:
                            d = abs(r-nr) + abs(g-ng) + abs(b-nb)
                            if d > 90:
                                # 边缘色与透明底色差异大 → 残留
                                if abs(r-255) < 25 and abs(g-255) < 25 and abs(b-255) < 25:
                                    white_edge += 1
                                elif r < 40 and g < 40 and b < 40:
                                    black_edge += 1
                                else:
                                    color_edge += 1
                                diff_samples.append((d, (r,g,b), (nr,ng,nb), aa))
                            break
        info["stats"]["white_edge_px"] = white_edge
        info["stats"]["black_edge_px"] = black_edge
        info["stats"]["color_edge_px"] = color_edge
        if white_edge > 50:
            info["issues"].append(f"白色描边残留: 边缘 {white_edge} 像素贴近白色(亮度>230)且与透明底差异大 → 白边/白晕")
        if black_edge > 50:
            info["issues"].append(f"黑色描边残留: 边缘 {black_edge} 像素接近黑色且与透明底差异大 → 黑边/黑晕")
        if color_edge > 80:
            info["issues"].append(f"彩色残留: 边缘 {color_edge} 像素与透明底颜色差异>90/通道 → 抠图残留背景色")

    # --- 4. 通道不干净：alpha=0 区域是否残留 RGB 信息 ---
    if has_alpha_channel and alpha0 > 0:
        rgb_in_alpha0 = 0
        for i in range(0, xs, max(1, xs // 96)):
            for j in range(0, ys, max(1, ys // 96)):
                r, g, b, aa = px[i, j]
                if aa == 0 and (r > 8 or g > 8 or b > 8):
                    rgb_in_alpha0 += 1
        info["stats"]["dirty_alpha0_samples"] = rgb_in_alpha0
        if rgb_in_alpha0 > 0:
            info["issues"].append(f"通道不干净: alpha=0 的透明区域仍有 {rgb_in_alpha0} 个采样点含非零 RGB（颜色埋在透明区，文件偏大且不专业）")

    # --- 5. 色阶压缩/文件体积提示 ---
    fsize = os.path.getsize(path)
    info["stats"]["file_kb"] = round(fsize / 1024, 1)
    if fsize / n_px > 1.5:
        info["issues"].append(f"文件偏大: {round(fsize/1024)}KB / {n_px}px，可能存在多余 RGB 信息或未压缩")

    return info

def main():
    files = glob.glob(os.path.join(ROOT, "**", "*.png"), recursive=True)
    print(f"共 {len(files)} 个 PNG\n")
    report = []
    for f in sorted(files):
        info = analyze(f)
        report.append(info)
        flag = " | ".join(info["issues"]) if info["issues"] else "OK"
        print(f"[{info['mode']:>4}] {info['size']:>12} alpha0={info['stats'].get('transparent_px_ratio',0):.2f} mid={info['stats'].get('mid_alpha_ratio',0):.3f} {flag}")
        if info["issues"]:
            for it in info["issues"]:
                print(f"        ↳ {it}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
    print(f"\n报告已写入: {OUT}")

if __name__ == "__main__":
    main()
