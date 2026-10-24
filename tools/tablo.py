"""
Tablo's landmark: the circuit as a rail. The sixth project.

    python3 tools/tablo.py                    # tools/tablo.blend + src/models/tablo.glb
    python3 tools/tablo.py --render out.png   # ...and three preview views

The island is Tablo's single-line diagram closed into a loop and stood up on
posts: a feed out of the board, a split, a fork each side whose two paths
join again, and a return back up through the board — a rail the surfer
lands on and grinds, round and round, until he jumps. On every stretch of it
stands one of Tablo's own example installations, and each switches on as he
passes: lamps, sockets, a washing machine, a heat pump, an EV charger, solar
panels and their inverter, a roller shutter, and the board itself, hung on a
gantry over the rail so he grinds underneath it.

Nothing here places anything. Every position, height and footprint is
`layout()` in `src/tablo.ts`, which this script runs in node and builds from —
the rail the board rides and the rail the eye sees are one set of numbers,
and `tablo.check.ts` reads the .glb back against them.

Names pick materials, as everywhere: `wire_rail` is the conductor;
`lamp_a<i>` is whatever lights on appliance i; `panel_fan<i>`,
`lamp_bars<i>` and `panel_shutter<i>` are the three parts the shader moves
(a fan turning, a charge filling, a shutter rolling up), each about numbers in
`PARTS`. No UVs, no materials.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
import sys

import bpy
from landmark import T, add_cyl, add_slab, export, finish, join, mesh_object, preview, start
import bmesh
from mathutils import Matrix

BOX = (19.5, 3.4, 15.0)  # src/content/projects/tablo.en.mdx, frontmatter `size`
GLB = "src/models/tablo.glb"
BLEND = "tools/tablo.blend"
SPREAD = 1.9  # `ISLAND_SPREAD`, `world.ts`

VIEWS = {
    "approach": ((2.0, 9.0, 20.0), (0.0, 0.5, 0.0)),
    "quarter": ((15.0, 9.0, 13.0), (0.0, 0.6, 0.0)),
    "front": ((0.0, 2.6, 14.0), (0.0, 1.6, 1.6)),
}


def read_layout() -> dict:
    """`layout()` from src/tablo.ts, for the island's real radius."""
    fm = open("src/content/projects/tablo.en.mdx").read()
    radius = float(re.search(r"^radius: ([\d.]+)$", fm, re.M).group(1))
    js = "import('./src/tablo.ts').then(m => console.log(JSON.stringify(m.layout(%f))))" % (radius * SPREAD)
    return json.loads(subprocess.check_output(["node", "-e", js], text=True))


# ------------------------------------------------------------------ the rail


def build_rail(L: dict) -> bpy.types.Object:
    """Every edge swept as a six-sided tube along its centre line."""
    bm = bmesh.new()
    r = L["rail"]["r"]
    sides = 6
    for pts in L["rails"]:
        rings = []
        for i, (x, y, z) in enumerate(pts):
            a = pts[max(i - 1, 0)]
            b = pts[min(i + 1, len(pts) - 1)]
            tx, tz = b[0] - a[0], b[2] - a[2]
            tl = math.hypot(tx, tz) or 1.0
            nx, nz = -tz / tl, tx / tl  # across the rail, level
            yc = y - r  # the top of the tube is the rail's top
            ring = []
            for k in range(sides):
                t = 2 * math.pi * k / sides
                ring.append(bm.verts.new(T(x + nx * r * math.cos(t), yc + r * math.sin(t), z + nz * r * math.cos(t))))
            rings.append(ring)
        for i in range(len(rings) - 1):
            for k in range(sides):
                j = (k + 1) % sides
                bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    bm.normal_update()
    return mesh_object("wire_rail", bm)


def build_posts(L: dict) -> bpy.types.Object:
    bm = bmesh.new()
    r = L["rail"]["r"]
    for x, z, g, top in L["posts"]:
        add_cyl(bm, (x, g - 0.05, z), (x, top - 2 * r, z), 0.035, 8)
        add_cyl(bm, (x, g - 0.05, z), (x, g + 0.03, z), 0.12, 10)
        # the saddle the conductor sits in
        add_slab(bm, (x, top - 2 * r - 0.02, z), (0.14, 0.04, 0.14))
    return mesh_object("frame_post", bm)


# ------------------------------------------------------------- the appliances


class At:
    """An appliance's own frame: `u` across it, `y` up from its ground, `v`
    toward the rail it faces. Turned by its yaw, as three turns a group."""

    def __init__(self, a: dict):
        self.x, self.z, self.g, self.yaw = a["x"], a["z"], a["ground"], a["yaw"]
        self.fx, self.fz = math.sin(self.yaw), math.cos(self.yaw)
        self.rx, self.rz = self.fz, -self.fx

    def p(self, u: float, y: float, v: float):
        return (self.x + self.rx * u + self.fx * v, self.g + y, self.z + self.rz * u + self.fz * v)

    def slab(self, bm, u, y, v, w, h, d, rx=0.0):
        add_slab(bm, self.p(u, y, v), (w, h, d), rx=rx, ry=self.yaw)

    def cyl(self, bm, a, b, r, seg=16):
        add_cyl(bm, self.p(*a), self.p(*b), r, seg)


