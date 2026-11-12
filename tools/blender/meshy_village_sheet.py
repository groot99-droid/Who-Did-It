"""Contact sheet of rendered frames or stills, each labelled with its file name (system Python + PIL).

    python tools/blender/meshy_village_sheet.py out.jpg 4 build/fly/story_*.jpg
"""

from __future__ import annotations

import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont


def main(out: str, cols: int, patterns: list[str], cell_w: int = 640) -> None:
    files = []
    for p in patterns:
        files.extend(sorted(glob.glob(p)))
    if not files:
        raise SystemExit("no images")
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    first = Image.open(files[0])
    cell_h = round(cell_w * first.height / first.width)
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * (cell_h + 26)), (14, 14, 18))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        x, y = (i % cols) * cell_w, (i // cols) * (cell_h + 26)
        sheet.paste(Image.open(f).convert("RGB").resize((cell_w, cell_h)), (x, y + 26))
        d.text((x + 6, y + 3), os.path.splitext(os.path.basename(f))[0], fill=(245, 235, 200), font=font)
    sheet.save(out, quality=90)
    print("SHEET", out, len(files), "images")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3:])
