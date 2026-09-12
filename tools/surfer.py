"""
The rider, third pass — and the first one whose geometry did not come out of
this file. Phase 4½, still.

    python3 tools/surfer.py                    # tools/surfer.blend, src/models/surfer.glb, src/models/surfboard.glb
    python3 tools/surfer.py --render out.png   # ...and four preview views, on the board
    python3 tools/surfer.py --render out.png --flex   # ...of a stress pose
    python3 tools/surfer.py --no-pack          # ...skipping the meshopt pass (see `pack`)

Where the geometry came from, as CLAUDE.md asks: `tools/surfer-tripo.glb` and
`tools/surfboard-tripo.glb` are AI-generated (Tripo), from Seb's reference —
a man in an A-pose, quad topology, one 4096² basecolour each with no lighting
baked in, no rig, no vertex colour. They are the *source* and this script is
what turns them into the two files `Ship.tsx` loads. Nothing here sculpts:
the metaball field, the retopology and the painted COLOR_0 of the first two
passes are in git, and what replaced them is a rig laid over somebody else's
mesh, which is a different job with a different set of things to get right.

Three of them, and they are the whole file.

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
# The stance, and it is the second rider's to the number: reviewed from astern,
# arms down and near him, front leg a little straighter than the back one. It
# is a list of *targets* now rather than of joints. The torso, the head and
# the arms are aimed along these directions with the new man's own bone
# lengths, so his elbows and hands land near these points rather than on
# them; the legs are solved to the two ankles exactly, and the knees go where
# 0.38 m of thigh and 0.41 m of shin put them — further out than the old
# 0.43 / 0.25, because these legs are longer and the crouch is the same.
#
# `STANCE` slides the whole man along the board. The generator's pad is at
# the tail, where a pad is, and a back foot ahead of it is a back foot on wax.
STANCE = -0.50

FOOT_F: P3 = (0.05, 0.14, 0.42)
ANKLE_F: P3 = (0.08, 0.20, 0.40)
KNEE_F: P3 = (0.248, 0.384, 0.383)
HIP_F: P3 = (0.10, 0.58, 0.03)
FOOT_B: P3 = (-0.05, 0.14, -0.30)
ANKLE_B: P3 = (-0.07, 0.20, -0.28)
# The back knee only sets the *direction* the leg bends in now (see `pose`),
# and the second rider's knee — level with its own ankle, straight out over
# the rail — sent the longer leg out and back. Seb: the knee should be more
# forward. It points forward and out now, toward the front knee, which is
# where a surfer's back knee is driven.
KNEE_B: P3 = (-0.25, 0.30, -0.10)
HIP_B: P3 = (-0.10, 0.60, -0.09)

PELVIS: P3 = (0.0, 0.60, -0.03)
WAIST: P3 = (0.02, 0.74, 0.02)
CHEST: P3 = (0.06, 0.92, 0.11)
NECK: P3 = (0.07, 1.04, 0.15)
HEAD: P3 = (0.08, 1.17, 0.19)

SHOULDER_F: P3 = (0.22, 0.92, 0.16)
ELBOW_F: P3 = (0.46, 0.62, 0.28)
WRIST_F: P3 = (0.46, 0.532, 0.560)
HAND_F: P3 = (0.46, 0.497, 0.672)
SHOULDER_B: P3 = (-0.09, 0.94, 0.04)
ELBOW_B: P3 = (-0.352, 0.663, -0.029)
WRIST_B: P3 = (-0.453, 0.418, 0.141)
HAND_B: P3 = (-0.489, 0.330, 0.202)

# Where the face points, and where the chest does — less far into the wave, so
# the waist reads as a twist. Both as before.
GAZE = Vector((0.30, 0.06, 1.0)).normalized()
TORSO_F = Vector((0.16, 0.0, 1.0)).normalized()
RIGHT = GAZE.cross(Vector((0, 1, 0))).normalized()
HEAD_UP = RIGHT.cross(GAZE).normalized()
TOE_F: P3 = (FOOT_F[0], FOOT_F[1], FOOT_F[2] + 0.14)
TOE_B: P3 = (FOOT_B[0], FOOT_B[1], FOOT_B[2] + 0.14)


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
        # Skins, and still no animations: what the rig does is `Ship.tsx`'s,
        # read off the sea and the steering rather than baked here as a clip.
        export_animations=False,
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
    J = joints(three(body))
    for k, v in J.items():
        print(f"[surfer]   {k:11s} {tuple(round(c, 3) for c in v)}")
    rig_obj = rig(body, J)
    seat(body, J)
    pose(rig_obj, board, J)
    bake(body, rig_obj)
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
