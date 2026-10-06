import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import {
  clamp, mix, normalWorld, oneMinus, positionLocal, positionWorld,
  sin, smoothstep, vec3, vertexStage,
} from 'three/tsl'
import { fractal } from './noise'
import { band, toon } from './toon'
import { ISLES, ISLE_EXTENT, type Isle as IsleData, isleHeight, isleShore } from './isles'
import { STAIR, stairDoor, stairPortal } from './stairs'
import { FALL } from './falls'
import { Stair } from './Stair'
import { Fall } from './Fall'
import palmUrl from './models/palm.glb?url'

/**
 * The isle: an island that is a place rather than a project.
 *
 * `Islands.tsx` builds the three that carry landmarks — a lathe, a rim
 * function, a flat plateau at `GROUND`, because a saucer that hovers at a fixed
 * altitude cannot be flown over a hill. This one is the other thing: real
 * relief at human scale, 70 metres of coast, a 13 m ridge, and a flight
 * controller that now follows the ground under it (`Ship.tsx`).
 *
 * The shape is not here. It is `isleHeight` in `src/isles.ts`, and the mesh
 * below is that function evaluated on a polar grid — the same function `Ship`
 * reads to know where the ground is. Two surfaces that merely agree are two
 * surfaces that will stop agreeing; this is the same rule the water and the
 * hull already live by (`swell()` in `Scenery.tsx`).
 *
 * What is here: how it is coloured, and where thirty-eight palm trees stand.
 */

// --------------------------------------------------------------- the ground

/**
 * The polar grid. Rings are spaced by hand rather than evenly: the ground is
 * nearly flat across the apron and does everything interesting in the twenty
 * metres either side of the waterline, so that is where the rings go. Half the
 * vertex count of an even grid, and a better coastline.
 */
const RINGS = [
  0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.59, 0.63, 0.67,
  0.71, 0.75, 0.79, 0.82, 0.85, 0.875, 0.9, 0.92, 0.94, 0.96, 0.98, 1,
  1.02, 1.04, 1.06, 1.09, 1.12, 1.16, 1.2, 1.25, 1.3, 1.34, 1.38, 1.42, ISLE_EXTENT,
]
const SEGMENTS = 152

/**
 * An isle with a lagoon gets the same rings and one more between each of them
 * over the middle of the island, where the basin and its shore are.
 *
 * The list above is spaced for a cone: nearly flat across the apron, and doing
 * everything interesting either side of the waterline. A crescent has a second
 * waterline in the middle of it, and 1.4 m of ring spacing puts two and a half
 * quads across a shore band 3.5 m wide. This is the cheapest honest fix — 18
 * more rings on one island — and it is here rather than in `RINGS` so that
 * `palm-isle` is the same mesh it was, vertex for vertex.
 */
function ringsFor(isle: IsleData) {
  if (!isle.lagoon) return RINGS
  const out: number[] = []
  for (let i = 0; i < RINGS.length; i++) {
    out.push(RINGS[i]!)
    const next = RINGS[i + 1]
    if (next !== undefined && RINGS[i]! < 0.86) out.push((RINGS[i]! + next) / 2)
  }
  return out
}

