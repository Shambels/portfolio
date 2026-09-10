"""
The rider — the surfer's third craft grew a person on it. Phase 4½.

    python3 tools/surfer.py                    # tools/surfer.blend + src/models/surfer.glb
    python3 tools/surfer.py --render out.png   # ...and four preview views
    python3 tools/surfer.py --render out.png --flex   # ...of a stress pose

CLAUDE.md asks for a reason before a character gets a model file, and this is
it: the rider is a *body*, and the procedural one was eleven cylinders and eight
spheres pretending to be one. Every other craft in this world is a hull — a
solid of revolution with things bolted to it, which is exactly what code is good
at. A person is a single skin over a skeleton, and the seam where a cylinder
arm meets a sphere shoulder is the one thing no amount of arithmetic in
`Ship.tsx` was going to close.

So the skin is a metaball field: capsules and ellipsoids laid along the pose,
converted to a mesh. Joints are *blends*, not spheres covering a corner. The
pose is still one list of points — same as the procedural rider's, moved rather
than rewritten — so the crouch stays editable without touching geometry.

Three things changed when the first pass was held up against the reference and
did not look like it.

*Muscle, and the lack of it.* A field of plain capsules is a balloon animal:
every limb is a tube of one radius and the torso is a bollard. The volumes that
actually tell you a body is a body — deltoid, pec, lat, glute, quad, calf — are
laid on here as their own elements, and the ones that read by being *absent*
(the waist, the armpit, the line under the jaw, the grooves between fingers)
are carved with negative elements, which cost the same and are the only way a
metaball field gets a concavity at all.

*Topology.* Marching cubes gives a triangle soup whose density has nothing to
do with the shape, and decimating it to budget spends the same triangles on a
flat back as on a knuckle. `retopo()` runs Quadriflow instead: all quads,
following the form, edge loops where the surface bends. Same budget, a
silhouette that survives being small.

*Crisp colour.* COLOR_0 lived on the POINT domain and every band was a ramp,
because a hard threshold between two vertices 1.5 cm apart is a zigzag. This
carries colour on the CORNER domain and paints whole faces: a face is one
colour, the boundary is the edge between two faces, and the exporter splits the
verts that need splitting while the normals stay smooth. Neon with an edge on
it, on the same mesh, for about six hundred extra vertices.

*And then he moved.* The skin was the hard half and it was done, and what was
left was that a rider welded to his board reads as a figurine of a surfer
rather than a surfer — the sea under him moves, the board banks, and the man on
it holds one crouch through all of it. So the pose list below gets a second
reading, as an armature, and `Ship.tsx` bends it from the physics that is
already moving the board. The rest pose *is* the sculpted pose: the runtime
writes rotations relative to it, so a rider with no input is the model that
shipped before the bones existed, to the vertex.

The other half of the reason for a model file at all is that colour. The rider
wears a wetsuit that is not one colour, and the landmark pipeline (geometry
only, material by name prefix) has no way to say "magenta ribbon across a black
panel" without either a texture or twenty meshes. This file bakes it into
COLOR_0 instead: one attribute, one material in `Ship.tsx`, and the suit's
ribbons, the beard, the eyes and the smile are all the same mechanism. It is the
only model in the world that carries its own colour, and it says so here so the
landmark rule stays true.

Coordinates are three.js space and board space: +z is the nose, x is across the
deck, y is measured from the waterline, and the deck under the feet is at 0.08 —
the same numbers `Ship.tsx` builds the board with. Blender's Z-up is restored on
export.
"""

from __future__ import annotations

import math
import sys

import bpy  # noqa: I001 — bpy first: it is what puts bmesh and mathutils on the path
import bmesh
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from landmark import T  # noqa: E402 — the one shared thing a character needs

GLB = "src/models/surfer.glb"
BLEND = "tools/surfer.blend"

# Four views, and the odd one out is `astern`: it is the only angle the visitor
# ever actually gets, so it is the one that decides whether the pose reads. The
# other three are for judging the thing as a model.
VIEWS = {
    "astern": ((0.35, 1.35, -3.4), (0.0, 0.72, 0.0)),
    "front": ((0.1, 1.15, 3.2), (0.0, 0.78, 0.1)),
    "quarter": ((2.5, 1.6, 2.3), (0.0, 0.72, 0.05)),
    "face": ((0.55, 1.32, 1.15), (0.06, 1.16, 0.2)),
}

# Raised from 20k when the rider got his second pass — the anatomy, the curls
# and the seams below all live or die at the quad size, and a 1.3 cm quad grid
# cannot hold an 8 mm seam. CLAUDE.md's 25k is a *landmark* budget, and the
# rider is the one model in the world that is looked at rather than walked past;
# Seb raised it for him. Still one draw call, drawn twice for the outline.
TRIS_MAX = 38_000

# What Quadriflow is asked for. Quads, so the triangle cost is twice this. The
# hair gets its own grid now rather than a decimate: since the scalp cap under
# the curls, it is one shell and not a cloud, and the thing that made a quad
# grid wrong for it — bridging the gaps between separate curls — has no gaps to
# bridge.
BODY_QUADS = 8_500
HAIR_QUADS = 2_300

# See `retopo`. Quadriflow's manifold test is in absolute units and a rider a
# metre and a bit tall falls under it.
RETOPO_SCALE = 10.0
# And the voxel pass that feeds it. This is set by the *gap* between two
# fingers and not by a finger, which is the mistake the first pass made: at 11
# mm it matched the fingers nicely and closed the 10 mm slots between them, and
# a hand with its gaps filled in is a club. The metaball field has the fingers —
# rendering the raw conversion shows all three and a thumb — so anything lost
# after it is lost here. 7 mm puts a voxel and a half in each slot.
VOXEL = 0.007

# ------------------------------------------------------------------- the pose
# Board space. Deck at 0.08, nose at +z. One list, so deepening the crouch is
# moving points rather than editing thirty elements — the same contract the
# procedural rider had, and the reason `bone()` takes two points.
P3 = tuple[float, float, float]

# The two knees are the one pair of points in this pose that were not chosen —
# they were measured, after the fact, from what the legs could not do.
#
# The rider shipped with **legs of two different lengths.** The front one ran a
# 0.498 thigh on a 0.287 shin, 0.785 of reach; the back one a *0.238* thigh on a
# 0.273 shin, 0.511. The back thigh was a shade under half the front. Nothing on
# a board ever straightens either leg, so it never showed — not in a render, not
# in `--flex`, and not in the rig's own rest-pose assert, which only ever checks
# that the solver reproduces whatever is written here.
#
# What showed it was walking. Two legs of different lengths have no hip height in
# common: raise the pelvis until the long one straightens and the short one
# cannot reach the ground, lower it until the short one has stride to spend and
# the long one is folded to 57% and the man is walking on his knees. There is no
# tuning out of that, in `Ship.tsx` or anywhere else, because it is not a pose
# problem. It is a skeleton problem.
#
# So both legs are one anatomy now: **a 0.43 thigh on a 0.25 shin, 0.68 of
# reach**, in the front leg's own 63/37 proportions. The length is set by what a
# walk needs rather than by either leg's history — hips 16 cm up out of this
# crouch, a 76 cm step, and both legs cycling between 88% of their reach at
# mid-stance and 96% at the end of a stride, which is what a leg does. Both
# ankles, both hips and every other point in this file are untouched: only the
# knees moved, onto the circle those bone lengths put them on, along the
# direction each knee was already pointing.
#
# **It changes the stance on the board, and that is not a side effect to hide.**
# The front leg goes from 68% of its reach to 78% — a little straighter. The back
# leg goes from 87% to 65% — a good deal more bent, its knee 10 cm further
# outboard and 14 cm lower, out over the rail. A surfer's back leg *is* the bent
# one, so this is the more honest stance as well as the workable one, but it is a
# change to a silhouette that was reviewed. `docs/STATUS.md` has the argument.
FOOT_F: P3 = (0.05, 0.14, 0.42)
ANKLE_F: P3 = (0.08, 0.20, 0.40)
KNEE_F: P3 = (0.248, 0.384, 0.383)
HIP_F: P3 = (0.10, 0.58, 0.03)
FOOT_B: P3 = (-0.05, 0.14, -0.30)
ANKLE_B: P3 = (-0.07, 0.20, -0.28)
KNEE_B: P3 = (-0.307, 0.279, -0.288)
HIP_B: P3 = (-0.10, 0.60, -0.09)

PELVIS: P3 = (0.0, 0.60, -0.03)
WAIST: P3 = (0.02, 0.74, 0.02)
CHEST: P3 = (0.06, 0.92, 0.11)
NECK: P3 = (0.07, 1.04, 0.15)
HEAD: P3 = (0.08, 1.17, 0.19)

# Arms down, and this is the second pose the file has had. The first put them
# out wide — the leading one low over the rail, the trailing one high — which is
# a *photograph* of a surfer: the frame a photographer waits for, held forever.
# Rigged and in motion it read as a man stuck mid-gesture, because that is what
# it was. A rider between turns has his hands low and near him, and raising one
# is then something that happens rather than something he is doing already.
#
# The constraint that shapes them is the crouch. Both thighs are folded up and
# forward, so an arm that simply hangs runs straight through one: both elbows
# sit well outboard of the knees, and the clearance is not generous — about five
# centimetres of field at the leading elbow — so anything that brings these
# points inboard will weld an arm to a thigh.
#
# **Both elbows fold forward.** An elbow has one direction and this is it: the
# forearm swings toward the front of the body, never behind the line of the
# upper arm. The first arms-down pass sent the trailing forearm aft — it was
# aiming the hand past the back knee, which is where a trailing hand belongs —
# and the result was a joint bending the wrong way, which is the one anatomical
# error a viewer spots without knowing why. It comes forward instead, down past
# the hip and just ahead of it, at about fifty degrees off straight. The leading
# arm was already right at sixty.
#
# It costs the silhouette. Hands at |x| 0.46-0.49 rather than 0.70-0.78 take the
# figure from 1.39 units across to about 1.0, and the old note here was right
# that a body this size head-on is a post. The answer is no longer width held
# permanently; it is `ride()` in `Ship.tsx` throwing one arm up on every change
# of direction.
SHOULDER_F: P3 = (0.22, 0.92, 0.16)
ELBOW_F: P3 = (0.46, 0.62, 0.28)
WRIST_F: P3 = (0.46, 0.532, 0.560)
HAND_F: P3 = (0.46, 0.497, 0.672)
SHOULDER_B: P3 = (-0.09, 0.94, 0.04)
ELBOW_B: P3 = (-0.352, 0.663, -0.029)
WRIST_B: P3 = (-0.453, 0.418, 0.141)
HAND_B: P3 = (-0.489, 0.330, 0.202)

