"""
The isle's planting — coconut palms, a fern clump and a boulder.

    python3 tools/palm.py                    # tools/palm.blend + src/models/palm.glb
    python3 tools/palm.py --render out.png   # ...and three preview views

Not a landmark, and the first model in this world that is not: `src/isle.ts` is
an island that carries no project, and what makes it read as tropical rather
than as a green hill is thirty palm trees. So this file exports a *library* —
three palms, a fern and a boulder, each at its own origin — and `src/Isle.tsx`
instances them across the ground `isleHeight` describes.

Why a model at all, when the ship, the sea and the islands are all procedural
(CLAUDE.md: "anything else that wants a model file still has to argue for one
first"): a palm is a curve with a hundred and forty separate leaflets hung off
it, and the argument is the same one `surfer.py` makes about a person. Every
leaflet is a quad at its own angle, drooping by its own amount, and code that
builds that in the browser is this code plus a runtime cost, on a thing that
never changes and is drawn thirty times. Built once here, it costs bytes; built
in `Isle.tsx`, it costs bytes *and* a frame budget.

Three sizes and not one, because thirty copies of a single tree is an orchard.
The variants differ in height, lean, and how many fronds have dropped — which is
what actually separates an old palm from a young one on a beach.

Geometry only. `Isle.tsx` shades by name prefix (`bark_`, `frond_`, `bush_`,
`rock_`) exactly the way `Landmarks.tsx` does, and the fronds are single quads
lit from both sides.

Real scale, and it is the whole reason the isle exists: the trunks are 6 to 12
metres against a 1.8 m rider on a 2.3 m board.
"""

from __future__ import annotations

import math
import sys

import bpy
from landmark import T, export, finish, join, lump, mesh_object, preview, start
import bmesh
from mathutils import Vector

GLB = "src/models/palm.glb"
BLEND = "tools/palm.blend"

# The library's bounding contract. Nothing here is inside a frontmatter box —
# there is no landmark — so this is the box `Isle.tsx` reserves around a palm
# when it places one, plus the row the variants are laid out in for sculpting.
BOX = (36.0, 14.0, 9.5)
TRIS_MAX = 14_000

UP = Vector((0.0, 1.0, 0.0))


def h(n: float) -> float:
    """Deterministic 0..1 from a number. `random` would make this file's output
    depend on when it was called; a hash makes the tree the same tree forever."""
    s = math.sin(n * 127.1 + 311.7) * 43758.5453
    return s - math.floor(s)


# ------------------------------------------------------------------- the trunk


def trunk_point(t: float, height: float, lean: float, sway: float) -> Vector:
    """A point on the trunk's axis, t from 0 at the sand to 1 at the crown.

    The lean is quadratic minus a cubic: a coconut palm growing over water bends
    hardest in its middle and stands the crown back up, and a plain arc reads as
    a bent pole. The sway is a hair of the same thing across the lean, so the
    tree is not flat in one plane."""
    y = height * t
    x = height * (lean * t * t - lean * 0.42 * t * t * t)
    z = height * sway * math.sin(3.1 * t)
    return Vector((x, y, z))


def trunk_radius(t: float, height: float, base: float, top: float) -> float:
    """Thick at the sand, thin at the crown, with the root swell in the bottom
    tenth and the ring scars every leaf has ever left on the way up."""
    r = top + (base - top) * (1.0 - t) ** 1.7
    r += base * 0.55 * math.exp(-t * 16.0)
    rings = 1.0 + 0.032 * math.sin(t * height * 3.4)
    return r * rings


def frame(tangent: Vector) -> tuple[Vector, Vector]:
    """Two vectors across a direction. Not a parallel-transported frame: the
    trunk never twists enough for the seam to show, and this is four lines."""
    a = UP if abs(tangent.dot(UP)) < 0.95 else Vector((1.0, 0.0, 0.0))
    u = tangent.cross(a).normalized()
    return u, tangent.cross(u).normalized()


def add_trunk(bm, height: float, lean: float, sway: float, base: float, top: float,
              rings: int = 15, around: int = 9) -> tuple[Vector, Vector]:
    """Sweep the trunk and return where the crown sits and which way it points."""
    loops = []
    for i in range(rings + 1):
        t = i / rings
        c = trunk_point(t, height, lean, sway)
        nxt = trunk_point(min(t + 1e-3, 1.0), height, lean, sway)
        prv = trunk_point(max(t - 1e-3, 0.0), height, lean, sway)
        tan = (nxt - prv).normalized()
        u, v = frame(tan)
        r = trunk_radius(t, height, base, top)
        loops.append([
            bm.verts.new(T(*(c + u * (r * math.cos(a)) + v * (r * math.sin(a)))))
            for a in (2 * math.pi * k / around for k in range(around))
        ])
    for i in range(rings):
        for k in range(around):
            j = (k + 1) % around
            bm.faces.new((loops[i][k], loops[i][j], loops[i + 1][j], loops[i + 1][k]))
    bm.faces.new(tuple(reversed(loops[0])))  # the cut at the sand, never seen
    bm.faces.new(tuple(loops[-1]))           # and the one the crown sits on

    crown = trunk_point(1.0, height, lean, sway)
    tan = (crown - trunk_point(0.985, height, lean, sway)).normalized()
    return crown, tan


