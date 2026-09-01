"""
The mine — PolarSense's landmark. Phase 4, first of the three.

    python3 tools/mine.py                    # tools/mine.blend + src/models/mine.glb
    python3 tools/mine.py --render out.png   # ...and three preview views

Why a script and not a saved .blend as the source: the geometry is derived from
numbers that already exist elsewhere — the box in the frontmatter, the bench
heights the blockout used, the ship's hover height. A script keeps them in one
place and re-derivable; `mine.blend` is an output you open to sculpt, not a file
anyone hand-maintains. Edit here, re-run, and the .blend is rebuilt.

Shared plumbing, the coordinate convention and the export are in `landmark.py`.
"""

from __future__ import annotations

import math
import sys

from landmark import (
    T, add_box, add_prism, add_torus, boolean, clamp01, export, finish, join,
    lump, mesh_object, preview, start, strut,
)
import bpy
import bmesh
from mathutils import Matrix, Quaternion, Vector

# ---------------------------------------------------------------- the contract
# src/content/projects/polarsense.en.mdx, frontmatter `size`. The dev-only check
# in Landmarks.tsx asserts the built geometry fits this, so blowing the budget
# here fails loudly in the browser rather than quietly overhanging an island.
BOX = (5.0, 3.5, 5.0)

# Bench tops, from the blockout. The visitor's saucer hovers at GROUND + a bit,
# so the lowest bench stays under it and the head-frame stays over it.
BENCHES = [0.62, 1.28, 1.9, 2.45]

SHAFT = (1.3, 1.05)  # x, z — head-frame centre
FRAME_TOP = 2.45
ADIT_X = -1.3
ADIT_H = 0.92
ADIT_W = 0.52  # half-width

GRID_X, GRID_Z = 88, 56
X0, X1 = -2.45, 2.45
Z0, Z1 = -2.38, 0.34

GLB = "src/models/mine.glb"
BLEND = "tools/mine.blend"

VIEWS = {
    "approach": ((0.6, 4.8, 12.6), (0.0, 1.3, -0.5)),
    "quarter": ((8.4, 4.0, 8.8), (-0.2, 1.2, -0.6)),
    "front": ((-0.2, 1.55, 9.0), (-0.2, 1.5, 0.0)),
}


# ------------------------------------------------------------------- the cut
# A terraced outcrop, not a pit: the benches step back into a hill, which is what
# fits a 5m island and what the blockout established. Height is a smooth mound
# quantised onto the bench levels, so every terrace edge is an iso-contour of the
# mound and comes out irregular for free. Below the first bench the mound is left
# continuous — that is the talus at the foot, and terracing it would read as a
# staircase rather than as a mine.


def mound(x: float, z: float) -> float:
    """Metres above the plateau, before the benches are cut."""
    rise = clamp01((0.2 - z) / 1.9) ** 0.75  # climbs toward the back
    back = clamp01((z + 2.44) / 0.62)  # and falls away again behind the crest
    # Asymmetric on purpose: the hill occupies the left of the island and dies
    # out by x = 1.0, which is what leaves the head-frame standing clear on flat
    # ground instead of half-buried in a slope.
    side = (clamp01((x + 2.42) / 0.75) * clamp01((1.0 - x) / 0.85)) ** 0.5
    base = 2.82 * rise * back * side
    # Three detuned harmonics, same trick as the island coastline. The amplitude
    # is deliberately most of a bench height: it is what makes a terrace edge
    # wander in plan instead of ruling a straight line across the face, and a
    # straight line across the face is what makes a cut read as a stack of boxes.
    n = (
        0.30 * math.sin(1.7 * x + 1.1)
        + 0.20 * math.sin(3.1 * x - 0.4) * math.cos(1.3 * z)
        + 0.13 * math.sin(4.9 * (x + 0.6 * z) + 2.2)
    )
    return max(0.0, base + n * rise * back)


# How much of each step is spent climbing the riser rather than standing on the
# bench. Zero gives a mathematically perfect terrace and a one-cell-wide riser
# that shades like melted wax; this gives the ~75-degree batter a real bench face
# has, over three or four grid cells, which is enough surface to catch the sun.
RAMP = 0.32


def benched(m: float) -> float:
    if m < BENCHES[0]:
        return m
    k = max(i for i, level in enumerate(BENCHES) if m >= level)
    lo = BENCHES[k]
    hi = BENCHES[k + 1] if k + 1 < len(BENCHES) else lo + 0.55
    t = clamp01(((m - lo) / (hi - lo) - (1.0 - RAMP)) / RAMP)
    return lo + (hi - lo) * t * t * (3.0 - 2.0 * t)


