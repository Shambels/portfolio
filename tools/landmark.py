"""
Shared plumbing for the landmark build scripts — `mine.py`, `easel.py`, and
whatever the board turns out to need.

Not an abstraction over landmarks: there is no base class and no "Landmark"
type, because the three of them have nothing in common except that they are
built in Blender and shipped to the same renderer. This is the same fifteen
functions all three would otherwise carry a copy of — coordinate conversion, a
box between two points, and the export and preview steps.

Run any landmark script with Blender as a Python module, no GUI:

    pip install "bpy==4.5.13"        # needs Python 3.11
    python3 tools/<name>.py                    # .blend + .glb
    python3 tools/<name>.py --render out.png   # ...and three preview views

Coordinates are written in three.js space (+Y up, +Z toward the visitor's
approach) and converted on placement by `T`, so the numbers in a landmark script
line up with `src/Landmarks.tsx` and the MDX frontmatter. Blender's own Z-up is
restored on export.

Nothing here exports materials. Every surface is shaded by the TSL in
`Landmarks.tsx`, and a mesh's name prefix — `rock_`, `frame_`, `panel_`,
`dark_`, `board_` — is what picks which material it gets.
"""

from __future__ import annotations

import math

import bpy  # noqa: I001 — bpy first: it is what puts bmesh and mathutils on the path
import bmesh
from mathutils import Matrix, Quaternion, Vector

# The material keys `Landmarks.tsx` knows. A mesh whose name starts with
# anything else is a black hole in the world, so it is caught here.
# `bark`, `frond` and `bush` are the isle's, shaded by `Isle.tsx` rather than by
# `Landmarks.tsx` — the same convention, a second file reading it.
KEYS = ("rock", "frame", "panel", "dark", "board", "bark", "frond", "bush")


def T(x: float, y: float, z: float) -> Vector:
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    return Vector((x, -z, y))


def clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else v


# ------------------------------------------------------------------- members
# Every timber, beam and stretcher bar in the world is one box between two
# points. Writing them as endpoints rather than as position-plus-rotation is
# what keeps a taper or a splay honest: move the foot and the member follows.


def strut(a, b, w: float, h: float | None = None) -> Matrix:
    va, vb = T(*a), T(*b)
    d = vb - va
    q = Quaternion() if d.length < 1e-9 else Vector((0, 0, 1)).rotation_difference(d.normalized())
    return Matrix.LocRotScale((va + vb) / 2, q, Vector((w, h if h else w, d.length)))


_SCRATCH: list[bpy.types.Mesh] = []


def _scratch() -> bpy.types.Mesh:
    if not _SCRATCH:
        _SCRATCH.append(bpy.data.meshes.new("_scratch"))
    return _SCRATCH[0]


def absorb(bm: bmesh.types.BMesh, tmp: bmesh.types.BMesh) -> None:
    """Fold a scratch bmesh into `bm` and free it."""
    tmp.to_mesh(_scratch())
    bm.from_mesh(_scratch())
    tmp.free()


def add_box(bm: bmesh.types.BMesh, m: Matrix) -> None:
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0, matrix=m)
    absorb(bm, tmp)


def add_slab(bm: bmesh.types.BMesh, centre, size, rx: float = 0.0, ry: float = 0.0,
             rz: float = 0.0) -> None:
    """An axis-aligned box in three-space — `size` is (width, height, depth) the
    way three reads them. `rx` tips it back or forward, `ry` turns it on the
    spot, `rz` tips it sideways. three's axes are a right-handed frame like
    Blender's, only relabelled: a rotation about three's X is Blender's X and
    about three's Y is Blender's Z, both at the same angle, and about three's Z
    is Blender's Y at the opposite one."""
    rot = Matrix.Rotation(ry, 4, "Z") @ Matrix.Rotation(-rz, 4, "Y") @ Matrix.Rotation(rx, 4, "X")
    add_box(bm, Matrix.Translation(T(*centre)) @ rot @ Matrix.Diagonal(
        Vector((size[0], size[2], size[1], 1.0))))