def add_nuts(bm, crown: Vector, tan: Vector, seed: float, count: int) -> None:
    """The cluster under the crown. Small, and it is worth the two hundred
    triangles: it is the one thing that says coconut rather than fern."""
    u, v = frame(tan)
    for k in range(count):
        a = 2 * math.pi * k / count + seed
        r = 0.28 + 0.1 * h(seed + k)
        c = crown + u * (r * math.cos(a)) + v * (r * math.sin(a)) - tan * (0.35 + 0.22 * h(seed + k * 3.3))
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=0.135 + 0.02 * h(seed + k * 7.1))
        bmesh.ops.translate(tmp, vec=T(*c), verts=tmp.verts)
        me = bpy.data.meshes.new("_nut")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)


# ------------------------------------------------------------------ the fronds


def frond(bm, root: Vector, azimuth: float, elevation: float, length: float,
          droop: float, seed: float, stations: int = 18) -> None:
    """One leaf: a rachis that arches over under its own weight, and leaflets
    hung off both sides of it.

    The arch is the whole silhouette of a palm. It is a launch direction plus a
    quadratic fall, which is what a cantilever does — the frond leaves the crown
    pointing up and is horizontal by half its length and hanging by its tip."""
    d0 = Vector((
        math.cos(elevation) * math.cos(azimuth),
        math.sin(elevation),
        math.cos(elevation) * math.sin(azimuth),
    ))
    side = Vector((-math.sin(azimuth), 0.0, math.cos(azimuth)))

    def spine(s: float) -> Vector:
        """s from 0 at the crown to 1 at the tip."""
        return root + d0 * (length * s) - UP * (droop * length * s * s)

    pts = [spine(i / stations) for i in range(stations + 1)]
    tans = [(pts[min(i + 1, stations)] - pts[max(i - 1, 0)]).normalized() for i in range(stations + 1)]

    # The rachis itself: a narrow ribbon rather than a tube. Seen from two
    # metres it is a line, and a tube here would cost more than the leaflets.
    left, right = [], []
    for i, (p, tan) in enumerate(zip(pts, tans)):
        w = 0.055 * (1.0 - 0.85 * (i / stations))
        n = tan.cross(side).normalized() if abs(tan.dot(side)) < 0.99 else UP
        left.append(bm.verts.new(T(*(p + n * w))))
        right.append(bm.verts.new(T(*(p - n * w))))
    for i in range(stations):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))

    # And the leaflets. Longest at two fifths of the way out and shortest at
    # both ends, which is the shape of every pinnate leaf there is.
    for i in range(1, stations + 1):
        s = i / stations
        span = length * 0.33 * math.sin(math.pi * s ** 0.72) ** 0.6
        if span < 0.05:
            continue
        tan = tans[i]
        across = tan.cross(UP).normalized() if abs(tan.dot(UP)) < 0.98 else side
        for sign in (1.0, -1.0):
            jitter = 0.85 + 0.3 * h(seed + i * 5.7 + sign)
            # Swept back toward the tip and hanging: a leaflet square to the
            # rachis and level is a feather duster, not a palm.
            dirn = (across * (sign * 0.9) + tan * 0.62 - UP * (0.5 + 0.4 * s)).normalized()
            base = pts[i]
            # Half a leaflet's spacing wide, so neighbours all but touch: a frond
            # with daylight between every leaflet is a fish bone.
            w = (length / stations) * 0.5 * (1.0 - 0.35 * s)
            tip = base + dirn * (span * jitter)
            # The tip curls further down than the blade — the last hand's width
            # of a leaflet is always hanging.
            tip -= UP * (span * 0.22)
            a = bm.verts.new(T(*(base + tan * w)))
            b = bm.verts.new(T(*(base - tan * w)))
            c = bm.verts.new(T(*(tip - tan * (w * 0.3))))
            d = bm.verts.new(T(*(tip + tan * (w * 0.3))))
            bm.faces.new((a, b, c, d))