# Where the digging happened. Outside it the hill is natural ground; inside it
# the surface drops to the bench below and the terraces appear. Without this the
# mound is benched all the way round and reads as a wedding cake — a mine is a
# bite taken out of one side of a hill, and the crest line where the benches stop
# is the single thing that says so.
CUT_C = (-0.85, -0.55)
CUT_R = (1.5, 1.75)


def cut_mask(x: float, z: float) -> float:
    r = math.hypot((x - CUT_C[0]) / CUT_R[0], (z - CUT_C[1]) / CUT_R[1])
    # Wobbled, or the highwall where the benches stop is a flat rectangular panel
    # and the crest line above it is an arc drawn with a compass.
    r += 0.09 * math.sin(2.6 * x + 1.9) + 0.06 * math.cos(3.3 * z - 0.7)
    return clamp01((1.0 - r) / 0.2)


def height(x: float, z: float) -> float:
    """Ground level at (x, z): natural hillside, or benched where it was dug."""
    m = mound(x, z)
    c = cut_mask(x, z)
    if c <= 0.0:
        return m
    return (1.0 - c) * m + c * benched(max(0.0, m - 0.22))


def build_cut() -> bpy.types.Object:
    bm = bmesh.new()
    rows: list[list[bmesh.types.BMVert]] = []
    for i in range(GRID_X + 1):
        x = X0 + (X1 - X0) * i / GRID_X
        row = []
        for j in range(GRID_Z + 1):
            z = Z0 + (Z1 - Z0) * j / GRID_Z
            row.append(bm.verts.new(T(x, height(x, z), z)))
        rows.append(row)
    for i in range(GRID_X):
        for j in range(GRID_Z):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))

    # Skirt and floor. A closed solid, because the adit is cut with a boolean and
    # a boolean against an open sheet produces holes you find later, in the dark.
    floor = -0.05
    edge: list[list[bmesh.types.BMVert]] = []
    edge.append([rows[i][0] for i in range(GRID_X + 1)])
    edge.append([rows[GRID_X][j] for j in range(GRID_Z + 1)])
    edge.append([rows[i][GRID_Z] for i in range(GRID_X, -1, -1)])
    edge.append([rows[0][j] for j in range(GRID_Z, -1, -1)])
    ring = [v for side in edge for v in side[:-1]]
    below = [bm.verts.new(Vector((v.co.x, v.co.y, floor))) for v in ring]
    n = len(ring)
    for k in range(n):
        bm.faces.new((ring[k], below[k], below[(k + 1) % n], ring[(k + 1) % n]))
    bm.faces.new(tuple(reversed(below)))

    bm.normal_update()
    return mesh_object("rock_cut", bm)


# ------------------------------------------------------------------ the adit
# Cut for real, with a boolean, rather than painted on as a dark rectangle: the
# saucer hovers at 0.45 and the portal is 0.92 high, so a visitor will try to fly
# into it, and a fake mouth is a promise the world breaks on the first attempt.
#
# The tunnel walls the boolean leaves behind belong to the rock mesh and so pick
# up the strata shader — the seams read continuously from the outside face into
# the hole, which is the whole point of the metaphor. A separate `dark_` liner
# sits just inside them to hold the interior down: the scene has one directional
# light and no shadow maps, so an unlined hole is lit exactly as brightly as the
# hillside and stops reading as a hole at all.

ADIT_Z_MOUTH = 0.4  # in front of the toe: a cutter that starts inside the rock
                    # hollows out a cavity instead of opening a mouth
ADIT_Z_END = -2.15


def adit_face_z() -> float:
    """Where the hillside is tall enough to hold the portal — found by walking in
    from the front rather than written down, so the square sets stay in the face
    when the mound above is retuned."""
    z = ADIT_Z_MOUTH
    while z > ADIT_Z_END + 0.6:
        if height(ADIT_X, z) >= ADIT_H + 0.5:  # enough cover over the crown
            return z
        z -= 0.02
    raise AssertionError("no face tall enough for the adit — retune `mound`")


def arch_profile(half_w: float, height: float, z: float, shrink: float = 1.0) -> list[Vector]:
    """Arch section in three-space, at depth z. Square-set legs, chamfered crown —
    a hard-rock adit, timbered, not a brick railway tunnel."""
    w = half_w * shrink
    h = height * shrink
    return [
        T(ADIT_X - w, 0.0, z),
        T(ADIT_X - w, h * 0.66, z),
        T(ADIT_X - w * 0.62, h, z),
        T(ADIT_X + w * 0.62, h, z),
        T(ADIT_X + w, h * 0.66, z),
        T(ADIT_X + w, 0.0, z),
    ]


