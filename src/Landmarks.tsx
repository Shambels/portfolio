import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three/webgpu'
import {
  color, floor, fract, max, mix, mx_fractal_noise_float, positionLocal,
  positionWorld, sin, smoothstep, step, vec3,
} from 'three/tsl'
import { LANDMARKS, type Landmark } from './world'

/**
 * The three landmarks: a mine, an easel, a Scrabble board. Track B blockout,
 * one step past grey boxes — enough silhouette that each project is
 * identifiable from the air, and no detail beyond that, because what Track B's
 * exit test judges is the layout and not the shading.
 *
 * Generated like the rest of the world: primitives and TSL, no glTF, no loader,
 * zero asset bytes. BUILD-PLAN's Blender pipeline is not cancelled by this — a
 * detailed model drops in behind this same component in Phase 4, and `App` does
 * not learn about it.
 *
 * `world.ts` stays the source of truth for where a landmark is and how big it
 * may be. Nothing below reads a position: each landmark is modelled in its own
 * local space with +Z toward the visitor's approach, the group is placed and
 * turned from the data, and a dev-only check asserts the built geometry never
 * leaves the blockout box it was given.
 *
 * Known, and not fixed here: the ship hovers 0.45 above the plateau (`GROUND`
 * in `world.ts`), so it flies through the mine and the easel exactly as it flew
 * through their boxes. Both are open frames rather than solid masses, which
 * makes that read as flying among a structure rather than inside a wall — but
 * the real fix is landmark collision or ground following, and that is a
 * flight-controller change.
 */

type P3 = [number, number, number]
type Mats = ReturnType<typeof makeMats>

/** One Scrabble cell. The board is 15 of them square. */
const CELL = 0.36

// One unit box, scaled per mesh: every beam, slab and tile in the world shares
// this single BufferGeometry.
const BOX = new THREE.BoxGeometry(1, 1, 1)

const UP = new THREE.Vector3(0, 1, 0)
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _d = new THREE.Vector3()
const _q = new THREE.Quaternion()

/** Props for a square beam running from a to b. Struts are static, so every
 *  call happens once at module load — nothing here runs per frame or per render. */
function strut(a: P3, b: P3, w: number) {
  _a.set(...a)
  _b.set(...b)
  _d.subVectors(_b, _a)
  const len = _d.length()
  _q.setFromUnitVectors(UP, _d.normalize())
  return {
    position: _a.add(_b).multiplyScalar(0.5).toArray() as P3,
    quaternion: _q.toArray() as [number, number, number, number],
    scale: [w, len, w] as P3,
  }
}
type Strut = ReturnType<typeof strut>

// ---------------------------------------------------------------- materials

const PALETTE = {
  frame: '#6b7385', // steel and timber
  rock: '#79808d',
  panel: '#c4c9d2', // the canvas, the tiles
  dark: '#10151d', // the adit, and anything meant to read as a hole
  board: '#8d94a2',
}
const HI = new THREE.Color('#7dd3fc') // proximity, unchanged from the blockout boxes

function makeMats(hi: boolean) {
  const c = Object.fromEntries(
    Object.entries(PALETTE).map(([k, v]) => [k, new THREE.Color(v).lerp(HI, hi ? 0.72 : 0)]),
  ) as Record<keyof typeof PALETTE, THREE.Color>

  const frame = new THREE.MeshStandardNodeMaterial({ color: c.frame, roughness: 0.72, metalness: 0.15 })
  const panel = new THREE.MeshStandardNodeMaterial({ color: c.panel, roughness: 0.85 })
  const dark = new THREE.MeshStandardNodeMaterial({ color: c.dark, roughness: 1 })

  // Strata. PolarSense reads structure that is already in the file without
  // running it, so the rock is layered before anyone digs — the one piece of
  // metaphor worth spending a shader on this early. Bands read world Y, so they
  // stay level across the benches however the island is turned; the noise is
  // lateral only, which bends a layer without tilting it. Veins-as-columns are
  // Phase 4.
  const rock = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 })
  const wobble = mx_fractal_noise_float(positionWorld.mul(vec3(0.45, 0.1, 0.45)), 2).mul(0.14)
  const band = sin(positionWorld.y.add(wobble).mul(8.5)).mul(0.5).add(0.5)
  rock.colorNode = color(c.rock).mul(smoothstep(0.2, 0.8, band).mul(0.4).add(0.76))

  // The board's 15x15 grid and its premium squares, drawn on the top face
  // instead of built from 225 meshes. `floor(abs(cell))` folds the hash into one
  // quadrant, so the pattern comes out four-fold symmetric — which is what makes
  // a scatter of darker cells read as a Scrabble board rather than as noise.
  const board = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 })
  const cell = positionLocal.xz.div(CELL)
  const edge = fract(cell).sub(0.5).abs()
  const line = smoothstep(0.4, 0.5, max(edge.x, edge.y))
  const q = floor(cell.abs())
  const hash = fract(sin(q.x.mul(12.9898).add(q.y.mul(78.233))).mul(43758.5453))
  board.colorNode = color(c.board)
    .mul(step(0.74, hash).mul(-0.26).add(1))
    .mul(line.mul(-0.45).add(1))

  return { frame, panel, dark, rock, board }
}

