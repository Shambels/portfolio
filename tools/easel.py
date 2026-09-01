"""
The easel — Arts by Sandra's landmark. Phase 4, second of the three.

    python3 tools/easel.py                    # tools/easel.blend + src/models/easel.glb
    python3 tools/easel.py --render out.png   # ...and three preview views

Not one easel. Sandra teaches, sells her own work, and rents the studio — three
businesses and, the case study's line, "three different conversations, funnelled
into one form she can actually answer". So the landmark is a working corner and
not an object: a canvas on the easel, a stretched one waiting on the table, and
a small finished one leaning against it. Three canvases, one place.

That is why the frontmatter box grew from 2 x 3 x 2 to 3 x 2.7 x 1.6. A single
easel at two metres, alone on an island of nearly eight, reads as an ornament
dropped on a lawn — where the mine fills its box, this filled a fifth of it.
Everything past the easel is `build_table` and `build_props`; deleting those two
calls in `main` and putting `size` back is the whole way to undo it.

The canvas on the easel is deliberately BLANK. What resolves on it as the
visitor approaches is a TSL shader and the next item in Phase 4, and anything
legible painted here runs straight into invariant 2 — prose lives in the DOM.

Shared plumbing, the coordinate convention and the export are in `landmark.py`.
"""

from __future__ import annotations

import sys

import bpy
from landmark import (
    add_box, add_cyl, add_slab, export, finish, join, mesh_object, preview, start, strut,
)
import bmesh
from mathutils import Matrix, Vector

# ---------------------------------------------------------------- the contract
# src/content/projects/arts-by-sandra.en.mdx, frontmatter `size`. `Landmarks.tsx`
# asserts the same box again in the browser, from the geometry it actually built.
BOX = (3.0, 2.7, 1.6)

GLB = "src/models/easel.glb"
BLEND = "tools/easel.blend"

VIEWS = {
    "approach": ((0.5, 3.3, 7.8), (0.0, 1.2, 0.0)),
    "quarter": ((5.4, 2.7, 5.2), (0.1, 1.05, -0.1)),
    "front": ((0.0, 1.32, 8.0), (0.0, 1.3, 0.0)),
}

# ---------------------------------------------------------------------- easel
# A studio A-frame: two front legs and a back leg, with a mast board on the front
# pair carrying the tray and the top clamp. Written as feet and an apex rather
# than as angles, so moving a foot splays the whole thing and the braces follow.

X = -0.55  # the easel's centre line; the table sits to its right
APEX_Y = 2.55
FEET = {
    "left": ((-1.03, 0.0, 0.44), (X - 0.07, APEX_Y, 0.18)),
    "right": ((-0.07, 0.0, 0.44), (X + 0.07, APEX_Y, 0.18)),
    "back": ((X, 0.0, -0.66), (X, APEX_Y - 0.13, 0.12)),
}
TRAY_Y = 1.06
CLAMP_Y = 2.28


def on_leg(name: str, y: float) -> tuple[float, float, float]:
    """The point on a leg at height y — how a brace finds a leg that is splayed
    in two directions at once."""
    (fx, _, fz), (ax, ay, az) = FEET[name]
    t = y / ay
    return (fx + (ax - fx) * t, y, fz + (az - fz) * t)