def build_tunnel(name: str, shrink: float, z_front: float, z_back: float, flip: bool):
    bm = bmesh.new()
    add_prism(
        bm,
        arch_profile(ADIT_W, ADIT_H, z_front, shrink) + arch_profile(ADIT_W, ADIT_H, z_back, shrink),
        flip=flip,
    )
    return bm


def corner(i: int, y: float) -> tuple[float, float, float]:
    """Corner i of the head-frame at height y. The frame tapers toward the sheave,
    so the taper is written once and every endpoint asks for it."""
    half = 0.85 + (0.32 - 0.85) * (y / FRAME_TOP)
    return (
        SHAFT[0] + (-half if i in (0, 3) else half),
        y,
        SHAFT[1] + (-half if i < 2 else half),
    )


def build_frame() -> bpy.types.Object:
    bm = bmesh.new()
    levels = [0.0, 0.85, 1.68, FRAME_TOP]

    for i in range(4):  # legs, in two lifts so the joint reads
        add_box(bm, strut(corner(i, 0.0), corner(i, 1.68), 0.115))
        add_box(bm, strut(corner(i, 1.65), corner(i, FRAME_TOP), 0.1))
    for li in range(1, len(levels)):
        y, prev = levels[li], levels[li - 1]
        for i in range(4):
            j = (i + 1) % 4
            add_box(bm, strut(corner(i, y), corner(j, y), 0.085))  # girt
            add_box(bm, strut(corner(i, prev), corner(j, y), 0.062))  # brace
            add_box(bm, strut(corner(j, prev), corner(i, y), 0.062))  # and its mirror
    # Back-legs. A head-frame leans against the pull of the hoist rope, and
    # leaving them off is the detail that makes a model of one look like scaffolding.
    for i, foot in ((2, (SHAFT[0] + 0.85, 0.0, SHAFT[1] + 1.28)), (3, (SHAFT[0] - 0.85, 0.0, SHAFT[1] + 1.28))):
        top = corner(i, FRAME_TOP - 0.18)
        add_box(bm, strut(top, foot, 0.125))
        mid = tuple((t + f) / 2 for t, f in zip(top, foot))
        add_box(bm, strut(mid, (mid[0], 0.0, mid[2]), 0.07))
    add_box(bm, strut((SHAFT[0] - 0.85, 0.5, SHAFT[1] + 1.28), (SHAFT[0] + 0.85, 0.5, SHAFT[1] + 1.28), 0.075))

    # Deck at the sheave, as planks: one slab reads as a lid.
    for k in range(5):
        x = SHAFT[0] + (k - 2) * 0.145
        add_box(bm, strut((x, FRAME_TOP + 0.05, SHAFT[1] - 0.36), (x, FRAME_TOP + 0.05, SHAFT[1] + 0.36), 0.13, 0.06))

    # Sheave: hub, rim, spokes. Axis along X so the rope drops down the shaft and
    # runs back over the top toward a hoist — which is what the back-legs resist.
    sheave_y = FRAME_TOP + 0.30
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=10, radius1=0.075, radius2=0.075, depth=0.5,
        matrix=Matrix.Translation(T(SHAFT[0], sheave_y, SHAFT[1])) @ Matrix.Rotation(math.pi / 2, 4, "Y"),
    )
    add_torus(bm, T(SHAFT[0], sheave_y, SHAFT[1]), 0.32, 0.05)
    for k in range(6):
        a = k * math.pi / 3
        add_box(
            bm,
            strut(
                (SHAFT[0], sheave_y, SHAFT[1]),
                (SHAFT[0], sheave_y + 0.30 * math.sin(a), SHAFT[1] + 0.30 * math.cos(a)),
                0.045,
            ),
        )
    # The rope, down the shaft. Its run back to a hoist house is not modelled and
    # not drawn: a rope ending in mid-air reads as a stray pole, not as a rope.
    add_box(bm, strut((SHAFT[0], sheave_y - 0.32, SHAFT[1]), (SHAFT[0], 0.1, SHAFT[1]), 0.035))

    # Shaft collar: four timbers around the hole, standing proud so the hole has
    # a lip rather than being a decal on the ground.
    for sx, sz in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        add_box(
            bm,
            strut(
                (SHAFT[0] + sx * 0.42 - sz * 0.5, 0.09, SHAFT[1] + sz * 0.42 - sx * 0.5),
                (SHAFT[0] + sx * 0.42 + sz * 0.5, 0.09, SHAFT[1] + sz * 0.42 + sx * 0.5),
                0.16, 0.18,
            ),
        )

    # Ladder-way on the pit-facing leg pair.
    for sx in (-1, 1):
        add_box(bm, strut((SHAFT[0] + sx * 0.18, 0.0, SHAFT[1] - 0.58), (SHAFT[0] + sx * 0.18, 1.75, SHAFT[1] - 0.26), 0.05))
    for k in range(7):
        t = (k + 0.5) / 7
        add_box(
            bm,
            strut(
                (SHAFT[0] - 0.18, 1.75 * t, SHAFT[1] - 0.58 + 0.32 * t),
                (SHAFT[0] + 0.18, 1.75 * t, SHAFT[1] - 0.58 + 0.32 * t),
                0.038,
            ),
        )

    # Square sets in the adit: the timbering that holds a hard-rock heading open.
    # Four of them, receding, so the tunnel has depth from outside without the
    # visitor having to fly in and find out.
    # Spaced across the tunnel that actually exists, not at a fixed pitch: the
    # face moves whenever `mound` is retuned, and sets pitched past the heading
    # end up standing in solid rock and poking out the back of the hill.
    face_z = adit_face_z()
    sets = 4
    pitch = (face_z - 0.06 - ADIT_Z_END) / sets
    for k in range(sets):
        z = face_z - 0.06 - k * pitch
        w = ADIT_W * (0.985 if k else 1.06)
        h = ADIT_H * (0.985 if k else 1.06)
        add_box(bm, strut((ADIT_X - w, 0.0, z), (ADIT_X - w, h * 0.7, z), 0.1))
        add_box(bm, strut((ADIT_X + w, 0.0, z), (ADIT_X + w, h * 0.7, z), 0.1))
        add_box(bm, strut((ADIT_X - w - 0.06, h * 0.7, z), (ADIT_X + w + 0.06, h * 0.7, z), 0.11))
        add_box(bm, strut((ADIT_X - w * 0.66, h, z), (ADIT_X + w * 0.66, h, z), 0.09))
        add_box(bm, strut((ADIT_X - w, h * 0.7, z), (ADIT_X - w * 0.66, h, z), 0.085))
        add_box(bm, strut((ADIT_X + w, h * 0.7, z), (ADIT_X + w * 0.66, h, z), 0.085))

    bm.normal_update()
    return mesh_object("frame_works", bm)


