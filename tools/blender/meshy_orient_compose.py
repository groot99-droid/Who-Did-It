"""Join the tiles of `meshy_orient_sheets.py` into one labelled sheet per model, plus an overview (system Python + PIL).

    python tools/blender/meshy_orient_compose.py tools/blender/build/orient
"""

from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

CAPTIONS = {
    "S": "S view: camera SOUTH of model, looking north",
    "E": "E view: camera EAST of model, looking west",
    "N": "N view: camera NORTH of model, looking south",
    "W": "W view: camera WEST of model, looking east",
    "TOP": "TOP view: straight down, north is up",
}


def font(size: int):
    for f in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main(root: str) -> None:
    report = json.load(open(os.path.join(root, "orient.json")))
    out = os.path.join(root, "sheets")
    os.makedirs(out, exist_ok=True)
    f_head, f_cap = font(20), font(15)
    thumbs = []
    for name, info in report.items():
        tiles = [Image.open(os.path.join(root, f"{name}_{v}.png")).convert("RGB") for v in CAPTIONS]
        t = tiles[0].width
        im = Image.new("RGB", (t * 5, t + 62), (16, 16, 20))
        d = ImageDraw.Draw(im)
        bx, by, bz = info["bbox_m"]
        d.text((8, 6), f"{name}   |   kind: {info['kind']}   |   current longest side: {info['size_m']} m   |   "
                        f"bbox x*y*z: {bx} x {by} x {bz} m   |   pink figure = 1.75 m adult",
               fill=(240, 240, 240), font=f_head)
        for i, (v, cap) in enumerate(CAPTIONS.items()):
            im.paste(tiles[i], (i * t, 34))
            d.text((i * t + 6, t + 38), cap, fill=(255, 220, 120), font=f_cap)
        im.save(os.path.join(out, f"{name}.jpg"), quality=90)
        thumbs.append((name, tiles[0].resize((160, 160)), tiles[1].resize((160, 160))))
    # overview: S and E views of every model, 6 models per row
    per_row, cell_w, cell_h = 6, 320, 178
    rows = (len(thumbs) + per_row - 1) // per_row
    for part in range((rows + 4) // 5):
        chunk = thumbs[part * per_row * 5:(part + 1) * per_row * 5]
        if not chunk:
            break
        ov = Image.new("RGB", (per_row * cell_w, ((len(chunk) + per_row - 1) // per_row) * cell_h), (16, 16, 20))
        d = ImageDraw.Draw(ov)
        for i, (name, s, e) in enumerate(chunk):
            x, y = (i % per_row) * cell_w, (i // per_row) * cell_h
            ov.paste(s, (x, y))
            ov.paste(e, (x + 160, y))
            d.text((x + 4, y + 161), name[:38], fill=(240, 240, 240), font=font(13))
        ov.save(os.path.join(out, f"_overview_{part + 1}.jpg"), quality=88)
    print("COMPOSED", len(thumbs), "sheets in", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "tools/blender/build/orient")
