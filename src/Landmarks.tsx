import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import {
  clamp, color, cos, float, floor, fract, length, max, mix, modelWorldMatrix,
  mx_fractal_noise_float, oneMinus, positionLocal, positionWorld, round, sin, smoothstep,
  step, uniform, vec2, vec3, vec4,
} from 'three/tsl'
import { FLASH, GROUND, LANDMARKS, landmarkYaw, type Landmark } from './world'
import {
  LENSES, PROP_SETS, RAMPS, WALLED, deckAt, footprint, hull2d, makeProp, makeSet,
  type Prop, type PropSet,
} from './plateau'
import { SHIP_XZ } from './Ship'
import mineUrl from './models/mine.glb?url'
import easelUrl from './models/easel.glb?url'
import boardUrl from './models/board.glb?url'
import memojoUrl from './models/memojo.glb?url'
import sudokuUrl from './models/sudoku.glb?url'

/**
 * The five landmarks: a mine, an easel, a Scrabble board, a ramp with a camera
 * watching the end of it, and a sudoku tray. Track B blockout,
 * one step past grey boxes — enough silhouette that each project is
 * identifiable from the air, and no detail beyond that, because what Track B's
 * exit test judges is the layout and not the shading.
 *
 * All three now load a detailed mesh from `MODEL`; the blockout below is what
 * stands in its place while that is in flight, and what a fourth project gets
 * before it is modelled. `Scene` does not learn about any of it.
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
  ore: '#d9a05c', // the veins — the one warm thing in the rock
  glass: '#1b2836', // the lens, which is dark until it is not
}
const HI = new THREE.Color('#7dd3fc') // proximity, unchanged from the blockout boxes

const MATERIAL_KEYS = { frame: 1, panel: 1, dark: 1, rock: 1, board: 1, glass: 1 }

/**
 * How bright the giant camera's lens is, 0 to 1. One uniform for both material
 * sets — the cold one and the proximity-highlighted one are two objects and
 * one lens — written once a frame by `Landmarks` from `FLASH` in `world.ts`.
 */
const flashLevel = uniform(0)
/** How long the flash lasts. Short enough to be a flash: a photographic one is
 *  a thousandth of a second and a thousandth of a second is invisible at 60fps,
 *  so this is the shortest thing the eye can be given instead. */
const FLASH_FOR = 0.16

/** The proximity tint, applied to every colour the same way. */
const shade = (hex: string, hi: boolean) => new THREE.Color(hex).lerp(HI, hi ? 0.72 : 0)

type Vec2 = THREE.Node<'vec2'>

/**
 * How near the visitor is to a point: 1 inside `near`, 0 beyond `far`, in XZ.
 *
 * Measured from the ship and not from the camera. A camera-distance shader
 * would resolve the board, which sits at +Z where the camera used to hang, from
 * the middle of the world, and the easel at -Z only when sitting on top of it.
 * From the ship, "approach" means the same thing at all three: about 13 units
 * out from the centre of the world, about 4 parked at a waypoint.
 *
 * It reads `SHIP_XZ` rather than subtracting `CAM_OFFSET` from the camera,
 * because since the camera swings round behind the heading that subtraction is
 * a bearing and not a constant — and the hull's own position was always the
 * thing being reconstructed.
 */
const approach = (xz: Vec2, near: number, far: number) =>
  oneMinus(smoothstep(near, far, length(xz.sub(SHIP_XZ))))

// Where the easel's painting sits, in the field's own space: [x, y, driftX,
// driftY, radius, colour]. The first three make the canvas on the easel, the
// last two the small finished one leaning on the table. Drift is where a field
// sits when the visitor is far off; at close range every field is at its base.
const CANVAS_FIELDS: [number, number, number, number, number, string][] = [
  [0, 0, -0.42, 0.16, 0.62, '#d9954f'],
  [0, 0, 0.4, -0.24, 0.58, '#b4586a'],
  [0, 0, 0.06, 0.46, 0.52, '#4d7ea8'],
  [2.96, -3.12, -0.14, 0.1, 0.34, '#c8794c'],
  [2.96, -3.12, 0.16, -0.09, 0.3, '#5b7f95'],
]