# Where the face points. Forward and a shade to his open side, which is the only
# way any of the face survives a camera that sits astern and never yaws.
GAZE = Vector((0.30, 0.06, 1.0)).normalized()
RIGHT = GAZE.cross(Vector((0, 1, 0))).normalized()
HEAD_UP = RIGHT.cross(GAZE).normalized()

# The chest is not the head: it is turned less far into the wave than the face
# is, which is what makes the twist through the waist read as a twist rather
# than as one rigid plank rotated. Every volume bolted to the torso — pec, lat,
# deltoid, trapezius — is placed on this frame rather than on the world's.
TORSO_F = Vector((0.16, 0.0, 1.0)).normalized()
TORSO_R = TORSO_F.cross(Vector((0, 1, 0))).normalized()

# --------------------------------------------------------------- the skeleton
# The pose, read a second time. Nothing here invents an anatomy: every bone is
# two points that were already up there, in the order the metaballs were laid
# along them, so deepening the crouch is still moving a point and the rig
# follows it rather than having to be moved after it.
#
# Three points the skin never needed, because a bone has to end somewhere and a
# head and two feet had no tail in the list. The toes are 14 cm forward of the
# ankle, which is where the foot blob's own half-extent puts them.
HEAD_TOP: P3 = tuple(Vector(HEAD) + HEAD_UP * 0.16)
TOE_F: P3 = (FOOT_F[0], FOOT_F[1], FOOT_F[2] + 0.14)
TOE_B: P3 = (FOOT_B[0], FOOT_B[1], FOOT_B[2] + 0.14)

# name, parent, head, tail. Seventeen, and the count is the argument: it is one
# bone per joint the pose already had, and not one more. There is no clavicle,
# no twist bone in the forearm and no toe — a figure whose whole screen presence
# is 90 pixels of back does not spend a joint on a collarbone.
#
# `armF_upper` and not `arm.L`: these two arms are not a mirrored pair — the
# leading one is down over the rail and the trailing one is high and back — and
# naming them as one invites every symmetry operator in Blender to make them
# one.
#
# Runtime reads these names. `Ship.tsx` looks each one up once at load and
# keeps the reference, so a rename here is a rename there.
BONES: tuple[tuple[str, str | None, P3, P3], ...] = (
    ("hips", None, PELVIS, WAIST),
    ("spine", "hips", WAIST, CHEST),
    ("chest", "spine", CHEST, NECK),
    ("neck", "chest", NECK, HEAD),
    ("head", "neck", HEAD, HEAD_TOP),
    # Both arms hang off `chest` and neither is connected to it: a shoulder is
    # not where the chest bone ends, and a connected bone is dragged to its
    # parent's tail whatever its head says.
    ("armF_upper", "chest", SHOULDER_F, ELBOW_F),
    ("armF_fore", "armF_upper", ELBOW_F, WRIST_F),
    ("armF_hand", "armF_fore", WRIST_F, HAND_F),
    ("armB_upper", "chest", SHOULDER_B, ELBOW_B),
    ("armB_fore", "armB_upper", ELBOW_B, WRIST_B),
    ("armB_hand", "armB_fore", WRIST_B, HAND_B),
    # And the legs off `hips`, for the same reason: the hips bone runs from the
    # pelvis up to the waist, and a hip joint is at neither end of it.
    ("legF_thigh", "hips", HIP_F, KNEE_F),
    ("legF_shin", "legF_thigh", KNEE_F, ANKLE_F),
    ("legF_foot", "legF_shin", ANKLE_F, TOE_F),
    ("legB_thigh", "hips", HIP_B, KNEE_B),
    ("legB_shin", "legB_thigh", KNEE_B, ANKLE_B),
    ("legB_foot", "legB_shin", ANKLE_B, TOE_B),
)

# ------------------------------------------------------------------- the skin
# A metaball's `radius` is where its influence dies, not where the surface is:
# at the default stiffness of 2 the surface of a lone ball sits at 0.574 of it,
# measured. Everything below is written in real radii and converted here, so the
# numbers in the pose read as centimetres of arm.
ISO = 0.574
STIFF = 2.0

_body: bpy.types.Metaball
_hair: bpy.types.Metaball


def V(p) -> Vector:
    """A pose point as a vector, whether it arrived as a tuple or already as
    one. Half the anatomy below is written as `V(CHEST) + TORSO_F * 0.06`, and
    the alternative is a `Vector(...)` around every constant in the file."""
    return p if isinstance(p, Vector) else Vector(p)


def _el(mb, kind: str, at, r: float, neg: bool = False):
    e = mb.elements.new(type=kind)
    e.co = T(*at) if isinstance(at, tuple) else at
    e.radius = r / ISO
    e.stiffness = STIFF
    e.use_negative = neg
    return e


def ball(at, r: float, mb=None, neg: bool = False) -> None:
    _el(mb or _body, "BALL", tuple(V(at)), r, neg)


def bone(a: P3, b: P3, r: float, mb=None) -> None:
    """A limb: a capsule from a to b. `size_x` is the half-length of the
    cylindrical part and the caps are the radius, so the element spans the two
    points exactly — which is what makes the pose list mean what it says."""
    va, vb = T(*a), T(*b)
    d = vb - va
    half = max(d.length / 2 - r, 1e-4)
    e = _el(mb or _body, "CAPSULE", (va + vb) / 2, r)
    e.size_x = half
    q = Quaternion() if d.length < 1e-9 else Vector((1, 0, 0)).rotation_difference(d.normalized())
    e.rotation = q


def blob(at, size: P3, mb=None, neg: bool = False) -> None:
    """An ellipsoid — a chest, a pelvis, a foot. `size` is the half-extent in
    three-space (x across the deck, y up, z along it).

    A capsule's `size_x` is a length in object units and an ellipsoid's sizes
    are *multipliers on its radius* — measured, not documented — so the two
    helpers convert differently and both take real centimetres."""
    hx, hy, hz = size
    r = max(size)
    e = _el(mb or _body, "ELLIPSOID", tuple(V(at)), r, neg)
    # Blender's y is three's -z and its z is three's y.
    e.size_x, e.size_y, e.size_z = hx / r, hz / r, hy / r


def taper(a, b, r0: float, r1: float, n: int = 7, mb=None, neg: bool = False) -> None:
    """A limb that thins toward the extremity. Metaballs have no taper, so it is
    n balls down the line — which blends into one smooth cone and costs nothing
    the resolution was not going to spend anyway."""
    va, vb = V(a), V(b)
    for i in range(n + 1):
        t = i / n
        p = va.lerp(vb, t)
        ball(p, r0 + (r1 - r0) * t, mb, neg)


def bulge(at, along: Vector, half: float, r: float, mb=None, neg: bool = False) -> None:
    """A muscle: a short spindle centred on `at`, running `half` metres each way
    along `along`, `r` thick at its belly and tapering to nothing at its ends.

    An oriented ellipsoid would do the same thing in one element, but a metaball
    ellipsoid takes its sizes as multipliers on a radius in its own rotated
    frame, and a file that already says `taper` for "several balls down a line"
    does not need a second, quaternion-shaped way of saying it. Five balls with
    a cosine profile blend into a belly with ends that die into the limb, which
    is the shape a deltoid actually is."""
    c = V(at)
    d = along.normalized()
    n = 5
    for i in range(n):
        t = (i / (n - 1)) * 2 - 1  # -1 to 1
        ball(c + d * (half * t), r * math.cos(t * 1.02), mb, neg)


# -------------------------------------------------------------------- the face
# Eyes, brows and a mouth are geometry and not paint. A vertex colour can only
# be as sharp as the mesh under it, and the skin around the eyes is a centimetre
# a vertex — the first pass drew two white stars and a smear. Five ellipsoids
# set into the face cost 900 triangles and are crisp at any distance, which is
# also how every low-poly character since 1998 has done it.
FACE_PARTS: list[tuple[bpy.types.Object, "Vector"]] = []


def face_part(skin: bpy.types.Object, name: str, colour: Vector, aim: P3, size: P3,
              sink: float = 0.008) -> None:
    """One feature, aimed rather than positioned: `aim` is a direction in the
    head's frame (across, up, forward) and the feature is set on the skin where
    a ray from the head centre along it comes out, `sink` metres under the
    surface. Guessing the depth instead — which is what the first pass did —
    put the smile inside the jaw, because a head with a jaw hung off the front
    of it is not a sphere and its surface is not at a radius you can write down.

    `size` is the semi-axes in the same frame, so an eye is wider than it is
    tall because it says so."""
    d = (RIGHT * aim[0] + HEAD_UP * aim[1] + GAZE * aim[2]).normalized()
    stud(skin, name, colour, V(HEAD), d, size, (RIGHT, HEAD_UP, GAZE), sink)


def stud(skin: bpy.types.Object, name: str, colour: Vector, origin: Vector, toward: Vector,
         size: P3, frame: tuple[Vector, Vector, Vector], sink: float = 0.0,
         lift: Vector | None = None) -> None:
    """The mechanism under `face_part`, and since the second pass the zip's
    too: an ellipsoid set on the skin where a ray from `origin` along `toward`
    comes out of it, `sink` metres under the surface and `lift` off it, with
    its three semi-axes along `frame`. Anything small that has to sit *on* a
    surface whose radius nobody can write down goes through here."""
    d = toward.normalized()
    hit, loc, *_ = skin.ray_cast(T(*origin), T(*d))
    assert hit, f"{name}: no skin along {toward}"
    surface = Vector((loc.x, loc.z, -loc.y))  # Blender back to three
    centre = surface - d * sink + (lift or Vector((0, 0, 0)))
    basis = Matrix((T(*frame[0]), T(*frame[1]), T(*frame[2]))).transposed().to_4x4()
    m = (Matrix.Translation(T(*centre)) @ basis
         @ Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0))))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0, matrix=m)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    FACE_PARTS.append((ob, colour))


# ------------------------------------------------------------------ the colour
# sRGB in, linear out: COLOR_0 is linear by the glTF spec and three multiplies
# it straight into the base colour, so the conversion belongs here rather than
# in a shader that would have to do it per fragment.
def srgb(hexcode: str) -> Vector:
    h = hexcode.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return Vector(out)


