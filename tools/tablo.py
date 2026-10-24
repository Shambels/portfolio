"""
Tablo's landmark: a house drawn as its own position plan, and the
distribution board at its door that feeds it. The sixth project.

    python3 tools/tablo.py                    # tools/tablo.blend + src/models/tablo.glb
    python3 tools/tablo.py --render out.png   # ...and three preview views

Tablo draws Belgian installations as one model seen twice — a single-line
diagram and a position plan, every point tagged on both — so the island is
that model standing up. The floor is the plan: four rooms walled by kerbs
with 2.4 m doorways, a lamp in the middle of each room and sockets against
the walls. Every point has a conductor on the floor running back to the
board, and the board is a cabinet five times life size, door open, with the
main switch, two RCDs and four breakers on its rails. What lights, and when,
is `Landmarks.tsx`; what a rider does to it is `src/tablo.ts`.

Every number that places something is `src/tablo.ts`'s, copied here as the
landmark scripts copy theirs (`HOLO`, `RAMPS`): the plan, the walls, the
points and their routes, the cabinet, the rails and the devices on them.
`tablo.check.ts` reads the .glb back and holds the two together — the kerbs,
the conductors and the two RCD levers whose pivots the shader turns about.

Mesh names pick materials, as everywhere: `plan_floor` is the paper the plan
is drawn on; `wire_a`…`wire_d` the four circuits' conductors and
`lamp_a`…`lamp_d` their lamps and the LED on their breakers, one material
each so each lights on its own; `panel_rcd0` and `panel_rcd1` the two levers
the shader throws when an RCD trips. The kerbs are `frame_kerb`, but they
are not read as a wall off the mesh: a hull of their vertices would be one
polygon round the whole house, so the walls come from `PLAN_WALLS`.

No UVs, no materials, as for every landmark.
"""

from __future__ import annotations

import math
import sys

import bpy
from landmark import T, add_box, add_cyl, add_slab, export, finish, join, mesh_object, preview, start, strut
import bmesh
from mathutils import Matrix

# ---------------------------------------------------------------- the contract
# src/content/projects/tablo.en.mdx, frontmatter `size`.
BOX = (8.3, 2.7, 8.4)

GLB = "src/models/tablo.glb"
BLEND = "tools/tablo.blend"

VIEWS = {
    "approach": ((1.0, 7.5, 15.0), (0.0, 0.6, 0.5)),
    "quarter": ((10.0, 6.0, 9.0), (0.0, 0.8, 0.5)),
    "front": ((0.0, 1.4, 12.0), (0.0, 1.4, 3.8)),
}

# ------------------------------------------------------- from src/tablo.ts
HOUSE = dict(x0=-4.0, x1=4.0, z0=-3.5, z1=3.0)
KERB_H, KERB_T = 0.32, 0.12
WALLS = [
    ("x", 3.0, -4, -3.4), ("x", 3.0, -1.0, 1.0), ("x", 3.0, 3.4, 4),
    ("x", -3.5, -4, -3.0), ("x", -3.5, -0.6, 0.6), ("x", -3.5, 3.0, 4),
    ("z", -4, -3.5, 0.2), ("z", -4, 2.6, 3.0),
    ("z", 4, -3.5, -2.9), ("z", 4, -0.5, 3.0),
    ("x", -0.25, -4, -3.2), ("x", -0.25, -0.8, 0.8), ("x", -0.25, 3.2, 4),
    ("z", 0, 2.7, 3.0), ("z", 0, -0.6, 0.3), ("z", 0, -3.5, -3.0),
]
TRUNK = [-0.27, 0.27, -0.09, 0.09]  # circuits A B C D
POINTS = [
    (0, "lamp", -2.0, 1.3), (0, "socket", -3.75, -0.05), (0, "socket", -0.6, 2.75),
    (1, "lamp", 2.0, 1.3), (1, "socket", 3.75, 0.5), (1, "socket", 3.75, 2.2),
    (2, "lamp", -2.0, -1.9),
    (3, "lamp", 2.0, -1.9), (3, "socket", 3.5, -3.25),
]
LAMP_POST, LAMP_H, LAMP_R = 0.07, 1.45, 0.2
SOCKET_W, SOCKET_H, SOCKET_D = 0.36, 0.36, 0.2
CAB = dict(x0=-0.95, x1=0.95, z0=3.62, z1=4.07, y0=0.2, y1=2.6)
DOOR_HINGE, DOOR_W, DOOR_T, DOOR_OPEN = (-0.95, 4.07), 1.9, 0.05, math.radians(160)
MOD_W, MOD_H = 0.18, 0.56
PLATE, BASE, NOSE = 3.7, 0.12, 0.07
ROW_Y = (1.98, 1.3)
ROW_X0 = -3.5 * MOD_W
DEVICES = [  # kind, row, slot, modules, ref
    ("main", 0, 0, 2, None), ("rcd", 0, 2, 2, 0),
    ("breaker", 0, 4, 1, 0), ("breaker", 0, 5, 1, 1), ("breaker", 0, 6, 1, 2),
    ("rcd", 1, 0, 2, 1), ("breaker", 1, 2, 1, 3), ("blank", 1, 3, 4, None),
]
THROW_ON = 0.55
FEED_Z = 3.55