/** The isle as a mesh: `isleHeight` on that grid, and nothing else. */
function terrain(isle: IsleData) {
  const RINGS = ringsFor(isle)
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array((RINGS.length * SEGMENTS + 1) * 3)
  let p = 0
  // The summit, once: a polar grid's centre is one point, not `SEGMENTS` of
  // them stacked on the axis.
  pos[p++] = 0
  pos[p++] = isleHeight(isle, isle.pos[0], isle.pos[1])
  pos[p++] = 0
  for (let i = 0; i < RINGS.length; i++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const theta = (k / SEGMENTS) * Math.PI * 2
      const r = RINGS[i]! * isleShore(isle, theta)
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      pos[p++] = x
      pos[p++] = isleHeight(isle, isle.pos[0] + x, isle.pos[1] + z)
      pos[p++] = z
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))

  const idx: number[] = []
  const at = (i: number, k: number) => 1 + i * SEGMENTS + (k % SEGMENTS)
  for (let k = 0; k < SEGMENTS; k++) idx.push(0, at(0, k + 1), at(0, k)) // the cap
  for (let i = 0; i < RINGS.length - 1; i++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a = at(i, k)
      const b = at(i, k + 1)
      const c = at(i + 1, k + 1)
      const d = at(i + 1, k)
      idx.push(a, b, c, a, c, d)
    }
  }
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// The palette: pale gold sand, a jungle saturated enough to read as jungle at
// sixty metres, and a basalt dark and cold enough that the ridge has an edge
// against the sky. A little warmer and more saturated than a lit palette would
// be, because the violet shadow (`toon.ts`) takes some of the colour back.
const SEABED = vec3(0.03, 0.09, 0.11)
const SHELF = vec3(0.34, 0.62, 0.58) // the lagoon floor, on the rare frame a trough shows it
const WET = vec3(0.58, 0.55, 0.42)
const SAND = vec3(0.9, 0.86, 0.52)
const SCRUB = vec3(0.5, 0.66, 0.22)
const JUNGLE = vec3(0.15, 0.45, 0.17)
// The canopy's shade, in patches: a single green on a smooth hill is a billiard
// ball, and what makes a jungle read from the water is that it is lit in
// patches bigger than the trees.
const CANOPY = vec3(0.06, 0.27, 0.13)
const ROCK = vec3(0.12, 0.11, 0.18)
const CRAG = vec3(0.22, 0.2, 0.29)

/** How wide a hole each doorway cuts in the mountain's shading.
 *
 * Comfortably over the passage's own half-width, so what the eye reads as the
 * opening is bigger than the corridor behind it — which is what a doorway in a
 * cliff looks like, and which matters here because the trigger that takes you
 * through it reaches wider still. A hole that looked smaller than the thing
 * that caught you would read as a bug in the other direction. */
const PORTAL = STAIR.half + 0.8

const BARK = vec3(0.42, 0.33, 0.24)
const BARK_DARK = vec3(0.2, 0.15, 0.11)
const FROND = vec3(0.1, 0.36, 0.13)
const FROND_LIT = vec3(0.26, 0.72, 0.2) // the green the sun puts through a leaf
const SHRUB = vec3(0.13, 0.3, 0.12)

/**
 * The isle, drawn rather than lit (`toon.ts`).
 *
 * Every colour band is an edge — sand, scrub, jungle, rock — and what keeps an
 * edge from reading as a contour line is one short-scale noise (`brush`) that
 * pushes it about by a hand's width, the way a brush would. The treeline rides
 * a wide noise worked out per vertex (`blotch`: a twenty-metre wavelength on a
 * metre-and-a-half grid interpolates to the same field), so the island has
 * clearings and the beach a ragged edge.
 *
 * The two doorways of the passage through the spire (`src/stairs.ts`) are holes
 * in the shading: a fragment within `PORTAL` of either door is discarded, and
 * what shows is the tunnel's own mesh. It puts the whole island on the
 * alpha-tested path, and buys a hole that moves when the stair moves.
 */
function materials() {
  const slope = oneMinus(clamp(normalWorld.y, 0, 1))
  const y = positionWorld.y
  const blotch = vertexStage(fractal(positionWorld.mul(0.045), 3))
  const clump = fractal(positionWorld.mul(0.26), 2)
  const brush = fractal(positionWorld.mul(0.9), 1)

  const land = new THREE.MeshBasicNodeMaterial()
  let col = mix(SEABED, SHELF, smoothstep(-7, -1.4, y))
  col = mix(col, WET, band(-0.6, y, 0.25))
  col = mix(col, SAND, band(0.12, y.add(brush.mul(0.12)), 0.03))
  col = mix(col, SCRUB, band(2.25, y.add(blotch.mul(1.1)).add(brush.mul(0.35)), 0.04))
  col = mix(col, JUNGLE, band(4.3, y.add(blotch.mul(1.6)).add(brush.mul(0.35)), 0.04))
  col = mix(col, CANOPY, band(0.1, clump.add(brush.mul(0.1)), 0.02).mul(band(3.9, y.add(blotch), 0.1)))
  col = mix(col, ROCK, band(0.47, slope.add(brush.mul(0.06)), 0.015).mul(band(1.1, y, 0.2)))
  col = mix(col, CRAG, band(11, y.add(brush.mul(0.6)), 0.08).mul(band(0.3, slope, 0.02)))
  land.colorNode = toon(col)

  const hole = (d: { x: number; y: number; z: number }) =>
    smoothstep(PORTAL - 0.35, PORTAL,
      positionWorld.distance(vec3(d.x, d.y + PORTAL * 0.35, d.z)))
  land.opacityNode = hole(stairDoor()).mul(hole(stairPortal()))
  land.alphaTest = 0.5

  // Two tones up the trunk, ring and gap.
  const bark = new THREE.MeshBasicNodeMaterial()
  bark.colorNode = toon(mix(BARK_DARK, BARK, band(0, sin(positionLocal.y.mul(10.5)), 0.15)))

  const frond = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
  frond.colorNode = toon(FROND, { twoSided: true, sunlit: FROND_LIT })

  const bush = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
  bush.colorNode = toon(SHRUB, { twoSided: true, sunlit: FROND_LIT.mul(0.8) })

  const rock = new THREE.MeshBasicNodeMaterial()
  rock.colorNode = toon(mix(ROCK, CRAG, band(0.08, fractal(positionWorld.mul(1.9), 2), 0.02)))

  return { land, bark, frond, bush, rock }
}

