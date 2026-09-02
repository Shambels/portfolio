import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Fn, If, TWO_PI, cos, exp, hash, instanceIndex, instancedArray, mix, oneMinus, sin,
  smoothstep, sqrt, step, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl'
import { SHIP } from './Ship'
import { overWater } from './world'

/**
 * Phase 4's compute particles: the spray the saucer's downwash tears off the
 * sea. Derived from the world's own mechanic rather than added to it — the ship
 * hovers, it has a beam pointed at the water, and until now the water did not
 * notice. It is also the one thing in the frame that says how fast you are
 * going: the sea has no landmarks in it, so at 7.5 units per second over open
 * water nothing moves but the horizon.
 *
 * **WebGPU only, and nothing at all on WebGL2** — BUILD-PLAN allows "a cheaper
 * path or nothing", and this is the nothing, on purpose. What makes these
 * particles worth having is that their state lives on the GPU and is never read
 * back: 2048 of them integrate a position, a velocity and an age in a compute
 * pass, and the CPU sends five uniforms a frame regardless of how many there
 * are. WebGL2 has no compute stage, so the "cheaper path" is not a cheaper
 * version of this effect — it is a second effect, with the state in a texture
 * or on the CPU, written and tuned and debugged separately, to put foam under a
 * saucer. The world without it is the world as it shipped. `?debug` reads the
 * backend, so which one you are on is never a guess.
 *
 * Not mounted at all under `prefers-reduced-motion` (invariant 6): spray is
 * idle motion by definition, and there is no still version of it.
 *
 * One compute dispatch, one draw call, no assets.
 */

const COUNT = 2048
const LIFE = 1.1 // seconds from leaving the water to gone

// The emitter. The hull is a metre across and the beam's base is 0.6, so the
// ring sits between them: spray reads as thrown out from under the saucer
// rather than dribbling from a point.
const RING = 0.95
const SEA = 0.03 // spawn just proud of the water, or half the sprite starts clipped

// Ballistics, stylised. Real gravity makes 2 cm of foam and a 0.6 s arc that
// reads as a twitch; this is slower and higher, which is what makes it legible
// at the camera's distance.
const GRAVITY = 4.6
const DRAG = 1.4 // per second, exponential — it is water, not gravel
const RISE: [number, number] = [1.15, 2.3] // initial up, min to max
const OUT: [number, number] = [0.45, 1.35] // initial radial
const INHERIT = 0.35 // of the ship's velocity, so the plume trails instead of centring

// Where the downwash stops reaching the surface. Space lifts the ship to
// hover + 2.6, which is past the top of this, so climbing dries the spray up.
const CEILING: [number, number] = [1.35, 2.7]

const SIZE: [number, number] = [0.03, 0.105] // droplets spread as they fly
const FOAM = vec3(0.86, 0.93, 0.97)
const OPACITY = 0.42

// Standing still the whole plume piles into one ring 0.95 across and reads as
// cotton wool; under way it smears over eight units and reads as a wake. So the
// density follows the ship: a trace of disturbed water at a stop, all of it at
// cruise. That is also the effect earning its place — the open sea has no
// landmarks in it, and this is the only thing in frame that says how fast you
// are going.
const IDLE = 0.22 // of full density, hovering
const CRUISE = 7.5 // ship speed at full density, matching `SPEED` in `Ship`

// Parked: below the sea and below every island's skirt, where a particle waits
// out a lifetime it was not drawn for. Scale goes to zero there as well, so it
// costs a degenerate quad and no fragments.
const PARKED = -8

