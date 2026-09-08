"""
The rider — the surfer's third craft grew a person on it. Phase 4½.

    python3 tools/surfer.py                    # tools/surfer.blend + src/models/surfer.glb
    python3 tools/surfer.py --render out.png   # ...and four preview views

CLAUDE.md asks for a reason before a character gets a model file, and this is
it: the rider is a *body*, and the procedural one was eleven cylinders and eight
spheres pretending to be one. Every other craft in this world is a hull — a
solid of revolution with things bolted to it, which is exactly what code is good
at. A person is a single skin over a skeleton, and the seam where a cylinder
arm meets a sphere shoulder is the one thing no amount of arithmetic in
`Ship.tsx` was going to close.

So the skin is a metaball field: capsules and ellipsoids laid along the pose,
converted to a mesh, decimated to budget. Joints are *blends*, not spheres
covering a corner. The pose is still one list of points — same as the
procedural rider's, moved rather than rewritten — so the crouch stays editable
without touching geometry.

The other half of the reason is colour. The rider wears a wetsuit that is not
one colour, and the landmark pipeline (geometry only, material by name prefix)
has no way to say "magenta ribbon across a black panel" without either a texture
or twenty meshes. This file bakes colour into COLOR_0 instead: one attribute,
one material in `Ship.tsx`, and the suit's ribbons, the beard, the eyes and the
smile are all the same mechanism. It is the only model in the world that
carries its own colour, and it says so here so the landmark rule stays true.

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

SHOULDER_F: P3 = (0.22, 0.92, 0.16)
ELBOW_F: P3 = (0.50, 0.79, 0.40)
WRIST_F: P3 = (0.70, 0.64, 0.55)
HAND_F: P3 = (0.78, 0.58, 0.61)
SHOULDER_B: P3 = (-0.09, 0.94, 0.04)
ELBOW_B: P3 = (-0.40, 1.01, -0.18)
WRIST_B: P3 = (-0.62, 1.12, -0.38)
HAND_B: P3 = (-0.70, 1.16, -0.45)

# Where the face points. Forward and a shade to his open side, which is the only
# way any of the face survives a camera that sits astern and never yaws.
GAZE = Vector((0.30, 0.06, 1.0)).normalized()
RIGHT = GAZE.cross(Vector((0, 1, 0))).normalized()
HEAD_UP = RIGHT.cross(GAZE).normalized()

# ------------------------------------------------------------------- the skin
# A metaball's `radius` is where its influence dies, not where the surface is:
# at the default stiffness of 2 the surface of a lone ball sits at 0.574 of it,
# measured. Everything below is written in real radii and converted here, so the
# numbers in the pose read as centimetres of arm.
ISO = 0.574
STIFF = 2.0

_body: bpy.types.Metaball
_hair: bpy.types.Metaball


def _el(mb, kind: str, at, r: float):
    e = mb.elements.new(type=kind)
    e.co = T(*at) if isinstance(at, tuple) else at
    e.radius = r / ISO
    e.stiffness = STIFF
    return e


def ball(at: P3, r: float, mb=None) -> None:
    _el(mb or _body, "BALL", at, r)


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


def blob(at: P3, size: P3, mb=None) -> None:
    """An ellipsoid — a chest, a pelvis, a foot. `size` is the half-extent in
    three-space (x across the deck, y up, z along it).

    A capsule's `size_x` is a length in object units and an ellipsoid's sizes
    are *multipliers on its radius* — measured, not documented — so the two
    helpers convert differently and both take real centimetres."""
    hx, hy, hz = size
    r = max(size)
    e = _el(mb or _body, "ELLIPSOID", at, r)
    # Blender's y is three's -z and its z is three's y.
    e.size_x, e.size_y, e.size_z = hx / r, hz / r, hy / r


def taper(a: P3, b: P3, r0: float, r1: float, n: int = 7, mb=None) -> None:
    """A limb that thins toward the extremity. Metaballs have no taper, so it is
    n balls down the line — which blends into one smooth cone and costs nothing
    the resolution was not going to spend anyway."""
    va, vb = Vector(a), Vector(b)
    for i in range(n + 1):
        t = i / n
        p = va.lerp(vb, t)
        ball((p.x, p.y, p.z), r0 + (r1 - r0) * t, mb)


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
BROW = srgb("#1c1310")


def suit_colour(p: Vector) -> Vector:
    """The wetsuit's ribbons. One scalar field, sampled per vertex: a wave that
    wraps the body diagonally, warped along its own length so the bands curl the
    way the panels on a real suit do rather than reading as a barber's pole.
    Wide black, narrow neon — the suit is mostly dark and the colour is what
    moves on it.

    The bands are *ramps between stops*, not thresholds. A hard threshold on a
    mesh this coarse gives a zigzag edge a centimetre deep, because the only
    place a colour can change is at a vertex; a ramp puts two or three vertices
    in the transition and reads as an airbrushed panel, which is what the photo
    has anyway.
    """
    x, y, z = p.x, p.y, p.z
    w = math.sin(5.6 * y + 3.6 * x + 2.1 * z + 1.1 * math.sin(4.1 * z + 2.2 * y))
    seam = math.sin(2.3 * y - 4.6 * x + 3.1 * z)
    warm = seam > -0.1
    stops = (
        (-1.00, NEON_CYAN),
        (-0.93, NEON_BLUE if not warm else NEON_PINK),
        (-0.84, SUIT),
        (0.62, SUIT),
        (0.72, NEON_PINK),
        (0.82, NEON_LIME if warm else NEON_CYAN),
        (0.92, NEON_PINK),
        (1.00, NEON_PINK),
    )
    for (w0, c0), (w1, c1) in zip(stops, stops[1:]):
        if w <= w1:
            t = (w - w0) / (w1 - w0) if w1 > w0 else 0.0
            return c0.lerp(c1, max(0.0, min(1.0, t)))
    return SUIT


def head_colour(p: Vector, fwd: Vector, up: Vector, right: Vector) -> Vector:
    """Skin, scalp and beard, as regions on a sphere. The eyes and the mouth are
    not here — they are geometry, up in `face_part`, because paint on a mesh
    this coarse could not hold their edges. What is left is the stubble line,
    which does more for the likeness at this size than the nose does."""
    d = (p - Vector(HEAD)).normalized()
    f, u, s = d.dot(fwd), d.dot(up), d.dot(right)

    # Hairline: high in front, low at the back and the sides. The curls are
    # their own geometry; this is the scalp underneath them, and getting it
    # wrong is what put a fringe over both eyes on the first pass.
    if u > 0.12 + 0.42 * max(f, 0.0):
        return HAIR

    # The beard: jaw and chin, up the sideburn, and a moustache under the nose.
    # Short — stubble over a tan, not a black mask, which is what the first
    # pass painted when this test caught the whole lower half of the face.
    if u < -0.30 + 0.06 * max(f, 0.0) and f > -0.35:
        return BEARD
    if abs(s) > 0.70 and -0.44 < u < 0.10 and f > -0.05:
        return BEARD
    if f > 0.30 and abs(s) < 0.17 and -0.32 < u < -0.22:
        return BEARD
    return SKIN


# ------------------------------------------------------------------ the figure
def build() -> None:
    global _body, _hair
    bpy.ops.wm.read_factory_settings(use_empty=True)

    _body = bpy.data.metaballs.new("body")
    _body.resolution = _body.render_resolution = 0.016
    body_obj = bpy.data.objects.new("body", _body)
    bpy.context.collection.objects.link(body_obj)

    _hair = bpy.data.metaballs.new("hair")
    _hair.resolution = _hair.render_resolution = 0.014
    hair_obj = bpy.data.objects.new("hair", _hair)
    bpy.context.collection.objects.link(hair_obj)

    # Feet, flat on the deck and staggered along it. The stance is what says
    # this is surfing and not standing, and it is bare — the photo's is.
    # Feet, flat on the deck and staggered along it, with the toes forward of
    # the ankle so the stance has a direction.
    for f in (FOOT_F, FOOT_B):
        blob((f[0], f[1] + 0.005, f[2] + 0.03), (0.058, 0.034, 0.120))
        ball((f[0], f[1] + 0.03, f[2] - 0.05), 0.05)  # the heel, under the ankle

    # Legs. A shin is not a cylinder — it has a calf — so both segments taper,
    # and the knee is where two tapers meet rather than a ball hiding a corner.
    taper(ANKLE_F, KNEE_F, 0.058, 0.080)
    taper(KNEE_F, HIP_F, 0.080, 0.112)
    taper(ANKLE_B, KNEE_B, 0.058, 0.080)
    taper(KNEE_B, HIP_B, 0.080, 0.112)

    # Torso: pelvis, waist, chest. Deeper than wide at the hips and wider than
    # deep at the shoulders, which is the whole difference between a person and
    # a bollard at this size.
    blob(PELVIS, (0.140, 0.105, 0.120))
    blob(WAIST, (0.135, 0.115, 0.110))
    blob(CHEST, (0.175, 0.135, 0.120))
    blob(SHOULDER_F, (0.075, 0.075, 0.075))
    blob(SHOULDER_B, (0.075, 0.075, 0.075))
    taper(NECK, (NECK[0], NECK[1] + 0.07, NECK[2] + 0.01), 0.058, 0.062, 2)

    # Arms. Neither is symmetrical: the leading one down over the rail into the
    # face of the wave, the trailing one high and back. It is the pose in the
    # photo and it is also the one that still reads from directly behind.
    taper(SHOULDER_F, ELBOW_F, 0.076, 0.056)
    taper(ELBOW_F, WRIST_F, 0.054, 0.042)
    taper(SHOULDER_B, ELBOW_B, 0.076, 0.056)
    taper(ELBOW_B, WRIST_B, 0.054, 0.042)
    # Hands: a flat mitt, open the way both of the photo's are.
    for wrist, hand in ((WRIST_F, HAND_F), (WRIST_B, HAND_B)):
        d = (Vector(hand) - Vector(wrist)).normalized()
        blob(hand, (0.055, 0.032, 0.055))
        ball((hand[0] + d.x * 0.035, hand[1] + d.y * 0.035, hand[2] + d.z * 0.035), 0.042)

    # The head, the jaw hung off the front of it, and the nose that keeps the
    # profile from being an egg.
    ball(HEAD, 0.108)
    jaw = Vector(HEAD) + GAZE * 0.036 - Vector((0, 0.052, 0))
    ball((jaw.x, jaw.y, jaw.z), 0.074)
    nose = Vector(HEAD) + GAZE * 0.104 - Vector((0, 0.012, 0))
    ball((nose.x, nose.y, nose.z), 0.030)
    for side in (-1, 1):
        c = Vector(HEAD) + RIGHT * 0.100 * side - Vector((0, 0.012, 0))
        ball((c.x, c.y, c.z), 0.030)  # an ear


    # Curls. Twenty-odd balls around the crown at varying distance from the
    # skull, so what comes out is lumpy rather than a swim cap: they are a
    # *separate* field from the body, which is what lets them pile on each other
    # without the head inflating to meet them. None of them crosses the face.
    for i in range(34):
        a = 2.399963 * i  # the golden angle — no seam, no clumping, 34 curls
        lat = 0.14 + 0.82 * (i / 33)
        rho = math.sqrt(max(1 - lat * lat, 0.0))
        d = (HEAD_UP * lat + RIGHT * math.cos(a) * rho + GAZE * math.sin(a) * rho).normalized()
        if d.dot(GAZE) > 0.05 and d.dot(HEAD_UP) < 0.55:
            continue  # not over the face — a fringe hides both eyes
        c = Vector(HEAD) + d * (0.092 + 0.026 * (0.5 + 0.5 * math.sin(3.1 * i)))
        ball((c.x, c.y, c.z), 0.030 + 0.014 * (0.5 + 0.5 * math.cos(2.3 * i)), _hair)

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
    nose, and a smile with teeth in it. The photo's whole expression is that
    smile, so it is the one feature built twice — a dark mouth and a lighter
    band of teeth sitting a few millimetres proud of it."""
    for side in (-1.0, 1.0):
        face_part(skin, "eye", SCLERA, (side * 0.40, 0.06, 0.92), (0.030, 0.020, 0.016), 0.011)
        face_part(skin, "iris", EYE, (side * 0.41, 0.05, 0.91), (0.014, 0.015, 0.014), 0.006)
        face_part(skin, "brow", HAIR, (side * 0.40, 0.30, 0.87), (0.034, 0.009, 0.012), 0.006)
    face_part(skin, "nose", SKIN, (0.0, -0.06, 1.0), (0.022, 0.020, 0.018), 0.014)
    face_part(skin, "mouth", LIP, (0.0, -0.44, 0.90), (0.046, 0.022, 0.016), 0.010)
    face_part(skin, "teeth", TOOTH, (0.0, -0.42, 0.91), (0.036, 0.012, 0.014), 0.004)


