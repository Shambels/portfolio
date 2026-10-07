"""
The mine — PolarSense's landmark, on an iceberg since the island learned to
float (`src/berg.ts`). A frozen mountain with the mine dug into it.

    python3 tools/mine.py                    # tools/mine.blend + src/models/mine.glb
    python3 tools/mine.py --render out.png   # ...and three preview views

**The mountain is the logo, not drawn literally.** PolarSense's mark is a bar
chart standing in water — seven bars above the line, the middle one tallest —
and the massif is seven ridges side by side in that order of height. Each one
is the lowest of five planes: two steep flanks, a steep face toward the
visitor, a longer fall behind, and a top cut on a slant, which is all that is
left of a bar. Unioned with a soft maximum over a low skirt, so they are one
mountain whose skyline steps, not seven bars standing on the snow. The first
pass of this file *was* seven hexagonal prisms of ice, and from the approach
it read as a city; the second was one smooth peak and read as nothing. This
is between them: from across the water the steps are the chart, from beside
it they are a mountain.

**The mine is dug into it.** The adit is cut into the foot of the tallest
ridge with a boolean, as the first mine's was, timbered with square sets and
lined dark inside — the scene has one sun and no shadow maps, so an unlined
hole is lit as brightly as the face. Rails run out of it across the snow
toward the visitor, and icicles hang off the portal's cap. The head-frame
stands on the lowest ridge, which is cut flat for it: a shaft sunk through
the ice.

Every surface of the mountain is one material key, `ice_`, and the shader in
`Landmarks.tsx` decides from the normal what is snow (anything that faces the
sky) and what is ice (the walls), with the ice going from white high on a
face to the logo's cyan at its foot. Geometry only, as ever. The mountain is
`ice_mountain`, and it is the wall the board comes off (`WALLED` in
`src/plateau.ts`) from 15 cm up, so the snow drifted round its foot is
ridden over; the head-frame and the rails are `frame_works` and are not.

It is a heightfield, sampled fine, softened in height and decimated back to a
landmark's budget, because a plane meeting a plane on a grid steps in plan
and a step a grid cell wide on a cliff edge is a saw.

Why a script and not a saved .blend as the source: the same as before. The
ridges are a table of numbers, and the adit has to be cut where the face
actually is; a script keeps both re-derivable. `mine.blend` is an output.
"""

from __future__ import annotations

import math
import sys

from landmark import (
    T, add_box, add_prism, add_torus, boolean, clamp01, export, finish, join,
    mesh_object, preview, start, strut,
)
import bpy
import bmesh
from mathutils import Matrix, Vector

# ---------------------------------------------------------------- the contract
# src/content/projects/polarsense.en.mdx, frontmatter `size`.
BOX = (6.8, 4.4, 4.6)

GLB = "src/models/mine.glb"
BLEND = "tools/mine.blend"

VIEWS = {
    "approach": ((0.6, 5.2, 13.6), (0.0, 1.6, -0.8)),
    "quarter": ((9.4, 4.6, 9.2), (-0.2, 1.6, -0.9)),
    "front": ((0.0, 2.0, 10.0), (0.0, 2.0, 0.0)),
}

# ---------------------------------------------------------------- the massif
# Seven ridges side by side, in the logo's order of height — its bars above
# the line are 0.25, 0.48, 0.78, 1, 0.73, 0.45 and 0.23 of the tallest — each
# one a buttress with a steep ice face toward the visitor, a slanted cut top
# and a longer fall behind. Unioned with a soft max over a mountain's skirt,
# so they are one massif whose skyline steps, rather than seven bars standing
# on the snow. The two shortest are lifted or they read as boulders; the last
# is wide and cut flat, because the head-frame stands on it.
#
# x, half-width, height, z of the face's foot, slant of the top along x, and
# how deep the cut top runs before the fall behind starts.
RIDGES = [
    (-2.42, 0.62, 1.15, 0.20, 0.10, 0.45),
    (-1.62, 0.52, 1.90, -0.12, -0.07, 0.40),
    (-0.82, 0.50, 2.90, -0.30, 0.08, 0.35),
    (0.00, 0.56, 3.85, 0.05, -0.05, 0.25),  # the adit is in this one
    (0.84, 0.50, 2.75, -0.35, 0.07, 0.35),
    (1.62, 0.50, 1.75, -0.20, -0.08, 0.40),
    (2.42, 0.86, 0.95, 0.25, 0.0, 1.10),  # flat: the head-frame's
]
FRAME_RIDGE = RIDGES[6]
SHAFT = (2.42, -0.62)
FRAME_BASE = 0.95