def lamp(i, a, body, dark, glow):
    f = At(a)
    f.cyl(body, (0, 0, 0), (0, 0.05, 0), 0.22, 18)
    f.cyl(body, (0, 0, 0), (0, 1.55, 0), 0.06, 10)
    f.cyl(dark, (0, 1.5, 0), (0, 1.6, 0), 0.12, 14)
    bmesh.ops.create_uvsphere(glow, u_segments=18, v_segments=10, radius=0.24,
                              matrix=Matrix.Translation(T(*f.p(0, 1.82, 0))))


def socket(i, a, body, dark, glow):
    """A Belgian outlet on a post: the cup and its earth pin — Tablo's logo —
    and a ring round the cup that lights."""
    f = At(a)
    w, d = a_foot(a)
    f.slab(body, 0, 0.3, 0, w, 0.6, d)
    f.cyl(glow, (0, 0.42, d / 2), (0, 0.42, d / 2 + 0.015), 0.16, 24)
    f.cyl(dark, (0, 0.42, d / 2 + 0.015), (0, 0.42, d / 2 + 0.03), 0.12, 24)
    f.cyl(body, (0, 0.5, d / 2 + 0.03), (0, 0.5, d / 2 + 0.08), 0.022, 8)


def washer(i, a, body, dark, glow):
    f = At(a)
    w, d = a_foot(a)
    f.slab(body, 0, 0.43, 0, w, 0.86, d)
    f.slab(dark, 0, 0.8, d / 2 + 0.005, w * 0.9, 0.08, 0.01)  # the panel
    f.cyl(dark, (0, 0.42, d / 2), (0, 0.42, d / 2 + 0.03), 0.27, 28)  # the door's ring
    f.cyl(glow, (0, 0.42, d / 2 + 0.03), (0, 0.42, d / 2 + 0.04), 0.21, 28)  # the glass, lit


def heatpump(i, a, body, dark, glow, fan):
    """The outdoor unit, a fan on top turning under its guard."""
    f = At(a)
    w, d = a_foot(a)
    P = a_parts()
    f.slab(body, 0, P["fan"]["y"] / 2, 0, w, P["fan"]["y"], d)
    f.cyl(dark, (0, P["fan"]["y"], 0), (0, P["fan"]["y"] + 0.02, 0), P["fan"]["r"] + 0.04, 28)
    cx, cy, cz = f.p(0, P["fan"]["y"] + 0.035, 0)
    rr = P["fan"]["r"] * 0.48
    for k in range(3):
        t = k * 2 * math.pi / 3
        add_slab(fan, (cx + math.cos(t) * rr, cy, cz + math.sin(t) * rr), (P["fan"]["r"] * 0.95, 0.02, 0.11),
                 rx=0.35, ry=-t)
    f.slab(glow, w / 2 - 0.12, 0.7, d / 2 + 0.005, 0.08, 0.04, 0.01)  # its LED


def charger(i, a, body, dark, glow, bars):
    """A pedestal charger: five bars down its face that fill while it charges."""
    f = At(a)
    w, d = a_foot(a)
    P = a_parts()["bars"]
    f.slab(body, 0, 0.75, 0, w, 1.5, d)
    f.slab(dark, 0, (P["y0"] + P["y1"]) / 2, d / 2 + 0.005, w * 0.6, P["y1"] - P["y0"] + 0.1, 0.01)
    n = 5
    step = (P["y1"] - P["y0"]) / n
    for k in range(n):
        f.slab(bars, 0, P["y0"] + step * (k + 0.5), d / 2 + 0.012, w * 0.45, step * 0.7, 0.008)
    f.cyl(dark, (w / 2, 1.0, 0), (w / 2 + 0.12, 0.6, 0.1), 0.035, 8)  # the cable
    f.slab(glow, 0, 1.38, d / 2 + 0.005, 0.12, 0.05, 0.01)


def solar(i, a, body, dark, glow, glass):
    """Two panels on a frame, tilted up, and the inverter beside them."""
    f = At(a)
    w, d = a_foot(a)
    for k in (-1, 1):
        f.slab(body, k * 0.62, 0.45, -0.3, 0.06, 0.9, 0.06)
        f.slab(body, k * 0.62, 0.3, 0.2, 0.06, 0.6, 0.06)
    f.slab(glass, 0, 0.78, -0.05, w * 0.95, 0.04, d * 0.85, rx=-0.55)
    f.slab(body, w / 2 - 0.3, 0.35, d / 2 - 0.1, 0.5, 0.7, 0.18)  # the inverter
    f.slab(glow, w / 2 - 0.3, 0.5, d / 2 - 0.005, 0.26, 0.12, 0.01)  # its display


