"""
The ramp and the giant camera — Memojo's landmark. The fourth one.

    python3 tools/memojo.py                    # tools/memojo.blend + src/models/memojo.glb
    python3 tools/memojo.py --render out.png   # ...and three preview views

Why this shape. Memojo finds the photograph nobody was going to find — you
remember "her laughing in the garden" and the phone finds it, on the phone,
without sending anything anywhere. So the landmark is the only thing in this
world that is *watching*: a kicker the rider goes up and leaves by, and a
camera the size of a house standing past the end of it. He does not press
anything. He goes off the lip and the shutter goes, which is the app — and a
print comes out of the slot under the body, which is the photograph the app
found for you.

Where the two stand moved with the print. The ramp is out at the near edge of
the plateau, so the rider comes off the beach onto the deck; the camera is past
the lip and out to his right, looking back across the arc rather than along it,
so it is out of the flight line and it gets his face rather than his back. Both
`RAMPS.ramp` and `LENSES.ramp` in `src/plateau.ts` say so first — this file is
the picture of those numbers.

The one thing here that is not free-hand: **the deck is the collision.**
`RAMPS.ramp` in `src/plateau.ts` is what the surfboard rides, and `RUN` below
is the same profile in Python. They are two files and one shape, so
`plateau.check.ts` reads this .glb back and asserts the deck's own vertices sit
on `deckAt` to a millimetre at every station. Change either side alone and the
check fails, which is the only reason it is safe to write the numbers twice.

Shared plumbing, the coordinate convention and the export are in `landmark.py`.
"""

from __future__ import annotations

import math
import sys

from landmark import (
    T, add_box, add_cyl, add_prism, add_slab, export, finish, mesh_object,
    preview, start, strut,
)
import bpy
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------- the contract
# src/content/projects/memojo.en.mdx, frontmatter `size`. `Landmarks.tsx`
# asserts the same box again in the browser.
BOX = (6.2, 3.2, 7.2)

# ------------------------------------------------------------------- the run
# `RAMPS.ramp` in src/plateau.ts, to the number. The slope comes on over the
# first `EASE` of the run and is constant after it: a curve where the board
# meets the deck, a straight line where it leaves. A smoothstep would be flat
# at the lip too, and a lip with no slope on it is a ledge, not a ramp.
RUN_X, RUN_HALF = -1.05, 1.15
FOOT, LIP, RISE, EASE = 4.1, 0.2, 1.55, 0.28
# Stations along the run. The check samples these exact z values, so this is
# `STATIONS` there as well.
STATIONS = 24


def run_at(t: float) -> float:
    """Height of the run at `t` along it, 0 at the foot and 1 at the lip —
    `runAt` in src/plateau.ts."""
    return (t * t / (2 * EASE) if t <= EASE else t - EASE / 2) / (1 - EASE / 2)


def deck(k: int) -> tuple[float, float]:
    """Station `k`: its z, and the deck's height there."""
    t = k / STATIONS
    return FOOT + (LIP - FOOT) * t, RISE * run_at(t)


# ------------------------------------------------------------------ the lens
# `LENSES.ramp` in src/plateau.ts. Everything about the camera is measured back
# along this axis, so aiming it somewhere else moves the whole machine instead
# of needing a second set of numbers.
LENS = Vector((1.45, 2.45, -2.20))
AIM = Vector((-0.9416, 0.3013, -0.1506)).normalized()
YAW = math.atan2(-AIM.x, -AIM.z)
PITCH = math.asin(AIM.y)


def back(d: float) -> tuple[float, float, float]:
    """A point `d` back down the lens's axis, in three-space."""
    p = LENS - AIM * d
    return (p.x, p.y, p.z)


BODY = back(1.55)
HIP = (BODY[0], BODY[1] - 0.72, BODY[2])  # where the tripod takes the weight

# The body's own frame, which is where the slot is measured from: `AIM` is its
# forward, `RIGHT` the horizontal across it, `UP` the third. The box is
# 1.5 x 1.32 x 1.24 in that frame, so its front-bottom edge — the lowest point
# of the face the lens is in, and the one point on the machine with nothing but
# air under it — is the middle of the mouth the paper comes out of.
RIGHT = Vector((-AIM.z, 0.0, AIM.x)).normalized()
UP = RIGHT.cross(AIM).normalized()
SLOT = Vector(BODY) + AIM * 0.62 - UP * 0.66
# `PRINTS.ramp` in src/plateau.ts, to the number: the card hangs from here and
# `plateau.check.ts` reads this mesh back out of the .glb to say so.
SLOT_W = 0.92

GLB = "src/models/memojo.glb"
BLEND = "tools/memojo.blend"

