import io, sys, os
root = os.path.expanduser('~/mnt/portfolio')

def patch(rel, pairs):
    p = os.path.join(root, rel)
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        if s.count(old) != 1:
            print('NO MATCH (%d) in %s:\n---\n%s\n---' % (s.count(old), rel, old[:200]))
            sys.exit(1)
        s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8').write(s)
    print('patched', rel)

# ---------------------------------------------------------------- Ship.tsx
patch('src/Ship.tsx', [
# 1. CAM_OFFSET doc
("""/** Camera offset from the ship, in world space — the camera does not turn with
 *  yaw. Exported because `Landmarks` measures the visitor's approach from the
 *  ship rather than from the camera, and this is the difference between them. */
export const CAM_OFFSET = new THREE.Vector3(0, 2.4, 7.2) // flat enough to keep the horizon in frame""",
"""/** Where the camera sits relative to the hull: `z` astern of it and `y` above,
 *  in the hull's own frame rather than the world's — the camera comes round
 *  behind the heading now, so +z is "behind" whichever way the ship is pointed
 *  rather than a fixed world direction. Its x is zero and `camYaw`'s arithmetic
 *  in the frame loop assumes it. Neither number changes when the camera turns,
 *  which is why the pitch below, and everything derived from it, is untouched. */
export const CAM_OFFSET = new THREE.Vector3(0, 2.4, 7.2) // flat enough to keep the horizon in frame"""),

# 2. HORIZON preamble — "never turns" is no longer true
(""" * The camera sits `CAM_OFFSET` behind the hull and `hover` above it — 1.5 up
 * over 7.2 back, so it looks down 11.77deg — and it never turns. A perspective""",
""" * The camera sits `CAM_OFFSET` behind the hull and `hover` above it — 1.5 up
 * over 7.2 back, so it looks down 11.77deg. It yaws, and that is exactly why
 * this still holds: swinging round behind the hull changes the bearing and not
 * the 7.2 or the 1.5, so the pitch, and the horizon it puts on the screen, are
 * the same at every heading. Only a change to the offset itself moves it. A perspective"""),

# 3. the camera's lag constants
("""const CAM_LAG = 3.5""",
"""const CAM_LAG = 3.5

/**
 * How the camera comes round behind the hull.
 *
 * It chases `yaw` — the heading, not the roll — with a lag, so a turn reads as
 * the world swinging round rather than as a cut. The cap is the part that
 * matters: steering is measured against where the camera points, so a held
 * sideways push turns the ship, which turns the camera, which re-aims the push.
 * That loop is real and it is what a sustained sideways hold is *for* — it
 * carves a circle rather than sliding across the frame. `CAM_SWING_MAX` is what
 * keeps the circle a carve instead of a spin: 0.9 rad/s is seven seconds a
 * revolution, about 8 units of radius at cruise and 20 at full boost.
 *
 * Invariant 6: a rotating world is the one thing on this page that can make
 * somebody ill, so a visitor who asked for less motion gets a camera that still
 * ends up astern and takes four times as long about it.
 */
const CAM_SWING = REDUCED ? 0.7 : 2.6
const CAM_SWING_MAX = REDUCED ? 0.22 : 0.9"""),

# 4. SHIP_XZ uniform
("""export const SHIP = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), sea: 0 }""",
"""export const SHIP = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), sea: 0 }

/**
 * The same hull, as the vec2 the landmarks' shaders measure an approach from.
 * They used to recover it by subtracting a constant `CAM_OFFSET` from the
 * camera, which stopped being a constant the moment the camera started turning
 * with the ship. One uniform, written in the same block of the frame loop as
 * `SHIP` above, and it is a smaller thing to read than the subtraction was.
 */
export const SHIP_XZ = uniform(new THREE.Vector2())"""),
])

# REDUCED is declared below CAM_LAG in the file — move the swing constants after it instead.
p = os.path.join(root, 'src/Ship.tsx')
s = io.open(p, encoding='utf-8').read()
block_start = s.index('/**\n * How the camera comes round behind the hull.')
block_end = s.index('const CAM_SWING_MAX = REDUCED ? 0.22 : 0.9') + len('const CAM_SWING_MAX = REDUCED ? 0.22 : 0.9')
block = s[block_start:block_end]
s = s[:block_start].rstrip('\n') + '\n' + s[block_end:].lstrip('\n')
anchor = "const DAMPING = REDUCED ? 2 * Math.sqrt(SPRING) : DAMP"
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + '\n\n' + block)
io.open(p, 'w', encoding='utf-8').write(s)
print('moved swing constants below REDUCED')