type Mats = ReturnType<typeof materials>

// -------------------------------------------------------------- the planting

/** Deterministic, so the island is the same island on every load and in every
 *  browser — the same reason `tools/palm.py` hashes instead of importing
 *  `random`. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** How steep the ground is at a point — a palm on a 40-degree slope has fallen
 *  over. Finite differences on the same function everything else reads. */
function steepness(isle: IsleData, x: number, z: number) {
  const e = 0.6
  const dx = (isleHeight(isle, x + e, z) - isleHeight(isle, x - e, z)) / (2 * e)
  const dz = (isleHeight(isle, x, z + e) - isleHeight(isle, x, z - e)) / (2 * e)
  return Math.hypot(dx, dz)
}

type Plan = { palms: THREE.Matrix4[][]; ferns: THREE.Matrix4[]; rocks: THREE.Matrix4[] }

const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()

function place(x: number, y: number, z: number, yaw: number, scale: number, tilt = 0) {
  _e.set(tilt, yaw, 0)
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.setScalar(scale))
}

/**
 * Where everything stands. Rejection sampling against the same height function
 * the mesh is built from, so nothing is ever planted in the sea or halfway up a
 * cliff — and nothing has to be placed by hand, which at thirty trees is the
 * difference between a data file and a morning.
 */
function plant(isle: IsleData): Plan {
  const rand = rng(Math.round(isle.seed * 1e6) ^ 0x5eed)
  const plan: Plan = { palms: [[], [], []], ferns: [], rocks: [] }

  const spot = (lo: number, hi: number, maxSlope: number) => {
    for (let tries = 0; tries < 40; tries++) {
      const theta = rand() * Math.PI * 2
      // sqrt keeps the density even over area rather than crowding the middle.
      const u = 0.12 + 0.92 * Math.sqrt(rand())
      const r = u * isleShore(isle, theta)
      const x = isle.pos[0] + Math.cos(theta) * r
      const z = isle.pos[1] + Math.sin(theta) * r
      const y = isleHeight(isle, x, z)
      if (y < lo || y > hi) continue
      if (steepness(isle, x, z) > maxSlope) continue
      return { x, y, z, theta }
    }
    return null
  }

  // Palms: the beach and the lower slope, none above the treeline the colour
  // bands put at about nine metres — a coconut palm is a coastal tree and the
  // ridge above that is bare rock in the reference and bare rock here.
  for (let i = 0; i < 38; i++) {
    const at = spot(0.8, 9.4, 0.66)
    if (!at) continue
    // Which tree. The tall leaning one goes near the water, the upright one
    // inland, the young one anywhere — which is roughly how a beach fills in.
    const beach = at.y < 2.6
    const variant = beach ? (rand() < 0.62 ? 0 : 2) : rand() < 0.66 ? 1 : 2
    // Every palm in `palm.py` leans toward its own +X. Turned so that is the
    // way out to sea, give or take, because that is the way the light and the
    // wind come from and it is the whole silhouette of a beach.
    const yaw = -at.theta + (rand() - 0.5) * (beach ? 0.9 : 2.6)
    plan.palms[variant]!.push(place(at.x, at.y, at.z, yaw, 0.82 + rand() * 0.4))
  }

  // Ferns, everywhere the palms are and further up: undergrowth is what stops
  // a jungle reading as a lawn with trees on it.
  for (let i = 0; i < 110; i++) {
    const at = spot(0.9, 12.4, 1.05)
    if (!at) continue
    plan.ferns.push(place(at.x, at.y, at.z, rand() * 6.28, 0.7 + rand() * 0.9))
  }

  // Boulders: black volcanic rock at the waterline, where the surf breaks on
  // it, and a scatter of the same up on the ridge it all came from.
  for (let i = 0; i < 26; i++) {
    const shore = i < 18
    const at = shore ? spot(-0.5, 1.2, 1.4) : spot(7, 13.5, 1.6)
    if (!at) continue
    // `palm.py` puts a boulder's flat underside on its own origin, so the only
    // thing left is to bed it in — and by a fraction of its own size, or the
    // big ones sit on the sand and the small ones bury themselves.
    const size = 0.45 + rand() * (shore ? 0.65 : 0.8)
    plan.rocks.push(place(
      at.x, at.y - 0.16 * size, at.z,
      rand() * 6.28, size, (rand() - 0.5) * 0.4,
    ))
  }
  return plan
}

