"""
The board — the Sudoku Solver's landmark. The fifth project, and the second
grid in this world, which is the whole difficulty with it.

    python3 tools/sudoku.py                    # tools/sudoku.blend + src/models/sudoku.glb
    python3 tools/sudoku.py --render out.png   # ...and three preview views

Scrubble's landmark is already a square board of blank tiles on a plinth. A
second one built the same way would be one landmark seen twice. So the two are
separated by the thing a sudoku has and a crossword does not: **structure in the
holes**. Where Scrubble is a flat plate with its grid painted on by a shader and
tiles standing on top of it, this is a *tray* — a lattice standing 30 cm proud of
the plinth with eighty-one wells sunk into it, the thirty-one clues seated in
theirs and standing 4 cm out, the fifty open cells left as pits. Scrubble reads
as things on a surface; this reads as holes in one.

Tiles are BLANK, for the reason Scrubble's are: digits are text and text belongs
in the DOM (invariant 2). What makes it a sudoku rather than a nine-by-nine
anything is the line weight — a three-by-three divider is `BOX_RIB` wide against
a cell line's `RIB`, near enough three times, and it stands `BOX_PROUD` taller as
well. Wider alone was not enough: from the air the two weights read, but from the
deck, where the rider is, every line is the same edge until one of them stands up.

**The puzzle is not invented.** It is the board hard-coded into `main()` in the
repository's own `sudoku.py`, eighty-one assignments long: thirty-one clues,
fifty empty cells, one solution. `CLUES` and `DIGITS` below are that board, and
`main()` here asserts they are the same board before it builds anything.

And one thing is derived rather than drawn: **an empty cell's well is as deep as
the cell is open.** `candidates()` counts what could legally still go in each
empty cell of the starting position — two at the tightest, six at the loosest —
and that count is the well's depth, `WELL_MIN` to `WELL_MAX`. The relief across
the tray is the puzzle's own constraint, which is to say it is the first thing
the solver in the repository would have computed. `Landmarks.tsx` shades the well
floors by that depth and by nothing else: a nearly-decided cell is light, a
wide-open one is a pit.

The clue tiles are seated in their wells and are NOT loose props — a tile in a
recess is held by the recess, which is the honest reason and also why this
landmark has thirteen props rather than forty-four. What is loose is what has not
been placed yet: six stacks and seven tiles lying on the plinth's border, fifty
in all, one for every empty cell. A stack is one mesh and therefore one rigid
thing to the physics (`src/plateau.ts`) — the board sends the whole column
skidding rather than scattering it, which is the decision this world already made
about a table that will not topple.

Shared plumbing, the coordinate convention and the export are in `landmark.py`.
"""

from __future__ import annotations

import math
import sys

import bpy
from landmark import add_slab, export, finish, join, mesh_object, preview, start
import bmesh

# ---------------------------------------------------------------- the contract
# src/content/projects/sudoku.en.mdx, frontmatter `size`.
BOX = (5.4, 1.8, 5.4)

GLB = "src/models/sudoku.glb"
BLEND = "tools/sudoku.blend"

VIEWS = {
    "approach": ((0.3, 4.2, 9.2), (0.0, 0.5, 0.0)),
    "quarter": ((5.6, 3.2, 5.6), (0.0, 0.45, 0.0)),
    "front": ((0.0, 0.95, 10.0), (0.0, 0.7, 0.0)),
}

# `CELL`, `RAIL`, `WELL_MIN` and `WELL_MAX` are shared with `Landmarks.tsx`,
# which shades the wells by their depth and builds its blockout on the same
# grid. Change one and change the other.
CELL = 0.40
PLATE = CELL * 9  # 3.60
RIM_W = 0.16
PLINTH = 4.90

TOP = 0.21  # the plinth's top — the deck, and `DECKS.sudoku.h` in plateau.ts
RAIL = 0.51  # the top of a cell line: the tray's own surface
SUB = 0.25  # the tray's solid floor, under every well
BOX_PROUD = 0.03  # how much further a three-by-three divider stands

WELL_MIN = 0.12  # a cell with two candidates left
WELL_MAX = 0.24  # a cell with six

TILE = 0.34
TILE_H = 0.15
SEAT = RAIL - 0.11  # a clue tile's well floor: it stands 4 cm proud of the lines

RIB = 0.035  # a cell line
BOX_RIB = 0.10  # a three-by-three divider