VIEWS = {
    # From the water, the way the rider arrives: the foot of the run nearest,
    # the machine standing past the lip and off to the right of it.
    "approach": ((2.0, 5.4, 13.5), (0.5, 1.3, 0.6)),
    # And from the other quarter, which is the side the deck is open on.
    "quarter": ((-9.0, 5.2, 5.6), (0.6, 1.6, -0.2)),
    # Orthographic, from where the rider is when the shutter goes: what the
    # machine — and the slot under it — look like to the man being photographed.
    "front": ((-6.6, 3.0, -2.6), (2.4, 1.7, -2.0)),
}


# ------------------------------------------------------------------ the ramp


def ramp() -> bpy.types.Object:
    """The kicker: one solid, extruded across the run's width from a profile
    that is the deck curve itself. A prism rather than a stack of boxes because
    the top of it is the thing a board is on — a stepped approximation of a
    ramp is a stepped ramp, and the board would feel every one of them."""
    ring = []
    for k in range(STATIONS + 1):
        z, y = deck(k)
        ring.append((y, z))
    # Down the back of the lip and along the ground, back to the foot.
    ring.append((0.0, LIP))
    profile = []
    for x in (RUN_X - RUN_HALF, RUN_X + RUN_HALF):
        profile += [T(x, y, z) for (y, z) in ring]
    bm = bmesh.new()
    add_prism(bm, profile)
    obj = mesh_object("frame_deck", bm)
    finish(obj, 38.0)
    return obj


def cheeks() -> bpy.types.Object:
    """What a ramp is made of, on the outside of it: a kerb down each edge and
    the ribs under them. Nothing structural — the prism is the structure — but
    a smooth wedge reads as a wedge, and this reads as something built."""
    bm = bmesh.new()
    for s in (-1, 1):
        x = RUN_X + s * (RUN_HALF + 0.05)
        for k in range(STATIONS):
            z0, y0 = deck(k)
            z1, y1 = deck(k + 1)
            add_box(bm, strut((x, y0 + 0.09, z0), (x, y1 + 0.09, z1), 0.13))
    # Ribs, on the run's own stations so they follow the curve.
    for k in range(2, STATIONS, 4):
        z, y = deck(k)
        for s in (-1, 1):
            # Proud of the cheek by 3 cm: a rib whose face is exactly the
            # deck's face is two coplanar faces, which is a speckled seam in
            # every renderer that has ever existed.
            rx = RUN_X + s * (RUN_HALF + 0.03)
            add_box(bm, strut((rx, 0.0, z), (rx, y, z), 0.12))
    obj = mesh_object("frame_rib", bm)
    finish(obj, 38.0)
    return obj


def lip_edge() -> bpy.types.Object:
    """The lip, in the dark material: the one line on this island that says
    where the deck stops, which is the line the whole landmark is about."""
    bm = bmesh.new()
    z, y = deck(STATIONS)
    add_slab(bm, (RUN_X, y - 0.03, z + 0.09), (RUN_HALF * 2 + 0.04, 0.08, 0.2), rx=-math.atan2(RISE, FOOT - LIP))
    obj = mesh_object("dark_lip", bm)
    finish(obj, 38.0)
    return obj


# ---------------------------------------------------------------- the camera


def body() -> bpy.types.Object:
    """The box. Big enough to read as a machine from the water, and turned on
    the lens's own axis so the back of it faces away from the ramp."""
    bm = bmesh.new()
    add_slab(bm, BODY, (1.5, 1.32, 1.24), rx=PITCH, ry=YAW)
    # The plate the barrel is bolted to, and the back.
    add_slab(bm, back(0.95), (1.18, 1.06, 0.12), rx=PITCH, ry=YAW)
    add_slab(bm, back(2.18), (1.3, 1.14, 0.1), rx=PITCH, ry=YAW)
    obj = mesh_object("dark_body", bm)
    finish(obj, 38.0)
    return obj


def barrel() -> bpy.types.Object:
    """The lens's own housing, the hood in front of it, and the two knobs that
    make a camera a camera rather than a box with a pipe in it."""
    bm = bmesh.new()
    add_cyl(bm, back(1.02), back(0.16), 0.40, segments=20)
    add_cyl(bm, back(0.30), back(0.24), 0.47, segments=20)  # the focus ring
    add_cyl(bm, back(0.16), back(0.02), 0.50, segments=20)  # the hood
    # A film crank on one side and a release on top, both on the body's axis.
    side = Vector((math.cos(YAW), 0.0, -math.sin(YAW)))
    hub = Vector(BODY) + side * 0.74
    add_cyl(bm, (hub.x, hub.y + 0.2, hub.z), (hub.x + side.x * 0.16, hub.y + 0.2, hub.z + side.z * 0.16), 0.2)
    add_cyl(bm, (BODY[0], BODY[1] + 0.66, BODY[2]), (BODY[0], BODY[1] + 0.84, BODY[2]), 0.11)
    obj = mesh_object("frame_barrel", bm)
    finish(obj, 38.0)
    return obj


