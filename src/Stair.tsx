import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { attribute, float, mix, vec3 } from 'three/tsl'
import { STAIR, STEP, stairAt, stairClimbEnd, stairDoorS, stairLength, stairPath } from './stairs'

/**
 * The passage, drawn.
 *
 * The shape is not here. It is the rail in `src/stair.ts` — the same curve the
 * walk is constrained to and the same one `stair.check.ts` asserts a man fits
 * inside. This file sweeps a tunnel section along it and lays the treads on
 * top, and that is all it does. Two surfaces that merely agree are two
 * surfaces that will stop agreeing; it is the rule the water and the hull
 * already live by, and the reason the stair is arithmetic rather than a model.
 *
 * Geometry only, per CLAUDE.md — no assets, no UVs. The rock is the isle's own
 * two greys, and the only thing the shader is told that it could not work out
 * is `lit`: how much daylight reaches a point, which in a passage with two
 * holes in it is a falloff from each end. Without it the middle is black, and
 * a black corridor is a corridor nobody walks up twice.
 */

/** How far daylight carries in from a portal, in metres of going. */
const REACH = 7.5
/** And what is left in the middle. Not zero: a cave with no bounce light in it
 *  reads as a hole in the depth buffer rather than as rock. */
const DEEP = 0.16

/** The tunnel's section, as (across, up) in metres — a flat floor, two low
 *  walls and an arch, which is what a passage cut by hand is. */
const SECTION: [number, number][] = (() => {
  const h = STAIR.half
  const H = STAIR.head
  return [
    [-h, 0],
    [-h, 0.52 * H],
    [-0.86 * h, 0.86 * H],
    [-0.42 * h, H],
    [0.42 * h, H],
    [0.86 * h, 0.86 * H],
    [h, 0.52 * H],
    [h, 0],
  ]
})()