WIRE_W = 0.07
FLOOR_TOP = 0.012
WIRE_TOP = 0.02
LETTERS = "abcd"


def wall_rect(axis, at, a, b):
    h = KERB_T / 2
    if axis == "x":
        return (a - h, b + h, at - h, at + h)
    return (at - h, at + h, a - h, b + h)


def box(bm, x0, x1, y0, y1, z0, z1) -> None:
    add_slab(bm, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0))


def socket_box(x, z):
    along_x = abs(abs(z) - 3.5) < 0.3 or abs(z - 3.0) < 0.3
    w, d = SOCKET_W / 2, SOCKET_D / 2
    return (x - w, x + w, z - d, z + d) if along_x else (x - d, x + d, z - w, z + w)


# ------------------------------------------------------------------ the plan


def build_floor() -> bpy.types.Object:
    bm = bmesh.new()
    box(bm, HOUSE["x0"] - 0.06, HOUSE["x1"] + 0.06, 0.0, FLOOR_TOP, HOUSE["z0"] - 0.06, HOUSE["z1"] + 0.06)
    return mesh_object("plan_floor", bm)


def build_kerbs() -> bpy.types.Object:
    bm = bmesh.new()
    for w in WALLS:
        x0, x1, z0, z1 = wall_rect(*w)
        box(bm, x0, x1, 0.0, KERB_H, z0, z1)
    return mesh_object("frame_kerb", bm)


def build_wires(k: int) -> bpy.types.Object:
    """Circuit k's conductors: back from the board on its trunk, then across
    to each point — `route()` in `tablo.ts`, a strip per leg."""
    bm = bmesh.new()
    x = TRUNK[k]
    for c, _kind, px, pz in POINTS:
        if c != k:
            continue
        for (ax, az), (bx, bz) in (((x, FEED_Z), (x, pz)), ((x, pz), (px, pz))):
            if abs(ax - bx) + abs(az - bz) < 1e-6:
                continue
            box(bm, min(ax, bx) - WIRE_W / 2, max(ax, bx) + WIRE_W / 2, FLOOR_TOP, WIRE_TOP,
                min(az, bz) - WIRE_W / 2, max(az, bz) + WIRE_W / 2)
    return mesh_object(f"wire_{LETTERS[k]}", bm)


def build_posts() -> bpy.types.Object:
    bm = bmesh.new()
    for _c, kind, x, z in POINTS:
        if kind != "lamp":
            continue
        add_cyl(bm, (x, 0.0, z), (x, 0.05, z), 0.2, 20)
        add_cyl(bm, (x, 0.0, z), (x, LAMP_H - LAMP_R * 0.6, z), LAMP_POST, 10)
    return mesh_object("frame_post", bm)


def build_sockets() -> tuple[bpy.types.Object, bpy.types.Object]:
    """A Belgian socket outlet, giant: a block, and on its face the round
    recess with the earth pin standing in it — the same face Tablo's logo is."""
    bm = bmesh.new()
    face = bmesh.new()
    for _c, kind, x, z in POINTS:
        if kind != "socket":
            continue
        x0, x1, z0, z1 = socket_box(x, z)
        box(bm, x0, x1, 0.0, SOCKET_H, z0, z1)
        # which way the face looks: away from the wall it is against
        if (x1 - x0) > (z1 - z0):
            n = (0.0, -1.0) if z > 0 else (0.0, 1.0)
        else:
            n = (1.0, 0.0) if x < 0 else (-1.0, 0.0)
        cx = (x0 + x1) / 2 + n[0] * ((x1 - x0) / 2)
        cz = (z0 + z1) / 2 + n[1] * ((z1 - z0) / 2)
        y = SOCKET_H * 0.52
        add_cyl(face, (cx, y, cz), (cx + n[0] * 0.012, y, cz + n[1] * 0.012), 0.12, 24)
        add_cyl(face, (cx + n[0] * 0.012, y + 0.075, cz + n[1] * 0.012),
                (cx + n[0] * 0.05, y + 0.075, cz + n[1] * 0.05), 0.018, 8)
    return mesh_object("panel_socket", bm), mesh_object("dark_socket", face)