# --------------------------------------------------------------- the puzzle
# `main()` in the repository's own sudoku.py, read straight across. A '#' is a
# clue and a '.' is an empty cell.
CLUES = [
    "..######.",
    "#...##...",
    "#...##...",
    "..#.#....",
    ".#.#..###",
    "#..#....#",
    "..#..##.#",
    "#......#.",
    "...#..##.",
]

# The digits themselves, wanted for one thing only: counting what could still go
# in each empty cell, which is what the well depths are. Never drawn — nothing in
# this file writes a numeral, and `CLUES` is what the geometry reads.
DIGITS = [
    [0, 0, 8, 7, 3, 4, 1, 6, 0],
    [1, 0, 0, 0, 8, 5, 0, 0, 0],
    [7, 0, 0, 0, 1, 9, 0, 0, 0],
    [0, 0, 3, 0, 9, 0, 0, 0, 0],
    [0, 2, 0, 5, 0, 0, 9, 1, 3],
    [9, 0, 0, 3, 0, 0, 0, 0, 7],
    [0, 0, 6, 0, 0, 3, 8, 0, 1],
    [3, 0, 0, 0, 0, 0, 0, 2, 0],
    [0, 0, 0, 9, 0, 0, 3, 4, 0],
]


def candidates(i: int, j: int) -> int:
    """How many digits could legally still go in the empty cell (i, j) — the
    repository's own `possibleEntries`, counted instead of returned."""
    seen = set(DIGITS[i])
    seen |= {DIGITS[y][j] for y in range(9)}
    k, l = 3 * (i // 3), 3 * (j // 3)
    seen |= {DIGITS[x][y] for x in range(k, k + 3) for y in range(l, l + 3)}
    return sum(1 for n in range(1, 10) if n not in seen)


def at(i: int, j: int) -> tuple[float, float]:
    """Cell (i, j), 0..8, in three-space x and z. The row index runs along z, so
    the board reads the right way up from the visitor's approach at +Z."""
    return ((j - 4) * CELL, (i - 4) * CELL)


def depth(i: int, j: int) -> float:
    """An empty cell's well depth: `WELL_MIN` at two candidates, `WELL_MAX` at
    six, a straight line between."""
    return WELL_MIN + (WELL_MAX - WELL_MIN) * (candidates(i, j) - 2) / 4


# ---------------------------------------------------------------- the fifty
# One tile for every empty cell, none of them on the tray. `BORDER` is the middle
# of the plinth's shelf — the tray reaches 1.96 and the plinth 2.45, so there is
# 49 cm of it and a tile is 34.
BORDER = (PLATE / 2 + RIM_W + PLINTH / 2) / 2

# (x, z, how many). Six of them, no two the same height, three down the left
# side and three across the back: a row of equal columns reads as a colonnade,
# and what this is meant to read as is a job half done.
STACKS = [(-BORDER, -1.25, 9), (-BORDER, 0.0, 7), (-BORDER, 1.25, 8),
          (-1.25, -BORDER, 6), (0.1, -BORDER, 7), (1.45, -BORDER, 6)]

# And seven lying flat where a hand would have put them down, on the near shelf
# and one on the right: (x, z, turn).
LOOSE = [(-1.5, BORDER, 0.22), (-0.9, BORDER, -0.1), (-0.3, BORDER, 0.34),
         (0.35, BORDER, -0.28), (0.95, BORDER, 0.08), (1.55, BORDER, 0.4),
         (BORDER, -1.35, -0.18)]


def build_plinth() -> bpy.types.Object:
    bm = bmesh.new()
    # Two lifts, as Scrubble's is: a plinth with a step reads as something the
    # board stands on rather than as a thick board.
    add_slab(bm, (0.0, 0.05, 0.0), (PLINTH, 0.10, PLINTH))
    add_slab(bm, (0.0, 0.145, 0.0), (PLINTH - 0.26, 0.09, PLINTH - 0.26))
    return mesh_object("frame_plinth", bm)


def build_tray() -> bpy.types.Object:
    """A rim, eight lines each way, and nothing else. The wells are what is left
    between them, and their floors are a different mesh and a different material."""
    bm = bmesh.new()
    h = RAIL - TOP
    y = (TOP + RAIL) / 2
    outer = PLATE + RIM_W * 2
    for s in (-1, 1):
        add_slab(bm, (0.0, y, s * (PLATE + RIM_W) / 2), (outer, h, RIM_W))
        add_slab(bm, (s * (PLATE + RIM_W) / 2, y, 0.0), (RIM_W, h, PLATE))
    for k in range(1, 9):
        box = k % 3 == 0
        w = BOX_RIB if box else RIB
        hh = h + (BOX_PROUD if box else 0.0)
        yy = y + (BOX_PROUD / 2 if box else 0.0)
        t = (k - 4.5) * CELL
        add_slab(bm, (t, yy, 0.0), (w, hh, PLATE))
        add_slab(bm, (0.0, yy, t), (PLATE, hh, w))
    return mesh_object("frame_tray", bm)


def build_wells() -> bpy.types.Object:
    """What is under the tiles and under the holes: one solid floor across the
    tray, and a pad in each cell bringing that cell's floor up to where it
    belongs — a seat under a clue, `depth()` down under an empty cell."""
    bm = bmesh.new()
    add_slab(bm, (0.0, (TOP + SUB) / 2, 0.0), (PLATE, SUB - TOP, PLATE))
    for i in range(9):
        for j in range(9):
            x, z = at(i, j)
            floor = SEAT if CLUES[i][j] == "#" else RAIL - depth(i, j)
            add_slab(bm, (x, (SUB + floor) / 2, z), (CELL, floor - SUB, CELL))
    return mesh_object("dark_wells", bm)


def build_clues() -> bpy.types.Object:
    """The thirty-one tiles that are down. One mesh and no `~prop`: a tile in a
    recess is held by the recess, so these do not move."""
    bm = bmesh.new()
    for i in range(9):
        for j in range(9):
            if CLUES[i][j] != "#":
                continue
            x, z = at(i, j)
            add_slab(bm, (x, SEAT + TILE_H / 2, z), (TILE, TILE_H, TILE))
    return mesh_object("panel_clue", bm)


def build_loose() -> list[bpy.types.Object]:
    """The fifty that are not down — six stacks and seven lying flat, one mesh
    each, which is one rigid prop each (`src/plateau.ts`)."""
    out = []
    for n, (x, z, count) in enumerate(STACKS):
        bm = bmesh.new()
        for k in range(count):
            # A hand's stack is not a machined one. Each tile is a few degrees
            # off the one under it and a centimetre out of line with it, or the
            # column reads as an extrusion rather than as a pile.
            add_slab(
                bm,
                (x + 0.013 * math.sin(k * 2.1 + n), TOP + TILE_H * (k + 0.5),
                 z + 0.013 * math.cos(k * 1.7 + n * 2.0)),
                (TILE, TILE_H, TILE),
                ry=0.055 * math.sin(k * 1.3 + n),
            )
        out.append(mesh_object(f"panel_tile~s{n}", bm))
    for n, (x, z, yaw) in enumerate(LOOSE):
        bm = bmesh.new()
        add_slab(bm, (x, TOP + TILE_H / 2, z), (TILE, TILE_H, TILE), ry=yaw)
        out.append(mesh_object(f"panel_tile~t{n}", bm))
    return out


def main() -> None:
    # The two halves of the puzzle have to agree before anything is built: they
    # are the same board written twice, which is the one mistake this script can
    # make that the geometry would not show.
    for i in range(9):
        for j in range(9):
            assert (CLUES[i][j] == "#") == (DIGITS[i][j] != 0), f"cell {i},{j}"
    empty = sum(row.count(".") for row in CLUES)
    beside = sum(c for _, _, c in STACKS) + len(LOOSE)
    assert empty == beside, f"{empty} empty cells, {beside} tiles beside the board"
    counts = [candidates(i, j) for i in range(9) for j in range(9) if CLUES[i][j] == "."]
    assert min(counts) >= 2 and max(counts) <= 6, f"candidates run {min(counts)}..{max(counts)}"
    assert WELL_MAX < RAIL - SUB + 1e-9, "the deepest well is through the tray's floor"
    print(f"[sudoku] {81 - empty} clues, {empty} open  ·  candidates "
          f"{min(counts)}..{max(counts)}  ·  wells {WELL_MIN} to {WELL_MAX}")

    start()

    plinth = join("frame_plinth", [build_plinth()])
    tray = join("frame_tray", [build_tray()])
    wells = join("dark_wells", [build_wells()])
    clues = join("panel_clue", [build_clues()])

    finish(plinth, 30, bevel=0.008)
    finish(tray, 30, bevel=0.006)
    finish(wells, 60)
    finish(clues, 50, bevel=0.006)
    for tile in build_loose():
        finish(tile, 50, bevel=0.006)

    export("sudoku", BOX, GLB, BLEND)

    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS, ortho_scale=6.4, ground=14.0)


if __name__ == "__main__":
    main()
