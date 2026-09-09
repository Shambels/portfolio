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

TRIS_MAX = 20_000

# What Quadriflow is asked for. Quads, so the triangle cost is twice this, and
# it is the body only — the hair is a cloud of curls and a quad grid over it
# would spend the whole budget bridging the gaps between them.
BODY_QUADS = 5_800
HAIR_TRIS = 2_200

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

FOOT_F: P3 = (0.05, 0.14, 0.42)
ANKLE_F: P3 = (0.08, 0.20, 0.40)
KNEE_F: P3 = (0.30, 0.38, 0.44)
HIP_F: P3 = (0.10, 0.58, 0.03)
FOOT_B: P3 = (-0.05, 0.14, -0.30)
ANKLE_B: P3 = (-0.07, 0.20, -0.28)
KNEE_B: P3 = (-0.21, 0.42, -0.20)
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
    hit, loc, *_ = skin.ray_cast(T(*HEAD), T(*d))
    assert hit, f"{name}: no skin under the aim {aim}"
    surface = Vector((loc.x, loc.z, -loc.y))  # Blender back to three
    centre = surface - d * sink
    basis = Matrix((T(*RIGHT), T(*HEAD_UP), T(*GAZE))).transposed().to_4x4()
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
BANDS = (
    (-1.00, SUIT, SUIT),
    (-0.30, SUIT_2, SUIT_2),
    (-0.22, NEON_PINK, NEON_BLUE),
    (-0.06, NEON_LIME, NEON_CYAN),
    (0.10, SUIT_2, SUIT_2),
    (0.18, SUIT, SUIT),
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

    # Hairline: high in front, low at the back and the sides. The curls are
    # their own geometry; this is the scalp underneath them, and getting it
    # wrong is what put a fringe over both eyes on the first pass.
    if u > 0.12 + 0.42 * max(f, 0.0):
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


def region(p: Vector) -> Vector:
    """Which colour a point on the body is. Head first, then the bare skin at
    the cuffs, then the suit — the order is the order of exceptions, and it is
    one function so that `paint()` has one thing to ask and the boundaries
    between all three land on face edges together."""
    # 17.5 cm and not 23.5: the head's own surface is inside 16 cm of its
    # centre, and the extra 7 the first pass allowed reached down over the
    # collarbone. With a hard-edged paint that stopped being a soft mistake and
    # became a rectangle of beard on the chest.
    if (p - V(HEAD)).length < 0.175:
        return head_colour(p)
    if p.y > NECK[1] - 0.02 and (p - V(NECK)).length < 0.080:
        return SKIN
    for a, b, r in SKIN_PARTS:
        d = b - a
        t = max(0.0, min(1.0, (p - a).dot(d) / max(d.length_squared, 1e-9)))
        if (p - (a + d * t)).length < r:
            return SKIN
    return suit_colour(p)


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
    _body.resolution = _body.render_resolution = 0.011
    body_obj = bpy.data.objects.new("body", _body)
    bpy.context.collection.objects.link(body_obj)

    _hair = bpy.data.metaballs.new("hair")
    _hair.resolution = _hair.render_resolution = 0.013
    hair_obj = bpy.data.objects.new("hair", _hair)
    bpy.context.collection.objects.link(hair_obj)

    # Feet, flat on the deck and staggered along it, with the toes forward of
    # the ankle so the stance has a direction. Bare — the reference's are.
    for f in (FOOT_F, FOOT_B):
        blob((f[0], f[1] + 0.005, f[2] + 0.03), (0.058, 0.034, 0.120))
        ball((f[0], f[1] + 0.03, f[2] - 0.05), 0.05)  # the heel, under the ankle

    # Legs. A shin is not a cylinder — it has a calf — so both segments taper,
    # and the knee is where two tapers meet rather than a ball hiding a corner.
    taper(ANKLE_F, KNEE_F, 0.052, 0.076)
    taper(KNEE_F, HIP_F, 0.078, 0.112)
    taper(ANKLE_B, KNEE_B, 0.052, 0.076)
    taper(KNEE_B, HIP_B, 0.078, 0.112)

    for ankle, knee, hip in ((ANKLE_F, KNEE_F, HIP_F), (ANKLE_B, KNEE_B, HIP_B)):
        shin = (V(knee) - V(ankle)).normalized()
        thigh = (V(hip) - V(knee)).normalized()
        # The calf sits high on the back of the shin and the quad low on the
        # front of the thigh, and "back" here means away from the knee's own
        # bend — the leg is folded, so the outside of the fold is where the
        # meat goes and it is the bisector that says which way that is.
        outward = (shin - thigh).normalized()
        bulge(V(ankle).lerp(V(knee), 0.62) + outward * 0.028, shin, 0.070, 0.038)
        bulge(V(knee).lerp(V(hip), 0.42) - outward * 0.030, thigh, 0.090, 0.052)
        ball(V(knee) - outward * 0.012, 0.062)  # the cap, so the fold has a front

    # Torso: pelvis, waist, chest. Deeper than wide at the hips and wider than
    # deep at the shoulders, which is the whole difference between a person and
    # a bollard at this size.
    blob(PELVIS, (0.132, 0.100, 0.118))
    blob(WAIST, (0.118, 0.115, 0.100))
    blob(CHEST, (0.185, 0.140, 0.118))

    # And the waist is carved as well as narrowed. Two negative lobes at the
    # flanks, between the bottom rib and the hip, which is the one place a
    # metaball field will not give you a concavity by itself: every positive
    # element it blends with is convex and the sum of convex things is convex.
    for side in (-1, 1):
        blob(V(WAIST) + TORSO_R * (0.145 * side) + Vector((0, 0.012, 0)),
             (0.075, 0.085, 0.090), neg=True)

    # Chest and back. A pec each side of the sternum, a lat sweeping from the
    # armpit down to the waist — the lats are what make a swimmer's back a V
    # from astern, which is the view this model is actually for.
    for side in (-1, 1):
        bulge(V(CHEST) + TORSO_F * 0.072 + TORSO_R * (0.070 * side) + Vector((0, 0.012, 0)),
              TORSO_R, 0.052, 0.052)
        lat_top = V(CHEST) - TORSO_F * 0.030 + TORSO_R * (0.150 * side)
        lat_low = V(WAIST) - TORSO_F * 0.020 + TORSO_R * (0.080 * side)
        taper(lat_top, lat_low, 0.062, 0.040, 4)

    # The glutes, and the reason they are not one blob: a crouch this deep puts
    # the seat out behind the heels, and a single ellipsoid there reads as a
    # tail. Two, set apart, read as a person sitting into the turn.
    for side in (-1, 1):
        blob(V(PELVIS) - TORSO_F * 0.072 + TORSO_R * (0.058 * side) - Vector((0, 0.012, 0)),
             (0.078, 0.072, 0.070))

    # Shoulders. The deltoid is a cap over the joint, not a sphere at it: it
    # runs from the collarbone round to the back, and its front edge is the line
    # that tells you where the arm stops and the chest starts.
    for shoulder, side in ((SHOULDER_F, 1), (SHOULDER_B, -1)):
        arm = (V(ELBOW_F if side > 0 else ELBOW_B) - V(shoulder)).normalized()
        blob(shoulder, (0.082, 0.082, 0.082))
        bulge(V(shoulder) + arm * 0.030, arm.cross(TORSO_F).normalized(), 0.048, 0.060)
        # The trapezius, filling the hollow between the neck and the shoulder.
        # Without it the neck is a post rising out of a plateau.
        taper(V(NECK) - Vector((0, 0.020, 0)), V(shoulder) + Vector((0, 0.010, 0)),
              0.058, 0.062, 4)
        # And the armpit, carved back out from under it.
        ball(V(shoulder) + arm * 0.070 - TORSO_R.normalized() * 0.0 - Vector((0, 0.052, 0)),
             0.048, neg=True)

    # The collarbone shelf: one shallow ridge across the top of the chest. It is
    # four millimetres of relief and it is the single thing that stops the front
    # of the torso reading as a beanbag under a wetsuit.
    bulge(V(CHEST) + TORSO_F * 0.062 + Vector((0, 0.062, 0)), TORSO_R, 0.130, 0.030)

    taper(NECK, (NECK[0], NECK[1] + 0.07, NECK[2] + 0.01), 0.052, 0.056, 2)

    # Arms. Neither is symmetrical: the leading one hangs down and carries on
    # forward past the front knee, the trailing one down and aft past the back
    # one. See the pose points for why they are no longer out wide, and for the
    # five centimetres of clearance that is the only thing keeping each forearm
    # from welding itself to the thigh it passes.
    for shoulder, elbow, wrist, palm in ((SHOULDER_F, ELBOW_F, WRIST_F, HAND_F),
                                         (SHOULDER_B, ELBOW_B, WRIST_B, HAND_B)):
        upper = (V(elbow) - V(shoulder)).normalized()
        fore = (V(wrist) - V(elbow)).normalized()
        taper(shoulder, elbow, 0.072, 0.050)
        taper(elbow, wrist, 0.050, 0.038)
        # Biceps on the inside of the fold, triceps on the outside, and the
        # forearm's meat up by the elbow — the same bisector trick as the leg.
        outward = (upper - fore).normalized()
        bulge(V(shoulder).lerp(V(elbow), 0.52) - outward * 0.020, upper, 0.055, 0.036)
        bulge(V(shoulder).lerp(V(elbow), 0.55) + outward * 0.022, upper, 0.050, 0.032)
        bulge(V(elbow).lerp(V(wrist), 0.30), fore, 0.048, 0.034)
        hand(wrist, palm)

    # The head, the jaw hung off the front of it, and the nose that keeps the
    # profile from being an egg. Smaller than the first pass by a centimetre:
    # at 0.108 it was a fifth of the figure's height and the whole thing read as
    # a bobblehead from astern, which is the only angle that matters.
    ball(HEAD, 0.098)
    jaw = V(HEAD) + GAZE * 0.038 - Vector((0, 0.050, 0))
    ball(jaw, 0.068)
    chin = V(HEAD) + GAZE * 0.062 - Vector((0, 0.066, 0))
    ball(chin, 0.042)
    nose = V(HEAD) + GAZE * 0.098 - Vector((0, 0.010, 0))
    ball(nose, 0.026)
    for side in (-1, 1):
        # A cheekbone and an ear. The cheekbone is what gives the face a plane
        # to catch the key light on; without it the head is a ball with a chin.
        ball(V(HEAD) + RIGHT * (0.062 * side) + GAZE * 0.050 + Vector((0, 0.006, 0)), 0.040)
        ball(V(HEAD) + RIGHT * (0.096 * side) - Vector((0, 0.012, 0)), 0.028)
    # Under the jaw, carved: a head and a neck that meet in a continuous bulge
    # is a snowman, and this is the cut that makes it a chin over a throat.
    ball(V(HEAD) + GAZE * 0.020 - Vector((0, 0.108, 0)), 0.052, neg=True)

    # Curls. Each one is a short arc of three balls rather than a single ball —
    # a clump with a direction, which is what a curl is, and which reads as hair
    # instead of as gravel. They are a *separate* field from the body, so they
    # pile on each other without the head inflating to meet them, and none of
    # them crosses the face.
    for i in range(30):
        a = 2.399963 * i  # the golden angle — no seam, no clumping
        lat = 0.10 + 0.86 * (i / 29)
        rho = math.sqrt(max(1 - lat * lat, 0.0))
        d = (HEAD_UP * lat + RIGHT * math.cos(a) * rho + GAZE * math.sin(a) * rho).normalized()
        if d.dot(GAZE) > 0.05 and d.dot(HEAD_UP) < 0.55:
            continue  # not over the face — a fringe hides both eyes
        root = V(HEAD) + d * 0.086
        # The curl sweeps away from the scalp and sideways, and the sideways
        # part is what stops thirty of them looking like one felt cap.
        side = d.cross(HEAD_UP).normalized() if abs(d.dot(HEAD_UP)) < 0.99 else RIGHT
        r = 0.026 + 0.010 * (0.5 + 0.5 * math.cos(2.3 * i))
        for k in range(3):
            t = k / 2
            c = root + d * (0.012 + 0.030 * t) + side * math.sin(t * 2.6 + i) * 0.026
            ball(c, r * (1.0 - 0.18 * t), _hair)

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


def weld(obj: bpy.types.Object) -> int:
    """Make the marching-cubes output something Quadriflow will accept, and
    return how many non-manifold edges are left over.

    Three things come off a carved metaball field that a remesher will not take.
    Coincident vertices, where the lattice grazed the isosurface — welded here.
    Shards: a negative element parked near the outside of a positive one can
    pinch a few square centimetres of surface off into its own closed shell, and
    a shell that is not the body is not wanted at any budget, so only the
    largest connected run of faces survives. And inconsistent winding, which is
    the one the operator names in its own error message."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)

    # Flood-fill across shared edges: every face reachable from a seed is one
    # shell, and the biggest one is the rider.
    seen: set[int] = set()
    best: list = []
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
        if len(shell) > len(best):
            best = shell
    strays = [f for f in bm.faces if f not in set(best)]
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


def retopo(obj: bpy.types.Object, quads: int) -> None:
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
    bad = weld(obj)
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

    total = 0
    for _ in range(2):
        cuts = []
        for e in bm.edges:
            a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
            ca = col(a)
            if (ca - col(b)).length < 1e-9:
                continue
            lo, hi = 0.0, 1.0
            for _step in range(10):
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
    print(f"[surfer] wrote {GLB} and {BLEND}")


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
    trim(hair, HAIR_TRIS)
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