// The found tiles, mirrored from `tools/board.py`: where they hang, the step
// between them, the tip each one carries, and the height a played tile sits at.
// Change one and change the other — a shader that lands tiles in the wrong
// place is a model bug that no model change can fix.
const FOUND_Y = 0.78
const FOUND_STEP = 0.045
const FOUND_Z = 2 * CELL
const FOUND_TILT = [-0.05, -0.02] // the tip of tile k: FOUND_TILT[0] + k * FOUND_TILT[1]
const TILE_Y = 0.2525 // TOP + TILE_H / 2

// The sudoku tray, mirrored from `tools/sudoku.py`: the grid's pitch, the top
// of a cell line, the tile, and the two well depths the shader reads the
// relief back out of. Change one and change the other — the model is what
// ships, and this is both what stands in for it and what shades it.
const SU_CELL = 0.4
const SU_PLATE = SU_CELL * 9
const SU_RIM = 0.16
const SU_PLINTH = 4.9
const SU_TOP = 0.21
const SU_RAIL = 0.51
const SU_SEAT = SU_RAIL - 0.11
const SU_TILE = 0.34
const SU_TILE_H = 0.15
const WELL_MIN = 0.12 // a cell with two candidates left
const WELL_MAX = 0.24 // a cell with six

/** The board hard-coded into `main()` in the repository's own `sudoku.py`: a
 *  '#' is a clue and a '.' an open cell, and the row index runs along z.
 *  Thirty-one down, fifty to go, one solution. */
const CLUES = [
  '..######.', '#...##...', '#...##...', '..#.#....', '.#.#..###',
  '#..#....#', '..#..##.#', '#......#.', '...#..##.',
]

/** Where the fifty unplaced tiles are stacked on the plinth's border, and how
 *  many in each: `STACKS` in `tools/sudoku.py`. The seven lying flat beside
 *  them are detail and the blockout does without them. */
const SU_BORDER = (SU_PLATE / 2 + SU_RIM + SU_PLINTH / 2) / 2
const SU_STACKS: [number, number, number][] = [
  [-SU_BORDER, -1.25, 9], [-SU_BORDER, 0, 7], [-SU_BORDER, 1.25, 8],
  [-1.25, -SU_BORDER, 6], [0.1, -SU_BORDER, 7], [1.45, -SU_BORDER, 6],
]