# ----------------------------------------------------------------- the board


def device_x(slot: int, mods: int) -> tuple[float, float]:
    return ROW_X0 + slot * MOD_W, ROW_X0 + (slot + mods) * MOD_W


def build_cabinet() -> bpy.types.Object:
    bm = bmesh.new()
    x0, x1, z0, z1, y0, y1 = CAB["x0"], CAB["x1"], CAB["z0"], CAB["z1"], CAB["y0"], CAB["y1"]
    t = 0.06
    box(bm, x0, x1, y0, y1, z0, z0 + t)  # back
    box(bm, x0, x0 + t, y0, y1, z0, z1)  # sides
    box(bm, x1 - t, x1, y0, y1, z0, z1)
    box(bm, x0, x1, y1 - t, y1, z0, z1)  # top and bottom
    box(bm, x0, x1, y0, y0 + t, z0, z1)
    # a lip round the opening, where the door shuts
    box(bm, x0, x0 + 0.1, y0, y1, z1 - 0.025, z1)
    box(bm, x1 - 0.1, x1, y0, y1, z1 - 0.025, z1)
    box(bm, x0, x1, y1 - 0.1, y1, z1 - 0.025, z1)
    box(bm, x0, x1, y0, y0 + 0.1, z1 - 0.025, z1)
    # the feet it stands on
    box(bm, x0 + 0.1, x1 - 0.1, 0.0, y0, z0 + 0.03, z1 - 0.03)
    return mesh_object("frame_cabinet", bm)


def build_plate() -> bpy.types.Object:
    bm = bmesh.new()
    box(bm, -0.86, 0.86, 0.32, 2.48, CAB["z0"] + 0.06, PLATE)
    return mesh_object("dark_plate", bm)


def build_rails() -> bpy.types.Object:
    bm = bmesh.new()
    for y in ROW_Y:
        box(bm, -0.74, 0.74, y - 0.0175, y + 0.0175, PLATE, PLATE + 0.012)
    # the terminal row, low down: a rail of blocks where the circuits leave
    box(bm, -0.78, 0.78, 0.72 - 0.0175, 0.72 + 0.0175, PLATE, PLATE + 0.012)
    for i in range(18):
        x = -0.68 + i * 0.08
        box(bm, x - 0.03, x + 0.03, 0.64, 0.8, PLATE + 0.012, PLATE + 0.1)
    return mesh_object("frame_rail", bm)


def build_ducts() -> bpy.types.Object:
    """The cable ducts: up both sides and across between the rows, where a
    board's wiring actually runs."""
    bm = bmesh.new()
    for x in (-0.8, 0.8):
        box(bm, x - 0.04, x + 0.04, 0.42, 2.38, PLATE, PLATE + 0.09)
    for y in (2.36, 1.64, 0.94):
        box(bm, -0.76, 0.76, y - 0.04, y + 0.04, PLATE, PLATE + 0.09)
    return mesh_object("dark_duct", bm)


def build_modules() -> bpy.types.Object:
    bm = bmesh.new()
    for kind, row, slot, mods, _ref in DEVICES:
        a, b = device_x(slot, mods)
        y = ROW_Y[row]
        e = 0.004
        if kind == "blank":
            box(bm, a + e, b - e, y - 0.13, y + 0.13, PLATE, PLATE + BASE + NOSE * 0.4)
            continue
        box(bm, a + e, b - e, y - MOD_H / 2, y + MOD_H / 2, PLATE, PLATE + BASE)
        box(bm, a + e, b - e, y - 0.13, y + 0.13, PLATE + BASE, PLATE + BASE + NOSE)
        # the label strip over it
        box(bm, a + e, b - e, y + 0.19, y + 0.25, PLATE + BASE, PLATE + BASE + 0.006)
    return mesh_object("panel_modules", bm)


