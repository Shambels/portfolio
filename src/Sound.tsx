import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { SHIP } from './Ship'
import { LANDMARKS, overWater, type Landmark } from './world'

/**
 * Phase 4's ambient sound — the last item on the list, and the one BUILD-PLAN
 * gated on "only if it earns its place".
 *
 * **Synthesised, like everything else in the atmosphere.** The sky, the ocean
 * and the clouds are TSL and cost zero asset bytes; a pair of ambience loops
 * would have been the first bytes in the world that are not geometry, plus a
 * licence to keep track of. This is the Web Audio API and nothing else: no
 * dependency, no files, about 3 kB of code inside the canvas chunk.
 *
 * **Off by default, and that is not only manners.** No browser will start audio
 * without a gesture, so the toggle in the HUD *is* the gesture — the constraint
 * and the courtesy want the same thing. Nothing here is constructed until the
 * visitor asks: a visitor who never clicks never has an `AudioContext`, never
 * allocates the noise buffer, and never shows the tab's playing indicator.
 *
 * **What it earns.** Every layer is a function of something already in the
 * world, so none of it is decoration laid over the top:
 *
 * - the **sea** is where the ship is — `overWater`, the same coastline the
 *   spray uses, so parking on an island pulls the surf back off the mix;
 * - the **wind** is its altitude, opening as Space lifts it, which is exactly
 *   where the spray dries up. One takes over from the other;
 * - the **hum** is its speed. That matters more than it sounds: the spray is
 *   WebGPU-only, on purpose, so on the WebGL2 fallback nothing in the frame says
 *   how fast you are crossing featureless water. The hum says it on both
 *   backends, and it is the only part of Phase 4's craft that reaches the
 *   fallback at all;
 * - and each **landmark has a voice**, faded in by proximity and derived from
 *   the project the way its shader is.
 *
 * **Not gated on `prefers-reduced-motion`.** Invariant 6 is about motion, and
 * this is the one thing in the world that only exists because someone asked for
 * it out loud. Silencing an opt-in on a motion preference would be guessing.
 */

const MASTER = 0.5
const FADE = 0.25 // time constant of the master fade, in and out. A gain that steps, clicks.

// The sea. Everything above this in real surf is spray, and the spray is
// already a particle system.
const SEA_HZ = 420
const SEA = 0.26
const SEA_LAND = 0.5 // of that, parked on an island — the landmark's voice needs the room
const SWELL = 0.35 // depth of the two slow swells below

// The wind, opening as the ship climbs. Hover is 0.9 and Space lifts it 2.6
// (`Ship`), which is also the height where the downwash stops reaching the
// water: the wind arrives as the spray goes.
const HOVER = 0.9
const LIFT = 2.6
const WIND_HZ = 1150
const WIND = 0.1

// The hum. Two triangles a few cents apart, so they beat at about a fifth of a
// hertz — a hover holding station, rather than a tone someone left switched on.
const HUM_HZ = 52
const DETUNE = 7 // cents
const HUM_RISE = 0.42 // of the base frequency, at full boost
const HUM: [number, number] = [0.05, 0.115] // idle -> boost
const CRUISE = 7.5 // `SPEED` in `Ship`
const BOOST = 2.4 // `BOOST` in `Ship`, so cruise sits at 0.42 of the range and Shift takes the rest

// A landmark's voice: full inside its own radius, silent at FAR times it — about
// where its shader starts resolving, and far enough apart that no two are ever
// audible together.
const FAR = 3
const VOICE = 0.5
const LOOKAHEAD = 0.15 // seconds of envelopes scheduled ahead of the frame loop

// The noise bed. One buffer, one source; everything that needs noise taps it.
const LOOP = 6
const CROSS = 0.5

const ZERO = 1e-4 // an exponential ramp can neither reach nor leave zero

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 1 inside `a`, 0 beyond `b`, smooth between. */
function fade(d: number, a: number, b: number): number {
  const k = clamp01((b - d) / (b - a))
  return k * k * (3 - 2 * k)
}

/** One-pole smoothing in the audio thread, which is also what keeps every
 *  per-frame value below click-free without a second copy of it in JS. */
const set = (p: AudioParam, v: number, t: number, tau = 0.08) => p.setTargetAtTime(v, t, tau)

/**
 * An envelope, scheduled rather than driven frame by frame: an attack of five
 * milliseconds is a third of a frame at 60fps, and a knock without its attack is
 * a thud.
 */
function strike(p: AudioParam, t: number, attack: number, decay: number, level = 1) {
  p.cancelScheduledValues(t)
  p.setValueAtTime(ZERO, t)
  p.exponentialRampToValueAtTime(level, t + attack)
  p.exponentialRampToValueAtTime(ZERO, t + attack + decay)
}