SKIN = srgb("#c98a5c")
SUIT = srgb("#12151d")      # the black the neon sits on
SUIT_2 = srgb("#1d2740")    # the blue-black panel, so the suit is not one flat void
NEON_PINK = srgb("#ff2d95")
NEON_LIME = srgb("#a4ea27")
NEON_CYAN = srgb("#1fc8dc")
NEON_BLUE = srgb("#2f6bff")
HAIR = srgb("#1c1310")
BEARD = srgb("#5c3b25")   # stubble over a tan, not a mask
LIP = srgb("#9c5240")
TOOTH = srgb("#f4efe4")
EYE = srgb("#181110")
SCLERA = srgb("#efe9dc")

# The suit's construction, which is the second pass's whole addition to the
# colour: a wetsuit is not a body painted black, it is panels of neoprene sewn
# together, and what tells you that at a glance is the stitching. Flatlock
# seams are 8 mm wide and a shade lighter than the rubber; the knee pads are a
# textured panel a step up from the suit; the back zip is metal.
SEAM = srgb("#454b59")
PAD = srgb("#1b1f27")
ZIP = srgb("#7c8494")
STITCH = 0.008

# Wide black, narrow neon, and now with an edge on it. The bands are steps and
# not ramps: `paint()` colours whole faces on the CORNER domain, so a boundary
# is the edge between two faces and a hard threshold is exactly what is wanted.
# The ramps the first pass used existed only to hide a zigzag that this domain
# does not produce.
#
# Two colours a band, because the same four stripes carried all the way round a
# body read as a barber's pole. `seam` below picks the column, so the suit has a
# lime flank and a cyan one.
# The neon is at the *zero crossing* of the wave and not at its crest, and that
# is the whole trick. A sine is stationary at ±1, so a band defined as "the last
# fifth of the range" covers however much of the body happens to be near a
# crest — which came out as a cyan slab over one shoulder and a whole arm.
# Around zero the same wave is at its steepest and its gradient is nearly
# constant, so a band of a given width in `w` is a ribbon of a given width in
# centimetres, wherever on the body it lands.
#
# And each ribbon is *inked*: a 0.03 band of the suit's own black on either
# side, which at the wave's gradient of about five per metre is a 6 mm line.
# That is the seam a sewn-in panel has, and it is what separates a pink ribbon
# from the lime one beside it — two neons butted together read as one printed
# stripe, two neons with a stitched edge between them read as two panels.
BANDS = (
    (-1.00, SUIT, SUIT),
    (-0.32, SUIT_2, SUIT_2),
    (-0.235, SUIT, SUIT),
    (-0.205, NEON_PINK, NEON_BLUE),
    (-0.075, SUIT, SUIT),
    (-0.045, NEON_LIME, NEON_CYAN),
    (0.085, SUIT, SUIT),
    (0.115, SUIT_2, SUIT_2),
    (0.20, SUIT, SUIT),
)


def suit_colour(p: Vector) -> Vector:
    """The wetsuit's ribbons. One scalar field, sampled per face: a wave that
    wraps the body diagonally, warped along its own length so the bands curl the
    way the panels on a real suit do rather than reading as a barber's pole.

    Low frequencies, and that is the correction the reference forced. At the
    first pass's numbers the wave went round the body four times and what came
    out was a harlequin: neon over half the surface, no black left to sit it on.
    The suit in the photograph is black with two or three ribbons *drawn* on it,
    so the wave here turns over about once down the body and the neon lives in
    the last fifth of its range at each end."""
    x, y, z = p.x, p.y, p.z
    w = math.sin(3.8 * y + 2.6 * x + 1.7 * z + 0.9 * math.sin(2.6 * z + 1.5 * y))
    warm = math.sin(1.6 * y - 2.9 * x + 2.0 * z) > -0.1
    out = BANDS[0]
    for band in BANDS:
        if w >= band[0]:
            out = band
    return out[1] if warm else out[2]


def head_colour(p: Vector) -> Vector:
    """Skin, scalp and beard, as regions on a sphere. The eyes and the mouth are
    not here — they are geometry, up in `face_part`, because paint on a mesh
    this coarse could not hold their edges. What is left is the stubble line,
    which does more for the likeness at this size than the nose does."""
    d = (p - V(HEAD)).normalized()
    f, u, s = d.dot(GAZE), d.dot(HEAD_UP), d.dot(RIGHT)

    # Hairline: high in front, above the ears at the sides, and down to the
    # nape at the back — the second pass found a bald band between the curls
    # and the collar from astern, which is the one view that matters. The
    # curls are their own geometry; this is the scalp underneath them, and
    # getting it wrong is what put a fringe over both eyes on the first pass.
    if u > 0.12 + 0.42 * max(f, 0.0) - 0.42 * max(-f, 0.0) and not (abs(s) > 0.78 and u < 0.06):
        return HAIR

    # The beard: jaw and chin, up the sideburn, and a moustache under the nose.
    # Every threshold here came down when the paint became hard-edged. Under a
    # ramp an over-generous beard faded out and read as shadow; drawn with an
    # edge, the same numbers put a mask across both cheeks and up to the eyes,
    # and the sideburn rule — a box in three dot products — had visible corners
    # on it. What is left is stubble on a jaw: it stops below the cheekbone, and
    # the sideburn is a strip rather than a slab.
    if u < -0.36 + 0.10 * max(f, 0.0) and f > -0.25:
        return BEARD
    if abs(s) > 0.80 and -0.42 < u < -0.10 and f > 0.05:
        return BEARD
    if f > 0.36 and abs(s) < 0.20 and -0.32 < u < -0.21:
        return BEARD
    return SKIN


def _closest(p: Vector, a: Vector, b: Vector) -> tuple[Vector, float]:
    """The nearest point on the segment ab to p, and how far along it lies."""
    d = b - a
    t = max(0.0, min(1.0, (p - a).dot(d) / max(d.length_squared, 1e-9)))
    return a + d * t, t


def on_seam(p: Vector, a: Vector, b: Vector, out: Vector,
            reach: float, ends: tuple[float, float] = (0.0, 1.0)) -> bool:
    """Is p on one of the two seams of a sleeve?

    A sleeve or a leg is a tube of neoprene closed by two seams, one down the
    outside and one down the inside, and both lie in one plane: the plane that
    holds the limb's own axis and the direction `out` — away from the body. So
    the test is a distance from a plane and not an angle: the component of p's
    offset from the axis along the plane's normal, under half a stitch. `reach`
    keeps it to points that are actually on this limb rather than on whatever
    the plane goes on to cut half a metre away, and `ends` trims it short of the
    joints, where a real seam turns into the next panel's."""
    c, t = _closest(p, a, b)
    r = p - c
    if r.length > reach or not (ends[0] <= t <= ends[1]):
        return False
    axis = (b - a).normalized()
    side = out - axis * out.dot(axis)
    if side.length < 1e-6:
        return False
    n = axis.cross(side.normalized())
    return abs(r.dot(n)) < STITCH / 2


def region(p: Vector) -> Vector:
    """Which colour a point on the body is. Head first, then the bare skin at
    the cuffs, then the suit's construction — cuffs, collar, knee pads, the
    zip, the seams — and the ribbons under all of it. The order is the order of
    exceptions, and it is one function so that `paint()` has one thing to ask
    and every boundary lands on a face edge together."""
    # 17.5 cm and not 23.5: the head's own surface is inside 16 cm of its
    # centre, and the extra 7 the first pass allowed reached down over the
    # collarbone. With a hard-edged paint that stopped being a soft mistake and
    # became a rectangle of beard on the chest.
    if (p - V(HEAD)).length < 0.175:
        return head_colour(p)
    # The collar: a steamer's is a band round the neck itself, a couple of
    # centimetres above where it meets the shoulders, with the seam that binds
    # its edge under it. It is a height and not a sphere, because that is what
    # a collar is.
    if (p - V(NECK)).length < 0.10:
        if p.y > NECK[1] + 0.030:
            return SKIN
        if p.y > NECK[1] + 0.030 - STITCH:
            return SEAM
    # The cuffs, the same way: skin, then the stitched hem around it.
    for a, b, r in SKIN_PARTS:
        c, _ = _closest(p, a, b)
        d = (p - c).length
        if d < r:
            return SKIN
        if d < r + STITCH:
            return SEAM
    # Knee pads: a disc of textured neoprene on the front of each knee, with
    # its own seam round it. "Front" is the outside of the fold, the way
    # `build()` places the kneecap.
    for knee, out in KNEES:
        r = p - V(knee)
        if r.length < 0.070 + STITCH and r.dot(out) > 0.30 * r.length:
            return PAD if r.length < 0.070 else SEAM

    base = suit_colour(p)
    if base is not SUIT and base is not SUIT_2:
        return base  # the ribbons carry their own inked edges

    # The torso, in the chest's frame: how far up the spine, how far to the
    # side, and how far forward of it.
    axis_a, axis_b = V(PELVIS), V(NECK)
    c, _ = _closest(p, axis_a, axis_b)
    r = p - c
    s, f = r.dot(TORSO_R), r.dot(TORSO_F)
    torso = r.length < 0.26 and PELVIS[1] < p.y < NECK[1] + 0.02
    if torso:
        # The back zip, from the collar to the small of the back, and the
        # stitched flap on either side of it.
        if f < -0.04 and 0.79 < p.y:
            if abs(s) < 0.009:
                return ZIP
            if abs(s) < 0.009 + STITCH:
                return SEAM
        # The chest panel's lower edge — one seam round the whole trunk under
        # the pecs, which is where every suit breaks its torso into two panels.
        if abs(p.y - (CHEST[1] - 0.118)) < STITCH / 2 and r.length > 0.06:
            return SEAM
        # And the flank seams, from the armpit to the hip.
        if 0.05 < p.y - PELVIS[1] < 0.28 and on_seam(p, axis_a, axis_b, TORSO_R, 0.26):
            return SEAM

    for a, b, out, reach, ends in LIMB_SEAMS:
        if on_seam(p, a, b, out, reach, ends):
            return SEAM
    return base


# Bare skin ends at the wrists, the ankles and the neck: this is a full steamer,
# not the shorty the procedural rider wore.
SKIN_PARTS = [
    (V(WRIST_F), V(HAND_F) + (V(HAND_F) - V(WRIST_F)) * 1.4, 0.095),
    (V(WRIST_B), V(HAND_B) + (V(HAND_B) - V(WRIST_B)) * 1.4, 0.095),
    (Vector((FOOT_F[0], FOOT_F[1], FOOT_F[2] - 0.08)),
     Vector((FOOT_F[0], FOOT_F[1] + 0.02, FOOT_F[2] + 0.17)), 0.100),
    (Vector((FOOT_B[0], FOOT_B[1], FOOT_B[2] - 0.08)),
     Vector((FOOT_B[0], FOOT_B[1] + 0.02, FOOT_B[2] + 0.17)), 0.100),
]


