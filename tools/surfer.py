"""
The rider, fourth pass — the third's mesh and rig, with the drawing painted
back onto his front (`look`) and captured motion for everything he does on
foot (`retarget`, `animate`). See those two sections; what follows is the
third pass's account, and all of it still holds.

The rider, third pass — and the first one whose geometry did not come out of
this file. Phase 4½, still.

    python3 tools/surfer.py                    # tools/surfer.blend, src/models/surfer.glb, src/models/surfboard.glb
    python3 tools/surfer.py --render out.png   # ...and four preview views, on the board
    python3 tools/surfer.py --render out.png --flex   # ...of a stress pose
    python3 tools/surfer.py --no-pack          # ...skipping the meshopt pass (see `pack`)

Where the geometry came from, as CLAUDE.md asks: `tools/surfer-tripo.glb` and
`tools/surfboard-tripo.glb` are AI-generated (Tripo), from Seb's reference —
which is `tools/surfer-reference.jpg`, the drawing itself —
a man in an A-pose, quad topology, one 4096² basecolour each with no lighting
baked in, no rig, no vertex colour. They are the *source* and this script is
what turns them into the two files `Ship.tsx` loads. Nothing here sculpts:
the metaball field, the retopology and the painted COLOR_0 of the first two
passes are in git, and what replaced them is a rig laid over somebody else's
mesh, which is a different job with a different set of things to get right.

Three of them, and they were the whole file until the fourth pass. The
motion is from Mixamo (`tools/mixamo/*.fbx`, Adobe's free library, on its own
stock skeleton) and nothing here animates by hand.

*Where the joints are.* A mesh from a generator arrives with no skeleton and
no opinion about where one goes, and the seventeen bones `Ship.tsx` bends have
to start somewhere anatomically defensible or the knees fold in the shin.
`joints()` reads them off the mesh: the *heights* of a hip, a knee, a shoulder
are fractions of stature that hold for every adult, so those are constants,
and only the across and fore-aft of each joint is measured — as the centre of
the limb's own cross-section at that height, the arm split from the body by
the gap between them. It is the same idea as the pose list the old rider was
built along, read off the skin instead of written first.

*The rest pose is still the crouch.* `Ship.tsx` writes every rotation relative
to the file's rest pose and reads every joint, every bone length and both
ankles off it, so a rider with no input has to *be* the reviewed stance and
not an A-pose plus a stance layer somewhere in TypeScript. So the rig is built
on the A-pose, where bone heat works and the weights come out clean, and then
posed — the torso, head and arms by aiming each bone along the old pose's own
directions, the legs by the same two-bone solve the runtime uses, to the same
two ankles — and that pose is *applied as the rest pose*. What is exported is
a crouching man whose skeleton has never known anything else, which is what
the runtime contract says.

*The board is a file now too.* It was two solids of revolution and three
foils in `Ship.tsx` for as long as the rider was metaballs; both came from the
same reference and both came back from the same generator, and a modelled
rider on a procedural board is two drawing styles on one craft. The leash,
the cuff and the wake stay in `Ship.tsx` — they are built between the board
and the man, and only the runtime knows where both are.

Coordinates are three.js space and board space, as before: +z is the nose,
x across the deck, y from the waterline, and `T()` turns any of them into
Blender's Z-up. The generator's own axes are undone in `load()`.
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys

import bpy  # noqa: I001 — bpy first: it is what puts bmesh, mathutils and numpy on the path
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from landmark import T, start  # noqa: E402

SRC_RIDER = "tools/surfer-tripo.glb"
SRC_BOARD = "tools/surfboard-tripo.glb"
GLB = "src/models/surfer.glb"
BOARD_GLB = "src/models/surfboard.glb"
BLEND = "tools/surfer.blend"

# Standing, soles to crown. The first two riders stood about this tall above
# the deck once the crouch was straightened out, and the camera, the board and
# the carry are all sized against it.
HEIGHT = 1.70
# Nose to tail. The procedural board was 2.3 and read long against a 1.7 m
# man; the generator drew a shortboard, which is what the reference rode.
BOARD_LEN = 2.0
# Where the keel sits: on the waterline, deck clear of it, as before — a board
# under a rider planes rather than floats.
KEEL_Y = 0.0

# Textures. Seb chose fidelity over the ~600 kB guideline in CLAUDE.md, and
# the overrun is written down in docs/STATUS.md: the rider keeps every one of
# his 91k triangles and a 2048² basecolour; the board, which nobody looks at
# for long, is decimated and gets 1024².
TEX = 2048
BOARD_TEX = 1024
BOARD_TRIS = 10_000
JPEG_QUALITY = 88

# Four views, and the odd one out is `astern`: it is the only angle the visitor
# ever actually gets, so it is the one that decides whether the pose reads.
VIEWS = {
    "astern": ((0.35, 1.35, -3.4), (0.0, 0.72, 0.0)),
    "front": ((0.1, 1.15, 3.2), (0.0, 0.78, 0.1)),
    "quarter": ((2.5, 1.6, 2.3), (0.0, 0.72, 0.05)),
    "face": ((0.55, 1.32, 1.15), (0.06, 1.16, 0.2)),
}

P3 = tuple[float, float, float]

# ------------------------------------------------------------------- the pose
# The stance, third version, and this one is off a photograph Seb sent: a
# regular-footer deep in a barrel, and what the picture says that the first
# two crouches did not is that a surfer stands *across* his board. The trunk
# faces the toe-side rail and the wave, not the nose; the front foot is turned
# forty-five degrees toward it and the front knee bends over that foot, not
# out over the rail; the back foot is nearly square to the stringer and its
# knee is driven forward and in, toward the front one; the seat is down at the
# height of the knees, and the chest is over the front thigh. The leading arm
# reaches down the line, the trailing one hangs aft over the tail.
#
# It is a list of *targets*: the torso, head and arms are aimed along these
# directions with the new man's own bone lengths, and the legs are solved to
# the two ankles exactly, with the knees where 0.38 m of thigh and 0.41 m of
# shin put them in the direction each `KNEE_*` says. Everything is in board
# space before `STANCE`, which slides the whole man aft onto the pads.
#
# His left is +z and his right is -z when he faces -x: left = up × facing,
# and the model's own left was +x when it faced the nose. So F, the leading
# limb, is still his left, and the toe side he faces is -x.
STANCE = -0.50

# Where the trunk faces and where the eyes do. The chest is square to the
# wave; the head is turned down the line, which is the way out of a barrel.
TORSO_F = Vector((-1.0, 0.0, 0.45)).normalized()
GAZE = Vector((-0.45, 0.0, 1.0)).normalized()

# The feet: both ankles where they were, both feet turned to the toe side.
ANKLE_F: P3 = (0.08, 0.20, 0.40)
TOE_F: P3 = (-0.02, 0.14, 0.50)      # forty-five degrees
ANKLE_B: P3 = (-0.07, 0.20, -0.28)
TOE_B: P3 = (-0.20, 0.14, -0.23)     # seventy
# The hips, at knee height. Only their height and the two knee points are
# read from these: the hip joints themselves come off the rig.
HIP_F: P3 = (0.10, 0.45, 0.03)
HIP_B: P3 = (-0.10, 0.47, -0.09)
# Each knee is a *direction*: where it sticks out of the line from its hip to
# its ankle. The front one over its own toes; the back one forward and in.
KNEE_F: P3 = (-0.09, 0.33, 0.39)
KNEE_B: P3 = (-0.285, 0.34, -0.035)

# The trunk, folded forward over the front thigh and turned to the wave. The
# fold is at the waist and not in the pelvis: a pelvis pitched with the trunk
# is a seat stuck out over the heel rail, which Seb saw, and a pelvis kept
# near upright under a chest that leans is a man crouching rather than a man
# bending over.
PELVIS: P3 = (0.0, 0.47, -0.03)
WAIST: P3 = (-0.03, 0.61, -0.01)
CHEST: P3 = (-0.16, 0.76, 0.04)
NECK: P3 = (-0.23, 0.86, 0.09)
HEAD: P3 = (-0.26, 0.98, 0.13)

# The arms. Leading arm down the line, a little bent; trailing arm aft and
# down over the tail. Directions, as everything here: the shoulders are
# wherever the chest puts them.
SHOULDER_F: P3 = (0.05, 0.70, 0.12)
ELBOW_F: P3 = (-0.01, 0.545, 0.37)
WRIST_F: P3 = (-0.09, 0.49, 0.62)
HAND_F: P3 = (-0.12, 0.48, 0.715)
SHOULDER_B: P3 = (0.12, 0.72, -0.20)
ELBOW_B: P3 = (0.21, 0.53, -0.42)
WRIST_B: P3 = (0.27, 0.45, -0.67)
HAND_B: P3 = (0.29, 0.44, -0.77)

RIGHT = GAZE.cross(Vector((0, 1, 0))).normalized()
HEAD_UP = RIGHT.cross(GAZE).normalized()


def V(p) -> Vector:
    return Vector((p[0], p[1], p[2] + STANCE)) if len(p) == 3 else Vector(p)


# --------------------------------------------------------------- the skeleton
# name, parent, and which joint of the A-pose each end is. Seventeen, the same
# seventeen: `Ship.tsx` looks each one up by name once at load. Both arms hang
# off `chest` and both legs off `hips`, unconnected, because a shoulder is not
# where the chest bone ends and a hip joint is at neither end of the pelvis.
#
# `F` is the leading side and it is his left: he rides regular, the model faces
# +z, and his right is -x.
BONES: tuple[tuple[str, str | None, str, str], ...] = (
    ("hips", None, "pelvis", "waist"),
    ("spine", "hips", "waist", "chest"),
    ("chest", "spine", "chest", "neck"),
    ("neck", "chest", "neck", "head"),
    ("head", "neck", "head", "head_top"),
    ("armF_upper", "chest", "shoulder_L", "elbow_L"),
    ("armF_fore", "armF_upper", "elbow_L", "wrist_L"),
    ("armF_hand", "armF_fore", "wrist_L", "hand_L"),
    ("armB_upper", "chest", "shoulder_R", "elbow_R"),
    ("armB_fore", "armB_upper", "elbow_R", "wrist_R"),
    ("armB_hand", "armB_fore", "wrist_R", "hand_R"),
    ("legF_thigh", "hips", "hip_L", "knee_L"),
    ("legF_shin", "legF_thigh", "knee_L", "ankle_L"),
    ("legF_foot", "legF_shin", "ankle_L", "toe_L"),
    ("legB_thigh", "hips", "hip_R", "knee_R"),
    ("legB_shin", "legB_thigh", "knee_R", "ankle_R"),
    ("legB_foot", "legB_shin", "ankle_R", "toe_R"),
)

# Joint heights as fractions of stature — Drillis & Contini, rounded, and the
# two that matter most, hip and knee, checked against this mesh by eye.
LEVEL = {
    "ankle": 0.045, "knee": 0.285, "hip": 0.51, "pelvis": 0.51, "waist": 0.62,
    "chest": 0.74, "neck": 0.855, "head": 0.905, "shoulder": 0.815,
    "elbow": 0.60, "wrist": 0.44,
}


# ------------------------------------------------------------------ the files
def three(obj: bpy.types.Object) -> np.ndarray:
    """Every vertex of `obj`, world space, in three.js axes."""
    n = len(obj.data.vertices)
    co = np.empty(n * 3)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(n, 3) @ np.array(obj.matrix_world.to_3x3()).T + np.array(obj.matrix_world.translation)
    return np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)


def load(path: str, name: str) -> bpy.types.Object:
    """One mesh out of a generator's glb, at the origin, transforms applied.

    `merge_vertices` because the file is split at every UV seam and every hard
    edge — 960 islands by index — and both bone heat and `diffuse` want one
    connected skin. The exporter splits it again on the way out."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path), merge_vertices=True)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    assert len(meshes) == 1, f"{path}: expected one mesh, got {[o.name for o in meshes]}"
    obj = meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for o in new:
        if o is not obj:
            bpy.data.objects.remove(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = obj.data.name = name
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"[surfer] {path}: {len(obj.data.vertices)} verts, {len(obj.data.polygons)} faces, {tris} tris")
    return obj