// Invariant 6. The settle is the one thing here that moves geometry, so it is
// the one thing that has to be able to not happen.
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function makeMats(hi: boolean) {
  const c = Object.fromEntries(
    Object.entries(PALETTE).map(([k, v]) => [k, shade(v, hi)]),
  ) as Record<keyof typeof PALETTE, THREE.Color>

  const frame = new THREE.MeshStandardNodeMaterial({ color: c.frame, roughness: 0.72, metalness: 0.15 })
  const panel = new THREE.MeshStandardNodeMaterial({ color: c.panel, roughness: 0.85 })
  const dark = new THREE.MeshStandardNodeMaterial({ color: c.dark, roughness: 1 })

  // The lens. Dark glass, and at rest it declares no emissive at all, which is
  // what makes it free: `Post` blooms the emissive buffer at threshold zero,
  // so a lens that is not firing costs the bloom nothing and a lens that is
  // fires the only real light source in the world.
  const glass = new THREE.MeshStandardNodeMaterial({ color: c.glass, roughness: 0.18, metalness: 0.3 })
  glass.emissiveNode = color('#eaf4ff').mul(flashLevel.mul(3.2))

  // Strata, and the veins that cut them. PolarSense reads structure that is
  // already in the file without running it, so the rock is layered before anyone
  // digs. Bands read world Y, so they stay level across the benches however the
  // island is turned; the noise is lateral only, which bends a layer without
  // tilting it.
  //
  // The veins are the columns. A row bends — the strata carry the wobble — and a
  // column does not: they are dead straight, vertical, and they run through
  // every bench and on into the adit, because a schema does not stop at the
  // surface. Their axis is set across the mine's cut face (the only geometry the
  // rock material shades), so they read as seams on the face rather than as one
  // wash over it.
  const rock = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 })
  // 0.06, down from 0.14: at 0.14 the lateral wobble was most of a band's own
  // period, so the layers wandered far enough to read as camouflage rather than
  // as strata — and a vein crossing camouflage reads as nothing at all.
  const wobble = mx_fractal_noise_float(positionWorld.mul(vec3(0.45, 0.1, 0.45)), 2).mul(0.06)
  const band = sin(positionWorld.y.add(wobble).mul(8.5)).mul(0.5).add(0.5)
  const u = positionWorld.x.mul(-0.496).add(positionWorld.z.mul(0.868)).mul(1.82)
  const slot = floor(u)
  const carries = step(0.66, fract(sin(slot.mul(37.719)).mul(6412.31))) // which columns hold ore
  const vein = oneMinus(smoothstep(0.06, 0.2, fract(u).sub(0.5).abs())).mul(carries)
  rock.colorNode = mix(
    color(c.rock).mul(smoothstep(0.2, 0.8, band).mul(0.4).add(0.76)),
    color(c.ore).mul(band.mul(0.25).add(0.85)),
    vein.mul(0.9),
  )
  // Enough to stay readable inside the adit, where the sun does not reach: the
  // whole claim is that you can see the schema without going in and running it.
  rock.emissiveNode = color(c.ore).mul(vein.mul(0.14))

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

  // Sandra's canvas, resolving as the visitor comes in. She teaches, sells her
  // own work and rents the studio — "three different conversations, funnelled
  // into one form she can actually answer" — so the painting is three colour
  // fields: scattered, soft and pale from across the island; drawn together and
  // saturated by the time the ship is parked. Nothing legible is painted
  // (invariant 2). What resolves is a picture, not a word.
  //
  // The field is measured in the landmark's own space, x across and y + z up, so
  // one expression serves a canvas standing on the easel and one lying flat on
  // the table. It is anchored on the easel's canvas and reaches the finished one
  // leaning against the table; the stretched one waiting on the table falls
  // outside it and stays primed, which is what `tools/easel.py` says it is.
  const canvas = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 })
  const near = approach(positionWorld.xz, 4.5, 13)
  const p = vec2(positionLocal.x.add(0.55), positionLocal.y.add(positionLocal.z).sub(2.13)).mul(1.5)
  let paint = color(c.panel).mul(1)
  for (const [bx, by, dx, dy, r, hex] of CANVAS_FIELDS) {
    const centre = vec2(bx, by).add(vec2(dx, dy).mul(mix(float(2.2), float(1), near)))
    const shape = oneMinus(smoothstep(float(0), float(r).mul(mix(float(2), float(1), near)), length(p.sub(centre))))
    // Not shaded toward the proximity blue, and it is the only thing here that
    // is not: the highlight washes the whole landmark to cyan exactly when the
    // visitor is close enough for the painting to have resolved, and a painting
    // the colour of the highlight is no painting. It reads as paint on a tinted
    // ground instead, which is what it is.
    paint = mix(paint, color(hex), shape.mul(mix(float(0.12), float(0.92), near)))
  }
  // Brush marks, and only from close enough that they read as marks. Farther out
  // they would be exactly the generic noise BUILD-PLAN says does not ship.
  const canvasNear = approach(positionWorld.xz, 4.5, 9)
  canvas.colorNode = paint.mul(mx_fractal_noise_float(vec3(p.mul(5.5), 0), 3).mul(0.12).mul(canvasNear).add(1))

  // The move that was there, settling into it. Scrubble finds the play nobody
  // saw; the seven tiles hang over the squares they belong in, and they come
  // down as the visitor arrives — the one nearest the played word first, so the
  // hook lands before the tiles that hang off it.
  //
  // Each tile is identified by its own x, which is what makes this one material
  // over one mesh rather than seven of anything. The tip goes as the tile falls:
  // a tile is tipped to say it is in the air, and a tipped tile lying on a board
  // buries a corner in it.
  const found = new THREE.MeshStandardNodeMaterial({ color: c.panel, roughness: 0.85 })
  const world = modelWorldMatrix.mul(vec4(positionLocal, 1))
  // 8.5 out, not 12: the camera sits 7.2 behind the ship in world Z and the
  // board is the landmark at +Z, so it only crosses into frame at about 7 —
  // a settle that starts at 12 is two thirds over before anyone can see it.
  const t = REDUCED ? float(0) : approach(world.xz, 4.2, 8.5)
  const k = clamp(round(positionLocal.x.div(CELL).sub(1)), 0, 6)
  const w = clamp(t.mul(1.75).sub(k.mul(0.105)), 0, 1)
  const centreY = float(FOUND_Y).add(k.sub(3).mul(FOUND_STEP))
  const a = k.mul(FOUND_TILT[1]).add(FOUND_TILT[0]).negate().mul(w) // unwinding the tip, by w
  const dy = positionLocal.y.sub(centreY)
  const dz = positionLocal.z.sub(FOUND_Z)
  found.positionNode = vec3(
    positionLocal.x,
    centreY.add(dy.mul(cos(a)).sub(dz.mul(sin(a)))).sub(centreY.sub(TILE_Y).mul(w)),
    float(FOUND_Z).add(dy.mul(sin(a)).add(dz.mul(cos(a)))),
  )
  // Landed tiles warm very slightly: they are part of the word now.
  found.colorNode = mix(color(c.panel), color(shade('#e2d9c8', hi)), w.mul(0.3))

  // The sudoku's wells. The floor of an open cell is sunk by how many digits
  // could still legally go in it — `tools/sudoku.py` works that out from the
  // puzzle and puts it in the geometry — so the only shading this landmark
  // needs is to read that depth back off the floor it is drawing. A cell with
  // two candidates left sits almost level with the lines and takes the tray's
  // own colour; one with six is a pit. Nothing is written anywhere on it
  // (invariant 2): what the relief says is how much of the board is still
  // open, which is the first thing that solver computes and the only thing
  // about it that has a shape.
  const wells = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 })
  wells.colorNode = mix(
    color(c.dark),
    color(c.board).mul(0.5),
    smoothstep(SU_RAIL - WELL_MAX, SU_RAIL - WELL_MIN, positionLocal.y),
  )

  // The palette in the easel's tray. It wants the board colour — `tools/easel.py`
  // says so, and names the mesh for it — but not the board's grid, which is
  // 15x15 Scrabble cells and was drawing two of its lines across a palette.
  const palette = new THREE.MeshStandardNodeMaterial({ color: c.board, roughness: 0.8 })

  return {
    frame, panel, dark, rock, board, glass,
    /** Overrides keyed by the whole mesh name, tried before the name's prefix —
     *  a mesh that wants its own shader gets one without a second model. */
    byName: {
      panel_canvases: canvas,
      panel_found: found,
      board_palette: palette,
      dark_wells: wells,
    } as Record<string, THREE.Material | undefined>,
  }
}