def _bend_out(a: P3, joint: P3, b: P3) -> Vector:
    """The outside of a fold: the bisector pointing away from the bend at
    `joint`, which is where the kneecap sits and where the quad and the calf
    are laid — `build()` uses the same line."""
    lower = (V(joint) - V(a)).normalized()
    upper = (V(b) - V(joint)).normalized()
    return (lower - upper).normalized()


KNEES = (
    (KNEE_F, _bend_out(ANKLE_F, KNEE_F, HIP_F)),
    (KNEE_B, _bend_out(ANKLE_B, KNEE_B, HIP_B)),
)

# Where the seams of each sleeve and each leg lie: the segment, the direction
# that is "outward" for it — the shoulder away from the chest, the hip away
# from the pelvis — how far off the axis a point can be and still count, and
# how much of the segment to seam. Short of both joints on every one: the
# shoulder is the deltoid's own panel and the knee is a pad.
LIMB_SEAMS = (
    (V(SHOULDER_F), V(ELBOW_F), V(SHOULDER_F) - V(CHEST), 0.11, (0.22, 1.0)),
    (V(ELBOW_F), V(WRIST_F), V(SHOULDER_F) - V(CHEST), 0.09, (0.0, 0.92)),
    (V(SHOULDER_B), V(ELBOW_B), V(SHOULDER_B) - V(CHEST), 0.11, (0.22, 1.0)),
    (V(ELBOW_B), V(WRIST_B), V(SHOULDER_B) - V(CHEST), 0.09, (0.0, 0.92)),
    (V(HIP_F), V(KNEE_F), V(HIP_F) - V(PELVIS), 0.15, (0.12, 0.80)),
    (V(KNEE_F), V(ANKLE_F), V(HIP_F) - V(PELVIS), 0.11, (0.22, 0.92)),
    (V(HIP_B), V(KNEE_B), V(HIP_B) - V(PELVIS), 0.15, (0.12, 0.80)),
    (V(KNEE_B), V(ANKLE_B), V(HIP_B) - V(PELVIS), 0.11, (0.22, 0.92)),
)


# ------------------------------------------------------------------- the hands
def hand(wrist: P3, palm: P3, spread: float = 1.0) -> None:
    """A hand with fingers in it, rather than the mitt the first pass had.

    Three fingers and a thumb, each a taper, with negative tapers carving the
    gaps for their whole length — one negative ball at the knuckle was the first
    attempt and it notched a paddle, because the field between two tapers 3 cm
    apart never drops below the surface anywhere along their run.

    And a warning to whoever tunes this next: the field has fingers and the
    shipped mesh does not. Render the raw metaball conversion and they are all
    there, splayed, with daylight between them; run it through `retopo` at 5,800
    quads and it comes back a mitt. That is not a bug in the carving and it is
    not the voxel size — both were chased, and neither is it. It is that 5,800
    quads over a figure with its arms out is a quad every 1.6 cm, and a finger
    is 3 cm wide, so a hand is three or four faces however it got there. The
    fingers stay in because they cost nothing, they shape the mitt into
    something hand-like, and they come back for free the day the budget rises.
    What would fix it properly is the trick the face already uses: build the
    hands as their own objects with their own budget and join them at the wrist,
    where there is a colour boundary to hide the seam anyway."""
    w, h = V(wrist), V(palm)
    out = (h - w).normalized()
    # The palm's plane: across the hand is whichever way is most horizontal, so
    # the fan opens the way a hand hanging off a wrist opens.
    across = out.cross(Vector((0, 1, 0)))
    across = across.normalized() if across.length > 1e-6 else Vector((1, 0, 0))
    up = across.cross(out).normalized()

    # A small palm, and this is what actually decided whether the hand had
    # fingers on it. At the first pass's 5 cm half-extent the palm's field
    # reached past every knuckle and swallowed all three whole, which looked
    # exactly like a resolution problem and was not one: the fingers were inside
    # the hand. Half the palm and the knuckles pushed out past its edge, and
    # they come back.
    blob(h, (0.038, 0.024, 0.038))

    knuckle = h + out * 0.042
    tips = []
    for i in range(3):
        f = (i - 1.0)                              # -1, 0, 1 across the hand
        d = (out + across * (f * 0.42 * spread) + up * (-0.10 - 0.12 * abs(f))).normalized()
        root = knuckle + across * (f * 0.036)
        length = 0.078 - 0.012 * abs(f)            # the middle finger is longest
        taper(root, root + d * length, 0.018, 0.013, 4)
        tips.append((root, root + d * length))

    # The grooves, and they run the *length* of the gap rather than sitting at
    # the knuckle. One negative ball at the base was the first attempt and it
    # cut three notches into a paddle: two tapers 3 cm apart have a field
    # between them that never drops below the surface anywhere along their run,
    # so the gap has to be carved for its whole length or not at all.
    for (r0, t0), (r1, t1) in zip(tips, tips[1:]):
        taper((r0 + r1) / 2 - out * 0.004, (t0 + t1) / 2, 0.015, 0.013, 4, neg=True)

    # The thumb, off the leading edge and set back toward the wrist — a hand
    # without one reads as a flipper from every angle including this one.
    troot = h - out * 0.010 + across * 0.042
    taper(troot, troot + (out * 0.55 + across * 0.72 - up * 0.30).normalized() * 0.052,
          0.016, 0.012, 4)