def place(obj: bpy.types.Object, m: Matrix) -> None:
    obj.matrix_world = m @ obj.matrix_world
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def fit_rider(obj: bpy.types.Object) -> None:
    """Stand him `HEIGHT` tall on y = 0, centred across."""
    p = three(obj)
    s = HEIGHT / (p[:, 1].max() - p[:, 1].min())
    place(obj, Matrix.Scale(s, 4))
    p = three(obj)
    place(obj, Matrix.Translation(T(-(p[:, 0].max() + p[:, 0].min()) / 2, -p[:, 1].min(), 0)))


def fit_board(obj: bpy.types.Object) -> None:
    """Nose to +z, `BOARD_LEN` long, keel on `KEEL_Y`, centred.

    The generator laid it along x with the nose at -x; a rotation about y in
    three.js is one about Z in Blender. The keel is the lowest point of the
    hull *amidships*, because the lowest point of the whole thing is a fin."""
    place(obj, Matrix.Rotation(math.pi / 2, 4, "Z"))
    p = three(obj)
    assert p[:, 2].max() - p[:, 2].min() > p[:, 0].max() - p[:, 0].min(), "the board is not along z"
    place(obj, Matrix.Scale(BOARD_LEN / (p[:, 2].max() - p[:, 2].min()), 4))
    p = three(obj)
    mid = p[np.abs(p[:, 2]) < 0.2 * BOARD_LEN]
    place(obj, Matrix.Translation(T(-(p[:, 0].max() + p[:, 0].min()) / 2,
                                    KEEL_Y - mid[:, 1].min(),
                                    -(p[:, 2].max() + p[:, 2].min()) / 2)))
    p = three(obj)
    low = p[p[:, 1] < p[:, 1].min() + 0.02]
    print(f"[surfer] board: {p[:, 0].max() - p[:, 0].min():.2f} beam, "
          f"deck {deck(obj, 0, 0):.3f} amidships, fins to {p[:, 1].min():.3f} at z {low[:, 2].mean():.2f}")
    assert low[:, 2].mean() < 0, "the fins are at the nose: the board is backwards"


