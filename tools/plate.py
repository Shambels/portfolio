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

Arts by Sandra's is the third kind: an opaque scene — an easel, a blank
canvas, a palette — with nothing to cut, and two more layers that live on
the canvas (`studio()` below). Memojo's is the same kind — a camera on a
table — and its extra layer is the photographs it prints (`photos()`).

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
    # The easel: opaque, cropped to 900 x 1162 from the top, so the palette and
    # the rag stay in. `Studio.tsx` holds the canvas's corners and the blobs.
    'arts-by-sandra': {'crop': (0, 57, 1344, 1792), 'split': 'opaque', 'width': 900},
    # The instant camera on its table: opaque, the foot of the table trimmed.
    # `Camera.tsx` holds the lens, the flash and the slot.
    'memojo': {'crop': (0, 0, 1344, 1735), 'split': 'opaque', 'width': 900},
}

# The canvas in the source scene, corner by corner (it is a hair wider at the
# foot — the easel leans back a touch), and the painting's crop to its shape.
CANVAS = [(194, 102), (1148, 101), (1156, 1282), (184, 1280)]  # TL TR BR BL


def photos() -> None:
    """Memojo's twelve snapshots, out of the contact sheet they were generated
    on (`tools/art/memojo-photos.png`, OpenArt) and into one 4 x 3 atlas of
    squares — the pictures only: each sat in a white card with rounded
    corners, and the card is cut away with a margin, because `Camera.tsx`
    draws the instant-film frame itself. Found by what is not card-white in
    each cell of the sheet, so a regenerated sheet re-measures itself."""
    from scipy import ndimage

    a = np.asarray(Image.open(ROOT / 'tools' / 'art' / 'memojo-photos.png').convert('RGB'))
    f = a.astype(np.float64)
    ink = (f.mean(axis=2) < 225) | (f.max(axis=2) - f.min(axis=2) > 20)
    h, w = ink.shape
    side = 320
    atlas = Image.new('RGB', (side * 4, side * 3))
    for r in range(3):
        for c in range(4):
            y0, y1, x0, x1 = r * h // 3, (r + 1) * h // 3, c * w // 4, (c + 1) * w // 4
            lab, n = ndimage.label(ink[y0:y1, x0:x1])
            sizes = ndimage.sum(ink[y0:y1, x0:x1], lab, range(1, n + 1))
            ys, xs = np.nonzero(lab == int(np.argmax(sizes)) + 1)
            inset = 16  # past the rounded corners
            box = (x0 + xs.min() + inset, y0 + ys.min() + inset, x0 + xs.max() - inset, y0 + ys.max() - inset)
            assert abs((box[2] - box[0]) - (box[3] - box[1])) < 8, f'photo {r},{c} is not square: {box}'
            atlas.paste(Image.fromarray(a).crop(box).resize((side, side), Image.LANCZOS), (c * side, r * side))
    f = ROOT / 'src' / 'content' / 'projects' / 'memojo.photos.avif'
    atlas.save(f, 'AVIF', quality=60, speed=2)
    print(f'{f.relative_to(ROOT)}  {atlas.size[0]}x{atlas.size[1]}  {f.stat().st_size / 1024:.1f} kB')


