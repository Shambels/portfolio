import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import {
  abs, clamp, float, mix, mx_fractal_noise_float, oneMinus, pow, smoothstep, time, uv, vec3,
} from 'three/tsl'
import { fallAt, fallFoot, fallGround } from './falls'

/**
 * The waterfall, drawn.
 *
 * The shape is `src/fall.ts` — the same curtain `fall.check.ts` asserts the
 * cave's doorway is behind. This file sweeps a sheet along it and lays a patch
 * of foam where it lands, and that is all it does.
 *
 * Geometry and TSL, no assets, per CLAUDE.md. Two things about the material
 * are worth saying out loud:
 *
 * **It is nearly opaque down the middle.** This fall has a job — it is what
 * hides the entrance — and a pretty translucent veil would do the geometry's
 * work and then undo it in the shader. The sides are thin and the middle is
 * not.
 *
 * **It is unlit.** Falling water is lit by the sky more than by the sun, and a
 * lit sheet in this world goes dark on its shadow side, which is the side you
 * see it from — the alcove faces the lagoon and the sun is round to port. So
 * this is `MeshBasicNodeMaterial` with the light baked into the colour ramp,
 * the way `Scenery`'s sky is.
 */

/** The sheet's grid: across, and down. Down is the one that matters — the
 *  curtain leans out on a parabola and a coarse grid chords it. */
const ACROSS = 26
const DOWN = 48

const WATER = vec3(0.42, 0.78, 0.80)
const PALE = vec3(0.86, 0.96, 0.98)
const FOAM = vec3(0.97, 1.0, 1.0)

function curtain() {
  const pos = new Float32Array((ACROSS + 1) * (DOWN + 1) * 3)
  const tex = new Float32Array((ACROSS + 1) * (DOWN + 1) * 2)
  let p = 0
  let t = 0
  for (let j = 0; j <= DOWN; j++) {
    for (let i = 0; i <= ACROSS; i++) {
      const v = i / ACROSS
      const d = j / DOWN
      const q = fallAt(v, d)
      pos[p++] = q.x
      pos[p++] = q.y
      pos[p++] = q.z
      tex[t++] = v
      tex[t++] = d
    }
  }
  const idx: number[] = []
  const at = (i: number, j: number) => j * (ACROSS + 1) + i
  for (let j = 0; j < DOWN; j++) {
    for (let i = 0; i < ACROSS; i++) {
      idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(tex, 2))
  g.setIndex(idx)
  return g
}

/**
 * The plunge: a patch of foam lying on whatever the water lands on, which
 * across this foot is wet sand at one end and the bay at the other.
 *
 * Laid on the ground rather than at sea level, because the fall comes down at
 * the back of a beach and half of its foot is on it. Five centimetres up, and
 * `depthWrite` off, so it never argues with the sand.
 */
function plunge() {
  const N = 30
  const pos: number[] = []
  const tex: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= N; i++) {
    const v = i / N
    const f = fallFoot(v)
    const a = fallAt(v, 0.94)
    // outward from the fall's own lean, which is the way the water is going
    let ox = f.x - a.x
    let oz = f.z - a.z
    const ol = Math.hypot(ox, oz) || 1
    ox /= ol
    oz /= ol
    for (const [k, s] of [[-1.4, 1], [0, 0], [2.9, 1]] as const) {
      const x = f.x + ox * k
      const z = f.z + oz * k
      pos.push(x, Math.max(fallGround(x, z), 0) + 0.05, z)
      tex.push(v, s)
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 3
    const b = a + 3
    idx.push(a, a + 1, b, b, a + 1, b + 1)
    idx.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tex), 2))
  g.setIndex(idx)
  return g
}

export function Fall() {
  const { sheet, foot, water, spray } = useMemo(() => {
    const sheet = curtain()
    const foot = plunge()

    // Two scales of noise scrolling down the sheet at different rates: the
    // fine one is the water, the coarse one is the fact that a fall is not one
    // thing but a dozen ropes of it side by side.
    const u = uv().x
    const d = uv().y
    const fine = mx_fractal_noise_float(
      vec3(u.mul(34), d.mul(6).sub(time.mul(1.9)), 4.1), 3)
    const rope = mx_fractal_noise_float(
      vec3(u.mul(11), d.mul(2.2).sub(time.mul(1.15)), 0.7), 2)
    const flow = clamp(fine.mul(0.45).add(rope.mul(0.55)).mul(0.5).add(0.5), 0, 1)

    const water = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })
    // White where it is broken and where it has fallen far enough to be air as
    // much as water.
    water.colorNode = mix(mix(WATER, PALE, flow), FOAM, smoothstep(0.55, 1, d))
    // Thin at the two sides, gone at the lip for a hand's breadth so the water
    // does not look welded to the rock, and blooming at the foot.
    const sides = oneMinus(pow(abs(u.mul(2).sub(1)), float(3.2)))
    const lip = smoothstep(0, 0.035, d)
    const bloom = smoothstep(0.7, 0.99, d).mul(0.35)
    water.opacityNode = clamp(
      float(0.62).add(flow.mul(0.38)).add(bloom).mul(sides).mul(lip), 0, 1)

    const spray = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })
    const churn = mx_fractal_noise_float(
      vec3(uv().x.mul(16), uv().y.mul(4).add(time.mul(0.7)), 9.3), 3)
    spray.colorNode = FOAM
    spray.opacityNode = clamp(
      oneMinus(uv().y).mul(0.85).mul(churn.mul(0.5).add(0.6)), 0, 1)

    return { sheet, foot, water, spray }
  }, [])

  return (
    <group>
      <mesh geometry={sheet} material={water} renderOrder={2} />
      <mesh geometry={foot} material={spray} renderOrder={1} />
    </group>
  )
}
