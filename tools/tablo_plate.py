"""
Tablo's plate on the /work stage, rendered rather than generated: a real
distribution board on a dark wall, and under it the sheet its diagram is
drawn on, pinned up with tape — blank, because the diagram is the plate's
overlay (`src/Switchboard.tsx`) and a picture cannot be trusted with an
electrical drawing any more than it could be with a sudoku.

    python3 tools/tablo_plate.py           # src/content/projects/tablo.{base,off}.avif
    python3 tools/tablo_plate.py --fast    # 24 samples, for looking
    python3 tools/tablo_plate.py --measure # only the numbers, no render

Every other plate is cut out of a picture made on OpenArt by `tools/plate.py`.
This one is Blender's from the start, Cycles at the plate's own proportions,
in the same light the others were asked for: one warm lamp, low, from the
upper left, and the rest of the room dark. It is rendered twice from the same
camera — every lever up, then every lever down — and the overlay cuts a
device's patch out of the second picture when it is switched off, so a lever
that moves is the renderer's own lever and not a drawing of one.

Last, it prints where everything landed in the plate's 900 × 1162 units —
each device's lever box and label strip, the indicator's lens, the sheet's
four corners — which is `PLATE` in `src/tablo.ts`. Change the scene and paste
the numbers again; `tablo.check.ts` holds the sheet's corners to them.

Blender coordinates throughout, metres: X right, Z up, the wall at y = 0 and
the camera out at -Y. The board is life size — 18 mm a module.
"""

from __future__ import annotations

import json
import math
import sys

import bpy
import bmesh
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

W, H = 900, 1162  # the plate
SCALE = 1.5  # rendered at 1.5x and resized down: the levers want the pixels
OUT = "src/content/projects/tablo"

MOD = 0.018
ROWS = (0.372, 0.262)  # row centres, z
SLOT_H = 0.046
RAIL = 12  # modules a row
# kind, row, slot, modules, ref — row 0 and row 1 as `DEVICES` in `tablo.ts`,
# with an indicator lamp after D, which the world's board does not need.
DEVICES = [
    ("main", 0, 0, 2, None), ("rcd", 0, 2, 2, 0),
    ("breaker", 0, 4, 1, 0), ("breaker", 0, 5, 1, 1), ("breaker", 0, 6, 1, 2),
    ("rcd", 1, 0, 2, 1), ("breaker", 1, 2, 1, 3), ("lamp", 1, 3, 1, None),
]
X0 = -RAIL * MOD / 2
FACE_Y = -0.094  # the modules' faces, recessed behind the cover
COVER_Y = -0.1
SHEET = dict(w=0.297, h=0.42, cz=-0.068, tilt=math.radians(-1.3))
THROW = math.radians(32)