/** The material a mesh asks for by name, falling back to its prefix. The
 *  part after a `~` is which prop the mesh belongs to (see `Detailed`), and it
 *  is not the material's business. */
function matFor(m: Mats, name: string): THREE.Material {
  const base = name.split('~')[0]!
  const key = base.split('_')[0]
  console.assert(import.meta.env.PROD || key in MATERIAL_KEYS, `no material for ${name}`)
  return m.byName[base] ?? m[key as Exclude<keyof Mats, 'byName'>] ?? m.frame
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

// -------------------------------------------------------------- the ramp
// Memojo. A kicker the board goes up and leaves by, and a camera the size of a
// house aimed at the top of it — the app finds the picture nobody was going to
// find, so the landmark is the one thing in this world that is watching rather
// than being walked past.
//
// The run is `RAMPS.ramp` and nothing here restates it: the blockout is eight
// risers whose top edges are `deckAt` at that z, so the shape under the board
// and the shape in front of the eye are the same numbers even before the model
// arrives. `tools/memojo.py` builds the real one on the same profile, and
// `plateau.check.ts` reads the file back and holds the two together.

const RAMP = RAMPS.ramp!
const STEPS = 8
/** The lens, from `LENSES.ramp`: the body hangs off it and the barrel points
 *  down its own direction, so the blockout aims wherever the arithmetic does. */
const LENS = LENSES.ramp!

function Kicker(m: Mats) {
  const run = RAMP.foot - RAMP.lip
  // Everything but the ramp is measured back along the lens's own axis, so a
  // camera aimed somewhere else is a camera that moved rather than a camera
  // that needs a second set of numbers.
  const back = (d: number): P3 => [LENS.x - LENS.dx * d, LENS.y - LENS.dy * d, LENS.z - LENS.dz * d]
  const head = back(1.5)
  const hip: P3 = [head[0], head[1] - 0.78, head[2]]
  return (
    <>
      {Array.from({ length: STEPS }, (_, k) => {
        const z0 = RAMP.foot - (run * k) / STEPS
        const z1 = RAMP.foot - (run * (k + 1)) / STEPS
        const y = deckAt('ramp', RAMP.x, z1)
        return (
          <mesh key={k} geometry={BOX} material={m.frame}
            position={[RAMP.x, y / 2, (z0 + z1) / 2]} scale={[RAMP.half * 2, y, z0 - z1]} />
        )
      })}
      {/* The body, the barrel, and the lens in its mouth. */}
      <mesh geometry={BOX} material={m.dark} {...strut(back(2.1), back(0.92), 1.3)} />
      <mesh geometry={BOX} material={m.panel} position={[head[0], head[1] + 0.82, head[2]]} scale={[0.6, 0.34, 0.5]} />
      <mesh geometry={BOX} material={m.frame} {...strut(back(0.95), back(0.05), 0.84)} />
      <mesh geometry={BOX} material={m.glass} {...strut(back(0.07), back(0.01), 0.68)} />
      {/* The tripod, which is the only part of it a board can hit — and the
          only part `WALLED` reads, which is why the model names these legs. */}
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2 + 0.5
        const toe: P3 = [hip[0] + Math.cos(a) * 0.82, 0, hip[2] + Math.sin(a) * 0.82]
        return <mesh key={'l' + k} geometry={BOX} material={m.frame} {...strut(hip, toe, 0.14)} />
      })}
    </>
  )
}