# ------------------------------------------------------------------- the spoil
# What came out of the hole, which is the point of digging it. Two heaps and a
# scatter of loose stone, all jittered off a low-poly sphere so no two read alike.


def build_spoil() -> bpy.types.Object:
    bm = bmesh.new()
    # Spoil, not boulders: wide and low, tipped where the tramming stopped.
    lump(bm, (-1.62, 0.22, 1.66), (0.72, 0.28, 0.68), 0.0, subdiv=1)
    lump(bm, (-1.95, 0.14, 1.02), (0.44, 0.20, 0.42), 3.1, subdiv=1)
    for x, y, z, s, seed in (
        (1.62, 0.11, 1.88, 0.20, 1.4),
        (-0.62, 0.09, 2.06, 0.15, 5.2),
        (1.05, 0.10, -0.15, 0.17, 2.7),
        (-2.10, 0.08, 0.30, 0.13, 4.4),
        (0.72, 0.12, 1.42, 0.18, 6.1),
        (-0.28, 0.07, 0.62, 0.12, 0.8),
    ):
        lump(bm, (x, y, z), (s, s * 0.92, s * 0.95), seed, subdiv=1)
    bm.normal_update()
    return mesh_object("rock_spoil", bm)


# ---------------------------------------------------------------- the dark bits


def build_dark():
    """Adit liner and shaft. The scene has one directional light and no shadow
    maps, so a hole lit as brightly as the hillside stops reading as a hole. The
    liner sits just inside the boolean's walls, faces turned inward."""
    bm = build_tunnel("dark_holes", 0.985, adit_face_z() + 0.06, ADIT_Z_END + 0.04, flip=True)
    add_box(bm, Matrix.LocRotScale(
        T(SHAFT[0], 0.04, SHAFT[1]), Quaternion(), Vector((0.74, 0.74, 0.2))))
    return mesh_object("dark_holes", bm)


# --------------------------------------------------------------------- plumbing


def main() -> None:
    start()

    rock = build_cut()
    boolean(rock, mesh_object("rock_cutter", build_tunnel("rock_cutter", 1.0, ADIT_Z_MOUTH, ADIT_Z_END, False)))
    rock = join("rock_cut", [rock, build_spoil()])
    frame = build_frame()
    dark = build_dark()

    finish(rock, 32)
    finish(frame, 40, bevel=0.014)
    finish(dark, 60)

    print(f"[mine] crest {max(height(x / 20 - 2.4, z / 20 - 2.4) for x in range(97) for z in range(56)):.2f}"
          f"  ·  adit face at z {adit_face_z():.2f}")
    export("mine", BOX, GLB, BLEND)

    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS)


if __name__ == "__main__":
    main()