function osc(ctx: AudioContext, type: OscillatorType, frequency: number, detune = 0) {
  const o = new OscillatorNode(ctx, { type, frequency, detune })
  o.start()
  return o
}

/** `src` -> filters -> a gain of its own -> `out`. The gain is what gets driven. */
function tap(ctx: AudioContext, src: AudioNode, out: AudioNode, ...nodes: AudioNode[]): GainNode {
  const g = new GainNode(ctx, { gain: 0 })
  let n = src
  for (const f of nodes) { n.connect(f); n = f }
  n.connect(g)
  g.connect(out)
  return g
}

/**
 * Pink noise, with the tail crossfaded back over the head so the loop has no
 * seam. A step between two random samples is a click at every frequency, and
 * this one would arrive every six seconds for as long as the visitor listens.
 */
function pink(ctx: AudioContext): AudioBuffer {
  const n = Math.floor(LOOP * ctx.sampleRate)
  const f = Math.floor(CROSS * ctx.sampleRate)
  const buf = ctx.createBuffer(1, n + f, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.0990460 // Kellet's three-pole pink approximation
    b1 = 0.96300 * b1 + w * 0.2965164
    b2 = 0.57000 * b2 + w * 1.0526913
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16
  }
  for (let i = 0; i < f; i++) d[i] = d[i] * (i / f) + d[n + i] * (1 - i / f)
  return buf
}

type Voice = { pulse: (t: number) => void; period: number }

/**
 * A voice per landmark shape, keyed by `landmark` and not by slug — the same
 * convention `Landmarks.tsx` keys its meshes and materials on. A slug is a URL,
 * and two projects may want the same shape.
 *
 * Each one is the project, the way its shader is. Generic noise does not ship
 * here either: an ambient pad under all three would say nothing about any of
 * them, and the only reason to have sound at a landmark is to say what the
 * landmark is.
 */
const VOICES: Record<string, (ctx: AudioContext, noise: AudioNode, out: AudioNode) => Voice> = {
  // The head-frame's sheave, turning. The mine is the one landmark with a moving
  // part in it, and a winch is what a shaft sounds like when something is being
  // brought up out of it — which is PolarSense's whole claim, structure lifted
  // out of a file nobody ran. Two sines a fifth apart through a lowpass: a knock
  // with a body, rather than a click.
  mine(ctx, _noise, out) {
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 380 })
    const env = new GainNode(ctx, { gain: 0 })
    for (const hz of [96, 144]) osc(ctx, 'sine', hz).connect(lp)
    lp.connect(env)
    env.connect(out)
    return { pulse: (t) => strike(env.gain, t, 0.005, 0.6), period: 1.7 }
  },

  // One stroke, and then the pause where she stands back and looks at it. Noise
  // through a bandpass swept upward across the stroke — a brush loads low and
  // lets go high — slow enough that it never settles into a hiss. Three canvases
  // on the island and one painter, so the strokes are single and unhurried.
  easel(ctx, noise, out) {
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 650, Q: 1.3 })
    const env = new GainNode(ctx, { gain: 0 })
    noise.connect(bp)
    bp.connect(env)
    env.connect(out)
    return {
      pulse: (t) => {
        bp.frequency.cancelScheduledValues(t)
        bp.frequency.setValueAtTime(650, t)
        bp.frequency.linearRampToValueAtTime(2300, t + 0.5)
        strike(env.gain, t, 0.13, 0.42)
      },
      period: 2.6,
    }
  },

  // Tiles going down: two quick, then one after a thought. The shader settles
  // seven of them onto the board as the visitor arrives, and this is what that
  // looks like from the other side of the table. Narrow, high, and short — a
  // tile on a board is a click with wood behind it.
  board(ctx, noise, out) {
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1250, Q: 6 })
    const env = new GainNode(ctx, { gain: 0 })
    noise.connect(bp)
    bp.connect(env)
    env.connect(out)
    return {
      pulse: (t) => {
        strike(env.gain, t, 0.002, 0.13)
        strike(env.gain, t + 0.15, 0.002, 0.13, 0.8)
        strike(env.gain, t + 0.44, 0.002, 0.17, 0.9)
      },
      period: 3.4,
    }
  },
}

type Rig = {
  ctx: AudioContext
  master: GainNode
  sea: GainNode
  wind: GainNode
  hum: GainNode
  tone: OscillatorNode[]
  voices: { l: Landmark; prox: GainNode; voice: Voice; next: number }[]
}

