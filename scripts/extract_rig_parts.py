#!/usr/bin/env python3
"""Extract independently drawn alpha components from a modular rig sheet.

This keeps generated source art inspectable: components are named generically
until a human assigns them to a rig slot and records anchors.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image


def components(alpha: Image.Image, threshold: int, minimum_pixels: int):
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    found = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pixels[x, y] < threshold:
                continue
            seen[index] = 1
            queue = deque([(x, y)])
            count = 0
            left = right = x
            top = bottom = y
            while queue:
                current_x, current_y = queue.popleft()
                count += 1
                left, right = min(left, current_x), max(right, current_x)
                top, bottom = min(top, current_y), max(bottom, current_y)
                for next_x, next_y in ((current_x + 1, current_y), (current_x - 1, current_y), (current_x, current_y + 1), (current_x, current_y - 1)):
                    if 0 <= next_x < width and 0 <= next_y < height:
                        next_index = next_y * width + next_x
                        if not seen[next_index] and pixels[next_x, next_y] >= threshold:
                            seen[next_index] = 1
                            queue.append((next_x, next_y))
            if count >= minimum_pixels:
                found.append((count, (left, top, right + 1, bottom + 1)))
    return sorted(found, key=lambda item: (item[1][1], item[1][0]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--threshold", type=int, default=80)
    parser.add_argument("--minimum-pixels", type=int, default=200)
    parser.add_argument("--padding", type=int, default=8)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    args.output.mkdir(parents=True, exist_ok=True)
    found = components(source.getchannel("A"), args.threshold, args.minimum_pixels)
    manifest = {"source": args.input.name, "size": list(source.size), "parts": []}
    for number, (pixels, (left, top, right, bottom)) in enumerate(found, start=1):
        bounds = [max(0, left - args.padding), max(0, top - args.padding), min(source.width, right + args.padding), min(source.height, bottom + args.padding)]
        filename = f"part-{number:02d}.png"
        source.crop(bounds).save(args.output / filename)
        manifest["parts"].append({"id": f"part-{number:02d}", "file": filename, "bounds": bounds, "opaquePixels": pixels, "slot": "unassigned", "anchor": None})
    (args.output / "parts.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Extracted {len(found)} parts to {args.output}")


if __name__ == "__main__":
    main()
