#!/usr/bin/env python3
"""Build curated transparent camera cutouts as self-contained SVG assets."""
from __future__ import annotations

import base64
import io
import json
from collections import Counter, deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "cameras"
OUTPUT = ROOT / "assets" / "camera-cutouts"
MANIFEST = ROOT / "js" / "camera-cutout-library.js"

# Curated models with useful front/three-quarter product views. Keeping this
# list explicit prevents documentary photos, manuals and accessories from
# silently entering the visible sticker library.
SELECTED = {
    "leica-m2", "leica-m4", "nikon-s2", "canon-p", "nikon-f", "nikon-f2",
    "nikon-f3", "nikon-fm2", "canon-ae1", "canon-f1", "olympus-om1",
    "minolta-x700", "contax-t2", "ricoh-gr1", "konica-c35", "rollei-35",
    "polaroid-sx70", "instax-wide", "hasselblad-1600f", "mamiya-rb67",
    "pentax-6x7", "bronica-sq", "kiev-88", "rolleiflex", "rolleicord",
    "yashica-mat", "minolta-autocord", "mamiya-645", "mamiya-645super",
    "bronica-etr", "fuji-gx680", "fuji-g617", "holga-120", "diana-f",
}


def distance_sq(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return sum((a[i] - b[i]) ** 2 for i in range(3))


def background_palette(image: Image.Image) -> list[tuple[int, int, int]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    samples = []
    stride = max(1, min(width, height) // 80)
    band = max(2, min(width, height) // 45)
    for x in range(0, width, stride):
        for y in (*range(band), *range(height - band, height)):
            samples.append(rgb.getpixel((x, y)))
    for y in range(0, height, stride):
        for x in (*range(band), *range(width - band, width)):
            samples.append(rgb.getpixel((x, y)))
    quantized = Counter(tuple((channel // 24) * 24 + 12 for channel in color) for color in samples)
    return [color for color, _ in quantized.most_common(10)]


def foreground_alpha(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    palette = background_palette(rgb)
    threshold_sq = 64 * 64
    background_like = bytearray(width * height)
    for y in range(height):
        offset = y * width
        for x in range(width):
            background_like[offset + x] = min(distance_sq(pixels[x, y], color) for color in palette) <= threshold_sq
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def eligible(x: int, y: int) -> bool:
        return bool(background_like[y * width + x])

    for x in range(width):
        if eligible(x, 0): queue.append((x, 0))
        if eligible(x, height - 1): queue.append((x, height - 1))
    for y in range(height):
        if eligible(0, y): queue.append((0, y))
        if eligible(width - 1, y): queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if visited[index] or not eligible(x, y):
            continue
        visited[index] = 1
        if x: queue.append((x - 1, y))
        if x + 1 < width: queue.append((x + 1, y))
        if y: queue.append((x, y - 1))
        if y + 1 < height: queue.append((x, y + 1))

    alpha = Image.new("L", (width, height), 255)
    alpha.putdata([0 if value else 255 for value in visited])
    # Close tiny holes, soften only the final edge and keep the camera crisp.
    alpha = alpha.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.1))
    return alpha


def build_cutout(camera_id: str, metadata: dict) -> dict | None:
    source = ROOT / metadata["src"]
    if not source.exists():
        return None
    image = Image.open(source).convert("RGBA")
    image.thumbnail((420, 420), Image.Resampling.LANCZOS)
    alpha = foreground_alpha(image)
    image.putalpha(alpha)
    bbox = alpha.point(lambda value: 255 if value > 22 else 0).getbbox()
    if not bbox:
        return None
    image = image.crop(bbox)
    pad = max(8, round(max(image.size) * .045))
    padded = Image.new("RGBA", (image.width + pad * 2, image.height + pad * 2), (0, 0, 0, 0))
    padded.alpha_composite(image, (pad, pad))
    png = io.BytesIO()
    padded.save(png, format="PNG", optimize=True)
    encoded = base64.b64encode(png.getvalue()).decode("ascii")
    width, height = padded.size
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {width} {height}" width="{width}" height="{height}">'
        f'<image width="{width}" height="{height}" xlink:href="data:image/png;base64,{encoded}"/>'
        '</svg>'
    )
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / f"{camera_id}.svg"
    target.write_text(svg, encoding="utf-8")
    return {
        "src": f"assets/camera-cutouts/{camera_id}.svg",
        "ratio": width / height,
        "author": metadata.get("author", ""),
        "license": metadata.get("license", ""),
        "licenseUrl": metadata.get("licenseUrl", ""),
        "source": metadata.get("source", ""),
        "title": metadata.get("title", ""),
    }


def main() -> None:
    metadata = json.loads((SOURCE / "ATTRIBUTION.json").read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for previous in OUTPUT.glob("*.svg"):
        previous.unlink()
    result = {}
    for camera_id in sorted(SELECTED):
        if camera_id in metadata:
            asset = build_cutout(camera_id, metadata[camera_id])
            if asset:
                result[camera_id] = asset
    MANIFEST.write_text(
        "/** Curated transparent camera cutouts generated from attributed source photos. */\n"
        f"window.CameraCutoutLibrary = {json.dumps(result, ensure_ascii=False, indent=2)};\n",
        encoding="utf-8",
    )
    (OUTPUT / "ATTRIBUTION.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"selected": len(SELECTED), "generated": len(result)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