function build(): Rig {
  const ctx = new AudioContext()
  const master = new GainNode(ctx, { gain: 0 })
  master.connect(ctx.destination)

  const noise = new AudioBufferSourceNode(ctx, { buffer: pink(ctx), loop: true, loopEnd: LOOP })
  noise.start()

  const sea = tap(ctx, noise, master, new BiquadFilterNode(ctx, { type: 'lowpass', frequency: SEA_HZ, Q: 0.6 }))
  const wind = tap(ctx, noise, master, new BiquadFilterNode(ctx, { type: 'bandpass', frequency: WIND_HZ, Q: 0.7 }))

  const tone = [osc(ctx, 'triangle', HUM_HZ), osc(ctx, 'triangle', HUM_HZ, DETUNE)]
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 260 })
  for (const o of tone) o.connect(lp)
  const hum = tap(ctx, lp, master)

  const voices = LANDMARKS.flatMap((l) => {
    const make = VOICES[l.landmark]
    // A landmark with no voice is silent, not a crash — the same forgiveness
    // `Landmarks` gives an unknown shape. Loud in dev, nothing in production.
    if (!make) {
      if (import.meta.env.DEV) console.assert(false, `${l.slug}: no voice for landmark "${l.landmark}"`)
      return []
    }
    const prox = new GainNode(ctx, { gain: 0 })
    prox.connect(master)
    return [{ l, prox, voice: make(ctx, noise, prox), next: 0 }]
  })

  return { ctx, master, sea, wind, hum, tone, voices }
}

/**
 * Mounted inside the canvas so it rides the same frame loop as everything it
 * reads: `on` is false on every route with no world, and there the loop is
 * stopped anyway, so the context is suspended rather than left running behind a
 * page of prose.
 */
export function Sound({ on }: { on: boolean }) {
  const rig = useRef<Rig | null>(null)

  useEffect(() => {
    const r = rig.current
    if (!on) {
      r?.master.gain.setTargetAtTime(0, r.ctx.currentTime, FADE)
      // Long enough for the fade to finish; suspending mid-ramp is the click.
      const id = setTimeout(() => void r?.ctx.suspend(), FADE * 4000)
      return () => clearTimeout(id)
    }
    // First click and not before: this is where the context, the noise buffer
    // and every node in the graph come into existence.
    const built = (rig.current ??= build())
    const sync = () => {
      if (document.hidden) return void built.ctx.suspend() // a backgrounded tab is not listening
      void built.ctx.resume() // the click is the gesture the autoplay policy wants
      built.master.gain.setTargetAtTime(MASTER, built.ctx.currentTime, FADE)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [on])

  // The canvas never unmounts (invariant 3), so this only ever runs in dev's
  // double-mount — where an orphaned context would keep a tab marked as playing.
  useEffect(() => () => { void rig.current?.ctx.close(); rig.current = null }, [])

  useFrame(() => {
    const r = rig.current
    if (!r || r.ctx.state !== 'running') return
    const t = r.ctx.currentTime
    const { x, y, z } = SHIP.pos

    // Two swells whose periods never line up, so the sea breathes rather than
    // pulses: ten seconds and fifteen, and the sum repeats in about half a minute.
    set(r.sea.gain, SEA * (1 + (SWELL / 4) * (Math.sin(t * 0.62) + Math.sin(t * 0.41)))
      * (overWater(x, z) ? 1 : SEA_LAND), t, 0.5)

    set(r.wind.gain, WIND * clamp01((y - HOVER) / LIFT), t, 0.25)

    const k = Math.min(Math.hypot(SHIP.vel.x, SHIP.vel.z) / CRUISE, BOOST) / BOOST
    set(r.hum.gain, HUM[0] + (HUM[1] - HUM[0]) * k, t)
    for (const o of r.tone) set(o.frequency, HUM_HZ * (1 + HUM_RISE * k), t, 0.12)

    for (const v of r.voices) {
      const near = fade(Math.hypot(x - v.l.pos[0], z - v.l.pos[2]), v.l.radius, v.l.radius * FAR)
      set(v.prox.gain, VOICE * near, t, 0.3)
      // Nothing is scheduled while it is inaudible, and the clock is carried
      // forward instead — otherwise arriving at a landmark fires every envelope
      // it missed while the visitor was elsewhere, all at once.
      if (near < 0.02) { v.next = t; continue }
      // A frame long enough to leave `next` behind the clock would otherwise
      // schedule the catch-up envelopes in the past, where they land on top of
      // each other. Late is a skipped knock; a burst is a broken one.
      if (v.next < t) v.next = t
      while (v.next < t + LOOKAHEAD) { v.voice.pulse(v.next); v.next += v.voice.period }
    }
  })

  return null
}