def mat(name, rgb, rough=0.5, metal=0.0, emit=None, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if transmission:
        p.inputs["Transmission Weight"].default_value = transmission
    if emit:
        p.inputs["Emission Color"].default_value = (*emit[0], 1)
        p.inputs["Emission Strength"].default_value = emit[1]
    return m


def plaster(name):
    """The wall: dark warm plaster, its unevenness in the bump and a little in
    the colour. Noise is fine here — this is a photograph's wall, not a shader
    in the world."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = 0.92
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 38.0
    tex.inputs["Detail"].default_value = 9.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.05, 0.045, 0.04, 1)
    ramp.color_ramp.elements[1].color = (0.085, 0.075, 0.065, 1)
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    return m


def cube(name, x0, x1, y0, y1, z0, z1, material, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((
            x0 + (v.co.x + 0.5) * (x1 - x0), y0 + (v.co.y + 0.5) * (y1 - y0), z0 + (v.co.z + 0.5) * (z1 - z0),
        ))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new("b", "BEVEL")
        b.width = bevel
        b.segments = 3
    return o


def cut(target, cutter):
    m = target.modifiers.new("cut", "BOOLEAN")
    m.operation = "DIFFERENCE"
    m.object = cutter
    m.solver = "EXACT"
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def lever(name, cx, cz, w, up, material):
    """A toggle: a stubby block hinged at the module's face, up or down."""
    o = cube(name, -w / 2, w / 2, -0.016, 0.0, -0.005, 0.005, material, bevel=0.0012)
    o.matrix_world = Matrix.Translation((cx, FACE_Y - 0.003, cz)) @ Matrix.Rotation(THROW if up else -THROW, 4, "X")
    return o


def build(up: bool):
    white = mat("abs", (0.82, 0.81, 0.78), 0.32)
    face = mat("face", (0.74, 0.74, 0.72), 0.45)
    dark = mat("toggle", (0.035, 0.035, 0.04), 0.4)
    red = mat("main", (0.42, 0.03, 0.025), 0.35)
    blue = mat("rcd", (0.04, 0.1, 0.28), 0.35)
    yellow = mat("test", (0.85, 0.62, 0.05), 0.4)
    paper = mat("paper", (0.83, 0.81, 0.76), 0.85)
    tape = mat("tape", (0.75, 0.66, 0.46), 0.6, transmission=0.15)
    grey = mat("conduit", (0.42, 0.43, 0.45), 0.5)
    lens = mat("lens", (0.45, 0.24, 0.04), 0.15, transmission=0.3)
    ink = mat("print", (0.18, 0.18, 0.19), 0.5)

    # The wall.
    bpy.ops.mesh.primitive_plane_add(size=4.0, location=(0, 0.0, 0.1), rotation=(math.radians(90), 0, 0))
    bpy.context.object.data.materials.append(plaster("wall"))

    # The enclosure: a white box, its front a cover with a slot per row.
    box = cube("box", -0.135, 0.135, -0.1, 0.0, 0.18, 0.455, white, bevel=0.006)
    bpy.context.view_layer.objects.active = box
    bpy.ops.object.modifier_apply(modifier="b")
    for z in ROWS:
        c = cube("slot", X0 - 0.001, -X0 + 0.001, -0.2, -0.005, z - SLOT_H / 2, z + SLOT_H / 2, white)
        cut(box, c)
        # the label strip over each row, and its clear cover
        cube("label", X0, -X0, COVER_Y - 0.0005, COVER_Y + 0.002, z + 0.03, z + 0.043, paper)
    # The supply, in at the top. The circuits leave through the back, into
    # the wall, which keeps the sheet clear.
    for x, z0, z1 in ((0.07, 0.455, 0.9),):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=z1 - z0, location=(x, -0.016, (z0 + z1) / 2))
        bpy.context.object.data.materials.append(grey)

    # The modules, behind their slots: faces, toggles, the RCDs' test buttons.
    used = {0: 0, 1: 0}
    for kind, row, slot, mods, ref in DEVICES:
        a = X0 + slot * MOD
        b = a + mods * MOD
        z = ROWS[row]
        cube(f"face_{kind}_{slot}", a + 0.0004, b - 0.0004, FACE_Y, -0.06, z - SLOT_H / 2 - 0.004, z + SLOT_H / 2 + 0.004, face, 0.0006)
        cx = (a + b) / 2
        if kind == "lamp":
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0055, location=(cx, FACE_Y - 0.001, z + 0.006))
            bpy.context.object.scale = (1, 0.5, 1)
            bpy.context.object.data.materials.append(lens)
        else:
            m = red if kind == "main" else blue if kind == "rcd" else dark
            lever(f"lever_{kind}_{slot}", cx, z, 0.02 if mods == 2 else 0.0085, up, m)
        # the rating, printed under the toggle: a dark window, as on every
        # breaker — the overlay does not write in it, it only has to be there
        if kind != "lamp":
            cube("print", a + 0.0025, b - 0.0025 - (0.006 if kind == "rcd" else 0), FACE_Y - 0.0004, FACE_Y,
                 z - 0.019, z - 0.0125, ink, 0.0002)
        if kind == "rcd":
            cube("test", b - 0.008, b - 0.003, FACE_Y - 0.003, FACE_Y, z - 0.017, z - 0.012, yellow, 0.0005)
        used[row] = max(used[row], slot + mods)
    # Blanking strips over what is left of each rail.
    for row in (0, 1):
        z = ROWS[row]
        cube("blank", X0 + used[row] * MOD + 0.0004, -X0, COVER_Y + 0.001, COVER_Y + 0.004, z - SLOT_H / 2, z + SLOT_H / 2, white, 0.0008)

    # The sheet: A3, a hair off the wall, its foot lifted a few millimetres so
    # it throws a soft shadow, two strips of tape at the top.
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    sh = bpy.context.object
    sh.name = "sheet"
    sh.scale = (SHEET["w"], SHEET["h"], 1)
    sh.rotation_euler = (math.radians(90) + math.radians(1.2), SHEET["tilt"], 0)
    sh.location = (0.0, -0.004, SHEET["cz"])
    sh.data.materials.append(paper)
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_plane_add(size=1.0)
        t = bpy.context.object
        t.scale = (0.05, 0.018, 1)
        t.rotation_euler = (math.radians(90), sx * math.radians(35) + SHEET["tilt"], 0)
        t.location = (sx * (SHEET["w"] / 2 - 0.01), -0.0065, SHEET["cz"] + SHEET["h"] / 2 - 0.006)
        t.data.materials.append(tape)