def lens() -> bpy.types.Object:
    """The glass, and it is the only thing in this world that is ever a light
    source: `Landmarks.tsx` gives it an emissive that is zero until the shutter
    fires, and `Post` blooms the emissive buffer at threshold zero."""
    bm = bmesh.new()
    add_cyl(bm, back(0.10), back(0.05), 0.42, segments=24)
    obj = mesh_object("glass_lens", bm)
    finish(obj, 38.0)
    return obj


def finder() -> bpy.types.Object:
    """The viewfinder hump, which is what tells you which way a camera looks
    from behind — the side the visitor sees it from on the way in."""
    bm = bmesh.new()
    add_slab(bm, (BODY[0], BODY[1] + 0.82, BODY[2]), (0.66, 0.36, 0.54), rx=PITCH, ry=YAW)
    add_slab(bm, back(0.88), (0.3, 0.22, 0.08), rx=PITCH, ry=YAW)
    obj = mesh_object("panel_finder", bm)
    finish(obj, 38.0)
    return obj


def slot() -> bpy.types.Object:
    """The mouth. A dark letterbox let into the body's front-bottom edge, wide
    enough that the card clears it — and the only part of the printing that is
    in this file, because the card moves and what is on it is a photograph that
    did not exist when the model was written. `Shutter.tsx` hangs it here."""
    bm = bmesh.new()
    add_slab(bm, (SLOT.x, SLOT.y, SLOT.z), (SLOT_W, 0.11, 0.17), rx=PITCH, ry=YAW)
    obj = mesh_object("dark_slot", bm)
    finish(obj, 38.0)
    return obj


def rollers() -> bpy.types.Object:
    """And what feeds it: two rollers across the mouth, proud of it by a
    centimetre. They are the only reason the slot reads as a thing paper comes
    out of rather than a slot cut in a box."""
    bm = bmesh.new()
    half = RIGHT * (SLOT_W / 2 - 0.03)
    for s in (-1, 1):
        c = SLOT + AIM * 0.045 + UP * (0.055 * s)
        add_cyl(bm, tuple(c - half), tuple(c + half), 0.035, segments=10)
    obj = mesh_object("frame_roller", bm)
    finish(obj, 38.0)
    return obj


def tripod() -> bpy.types.Object:
    """Three legs and the head they meet at — and the only part of this
    landmark a board can hit. `WALLED.ramp` in `src/plateau.ts` reads the wall
    off exactly this mesh's name, which is why all of it is one object: the
    convex hull of three legs is a triangle, and a triangle round the ramp's
    own deck would have made the island unridable."""
    bm = bmesh.new()
    add_cyl(bm, HIP, (BODY[0], BODY[1] - 0.1, BODY[2]), 0.22, segments=12)
    for k in range(3):
        a = (k / 3) * math.tau + 0.5
        toe = (HIP[0] + math.cos(a) * 0.86, 0.0, HIP[2] + math.sin(a) * 0.86)
        add_box(bm, strut(HIP, toe, 0.15))
        # A foot, so a leg stands on the grass instead of ending in it.
        add_cyl(bm, (toe[0], 0.0, toe[2]), (toe[0], 0.1, toe[2]), 0.17, segments=10)
        # And a brace, a third of the way down, to the next leg.
        b = ((k + 1) / 3) * math.tau + 0.5
        nxt = (HIP[0] + math.cos(b) * 0.86, 0.0, HIP[2] + math.sin(b) * 0.86)
        mid = lambda p: (HIP[0] + (p[0] - HIP[0]) * 0.55, HIP[1] * 0.45, HIP[2] + (p[2] - HIP[2]) * 0.55)
        add_box(bm, strut(mid(toe), mid(nxt), 0.09))
    obj = mesh_object("frame_tripod", bm)
    finish(obj, 38.0)
    return obj


def build() -> None:
    start()
    parts = [ramp(), cheeks(), lip_edge(), body(), barrel(), lens(), finder(), tripod(),
             slot(), rollers()]
    # Joined in pairs only where they share a material and a name: the export
    # keeps one object per mesh name, and `WALLED` and `matFor` both read those
    # names, so nothing here is merged for tidiness.
    assert len({p.name for p in parts}) == len(parts), "two meshes with one name"
    export("memojo", BOX, GLB, BLEND)


if __name__ == "__main__":
    build()
    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1], VIEWS, ortho_scale=7.0)