def shutter(i, a, body, dark, glow, slats):
    """A window in a frame, a lit room behind it, and the roller shutter
    over it that rolls up while the house is on."""
    f = At(a)
    w, d = a_foot(a)
    P = a_parts()["shutter"]
    h = P["y1"] - P["y0"]
    f.slab(body, -w / 2 + 0.05, (P["y0"] + P["y1"]) / 2 + 0.06, 0, 0.1, h + 0.32, d)
    f.slab(body, w / 2 - 0.05, (P["y0"] + P["y1"]) / 2 + 0.06, 0, 0.1, h + 0.32, d)
    f.slab(body, 0, P["y1"] + 0.12, 0, w, 0.24, d)  # the roller box
    f.slab(body, 0, P["y0"] - 0.05, 0, w, 0.1, d)
    f.slab(glow, 0, (P["y0"] + P["y1"]) / 2, -0.04, w - 0.2, h, 0.02)  # the room behind
    f.slab(dark, 0, (P["y0"] + P["y1"]) / 2, -0.02, 0.04, h, 0.02)  # the mullion
    n = 14
    for k in range(n):
        f.slab(slats, 0, P["y0"] + h * (k + 0.5) / n, 0.06, w - 0.22, h / n * 0.86, 0.03)


def board(a, gantry_bm, cabinet, dark, glow):
    """The board, hung on a gantry over the rail, its face to the return."""
    G = LAYOUT["gantry"]
    x, z, g = a["x"], a["z"], a["ground"]
    for k in (-1, 1):
        add_slab(gantry_bm, (x + k * G["half"], (g + G["top"]) / 2, z), (0.16, G["top"] - g, 0.3))
        add_slab(gantry_bm, (x + k * G["half"], g + 0.05, z), (0.36, 0.1, 0.6))
    add_slab(gantry_bm, (x, G["top"] - 0.06, z), (2 * G["half"] + 0.3, 0.12, 0.34))
    bottom = G["cabinet"]
    top = G["top"] - 0.12
    add_slab(cabinet, (x, (bottom + top) / 2, z), (2.1, top - bottom, 0.32))
    # The modules on its face: main switch, two RCDs, four breakers, as the
    # sheet's diagram has them, with their levers up.
    mods = [2, 2, 1, 1, 1, 2, 1]
    mw = 0.19
    u = -sum(mods) * mw / 2
    y = (bottom + top) / 2
    for k, m in enumerate(mods):
        cx = x + u + m * mw / 2
        add_slab(cabinet, (cx, y, z + 0.18), (m * mw - 0.01, 0.42, 0.06))
        add_slab(dark, (cx, y + 0.04, z + 0.23), (0.08 if m == 1 else 0.14, 0.12, 0.05))
        add_slab(glow, (cx, y + 0.17, z + 0.215), (0.05, 0.03, 0.01))
        u += m * mw


def a_foot(a):
    return LAYOUT["foot"][a["kind"]]


def a_parts():
    return LAYOUT["parts"]


LAYOUT: dict = {}


def main() -> None:
    global LAYOUT
    LAYOUT = read_layout()
    start()
    parts: list[tuple[bpy.types.Object, float]] = [(build_rail(LAYOUT), 0), (build_posts(LAYOUT), 0)]
    body, dark, gantry, cabinet = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    extra: list[tuple[str, bmesh.types.BMesh]] = []
    for i, a in enumerate(LAYOUT["appliances"]):
        glow = bmesh.new()
        k = a["kind"]
        if k == "board":
            board(a, gantry, cabinet, dark, glow)
        elif k == "lamp":
            lamp(i, a, body, dark, glow)
        elif k == "socket":
            socket(i, a, body, dark, glow)
        elif k == "washer":
            washer(i, a, body, dark, glow)
        elif k == "heatpump":
            fan = bmesh.new()
            heatpump(i, a, body, dark, glow, fan)
            extra.append((f"panel_fan{i}", fan))
        elif k == "charger":
            bars = bmesh.new()
            charger(i, a, body, dark, glow, bars)
            extra.append((f"lamp_bars{i}", bars))
        elif k == "solar":
            glass = bmesh.new()
            solar(i, a, body, dark, glow, glass)
            extra.append((f"glass_solar{i}", glass))
        elif k == "shutter":
            slats = bmesh.new()
            shutter(i, a, body, dark, glow, slats)
            extra.append((f"panel_shutter{i}", slats))
        extra.append((f"lamp_a{i}", glow))
    parts += [(mesh_object("panel_appliances", body), 0.004), (mesh_object("dark_appliances", dark), 0),
              (mesh_object("frame_gantry", gantry), 0.01), (mesh_object("panel_cabinet", cabinet), 0.006)]
    parts += [(mesh_object(n, bm), 0) for n, bm in extra]
    for obj, bevel in parts:
        finish(join(obj.name, [obj]), 30, bevel=bevel)

    export("tablo", BOX, GLB, BLEND)

    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS, ortho_scale=6.0, ground=40.0)


if __name__ == "__main__":
    main()