def trim(obj: bpy.types.Object, budget: int) -> None:
    """Down to budget, before the colour pass and before the join. Before the
    colour pass because collapse interpolates an attribute it finds and an eye
    is four vertices; before the join because which vertices are hair is a fact
    about which object they came from, and a decimated join has forgotten."""
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


def paint(obj: bpy.types.Object, flat: Vector | None = None) -> None:
    """COLOR_0, one value a vertex. Which region a vertex belongs to is decided
    by where it is against the pose — a hand is near the hand, a shin is near
    the shin — so the suit and the skin agree with the geometry by construction
    rather than by a set of planes that would need moving with it. `flat` paints
    the whole object one colour, which is the hair: the curls are an object, so
    being hair is a fact about the mesh rather than a test on a position."""
    me = obj.data
    attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    if flat is not None:
        for i in range(len(me.vertices)):
            attr.data[i].color = (flat.x, flat.y, flat.z, 1.0)
        return

    up = Vector((0, 1, 0))
    right = GAZE.cross(up).normalized()
    head_up = right.cross(GAZE).normalized()

    # Bare skin ends at the wrists, the ankles and the neck: this is a full
    # steamer, not the shorty the procedural rider wore.
    skin_parts = [
        (Vector(WRIST_F), Vector(HAND_F) + (Vector(HAND_F) - Vector(WRIST_F)) * 0.6, 0.090),
        (Vector(WRIST_B), Vector(HAND_B) + (Vector(HAND_B) - Vector(WRIST_B)) * 0.6, 0.090),
        (Vector((FOOT_F[0], FOOT_F[1], FOOT_F[2] - 0.08)), Vector((FOOT_F[0], FOOT_F[1] + 0.02, FOOT_F[2] + 0.17)), 0.100),
        (Vector((FOOT_B[0], FOOT_B[1], FOOT_B[2] - 0.08)), Vector((FOOT_B[0], FOOT_B[1] + 0.02, FOOT_B[2] + 0.17)), 0.100),
    ]
    head_c = Vector(HEAD)

    for i, v in enumerate(me.vertices):
        # Blender back to three: (x, -z, y) inverted is (x, z, -y).
        p = Vector((v.co.x, v.co.z, -v.co.y))

        if (p - head_c).length < 0.235 and p.y > NECK[1] - 0.02:
            c = head_colour(p, GAZE, head_up, right)
        elif p.y > NECK[1] - 0.02 and (p - Vector(NECK)).length < 0.075:
            c = SKIN
        else:
            c = None
            for a, b, r in skin_parts:
                d = b - a
                t = max(0.0, min(1.0, (p - a).dot(d) / max(d.length_squared, 1e-9)))
                if (p - (a + d * t)).length < r:
                    c = SKIN
                    break
            if c is None:
                c = suit_colour(p)
        attr.data[i].color = (c.x, c.y, c.z, 1.0)


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
        export_animations=False,
        export_skins=False,
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
    face(body)
    trim(body, int(TRIS_MAX * 0.74))
    trim(hair, int(TRIS_MAX * 0.21))
    paint(body)
    paint(hair, flat=HAIR)
    for part, colour in FACE_PARTS:
        paint(part, flat=colour)
    obj = join_all()
    finish(obj)
    export()
    if "--render" in sys.argv:
        preview(sys.argv[sys.argv.index("--render") + 1])