def studio() -> None:
    """The two layers that live on Arts by Sandra's canvas.

    `painting.avif` is the still life (`tools/art/arts-by-sandra-painting.png`,
    generated on OpenArt), cropped to the canvas's proportions. Nobody sees it
    whole: `Studio.tsx` reads its light and shade to model the visitor's
    strokes, so the scene comes out of the canvas in whatever colours they
    paint with.

    `sketch.avif` is the underdrawing — made here from the painting and not
    generated, because it has to lie exactly over the painting it came from,
    and an image model never gives a composition back to the pixel. Graphite
    on white, so the page can multiply it straight onto the canvas: contour
    lines off the painting's edges, a soft dodge tone, and hatching in the
    shadows that doubles into cross-hatching where they are darkest.
    """
    from scipy import ndimage

    src = Image.open(ROOT / 'tools' / 'art' / 'arts-by-sandra-painting.png').convert('RGB')
    (x0, y0), (x1, _), (x2, y2), (_, y3) = CANVAS
    aspect = ((x1 - x0 + x2 - CANVAS[3][0]) / 2) / ((y2 + y3) / 2 - (y0 + CANVAS[1][1]) / 2)
    w, h = src.size
    ch = round(w / aspect)
    top = (h - ch) // 2
    paint = src.crop((0, top, w, top + ch))
    size = (720, round(720 / aspect))
    out = ROOT / 'src' / 'content' / 'projects'
    paint.resize(size, Image.LANCZOS).save(out / 'arts-by-sandra.painting.avif', 'AVIF', quality=58, speed=2)

    g = np.asarray(paint.convert('L').resize(size, Image.LANCZOS)).astype(np.float64) / 255
    # Contours by XDoG — a difference of Gaussians softly thresholded, which
    # is what a pencil line is to a value edge: one stroke on the big forms,
    # none in the brushwork. Blurred first so the impasto does not draw.
    base = ndimage.gaussian_filter(g, 2.0)
    dog = ndimage.gaussian_filter(base, 1.6) - 0.985 * ndimage.gaussian_filter(base, 1.6 * 1.7)
    line = np.clip(-dog / 0.018, 0, 1) ** 1.3
    # Light hatching where the shadows are, loose and wide, crossed only in
    # the very darkest — the charcoal an underdrawing blocks the masses with.
    rng = np.random.default_rng(7)
    yy, xx = np.mgrid[0:size[1], 0:size[0]].astype(np.float64)
    wob = ndimage.gaussian_filter(rng.standard_normal(g.shape), 6) * 18
    shade = ndimage.gaussian_filter(g, 5)
    dark = np.clip((0.42 - shade) / 0.32, 0, 1)
    darker = np.clip((0.13 - shade) / 0.12, 0, 1)
    h1 = np.clip((np.sin((xx * 1.1 + yy + wob) * 0.3) - (1 - 0.8 * dark)) * 2.5, 0, 1)
    h2 = np.clip((np.sin((xx - yy + wob) * 0.33) - (1 - 0.9 * darker)) * 4, 0, 1)
    hatch = np.maximum(h1 * dark, h2 * darker) * 0.2
    grain = ndimage.gaussian_filter(rng.random(g.shape), 0.6)
    ink = np.clip(np.maximum(line * 0.7, hatch) * (0.7 + 0.6 * grain), 0, 0.75)
    graphite = np.array([0.30, 0.29, 0.30])
    rgb = 1 - ink[..., None] * (1 - graphite)
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).save(out / 'arts-by-sandra.sketch.avif', 'AVIF', quality=60, speed=2)
    for n in ('painting', 'sketch'):
        f = out / f'arts-by-sandra.{n}.avif'
        print(f'{f.relative_to(ROOT)}  {size[0]}x{size[1]}  {f.stat().st_size / 1024:.1f} kB')

FLOOR = 3 / 255  # below this a pixel is the black it was rendered on


def cut(slug: str, check: bool) -> None:
    p = PLATES[slug]
    src = Image.open(ROOT / 'tools' / 'art' / f'{slug}-source.png').convert('RGB')
    a = np.asarray(src.crop(p['crop'])).astype(np.float64) / 255
    h, w, _ = a.shape
    lum = a.max(axis=2)
    if p['split'] == 'opaque':
        # Nothing to cut: the whole scene, its edges feathered into the page.
        yy, xx = np.mgrid[0:h, 0:w]
        edge = np.minimum.reduce([xx, w - 1 - xx, yy, h - 1 - yy]) / (0.05 * w)
        rgba = np.dstack([a, np.clip(edge, 0, 1)])
        size = (p['width'], round(h * p['width'] / w))
        f = ROOT / 'src' / 'content' / 'projects' / f'{slug}.base.avif'
        Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS).save(f, 'AVIF', quality=66, speed=2)
        print(f'{f.relative_to(ROOT)}  {size[0]}x{size[1]}  {f.stat().st_size / 1024:.1f} kB')
        {'arts-by-sandra': studio, 'memojo': photos}[slug]()
        return
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