// ------------------------------------------------------------- the sudoku
// The Sudoku Solver, and the awkward part of it: this world already has a
// square board of blank tiles on a plinth. What separates the two is that a
// sudoku has structure in its holes — so Scrabble stays a flat plate with its
// grid painted on by a shader and tiles standing on top, and this is a tray:
// a lattice standing 30 cm off the plinth with eighty-one wells sunk into it,
// thirty-one of them holding a tile and fifty left open. `tools/sudoku.py`
// builds the real one and sinks each open well by how many digits could still
// go in it; the blockout below is the same clue pattern in three boxes, which
// is enough to read as a partly-filled grid while the file is on the wire.

function Sudoku(m: Mats) {
  const mid = (SU_TOP + SU_RAIL) / 2
  const h = SU_RAIL - SU_TOP
  return (
    <>
      <mesh geometry={BOX} material={m.frame} position={[0, SU_TOP / 2, 0]} scale={[SU_PLINTH, SU_TOP, SU_PLINTH]} />
      {/* The tray as one dark block with the clues standing out of it: the
          wells are what the eye is meant to find, and before the model is in,
          the holes are better said by one shadow than by eighty-one boxes. */}
      <mesh geometry={BOX} material={m.dark} position={[0, mid, 0]} scale={[SU_PLATE, h, SU_PLATE]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={BOX} material={m.frame} position={[0, mid, (s * (SU_PLATE + SU_RIM)) / 2]}
            scale={[SU_PLATE + SU_RIM * 2, h, SU_RIM]} />
          <mesh geometry={BOX} material={m.frame} position={[(s * (SU_PLATE + SU_RIM)) / 2, mid, 0]}
            scale={[SU_RIM, h, SU_PLATE]} />
        </group>
      ))}
      {CLUES.map((row, i) =>
        [...row].map((cell, j) =>
          cell === '#' ? (
            <mesh key={`${i},${j}`} geometry={BOX} material={m.panel}
              position={[(j - 4) * SU_CELL, SU_SEAT + SU_TILE_H / 2, (i - 4) * SU_CELL]}
              scale={[SU_TILE, SU_TILE_H, SU_TILE]} />
          ) : null,
        ),
      )}
      {/* And what is not down yet — one for every open cell. */}
      {SU_STACKS.map(([x, z, n]) => (
        <mesh key={`${x},${z}`} geometry={BOX} material={m.panel}
          position={[x, SU_TOP + (n * SU_TILE_H) / 2, z]} scale={[SU_TILE, n * SU_TILE_H, SU_TILE]} />
      ))}
    </>
  )
}