// ------------------------------------------------------------------ the model

/** The palm library, flattened the way `Landmarks` flattens a landmark: meshes
 *  by name, geometry in its own local space, no materials. */
function library(scene: THREE.Object3D) {
  const out = new Map<string, THREE.BufferGeometry>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) out.set(mesh.name, mesh.geometry)
  })
  return out
}

function Planting({ plan, m }: { plan: Plan; m: Mats }) {
  const { scene } = useGLTF(palmUrl)
  const parts = useMemo(() => {
    const lib = library(scene)
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; at: THREE.Matrix4[] }[] = []
    const add = (name: string, material: THREE.Material, at: THREE.Matrix4[]) => {
      const geometry = lib.get(name)
      console.assert(import.meta.env.PROD || !!geometry, `palm.glb: no mesh named ${name}`)
      if (geometry && at.length) out.push({ geometry, material, at })
    }
    // Two meshes per tree and one transform for both: a trunk and its own crown
    // are never in different places.
    for (let v = 0; v < plan.palms.length; v++) {
      add(`bark_palm${v}`, m.bark, plan.palms[v]!)
      add(`frond_palm${v}`, m.frond, plan.palms[v]!)
    }
    add('bush_fern', m.bush, plan.ferns)
    add('rock_boulder', m.rock, plan.rocks)
    return out
  }, [scene, plan, m])

  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh
          key={i}
          args={[p.geometry, p.material, p.at.length]}
          // One draw call per part, and the matrices never change after this —
          // nothing here is animated, so the buffer is written once on mount.
          ref={(mesh) => {
            if (!mesh) return
            for (let k = 0; k < p.at.length; k++) mesh.setMatrixAt(k, p.at[k]!)
            mesh.instanceMatrix.needsUpdate = true
            // Without this the island is culled by the bounding sphere of one
            // tree at the origin and disappears the moment it leaves the middle
            // of the frame.
            mesh.computeBoundingSphere()
          }}
        />
      ))}
    </>
  )
}

export function Isle() {
  const { meshes, m, plans } = useMemo(() => ({
    meshes: ISLES.map(terrain),
    plans: ISLES.map(plant),
    m: materials(),
  }), [])

  return (
    <>
      {ISLES.map((isle, i) => (
        <group key={isle.id}>
          {/* The ground is not suspended on the model: the island exists from
              the first frame and the trees arrive when the file does. The mesh
              is built around its own centre and placed; the planting is already
              in world coordinates, because that is where the height function
              that chose each spot was asked. */}
          <mesh geometry={meshes[i]} material={m.land} position={[isle.pos[0], 0, isle.pos[1]]} />
          {/* The passage inside the spire, for the isle that has one. Its
              geometry is in world coordinates already — it is swept along the
              same rail the walk is held to — so it is not inside the placed
              group's transform, only inside its key. */}
          {isle.id === STAIR.isle && <Stair />}
          {/* ...and the fall off its landing pad, which is scenery with a job:
              it is what the doorway at the bottom of that stair hides behind.
              `fall.check.ts` holds it to that. */}
          {isle.id === FALL.isle && <Fall />}
          <Suspense fallback={null}>
            <Planting plan={plans[i]!} m={m} />
          </Suspense>
        </group>
      ))}
    </>
  )
}
