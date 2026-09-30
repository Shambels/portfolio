"""
The /work stage's plates — one generated picture per project, cut in two.

Not a landmark and not Blender: Pillow and numpy, like `tools/logo.py`. The
source is `tools/art/{slug}-source.png`, generated on OpenArt against a pure
black ground and kept here the way the rider's generated sources are, so the
next pass has something to cut again. What comes out goes beside the content,
where `{slug}.svg` already sits — AVIF, because the light is a quarter the
size of the same thing in WebP (51 kB against 196) and every browser the site
otherwise asks for decodes it:

  src/content/projects/{slug}.base.avif   the hardware — opaque, with a real
                                          alpha: its silhouette, row by row
  src/content/projects/{slug}.light.avif  everything that is light — alpha is
                                          the brightness, colour divided by it

Two layers because the light flickers and the hardware does not, and because
they take the cursor at different depths. A plate with no hardware in it —
PolarSense's iceberg is light all the way down — has `split: None` and is
only the light layer; the stage draws what it has. Light over black is additive, so
unpremultiplying it gives a layer that composes over the page the way it
composed over the black it was rendered on, with no blend mode and no box.
The two together are the source again, to the rounding — `--check` says so.

  python3 tools/plate.py sudoku            write both
  python3 tools/plate.py sudoku --check    and prove they recompose
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# Per plate: the crop out of the source (x0, y0, x1, y1), the source row below
# which the hardware starts, and the width it is written at. The stage is a
# third of a wide screen, so 900 is a 2x screen's 450 CSS px with room.
PLATES = {
    'sudoku': {'crop': (0, 120, 1344, 1856), 'split': 1470, 'width': 900},
    # The iceberg, cropped to the stage's 900 x 1162 close about it; its
    # waterline — the empty gap between the bars — is source row 744, plate
    # row 462.8, and `Iceberg.tsx` holds that.
    'polarsense': {'crop': (110, 166, 1234, 1617), 'split': None, 'width': 900},
}

FLOOR = 3 / 255  # below this a pixel is the black it was rendered on


def cut(slug: str, check: bool) -> None:
    p = PLATES[slug]
    src = Image.open(ROOT / 'tools' / 'art' / f'{slug}-source.png').convert('RGB')
    a = np.asarray(src.crop(p['crop'])).astype(np.float64) / 255
    h, w, _ = a.shape
    lum = a.max(axis=2)
    split = h if p['split'] is None else p['split'] - p['crop'][1]

    # The hardware's silhouette: under the split, every row filled from its
    # first lit pixel to its last. A machined puck is convex in every row, so
    # a knurl gone to black inside it is still metal, not a hole.
    hw = np.zeros((h, w))
    # Metal is grey and light is cyan, so a row is hardware only where it has
    # something lit, unsaturated and short of white-hot — the beam
    # above the lid is cyan, and its core is white.
    sat = lum - a.min(axis=2)
    metal = (lum > 0.06) & (lum < 0.8) & (sat < 0.35 * lum)
    for y in range(split, h):
        xs = np.flatnonzero(metal[y])
        if len(xs) > 2:
            hw[y, xs[0]:xs[-1] + 1] = 1
    # A soft edge a pixel or two wide, so the silhouette is not a staircase.
    from scipy import ndimage
    hw = ndimage.gaussian_filter(hw, 1.2)
    hw = np.clip(hw, 0, 1)

    base = np.dstack([a, hw])
    light = a * (1 - hw[..., None])
    alpha = light.max(axis=2)
    alpha[alpha < FLOOR] = 0
    rgb = np.where(alpha[..., None] > 0, light / np.maximum(alpha[..., None], 1e-6), 0)
    lightA = np.dstack([np.clip(rgb, 0, 1), alpha])

    out = ROOT / 'src' / 'content' / 'projects'
    size = (p['width'], round(h * p['width'] / w))
    layers = [('light', lightA, 62)] if p['split'] is None else [('base', base, 72), ('light', lightA, 62)]
    for name, arr, q in layers:
        im = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)
        f = out / f'{slug}.{name}.avif'
        im.save(f, 'AVIF', quality=q, speed=2)
        print(f'{f.relative_to(ROOT)}  {size[0]}x{size[1]}  {f.stat().st_size / 1024:.1f} kB')

    if check:
        # Recompose both, as the browser will, over black; compare to the crop.
        b = (np.zeros((*size[::-1], 4)) if p['split'] is None
             else np.asarray(Image.open(out / f'{slug}.base.avif')).astype(np.float64) / 255)
        l = np.asarray(Image.open(out / f'{slug}.light.avif')).astype(np.float64) / 255
        ref = np.asarray(Image.fromarray((a * 255 + 0.5).astype(np.uint8)).resize(size, Image.LANCZOS)).astype(np.float64) / 255
        c = b[..., :3] * b[..., 3:]
        c = l[..., :3] * l[..., 3:] + c * (1 - l[..., 3:])
        err = np.abs(c - ref)
        print(f'recomposed: mean {err.mean() * 255:.2f}/255, p99 {np.percentile(err, 99) * 255:.1f}/255')
        assert err.mean() * 255 < 2.5, 'the two layers are not the picture'


if __name__ == '__main__':
    cut(sys.argv[1], '--check' in sys.argv)