def deck(board: bpy.types.Object, x: float, z: float) -> float:
    """The top of the board under (x, z), by a ray from above."""
    hit, at, _n, _i = board.ray_cast(T(x, 3.0, z), T(0, -1, 0))
    assert hit, f"no deck under ({x:.2f}, {z:.2f})"
    return at.z


def slim(obj: bpy.types.Object, tris: int) -> None:
    """Collapse-decimate to a budget, UVs kept."""
    have = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if have <= tris:
        return
    mod = obj.modifiers.new("slim", "DECIMATE")
    mod.ratio = tris / have
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    now = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"[surfer] {obj.name}: decimated {have} -> {now} tris")


def texture(obj: bpy.types.Object, size: int) -> None:
    """Shrink the basecolour to `size`² in place; the exporter re-encodes it."""
    for mat in obj.data.materials:
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is not None:
                img = node.image
                if max(img.size) > size:
                    # `scale` rewrites the pixel buffer and nothing else: the
                    # exporter copies a packed image's original bytes unless
                    # it is repacked from the pixels, and 4096² came out.
                    img.scale(size, size)
                    img.pack()
                    print(f"[surfer] {img.name}: -> {size}²")
                img.colorspace_settings.name = "sRGB"


# ----------------------------------------------------------------- the joints
def _slab(P, y, half):
    return P[(P[:, 1] >= y - half) & (P[:, 1] < y + half)]


def _outboard(s, side, h):
    """The cluster of a slab furthest out on one side, split from the body by
    the largest gap in |x|. An A-pose arm hangs clear of the body from the
    armpit to the hand, so below the armpit each slab has two clusters a side;
    above it, one, and that one is the body."""
    s = s[np.sign(s[:, 0]) == side]
    if len(s) < 20:
        return None
    ax = np.sort(np.abs(s[:, 0]))
    gaps = np.diff(ax)
    i = np.argmax(gaps)
    if gaps[i] > 0.006 * h and ax[i + 1] > 0.06 * h:
        return s[np.abs(s[:, 0]) >= ax[i + 1]]
    return None


def joints(P: np.ndarray) -> dict[str, Vector]:
    """Where the joints of a standing A-pose are, from the vertices alone. See
    the top of the file: heights are anthropometry, x and z are the mesh."""
    y0 = P[:, 1].min()
    h = P[:, 1].max() - y0
    Y = {k: y0 + v * h for k, v in LEVEL.items()}
    J: dict[str, np.ndarray] = {}
    body = P[np.abs(P[:, 0]) < 0.14 * h]

    def centre(y, side=0, half=0.01 * h):
        s = _slab(body, y, half)
        if side:
            s = s[np.sign(s[:, 0]) == side]
        return np.array([s[:, 0].mean(), y, s[:, 2].mean()])

    for side, tag in ((1, "L"), (-1, "R")):
        ankle = centre(Y["ankle"], side)
        knee = centre(Y["knee"], side)
        # The legs are one column at hip height, so the joint's x is the
        # thigh's own centre where the two legs part, brought in a little:
        # the femoral head sits inboard of the thigh's middle.
        part = Y["knee"] + 0.1 * h
        for y in np.arange(Y["knee"], Y["hip"], 0.005 * h):
            s = _slab(P, y, 0.0025 * h)
            if len(s) and not np.any(np.abs(s[:, 0]) < 0.012 * h):
                part = y
        thigh = centre(part, side)
        hip = np.array([0.85 * thigh[0], Y["hip"], centre(Y["hip"])[2]])
        J["crotch"] = np.array([0.0, part, centre(Y["hip"])[2]])
        foot = _slab(P, y0 + 0.015 * h, 0.015 * h)
        foot = foot[np.sign(foot[:, 0]) == side]
        toe = foot[np.argmax(foot[:, 2])].copy()
        toe[1] = y0 + 0.01 * h
        J[f"hip_{tag}"], J[f"knee_{tag}"], J[f"ankle_{tag}"], J[f"toe_{tag}"] = hip, knee, ankle, toe

    J["pelvis"] = centre(Y["pelvis"])
    J["waist"] = centre(Y["waist"])
    J["chest"] = centre(Y["chest"])
    J["neck"] = centre(Y["neck"], half=0.005 * h)
    J["head"] = centre(Y["head"], half=0.005 * h)
    J["head_top"] = np.array([J["head"][0], y0 + h, J["head"][2]])

    for side, tag in ((1, "L"), (-1, "R")):
        # Inside the deltoid: half a biacromial breadth off the middle, at the
        # chest's own depth.
        chest = centre(Y["shoulder"] - 0.04 * h)
        shoulder = np.array([side * 0.115 * h, Y["shoulder"], chest[2]])
        e = _outboard(_slab(P, Y["elbow"], 0.01 * h), side, h)
        w = _outboard(_slab(P, Y["wrist"], 0.01 * h), side, h)
        elbow = e.mean(0) if e is not None else shoulder + np.array([side * 0.05 * h, -0.19 * h, 0])
        wrist = w.mean(0) if w is not None else elbow + np.array([0, -0.15 * h, 0.03 * h])
        tip = None
        for y in np.arange(Y["wrist"], Y["wrist"] - 0.15 * h, -0.01 * h):
            c = _outboard(_slab(P, y, 0.005 * h), side, h)
            if c is None:
                break
            tip = c[np.argmin(c[:, 1])]
        hand = tip.copy() if tip is not None else wrist + np.array([0, -0.09 * h, 0])
        J[f"shoulder_{tag}"], J[f"elbow_{tag}"], J[f"wrist_{tag}"], J[f"hand_{tag}"] = shoulder, elbow, wrist, hand
    return {k: Vector(v.tolist()) for k, v in J.items()}


# -------------------------------------------------------------------- the rig
def rig(body: bpy.types.Object, J: dict[str, Vector]) -> bpy.types.Object:
    """The armature on the A-pose, and the weights that tie the skin to it.

    Bone heat first, because with the arms clear of the body it works and is
    better than anything written here — it gets the boundary between a
    deltoid and a pec without somebody painting it. It fails as a *warning*
    and a mesh left mostly unweighted, never an exception, so the count is
    the test, and `diffuse` is the fallback."""
    amt = bpy.data.armatures.new("rig")
    rig_obj = bpy.data.objects.new("rig", amt)
    bpy.context.collection.objects.link(rig_obj)
    bpy.context.view_layer.objects.active = rig_obj
    bpy.ops.object.mode_set(mode="EDIT")
    tails = {name: tail for name, _, _, tail in BONES}
    for name, parent, head, tail in BONES:
        eb = amt.edit_bones.new(name)
        eb.head, eb.tail = T(*J[head]), T(*J[tail])
        if parent is not None:
            eb.parent = amt.edit_bones[parent]
            eb.use_connect = head == tails[parent]
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
        diffuse(body, J)
    else:
        print(f"[surfer] rig: bone heat, {loose} verts unweighted")
    return rig_obj


