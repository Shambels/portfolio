"""
The hologram — the Sudoku Solver's landmark. The fifth project, and the second
grid in this world, which was the whole difficulty with it.

    python3 tools/sudoku.py                    # tools/sudoku.blend + src/models/sudoku.glb
    python3 tools/sudoku.py --render out.png   # ...and three preview views

The first pass was a *tray*: a lattice standing off the plinth with eighty-one
wells sunk into it and the fifty unplaced tiles stacked beside it, the depth of
every open well computed from the repository's own puzzle. It was one square
board of blank tiles on a plinth standing across the water from another, and
the relief that was meant to separate them could only be read from the deck.
So the tray went, and what stands on the plinth now is a projector: a puck at
the centre of the deck, a fan of light from it, and a square panel standing
0.3 m off the plinth with nothing on it — `holo_panel`, one quad, which
`Landmarks.tsx` fills with the puzzle itself. Digits falling as rain until the
visitor is near, then settling cell by cell in the solver's own scan order
into the board hard-coded in that repository's `main()`: the thirty-one clues
steady and large, the fifty open cells cycling through the candidates they
have left. The puzzle and its candidates live in `src/sudoku.ts` now, where the
shader reads them; nothing here needs to know what the board is.

That is a change to a committed look, and `docs/STATUS.md` says so. It is also
the one landmark that is mostly not geometry: the panel is a quad, and what
makes it a sudoku is the shader. The model's job is to stand it in the right
place at the right size and to give the eye a source for the light.

Digits ARE drawn on the panel, which is the line invariant 2 draws: they are
the repository's input, a picture of the puzzle, and not a word of the case
study. Nothing a screen reader needs is on it.

No UVs are exported, as for every landmark. The panel is a quad of known
size standing square in the landmark's own frame, so the shader reads its
`u, v` off `positionLocal` against the constants below — which are mirrored
in `Landmarks.tsx` as `HOLO`. Change one and change the other.

The quad's winding matters: its normal points +Z, toward the approach from
the world's centre, and the shader flips `u` on the back face so the digits
read the right way round from the waypoint on the far side too.

Nothing on this island is loose any more. The fifty tiles went with the tray,
so the deck rides clean and the board goes straight through the light —
`plateau.check.ts` asserts there is nothing on it to hit.

Shared plumbing, the coordinate convention and the export are in `landmark.py`.
"""

from __future__ import annotations

import sys

import bpy
from landmark import T, add_cyl, add_slab, export, finish, join, mesh_object, preview, start
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------- the contract
# src/content/projects/sudoku.en.mdx, frontmatter `size`.
BOX = (5.4, 4.2, 5.4)

GLB = "src/models/sudoku.glb"
BLEND = "tools/sudoku.blend"

# Further out than the tray's were: the panel is four metres tall, and what a
# preview of it can show is only where it stands — the light is the browser's.
VIEWS = {
    "approach": ((0.5, 6.0, 14.0), (0.0, 2.0, 0.0)),
    "quarter": ((9.0, 5.5, 9.0), (0.0, 2.0, 0.0)),
    "front": ((0.0, 2.3, 12.0), (0.0, 2.3, 0.0)),
}

PLINTH = 4.90
TOP = 0.21  # the plinth's top — the deck, and `DECKS.sudoku.h` in plateau.ts

# `HOLO` in `Landmarks.tsx` — the panel and the emitter, in the landmark's own
# frame. The shader derives the panel's `u, v` from these; change one and
# change the other.
PANEL = 3.6  # the panel's side: nine cells of 0.4, the tray's own pitch
PANEL_Z = -0.6  # the panel's plane, a little behind the deck's centre
PANEL_FOOT = TOP + 0.3  # the bottom edge, 0.3 off the plinth: the tray's old rail
EMIT_R = 0.42  # the puck
EMIT_H = 0.06
EMIT_Z = 1.1  # in front of the panel, on the approach side
EYE_R = 0.24  # the lit disc on top of it
CONE_W = 0.36  # the fan's width where it leaves the puck