def add_cyl(bm: bmesh.types.BMesh, a, b, r: float, segments: int = 10) -> None:
    """Round member from a to b — the same idea as `strut`, for things that are
    turned rather than sawn: a spindle, a jar, a brush handle."""
    va, vb = T(*a), T(*b)
    d = vb - va
    q = Quaternion() if d.length < 1e-9 else Vector((0, 0, 1)).rotation_difference(d.normalized())
    tmp = bmesh.new()
    bmesh.ops.create_cone(
        tmp, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=d.length,
        matrix=Matrix.LocRotScale((va + vb) / 2, q, Vector((1, 1, 1))),
    )
    absorb(bm, tmp)


def add_prism(bm: bmesh.types.BMesh, profile: list[Vector], flip: bool = False) -> list:
    """Close a ring of points into a solid. `profile` is two equal-length rings,
    front then back, already in Blender space."""
    n = len(profile) // 2
    front = [bm.verts.new(p) for p in profile[:n]]
    back = [bm.verts.new(p) for p in profile[n:]]
    faces = []
    for k in range(n):
        j = (k + 1) % n
        faces.append(bm.faces.new((front[k], back[k], back[j], front[j])))
    faces.append(bm.faces.new(tuple(back)))
    faces.append(bm.faces.new(tuple(reversed(front))))
    bm.normal_update()
    if flip:
        bmesh.ops.reverse_faces(bm, faces=faces)
    return faces


def add_torus(bm: bmesh.types.BMesh, centre: Vector, radius: float, tube: float,
              major: int = 20, minor: int = 6) -> None:
    """A wheel, axis along Blender X (three.js X) — a sheave turns in the plane of
    the shaft it hangs over."""
    rings = []
    for i in range(major):
        a = 2 * math.pi * i / major
        c = centre + Vector((0.0, radius * math.sin(a), radius * math.cos(a)))
        rings.append([
            bm.verts.new(
                c + Vector((
                    tube * math.cos(b), tube * math.sin(b) * math.sin(a), tube * math.sin(b) * math.cos(a),
                ))
            )
            for b in (2 * math.pi * j / minor for j in range(minor))
        ])
    for i in range(major):
        ni = (i + 1) % major
        for j in range(minor):
            nj = (j + 1) % minor
            bm.faces.new((rings[i][j], rings[i][nj], rings[ni][nj], rings[ni][j]))


def lump(bm: bmesh.types.BMesh, centre, scale, seed: float, subdiv: int = 1) -> None:
    """A stone. Jittered off a low-poly sphere and flattened underneath, so it
    sits on the ground rather than balancing on a curve."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=1.0, matrix=Matrix())
    for v in tmp.verts:
        f = 1.0 + 0.26 * math.sin(4.1 * v.co.x + seed) * math.cos(3.3 * v.co.y - seed * 1.7) + 0.12 * math.sin(
            6.7 * v.co.z + seed * 2.3
        )
        v.co *= f
        v.co.z = max(v.co.z, -0.35)
    bmesh.ops.scale(tmp, vec=Vector(scale), verts=tmp.verts)
    bmesh.ops.translate(tmp, vec=T(*centre), verts=tmp.verts)
    absorb(bm, tmp)


# --------------------------------------------------------------------- scene


def start() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_object(name: str, bm: bmesh.types.BMesh) -> bpy.types.Object:
    assert name.split("_")[0] in KEYS, f"{name}: no material key — one of {KEYS}"
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


def join(name: str, objs: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    objs[0].name = objs[0].data.name = name
    return objs[0]


def finish(obj: bpy.types.Object, angle_deg: float, bevel: float = 0.0) -> None:
    """Smooth shading plus an edge split, rather than flat shading everything:
    flat shading unshares every normal and roughly triples the vertex count in
    the export, for a look that is identical on hard-surface geometry."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    if bevel:
        m = obj.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 1
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(35)
        m.harden_normals = False
    m = obj.modifiers.new("split", "EDGE_SPLIT")
    m.split_angle = math.radians(angle_deg)
    m.use_edge_sharp = False