# ------------------------------------------------------------------ the figure
def build() -> None:
    global _body, _hair
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 11 mm, against the 16 the first pass used. Fingers are 1.4 cm of radius
    # and grooves are 4 mm deep, and neither survives a lattice coarser than the
    # thing it is meant to describe. Quadriflow throws the density away again
    # straight afterwards, so this costs build time and not budget.
    _body = bpy.data.metaballs.new("body")
    _body.resolution = _body.render_resolution = 0.010
    body_obj = bpy.data.objects.new("body", _body)
    bpy.context.collection.objects.link(body_obj)

    _hair = bpy.data.metaballs.new("hair")
    _hair.resolution = _hair.render_resolution = 0.009
    hair_obj = bpy.data.objects.new("hair", _hair)
    bpy.context.collection.objects.link(hair_obj)

    # Feet, flat on the deck and staggered along it, with the toes forward of
    # the ankle so the stance has a direction. Bare — the reference's are.
    for f in (FOOT_F, FOOT_B):
        blob((f[0], f[1] + 0.005, f[2] + 0.03), (0.058, 0.034, 0.120))
        ball((f[0], f[1] + 0.03, f[2] - 0.05), 0.05)  # the heel, under the ankle

    # ---- the second pass: an athlete, not a balloon animal.
    #
    # The first body was correct in its parts and soft in all of them: every
    # limb a tube of one generous radius, a chest as deep as it was wide, and
    # nothing between a muscle and the next but blend. What reads as *athletic*
    # is not bigger muscles, it is the ratios between them — a wrist half the
    # forearm, a waist two thirds of the chest, a knee narrower than the calf
    # above it — and the grooves that separate one from the next. So the second
    # pass thins every joint, widens the top of the frame, narrows the middle,
    # and carves: the spine, the sternum, under each pec, and the line between
    # the deltoid and the arm. Every number below is a real half-thickness in
    # metres on a man about 1.6 m tall.

    # Legs. Thin at the ankle and the knee, thick where the muscle is, and the
    # knee is where two tapers meet rather than a ball hiding a corner.
    taper(ANKLE_F, KNEE_F, 0.044, 0.064)
    taper(KNEE_F, HIP_F, 0.066, 0.098)
    taper(ANKLE_B, KNEE_B, 0.044, 0.064)
    taper(KNEE_B, HIP_B, 0.066, 0.098)

    for ankle, knee, hip in ((ANKLE_F, KNEE_F, HIP_F), (ANKLE_B, KNEE_B, HIP_B)):
        shin = (V(knee) - V(ankle)).normalized()
        thigh = (V(hip) - V(knee)).normalized()
        # The calf sits high on the back of the shin and the quad low on the
        # front of the thigh, and "back" here means away from the knee's own
        # bend — the leg is folded, so the outside of the fold is where the
        # meat goes and it is the bisector that says which way that is.
        outward = (shin - thigh).normalized()
        sideways = shin.cross(outward).normalized()
        # The calf: one belly high and inboard, a smaller one outboard and a
        # shade lower, which is the two heads of a gastrocnemius and the reason
        # a calf seen from behind is a heart and not a bulb.
        bulge(V(ankle).lerp(V(knee), 0.66) + outward * 0.030 + sideways * 0.012, shin, 0.070, 0.042)
        bulge(V(ankle).lerp(V(knee), 0.60) + outward * 0.026 - sideways * 0.016, shin, 0.062, 0.034)
        # The quad, as three: the big belly down the front, and the teardrop
        # of the vastus medialis low and inboard just above the knee.
        bulge(V(knee).lerp(V(hip), 0.45) - outward * 0.034, thigh, 0.100, 0.052)
        bulge(V(knee).lerp(V(hip), 0.22) - outward * 0.026 + sideways * 0.028, thigh, 0.050, 0.032)
        # The hamstring, on the inside of the fold, which in a crouch this deep
        # is what the calf presses against.
        bulge(V(knee).lerp(V(hip), 0.52) + outward * 0.030, thigh, 0.085, 0.040)
        ball(V(knee) - outward * 0.014, 0.056)  # the cap, so the fold has a front

    # Torso: pelvis, waist, chest. The frame is a V — wide at the clavicles,
    # narrow at the waist, the pelvis narrower than the ribcage — and each of
    # the three is now shallower than it was, because a chest as deep as it is
    # wide is a barrel and not a swimmer's.
    blob(PELVIS, (0.118, 0.095, 0.108))
    blob(WAIST, (0.100, 0.110, 0.088))
    blob(CHEST, (0.180, 0.125, 0.108))
    # The top of the ribcage, squared across under the collarbones. This is
    # the width that reads from astern, and it is what makes the head the
    # right size without touching the head.
    blob(V(CHEST) + Vector((0, 0.058, 0)), (0.198, 0.058, 0.096))

    # And the waist is carved as well as narrowed. Two negative lobes at the
    # flanks, between the bottom rib and the hip, which is the one place a
    # metaball field will not give you a concavity by itself: every positive
    # element it blends with is convex and the sum of convex things is convex.
    for side in (-1, 1):
        blob(V(WAIST) + TORSO_R * (0.135 * side) + Vector((0, 0.012, 0)),
             (0.080, 0.090, 0.098), neg=True)

    # Chest and back. A pec each side of the sternum, the groove down the
    # sternum between them and the fold under each; a lat sweeping from the
    # armpit down to the waist — the lats are what make a swimmer's back a V
    # from astern, which is the view this model is actually for — and the two
    # shoulder blades either side of a spinal groove, which is the other half
    # of the same view.
    for side in (-1, 1):
        bulge(V(CHEST) + TORSO_F * 0.074 + TORSO_R * (0.072 * side) + Vector((0, 0.012, 0)),
              TORSO_R, 0.054, 0.046)
        ball(V(CHEST) + TORSO_F * 0.126 + TORSO_R * (0.072 * side) - Vector((0, 0.058, 0)),
             0.020, neg=True)
        lat_top = V(CHEST) - TORSO_F * 0.030 + TORSO_R * (0.152 * side)
        lat_low = V(WAIST) - TORSO_F * 0.020 + TORSO_R * (0.078 * side)
        taper(lat_top, lat_low, 0.066, 0.040, 4)
        bulge(V(CHEST) - TORSO_F * 0.092 + TORSO_R * (0.072 * side) + Vector((0, 0.030, 0)),
              Vector((0, 1, 0)), 0.060, 0.034)
    taper(V(CHEST) + TORSO_F * 0.138 + Vector((0, 0.050, 0)),
          V(CHEST) + TORSO_F * 0.132 - Vector((0, 0.040, 0)), 0.020, 0.016, 3, neg=True)
    taper(V(CHEST) - TORSO_F * 0.128 + Vector((0, 0.045, 0)),
          V(PELVIS) - TORSO_F * 0.108 + Vector((0, 0.040, 0)), 0.020, 0.022, 5, neg=True)
    # The abdomen: a shallow linea alba, which under neoprene is all of a
    # six-pack that survives.
    taper(V(WAIST) + TORSO_F * 0.098 + Vector((0, 0.10, 0)),
          V(WAIST) + TORSO_F * 0.100 - Vector((0, 0.04, 0)), 0.013, 0.013, 3, neg=True)

    # The glutes, and the reason they are not one blob: a crouch this deep puts
    # the seat out behind the heels, and a single ellipsoid there reads as a
    # tail. Two, set apart, read as a person sitting into the turn.
    for side in (-1, 1):
        blob(V(PELVIS) - TORSO_F * 0.070 + TORSO_R * (0.058 * side) - Vector((0, 0.012, 0)),
             (0.076, 0.072, 0.068))

    # Shoulders. The deltoid is a cap over the joint, not a sphere at it: it
    # runs from the collarbone round to the back, and its front edge is the line
    # that tells you where the arm stops and the chest starts. Bigger than the
    # first pass's, on an arm that is thinner, which is the whole silhouette of
    # a swimmer's shoulder.
    for shoulder, side in ((SHOULDER_F, 1), (SHOULDER_B, -1)):
        arm = (V(ELBOW_F if side > 0 else ELBOW_B) - V(shoulder)).normalized()
        blob(shoulder, (0.086, 0.084, 0.084))
        bulge(V(shoulder) + arm * 0.034, arm.cross(TORSO_F).normalized(), 0.050, 0.064)
        # The line under the deltoid, where it tucks into the arm.
        ball(V(shoulder) + arm * 0.105, 0.030, neg=True)
        # The trapezius, filling the hollow between the neck and the shoulder.
        # Without it the neck is a post rising out of a plateau.
        taper(V(NECK) - Vector((0, 0.016, 0)), V(shoulder) + Vector((0, 0.014, 0)),
              0.062, 0.066, 4)
        # And the armpit, carved back out from under it.
        ball(V(shoulder) + arm * 0.070 - Vector((0, 0.054, 0)), 0.050, neg=True)

    # The collarbone shelf: one shallow ridge across the top of the chest. It is
    # four millimetres of relief and it is the single thing that stops the front
    # of the torso reading as a beanbag under a wetsuit.
    bulge(V(CHEST) + TORSO_F * 0.064 + Vector((0, 0.064, 0)), TORSO_R, 0.140, 0.030)

    # A thicker neck than the first pass's, and it runs into the traps rather
    # than standing on them.
    taper(NECK, (NECK[0], NECK[1] + 0.07, NECK[2] + 0.01), 0.056, 0.058, 2)

    # Arms. Neither is symmetrical: the leading one hangs down and carries on
    # forward past the front knee, the trailing one down and aft past the back
    # one. See the pose points for why they are no longer out wide, and for the
    # five centimetres of clearance that is the only thing keeping each forearm
    # from welding itself to the thigh it passes.
    for shoulder, elbow, wrist, palm in ((SHOULDER_F, ELBOW_F, WRIST_F, HAND_F),
                                         (SHOULDER_B, ELBOW_B, WRIST_B, HAND_B)):
        upper = (V(elbow) - V(shoulder)).normalized()
        fore = (V(wrist) - V(elbow)).normalized()
        # Thinner tubes than before at every point, and a wrist at 3 cm: the
        # meat goes back on as muscle, where a muscle is.
        taper(shoulder, elbow, 0.066, 0.049)
        taper(elbow, wrist, 0.049, 0.031)
        # Biceps on the inside of the fold, triceps on the outside, and the
        # forearm's meat up by the elbow — the same bisector trick as the leg.
        outward = (upper - fore).normalized()
        bulge(V(shoulder).lerp(V(elbow), 0.54) - outward * 0.022, upper, 0.058, 0.040)
        bulge(V(shoulder).lerp(V(elbow), 0.52) + outward * 0.024, upper, 0.056, 0.036)
        # The forearm is a club: widest a third of the way down from the elbow
        # and tapering hard to the wrist, with the extensors on the outside.
        bulge(V(elbow).lerp(V(wrist), 0.28), fore, 0.060, 0.042)
        bulge(V(elbow).lerp(V(wrist), 0.32) + outward * 0.016, fore, 0.050, 0.030)
        ball(V(elbow) + outward * 0.010, 0.040)  # the point of the elbow
        hand(wrist, palm)

    # The head, the jaw hung off the front of it, and the nose that keeps the
    # profile from being an egg. Smaller than the first pass by a centimetre:
    # at 0.108 it was a fifth of the figure's height and the whole thing read as
    # a bobblehead from astern, which is the only angle that matters. Second
    # pass: a skull that is longer than it is wide, the occiput behind and
    # above the centre, a brow ridge, and a jaw with corners on it.
    ball(HEAD, 0.094)
    ball(V(HEAD) - GAZE * 0.028 + HEAD_UP * 0.014, 0.088)
    jaw = V(HEAD) + GAZE * 0.038 - Vector((0, 0.050, 0))
    ball(jaw, 0.060)
    chin = V(HEAD) + GAZE * 0.062 - Vector((0, 0.066, 0))
    ball(chin, 0.040)
    nose = V(HEAD) + GAZE * 0.096 - Vector((0, 0.010, 0))
    ball(nose, 0.024)
    bulge(V(HEAD) + GAZE * 0.080 + HEAD_UP * 0.032, RIGHT, 0.048, 0.020)
    for side in (-1, 1):
        # A cheekbone and an ear. The cheekbone is what gives the face a plane
        # to catch the key light on; without it the head is a ball with a chin.
        ball(V(HEAD) + RIGHT * (0.062 * side) + GAZE * 0.050 + Vector((0, 0.006, 0)), 0.038)
        ball(V(HEAD) + RIGHT * (0.094 * side) - Vector((0, 0.012, 0)), 0.026)
        # The angle of the jaw, which is what squares it.
        ball(V(HEAD) + RIGHT * (0.054 * side) + GAZE * 0.006 - Vector((0, 0.062, 0)), 0.030)
    # Under the jaw, carved: a head and a neck that meet in a continuous bulge
    # is a snowman, and this is the cut that makes it a chin over a throat.
    ball(V(HEAD) + GAZE * 0.020 - Vector((0, 0.108, 0)), 0.052, neg=True)
    # And the temples, so the skull is not a sphere across the brow.
    for side in (-1, 1):
        ball(V(HEAD) + RIGHT * (0.104 * side) + GAZE * 0.040 + HEAD_UP * 0.040, 0.030, neg=True)

    hair()

    bpy.ops.object.select_all(action="DESELECT")
    for ob in (body_obj, hair_obj):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = body_obj
    bpy.ops.object.convert(target="MESH")
    # Converting a metaball hands back a *new* object per family, named after
    # the family's base with a suffix. Rename the two back, because which field
    # a mesh came out of is the only thing the colour pass needs to know.
    faces = {ob for ob, _ in FACE_PARTS}
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH" and ob not in faces:
            ob.name = "hair" if ob.name.startswith("hair") else "body"