function shell() {
  // The climbing part only. The balcony is out in the open air at the top and
  // gets a slab instead — a stone tube sticking two metres out of a cliff is
  // not a thing, and a ledge is.
  const from = stairDoorS()
  const end = stairClimbEnd()
  const path = stairPath().filter((r) => r.s >= from - 1e-6 && r.s <= end + 1e-6)
  const rings = path.length
  const cols = SECTION.length
  const pos = new Float32Array(rings * cols * 3)
  const lit = new Float32Array(rings * cols)
  let p = 0
  let l = 0
  for (const rung of path) {
    const daylight = Math.max(
      Math.exp(-(rung.s - from) / REACH),
      Math.exp(-(end - rung.s) / REACH),
    )
    const ax = Math.sin(rung.yaw)
    const az = Math.cos(rung.yaw)
    for (const [u, v] of SECTION) {
      pos[p++] = rung.x + az * u
      pos[p++] = rung.y + v
      pos[p++] = rung.z - ax * u
      lit[l++] = DEEP + (1 - DEEP) * daylight
    }
  }
  const idx: number[] = []
  for (let i = 0; i < rings - 1; i++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = i * cols + k
      const b = a + 1
      const c = a + cols
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('lit', new THREE.BufferAttribute(lit, 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * The treads, and they are the *mesh's* and not the collision's.
 *
 * His feet are on the smooth rail under them, which is what a stair's
 * collision is in every engine that has one — and here it is also the only
 * thing that can be checked in node, so it is the thing that is checked. Each
 * tread's surface is the rail's own height at the middle of that tread, so his
 * soles are on the step in the middle of it and half a rise out at the ends,
 * which is nine centimetres and reads as a footfall rather than as a float.
 */
function treads() {
  const from = stairDoorS()
  const len = stairClimbEnd()
  const n = Math.max(1, Math.round((STAIR.y1 - STAIR.mouthY) / STEP.rise))
  const pos: number[] = []
  const lit: number[] = []
  const idx: number[] = []
  const h = STAIR.half * 0.94
  let v = 0
  for (let k = 0; k < n; k++) {
    const s0 = from + ((len - from) * k) / n
    const s1 = from + ((len - from) * (k + 1)) / n
    const mid = stairAt((s0 + s1) / 2)
    const nextMid = stairAt((s1 + Math.min(len, s1 + (s1 - s0))) / 2)
    const daylight = DEEP + (1 - DEEP) * Math.max(
      Math.exp(-(s0 - from) / REACH), Math.exp(-(len - s0) / REACH))
    for (const [s, y] of [[s0, mid.y], [s1, mid.y], [s1, nextMid.y]] as const) {
      const r = stairAt(s)
      const ax = Math.sin(r.yaw)
      const az = Math.cos(r.yaw)
      pos.push(r.x + az * h, y, r.z - ax * h)
      pos.push(r.x - az * h, y, r.z + ax * h)
      lit.push(daylight, daylight)
    }
    // the going, then the riser up to the next tread
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    idx.push(v + 2, v + 3, v + 4, v + 3, v + 5, v + 4)
    v += 6
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('lit', new THREE.BufferAttribute(new Float32Array(lit), 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * The ledge at the top: the last stretch of rail, in the open, with something
 * under it to stand on.
 *
 * A slab and a lip, 3.2 m across, cut off level. It is the only piece of this
 * island that sticks out of the height field rather than being carved into it,
 * and it is here because a door that opens onto a 66-degree flank is a door a
 * man steps out of and cannot get back to.
 */
function ledge() {
  const from = stairClimbEnd()
  const to = stairLength()
  const w = STAIR.half * 1.45
  const drop = 0.42
  const pos: number[] = []
  const lit: number[] = []
  const idx: number[] = []
  const M = 14
  for (let k = 0; k <= M; k++) {
    const p = stairAt(from + ((to - from) * k) / M)
    const ax = Math.sin(p.yaw)
    const az = Math.cos(p.yaw)
    // top pair, then the pair under it, so the slab has a thickness
    pos.push(p.x + az * w, p.y - 0.02, p.z - ax * w)
    pos.push(p.x - az * w, p.y - 0.02, p.z + ax * w)
    pos.push(p.x + az * w, p.y - drop, p.z - ax * w)
    pos.push(p.x - az * w, p.y - drop, p.z + ax * w)
    for (let i = 0; i < 4; i++) lit.push(1)
  }
  for (let k = 0; k < M; k++) {
    const a = k * 4
    const b = a + 4
    idx.push(a, b, a + 1, a + 1, b, b + 1)           // the top
    idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2) // the underside
    idx.push(a, a + 2, b, b, a + 2, b + 2)           // one edge
    idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3) // and the other
  }
  // and the end of it, so it is not a hollow tube seen from the sea
  const e = M * 4
  idx.push(e, e + 1, e + 2, e + 1, e + 3, e + 2)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('lit', new THREE.BufferAttribute(new Float32Array(lit), 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// The isle's own basalt, one shade lighter for a cut face: rock that has been
// broken recently is not rock that has been in the weather.
const CUT = vec3(0.085, 0.09, 0.105)
const CUT_LIT = vec3(0.30, 0.30, 0.32)

export function Stair() {
  const { walls, floor, deck, rock } = useMemo(() => {
    const rock = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, side: THREE.BackSide })
    // A narrow cast at a library boundary, the kind CLAUDE.md allows: three's
    // `attribute` widens its node type to `string` here, and everything
    // downstream wants `float`.
    const day = float(attribute('lit', 'float') as never)
    rock.colorNode = mix(CUT, CUT_LIT, day)
    // A cut passage has no sky over it, so the sun's own term does almost
    // nothing in here and the daylight attribute is doing the work. A little
    // of it is emissive rather than albedo, or the deep end goes to pure black
    // the moment the sun swings.
    rock.emissiveNode = CUT_LIT.mul(day.mul(day)).mul(0.22)
    const walls = shell()
    const floor = treads()
    const deck = ledge()
    return { walls, floor, deck, rock }
  }, [])

  const stone = useMemo(() => {
    const m = rock.clone() as THREE.MeshStandardNodeMaterial
    m.side = THREE.FrontSide
    return m
  }, [rock])

  return (
    <group>
      <mesh geometry={walls} material={rock} />
      <mesh geometry={floor} material={stone} />
      <mesh geometry={deck} material={stone} />
    </group>
  )
}
