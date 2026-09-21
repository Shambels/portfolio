"""The site's mark: `tools/logo-source.jpg` in, `src/assets/logo/logo-{w}.webp` out.

    python3 tools/logo.py            # needs Pillow and numpy, nothing else

Not a landmark and not Blender: the source is a raster Seb supplied — a
generated mark on a flat charcoal ground, 2766 x 3320 JPEG — and this is what
turns it into something the site can put on top of its own colours.

**The ground comes out by colour-to-alpha, not by a mask.** The charcoal is
flat (sd 1.6 per channel round the border), so every pixel is read as the logo
laid over that one colour at some opacity, and the opacity is the least that
explains it — GIMP's colour-to-alpha, per channel, taking the largest. That
keeps the anti-aliased edge as a real soft edge instead of a grey halo, which
is what a hard mask leaves on a background darker than the one it was cut from
(the site's ink is #0b0c0f; this ground is #33363b). JPEG noise in the ground
is under `FLOOR` and is dropped.

**Sizes are for the chrome, at 1x, 2x and 3x.** The mark is drawn 2rem tall on
a phone and 2.4rem from 40rem up (`.brand` in `index.css`), which at its
3:4 aspect is 24 and 29 CSS pixels wide; `WIDTHS` is both at 1x, 2x and 3x,
and the `<img srcset>` in `routes/locale.tsx` lets the browser choose.
`MASTER` is kept at 512 for anything larger that comes later — an icon, a
social card — and is not referenced by the site.
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "logo-source.jpg"
OUT = ROOT / "src" / "assets" / "logo"

WIDTHS = (24, 29, 48, 58, 72, 87)
MASTER = 512
FLOOR = 0.06  # opacity below this is the ground's JPEG noise, not the mark
PAD = 0.02  # of the cropped height, round the mark


def main() -> None:
    rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float64) / 255
    border = np.concatenate([rgb[:40].reshape(-1, 3), rgb[-40:].reshape(-1, 3),
                             rgb[:, :40].reshape(-1, 3), rgb[:, -40:].reshape(-1, 3)])
    bg = np.median(border, axis=0)

    # Least opacity that explains each channel against the ground, largest wins.
    up = np.where(rgb > bg, (rgb - bg) / (1 - bg), 0)
    down = np.where(rgb < bg, (bg - rgb) / bg, 0)
    alpha = np.max(np.maximum(up, down), axis=2)
    alpha = np.clip((alpha - FLOOR) / (1 - FLOOR), 0, 1)
    safe = np.where(alpha > 0, alpha, 1)[..., None]
    colour = np.clip((rgb - bg) / safe + bg, 0, 1)

    rgba = np.dstack([colour, alpha])
    ys, xs = np.nonzero(alpha > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    pad = int((y1 - y0) * PAD)
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(rgba.shape[0], y1 + pad), min(rgba.shape[1], x1 + pad)
    mark = Image.fromarray((rgba[y0:y1, x0:x1] * 255 + 0.5).astype(np.uint8), "RGBA")

    # Resize premultiplied, or a transparent pixel's colour bleeds into the edge.
    pre = mark.convert("RGBa")
    OUT.mkdir(parents=True, exist_ok=True)
    for w in (*WIDTHS, MASTER):
        h = round(w * mark.height / mark.width)
        img = pre.resize((w, h), Image.LANCZOS).convert("RGBA")
        name = f"logo-{w}.webp"
        img.save(OUT / name, "WEBP", quality=90, alpha_quality=100, method=6)
        print(f"{name:16} {w}x{h}  {(OUT / name).stat().st_size:6} B")


if __name__ == "__main__":
    main()