// ----------------------------------------------------------------- the set

/** Keyed by the `landmark` frontmatter field, not by slug: two projects may
 *  legitimately want the same shape, and a slug is a URL, not a model name. */
const BUILD: Record<string, (m: Mats) => ReactNode> = {
  mine: Mine,
  easel: Easel,
  board: Board,
  ramp: Kicker,
  sudoku: Sudoku,
}

/**
 * Landmarks that have a finished model, keyed the same way. Phase 4 fills this
 * in one at a time; everything absent from it is still its blockout, which is
 * the point — the world stays shippable between landmarks.
 *
 * The files carry geometry and nothing else: no materials, no textures, no UVs
 * (`tools/mine.py`). Every surface is still shaded by the TSL above, because the
 * strata are PolarSense's schema and a baked texture cannot read world Y. Each
 * mesh is named for the material it wants — `rock_cut`, `frame_works` — so the
 * proximity highlight keeps working on a model exactly as it does on a blockout.
 */
const MODEL: Record<string, string> = {
  mine: mineUrl,
  easel: easelUrl,
  board: boardUrl,
  ramp: memojoUrl,
  sudoku: sudokuUrl,
}

type Part = { geometry: THREE.BufferGeometry; name: string }

/**
 * A found tile, landed: the settle shader's own transform at `w = 1`, baked
 * into geometry once, with the normals turned by the same untip. A knocked
 * tile is drawn from this and from the plain tile material, because the
 * shader keys its settle on the ship's distance and a tile lying on the
 * grass twenty metres off would otherwise float back up to where it hung.
 * Change the shader and change this — `plateau.check.ts` cannot see either.
 */
function landedGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone()
  const pos = g.attributes.position as THREE.BufferAttribute
  const nor = g.attributes.normal as THREE.BufferAttribute | undefined
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const k = Math.min(Math.max(Math.round(x / CELL - 1), 0), 6)
    const centreY = FOUND_Y + (k - 3) * FOUND_STEP
    const a = -(FOUND_TILT[0]! + k * FOUND_TILT[1]!)
    const dy = pos.getY(i) - centreY
    const dz = pos.getZ(i) - FOUND_Z
    const c = Math.cos(a)
    const sn = Math.sin(a)
    pos.setXYZ(i, x, centreY + dy * c - dz * sn - (centreY - TILE_Y), FOUND_Z + dy * sn + dz * c)
    if (nor) {
      const ny = nor.getY(i)
      const nz = nor.getZ(i)
      nor.setXYZ(i, nor.getX(i), ny * c - nz * sn, ny * sn + nz * c)
    }
  }
  return g
}