def light_and_camera(fast: bool):
    s = bpy.context.scene
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.025, 0.035, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.4
    s.world = world

    # One warm lamp, up and to the left and well out in front, close enough
    # to fall off across the frame — the board lit, the foot of the sheet
    # already going dark — and frontal enough that the board's shadow drops
    # a few centimetres and not across the top of the diagram.
    bpy.ops.object.light_add(type="AREA", location=(-0.45, -1.0, 0.82))
    key = bpy.context.object
    key.data.energy = 34
    key.data.size = 0.3
    key.data.color = (1.0, 0.78, 0.55)
    key.rotation_euler = (Vector((0.0, 0.0, 0.2)) - key.location).to_track_quat("-Z", "Y").to_euler()
    # And a cold, faint bounce from the right, so the shadow side is not black.
    bpy.ops.object.light_add(type="AREA", location=(0.9, -0.9, 0.0))
    fill = bpy.context.object
    fill.data.energy = 1.2
    fill.data.size = 1.0
    fill.data.color = (0.6, 0.72, 1.0)
    fill.rotation_euler = (Vector((0.0, 0.0, 0.1)) - fill.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.camera_add(location=(0.0, -1.75, 0.2))
    cam = bpy.context.object
    s.camera = cam
    target = Vector((0.0, 0.0, 0.094))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.sensor_fit = "VERTICAL"
    cam.data.sensor_height = 24
    # The frame: the board's top margin to the sheet's foot, plus air.
    view_h = 0.8
    cam.data.lens = 12 / math.tan(math.atan((view_h / 2) / (target - cam.location).length))
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (target - cam.location).length
    cam.data.dof.aperture_fstop = 5.6

    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 24 if fast else 96
    s.cycles.use_denoising = True
    s.render.resolution_x = round(W * SCALE)
    s.render.resolution_y = round(H * SCALE)
    s.render.film_transparent = False
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    s.view_settings.exposure = -0.3
    s.render.image_settings.file_format = "PNG"
    return cam


def where(cam, p) -> list[float]:
    v = world_to_camera_view(bpy.context.scene, cam, Vector(p))
    return [round(v.x * W, 1), round((1 - v.y) * H, 1)]


def measure(cam) -> dict:
    """Everything the overlay needs, in plate units."""
    bpy.context.view_layer.update()  # or the camera's matrix is the one it was made with
    devices = []
    for kind, row, slot, mods, ref in DEVICES:
        a = X0 + slot * MOD
        b = a + mods * MOD
        z = ROWS[row]
        # the lever's box, both throws: the whole face of the module
        tl = where(cam, (a, FACE_Y - 0.02, z + SLOT_H / 2 + 0.004))
        br = where(cam, (b, FACE_Y - 0.02, z - SLOT_H / 2 - 0.004))
        lab = [where(cam, p) for p in ((a, COVER_Y - 0.0005, z + 0.043), (b, COVER_Y - 0.0005, z + 0.043),
                                       (b, COVER_Y - 0.0005, z + 0.03), (a, COVER_Y - 0.0005, z + 0.03))]
        devices.append({"kind": kind, "row": row, "slot": slot, "mods": mods, "ref": ref,
                        "box": [tl[0], tl[1], br[0], br[1]], "label": lab})
    tl = where(cam, (-0.135, -0.1, 0.455))
    br = where(cam, (0.135, -0.1, 0.18))
    sh = bpy.data.objects["sheet"]
    corners = [where(cam, sh.matrix_world @ Vector((x, y, 0))) for x, y in ((-0.5, 0.5), (0.5, 0.5), (0.5, -0.5), (-0.5, -0.5))]
    return {"devices": devices, "sheet": corners, "board": [tl[0], tl[1], br[0], br[1]]}


def main() -> None:
    fast = "--fast" in sys.argv
    out = {}
    if "--measure" in sys.argv:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        build(True)
        print("PLATE " + json.dumps(measure(light_and_camera(fast))))
        return
    for up in (True, False):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        build(up)
        cam = light_and_camera(fast)
        path = f"/tmp/tablo-plate-{'on' if up else 'off'}.png"
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        out = measure(cam)
    from PIL import Image

    for tag, layer in (("on", "base"), ("off", "off")):
        im = Image.open(f"/tmp/tablo-plate-{tag}.png").convert("RGB").resize((W, H), Image.LANCZOS)
        im.save(f"{OUT}.{layer}.avif", quality=82)
        im.save(f"/tmp/tablo-plate-{tag}-{W}.png")
    print("PLATE " + json.dumps(out))


if __name__ == "__main__":
    main()