def diffuse(obj: bpy.types.Object, J: dict[str, Vector], rounds: int = 26, keep: int = 4) -> None:
    """Weights without a solver: claim the nearest bone, then blur along the
    surface. The second pass wrote this and says why it is the one method
    whose blind spot is a forearm hanging beside a thigh; it is unchanged but
    for reading its segments from the joints instead of the pose list."""
    me = obj.data
    segments = [(name, T(*J[head]), T(*J[tail])) for name, _, head, tail in BONES]
    n, m = len(me.vertices), len(segments)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
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
    for i, (name, *_) in enumerate(segments):
        g = obj.vertex_groups.new(name=name)
        for v in np.nonzero(w[:, i] > 1e-4)[0]:
            g.add([int(v)], float(w[v, i]), "REPLACE")
    print(f"[surfer] diffuse: {rounds} rounds")


# ------------------------------------------------------------------- the pose
def _frame(along: Vector, front: Vector) -> Matrix:
    """A rotation whose Y is `along` and whose Z is as much of `front` as is
    square to it — Blender's bone convention, Y down the bone."""
    y = along.normalized()
    z = front - y * front.dot(y)
    if z.length < 1e-6:
        z = y.cross(Vector((1, 0, 0)))
    z.normalize()
    x = y.cross(z)
    return Matrix((x, y, z)).transposed()


def aim(rig_obj: bpy.types.Object, name: str, along: Vector, front_rest: Vector, front: Vector,
        head: Vector | None = None) -> None:
    """Point a bone along `along`, in three.js space, turning the side of it
    that faced `front_rest` in the A-pose to face `front` — so a kneecap that
    faced forward faces the way the knee now bends, and the twist of every
    limb is decided rather than left to the shortest rotation.

    Absolute, in armature space: the rest frame is read off the armature, the
    target frame is built from the arguments, and the pose matrix is set to
    take one to the other. The parent's pose only moves the head, which is
    read back after the parent was set."""
    pb = rig_obj.pose.bones[name]
    rest = rig_obj.data.bones[name].matrix_local
    rest_along = rest.to_3x3().col[1]
    Fa = _frame(rest_along, Vector(T(*front_rest)))
    Ft = _frame(Vector(T(*along)), Vector(T(*front)))
    R = Ft @ Fa.inverted() @ rest.to_3x3()
    at = Vector(T(*head)) if head is not None else pb.matrix.translation.copy()
    pb.matrix = Matrix.Translation(at) @ R.to_4x4()
    bpy.context.view_layer.update()


def head_of(rig_obj: bpy.types.Object, name: str) -> Vector:
    """A posed bone's head, three.js space."""
    p = rig_obj.pose.bones[name].matrix.translation
    return Vector((p.x, p.z, -p.y))


def bend(rig_obj: bpy.types.Object, name: str) -> tuple[Vector, float, float]:
    """The direction the joint between a bone and its child points in the
    rest pose — elbow tip, kneecap — and the two rest lengths."""
    a = rig_obj.data.bones[name]
    b = a.children[0]
    A, B, C = a.head_local, b.head_local, b.tail_local
    ac = (C - A).normalized()
    tip = (B - A) - ac * (B - A).dot(ac)
    if tip.length < 1e-4:
        tip = Vector((0, -1, 0))  # a straight limb: its front is the model's, +z
    t = tip.normalized()
    return Vector((t.x, t.z, -t.y)), (B - A).length, (C - B).length


def _tip(a: P3, b: P3, c: P3) -> Vector:
    """The direction the middle point of a chain sticks out of the line
    between its ends — the same vector, for the target pose."""
    A, B, C = V(a), V(b), V(c)
    ac = (C - A).normalized()
    return ((B - A) - ac * (B - A).dot(ac)).normalized()


def pose(rig_obj: bpy.types.Object, board: bpy.types.Object, J: dict[str, Vector]) -> dict[str, Vector]:
    """The crouch, out of the pose list. Returns the joints it landed on."""
    bpy.context.view_layer.objects.active = rig_obj
    bpy.ops.object.mode_set(mode="POSE")
    up = Vector((0, 1, 0))
    fwd = Vector((0, 0, 1))

    # Torso and head: FK along the old bone directions, the hips placed.
    aim(rig_obj, "hips", V(WAIST) - V(PELVIS), fwd, TORSO_F, head=V(PELVIS))
    aim(rig_obj, "spine", V(CHEST) - V(WAIST), fwd, TORSO_F)
    aim(rig_obj, "chest", V(NECK) - V(CHEST), fwd, TORSO_F)
    aim(rig_obj, "neck", V(HEAD) - V(NECK), fwd, GAZE)
    aim(rig_obj, "head", HEAD_UP, fwd, GAZE)

    # Arms: the same, and the twist is the elbow's. Its tip pointed somewhere in
    # the A-pose and points somewhere in the crouch, and mapping one to the
    # other is what keeps the forearm folding the way a forearm does.
    for tag, S, E, W, H in (("armF", SHOULDER_F, ELBOW_F, WRIST_F, HAND_F),
                            ("armB", SHOULDER_B, ELBOW_B, WRIST_B, HAND_B)):
        tip_rest, _, _ = bend(rig_obj, f"{tag}_upper")
        tip = _tip(S, E, W)
        aim(rig_obj, f"{tag}_upper", V(E) - V(S), tip_rest, tip)
        aim(rig_obj, f"{tag}_fore", V(W) - V(E), tip_rest, tip)
        aim(rig_obj, f"{tag}_hand", V(H) - V(W), tip_rest, tip)

    # Legs: two bones to a fixed foot, in closed form — the runtime's own
    # solve, run once here so the file's rest pose is a solution of it. The
    # ankle sits its own rest height above the deck under it, so the sole is
    # on the board, and the foot keeps its rest pitch and takes the old foot's
    # heading.
    out: dict[str, Vector] = {}
    for tag, side, A, K, Hp, TOE in (("legF", "L", ANKLE_F, KNEE_F, HIP_F, TOE_F),
                                     ("legB", "R", ANKLE_B, KNEE_B, HIP_B, TOE_B)):
        hip = head_of(rig_obj, f"{tag}_thigh")
        ankle_h = J[f"ankle_{side}"].y - J[f"toe_{side}"].y + 0.01 * HEIGHT
        target = V(A)
        target.y = deck(board, target.x, target.z) + ankle_h
        knee_rest, l1, l2 = bend(rig_obj, f"{tag}_thigh")
        pole = _tip(Hp, K, A)
        d = target - hip
        span = d.length
        if span > (l1 + l2) * 0.995:
            print(f"[surfer] {tag}: ankle out of reach ({span:.3f} > {l1 + l2:.3f}) — straightening")
            span = (l1 + l2) * 0.995
            target = hip + d.normalized() * span
        along = d.normalized()
        a = (l1 * l1 - l2 * l2 + span * span) / (2 * span)
        h = math.sqrt(max(l1 * l1 - a * a, 0.0))
        side_v = (pole - along * pole.dot(along)).normalized()
        knee = hip + along * a + side_v * h
        aim(rig_obj, f"{tag}_thigh", knee - hip, knee_rest, side_v)
        aim(rig_obj, f"{tag}_shin", target - knee, knee_rest, side_v)
        # The foot: its rest direction, yawed to the old foot's heading.
        rest_foot = J[f"toe_{side}"] - J[f"ankle_{side}"]
        want = V(TOE) - V(A)
        yaw = math.atan2(want.x, want.z) - math.atan2(rest_foot.x, rest_foot.z)
        foot = Matrix.Rotation(yaw, 3, "Y") @ rest_foot
        aim(rig_obj, f"{tag}_foot", foot, up, up)
        out[f"{tag}_hip"], out[f"{tag}_knee"], out[f"{tag}_ankle"] = hip, knee, target
        print(f"[surfer] {tag}: hip {tuple(round(v, 3) for v in hip)}  knee {tuple(round(v, 3) for v in knee)}  "
              f"ankle {tuple(round(v, 3) for v in target)}  reach {span / (l1 + l2):.2f}  "
              f"thigh {l1:.3f} shin {l2:.3f}")
    bpy.ops.object.mode_set(mode="OBJECT")
    return out