def hair() -> None:
    """Curls, second pass: a head of hair rather than a cap of lumps.

    Three things a real head of curls has that thirty arcs did not. A *scalp*
    under them — one thin cap of the hair field over the crown, so the curls
    stand on hair and not on skin, and so the hair is one shell that `retopo`
    can lay a grid over. A *direction*: every curl is a short helix around its
    own axis, corkscrewing away from the scalp, which is what a curl is and
    which reads as one at any distance because the silhouette is scalloped
    rather than lumpy. And a *cut*: long on top and short at the sides and
    nape, tapering off to nothing over the ears and above the neck, which is a
    haircut and is the one thing that makes a head of hair look like it
    belongs to a man rather than a wig stand.

    The density is set by the golden angle over the scalp, as before, and the
    count doubled. None of it crosses the face; the fringe stops at the
    hairline `head_colour` paints, and a few curls at the front are allowed to
    fall forward over it, which is what a fringe does."""
    scalp = 0.085
    # The cap: a ring of flattened balls around the crown, standing 6 mm proud
    # of the skin, over the same region the curls cover.
    for i in range(44):
        a = 2.399963 * i
        lat = -0.22 + 1.20 * (i / 43)
        rho = math.sqrt(max(1 - lat * lat, 0.0))
        d = (HEAD_UP * lat + RIGHT * math.cos(a) * rho + GAZE * math.sin(a) * rho).normalized()
        f, u = d.dot(GAZE), d.dot(HEAD_UP)
        if f > 0.20 and u < 0.62:
            continue  # the face
        if u < 0.28 and f > -0.30:
            continue  # the ears; the cap only comes down at the nape
        ball(V(HEAD) + d * (scalp - 0.004), 0.036 if u > 0.2 else 0.028, _hair)

    for i in range(84):
        a = 2.399963 * i  # the golden angle — no seam, no clumping
        lat = -0.30 + 1.28 * (i / 83)
        rho = math.sqrt(max(1 - lat * lat, 0.0))
        d = (HEAD_UP * lat + RIGHT * math.cos(a) * rho + GAZE * math.sin(a) * rho).normalized()
        f, u, s = d.dot(GAZE), d.dot(HEAD_UP), abs(d.dot(RIGHT))
        # The hairline, matching `head_colour`: high in front, and nothing over
        # the face; above the ears at the sides; and at the back it comes down
        # to the nape, cropped close.
        if f > 0.10 and u < 0.20 + 0.42 * f:
            continue
        if u < 0.06 and f > -0.40:
            continue  # over the ears
        if u < 0.12 - 0.42 * max(-f, 0.0):
            continue  # below the nape
        # The cut: full on the crown, fading to a close crop at the sides. `top`
        # is 1 on the crown and 0 at the temple line.
        top = max(0.0, min(1.0, (u - 0.10) / 0.55))
        length = 0.014 + 0.036 * top
        r = (0.011 + 0.010 * top) * (0.85 + 0.30 * (0.5 + 0.5 * math.cos(2.3 * i)))
        root = V(HEAD) + d * (scalp - 0.006)
        # The helix's own frame: sideways along the scalp and the other way.
        e1 = d.cross(HEAD_UP).normalized() if abs(d.dot(HEAD_UP)) < 0.98 else RIGHT
        e2 = d.cross(e1).normalized()
        # A curl grows out and then over — the axis tips away from the scalp
        # normal, back and down, the way weight takes it.
        axis = (d + e2 * 0.35 * (1 if i % 2 else -1) - HEAD_UP * 0.25 * (1 - top)).normalized()
        e1 = axis.cross(e1).cross(axis).normalized() if abs(axis.dot(e1)) < 0.98 else e2
        e2 = axis.cross(e1).normalized()
        turns = 1.4
        n = 5 if top > 0.25 else 3
        coil = 0.010 + 0.008 * top
        for k in range(n):
            t = k / max(n - 1, 1)
            ang = t * turns * 2 * math.pi + i * 1.7
            c = (root + axis * (length * t)
                 + (e1 * math.cos(ang) + e2 * math.sin(ang)) * coil * (0.6 + 0.4 * t))
            ball(c, r * (1.0 - 0.22 * t), _hair)


def face(skin: bpy.types.Object) -> None:
    """Whites set into the sockets with an iris on each, a brow over them, a
    nose, and a smile with teeth in it. The reference's whole expression is that
    smile, so it is the one feature built twice — a dark mouth and a lighter
    band of teeth sitting a few millimetres proud of it."""
    for side in (-1.0, 1.0):
        face_part(skin, "eye", SCLERA, (side * 0.40, 0.06, 0.92), (0.029, 0.019, 0.015), 0.010)
        face_part(skin, "iris", EYE, (side * 0.41, 0.05, 0.91), (0.013, 0.014, 0.013), 0.005)
        face_part(skin, "brow", HAIR, (side * 0.40, 0.30, 0.87), (0.033, 0.009, 0.011), 0.006)
    face_part(skin, "nose", SKIN, (0.0, -0.06, 1.0), (0.021, 0.019, 0.017), 0.013)
    face_part(skin, "mouth", LIP, (0.0, -0.44, 0.90), (0.044, 0.021, 0.015), 0.009)
    face_part(skin, "teeth", TOOTH, (0.0, -0.42, 0.91), (0.034, 0.011, 0.013), 0.004)

    # Not the face, but the same trick: the zip's slider at the top of the back
    # seam, and the pull tab standing up off it. Both are found by firing a ray
    # out of the upper chest through the back, because the back under the
    # collar is traps blended into a chest blob and its depth is not a number.
    up = (Vector((0, 1, 0)) - TORSO_F * 0.55).normalized()
    across = TORSO_R
    out = across.cross(up).normalized()
    back = -TORSO_F + Vector((0, 0.10, 0))
    origin = V(CHEST) + Vector((0, 0.085, 0))
    stud(skin, "zip", ZIP, origin, back, (0.011, 0.016, 0.007), (across, up, out), 0.004)
    stud(skin, "pull", ZIP, origin, back, (0.009, 0.024, 0.004), (across, up, out), 0.0,
         lift=up * 0.030 - out * 0.002)


def weld(obj: bpy.types.Object, share: float = 1.0) -> int:
    """Make the marching-cubes output something Quadriflow will accept, and
    return how many non-manifold edges are left over.

    Three things come off a carved metaball field that a remesher will not take.
    Coincident vertices, where the lattice grazed the isosurface — welded here.
    Shards: a negative element parked near the outside of a positive one can
    pinch a few square centimetres of surface off into its own closed shell, and
    a shell that is not the body is not wanted at any budget, so only the
    largest connected run of faces survives — or, for the hair, every shell at
    least `share` of the largest, because a curl that did not quite touch the
    cap is still hair. And inconsistent winding, which is the one the operator
    names in its own error message."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)

    # Flood-fill across shared edges: every face reachable from a seed is one
    # shell, and the biggest one is the rider.
    seen: set[int] = set()
    shells: list[list] = []
    for seed in bm.faces:
        if seed.index in seen:
            continue
        shell, stack = [], [seed]
        seen.add(seed.index)
        while stack:
            f = stack.pop()
            shell.append(f)
            for e in f.edges:
                for nf in e.link_faces:
                    if nf.index not in seen:
                        seen.add(nf.index)
                        stack.append(nf)
        shells.append(shell)
    biggest = max(len(s) for s in shells)
    kept = {f for s in shells if len(s) >= share * biggest for f in s}
    strays = [f for f in bm.faces if f not in kept]
    if strays:
        bmesh.ops.delete(bm, geom=strays, context="FACES")

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bad = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.to_mesh(obj.data)
    bm.free()
    return bad


def retopo(obj: bpy.types.Object, quads: int, share: float = 1.0) -> None:
    """Quadriflow, not decimate. Marching cubes hands back a triangle soup whose
    density follows the sampling lattice and not the shape, and collapsing it to
    budget keeps that: the same triangles per square centimetre on a flat back
    as on a knuckle, and a silhouette that goes lumpy exactly where the form is
    tightest. Quadriflow re-lays the surface as quads that follow curvature, so
    the budget lands where the model bends.

    It is also what makes the crisp colour affordable. `paint()` colours whole
    faces, so a face is the size of the smallest patch of neon the suit can
    hold, and quads of a size chosen here beat triangles of whatever size the
    lattice happened to leave."""
    bad = weld(obj, share)
    before = len(obj.data.polygons)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    # Voxels first, and Quadriflow second, because Quadriflow will not read
    # marching-cubes output no matter how manifold it is: the lattice leaves
    # slivers a thousandth of a millimetre across where it grazed the isosurface
    # tangentially, and they are legal geometry that its solver still chokes on.
    # A voxel pass rewrites the whole surface at one honest density and hands
    # over a mesh with no sliver in it. It is also the step that decides whether
    # a finger survives, so the size here is the finger radius and not a number
    # picked for the face count.
    obj.data.remesh_voxel_size = VOXEL
    obj.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()

    # Ten times life size for the duration, and this is not a nicety: the
    # operator's manifold test uses absolute tolerances, so it refuses a mesh
    # that is *small* rather than one that is broken. This rider is 1.4 m across
    # and gets "the mesh needs to be manifold" on a surface that is a single
    # closed shell with 0 non-manifold edges, 0 non-manifold verts and an Euler
    # characteristic of exactly 2. The same mesh at ten times the size is
    # accepted without complaint. Scale up, remesh, scale back.
    obj.data.transform(Matrix.Scale(RETOPO_SCALE, 4))
    try:
        bpy.ops.object.quadriflow_remesh(target_faces=quads, use_preserve_sharp=False)
    except RuntimeError as e:
        print(f"[surfer] quadriflow raised ({e})")
    obj.data.transform(Matrix.Scale(1 / RETOPO_SCALE, 4))

    # It reports a refusal as a warning and a cancelled operator rather than as
    # an exception, so "did it actually do anything" is the only honest test.
    after = len(obj.data.polygons)
    if after >= before:
        print(f"[surfer] quadriflow declined ({bad} non-manifold edges) — decimating instead")
        trim(obj, quads * 2)
    else:
        print(f"[surfer] retopo {before} tris -> {after} faces "
              f"({sum(1 for p in obj.data.polygons if len(p.vertices) == 4)} quads)")


def crisp(obj: bpy.types.Object) -> None:
    """Cut the mesh along its own colour boundaries, so a band edge is a line
    the geometry actually has.

    `paint()` gives every face one colour, which makes a boundary as sharp as
    the mesh — and as *shaped* as the mesh. On a 1.5 cm quad grid a ribbon
    crossing the body diagonally comes out as a flight of stairs, because the
    only edges available to it run two ways and the ribbon runs a third.

    So: walk the edges, find the ones whose two ends fall in different regions,
    bisect each to locate where on it the region actually changes, and split it
    there. That puts a vertex exactly on the boundary. Then `connect_verts`
    joins the pairs of those that share a face, which cuts the face in two along
    the boundary. What is left is a mesh whose edges include the ribbon, and
    faces that are each wholly inside one colour.

    Ten steps of bisection puts the vertex within a thousandth of the edge's
    length of the true crossing, which on a 1.5 cm edge is fifteen microns. The
    cost is about six hundred faces, all of them along a ribbon and none of them
    anywhere else, which is the opposite of how a subdivision would have spent
    them.

    Twice, and the second pass is not belt-and-braces. `connect_verts` can only
    split a face when the boundary enters it and leaves it cleanly; where three
    regions meet at a corner, or where a ribbon clips a single quad twice, it
    declines and the face survives whole — and a face that survives whole is a
    full-size step in the edge. One more round cuts what the first could not,
    against a mesh whose faces are now small enough that it can."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)

    def col(v: Vector) -> Vector:
        # Blender back to three: (x, -z, y) inverted is (x, z, -y).
        return region(Vector((v.x, v.z, -v.y)))

    # An edge is walked in `steps` samples rather than tested at its two ends,
    # since the seams: an 8 mm stitch on a 12 mm edge can begin and end inside
    # it with both ends the same colour, and an end-to-end test never sees it —
    # what came out was a dashed line. The first change along the edge is
    # bisected and split; whatever the edge held beyond it is a new edge for
    # the next round, which is why there are three rounds now and not two.
    steps = 16
    total = 0
    for round_ in range(5):
        # From the second round on, any face that still has two colours at its
        # corners is one `connect_verts` declined last time — a quad the band
        # entered and left through the same edge, or clipped at a corner. A
        # triangle has no such case: two boundary vertices on a triangle are
        # always on two different edges, so it is always cut. Triangulate the
        # holdouts and go round again.
        if round_:
            held = []
            for f in bm.faces:
                # Sampled a little in from each corner, because a corner that
                # *is* the boundary lands on whichever side the bisection
                # stopped, and a face that was cut correctly is not a holdout.
                mid = f.calc_center_median()
                cs = [col(v.co.lerp(mid, 0.2)) for v in f.verts]
                if any((c - cs[0]).length > 1e-9 for c in cs[1:]):
                    held.append(f)
            if held:
                bmesh.ops.triangulate(bm, faces=held)
        cuts = []
        for e in bm.edges:
            a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
            ca = col(a)
            lo = hi = None
            for k in range(1, steps + 1):
                if (col(a.lerp(b, k / steps)) - ca).length > 1e-9:
                    lo, hi = (k - 1) / steps, k / steps
                    break
            if lo is None:
                continue
            for _step in range(7):
                mid = (lo + hi) / 2
                if (col(a.lerp(b, mid)) - ca).length < 1e-9:
                    lo = mid
                else:
                    hi = mid
            t = (lo + hi) / 2
            # A crossing within a hair of an end would put a new vertex on top
            # of an old one, which welds back and leaves the same straddling
            # edge for the next round to find again.
            if 0.02 < t < 0.98:
                cuts.append((e, t))
        if not cuts:
            break
        # `edge_split` measures its fraction from the vertex it is handed, and
        # the bisection above measured from `verts[0]`, so it has to be the same
        # one — splitting from the other end mirrors every cut on the model.
        made = [bmesh.utils.edge_split(e, e.verts[0], t)[1] for e, t in cuts]
        bmesh.ops.connect_verts(bm, verts=made)
        total += len(cuts)

    print(f"[surfer] crisp: {total} edges cut, {len(bm.faces)} faces")
    bm.to_mesh(obj.data)
    bm.free()