def build_plinth() -> bpy.types.Object:
    bm = bmesh.new()
    # Two lifts, as Scrubble's is: a plinth with a step reads as something the
    # projector stands on rather than as a thick board.
    add_slab(bm, (0.0, 0.05, 0.0), (PLINTH, 0.10, PLINTH))
    add_slab(bm, (0.0, 0.145, 0.0), (PLINTH - 0.26, 0.09, PLINTH - 0.26))
    return mesh_object("frame_plinth", bm)


def build_emitter() -> bpy.types.Object:
    """The puck: the one thing on the deck, and where the light comes from."""
    bm = bmesh.new()
    add_cyl(bm, (0.0, TOP, EMIT_Z), (0.0, TOP + EMIT_H, EMIT_Z), EMIT_R, 36)
    return mesh_object("frame_emitter", bm)


def build_eye() -> bpy.types.Object:
    """The lit disc on the puck. `holo_eye` in `Landmarks.tsx`: steady green,
    bloomed like the panel — a source, so the panel has somewhere to come from."""
    bm = bmesh.new()
    add_cyl(bm, (0.0, TOP + EMIT_H, EMIT_Z), (0.0, TOP + EMIT_H + 0.012, EMIT_Z), EYE_R, 28)
    return mesh_object("holo_eye", bm)


def _quad(bm: bmesh.types.BMesh, corners, facing) -> None:
    """One face through four three-space points, wound so its normal has a
    positive component along `facing` (three-space)."""
    face = bm.faces.new([bm.verts.new(T(*c)) for c in corners])
    bm.normal_update()
    if face.normal.dot(Vector(T(*facing))) < 0:
        bmesh.ops.reverse_faces(bm, faces=[face])


def build_panel() -> bpy.types.Object:
    """The panel: one quad, `PANEL` square, standing on `PANEL_FOOT` in the
    plane `z = PANEL_Z`, its front toward +Z."""
    bm = bmesh.new()
    h = PANEL / 2
    _quad(
        bm,
        [(-h, PANEL_FOOT, PANEL_Z), (h, PANEL_FOOT, PANEL_Z),
         (h, PANEL_FOOT + PANEL, PANEL_Z), (-h, PANEL_FOOT + PANEL, PANEL_Z)],
        (0.0, 0.0, 1.0),
    )
    return mesh_object("holo_panel", bm)


def build_cone() -> bpy.types.Object:
    """The fan of light: a trapezoid from the top of the puck to the panel's
    foot, wound to face up. `Landmarks.tsx` fades it along its length."""
    bm = bmesh.new()
    y0 = TOP + EMIT_H
    _quad(
        bm,
        [(-CONE_W / 2, y0, EMIT_Z), (CONE_W / 2, y0, EMIT_Z),
         (PANEL / 2, PANEL_FOOT, PANEL_Z), (-PANEL / 2, PANEL_FOOT, PANEL_Z)],
        (0.0, 1.0, 0.0),
    )
    return mesh_object("holo_cone", bm)


def main() -> None:
    assert PANEL_FOOT + PANEL <= BOX[1], "the panel stands out of the frontmatter box"
    assert EMIT_Z + EMIT_R < PLINTH / 2 and -PANEL_Z < PLINTH / 2, "off the plinth"
    print(f"[sudoku] panel {PANEL} square, foot {PANEL_FOOT}, plane z {PANEL_Z}  ·  "
          f"emitter r {EMIT_R} at z {EMIT_Z}")

    start()

    plinth = join("frame_plinth", [build_plinth()])
    emitter = join("frame_emitter", [build_emitter()])
    eye = join("holo_eye", [build_eye()])
    panel = join("holo_panel", [build_panel()])
    cone = join("holo_cone", [build_cone()])

    finish(plinth, 30, bevel=0.008)
    finish(emitter, 30, bevel=0.006)
    finish(eye, 30)
    finish(panel, 30)
    finish(cone, 30)

    export("sudoku", BOX, GLB, BLEND)

    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS, ortho_scale=7.5, ground=14.0)


if __name__ == "__main__":
    main()