def smax(a: float, b: float, k: float = 0.12) -> float:
    """Soft maximum: two ridges meet in a fillet of snow, not a crease. The
    fillet fades out near the ground, or two zeroes would meet in a 3 cm slab."""
    k *= clamp01(max(a, b) / 0.3)
    if k <= 1e-6:
        return max(a, b)
    h = clamp01(0.5 + 0.5 * (a - b) / k)
    return a * h + b * (1 - h) + k * h * (1 - h)


# How steep the faces are, as rise over run: the flanks either side, the face
# toward the visitor, and the long fall behind. Planes and not curves — a
# ridge is the lowest of five planes, so it is faceted the way fractured ice
# is, and its top is the slanted cut that is all that is left of a bar.
FLANK = 3.1
FACE = 2.5
FALL = 3.0


def ridge(r, x: float, z: float) -> float:
    rx, hw, h, zf, slant, deep = r
    # The flank wanders with depth, or every ridge is ruled.
    u = abs(x - rx - 0.07 * math.sin(2.3 * z + rx * 3.1))
    top = h + slant * (x - rx)
    across = h - max(0.0, u - hw * 0.55) * FLANK
    front = (zf - z) * FACE
    crest = zf - h / FACE - deep  # where the cut top ends and the fall begins
    back = h - max(0.0, crest - z) * FALL
    return max(0.0, min(top, across, front, back))


def skirt(x: float, z: float) -> float:
    """The mountain's foot: a low mound under every ridge, so they stand in
    one body, and a drift of snow in front of them."""
    d = math.hypot(x / 3.2, (z + 1.45) / 1.65)
    return 0.75 * clamp01(1.0 - d) ** 1.4


def height(x: float, z: float) -> float:
    h = skirt(x, z)
    for r in RIDGES:
        h = smax(h, ridge(r, x, z))
    # Fracture: a few centimetres of detuned harmonics, across and up, so a
    # face reads as broken ice rather than a modelled slab. Kept off the
    # head-frame's bench and the adit's mouth, which have to be flat.
    n = (0.045 * math.sin(5.3 * x + 1.7 * z + 0.4) + 0.03 * math.sin(8.9 * z - 3.1 * x + 1.9)
         + 0.012 * math.sin(13.0 * x + 11.0 * z))
    calm = clamp01((math.hypot(x - SHAFT[0], z - SHAFT[1]) - 0.5) / 0.2)
    mouth = clamp01((abs(x - ADIT_X) - ADIT_W - 0.1) / 0.3) if z > ADIT_FACE - 0.4 else 1.0
    h += n * clamp01(h / 0.4) * calm * max(mouth, 0.0)
    # The bench: dead flat where the head-frame stands — cut down to it where
    # the mountain is higher, and left alone where the ridge already is it.
    if calm < 1.0 and h > FRAME_BASE:
        h = h * calm + FRAME_BASE * (1 - calm)
    # And the notch in front of the adit, kept clear of snow to the floor.
    if z > ADIT_FACE - 0.05:
        h *= mouth
    # Down to nothing at the sheet's own border, whatever the ridges say, so
    # its closing skirt is never a wall anyone can see.
    e = min(x - X0, X1 - x, z - Z0, Z1 - z)
    return max(h, 0.0) * clamp01(e / 0.25)


GRID_X, GRID_Z = 176, 108
X0, X1 = -3.25, 3.25
Z0, Z1 = -3.45, 0.7


def build_massif() -> bpy.types.Object:
    bm = bmesh.new()
    rows: list[list[bmesh.types.BMVert]] = []
    for i in range(GRID_X + 1):
        x = X0 + (X1 - X0) * i / GRID_X
        row = []
        for j in range(GRID_Z + 1):
            z = Z0 + (Z1 - Z0) * j / GRID_Z
            # Two centimetres under the snowfield wherever there is no
            # mountain, so the sheet's edge never shows.
            row.append(bm.verts.new(T(x, height(x, z) - 0.02, z)))
        rows.append(row)
    for i in range(GRID_X):
        for j in range(GRID_Z):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    # Sampled fine and then softened in height only: a plane meeting a plane
    # on a grid steps in plan, and a step a grid cell wide on a cliff edge is
    # a saw. Two passes round every edge by a few centimetres, which is also
    # what snow does to an edge. The sheet's own border stays put.
    inner = [v for i, row in enumerate(rows) for j, v in enumerate(row)
             if 0 < i < GRID_X and 0 < j < GRID_Z]
    for _ in range(2):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=False, use_axis_y=False, use_axis_z=True)
    # Closed, for the adit's boolean.
    floor = -0.06
    edge = [
        [rows[i][0] for i in range(GRID_X + 1)],
        [rows[GRID_X][j] for j in range(GRID_Z + 1)],
        [rows[i][GRID_Z] for i in range(GRID_X, -1, -1)],
        [rows[0][j] for j in range(GRID_Z, -1, -1)],
    ]
    ring = [v for side in edge for v in side[:-1]]
    below = [bm.verts.new(Vector((v.co.x, v.co.y, floor))) for v in ring]
    n = len(ring)
    for k in range(n):
        bm.faces.new((ring[k], below[k], below[(k + 1) % n], ring[(k + 1) % n]))
    bm.faces.new(tuple(reversed(below)))
    bm.normal_update()
    return mesh_object("ice_mountain", bm)