def trim(obj: bpy.types.Object, budget: int) -> None:
    """Down to a triangle budget. The hair's road, not the body's: a cloud of
    thirty separate curls is exactly the input Quadriflow is worst at, because
    it wants to bridge the gaps between them into one shell."""
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris <= budget:
        return
    bpy.context.view_layer.objects.active = obj
    m = obj.modifiers.new("trim", "DECIMATE")
    m.ratio = budget / tris
    bpy.ops.object.modifier_apply(modifier=m.name)


def join_all() -> bpy.types.Object:
    body = bpy.context.scene.objects["body"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = body.data.name = "surfer"
    return body


def rig(body: bpy.types.Object, extras: list[bpy.types.Object]) -> bpy.types.Object:
    """The armature, and the weights that tie the skin to it.

    Bone heat first, because when it works it is better than anything written
    here: it is the only method that gets the boundary between a deltoid and a
    pec right without somebody painting it, and it is the difference between a
    shoulder that rotates and a shoulder that shears. With the arms out wide it
    worked on the first try and left nothing unweighted.

    With the arms *down* it refuses, and the refusal is instructive rather than
    a bug. Bone heat works by shooting rays from each bone and taking what it
    can see; a forearm five centimetres off the thigh it is hanging beside can
    see the thigh, the thigh can see the forearm, and the solver cannot separate
    them. It says so as a *warning* on one bone and a cancelled operator — never
    an exception — and leaves most of the mesh with no group at all. A vertex
    with no group does not stay where it is when the rig moves; it stays at the
    origin, which at runtime is a spike out of the model to the waterline.

    So the count is the test, not the return code, and anything more than a
    stray vertex throws the whole result away and runs `diffuse` instead. Half a
    mesh weighted one way and half the other is a seam down the middle, which is
    worse than either method alone.

    The hair and the face are deliberately not part of that shell and are not
    weighted by either. A curl and an eyeball belong wholly to the head, and the
    way to say so is one group at weight 1 — not a solver's opinion about a
    sphere floating inside a skull, which is a question bone heat answers badly
    and slowly."""
    amt = bpy.data.armatures.new("rig")
    rig_obj = bpy.data.objects.new("rig", amt)
    bpy.context.collection.objects.link(rig_obj)

    tails = {name: tail for name, _, _, tail in BONES}
    bpy.context.view_layer.objects.active = rig_obj
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, head, tail in BONES:
        eb = amt.edit_bones.new(name)
        eb.head, eb.tail = T(*head), T(*tail)
        if parent is not None:
            eb.parent = amt.edit_bones[parent]
            # Connected only where the joint is genuinely shared, which is the
            # spine and the limbs below the shoulder and the hip. Connecting
            # anything else moves its head to the parent's tail.
            eb.use_connect = (Vector(head) - Vector(tails[parent])).length < 1e-6
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    rig_obj.select_set(True)
    bpy.context.view_layer.objects.active = rig_obj
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except RuntimeError as e:
        print(f"[surfer] bone heat raised ({e})")
        bpy.ops.object.parent_set(type="ARMATURE_NAME")

    loose = sum(1 for v in body.data.vertices if not any(g.weight > 1e-4 for g in v.groups))
    if loose > len(body.data.vertices) // 200:
        print(f"[surfer] bone heat left {loose} of {len(body.data.vertices)} "
              f"verts unweighted — discarding it, diffusing instead")
        diffuse(body)
    else:
        print(f"[surfer] rig: bone heat, {loose} verts unweighted")
    print(f"[surfer] rig: {len(BONES)} bones, {len(body.vertex_groups)} groups")

    for ob in extras:
        g = ob.vertex_groups.new(name="head")
        g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
        ob.parent = rig_obj
        ob.modifiers.new("rig", "ARMATURE").object = rig_obj
    return rig_obj


def diffuse(obj: bpy.types.Object, rounds: int = 26, keep: int = 4) -> None:
    """Weights without a solver: claim, then blur along the surface.

    Two steps and the second one is the whole idea.

    *Claim.* Every vertex goes to the bone whose segment it is nearest, at
    weight 1. Segment and not head, because a point beside the middle of a thigh
    is nearer the knee than the hip and nearer both than either endpoint
    suggests. What comes out is correct and completely unusable: hard regions
    with a crease at every boundary, which is a paper doll.

    *Blur.* Then the weights are averaged with their neighbours', over and over,
    along the mesh's own edges. A boundary that was a step becomes a ramp as
    wide as the diffusion reaches, which is what a skin weight is; twenty-six
    rounds on a 1.5 cm quad grid spreads about five edges, or eight centimetres,
    which is a shoulder.

    And the reason it is done along *edges* rather than through space is the
    thing that defeated bone heat. A forearm hanging beside a thigh is five
    centimetres from it and half a metre away *across the surface* — up the arm,
    over the shoulder, down the torso and along the leg. Diffusion cannot cross
    that gap, so the arm keeps its weights and the thigh keeps its, with no
    solver having to decide which is which. It is the one method whose weakness
    is exactly this model's shape.

    `keep` is glTF's limit and not a choice: four influences a vertex, which is
    also all a body this simple needs. The rest are dropped and what is left is
    renormalised, so every vertex still sums to one."""
    import numpy as np  # noqa: PLC0415 — bpy ships it; nothing else here wants it

    me = obj.data
    segments = [(name, T(*head), T(*tail)) for name, _, head, tail in BONES]
    n, m = len(me.vertices), len(segments)

    co = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)

    # Distance from every vertex to every bone segment, in one pass each.
    gap = np.empty((n, m))
    for i, (_, a, b) in enumerate(segments):
        a = np.array(a)
        d = np.array(b) - a
        t = np.clip(((co - a) @ d) / max(float(d @ d), 1e-9), 0.0, 1.0)
        gap[:, i] = np.linalg.norm(co - (a + t[:, None] * d), axis=1)

    w = np.zeros((n, m))
    w[np.arange(n), gap.argmin(axis=1)] = 1.0

    edges = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", edges)
    edges = edges.reshape(-1, 2)
    lo, hi = edges[:, 0], edges[:, 1]
    # One umbrella average a round: a vertex, plus each of its neighbours, over
    # the count. The vertex's own weight is in the sum, which is what keeps the
    # thing from washing out to grey over twenty-six passes.
    for _ in range(rounds):
        acc = w.copy()
        cnt = np.ones(n)
        np.add.at(acc, lo, w[hi])
        np.add.at(acc, hi, w[lo])
        np.add.at(cnt, lo, 1.0)
        np.add.at(cnt, hi, 1.0)
        w = acc / cnt[:, None]

    order = np.argsort(-w, axis=1)[:, :keep]
    trimmed = np.zeros_like(w)
    rows = np.arange(n)[:, None]
    trimmed[rows, order] = w[rows, order]
    w = trimmed / np.maximum(trimmed.sum(axis=1, keepdims=True), 1e-12)

    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    spread = 0
    for i, (name, *_) in enumerate(segments):
        g = obj.vertex_groups.new(name=name)
        idx = np.nonzero(w[:, i] > 1e-4)[0]
        spread += len(idx)
        for v in idx:  # `add` takes one weight, so one call per distinct value
            g.add([int(v)], float(w[v, i]), "REPLACE")
    print(f"[surfer] diffuse: {rounds} rounds, {spread / n:.2f} bones a vertex")