// --------------------------------------------------------------- the mine
// PolarSense. An open cut with its benches stepped back, an adit at the foot of
// the face, and a head-frame over the shaft. No ore cart: mines have carts, but
// a cart says nothing about reading a schema, and BUILD-PLAN is explicit that
// the metaphor earns its place or it does not ship.

const SHAFT: P3 = [0.3, 0, 1.0]
const FRAME_TOP = 2.8
const FRAME_LEVELS = [0, 1.35, FRAME_TOP]

/** Corner i (counter-clockwise) of the head-frame at height y. The frame tapers,
 *  so every strut endpoint is this function and the taper is stated once. */
function corner(i: number, y: number): P3 {
  const half = 1 + (0.38 - 1) * (y / FRAME_TOP)
  return [SHAFT[0] + (i === 0 || i === 3 ? -half : half), y, SHAFT[2] + (i < 2 ? -half : half)]
}

const HEADFRAME: Strut[] = (() => {
  const s: Strut[] = []
  for (let i = 0; i < 4; i++) s.push(strut(corner(i, 0), corner(i, FRAME_TOP), 0.14))
  for (let l = 1; l < FRAME_LEVELS.length; l++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      s.push(strut(corner(i, FRAME_LEVELS[l]), corner(j, FRAME_LEVELS[l]), 0.09))
      s.push(strut(corner(i, FRAME_LEVELS[l - 1]), corner(j, FRAME_LEVELS[l]), 0.07))
    }
  }
  // Back-legs: a head-frame leans against the pull of the hoist rope.
  s.push(strut(corner(2, FRAME_TOP - 0.15), [1.05, 0, 2.3], 0.13))
  s.push(strut(corner(3, FRAME_TOP - 0.15), [-0.45, 0, 2.3], 0.13))
  return s
})()

// [width, height, depth, x, y, z] — benches stepping back into the hill.
const BENCHES: [number, number, number, number, number, number][] = [
  [4.4, 0.85, 1.7, 0, 0.425, -1.45],
  [3.6, 0.8, 1.25, 0, 1.25, -1.7],
  [2.6, 0.72, 0.85, 0, 2.01, -1.9],
]
const ADIT_X = -1.3 // clear of the head-frame's near leg, or the portal reads as shadow
const ADIT_FRAME: Strut[] = [
  strut([ADIT_X - 0.55, 0, -0.42], [ADIT_X - 0.55, 0.86, -0.42], 0.12),
  strut([ADIT_X + 0.55, 0, -0.42], [ADIT_X + 0.55, 0.86, -0.42], 0.12),
  strut([ADIT_X - 0.6, 0.86, -0.42], [ADIT_X + 0.6, 0.86, -0.42], 0.14),
]

function Mine(m: Mats) {
  return (
    <>
      {BENCHES.map(([w, h, d, x, y, z], i) => (
        <mesh key={'b' + i} geometry={BOX} material={m.rock} position={[x, y, z]} scale={[w, h, d]} />
      ))}
      <mesh geometry={BOX} material={m.dark} position={[ADIT_X, 0.35, -0.45]} scale={[0.9, 0.7, 0.6]} />
      {ADIT_FRAME.map((s, i) => <mesh key={'a' + i} geometry={BOX} material={m.frame} {...s} />)}
      {HEADFRAME.map((s, i) => <mesh key={'h' + i} geometry={BOX} material={m.frame} {...s} />)}
      {/* Sheave. Axis along X, so the rope drops down the shaft and runs back
          over the top toward the hoist — the reason the back-legs are there. */}
      <mesh material={m.frame} position={[SHAFT[0], 2.95, SHAFT[2]]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.38, 0.07, 8, 28]} />
      </mesh>
      <mesh geometry={BOX} material={m.frame} position={[SHAFT[0], FRAME_TOP + 0.06, SHAFT[2]]} scale={[1.0, 0.1, 1.0]} />
      {/* Spoil. What came out of the hole, which is the point of digging it. */}
      <mesh material={m.rock} position={[-1.55, 0.34, 1.7]}>
        <coneGeometry args={[0.7, 0.68, 14]} />
      </mesh>
    </>
  )
}

// -------------------------------------------------------------- the easel
// Arts by Sandra. A-frame, ledge, canvas. The canvas is deliberately blank:
// what goes on it is a Phase 4 decision, and anything legible painted there
// runs straight into invariant 2.

const LEGS: Strut[] = [
  strut([-0.52, 0, 0.3], [-0.14, 2.72, 0.06], 0.09),
  strut([0.52, 0, 0.3], [0.14, 2.72, 0.06], 0.09),
  strut([0, 0, -0.78], [0, 2.66, -0.1], 0.09),
]