# ------------------------------------------------------------------ the adit
ADIT_X = 0.0
ADIT_H = 0.86
ADIT_W = 0.31  # half-width
ADIT_Z_MOUTH = 0.45
ADIT_Z_END = -2.2


def _face() -> float:
    """Where the face is tall enough to hold the portal — walked in from the
    front, as the first mine found its own."""
    z = 0.3
    while z > ADIT_Z_END + 0.6:
        if height_raw(ADIT_X, z) >= ADIT_H + 0.6:
            return z
        z -= 0.02
    raise AssertionError("no face tall enough for the adit — retune `RIDGES`")


def height_raw(x: float, z: float) -> float:
    h = skirt(x, z)
    for r in RIDGES:
        h = smax(h, ridge(r, x, z))
    return h


ADIT_FACE = _face()


def arch_profile(half_w: float, height: float, z: float, shrink: float = 1.0) -> list[Vector]:
    """Arch section in three-space, at depth z. Square-set legs, chamfered crown."""
    w = half_w * shrink
    h = height * shrink
    return [
        T(ADIT_X - w, -0.05, z),
        T(ADIT_X - w, h * 0.66, z),
        T(ADIT_X - w * 0.62, h, z),
        T(ADIT_X + w * 0.62, h, z),
        T(ADIT_X + w, h * 0.66, z),
        T(ADIT_X + w, -0.05, z),
    ]


def build_tunnel(shrink: float, z_front: float, z_back: float, flip: bool) -> bmesh.types.BMesh:
    bm = bmesh.new()
    add_prism(
        bm,
        arch_profile(ADIT_W, ADIT_H, z_front, shrink) + arch_profile(ADIT_W, ADIT_H, z_back, shrink),
        flip=flip,
    )
    return bm


# ------------------------------------------------------------------ the works


def corner(i: int, y: float) -> tuple[float, float, float]:
    """Corner i of the head-frame at height y above the column it stands on."""
    half = 0.4 + (0.15 - 0.4) * (y / FRAME_H)
    return (
        SHAFT[0] + (-half if i in (0, 3) else half),
        FRAME_BASE + y,
        SHAFT[1] + (-half if i < 2 else half),
    )


FRAME_H = 1.55