/** Where a found tile's settle is, 0 hanging and 1 landed, for tile `k` at
 *  `d` from the ship — the CPU twin of the shader's `t` and `w`, so that the
 *  physics knows which tiles are on the board yet. */
function settled(k: number, d: number): number {
  const t = REDUCED ? 0 : 1 - THREE.MathUtils.smoothstep(d, 4.2, 8.5)
  return THREE.MathUtils.clamp(t * 1.75 - k * 0.105, 0, 1)
}

function Detailed({ url, m, l }: { url: string; m: Mats; l: Landmark }) {
  const { scene } = useGLTF(url)
  // Flattened to a list of meshes with their transforms baked in, rather than
  // rendered as a `<primitive>`: it keeps the tree the same shape the blockout
  // builds, which is what lets the box check below read either of them.
  //
  // A mesh named `<material>_<part>~<prop>` is one piece of a loose prop —
  // a tile, the table with what is on it — and every piece with the same
  // `~prop` is one rigid thing to the physics (`plateau.ts`). Its geometry
  // stays exactly where the file put it; the group it sits in is what moves.
  // The disc it is to the board is its footprint's own half-width, and its
  // turning point the footprint's centre. A landmark in `WALLED` is a wall
  // instead: the hull of everything in the band, read from the same vertices.
  const built = useMemo(() => {
    scene.updateMatrixWorld(true)
    const fixed: Part[] = []
    const loose = new Map<string, Part[]>()
    const band = WALLED[l.landmark]
    const wallPts: { x: number; z: number }[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      console.assert(
        import.meta.env.PROD || mesh.name.split('_')[0] in MATERIAL_KEYS,
        `${url}: no material for ${mesh.name}`,
      )
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
      if (band && (!band.part || mesh.name.startsWith(band.part))) {
        footprint(geometry.attributes.position.array, band.band[0], band.band[1], wallPts)
      }
      const prop = mesh.name.split('~')[1]
      const part = { geometry, name: mesh.name }
      if (!prop) fixed.push(part)
      else if (loose.has(prop)) loose.get(prop)!.push(part)
      else loose.set(prop, [part])
    })
    const props: Prop[] = []
    const pieces: { id: string; parts: Part[]; landed?: THREE.BufferGeometry }[] = []
    const box = new THREE.Box3()
    for (const [id, parts] of loose) {
      box.makeEmpty()
      for (const part of parts) {
        part.geometry.computeBoundingBox()
        box.union(part.geometry.boundingBox!)
      }
      const px = (box.min.x + box.max.x) / 2
      const pz = (box.min.z + box.max.z) / 2
      const w = box.max.x - box.min.x
      const d = box.max.z - box.min.z
      // A tile is a tile; everything else weighs what its footprint says,
      // in tiles — a table about seven, the easel about twelve.
      const tile = /^[tf]\d/.test(id)
      const mass = tile ? 1 : 2 + 8 * w * d
      // A hair under, so a row of tiles laid a cell apart is not a row of
      // discs leaning on each other.
      const r = 0.5 * Math.max(w, d) * 0.98
      props.push(makeProp(id, px, pz, r, mass, GROUND + deckAt(l.landmark, px, pz)))
      const found = parts.find((p) => p.name.startsWith('panel_found'))
      pieces.push({ id, parts, landed: found ? landedGeometry(found.geometry) : undefined })
    }
    const set = makeSet(l.slug, l.pos[0], l.pos[2], landmarkYaw(l), props,
      wallPts.length ? [hull2d(wallPts)] : [], LENSES[l.landmark] ?? null)
    return { fixed, pieces, set }
  }, [scene, url, l])

  // Published for the flight controller the moment the model is in, and for
  // as long as it is: `Ship` reads the map once a frame and touches nothing
  // that is not in it.
  useEffect(() => {
    PROP_SETS.set(l.slug, built.set)
    return () => { PROP_SETS.delete(l.slug) }
  }, [built, l.slug])

  const groups = useRef<(THREE.Group | null)[]>([])
  const hanging = useRef<(THREE.Mesh | null)[]>([])
  const landed = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    const set: PropSet = built.set
    for (let i = 0; i < set.props.length; i++) {
      const p = set.props[i]!
      const g = groups.current[i]
      if (g) {
        g.position.set(p.px + p.x, p.y, p.pz + p.z)
        g.rotation.y = p.yaw
      }
      const piece = built.pieces[i]!
      if (!piece.landed) continue
      // A found tile: the physics may have it once the shader has put it
      // down, and while it is out of place it is drawn landed and plain.
      const wx = set.cx + p.px * Math.cos(set.rot) + p.pz * Math.sin(set.rot)
      const wz = set.cz - p.px * Math.sin(set.rot) + p.pz * Math.cos(set.rot)
      const k = Math.min(Math.max(Math.round(p.px / CELL - 1), 0), 6)
      p.fixed = !p.loose && settled(k, Math.hypot(wx - SHIP_XZ.value.x, wz - SHIP_XZ.value.y)) < 1
      const h = hanging.current[i]
      const d = landed.current[i]
      if (h) h.visible = !p.loose
      if (d) d.visible = p.loose
    }
  })

  return (
    <>
      {built.fixed.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={matFor(m, p.name)} />
      ))}
      {built.pieces.map((piece, i) => {
        const p = built.set.props[i]!
        return (
          <group key={piece.id} ref={(g) => { groups.current[i] = g }} position={[p.px, 0, p.pz]}>
            <group position={[-p.px, 0, -p.pz]}>
              {piece.parts.map((part, j) =>
                piece.landed && part.name.startsWith('panel_found') ? (
                  <group key={j}>
                    <mesh ref={(e) => { hanging.current[i] = e }} geometry={part.geometry} material={matFor(m, part.name)} />
                    <mesh ref={(e) => { landed.current[i] = e }} geometry={piece.landed} material={m.panel} visible={false} />
                  </group>
                ) : (
                  <mesh key={j} geometry={part.geometry} material={matFor(m, part.name)} />
                ),
              )}
            </group>
          </group>
        )
      })}
    </>
  )
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