def flex() -> None:
    """A stress pose, for `--render --flex` and for nothing else.

    The preview renders the rest pose, which is the pose the skin was sculpted
    in and therefore the one pose that cannot tell you whether the skinning
    works. This bends every joint the runtime bends, further than the runtime
    ever will, and the four views then show what a deep crouch does to the
    knees, what a full carve does to the waist, and whether the deltoid keeps
    its shape when the arm comes down.

    Rotations are about each bone's own local axes — Y runs along the bone, so X
    bends it and Y twists it — which is enough for a smoke test and is not how
    `Ship.tsx` drives the same rig. Nothing here is exported."""
    rig_obj = bpy.context.scene.objects["rig"]
    bpy.context.view_layer.objects.active = rig_obj
    bpy.ops.object.mode_set(mode="POSE")
    bend = {
        "hips": (0.10, 0.30, 0.0), "spine": (0.16, 0.26, -0.10), "chest": (0.10, 0.30, -0.16),
        "neck": (-0.10, 0.20, 0.0), "head": (-0.14, 0.28, 0.10),
        "armF_upper": (0.45, 0.0, 0.35), "armF_fore": (0.60, 0.0, 0.0), "armF_hand": (0.30, 0.0, 0.0),
        "armB_upper": (-0.40, 0.0, -0.30), "armB_fore": (0.55, 0.0, 0.0), "armB_hand": (-0.25, 0.0, 0.0),
        "legF_thigh": (0.35, 0.0, 0.0), "legF_shin": (0.55, 0.0, 0.0), "legF_foot": (-0.30, 0.0, 0.0),
        "legB_thigh": (0.30, 0.0, 0.0), "legB_shin": (0.50, 0.0, 0.0), "legB_foot": (-0.25, 0.0, 0.0),
    }
    for name, (x, y, z) in bend.items():
        pb = rig_obj.pose.bones[name]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (Quaternion((1, 0, 0), x)
                                  @ Quaternion((0, 1, 0), y) @ Quaternion((0, 0, 1), z))
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    print("[surfer] flexed — the preview is a stress pose, not the model")


def paint(obj: bpy.types.Object, flat: Vector | None = None) -> None:
    """COLOR_0, one value a *face corner*, and the whole point is the domain.

    On the POINT domain a colour lives at a vertex and the hardware interpolates
    it across every face touching it, so the narrowest band the suit can hold is
    two vertices wide and its edge is a zigzag a centimetre deep. The first pass
    hid that by making every band a ramp, which is why the ribbons came out
    airbrushed when the reference's are drawn with a pen.

    On the CORNER domain the colour belongs to the face. Every corner of a face
    gets the colour of the face's centre, so the face is flat and the boundary
    between two colours is the edge between two faces — a real line, as sharp as
    the mesh's own silhouette. The glTF exporter splits the verts that need
    splitting on the way out (COLOR_0 is per-vertex in the format), and because
    the normals are still shared and smooth, what splits is the colour and not
    the shading.

    Which region a face belongs to is decided by where its centre is against the
    pose — a hand is near the hand, a shin is near the shin — so the suit and
    the skin agree with the geometry by construction rather than by a set of
    planes that would need moving with it. `flat` paints the whole object one
    colour, which is the hair: the curls are an object, so being hair is a fact
    about the mesh rather than a test on a position."""
    me = obj.data
    attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    if flat is not None:
        rgba = (flat.x, flat.y, flat.z, 1.0)
        for i in range(len(me.loops)):
            attr.data[i].color = rgba
        return

    for poly in me.polygons:
        c = poly.center
        # Blender back to three: (x, -z, y) inverted is (x, z, -y).
        rgba = region(Vector((c.x, c.z, -c.y)))
        rgba = (rgba.x, rgba.y, rgba.z, 1.0)
        for i in poly.loop_indices:
            attr.data[i].color = rgba


def finish(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.shade_smooth()


def export() -> None:
    obj = bpy.context.scene.objects["surfer"]
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        lo = Vector(map(min, lo, p))
        hi = Vector(map(max, hi, p))
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"[surfer] {hi.x - lo.x:.2f} x {hi.z - lo.z:.2f} x {hi.y - lo.y:.2f} "
          f"from y {lo.z:.2f}  ·  {tris} tris  ·  {len(obj.data.vertices)} verts")
    assert tris <= TRIS_MAX, f"over budget ({tris} > {TRIS_MAX})"
    assert lo.z > 0.05, "the rider's feet are through the deck"

    bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(BLEND))
    bpy.ops.export_scene.gltf(
        filepath=GLB,
        export_format="GLB",
        export_apply=True,
        export_materials="NONE",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=True,
        export_normals=True,
        export_texcoords=False,
        export_tangents=False,
        export_cameras=False,
        export_lights=False,
        # Skins, and still no animations. The armature and its weights go in the
        # file; what it does is `Ship.tsx`'s, read off the sea and the steering
        # rather than baked here as a clip. `export_apply` is safe beside it —
        # the exporter applies every modifier except the armature.
        export_animations=False,
        export_skins=True,
        export_morph=False,
        export_yup=True,
    )
    squeeze(GLB)
    print(f"[surfer] wrote {GLB} and {BLEND}")


def squeeze(path: str) -> None:
    """Quantise what the exporter will not.

    Blender writes `WEIGHTS_0` as four floats a vertex and `COLOR_0` as four
    16-bit values, and has no option for less. glTF itself allows both as
    normalised unsigned bytes — no extension, no decoder — and that is what
    they are here: a weight to 1/255 is more than a skin needs, and the colour
    is toon-shaded flat bands where a step of 1/255 in linear is a step nobody
    can see. It takes the file from about 630 kB gz to under 450 at the second
    pass's vertex count, and the whole of the saving is in those two
    attributes; positions and normals stay float, because quantising those is
    `KHR_mesh_quantization` and a scale on a skinned node, which is a bigger
    conversation than a file size.

    The GLB is one JSON chunk and one binary chunk; every attribute has its own
    buffer view, so the binary is rebuilt view by view and the accessor's type
    is rewritten beside it."""
    import struct  # noqa: PLC0415
    import json  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    raw = open(path, "rb").read()
    jl = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + jl])
    bl = struct.unpack_from("<I", raw, 20 + jl)[0]
    binary = raw[28 + jl:28 + jl + bl]

    def view(i: int) -> bytes:
        bv = doc["bufferViews"][i]
        off = bv.get("byteOffset", 0)
        return binary[off:off + bv["byteLength"]]

    out: dict[int, bytes] = {}
    for prim in doc["meshes"][0]["primitives"]:
        for attr, kind in (("WEIGHTS_0", "w"), ("COLOR_0", "c")):
            ai = prim["attributes"].get(attr)
            if ai is None:
                continue
            acc = doc["accessors"][ai]
            data = view(acc["bufferView"])
            if acc["componentType"] == 5126:
                v = np.frombuffer(data, dtype=np.float32).reshape(-1, 4).astype(np.float64)
            elif acc["componentType"] == 5123:
                v = np.frombuffer(data, dtype=np.uint16).reshape(-1, 4) / 65535.0
            else:
                continue
            q = np.rint(v * 255.0).astype(np.int64)
            if kind == "w":
                # Weights have to sum to exactly one after rounding, or the
                # skin scales; the largest weight takes the rounding error.
                err = 255 - q.sum(axis=1)
                q[np.arange(len(q)), q.argmax(axis=1)] += err
            q = np.clip(q, 0, 255).astype(np.uint8)
            out[acc["bufferView"]] = q.tobytes()
            acc["componentType"] = 5121
            acc["normalized"] = True
            acc.pop("min", None)
            acc.pop("max", None)

    chunks, offset = [], 0
    for i, bv in enumerate(doc["bufferViews"]):
        data = out.get(i, view(i))
        pad = (-len(data)) % 4
        bv["byteOffset"], bv["byteLength"] = offset, len(data)
        if i in out:
            bv["byteStride"] = 4
        chunks.append(data + b"\0" * pad)
        offset += len(data) + pad
    binary = b"".join(chunks)
    doc["buffers"][0]["byteLength"] = len(binary)

    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    body = (struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(binary), 0x004E4942) + binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)
    print(f"[surfer] squeeze: {len(raw) // 1024} kB -> {(12 + len(body)) // 1024} kB")


def preview(path: str) -> None:
    """Four views under a hard key. The scene's own sun comes from behind and
    would light this thing's back, which is the half the visitor sees and the
    half that tells you nothing about whether the face works."""
    key = Vector(T(-0.5, 0.7, 0.7)).normalized()
    bpy.ops.object.light_add(type="SUN")
    sun = bpy.context.object
    sun.data.energy = 4.5
    sun.data.color = (1.0, 0.9, 0.78)
    sun.data.angle = math.radians(4.0)
    sun.rotation_euler = (-key).to_track_quat("-Z", "Y").to_euler()

    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.22, 0.34, 0.48, 1)
    bg.inputs[1].default_value = 0.5
    bpy.context.scene.world = world

    # Vertex colour is the model, so the preview has to show it: one material
    # reading COLOR_0, which is the same thing `Ship.tsx` does.
    mat = bpy.data.materials.new("col")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.55
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
    obj = bpy.context.scene.objects["surfer"]
    obj.data.materials.append(mat)

    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 55
    bpy.context.scene.camera = cam

    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE_NEXT"
    s.render.resolution_x, s.render.resolution_y = 900, 1000
    s.render.image_settings.file_format = "PNG"
    s.eevee.taa_render_samples = 32
    s.view_settings.view_transform = "Standard"

    stem = path[:-4] if path.endswith(".png") else path
    for name, (e, t) in VIEWS.items():
        eye, target = Vector(T(*e)), Vector(T(*t))
        cam.data.lens = 85 if name == "face" else 55
        cam.location = eye
        cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
        s.render.filepath = f"{stem}-{name}.png"
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    build()
    body, hair = bpy.context.scene.objects["body"], bpy.context.scene.objects["hair"]
    # Retopology before the face, because `face_part` fires a ray at the skin to
    # find where a feature sits and the skin it should land on is the one that
    # ships. Before the colour too: Quadriflow does not carry an attribute
    # across, and painting a mesh that is about to be replaced is free work.
    retopo(body, BODY_QUADS)
    crisp(body)
    # The hair too, since it became one shell: a decimate spent its triangles
    # on the bumps and the grid spends them on the scallops between curls,
    # which is where the silhouette is. `retopo` falls back to the decimate on
    # its own if Quadriflow declines.
    retopo(hair, HAIR_QUADS, share=0.002)
    face(body)
    paint(body)
    paint(hair, flat=HAIR)
    for part, colour in FACE_PARTS:
        paint(part, flat=colour)
    # Rigged before the join and not after: bone heat is given the body alone,
    # which is the one closed shell in the scene, and the hair and the face
    # arrive already carrying a `head` group. Joining merges vertex groups by
    # name, so what comes out the other side is one skin with one set of
    # weights — and the modifier that survives a join is the active object's,
    # which is the body's.
    rig(body, [hair] + [part for part, _ in FACE_PARTS])
    obj = join_all()
    finish(obj)
    export()
    if "--render" in sys.argv:
        if "--flex" in sys.argv:
            flex()
        preview(sys.argv[sys.argv.index("--render") + 1])