def build_works() -> bpy.types.Object:
    bm = bmesh.new()
    base = FRAME_BASE
    top = FRAME_H
    levels = [0.0, 0.55, 1.08, top]
    for i in range(4):
        add_box(bm, strut(corner(i, 0.0), corner(i, top), 0.085))
    for li in range(1, len(levels)):
        y, prev = levels[li], levels[li - 1]
        for i in range(4):
            j = (i + 1) % 4
            add_box(bm, strut(corner(i, y), corner(j, y), 0.06))
            add_box(bm, strut(corner(i, prev), corner(j, y), 0.045))
    # Back-legs, leaning into the pull of the rope, toward the mountain.
    for i, foot in ((0, (SHAFT[0] - 0.1, base, SHAFT[1] - 0.62)), (1, (SHAFT[0] + 0.45, base, SHAFT[1] - 0.5))):
        add_box(bm, strut(corner(i, top - 0.12), foot, 0.08))
    # Deck and sheave.
    for k in range(3):
        x = SHAFT[0] + (k - 1) * 0.11
        add_box(bm, strut((x, base + top + 0.04, SHAFT[1] - 0.2), (x, base + top + 0.04, SHAFT[1] + 0.2), 0.1, 0.045))
    sheave_y = base + top + 0.22
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=10, radius1=0.05, radius2=0.05, depth=0.34,
        matrix=Matrix.Translation(T(SHAFT[0], sheave_y, SHAFT[1])) @ Matrix.Rotation(math.pi / 2, 4, "Y"),
    )
    add_torus(bm, T(SHAFT[0], sheave_y, SHAFT[1]), 0.21, 0.035)
    for k in range(6):
        a = k * math.pi / 3
        add_box(bm, strut((SHAFT[0], sheave_y, SHAFT[1]),
                          (SHAFT[0], sheave_y + 0.2 * math.sin(a), SHAFT[1] + 0.2 * math.cos(a)), 0.03))
    add_box(bm, strut((SHAFT[0], sheave_y - 0.21, SHAFT[1]), (SHAFT[0], base + 0.05, SHAFT[1]), 0.025))
    # Shaft collar, proud of the ice.
    for sx, sz in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        add_box(bm, strut(
            (SHAFT[0] + sx * 0.28 - sz * 0.34, base + 0.05, SHAFT[1] + sz * 0.28 - sx * 0.34),
            (SHAFT[0] + sx * 0.28 + sz * 0.34, base + 0.05, SHAFT[1] + sz * 0.28 + sx * 0.34),
            0.11, 0.12,
        ))

    # The portal: two posts and a cap at the face, and square sets receding.
    sets = 4
    pitch = (ADIT_FACE - 0.06 - ADIT_Z_END) / sets
    for k in range(sets):
        z = ADIT_FACE + (0.05 if k == 0 else -0.06 - k * pitch)
        w = ADIT_W * (1.08 if k == 0 else 0.985)
        h = ADIT_H * (1.06 if k == 0 else 0.985)
        add_box(bm, strut((ADIT_X - w, -0.02, z), (ADIT_X - w, h * 0.7, z), 0.09))
        add_box(bm, strut((ADIT_X + w, -0.02, z), (ADIT_X + w, h * 0.7, z), 0.09))
        add_box(bm, strut((ADIT_X - w - 0.06, h * 0.7, z), (ADIT_X + w + 0.06, h * 0.7, z), 0.1))
        add_box(bm, strut((ADIT_X - w * 0.66, h, z), (ADIT_X + w * 0.66, h, z), 0.08))
        add_box(bm, strut((ADIT_X - w, h * 0.7, z), (ADIT_X - w * 0.66, h, z), 0.075))
        add_box(bm, strut((ADIT_X + w, h * 0.7, z), (ADIT_X + w * 0.66, h, z), 0.075))

    # Rails out of the adit and across the snow, on ties.
    z0, z1 = ADIT_Z_END + 0.2, ADIT_FACE + 1.4
    for sx in (-1, 1):
        add_box(bm, strut((ADIT_X + sx * 0.17, 0.045, z0), (ADIT_X + sx * 0.17, 0.045, z1), 0.035, 0.04))
    k = 0
    z = z1 - 0.05
    while z > ADIT_FACE - 0.2:
        add_box(bm, strut((ADIT_X - 0.27, 0.012, z), (ADIT_X + 0.27, 0.012, z), 0.07, 0.035))
        z -= 0.27
        k += 1
    bm.normal_update()
    return mesh_object("frame_works", bm)


def build_icicles(bm: bmesh.types.BMesh) -> None:
    """Off the portal's cap, toward the visitor — the thing that says frozen
    from across the water before the snow does."""
    y = ADIT_H * 1.06 * 0.7 - 0.05
    z = ADIT_FACE + 0.05
    for k, (dx, ln) in enumerate(((-0.33, 0.16), (-0.18, 0.27), (-0.04, 0.12), (0.1, 0.22), (0.24, 0.3), (0.36, 0.14))):
        bmesh.ops.create_cone(
            bm, cap_ends=True, segments=5, radius1=0.022, radius2=0.0, depth=ln,
            matrix=Matrix.Translation(T(ADIT_X + dx, y - ln / 2, z + 0.03 * (k % 2)))
            @ Matrix.Rotation(math.pi, 4, "X"),
        )


def build_dark() -> bpy.types.Object:
    bm = build_tunnel(0.985, ADIT_FACE + 0.02, ADIT_Z_END + 0.04, flip=True)
    add_box(bm, Matrix.LocRotScale(T(SHAFT[0], FRAME_BASE + 0.02, SHAFT[1]), None, Vector((0.48, 0.48, 0.06))))
    return mesh_object("dark_holes", bm)


# --------------------------------------------------------------------- plumbing


def main() -> None:
    start()

    mountain = build_massif()
    # And thinned back to a landmark's budget where it is flat — which is most
    # of the sheet — keeping the edges, which are where the shape is.
    dec = mountain.modifiers.new("thin", "DECIMATE")
    dec.ratio = 0.26
    bpy.context.view_layer.objects.active = mountain
    bpy.ops.object.modifier_apply(modifier=dec.name)
    boolean(mountain, mesh_object("ice_cutter", build_tunnel(1.0, ADIT_Z_MOUTH, ADIT_Z_END, False)))
    bm = bmesh.new()
    build_icicles(bm)
    mountain = join("ice_mountain", [mountain, mesh_object("ice_icicles", bm)])
    works = build_works()
    dark = build_dark()

    finish(mountain, 42)
    finish(works, 40, bevel=0.012)
    finish(dark, 60)

    print(f"[mine] adit face at z {ADIT_FACE:.2f}  ·  summit {max(height(x / 20 - 3.2, z / 20 - 3.4) for x in range(129) for z in range(80)):.2f}")
    export("mine", BOX, GLB, BLEND)

    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS, ortho_scale=8.0)


if __name__ == "__main__":
    main()