def add_crown(bm, crown: Vector, tan: Vector, count: int, length: float, seed: float) -> None:
    """A whorl of fronds, oldest lowest. The elevation runs from nearly straight
    up for the youngest at the middle to below the horizontal for the ones about
    to fall, and the youngest are the shortest — a palm's crown is a fountain
    caught at every stage of one."""
    lean = math.atan2(math.hypot(tan.x, tan.z), tan.y)  # how far off vertical the trunk finished
    for k in range(count):
        age = (k + 0.5) / count
        az = 2 * math.pi * k * 0.618034 + seed          # golden angle: no two fronds in line
        el = math.radians(72.0 - 104.0 * age) + 0.35 * (h(seed + k) - 0.5)
        # And the whole crown tips the way the trunk leans, or a leaning palm
        # grows its fronds out of the side of its own trunk.
        az_bias = math.atan2(tan.z, tan.x)
        el -= lean * 0.55 * math.cos(az - az_bias)
        root = crown - Vector((0.0, 0.12, 0.0))
        ln = length * (0.72 + 0.42 * age) * (0.9 + 0.2 * h(seed + k * 2.3))
        droop = 0.55 + 0.5 * age
        # A frond cannot grow into the sand, and the short palm is the one that
        # tries: its oldest leaves want to hang further below the crown than the
        # crown is off the ground. Both terms that take a tip down are scaled by
        # the same factor, which keeps the arch and moves the tip to the beach
        # rather than under it. The clearance is the rachis's, not the leaf's —
        # the leaflets hang another half metre below the spine they are on.
        drop = (droop - math.sin(el)) * ln
        room = root.y - 0.62
        if drop > room > 0:
            f = room / drop
            droop *= f
            if el < 0:
                el *= f
        frond(bm, root, az, el, ln, droop, seed + k * 11.3)


# -------------------------------------------------------------------- the parts

# height, lean, sway, base radius, top radius, fronds, frond length, nuts
PALMS = [
    (11.6, 0.290, 0.030, 0.30, 0.155, 17, 4.30, 7),   # old, leaning over the water
    (8.9, 0.080, 0.045, 0.27, 0.150, 15, 3.85, 5),    # upright, full crown
    (6.1, 0.330, 0.020, 0.24, 0.140, 12, 3.25, 0),    # young, hard lean, no fruit yet
]


def palm(index: int, spec, seed: float):
    height, lean, sway, base, top, fronds, flen, nuts = spec
    bm = bmesh.new()
    crown, tan = add_trunk(bm, height, lean, sway, base, top)
    if nuts:
        add_nuts(bm, crown, tan, seed, nuts)
    wood = mesh_object(f"bark_palm{index}", bm)

    bm = bmesh.new()
    add_crown(bm, crown, tan, fronds, flen, seed)
    leaf = mesh_object(f"frond_palm{index}", bm)
    return wood, leaf


def fern(seed: float):
    """Undergrowth. Nine blades out of one point, arching — at knee height on a
    beach this is the difference between jungle and a lawn."""
    bm = bmesh.new()
    for k in range(9):
        az = 2 * math.pi * k / 9 + seed
        frond(
            bm,
            Vector((0.0, 0.46, 0.0)),
            az,
            math.radians(58.0 - 26.0 * h(seed + k)),
            1.15 + 0.5 * h(seed + k * 3.1),
            0.5,
            seed + k * 4.7,
            stations=9,
        )
    return mesh_object("bush_fern", bm)


def boulder(seed: float):
    bm = bmesh.new()
    # 0.40 and not 0.62: `lump` flattens its underside at -0.35 of its own
    # radius and that is then scaled, so this is the number that puts the flat
    # bottom on y = 0 — a boulder whose origin is not its footprint is a
    # boulder that floats, thirty metres up a hillside, in every instance.
    lump(bm, (0.0, 0.40, 0.0), (1.35, 0.78, 1.15), seed, subdiv=2)
    return mesh_object("rock_boulder", bm)


def build() -> None:
    start()
    made = []
    for i, spec in enumerate(PALMS):
        wood, leaf = palm(i, spec, 3.7 + i * 5.1)
        # Laid out in a row for whoever opens the .blend to sculpt. The mesh
        # data stays at its own origin — this is the object's transform, and
        # glTF keeps it on the node, so `Isle.tsx` instances geometry that is
        # still standing at (0, 0, 0).
        for o in (wood, leaf):
            o.location = T(i * 9.0, 0.0, 0.0)
        finish(wood, 46)
        finish(leaf, 180)  # a leaflet is one flat quad; splitting its normals gains nothing
        made += [wood, leaf]

    f = fern(1.9)
    f.location = T(27.0, 0.0, 0.0)
    finish(f, 180)

    r = boulder(6.3)
    r.location = T(30.5, 0.0, 0.0)
    # 62 and not the 34 the landmarks use: a boulder is a lump, and an edge
    # split at a landmark's angle turns it into a cut gemstone.
    finish(r, 62)

    export("palm", BOX, GLB, BLEND, tris_max=TRIS_MAX)


if __name__ == "__main__":
    build()
    if "--render" in sys.argv:
        out = sys.argv[sys.argv.index("--render") + 1]
        preview(out, {
            "front": ((0.0, 6.0, 30.0), (13.0, 5.5, 0.0)),
            "crown": ((6.0, 14.5, 12.0), (2.0, 9.5, 0.0)),
            "foot": ((3.2, 1.1, 6.5), (0.4, 3.0, 0.0)),
        }, ortho_scale=30.0, ground=60.0)