/** Invariant 6, and the only reason this file has a module-level branch. */
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function build() {
  // xyz is world position, w is age in seconds. One vec4 rather than two
  // buffers because age is read in the vertex stage too, for the fade.
  const position = instancedArray(COUNT, 'vec4')
  const velocity = instancedArray(COUNT, 'vec3')

  const dt = uniform(0)
  const seed = uniform(0, 'uint')
  const emit = uniform(0)
  const shipPos = uniform(new THREE.Vector3())
  const shipVel = uniform(new THREE.Vector3())

  // Ages staggered across one lifetime, everything parked. The first spray then
  // fills in over 1.1 s instead of arriving as a slab on the frame the world
  // mounts — and a deep link, which spawns the ship beside a landmark, does not
  // announce itself with a bang of foam.
  const init = Fn(() => {
    position.element(instanceIndex).assign(vec4(0, PARKED, 0, hash(instanceIndex).mul(LIFE)))
    velocity.element(instanceIndex).assign(vec3(0))
  })().compute(COUNT)

  const update = Fn(() => {
    const p = position.element(instanceIndex)
    const v = velocity.element(instanceIndex)
    const age = p.w.add(dt).toVar()

    If(age.greaterThan(LIFE), () => {
      // Four draws per respawn, from the particle's own index and a seed that
      // changes every frame — without the seed each droplet would repeat its
      // own angle and speed forever, and 2048 fixed spokes rotating with the
      // ship read as a wheel.
      const s = instanceIndex.mul(4).add(seed)
      const a = hash(s).mul(TWO_PI)
      const dir = vec3(cos(a), 0, sin(a))
      // sqrt of the draw, or the disc bunches in the middle.
      const born = shipPos.mul(vec3(1, 0, 1))
        .add(dir.mul(sqrt(hash(s.add(1))).mul(RING)))
        .add(vec3(0, SEA, 0))

      // `emit` is a density and not a switch: a droplet whose draw beats it
      // comes back, the rest sit the next lifetime out under the sea. Fading
      // the live count is what lets the spray thin as the ship climbs, and stop
      // over an island, without a hard cut anywhere.
      const alive = hash(s.add(2)).lessThan(emit)

      p.assign(vec4(alive.select(born, vec3(0, PARKED, 0)), 0))
      v.assign(
        dir.mul(mix(OUT[0], OUT[1], hash(s.add(3))))
          .add(vec3(0, mix(RISE[0], RISE[1], hash(s.add(1))), 0))
          .add(shipVel.mul(INHERIT)),
      )
    }).Else(() => {
      const next = v.sub(vec3(0, dt.mul(GRAVITY), 0)).mul(exp(dt.mul(-DRAG))).toVar()
      v.assign(next)
      p.assign(vec4(p.xyz.add(next.mul(dt)), age))
    })
  })().compute(COUNT)

  const attr = position.toAttribute()
  const life = attr.w.div(LIFE)

  const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false })
  material.positionNode = attr.xyz
  // Droplets spread as they fly, each one a fixed fraction off the mean so the
  // plume is not a cloud of identical dots. `step` collapses the parked ones.
  material.scaleNode = vec2(
    mix(SIZE[0], SIZE[1], life)
      .mul(hash(instanceIndex.mul(31)).mul(0.9).add(0.45))
      .mul(step(PARKED / 2, attr.y)),
  )
  material.colorNode = FOAM
  // No emissive node anywhere here, which is the point: `Post` blooms the
  // emissive buffer only, so foam cannot glow however much of it piles up.
  material.opacityNode = oneMinus(smoothstep(0.08, 0.5, uv().sub(vec2(0.5)).length()))
    .mul(smoothstep(0, 0.1, life).mul(oneMinus(smoothstep(0.3, 1, life))))
    .mul(OPACITY)

  const sprite = new THREE.Sprite(material)
  sprite.count = COUNT
  // Every position is on the GPU and the object never moves, so its bounds say
  // one point at the origin and a frustum test would cull the lot.
  sprite.frustumCulled = false

  return {
    sprite,
    init,

    /**
     * One frame of simulation. The uniforms live in here rather than on the
     * returned object so the component never writes to a value it got out of a
     * hook — the five it sends are the whole of the CPU's involvement, whatever
     * `COUNT` is.
     */
    frame(renderer: THREE.Renderer, delta: number) {
      // The same clamp `Ship` makes, for the same reason: a backgrounded tab
      // returns with one enormous delta, and a droplet integrated across it is
      // a streak halfway to the horizon that then takes a full lifetime to
      // expire.
      dt.value = THREE.MathUtils.clamp(delta, 1 / 240, 0.05)
      seed.value = (Math.random() * 0xffffff) | 0
      shipPos.value.copy(SHIP.pos)
      shipVel.value.copy(SHIP.vel)
      emit.value = overWater(SHIP.pos.x, SHIP.pos.z)
        ? (1 - THREE.MathUtils.smoothstep(SHIP.pos.y, CEILING[0], CEILING[1])) *
          (IDLE + (1 - IDLE) * Math.min(SHIP.vel.length() / CRUISE, 1))
        : 0
      renderer.compute(update)
    },

    dispose() {
      material.dispose()
    },
  }
}

export function Particles() {
  const gl = useThree((s) => s.gl)
  // Narrow cast at a library boundary, the same one `Post` makes: r3f types
  // `gl` as a WebGLRenderer and `Scene` hands it a WebGPURenderer, whose
  // `init()` has already resolved by the time any child of the canvas renders.
  const renderer = gl as unknown as THREE.Renderer
  const webgpu = !!(renderer as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend

  const spray = useMemo(() => (webgpu && !REDUCED ? build() : null), [webgpu])

  useEffect(() => {
    if (!spray) return
    renderer.computeAsync(spray.init)
    return () => spray.dispose()
  }, [renderer, spray])

  // Priority between `Ship` (0 — this reads the position it has just written)
  // and `Post` (1, which is what actually renders the frame).
  useFrame((_, delta) => spray?.frame(renderer, delta), 0.5)

  return spray && <primitive object={spray.sprite} />
}
