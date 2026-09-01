"""
The board — Scrubble's landmark. Phase 4, last of the three.

    python3 tools/board.py                    # tools/board.blend + src/models/board.glb
    python3 tools/board.py --render out.png   # ...and three preview views

The problem this landmark had, which the mine and the easel did not: a board is
flat. Its frontmatter box was 6 x 0.4 x 6 and the saucer hovers at 0.45, so the
visitor flew over a rug. The mine is three and a half metres of silhouette and
the easel two and a half; this was four hundred millimetres.

So the box grew to 6 x 1 x 6, and what fills it is the case study's own first
line: "the move you played is not the move that was there". Seven tiles hang
above the empty squares they would have gone in — the bingo nobody at the table
saw, hooked onto the played column, reaching the edge of the board. That is what
Scrubble does, it is the one thing that gives this landmark a shape against the
sky, and it is the geometry the next Phase 4 item animates when the tiles settle.

Tiles are BLANK. Letters are text and text belongs in the DOM (invariant 2). The
crossword reads from the shape of the cluster, not from what is written on it,
and the grid and the premium squares are already in the TSL shader — which reads
`positionLocal.xz`, so the plate has to stay centred on the group's origin.

Shared plumbing, the coordinate convention and the export are in `landmark.py`.
"""

from __future__ import annotations

import sys

import bpy
from landmark import add_slab, export, finish, join, mesh_object, preview, start
import bmesh

# ---------------------------------------------------------------- the contract
# src/content/projects/scrubble.en.mdx, frontmatter `size`.
BOX = (6.0, 1.0, 6.0)

GLB = "src/models/board.glb"
BLEND = "tools/board.blend"

VIEWS = {
    "approach": ((0.4, 4.4, 9.8), (0.0, 0.45, 0.2)),
    "quarter": ((6.8, 3.6, 6.6), (0.0, 0.4, 0.0)),
    "front": ((0.0, 0.95, 10.0), (0.0, 0.62, 0.0)),
}

# `CELL` is shared with the shader in Landmarks.tsx, which draws the 15x15 grid
# and the premium squares from it. Change one and change the other.
CELL = 0.36
PLATE = CELL * 15  # 5.4
PLINTH = 5.94

TOP = 0.21  # the playing surface — everything on the board sits on this
TILE = 0.335  # a shade under CELL, so the cluster reads as tiles and not a slab
TILE_H = 0.085


def at(i: int, j: int) -> tuple[float, float]:
    """Board square (i, j), 0..14, in three-space x and z."""
    return ((i - 7) * CELL, (j - 7) * CELL)


# --------------------------------------------------------------------- the set
# Played: a word across the star with one crossing it. Found: the seven-tile move
# that was available on the same position, hooking under the played column at
# (8, 8) and running out toward the edge — and emptying the rack is the fifty.
# It sits over open board rather than over the far rim, because from the air a
# floating row against the rim just looks like it is resting on it.

PLAYED = [(i, 7) for i in range(3, 11)] + [(8, 5), (8, 6), (8, 8)]
FOUND = [(i, 9) for i in range(8, 15)]
FOUND_Y = 0.78

RACK_Z = 2.30
RACK_TILT = -0.34


def build_plinth() -> bpy.types.Object:
    bm = bmesh.new()
    # Two lifts rather than one block: a plinth with a step reads as something
    # the board sits on, where a single slab reads as the board being thick.
    add_slab(bm, (0.0, 0.05, 0.0), (PLINTH, 0.10, PLINTH))
    add_slab(bm, (0.0, 0.145, 0.0), (PLINTH - 0.26, 0.09, PLINTH - 0.26))

    # Rim on all four sides, standing proud of the playing surface, so the board
    # is a board and not a decal on a box.
    for s in (-1, 1):
        add_slab(bm, (0.0, TOP - 0.02, s * (PLATE + 0.28) / 2), (PLINTH - 0.26, 0.14, 0.28))
        add_slab(bm, (s * (PLATE + 0.28) / 2, TOP - 0.02, 0.0), (0.28, 0.14, PLATE))

    # The rack. On the board rather than in front of it: the plinth border is a
    # hand's width and there is nowhere else for it to go inside the box.
    add_slab(bm, (0.0, TOP + 0.03, RACK_Z), (2.62, 0.06, 0.34))
    add_slab(bm, (0.0, TOP + 0.11, RACK_Z + 0.15), (2.62, 0.20, 0.05), RACK_TILT)
    return mesh_object("frame_board", bm)


def build_plate() -> bpy.types.Object:
    """The playing surface, and nothing else. Centred on the group origin because
    the grid shader measures cells from there."""
    bm = bmesh.new()
    add_slab(bm, (0.0, TOP - 0.025, 0.0), (PLATE, 0.05, PLATE))
    return mesh_object("board_grid", bm)


def build_tiles() -> bpy.types.Object:
    bm = bmesh.new()
    for i, j in PLAYED:
        x, z = at(i, j)
        add_slab(bm, (x, TOP + TILE_H / 2, z), (TILE, TILE_H, TILE))
    # In the rack, standing and leaning back on its lip — face toward the
    # visitor, which is the side the group is turned to.
    for k in range(7):
        add_slab(
            bm, ((k - 3) * CELL, TOP + 0.20, RACK_Z + 0.05), (TILE, 0.32, TILE_H), RACK_TILT,
        )
    return mesh_object("panel_tiles", bm)


def build_found() -> bpy.types.Object:
    """The move that was there. A separate mesh, not merged into the played
    tiles, so a shader can single it out without a second model."""
    bm = bmesh.new()
    # Stepped and tipped rather than a level row: the scene has no shadow maps,
    # so height alone does not say "in the air" — a rank of tiles at one height
    # reads as a plank. A cascade reads as tiles on their way down, which is also
    # the pose the Phase 4 animation lands from.
    for k, (i, j) in enumerate(FOUND):
        x, z = at(i, j)
        add_slab(bm, (x, FOUND_Y + (k - 3) * 0.045, z), (TILE, TILE_H, TILE), -0.05 - k * 0.02)
    return mesh_object("panel_found", bm)


def main() -> None:
    start()

    frame = join("frame_board", [build_plinth()])
    board = join("board_grid", [build_plate()])
    tiles = join("panel_tiles", [build_tiles()])
    found = join("panel_found", [build_found()])

    finish(frame, 30, bevel=0.008)
    finish(board, 60)
    finish(tiles, 50, bevel=0.008)
    finish(found, 50, bevel=0.008)

    export("board", BOX, GLB, BLEND)

    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS, ortho_scale=7.0, ground=16.0)


if __name__ == "__main__":
    main()