def build_easel() -> bpy.types.Object:
    bm = bmesh.new()

    for name in FEET:
        a, b = FEET[name]
        add_box(bm, strut(a, b, 0.085))
    # Braces across the front pair. Two of them: one is a stick, two is a frame.
    for y in (0.60, 1.72):
        add_box(bm, strut(on_leg("left", y), on_leg("right", y), 0.055, 0.05))

    # The mast, on the front face of the legs, raked with them. This is what the
    # tray and the clamp are bolted to, and what a canvas actually leans on.
    add_box(bm, strut((X, 0.30, 0.47), (X, 2.45, 0.20), 0.17, 0.055))

    # Tray: a board, a front lip so nothing rolls off, and two brackets back to
    # the mast. The lip is the detail that says this is used and not a display.
    add_slab(bm, (X - 0.02, TRAY_Y, 0.42), (1.36, 0.055, 0.22))
    add_slab(bm, (X - 0.02, TRAY_Y + 0.035, 0.515), (1.36, 0.062, 0.045))
    for bx in (X - 0.42, X + 0.38):
        add_box(bm, strut((bx, TRAY_Y - 0.04, 0.50), (bx, TRAY_Y - 0.30, 0.27), 0.05))

    # Top clamp: the arm that holds the canvas against the mast, and the screw
    # that lets it slide — which is why an easel takes any size of canvas. Its
    # wing nut was modelled and cut: at this scale two 4cm wings on top of the
    # mast read as antlers, not as a fastening.
    add_slab(bm, (X, CLAMP_Y, 0.33), (0.32, 0.07, 0.20))
    add_slab(bm, (X, CLAMP_Y - 0.07, 0.40), (0.32, 0.11, 0.05))
    add_cyl(bm, (X, CLAMP_Y, 0.22), (X, CLAMP_Y, 0.10), 0.026, 8)

    return mesh_object("frame_easel", bm)


# ---------------------------------------------------------------------- table
# A work table, not a plinth: it carries the second canvas and the palette, and
# the third canvas leans on its front. Kept low so a canvas can lean on it at a
# believable angle — lean a tall thing against a low thing and it lies down.

TABLE = (0.92, -0.35)  # x, z
TABLE_TOP = 0.62
TABLE_SIZE = (0.90, 0.64)  # x, z


def build_table() -> bpy.types.Object:
    bm = bmesh.new()
    w, d = TABLE_SIZE
    add_slab(bm, (TABLE[0], TABLE_TOP - 0.02, TABLE[1]), (w, 0.045, d))
    for sx in (-1, 1):
        for sz in (-1, 1):
            x = TABLE[0] + sx * (w / 2 - 0.08)
            z = TABLE[1] + sz * (d / 2 - 0.08)
            add_box(bm, strut((x, 0.0, z), (x, TABLE_TOP - 0.04, z), 0.065))
    # One rail near the floor, on the two long sides. Without it the legs read as
    # four sticks that happen to be under a board.
    for sz in (-1, 1):
        z = TABLE[1] + sz * (d / 2 - 0.08)
        add_slab(bm, (TABLE[0], 0.17, z), (w - 0.16, 0.055, 0.04))
    return mesh_object("frame_table", bm)


# --------------------------------------------------------------------- canvas
# A canvas is a face plus the four stretcher bars behind it, and the bars are the
# whole point of modelling one rather than drawing a rectangle: from the side and
# from behind you see the frame, which is what makes a stack of them read as
# canvases and not as tiles.


def canvas(centre, w: float, h: float, rx: float = 0.0, ry: float = 0.0, rz: float = 0.0):
    """Returns (face bmesh, stretcher bmesh) — two materials, so they are built
    apart and joined into their own objects."""
    face, bars = bmesh.new(), bmesh.new()
    rot = Matrix.Rotation(ry, 3, "Y") @ Matrix.Rotation(rz, 3, "Z") @ Matrix.Rotation(rx, 3, "X")

    def at(o):
        v = rot @ Vector(o)
        return (centre[0] + v.x, centre[1] + v.y, centre[2] + v.z)

    add_slab(face, at((0.0, 0.0, 0.035)), (w, h, 0.014), rx, ry, rz)
    bar = 0.085
    for sy in (-1, 1):
        add_slab(bars, at((0.0, sy * (h / 2 - bar / 2), 0.0)), (w, bar, 0.05), rx, ry, rz)
    for sx in (-1, 1):
        add_slab(bars, at((sx * (w / 2 - bar / 2), 0.0, 0.0)), (bar, h - 2 * bar, 0.05), rx, ry, rz)
    return face, bars