def lever(bm, x: float, y: float, w: float) -> None:
    z = PLATE + BASE + NOSE
    tip = (x, y + 0.14 * math.sin(THROW_ON), z + 0.14 * math.cos(THROW_ON))
    add_box(bm, strut((x, y, z - 0.01), tip, w, 0.045))


def build_levers() -> list[bpy.types.Object]:
    still = bmesh.new()
    rcd = {0: bmesh.new(), 1: bmesh.new()}
    for kind, row, slot, mods, ref in DEVICES:
        if kind == "blank":
            continue
        a, b = device_x(slot, mods)
        x = (a + b) / 2
        y = ROW_Y[row]
        if kind == "rcd":
            lever(rcd[ref], x, y, 0.07)
            # the test button, beside it on the nose
            box(still, b - 0.05, b - 0.018, y - 0.09, y - 0.058, PLATE + BASE + NOSE, PLATE + BASE + NOSE + 0.025)
        else:
            lever(still, x, y, 0.12 if mods == 2 else 0.07)
    out = [mesh_object("dark_levers", still)]
    out += [mesh_object(f"panel_rcd{k}", rcd[k]) for k in (0, 1)]
    return out


def build_lamps(k: int) -> bpy.types.Object:
    """Circuit k's light: the globe on each of its lamp posts, and the LED on
    its breaker — one mesh, so one material lights all of it."""
    bm = bmesh.new()
    for c, kind, x, z in POINTS:
        if c == k and kind == "lamp":
            bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=10, radius=LAMP_R,
                                      matrix=Matrix.Translation(T(x, LAMP_H, z)))
    for kind, row, slot, mods, ref in DEVICES:
        if kind == "breaker" and ref == k:
            a, b = device_x(slot, mods)
            x = (a + b) / 2
            y = ROW_Y[row] + 0.1
            z = PLATE + BASE + NOSE
            box(bm, x - 0.022, x + 0.022, y - 0.016, y + 0.016, z, z + 0.01)
    return mesh_object(f"lamp_{LETTERS[k]}", bm)


def build_door() -> tuple[bpy.types.Object, bpy.types.Object]:
    """The door, open: 160° on its left hinge, its inside to the approach —
    and on its inside, the diagram, which is where a board's diagram is kept."""
    ux, uz = math.cos(DOOR_OPEN), math.sin(DOOR_OPEN)
    nx, nz = -uz, ux  # the outside of the door, when it was shut
    hx, hz = DOOR_HINGE
    cx = hx + ux * DOOR_W / 2 + nx * DOOR_T / 2
    cz = hz + uz * DOOR_W / 2 + nz * DOOR_T / 2
    y0, y1 = CAB["y0"], CAB["y1"]
    bm = bmesh.new()
    add_slab(bm, (cx, (y0 + y1) / 2, cz), (DOOR_W, y1 - y0, DOOR_T), ry=-DOOR_OPEN)
    sheet = bmesh.new()
    sx = hx + ux * DOOR_W / 2 - nx * 0.006
    sz = hz + uz * DOOR_W / 2 - nz * 0.006
    add_slab(sheet, (sx, 1.42, sz), (0.86, 1.18, 0.008), ry=-DOOR_OPEN)
    return mesh_object("frame_door", bm), mesh_object("panel_sheet", sheet)


def main() -> None:
    start()
    parts = [
        (build_floor(), 0),
        (build_kerbs(), 0.012),
        (build_posts(), 0),
        (build_cabinet(), 0.01),
        (build_plate(), 0),
        (build_rails(), 0),
        (build_ducts(), 0.006),
        (build_modules(), 0.004),
    ]
    sockets, faces = build_sockets()
    parts += [(sockets, 0.01), (faces, 0)]
    parts += [(o, 0) for o in build_levers()]
    parts += [(build_wires(k), 0) for k in range(4)]
    parts += [(build_lamps(k), 0) for k in range(4)]
    door, sheet = build_door()
    parts += [(door, 0.008), (sheet, 0)]
    for obj, bevel in parts:
        finish(join(obj.name, [obj]), 30, bevel=bevel)

    export("tablo", BOX, GLB, BLEND)

    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS, ortho_scale=4.0, ground=26.0)


if __name__ == "__main__":
    main()