def seat(body: bpy.types.Object, J: dict[str, Vector]) -> None:
    """The glutes belong to the pelvis, not to the thighs.

    Bone heat gives the back of the pelvis to whichever thigh is nearer, which
    is right for a thigh and wrong for a buttock: spread the legs into a surf
    stance and the two cheeks go with the two femurs, and what opens between
    them is a split down the seat of the suit. Seb: the butt should stay full
    and round. So, over the band from where the legs part up to the hip joint
    and a little above it, on the back half of the body, thigh weight is handed
    to `hips` — all of it at the top of the band, none at the bottom, a smooth
    ramp between — and the seat rides the pelvis as one piece, with the fold
    where a leg meets it moved down to where a leg actually meets it."""
    lo = J["crotch"].y - 0.02 * HEIGHT
    hi = J["hip_L"].y + 0.05 * HEIGHT
    back = J["pelvis"].z + 0.01 * HEIGHT
    groups = {g.name: g.index for g in body.vertex_groups}
    hips, thighs = groups["hips"], (groups["legF_thigh"], groups["legB_thigh"])
    moved = 0
    for v in body.data.vertices:
        p = v.co
        y, z = p.z, -p.y  # Blender -> three.js
        if not (lo <= y <= hi) or z > back:
            continue
        t = (y - lo) / (hi - lo)
        t = t * t * (3 - 2 * t)
        w = {g.group: g.weight for g in v.groups}
        take = sum(w.get(i, 0.0) for i in thighs) * t
        if take < 1e-4:
            continue
        for i in thighs:
            if i in w:
                body.vertex_groups[i].add([v.index], w[i] * (1 - t), "REPLACE")
        body.vertex_groups[hips].add([v.index], w.get(hips, 0.0) + take, "REPLACE")
        moved += 1
    print(f"[surfer] seat: {moved} verts handed to the hips")