# The work in progress, sitting on the tray and leaning back on the mast, as a
# canvas does under its own weight.
ON_EASEL = ((X, 1.69, 0.40), 1.00, 1.20, -0.11, 0.0)
# Stretched and waiting, flat on the table.
ON_TABLE = ((TABLE[0] - 0.15, TABLE_TOP + 0.03, TABLE[1] - 0.07), 0.56, 0.40, -1.5708, 0.12)
# Finished, standing on the ground and leaning sideways on the table's end —
# which is where a canvas goes when there is no wall. Tipped rather than tilted
# so it is seen edge-on: a canvas square to the visitor is a rectangle, and a
# canvas at an angle is a canvas, because you can see it has a back.
LEANING = ((TABLE[0] + 0.50, 0.35, TABLE[1] + 0.05), 0.52, 0.70, 0.0, 0.78, 0.24)


def build_canvases() -> tuple[bpy.types.Object, bpy.types.Object]:
    faces, bars = bmesh.new(), bmesh.new()
    for c, w, h, rx, ry, *rz in (ON_EASEL, ON_TABLE, LEANING):
        f, b = canvas(c, w, h, rx, ry, rz[0] if rz else 0.0)
        faces.from_mesh(_to_mesh(f, "f"))
        bars.from_mesh(_to_mesh(b, "b"))
    return mesh_object("panel_canvases", faces), mesh_object("frame_stretchers", bars)


def _to_mesh(bm: bmesh.types.BMesh, name: str):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


# ---------------------------------------------------------------------- props
# The things that say someone works here rather than that someone arranged this:
# brushes lying in the tray where they were put down, a tube of paint, a palette
# on the table, a jar with the brushes that are drying.


def build_props() -> tuple[bpy.types.Object, bpy.types.Object]:
    frame, dark = bmesh.new(), bmesh.new()

    # In the tray.
    add_cyl(frame, (X - 0.52, TRAY_Y + 0.05, 0.44), (X - 0.19, TRAY_Y + 0.05, 0.41), 0.012, 6)
    add_cyl(frame, (X - 0.44, TRAY_Y + 0.05, 0.38), (X - 0.10, TRAY_Y + 0.05, 0.40), 0.012, 6)
    add_cyl(frame, (X + 0.20, TRAY_Y + 0.06, 0.43), (X + 0.40, TRAY_Y + 0.06, 0.44), 0.028, 8)

    # Jar of brushes on the table, and the brushes fanning out of it.
    jar = (TABLE[0] + 0.29, TABLE[1] - 0.15)
    add_cyl(dark, (jar[0], TABLE_TOP, jar[1]), (jar[0], TABLE_TOP + 0.19, jar[1]), 0.058, 12)
    for dx, dz in ((0.05, 0.02), (-0.03, 0.05), (0.01, -0.05)):
        add_cyl(
            frame,
            (jar[0], TABLE_TOP + 0.13, jar[1]),
            (jar[0] + dx * 2.4, TABLE_TOP + 0.42, jar[1] + dz * 2.4),
            0.011, 6,
        )
    return mesh_object("frame_props", frame), mesh_object("dark_props", dark)


def build_palette() -> bpy.types.Object:
    """Lying in the tray, where a palette is put down. The one thing here that
    wants to be a different colour, so it gets the board material rather than the
    timber one."""
    bm = bmesh.new()
    add_slab(bm, (X + 0.46, TRAY_Y + 0.05, 0.42), (0.30, 0.022, 0.18), 0.0, 0.35)
    return mesh_object("board_palette", bm)


# --------------------------------------------------------------------- the set


def main() -> None:
    start()

    faces, stretchers = build_canvases()
    props_frame, props_dark = build_props()
    frame = join("frame_easel", [build_easel(), build_table(), stretchers, props_frame])
    panel = join("panel_canvases", [faces])
    board = join("board_palette", [build_palette()])
    dark = join("dark_props", [props_dark])

    finish(frame, 40, bevel=0.01)
    finish(panel, 50)
    finish(board, 50, bevel=0.006)
    finish(dark, 45)

    export("easel", BOX, GLB, BLEND)

    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS, ortho_scale=4.2, ground=10.0)


if __name__ == "__main__":
    main()
