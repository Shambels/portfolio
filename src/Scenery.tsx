import { useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { useFrame } from '@react-three/fiber'
import {
  abs, cameraPosition, clamp, cos, dot, float, length, max, mix, mx_fractal_noise_float,
  normalize, oneMinus, positionLocal, positionWorld, pow, reflect, sin, smoothstep, time,
  uniform, vec2, vec3,
} from 'three/tsl'
import { LAGOONS, SHOAL, SHOALS, SPLASH, shoal } from './world'
import type { Sea } from './WorldGate'

/**
 * Sky, sun, ocean and clouds. Golden hour, committed — see BUILD-PLAN, "Open
 * questions". All of it is generated: no textures, no models, zero asset bytes.
 *
 * Not `World.tsx`: macOS cannot tell that from `world.ts`, and the import
 * resolves to the landmark data instead. Blank screen, no useful error.
 *
 * One `sky()` builds the graph for the dome, for what the water reflects and for
 * the haze the water fades into, so the horizon matches itself by construction
 * rather than by three hand-tuned colours agreeing.
 *
 * The sea has two states, which the menu switches between: **calm**, the chop
 * this world has always had, and **agitated**, which is that same chop with
 * three crossing trains of rollers under it — taller than the ship, far apart,
 * and the only thing in this world that is real geometry rather than a painted
 * normal.
 */

// Low (16 deg) and over the visitor's left shoulder.
//
// It used to be low and ahead, which put its glow and its path across the water
// in the left of every frame — and every landmark in shadow, because the camera
// never turns: it sits at a fixed offset behind the ship looking down world -Z,
// so the only surfaces it can see are the ones facing +Z, and the sun was at
// -Z. A benched rock face and a smooth one were the same flat grey (STATUS.md,
// Phase 4). Swung round to port and behind, it rakes across exactly the faces
// the visitor is looking at, and the shadow sides fall to the right of the
// frame, where they model the shape instead of hiding it.
//
// The cost, and it is the reason this was Seb's call and not a quiet fix: the
// sun disc, its glow and the glitter path on the water are all behind the
// camera now, so none of them is in frame. The warm horizon below is what is
// left of golden hour, and the fill was cut to buy the contrast back.
export const SUN = new THREE.Vector3(-0.66, 0.27, 0.7).normalize()

// The palette, and it is the landing page's, top to bottom: the sky here is
// `--sky` in `index.css` and these are its stops, inverted back through the
// tone mapping so that what comes out of the pipeline is the gradient the
// visitor was just looking at. #1a68a8 overhead, #8fbfd0 in the band below it,
// #f9c884 on the waterline. HAZE_WARM is over 1 in red because gold that
// survives ACES has to go in hotter than it comes out.
//
// The warm end used to be the sun's own side of the sky only, which left the
// world cool: the sun sits behind the camera (`SUN` above), so nearly every
// frame is the anti-solar half. WARM_FLOOR is the answer — the waterline is
// gold all the way round, a little hotter to port, and the world reads as the
// same evening as the page in front of it.
const ZENITH = vec3(0.0198, 0.1071, 0.2628)
const HAZE_COOL = vec3(0.1847, 0.3781, 0.5229)
const HAZE_WARM = vec3(2.7722, 0.4451, 0.1588)
/** How much of the gold the anti-solar horizon keeps. 0 is where this started,
 *  and with the sun behind the camera it was a fog bank. High enough that what
 *  is left is a hair of extra heat to port rather than a side of the sky. */
const WARM_FLOOR = 0.92
/** Where the warm band gives out and the blue takes over, in `lift` below. */
const SKY_BREAK = 0.22
/**
 * The highest the frame ever looks: half the 45deg field of view, less the
 * 11.77deg the camera is pitched down by `CAM_OFFSET` — 10.73deg, and its sine
 * is what `dir.y` reads there. The whole vertical gradient of the landing page
 * has to fit inside it. `pow(up, 0.4)` spent half its travel above the top edge
 * of the frame and left the world pale and flat; dividing by this spends all of
 * it inside the frame instead. Above 10.73deg the dome is flat zenith, which
 * only a wave steep enough to reflect it can show, and it is the right colour
 * there anyway.
 */
const SKY_TOP = 0.18621
const SUN_TINT = vec3(1.0, 0.624, 0.2623)
const CLOUD_LIT = vec3(1.0, 0.7454, 0.6038)
// Pink, not grey. A cumulus at this sun angle is lit from underneath, and the
// shaded side of one takes the horizon's warmth rather than the zenith's blue.
const CLOUD_DARK = vec3(0.3278, 0.1714, 0.2384)
const DEEP = vec3(0.0018, 0.0331, 0.0467)
const SHALLOW = vec3(0.007, 0.4452, 0.4564)
// The same white the spray is made of, so a whitecap and the foam the ship
// tears off the same water are not two different whites.
const FOAM = vec3(0.86, 0.93, 0.97)
// And the shallows. Water over sand is not water over four hundred metres of
// nothing: it is the sand, lit through a metre of sea. The isle is 70 m across
// with a shelf all the way round it, which is what a lagoon is and what the
// turquoise in every photograph of one actually is — so it is worth two
// colours and a distance, and the three project islands get the same fringe at
// their own scale for the same reason.
const LAGOON = vec3(0.09, 0.68, 0.62)
const SHORE_WATER = vec3(0.34, 0.86, 0.76)

// Invariant 6: nothing drifts, ripples or sparkles when motion is not wanted.
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const T = time.mul(REDUCED ? 0 : 1)

type Vec3 = THREE.Node<'vec3'>
type Vec2 = THREE.Node<'vec2'>
type Float = THREE.Node<'float'>
const sunDir = vec3(SUN.x, SUN.y, SUN.z)

/** Stylised cumulus, drawn on the sky itself — projected to a plane, so no geometry. */
function clouds(dir: Vec3) {
  const p = dir.xz.div(max(dir.y, 0.055)).mul(0.055)
  const n = mx_fractal_noise_float(vec3(p.add(vec2(T.mul(0.004), T.mul(0.002))), T.mul(0.01)), 3)
  const cover = smoothstep(0.22, 0.6, n)
  // Thin out overhead and at the horizon: cumulus live in a band, and a hard
  // edge where the projection blows up would read as a seam.
  const band = smoothstep(0.004, 0.055, dir.y).mul(oneMinus(smoothstep(0.45, 0.95, dir.y)).mul(0.75).add(0.25))
  return { cover: cover.mul(band), shade: smoothstep(0.0, 0.55, n) }
}

/**
 * Colour of the sky in a direction. `lit: false` skips the clouds and the sun
 * disc — the cheap version, used for the water's horizon haze. `disc` dims the
 * sun itself: at full strength, reflected off a thousand wave normals, it turns
 * the sea into a white smear.
 */
function sky(dir: Vec3, { lit = true, disc = 1 } = {}): Vec3 {
  const up = clamp(dir.y, 0, 1)
  const toSun = clamp(dot(dir, sunDir), 0, 1)

  // The landing page's three stops, in the order it draws them. `lift` is how
  // far up the frame we are looking, 0 on the waterline and 1 at the top edge;
  // the gold band lives under `SKY_BREAK` and the blue above it, and the pale
  // stop between them is where the two ramps meet rather than a colour anyone
  // had to name.
  //
  // Warmth still falls off away from the sun — the waterline is hottest to
  // port, where the sun is — but it falls to WARM_FLOOR, not to nothing.
  const lift = clamp(up.div(SKY_TOP), 0, 1)
  const warmth = mix(float(WARM_FLOOR), float(1), pow(dot(dir, sunDir).mul(0.5).add(0.5), 1.8))
  const horizon = mix(HAZE_COOL, HAZE_WARM, warmth)
  let col = mix(horizon, HAZE_COOL, smoothstep(0, SKY_BREAK, lift))
  col = mix(col, ZENITH, smoothstep(SKY_BREAK, 1, lift))
  col = col.add(SUN_TINT.mul(pow(toSun, 9).mul(0.42))) // the glow, always — it is most of the look

  if (!lit) return col

  const c = clouds(dir)
  col = mix(col, mix(CLOUD_DARK, CLOUD_LIT, c.shade.mul(pow(toSun, 0.5).mul(0.6).add(0.4))), c.cover)
  return col.add(SUN_TINT.mul(smoothstep(0.99955, 0.99992, toSun).mul(1.9 * disc)))
}

/* ---------------------------------------------------------------------------
 * The chop.
 *
 * Three crossing swells plus a noise ripple, all in the fragment stage — this
 * part of the surface stays geometrically flat, because 15 cm of water buys a
 * silhouette the horizon hides anyway. It is in both sea states and identical
 * in them: an agitated sea is this water with rollers under it, not different
 * water.
 * ------------------------------------------------------------------------ */

const SWELL: [number, number, number, number, number][] = [
  // dirX, dirZ, frequency, amplitude, speed
  [0.86, 0.51, 0.55, 0.06, 1.1],
  [-0.42, 0.91, 0.9, 0.03, 1.5],
  [0.98, -0.19, 1.7, 0.012, 2.3],
]

/**
 * And what the calm sea does to those three. This is the sea state Seb picked
 * off the slider that used to be here — half travel, a little more water than
 * the world shipped with. `SWELL` keeps the shipped numbers and this is the
 * scale over them, so the provenance stays readable; both are constants, so the
 * shader folds them at graph-build time and neither costs a uniform.
 */
const CHOP = { amp: 1.5625, freq: 1.1, speed: 1.12 }

/* ---------------------------------------------------------------------------
 * The rollers.
 *
 * The agitated sea's one addition: big, widely spaced swells that the water
 * plane is actually *displaced* by, because a wave taller than the ship cannot
 * be a painted normal — there would be nothing to ride, and nothing to be
 * thrown off.
 *
 * Each crest is a sine raised to a power rather than a sine, which is what
 * makes them *few*: at `sharp` 9 or more a crest occupies about a sixth of a
 * wavelength and the rest is the water that was already there. `modDepth` is a
 * second, much longer wave along the crest line, so one roller is tall in
 * places and barely there in others.
 *
 * And there are **three trains, not one**, because one train is a corrugated
 * roof: every crest parallel to every other, from here to the horizon, for as
 * long as you sail. Three at spread headings, with wavelengths and speeds that
 * share no factor, cross into something with no readable direction — long
 * ridges where two agree, short pyramids where three do, and flat water in
 * between. They are summed and not maxed: a sum has the gradient of a sum,
 * which is what keeps the hull on the water the shader drew.
 *
 * The heights fall off with the wavelength, which is what the sea does. The sum
 * runs to about 3.1 at the 99th percentile of open water and peaks near 4 where
 * all three happen to agree, against a 1.9 m mast — and sits under half a metre
 * half the time, which is what makes the big ones worth waiting for.
 * ------------------------------------------------------------------------ */

const ROLLERS = [
  // angle: heading in the XZ plane, degrees. Spread unevenly on purpose — 90
  // apart three times over is its own kind of pattern.
  // len/speed: wavelength in world units, and units/sec. Cruise is 7.5, so a
  // boat can outrun the slowest; meeting the fastest head on closes at fifteen,
  // and at full sail at twenty-five, which is the jump.
  // phase: so the three do not all crest at the world's origin at t = 0.
  { angle: 20, len: 96, height: 2.6, speed: 7.6, sharp: 9, modLen: 190, modSpeed: 0.2, phase: 0 },
  { angle: 112, len: 74, height: 1.7, speed: 6.4, sharp: 10, modLen: 150, modSpeed: 0.17, phase: 2.1 },
  { angle: 218, len: 60, height: 1.1, speed: 5.6, sharp: 11, modLen: 120, modSpeed: 0.23, phase: 4.4 },
]
/** How far a crest may be cut down along its own length: 0.35 puts a roller
 *  between 0.65 and 1.0 of its height, and where the sea runs big drifts across
 *  the world over half a minute. One number for all three — it is the same sea. */
const MOD_DEPTH = 0.35

/** Everything the trains need derived, once, at module scope: the heading, the
 *  wavenumber, the along-crest axis the modulation runs on. */
const TRAINS = ROLLERS.map((r) => {
  const a = (r.angle * Math.PI) / 180
  const dir: [number, number] = [Math.cos(a), Math.sin(a)]
  const k = (2 * Math.PI) / r.len
  return { ...r, dir, q: [-dir[1], dir[0]] as [number, number], k, w: r.speed * k, qk: (2 * Math.PI) / r.modLen }
})

/** The tallest single crest, which is what `crest` below is a fraction of. */
const TALLEST = Math.max(...ROLLERS.map((r) => r.height))

/**
 * How much of the roller train is in the water right now: 0 calm, 1 agitated,
 * and everything between while a change from the menu ramps in. A hard switch
 * would pop two and a half metres of water into existence under the hull.
 *
 * The uniform drives the shader; the plain number drives `swell()` on the CPU.
 * One place writes both, which is the arrangement the boat has depended on
 * since it was built — the water it rides is the water it can see.
 */
const uRoll = uniform(0)
const SEA = { roll: 0 }
const RAMP = 0.8 // per second, exponential — a second and a half to settle

/** Read by `Sound`, which puts the same weather in the mix. */
export const seaRoll = () => SEA.roll

/* ---------------------------------------------------------------------------
 * The splash.
 *
 * A ring of foam opening on the water where a hull came down, written by `Ship`
 * into `SPLASH` and read here every frame. It is on the water rather than in
 * the particles on purpose: the spray is WebGPU-only and always has been, so
 * without this a landing on the WebGL2 fallback would be a hull stopping and
 * nothing else. The two run together where both exist.
 * ------------------------------------------------------------------------ */

/** x, z, and how hard — the position is world, the force is 0 to 1. */
const uSplash = uniform(new THREE.Vector3())
const uSplashAge = uniform(9)
const SPLASH_SPEED = 5.2 // units/sec the ring opens at
const SPLASH_LIFE = 0.9  // seconds until it is gone
const SPLASH_WIDTH = 1.3 // how thick the ring is, world units
const SPLASH_FLASH = 2.1 // radius of the white water under the hull, world units
const SPLASH_FLASH_LIFE = 0.26 // and how long that lasts — it is the impact, not the wake

/**
 * The sea on the CPU: a height and two gradients at a world XZ.
 *
 * The gradients come back apart because the hull does two different things with
 * them. The chop's slope is exaggerated before it heels the boat — 15 cm of
 * water heels a hull three degrees and reads as dead flat — and the roller's is
 * used as it is, because a roller's face is already thirty degrees and needs no
 * help.
 *
 * The noise ripple is deliberately not here: it is a slope detail at a scale no
 * hull reacts to, and the one term with no cheap CPU twin.
 *
 * `t` is the caller's, not this module's, because the caller is the only one
 * who knows whether it is honouring `prefers-reduced-motion` — pass 0 and the
 * sea is as frozen as the shader's is. It is `clock.elapsedTime` rather than
 * three's `time` node: a different clock, so the phase is off by however long
 * the renderer took to come up. On water shaded by these normals that offset is
 * not observable, and threading the node's clock back to the CPU would be a
 * uniform read per frame to fix nothing.
 *
 * Returns a shared object — read it, do not keep it.
 */
const _swell = { y: 0, dx: 0, dz: 0, rx: 0, rz: 0 }
export function swell(x: number, z: number, t: number) {
  let y = 0
  let dx = 0
  let dz = 0
  for (const [dirX, dirZ, freq, amp, speed] of SWELL) {
    const k = freq * CHOP.freq
    const a = amp * CHOP.amp
    const phase = x * dirX * k + z * dirZ * k + t * speed * CHOP.speed
    y += Math.sin(phase) * a
    const slope = Math.cos(phase) * a * k
    dx += slope * dirX
    dz += slope * dirZ
  }

  // The rollers, and the shallows that damp them out. `h` is the train's own
  // height and `f` the island fade; the water is their product, so its gradient
  // is the product rule and not one term of it.
  let rx = 0
  let rz = 0
  if (SEA.roll > 0) {
    let h = 0
    let hx = 0
    let hz = 0
    for (const r of TRAINS) {
      const phase = (x * r.dir[0] + z * r.dir[1]) * r.k + t * r.w + r.phase
      const g = Math.sin(phase) * 0.5 + 0.5
      const gp = g ** r.sharp
      const q = (x * r.q[0] + z * r.q[1]) * r.qk + t * r.modSpeed
      const m = 1 - MOD_DEPTH + Math.sin(q) * MOD_DEPTH
      const dgp = r.sharp * g ** (r.sharp - 1) * 0.5 * Math.cos(phase) // d(g^P)/d(phase)
      const dm = MOD_DEPTH * Math.cos(q)
      h += r.height * gp * m
      hx += r.height * (dgp * r.k * r.dir[0] * m + gp * dm * r.qk * r.q[0])
      hz += r.height * (dgp * r.k * r.dir[1] * m + gp * dm * r.qk * r.q[1])
    }
    const s = shoal(x, z)
    y += h * s.f * SEA.roll
    rx = (hx * s.f + h * s.dx) * SEA.roll
    rz = (hz * s.f + h * s.dz) * SEA.roll
  }

  _swell.y = y
  _swell.dx = dx
  _swell.dz = dz
  _swell.rx = rx
  _swell.rz = rz
  return _swell
}

/**
 * The one thing that can go quietly wrong here: a term whose height and slope
 * do not belong to each other, which used to mean a sea shaded differently from
 * the one the boat rides and now means worse — the hull riding a wave drawn
 * somewhere else. Finite differences catch it in dev, once, at import: calm and
 * agitated, in open water and inside an island's shallows, where the fade's own
 * gradient is the term it would be easiest to forget.
 */
if (import.meta.env.DEV) {
  const e = 1e-4
  const was = SEA.roll
  for (const roll of [0, 1]) {
    SEA.roll = roll
    for (const [x, z, t] of [[3, -7, 0.4], [-11, 22, 9.1], [-2, -5, 5.5]]) {
      const s = swell(x, z, t)
      const dx = (swell(x + e, z, t).y - swell(x - e, z, t).y) / (2 * e)
      const dz = (swell(x, z + e, t).y - swell(x, z - e, t).y) / (2 * e)
      console.assert(
        Math.abs(dx - (s.dx + s.rx)) < 1e-3 && Math.abs(dz - (s.dz + s.rz)) < 1e-3,
        `swell at ${x},${z}, roll ${roll}: the gradient is not the height's — the water and the boat disagree`,
      )
    }
  }
  SEA.roll = was
}

/** `shoal`, in TSL: the same product of smoothsteps and the same product rule
 *  under it. Three islands, so nine multiplications, all at graph-build time. */
function shoalNode(p: Vec2) {
  const fade: Float[] = []
  const gx: Float[] = []
  const gz: Float[] = []
  for (const c of SHOALS) {
    const dx = p.x.sub(c.x)
    const dz = p.y.sub(c.z)
    const d = max(length(vec2(dx, dz)), 1e-4)
    const t = clamp(d.sub(c.r).div(SHOAL), 0, 1)
    fade.push(t.mul(t).mul(float(3).sub(t.mul(2))))
    const rate = t.mul(oneMinus(t)).mul(6 / SHOAL)
    gx.push(rate.mul(dx.div(d)))
    gz.push(rate.mul(dz.div(d)))
  }
  let f: Float = float(1)
  for (const s of fade) f = f.mul(s)
  let dx: Float = float(0)
  let dz: Float = float(0)
  for (let i = 0; i < fade.length; i++) {
    let others: Float = float(1)
    for (let j = 0; j < fade.length; j++) if (j !== i) others = others.mul(fade[j])
    dx = dx.add(gx[i].mul(others))
    dz = dz.add(gz[i].mul(others))
  }
  return { f, dx, dz }
}

/**
 * How shallow the water is at a point: 1 on a shoreline, 0 in open water.
 *
 * Measured from each island's own coastline (`LAGOONS`, not the wider circles
 * the swell is sheltered inside) and ramped out by a third of its radius, so
 * the turquoise starts on the sand rather than offshore. Proportional and not a
 * fixed width, or a 9 m rock would wear the same skirt as a 70 m island and the
 * world would lose its sense of scale in the one place it is trying to show it.
 *
 * `max` and not a product: two islands close enough to share a lagoon share
 * one, they do not make it twice as shallow.
 */
function shallows(p: Vec2) {
  let s: Float = float(0)
  for (const c of LAGOONS) {
    const d = length(vec2(p.x.sub(c.x), p.y.sub(c.z)))
    s = max(s, oneMinus(smoothstep(c.r, c.r + c.r * 0.34, d)))
  }
  return s
}

/**
 * The three trains at a world XZ: height above the base sea, gradient, and how
 * much of a full crest that adds up to. Called from the vertex stage to
 * displace the water and from the fragment stage to shade it — one function
 * written once and evaluated twice, rather than a varying to keep in step.
 */
function rollerNode(p: Vec2) {
  let h: Float = float(0)
  let hx: Float = float(0)
  let hz: Float = float(0)
  for (const r of TRAINS) {
    const phase = p.x.mul(r.dir[0] * r.k).add(p.y.mul(r.dir[1] * r.k)).add(T.mul(r.w)).add(r.phase)
    const g = sin(phase).mul(0.5).add(0.5)
    const gp = pow(g, r.sharp)
    const q = p.x.mul(r.q[0] * r.qk).add(p.y.mul(r.q[1] * r.qk)).add(T.mul(r.modSpeed))
    const m = sin(q).mul(MOD_DEPTH).add(1 - MOD_DEPTH)
    const dgp = pow(g, r.sharp - 1).mul(r.sharp * 0.5).mul(cos(phase))
    const dm = cos(q).mul(MOD_DEPTH)

    h = h.add(gp.mul(m).mul(r.height))
    hx = hx.add(dgp.mul(r.k * r.dir[0]).mul(m).add(gp.mul(dm).mul(r.qk * r.q[0])).mul(r.height))
    hz = hz.add(dgp.mul(r.k * r.dir[1]).mul(m).add(gp.mul(dm).mul(r.qk * r.q[1])).mul(r.height))
  }

  const s = shoalNode(p)
  return {
    h: h.mul(s.f).mul(uRoll),
    dx: hx.mul(s.f).add(h.mul(s.dx)).mul(uRoll),
    dz: hz.mul(s.f).add(h.mul(s.dz)).mul(uRoll),
    /** The sum as a fraction of the tallest single crest — so foam lands on the
     *  big ones and on the places two trains agree, and nowhere else. */
    crest: h.div(TALLEST).mul(s.f).mul(uRoll),
  }
}

/**
 * Surface normal at a world XZ: the chop, the rollers and a noise ripple. The
 * chop and the ripple are shading only; the rollers are in the geometry as
 * well, which is why their slope goes in at its true value and the hull reads
 * the same number back out.
 */
function waves(p: Vec2) {
  let dx: Float = float(0)
  let dz: Float = float(0)
  for (const [dirX, dirZ, freq, amp, speed] of SWELL) {
    const k = freq * CHOP.freq
    const a = amp * CHOP.amp
    const phase = p.x.mul(dirX * k).add(p.y.mul(dirZ * k)).add(T.mul(speed * CHOP.speed))
    const slope = cos(phase).mul(a * k)
    dx = dx.add(slope.mul(dirX))
    dz = dz.add(slope.mul(dirZ))
  }
  const ripple = mx_fractal_noise_float(vec3(p.mul(0.6 * CHOP.freq), T.mul(0.25 * CHOP.speed)), 2)
    .mul(0.05 * Math.sqrt(CHOP.amp))
  const r = rollerNode(p)
  return {
    n: normalize(vec3(dx.add(ripple).add(r.dx).negate(), 1, dz.sub(ripple).add(r.dz).negate())),
    crest: r.crest,
  }
}

export function Scenery({ sea }: {
  /** Which of the two seas the menu is on. The change ramps rather than
   *  switches — see `uRoll`. */
  sea: Sea
}) {
  const { dome, water, surface } = useMaterials()
  const target = sea === 'agitated' ? 1 : 0
  const k = useRef(target) // the world mounts on whichever sea it was left on

  // Written during render on purpose, and the only place in this file that is:
  // it is two assignments of a value this render already has, it is idempotent,
  // and the alternative is one frame of the sea the visitor just left.
  SEA.roll = uRoll.value = k.current

  useFrame((_, delta) => {
    // `Ship` writes the splash and moves its clock on; this is the frame's one
    // read of it, three numbers into two uniforms.
    uSplash.value.set(SPLASH.x, SPLASH.z, SPLASH.force)
    uSplashAge.value = SPLASH.age

    if (k.current === target) return
    // The same clamp `Ship` makes: a backgrounded tab comes back with one
    // enormous delta, and this ramp would arrive as the switch it is not.
    const dt = THREE.MathUtils.clamp(delta, 1 / 240, 0.05)
    k.current += (target - k.current) * (1 - Math.exp(-RAMP * dt))
    if (Math.abs(target - k.current) < 1e-3) k.current = target
    SEA.roll = uRoll.value = k.current
  })

  return (
    <>
      {/* Sun. Warm and low. */}
      <directionalLight position={[SUN.x * 80, SUN.y * 80, SUN.z * 80]} color="#ffcb92" intensity={3.0} />
      {/* Fill, not a hemisphere light: hemisphere lights contribute nothing
          through the node pipeline, which is what left the landmarks black.
          Cut from 2.8 with the sun swing: it was carrying every visible surface
          on its own, and at that strength it flattens surfaces that now have a
          key light on them. 2.1 rather than the 1.7 this started at — at 1.7 the
          shadow side of the mine crushed to navy. A face toward the visitor now
          reads about a fifth brighter than before, a face away a quarter darker,
          which is the whole point of the swing. */}
      <ambientLight color="#8fa9c9" intensity={2.1} />

      <mesh material={dome}>
        <sphereGeometry args={[520, 32, 24]} />
      </mesh>

      <mesh geometry={surface} material={water} />
    </>
  )
}

/**
 * The water mesh. Rotated in the geometry rather than on the mesh, so its local
 * XZ *is* world XZ and the vertex stage can displace `positionLocal.y` with no
 * basis change to get wrong.
 *
 * 240 segments across 900 units is a vertex every 3.75, which is sixteen across
 * the shortest of the three roller trains — enough for a crest a hull rides up. It is nowhere near
 * enough for the chop, and the chop is not displaced: 15 cm of water is a
 * normal, and always was. 58k vertices, one draw call, no attributes but the
 * position: the displacement is arithmetic in the vertex stage, not a texture.
 */
const SEGMENTS = 240
const EXTENT = 900

function useMaterials() {
  return useMemo(() => {
    const dome = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
    dome.colorNode = sky(normalize(positionLocal))

    const surface = new THREE.PlaneGeometry(EXTENT, EXTENT, SEGMENTS, SEGMENTS)
    surface.rotateX(-Math.PI / 2)

    const water = new THREE.MeshBasicNodeMaterial()
    // The one displacement in this world.
    water.positionNode = positionLocal.add(vec3(0, rollerNode(positionLocal.xz).h, 0))

    const view = normalize(positionWorld.sub(cameraPosition))
    const { n, crest } = waves(positionWorld.xz)
    const bounce = reflect(view, n)

    // Grazing angles mirror the sky, steep ones show the water's own colour.
    const fresnel = pow(oneMinus(clamp(dot(n, view.negate()), 0, 1)), 4.5).mul(0.92).add(0.06)
    // Deep in the troughs, lighter on the crests. The normal's own tilt says
    // that for the chop; a roller's face is steep the whole way up, so its crest
    // height says it there instead, or a swell shades to one dark slab.
    const open = mix(DEEP, SHALLOW, max(clamp(n.y.sub(0.965).mul(14), 0, 1), crest.mul(0.7)))
    // Over a shelf the water's own colour wins over the trough-and-crest term
    // entirely: a lagoon is turquoise in the troughs too.
    const shal = shallows(positionWorld.xz)
    const body = mix(open, mix(LAGOON, SHORE_WATER, smoothstep(0.55, 1, shal)), smoothstep(0.0, 0.85, shal))
    const glitter = pow(clamp(dot(bounce, sunDir), 0, 1), 420).mul(2.2)

    // Whitecaps, on the top of a roller and nowhere else — broken up by a noise
    // field so the foam is patches travelling with the water rather than a band
    // drawn along the crest. `crest` carries `uRoll`, so a calm sea has none of
    // this and pays for it only in graph size.
    const breakup = mx_fractal_noise_float(vec3(positionWorld.xz.mul(3.2), T.mul(0.4)), 3)
    const caps = smoothstep(0.45, 0.92, crest).mul(smoothstep(0.0, 0.4, breakup))

    // And the ring a landing opens. Same white, so it belongs to the same water:
    // a circle expanding from where the hull hit, thinning as it goes, torn up
    // by the same noise the whitecaps use so it is foam rather than a decal.
    const hit = length(positionWorld.xz.sub(vec2(uSplash.x, uSplash.z)))
    const life = oneMinus(clamp(uSplashAge.div(SPLASH_LIFE), 0, 1))
    const torn = smoothstep(-0.55, 0.35, breakup).mul(0.65).add(0.35)
    const ring = smoothstep(SPLASH_WIDTH, 0, abs(hit.sub(uSplashAge.mul(SPLASH_SPEED))))
      .mul(pow(life, 0.8)).mul(uSplash.z).mul(torn)
    // And the white water under the hull itself for the first quarter second,
    // which is the difference between a ring arriving from nowhere and a
    // landing. It goes before the ring is halfway out.
    const flash = smoothstep(SPLASH_FLASH, 0, hit)
      .mul(oneMinus(clamp(uSplashAge.div(SPLASH_FLASH_LIFE), 0, 1)))
      .mul(uSplash.z).mul(torn)
    // And the surf on the beach: the last few metres of every shore, breathing
    // in and out on the same clock the chop runs on and torn up by the same
    // noise as the whitecaps, so it is water breaking rather than a ring drawn
    // round an island. It is in both sea states — a calm sea still breaks on
    // sand — which is why it is not multiplied by `uRoll`.
    const beat = sin(T.mul(0.7).add(positionWorld.x.mul(0.09)).add(positionWorld.z.mul(0.07)))
    const surf = smoothstep(0.86, 1, shal.add(beat.mul(0.05)))
      .mul(smoothstep(-0.3, 0.45, breakup))
    const foam = max(max(caps, surf), max(ring, flash))

    // Fade into the horizon's own colour, or the plane ends in a visible edge.
    const far = smoothstep(140, 880, length(positionWorld.xz.sub(cameraPosition.xz))).mul(0.8)
    const horizon = sky(normalize(vec3(view.x, 0.015, view.z)), { lit: false }).mul(0.93)

    water.colorNode = mix(
      mix(
        mix(body, sky(bounce, { disc: 0.3 }), fresnel).add(SUN_TINT.mul(glitter)),
        FOAM,
        foam.mul(0.85),
      ),
      horizon,
      far,
    )
    return { dome, water, surface }
  }, [])
}