function Easel(m: Mats) {
  return (
    <>
      {LEGS.map((s, i) => <mesh key={i} geometry={BOX} material={m.frame} {...s} />)}
      <mesh geometry={BOX} material={m.frame} position={[0, 1.02, 0.22]} scale={[1.3, 0.1, 0.24]} />
      <mesh geometry={BOX} material={m.frame} position={[0, 1.11, 0.33]} scale={[1.3, 0.16, 0.06]} />
      <mesh geometry={BOX} material={m.frame} position={[0, 2.32, 0.13]} scale={[1.05, 0.1, 0.16]} />
      {/* Leaning back off the ledge, as a canvas does under its own weight. */}
      <mesh geometry={BOX} material={m.panel} position={[0, 1.68, 0.26]} rotation={[-0.09, 0, 0]} scale={[1.36, 1.22, 0.055]} />
    </>
  )
}

// --------------------------------------------------------------- the board
// Scrubble. Grid and premium squares are in the shader; only what stands proud
// of the board is geometry. Tiles are blank — letters are text, and text belongs
// in the DOM (invariant 2). A crossword read comes from the shape of the
// cluster, not from what is written on it.

const PLATE = CELL * 15
const at = (i: number, j: number): P3 => [(i - 7) * CELL, 0.255, (j - 7) * CELL]
const PLAYED: [number, number][] = [
  [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], // across the star
  [8, 5], [8, 6], [8, 8], // crossing it
]
const RACK = [-1.05, -0.7, -0.35, 0, 0.35, 0.7, 1.05]

function Board(m: Mats) {
  return (
    <>
      <mesh geometry={BOX} material={m.frame} position={[0, 0.08, 0]} scale={[6, 0.16, 6]} />
      <mesh geometry={BOX} material={m.board} position={[0, 0.185, 0]} scale={[PLATE, 0.05, PLATE]} />
      {/* Rim, on all four sides: the board reads as a board and not as a decal. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={BOX} material={m.frame} position={[0, 0.13, s * 2.85]} scale={[6, 0.26, 0.3]} />
          <mesh geometry={BOX} material={m.frame} position={[s * 2.85, 0.13, 0]} scale={[0.3, 0.26, 5.4]} />
        </group>
      ))}
      {PLAYED.map(([i, j]) => (
        <mesh key={`${i},${j}`} geometry={BOX} material={m.panel} position={at(i, j)} scale={[0.34, 0.09, 0.34]} />
      ))}
      {/* The rack, facing the visitor — the side the group is turned toward. */}
      <mesh geometry={BOX} material={m.frame} position={[0, 0.25, 2.17]} scale={[2.5, 0.08, 0.36]} />
      <mesh geometry={BOX} material={m.frame} position={[0, 0.29, 2.38]} scale={[2.5, 0.16, 0.06]} />
      {RACK.map((x) => (
        <mesh key={x} geometry={BOX} material={m.panel} position={[x, 0.335, 2.15]} scale={[0.34, 0.09, 0.3]} />
      ))}
    </>
  )
}

// ----------------------------------------------------------------- the set

const BUILD: Record<string, (m: Mats) => ReactNode> = {
  polarsense: Mine,
  'arts-by-sandra': Easel,
  scrubble: Board,
}

/**
 * The blockout box in `world.ts` is a contract, not a note: island radius,
 * proximity radius and the ship's clearance are all sized from it. Checked in
 * dev, once per landmark, from the geometry actually built — a hand-maintained
 * list of extents would drift the first time a strut moved.
 */
const checked = new Set<string>()
const _box = new THREE.Box3()
const _one = new THREE.Box3()

function fits(g: THREE.Group | null, l: Landmark) {
  if (!g || !import.meta.env.DEV || checked.has(l.slug)) return
  checked.add(l.slug)
  _box.makeEmpty()
  for (const c of g.children) {
    const mesh = c as THREE.Mesh
    if (!mesh.geometry) continue
    mesh.updateMatrix()
    mesh.geometry.computeBoundingBox()
    _one.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrix)
    _box.union(_one)
  }
  const s = _box.getSize(new THREE.Vector3())
  console.assert(
    // A tilted beam's end cap is square to the beam, so a leg foot buries a
    // corner or two. Wanted — it reads as planted rather than balanced — but it
    // is centimetres, not a landmark sinking into its island.
    s.x <= l.size[0] + 0.02 && s.y <= l.size[1] + 0.02 && s.z <= l.size[2] + 0.02 && _box.min.y >= -0.08,
    `${l.slug}: built ${s.toArray().map((n) => n.toFixed(2))} from y ${_box.min.y.toFixed(2)}, ` +
      `world.ts allows ${l.size} from y 0`,
  )
}

export function Landmarks({ near }: { near: string | null }) {
  const [cold, hot] = useMemo(() => [makeMats(false), makeMats(true)], [])
  return (
    <>
      {LANDMARKS.map((l) => (
        // Turned to face the world's centre, which is where the visitor comes
        // from: the adit, the canvas and the tile rack all point at the approach
        // without any of them carrying a hand-tuned angle.
        <group key={l.slug} position={l.pos} rotation-y={Math.atan2(-l.pos[0], -l.pos[2])}>
          <group ref={(g) => { fits(g, l) }}>{BUILD[l.slug]?.(near === l.slug ? hot : cold)}</group>
        </group>
      ))}
    </>
  )
}