function fits(g: THREE.Group | null, l: Landmark, tag: string) {
  if (!g || !import.meta.env.DEV || checked.has(l.slug + tag)) return
  checked.add(l.slug + tag)
  _box.makeEmpty()
  // Every mesh under the group, wherever it sits: a prop's two groups cancel
  // at rest, which is when this runs, so its geometry's own box is its box.
  g.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.updateMatrix()
    mesh.geometry.computeBoundingBox()
    _one.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrix)
    _box.union(_one)
  })
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
  // The lens, decayed from `FLASH` — here rather than in `Detailed` so it
  // fires on the blockout too, and so it is one update for a value both
  // material sets share. Invariant 6: a visitor who asked for less motion
  // gets the shutter and not a light going off in their face.
  useFrame(() => {
    flashLevel.value = REDUCED ? 0 : Math.max(0, 1 - FLASH.age / FLASH_FOR)
  })
  return (
    <>
      {LANDMARKS.map((l) => {
        const m = near === l.slug ? hot : cold
        const url = MODEL[l.landmark]
        // The blockout is both the shape a landmark has before it is modelled
        // and what stands in its place while the model is on the wire — one
        // fallback, not two, and nothing pops in from empty.
        const blockout = <group ref={(g) => { fits(g, l, 'blockout') }}>{BUILD[l.landmark]?.(m)}</group>
        return (
          // Turned to face the world's centre, which is where the visitor comes
          // from: the adit, the canvas and the tile rack all point at the
          // approach without any of them carrying a hand-tuned angle.
          <group key={l.slug} position={l.pos} rotation-y={landmarkYaw(l)}>
            {url ? (
              <Suspense fallback={blockout}>
                <group ref={(g) => { fits(g, l, 'model') }}>
                  <Detailed url={url} m={m} l={l} />
                </group>
              </Suspense>
            ) : (
              blockout
            )}
          </group>
        )
      })}
    </>
  )
}