def bake(body: bpy.types.Object, rig_obj: bpy.types.Object) -> None:
    """Make the pose the rest pose. The mesh's armature modifier is applied —
    which writes the crouch into the vertices — the armature's pose is
    applied as rest, and a fresh modifier ties the two together again, with
    the weights untouched through all of it."""
    bpy.context.view_layer.objects.active = body
    mod = next(m for m in body.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = rig_obj
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    body.modifiers.new("rig", "ARMATURE").object = rig_obj
    for pb in rig_obj.pose.bones:
        assert all(abs(s - 1.0) < 1e-6 for s in pb.scale), f"{pb.name}: scaled"


def flex(rig_obj: bpy.types.Object) -> None:
    """A stress pose, for `--render --flex` and for nothing else — every joint
    the runtime bends, further than it ever will, about each bone's own local
    axes. Nothing here is exported."""
    from mathutils import Quaternion  # noqa: PLC0415
    bpy.context.view_layer.objects.active = rig_obj
    bpy.ops.object.mode_set(mode="POSE")
    bend_by = {
        "hips": (0.10, 0.30, 0.0), "spine": (0.16, 0.26, -0.10), "chest": (0.10, 0.30, -0.16),
        "neck": (-0.10, 0.20, 0.0), "head": (-0.14, 0.28, 0.10),
        "armF_upper": (0.45, 0.0, 0.35), "armF_fore": (0.60, 0.0, 0.0), "armF_hand": (0.30, 0.0, 0.0),
        "armB_upper": (-0.40, 0.0, -0.30), "armB_fore": (0.55, 0.0, 0.0), "armB_hand": (-0.25, 0.0, 0.0),
        "legF_thigh": (0.35, 0.0, 0.0), "legF_shin": (0.55, 0.0, 0.0), "legF_foot": (-0.30, 0.0, 0.0),
        "legB_thigh": (0.30, 0.0, 0.0), "legB_shin": (0.50, 0.0, 0.0), "legB_foot": (-0.25, 0.0, 0.0),
    }
    for name, (x, y, z) in bend_by.items():
        pb = rig_obj.pose.bones[name]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (Quaternion((1, 0, 0), x)
                                  @ Quaternion((0, 1, 0), y) @ Quaternion((0, 0, 1), z))
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    print("[surfer] flexed — the preview is a stress pose, not the model")


# ------------------------------------------------------------------- the look
# The fourth pass, and the half of it that is paint. The generator was given
# one picture — `tools/surfer-reference.jpg`, Seb's drawing — and gave back a
# man who is that drawing's *shape* almost exactly and its *face* only
# approximately: the silhouette of the A-pose lies on the drawing's to a few
# pixels (0.95 of the head's area in common), while the face it painted is a
# generic one with a ginger beard, a pale brow and a helmet of hair.
#
# So the drawing is put back on the front of him. Every texel of the
# generator's own atlas is baked out with where it is on the body and which way
# it faces, and a texel that the front view would see — facing the viewer, not
# hidden behind another part of him, and not on the drawing's own outline —
# takes its colour from the drawing at the place it lands in it. The sides and
# the back keep the generator's, and the two are blended over the grazing band
# rather than cut, so the join is a turn of the surface and not a seam.
#
# The drawing's pixel frame, for a man `HEIGHT` tall with his soles on y 0:
# pixels per metre, the column his centre line is in and the row his soles are
# on. Found by matching the two silhouettes — the rendered A-pose against the
# drawing's, as area in common over area in either, 0.917 for the whole man
# and 0.955 for the head — and not by eye.
REF = "tools/surfer-reference.jpg"
REF_FRAME = (1814.0, 2063.0, 3385.0)
# The drawing's backdrop, and how far a pixel must be from it to be him.
REF_GROUND = 209
REF_EDGE = 40
# The face, corrected. The generator put his features a little lower on the
# head than the drawing has them — eyes, brows and mouth 3 to 4 cm down, and
# the face a shade taller — and the head's *outline* matches, so the frame
# above lands the drawing's mouth on the mesh's upper lip. This affine, in the
# drawing's pixels, is where to read the drawing from for a point of the mesh
# that lands at (x, y); found by registering the generator's own painted face
# (splatted into the drawing's frame through the same bake) onto the
# drawing's (OpenCV's ECC, affine, 0.77 correlation), once, and written down
# here rather than rerun. `FACE_BAND` is where it applies: full from the chin
# to the brow, nothing on the neck, and ramped out over the hair so the head's
# outline stays where the silhouettes put it.
FACE_WARP = ((0.965707, -0.013891, 80.410745), (0.000512, 1.043482, -61.110304))
FACE_BAND = (1.40, 1.45, 1.60, 1.68)
# Texels facing the viewer this much and more take the drawing; less than the
# first number, none of it. A surface turned past sixty degrees reads the
# drawing stretched, which is a stripe down his side.
FACING = (0.35, 0.75)


def _grow(mask: np.ndarray, px: int, shrink: bool) -> np.ndarray:
    """Dilate or erode a mask by `px` pixels, with Pillow rather than SciPy."""
    from PIL import Image, ImageFilter  # noqa: PLC0415
    im = Image.fromarray((mask * 255).astype(np.uint8))
    f = ImageFilter.MinFilter if shrink else ImageFilter.MaxFilter
    for _ in range(px // 2):
        im = im.filter(f(5))
    return np.asarray(im) > 127


def _figure() -> tuple[np.ndarray, np.ndarray]:
    """The drawing, 0..1, and a soft mask of the man in it: everything off the
    backdrop, holes filled, pulled in off the outline and feathered — so a
    texel that lands on his edge takes nothing, where the outline and the
    backdrop are, and does not bring a white fringe onto his hair."""
    from PIL import Image, ImageDraw, ImageFilter  # noqa: PLC0415
    img = Image.open(REF).convert("RGB")
    ref = np.asarray(img).astype(np.float32) / 255
    fg = np.abs(ref * 255 - REF_GROUND).max(2) > REF_EDGE
    fg = _grow(_grow(fg, 6, False), 6, True)
    # Fill: flood the backdrop from a corner; what it does not reach is him.
    fl = Image.fromarray((fg * 255).astype(np.uint8))
    ImageDraw.floodfill(fl, (0, 0), 128)
    fg = np.asarray(fl) != 128
    fg = _grow(fg, 20, True)
    soft = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    return ref, np.asarray(soft).astype(np.float32) / 255


def _sample(img: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, img.shape[1] - 2)
    y = np.clip(y, 0, img.shape[0] - 2)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    if img.ndim == 3:
        fx, fy = fx[..., None], fy[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def look(body: bpy.types.Object) -> None:
    """The drawing onto the front of him, in his own atlas, before the rig.

    Three things are baked into the atlas's own layout by Cycles, because it
    is the one thing here that knows which texel is where on a surface: the
    position, the normal, and whether the front view sees that point at all —
    a ray from in front of each vertex, which catches the inside of the arm,
    the gap between the legs and the underside of the chin. The rest is
    arithmetic on the three."""
    from mathutils.bvhtree import BVHTree  # noqa: PLC0415
    me = body.data
    mat = me.materials[0]
    nt = mat.node_tree
    src = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
    N = src.image.size[0]
    # Seen from the front, per vertex.
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    seen = np.zeros(len(me.vertices), np.float32)
    for i, v in enumerate(me.vertices):
        hit = bvh.ray_cast(Vector((v.co.x, -5.0, v.co.z)), Vector((0, 1, 0)))
        if hit[0] is not None and (hit[0] - v.co).length < 0.004:
            seen[i] = 1
    att = me.color_attributes.new("seen", "FLOAT_COLOR", "POINT")
    c = np.repeat(seen, 4)
    c[3::4] = 1
    att.data.foreach_set("color", c)

    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    surface = out.inputs[0].links[0].from_socket if out.inputs[0].links else None
    em = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "seen"
    tgt = nt.nodes.new("ShaderNodeTexImage")
    nt.links.new(em.outputs[0], out.inputs[0])
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 1
    s.render.bake.margin = 16

    def bake(sock, scale, offset) -> np.ndarray:
        img = bpy.data.images.new("_bake", N, N, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        tgt.image = img
        nt.nodes.active = tgt
        m = nt.nodes.new("ShaderNodeVectorMath")
        m.operation = "MULTIPLY_ADD"
        m.inputs[1].default_value = scale
        m.inputs[2].default_value = offset
        nt.links.new(sock, m.inputs[0])
        nt.links.new(m.outputs[0], em.inputs[0])
        bpy.ops.object.bake(type="EMIT")
        a = np.empty(N * N * 4, np.float32)
        img.pixels.foreach_get(a)
        bpy.data.images.remove(img)
        nt.nodes.remove(m)
        return a.reshape(N, N, 4)[..., :3]

    # Encoded into 0..1 on the way out and decoded here, so no bake has to
    # carry a negative number.
    pos = bake(geo.outputs["Position"], (0.5, 0.5, 0.5), (0.5, 0.5, 0.0))
    pos = np.stack([pos[..., 0] * 2 - 1, pos[..., 1] * 2 - 1, pos[..., 2] * 2], -1)
    toward = -(bake(geo.outputs["Normal"], (0.5, 0.5, 0.5), (0.5, 0.5, 0.5))[..., 1] * 2 - 1)
    vis = bake(vc.outputs[0], (1, 1, 1), (0, 0, 0))[..., 0]
    used = np.abs(pos).sum(2) > 1e-3
    for n in (em, geo, vc, tgt):
        nt.nodes.remove(n)
    if surface is not None:
        nt.links.new(surface, out.inputs[0])

    ref, figure = _figure()
    k, cx, y0 = REF_FRAME
    px, py = cx + k * pos[..., 0], y0 - k * pos[..., 2]   # Blender x across, z up
    a, b, c, d = FACE_BAND
    z = pos[..., 2]
    f = np.clip(np.minimum((z - a) / (b - a), (d - z) / (d - c)), 0, 1)
    (m00, m01, m02), (m10, m11, m12) = FACE_WARP
    px, py = (px + f * (m00 * px + m01 * py + m02 - px),
              py + f * (m10 * px + m11 * py + m12 - py))
    t = np.clip((toward - FACING[0]) / (FACING[1] - FACING[0]), 0, 1)
    w = np.clip(vis, 0, 1) * t * t * (3 - 2 * t) * _sample(figure, px, py) * used
    drawn = _sample(ref, px, py)
    have = np.empty(N * N * 4, np.float32)
    src.image.pixels.foreach_get(have)
    have = have.reshape(N, N, 4)
    have[..., :3] = have[..., :3] * (1 - w[..., None]) + drawn * w[..., None]
    src.image.pixels.foreach_set(have.reshape(-1))
    src.image.pack()
    print(f"[surfer] look: {(w > 0.5).sum() / used.sum():.0%} of the atlas from the drawing")


# ------------------------------------------------------------------ the clips
# The fourth pass's other half, and the one Seb asked for first: the man on
# foot moves like a man. The walk, the run, the stand and the hop were solved
# every frame out of the surf crouch — a stride and a bob and a heel roll on
# two IK legs, a pelvis stood up by a quaternion, arms hung from frames — and
# however carefully each number was argued, the sum read as a man walking on
# his knees and running in a lunge. A person's gait is not five sines; it is
# motion capture or it is guesswork.
#
# So on foot he plays captured motion: six Mixamo clips (Adobe's free library,
# fine for use in a project like this one), on their stock skeleton, sampled
# here and laid onto *these* seventeen bones — each bone takes the rotation its
# counterpart makes away from Mixamo's T-pose, applied to this man's own A-pose
# (`retarget`) — and the legs then solved to where Mixamo's ankles went, scaled
# by the ratio of the two men's hips, so the feet land where a foot lands
# rather than where two different thigh-to-shin ratios put them.
#
# Riding is untouched. The board is still `ride()`'s, every joint a sum of the
# sea and the steering, and the file's rest pose is still the crouch. The
# clips only replace what `Ship.tsx` did on land.
#
# The loops are resampled to one cycle each, starting at the frame the left
# ankle is furthest ahead of the pelvis — heel strike — so that one phase
# drives all four and they can be blended by speed without a foot doubling
# back. Root motion stays in the hips' track: the distance a cycle covers is
# the clip's own stride, and `Ship.tsx` reads it off the file and takes it
# back out.
MIXAMO = "tools/mixamo"
# name in the glb, source, first frame, frames per cycle (a loop) or the last
# frame (a one-shot), and keys per second of the source.
CLIPS: tuple[tuple[str, str, float, float, bool, float], ...] = (
    ("idle", "idle", 1, 298, True, 15),
    ("walk", "walk", 0, 37, True, 30),
    ("jog", "jog", 0, 77 / 3, True, 30),
    ("run", "run", 0, 22, True, 30),
    ("sprint", "fastrun", 0, 16, True, 30),
    # The jump in place, cut in two: the flight, from the last push of the
    # toes to the first touch, and the landing after it. `Ship.tsx` runs the
    # first by the arc's own progress and the second by the time since he
    # came down, so neither is a clock.
    ("air", "jump", 23, 40, False, 30),
    ("land", "jump", 40, 56, False, 30),
)
# Ours, and which of Mixamo's each one follows.
FOLLOW = {
    "hips": "Hips", "spine": "Spine1", "chest": "Spine2", "neck": "Neck", "head": "Head",
    "armF_upper": "LeftArm", "armF_fore": "LeftForeArm", "armF_hand": "LeftHand",
    "armB_upper": "RightArm", "armB_fore": "RightForeArm", "armB_hand": "RightHand",
    "legF_thigh": "LeftUpLeg", "legF_shin": "LeftLeg", "legF_foot": "LeftFoot",
    "legB_thigh": "RightUpLeg", "legB_shin": "RightLeg", "legB_foot": "RightFoot",
}

Frame = dict[str, tuple[Matrix, Vector]]


def _rot(m: Matrix) -> Matrix:
    return m.to_3x3().normalized()


def _mixamo(path: str) -> bpy.types.Object:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(path))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    for o in new:
        if o is not arm:
            bpy.data.objects.remove(o)
    return arm


def retarget(rig_obj: bpy.types.Object) -> dict[str, list[Frame]]:
    """Every clip, as each bone's armature-space rotation and head, frame by
    frame, on the A-pose rig. Kept as matrices and not as pose channels,
    because `bake` is about to make a different pose the rest pose, and a
    pose channel is only meaningful against the rest it was written for."""
    bones = rig_obj.data.bones
    order = [b.name for b in bones]  # parents before children
    O0 = {n: _rot(bones[n].matrix_local) for n in order}
    H0 = {n: bones[n].head_local.copy() for n in order}
    out: dict[str, list[Frame]] = {}
    s = bpy.context.scene
    cache: dict[str, bpy.types.Object] = {}
    for name, src, first, span, loop, rate in CLIPS:
        if src not in cache:
            cache[src] = _mixamo(f"{MIXAMO}/{src}.fbx")
        mx = cache[src]
        mb = mx.data.bones
        W = mx.matrix_world
        m = {n: f"mixamorig:{FOLLOW[n]}" for n in order}
        M0 = {n: _rot(W @ mb[m[n]].matrix_local) for n in order}
        # Each of our bones turned from Mixamo's T-pose into ours: the arms
        # hang in an A where his are out in a T, and the rest is a few degrees.
        A = {}
        for n in order:
            d_m = (W @ mb[m[n]].tail_local - W @ mb[m[n]].head_local).normalized()
            d_o = (bones[n].tail_local - bones[n].head_local).normalized()
            A[n] = d_m.rotation_difference(d_o).to_matrix()
        k = H0["legF_thigh"].z / (W @ mb["mixamorig:LeftUpLeg"].head_local).z
        hips_rest = W @ mb["mixamorig:Hips"].head_local
        # The action as a whole: a loop wraps round it, carrying the ground
        # it covers with it, so a cycle may start anywhere in it.
        fs, fe = (int(x) for x in mx.animation_data.action.frame_range)
        period = fe - fs
        s.frame_set(fs)
        h_s = (W @ mx.pose.bones["mixamorig:Hips"].head).copy()
        s.frame_set(fe)
        lap = (W @ mx.pose.bones["mixamorig:Hips"].head) - h_s
        lap.z = 0
        if not loop:
            span = span - first
        if loop and first == 0:
            # Heel strike: the frame the left ankle is furthest ahead of the
            # pelvis, which is -y in Blender for a man walking toward -y.
            best, first = 1e9, 1
            for f in range(fs, fs + int(span)):
                s.frame_set(f)
                a = W @ mx.pose.bones["mixamorig:LeftFoot"].head
                h = W @ mx.pose.bones["mixamorig:Hips"].head
                if a.y - h.y < best:
                    best, first = a.y - h.y, f
        n_keys = max(2, round(span * rate / 30))
        frames: list[Frame] = []
        for i in range(n_keys + 1):
            f = first + span * i / n_keys
            laps = math.floor((f - fs) / period) if loop else 0
            f -= laps * period
            s.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
            P = {n: W @ mx.pose.bones[m[n]].matrix for n in order}
            P["hips"] = Matrix.Translation(lap * laps) @ P["hips"]
            R = {n: _rot(P[n]) @ M0[n].inverted() @ A[n].inverted() @ O0[n] for n in order}
            head: dict[str, Vector] = {}
            for n in order:
                b = bones[n]
                if b.parent is None:
                    head[n] = H0[n] + k * (P[n].translation - hips_rest)
                else:
                    p = b.parent.name
                    head[n] = head[p] + R[p] @ O0[p].inverted() @ (H0[n] - H0[p])
            # The legs, to Mixamo's ankles, scaled: two bones and a pole.
            for tag, side in (("legF", "Left"), ("legB", "Right")):
                th, sh, ft = f"{tag}_thigh", f"{tag}_shin", f"{tag}_foot"
                hip_m = W @ mx.pose.bones[f"mixamorig:{side}UpLeg"].head
                knee_m = W @ mx.pose.bones[f"mixamorig:{side}Leg"].head
                ankle_m = W @ mx.pose.bones[f"mixamorig:{side}Foot"].head
                hip = head[th]
                target = hip + k * (ankle_m - hip_m)
                l1 = (H0[sh] - H0[th]).length
                l2 = (H0[ft] - H0[sh]).length
                d = target - hip
                span_ = min(d.length, (l1 + l2) * 0.999)
                along = d.normalized()
                a = (l1 * l1 - l2 * l2 + span_ * span_) / (2 * span_)
                h = math.sqrt(max(l1 * l1 - a * a, 0.0))
                pole = (knee_m - hip_m) - along * (knee_m - hip_m).dot(along)
                knee = hip + along * a + pole.normalized() * h
                ankle = hip + along * span_
                y1 = R[th].col[1]
                R[th] = y1.rotation_difference((knee - hip).normalized()).to_matrix() @ R[th]
                y2 = R[sh].col[1]
                R[sh] = y2.rotation_difference((ankle - knee).normalized()).to_matrix() @ R[sh]
                head[sh], head[ft] = knee, ankle
            frames.append({n: (R[n], head[n]) for n in order})
        out[name] = frames
        travel = frames[-1]["hips"][1] - frames[0]["hips"][1]
        print(f"[surfer] clip {name}: {len(frames)} keys from {src} {first:.0f}+{span:.1f}, "
              f"k {k:.3f}, travel {-travel.y:.3f} m")
    for mx in cache.values():
        act = mx.animation_data.action if mx.animation_data else None
        bpy.data.objects.remove(mx)
        if act is not None:
            bpy.data.actions.remove(act)
    s.frame_set(0)
    return out


def animate(rig_obj: bpy.types.Object, clips: dict[str, list[Frame]]) -> None:
    """The clips as actions on the rig as it is *now* — the crouch as rest —
    each bone's rotation relative to its parent's pose and its own rest, and
    the hips' head as a location. One action a clip; the exporter writes each
    as one glTF animation, named."""
    bones = rig_obj.data.bones
    bpy.context.view_layer.objects.active = rig_obj
    rig_obj.animation_data_create()
    for pb in rig_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for name, frames in clips.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig_obj.animation_data.action = act
        rate = next(c[5] for c in CLIPS if c[0] == name)
        for i, fr in enumerate(frames):
            t = i * 30 / rate
            pose = {n: Matrix.Translation(h) @ r.to_4x4() for n, (r, h) in fr.items()}
            for b in bones:
                rest = b.matrix_local
                if b.parent is None:
                    basis = rest.inverted() @ pose[b.name]
                else:
                    rel = b.parent.matrix_local.inverted() @ rest
                    basis = rel.inverted() @ pose[b.parent.name].inverted() @ pose[b.name]
                pb = rig_obj.pose.bones[b.name]
                pb.rotation_quaternion = basis.to_quaternion()
                pb.keyframe_insert("rotation_quaternion", frame=t)
                if b.parent is None:
                    pb.location = basis.translation
                    pb.keyframe_insert("location", frame=t)
    rig_obj.animation_data.action = None
    for pb in rig_obj.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)


# ----------------------------------------------------------------- the export
def export(objs: list[bpy.types.Object], glb: str, skins: bool) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=JPEG_QUALITY,
        export_vertex_color="NONE",
        export_normals=True,
        export_texcoords=True,
        export_tangents=False,
        export_attributes=False,
        export_cameras=False,
        export_lights=False,
        # The rider carries his clips (see `animate`); riding is still
        # `Ship.tsx`'s, read off the sea and the steering.
        export_animations=skins,
        export_animation_mode="ACTIONS",
        export_rest_position_armature=True,
        export_skins=skins,
        export_morph=False,
        export_yup=True,
    )
    print(f"[surfer] wrote {glb}")


# The one build-time tool this pipeline has beyond Blender, and it is the
# lever CLAUDE.md named. Blender writes float32 everything and the rider is
# 3.7 MB of it; meshopt writes the same triangles in a quarter of the bytes,
# and `three-stdlib` already ships the decoder — drei's `useGLTF` sets it on
# every loader — so the runtime cost of reading it is zero bytes. Pinned, run
# through npx so nothing is added to package.json, and skipped with a warning
# rather than failed when there is no Node, because the uncompressed file is
# the same model and only heavier.
#
# `-vpf -vtf`: float positions and texture coordinates. Integer positions put
# a dequantising scale on the mesh node, which is where `Ship.tsx` grows the
# outline a centimetre along the normal — in that node's units, a centimetre
# would be nothing — and quantised UVs arrive with a texture transform the
# node material would have to be taught. Both cost about 1%.
GLTFPACK = ("npx", "--yes", "gltfpack@0.24.0")


def pack(glb: str) -> None:
    if shutil.which("npx") is None:
        print(f"[surfer] no npx: {glb} left uncompressed — install Node and rerun for the meshopt file")
        return
    before = os.path.getsize(glb)
    run = subprocess.run([*GLTFPACK, "-i", glb, "-o", glb, "-cc", "-kn", "-km", "-vpf", "-vtf"],
                         capture_output=True, text=True)
    if run.returncode != 0:
        print(f"[surfer] gltfpack failed on {glb}, left uncompressed:\n{run.stderr.strip()}")
        return
    print(f"[surfer] packed {glb}: {before / 1e6:.2f} -> {os.path.getsize(glb) / 1e6:.2f} MB")


def preview(path: str, rig_obj: bpy.types.Object) -> None:
    """Four views under a hard key, rider on the board. The scene's own sun
    comes from behind and would light his back, which is the half the visitor
    sees and the half that tells you nothing about whether the face works."""
    key = Vector(T(-0.5, 0.7, 0.7)).normalized()
    bpy.ops.object.light_add(type="SUN")
    sun = bpy.context.object
    sun.data.energy = 4.0
    sun.data.angle = math.radians(4.0)
    sun.rotation_euler = (-key).to_track_quat("-Z", "Y").to_euler()
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.22, 0.34, 0.48, 1)
    bg.inputs[1].default_value = 0.6
    bpy.context.scene.world = world
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE_NEXT"
    s.render.resolution_x, s.render.resolution_y = 900, 1000
    s.render.image_settings.file_format = "PNG"
    s.eevee.taa_render_samples = 24
    s.view_settings.view_transform = "Standard"
    stem = path[:-4] if path.endswith(".png") else path
    for name, (e, t) in VIEWS.items():
        eye, target = Vector(T(*V(e))), Vector(T(*V(t)))
        cam.data.lens = 85 if name == "face" else 55
        cam.location = eye
        cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
        s.render.filepath = f"{stem}-{name}.png"
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    start()
    board = load(SRC_BOARD, "surfboard")
    fit_board(board)
    body = load(SRC_RIDER, "surfer")
    fit_rider(body)
    look(body)
    J = joints(three(body))
    for k, v in J.items():
        print(f"[surfer]   {k:11s} {tuple(round(c, 3) for c in v)}")
    rig_obj = rig(body, J)
    seat(body, J)
    clips = retarget(rig_obj)
    pose(rig_obj, board, J)
    bake(body, rig_obj)
    animate(rig_obj, clips)
    texture(body, TEX)
    slim(board, BOARD_TRIS)
    texture(board, BOARD_TEX)
    p = three(body)
    print(f"[surfer] rider {p[:, 0].max() - p[:, 0].min():.2f} x {p[:, 1].max() - p[:, 1].min():.2f} x "
          f"{p[:, 2].max() - p[:, 2].min():.2f} from y {p[:, 1].min():.3f}")
    bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(BLEND), compress=True)
    export([rig_obj, body], GLB, skins=True)
    export([board], BOARD_GLB, skins=False)
    if "--no-pack" not in sys.argv:
        pack(GLB)
        pack(BOARD_GLB)
    if "--render" in sys.argv:
        if "--flex" in sys.argv:
            flex(rig_obj)
        preview(sys.argv[sys.argv.index("--render") + 1], rig_obj)
