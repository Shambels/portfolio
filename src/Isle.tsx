import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import {
  clamp, mix, mx_fractal_noise_float, normalWorld, oneMinus, positionLocal, positionWorld,
  sin, smoothstep, vec3,
} from 'three/tsl'
import { ISLES, ISLE_EXTENT, type Isle as IsleData, isleHeight, isleShore } from './isles'
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

/** The isle as a mesh: `isleHeight` on that grid, and nothing else. */
function terrain(isle: IsleData) {
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

// The palette, and it is the reference photograph's rather than the world's:
// pale gold sand, a jungle saturated enough to read as jungle at sixty metres,
// and basalt dark enough that the ridge has an edge against the sky. The three
// project islands keep their own muted bands — this is the tropical one.
const SEABED = vec3(0.03, 0.09, 0.11)
const SHELF = vec3(0.34, 0.62, 0.58) // the lagoon floor, on the rare frame a trough shows it
const WET = vec3(0.58, 0.55, 0.42)
const SAND = vec3(0.97, 0.86, 0.6)
const SCRUB = vec3(0.46, 0.57, 0.2)
const JUNGLE = vec3(0.13, 0.36, 0.15)
// The canopy is two greens and not one. A single one on a smooth hill is a
// billiard ball: what makes a jungle read from the water is that it is lit in
// patches, and the patches are bigger than the trees.
const CANOPY = vec3(0.04, 0.17, 0.09)
// Basalt, and it is deliberately colder than everything around it: the sun in
// this world is low and warm, so the one thing that reads as volcanic rather
// than as mud is a rock that does not take the gold.
const ROCK = vec3(0.062, 0.068, 0.088)
const CRAG = vec3(0.135, 0.142, 0.16)

const BARK = vec3(0.42, 0.33, 0.24)
const BARK_DARK = vec3(0.2, 0.15, 0.11)
const FROND = vec3(0.16, 0.42, 0.13)
const FROND_LIT = vec3(0.55, 0.78, 0.22) // the lime the sun puts through a leaf
const SHRUB = vec3(0.13, 0.3, 0.12)

function materials() {
  // Slope, 0 flat and 1 vertical. The one thing a height function gives away
  // for free and the one thing a colour band needs: sand on a cliff is what
  // makes a generated island look generated.
  const slope = oneMinus(clamp(normalWorld.y, 0, 1))
  const y = positionWorld.y
  // Two scales of noise, and they do different jobs: the wide one moves the
  // treeline so it is not a contour, the fine one keeps a band from reading as
  // paint.
  const blotch = mx_fractal_noise_float(positionWorld.mul(0.045), 3)
  const clump = mx_fractal_noise_float(positionWorld.mul(0.26), 3)
  const grain = mx_fractal_noise_float(positionWorld.mul(0.95), 2)

  const land = new THREE.MeshStandardNodeMaterial({ roughness: 0.94 })
  let col = mix(SEABED, SHELF, smoothstep(-7, -1.4, y))
  col = mix(col, WET, smoothstep(-1.1, -0.06, y))
  col = mix(col, SAND, smoothstep(-0.05, 0.5, y))
  // The treeline: scrub first, then the canopy, both pushed around by the wide
  // noise so the island has clearings and the beach has a ragged edge.
  col = mix(col, SCRUB, smoothstep(1.4, 3.1, y.add(blotch.mul(1.1))))
  col = mix(col, JUNGLE, smoothstep(3.0, 5.6, y.add(blotch.mul(1.6))))
  // And the shade inside it: a mid-scale noise, only where there is canopy to
  // be shaded. Without this the hill is one smooth green surface with trees
  // standing on it, which is exactly what it is and exactly what it must not
  // look like.
  col = mix(col, CANOPY, clump.mul(0.5).add(0.5).mul(smoothstep(2.6, 5.2, y)).mul(0.72))
  // Rock where it is too steep to hold anything, and the crest of the ridge,
  // which is bare because it is the ridge.
  col = mix(col, ROCK, smoothstep(0.34, 0.6, slope).mul(smoothstep(0.4, 1.8, y)))
  col = mix(col, CRAG, smoothstep(9.5, 12.5, y).mul(smoothstep(0.16, 0.44, slope)))
  land.colorNode = col.mul(grain.mul(0.19).add(1))

  // Ring scars up the trunk. `positionLocal` and not world: every palm is the
  // same instanced geometry, so this is the tree's own height and the rings
  // land in the same place on all thirty of them, which is what they do.
  const bark = new THREE.MeshStandardNodeMaterial({ roughness: 0.88 })
  bark.colorNode = mix(BARK_DARK, BARK, sin(positionLocal.y.mul(10.5)).mul(0.5).add(0.5).mul(0.55).add(0.45))
    .mul(mx_fractal_noise_float(positionWorld.mul(1.4), 2).mul(0.16).add(1))

  // A leaflet is one flat quad with no thickness, so it is lit from both sides
  // and the side facing up is the side the sun is putting through it. That
  // one term is the whole of why a crown reads as leaves rather than as green
  // metal.
  const frond = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, side: THREE.DoubleSide })
  frond.colorNode = mix(FROND, FROND_LIT, clamp(normalWorld.y.mul(0.5).add(0.5), 0, 1))
    .mul(mx_fractal_noise_float(positionWorld.mul(0.8), 2).mul(0.2).add(0.95))

  const bush = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, side: THREE.DoubleSide })
  bush.colorNode = mix(SHRUB, FROND_LIT, clamp(normalWorld.y, 0, 1).mul(0.45))

  // Two scales again, and here the fine one is doing the work: a boulder is two
  // metres across, so a noise field with a nine-metre wavelength paints one
  // half of it light and the other half dark and it reads as two rocks.
  const rock = new THREE.MeshStandardNodeMaterial({ roughness: 1 })
  rock.colorNode = mix(
    ROCK, CRAG,
    mx_fractal_noise_float(positionWorld.mul(1.9), 3).mul(0.35)
      .add(mx_fractal_noise_float(positionWorld.mul(6.5), 2).mul(0.2)).add(0.5),
  )

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
          <Suspense fallback={null}>
            <Planting plan={plans[i]!} m={m} />
          </Suspense>
        </group>
      ))}
    </>
  )
}