def boolean(target: bpy.types.Object, cutter: bpy.types.Object) -> None:
    mod = target.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


# ------------------------------------------------------------------- the gate
# The blockout box in the frontmatter is a contract, not a note: the island's
# radius, the proximity radius and the ship's clearance are all sized from it,
# and `Landmarks.tsx` asserts the same thing again in the browser. Failing here
# is cheaper than finding a landmark overhanging its island at runtime.


def measure() -> tuple[float, float, float, float, int]:
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    tris = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        tris += sum(len(p.vertices) - 2 for p in me.polygons)
        for v in me.vertices:
            p = ev.matrix_world @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
        ev.to_mesh_clear()
    # Blender (x, -z, y) back to three (x, y, z)
    return (hi.x - lo.x, hi.z - lo.z, hi.y - lo.y, lo.z, tris)


def export(label: str, box: tuple[float, float, float], glb: str, blend: str, tris_max: int = 25_000) -> None:
    w, h, d, floor_y, tris = measure()
    print(f"[{label}] {w:.2f} x {h:.2f} x {d:.2f} from y {floor_y:.2f}  ·  {tris} tris")
    assert w <= box[0] and h <= box[1] and d <= box[2], f"outside the frontmatter box {box}"
    # A tilted member's end cap is square to the member, so a splayed foot buries
    # a corner or two. Wanted — it reads as planted rather than balanced — but it
    # is centimetres, and `Landmarks.tsx` allows the same 0.08.
    assert floor_y >= -0.08, "geometry hangs below the island plateau"
    assert tris <= tris_max, f"over the per-landmark triangle budget ({tris} > {tris_max})"

    bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(blend))
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        export_apply=True,
        export_materials="NONE",
        export_normals=True,
        export_texcoords=False,
        export_tangents=False,
        export_attributes=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_yup=True,
    )
    print(f"[{label}] wrote {glb} and {blend}")


def preview(path: str, views: dict, ortho_scale: float = 6.0, ground: float = 18.0) -> None:
    """Three views, because a landmark is judged from the air on approach and
    then from beside it, and a single hero angle hides whichever side is
    unfinished. `views` maps a name to (eye, target) in three-space; a view named
    `front` is rendered orthographic.

    The light here is deliberately NOT the scene's. Rotated into local space,
    `Scenery.tsx`'s golden-hour sun comes from behind and to the right of every
    landmark, so each one shows the visitor its shadow side, lit by fill alone —
    under which a benched rock face and a smooth one are the same flat grey.
    That is a real problem and it is written up in docs/STATUS.md, but judging
    geometry under it means judging nothing. These renders get a hard key.
    """
    key = Vector(T(-0.55, 0.62, 0.56)).normalized()
    bpy.ops.object.light_add(type="SUN")
    sun = bpy.context.object
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.86, 0.68)
    sun.data.angle = math.radians(3.0)
    sun.rotation_euler = (-key).to_track_quat("-Z", "Y").to_euler()

    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.30, 0.40, 0.56, 1)
    bg.inputs[1].default_value = 0.35
    bpy.context.scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=ground, location=(0, 0, 0))
    bpy.context.object.name = "_plateau"

    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 50
    bpy.context.scene.camera = cam

    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE_NEXT"
    s.render.resolution_x, s.render.resolution_y = 1200, 750
    s.render.image_settings.file_format = "PNG"
    s.eevee.taa_render_samples = 32
    s.view_settings.view_transform = "Standard"

    stem = path[:-4] if path.endswith(".png") else path
    for name, (e, t) in views.items():
        cam.data.type = "ORTHO" if name == "front" else "PERSP"
        cam.data.ortho_scale = ortho_scale
        eye, target = Vector(T(*e)), Vector(T(*t))
        cam.location = eye
        cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
        s.render.filepath = f"{stem}-{name}.png"
        bpy.ops.render.render(write_still=True)
