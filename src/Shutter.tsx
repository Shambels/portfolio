import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { useFrame, useThree } from '@react-three/fiber'
import { color, frontFacing, mix, smoothstep, step, texture, uniform, uv, vec2 } from 'three/tsl'
import { FLASH } from './world'
import { printAt, type Lens, type Print } from './plateau'
import { SHIP } from './Ship'

/**
 * The giant camera going off: the burst, the photograph it takes, and the
 * print it puts out.
 *
 * Its own file rather than more of `Landmarks.tsx` because it is the one thing
 * in this world that renders the world *again*. Everything else here draws
 * geometry; this mounts a second camera at the lens the cone is measured from,
 * renders one frame through it into a target the size of a postcard, and hangs
 * the result on a piece of paper coming out of the machine. That is a render
 * pass, which the plan says to ask about before adding, and it was asked
 * about: one extra frame per shutter, never oftener than `SHUTTER_GAP`, at
 * 512 square. `docs/STATUS.md`, "The camera prints".
 *
 * Everything it needs about where things are it gets from `LENSES` and
 * `PRINTS` in `plateau.ts`, in the landmark's own space, and it is mounted
 * inside the landmark's own group — so the camera that takes the picture is at
 * the point the model puts the glass, by construction rather than by two files
 * agreeing.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * How bright the lens is, 0 to 1 — read by the glass material in
 * `Landmarks.tsx`, by the cone below, and by the light. One uniform for both
 * material sets, because the cold camera and the highlighted one are two
 * objects and one lens.
 */
export const flashLevel = uniform(0)

/** How long the flash lasts. Short enough to be a flash: a photographic one is
 *  a thousandth of a second and a thousandth of a second is invisible at 60fps,
 *  so this is the shortest thing the eye can be given instead. */
export const FLASH_FOR = 0.16

/** The photograph, square and small: it is looked at on a card less than a
 *  metre across from several metres away, and every pixel past that is a
 *  megabyte of nothing. */
const PHOTO = 512

/** How far down its own axis the burst is drawn, and how bright. Not a light
 *  in the render sense — the light is the `pointLight` below — but the air in
 *  front of a flash, which is the part that says which way it went off. */
const CONE_LEN = 4.6
const CONE_GAIN = 0.42

/** The flash as a light: what it throws on the rider, the deck and the grass.
 *  It is the brightest thing in the world for a sixth of a second — the sun is
 *  3.0 — and it is the one number here that is nobody's arithmetic but Seb's
 *  eye, because a flash that does not overexpose him is not a flash. */
const FLASH_WATTS = 45

/**
 * How near the visitor has to come before the photograph's pass is compiled,
 * and how far away before it is armed again — in world units, from the lens.
 *
 * The first shutter used to freeze the world for a moment, and it was not the
 * flash, the light, the burst or the click. It was the shader compiler: this
 * pass renders into its own target, one half-float attachment and no MRT, and
 * `Post`'s scene pass renders into two — so not one program the world had
 * already built could be reused, and every material in the lens's view was
 * compiled on the spot, inside `shoot()`, on the frame he was in the air. 22
 * programs, measured, and the next shot compiled none and cost a millisecond.
 *
 * So the compile is done before anyone needs it, on approach, with
 * `compileAsync` — which generates the shaders a stage at a time, yielding to
 * the frame between them, and links them on the driver's own threads where the
 * browser allows it (`KHR_parallel_shader_compile` on WebGL2, async pipelines
 * on WebGPU) — and the shutter only ever reuses them. 45 is six seconds out at
 * cruise, and nobody reaches the lip without crossing it; 70 is the
 * hysteresis, so a visitor circling at the edge does not re-arm it every lap. Re-arming is cheap — whatever is
 * already built is found, not built again — and it is what catches a model
 * that was still on the wire the first time round.
 */
const WARM_AT = 45
const REARM_AT = 70

/**
 * And how often, in seconds, a warm pass is checked against the scene while
 * the visitor is in range. The world arrives in pieces — a deep link to Memojo
 * parks him in range on the first frame, before his own file has loaded — and a
 * pass compiled then has nobody in it. So while he is near, the scene is
 * counted once a second, and a count that moved compiles again. What was built
 * already is found, not rebuilt; only what arrived is new work.
 */
const RECHECK = 1

const _up = new THREE.Vector3(0, 1, 0)
const _m = new THREE.Matrix4()
const _at = new THREE.Vector3()

export function Shutter({ lens, print }: { lens: Lens; print: Print }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const card = useRef<THREE.Mesh>(null)
  const cone = useRef<THREE.Mesh>(null)
  const lamp = useRef<THREE.PointLight>(null)
  const cam = useRef<THREE.PerspectiveCamera>(null)
  /** Seconds since the last shutter, on the clock the card is fed by, and the
   *  last age we saw — a shot is `FLASH.age` going *backwards*. */
  const since = useRef(-1)
  const wasAge = useRef(FLASH.age)
  /** Whether the pass is compiled for this approach: `idle` out of range,
   *  `warming` while `compileAsync` works through it, `warm` once it has. */
  const warm = useRef<'idle' | 'warming' | 'warm'>('idle')
  /** How many objects the scene had when it was last compiled, and when it
   *  was last counted — see `RECHECK`. */
  const warmed = useRef(0)
  const counted = useRef(0)

  // Where it stands and what it looks at, once. `lookAt` rather than the
  // shortest rotation from -Z, because the shortest one rolls the horizon and
  // a photograph with a tilted horizon is a photograph nobody took on purpose.
  const pose = useMemo(() => {
    const at = new THREE.Vector3(lens.x, lens.y, lens.z)
    const aim = new THREE.Vector3(lens.dx, lens.dy, lens.dz).normalize()
    _m.lookAt(at, at.clone().add(aim), _up)
    const look = new THREE.Quaternion().setFromRotationMatrix(_m)
    // The burst's cone points *down* its own Y, tip at the glass.
    const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim)
    return { at, aim, look, along, mid: at.clone().addScaledVector(aim, CONE_LEN / 2) }
  }, [lens])

  // Half float, and not the default byte target, for the reason the scene's
  // own pass is: what is captured here is linear radiance *before* tone
  // mapping, because the card is drawn into the same scene and `Post` tone
  // maps the lot at the end. Eight bits would clip the sun off the water and
  // band the sky before the picture ever reached the paper.
  const rt = useMemo(() => {
    const t = new THREE.RenderTarget(PHOTO, PHOTO, { depthBuffer: true, type: THREE.HalfFloatType })
    t.texture.generateMipmaps = false
    t.texture.minFilter = THREE.LinearFilter
    t.texture.magFilter = THREE.LinearFilter
    return t
  }, [])
  useEffect(() => () => rt.dispose(), [rt])

  /** How far the card is out of the slot, and how far the picture has come up.
   *  Both from `printAt`, so the paper's own arithmetic is in the file node can
   *  read and this is the part that draws it. */
  const outAt = useMemo(() => uniform(0), [])
  const devAt = useMemo(() => uniform(0), [])

  // The card. A polaroid is a square picture on a card with a wide foot, and
  // it is drawn rather than modelled because the picture is a texture that did
  // not exist when the model was built. The quad hangs from its own top edge,
  // so scaling it *is* feeding it out of the slot; the picture is read at the
  // height the paper has reached, which is what makes it come out bottom-first
  // the way a print does.
  const paper = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.translate(0, -0.5, 0)
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
    const x0 = print.border / print.w
    const x1 = 1 - x0
    const y1 = 1 - print.border / print.h
    const y0 = y1 - print.img / print.h
    // Where on the *card* this fragment is: the quad only covers the part that
    // is out, so its own v has to be scaled by that before anything reads it.
    const cv = uv().y.mul(outAt)
    const cu = uv().x
    const inside = step(x0, cu).mul(step(cu, x1)).mul(step(y0, cv)).mul(step(cv, y1))
    // And the picture, upside down on purpose. A render target's first row is
    // the *top* of the frame that was rendered into it, and a texture's v = 0
    // is the bottom of what samples it, so a picture read straight off it
    // comes out of the machine with the rider's head at the bottom. One
    // `oneMinus` and he is the right way up. It is the same on both backends —
    // it was found on WebGL2 and reported on WebGPU.
    const shot = texture(rt.texture,
      vec2(cu.sub(x0).div(x1 - x0), cv.sub(y0).div(y1 - y0).oneMinus())).rgb
    // Undeveloped is not white: it is the flat grey-green of a print that has
    // not come up yet, and the picture arrives out of it rather than over it.
    const latent = color('#9aa3a0').rgb
    const picture = mix(latent, shot, devAt)
    // The paper itself, and a hair of shadow where it leaves the rollers, so
    // the card reads as coming *out of* something.
    const stock = color('#eceae3').rgb.mul(smoothstep(0.94, 1.0, cv).mul(0.25).oneMinus())
    const face = mix(stock, picture, inside)
    m.colorNode = frontFacing.select(face, stock)
    return { g, m }
  }, [print, rt, outAt, devAt])
  useEffect(() => () => { paper.g.dispose(); paper.m.dispose() }, [paper])

  // The air in front of the flash. Additive, brightest at the glass, gone by
  // the end of its own length — and no emissive, so `Post`'s bloom never sees
  // it: the glow round the lens is the lens's own, and this is the beam.
  const burst = useMemo(() => {
    const g = new THREE.ConeGeometry(Math.tan(Math.acos(lens.cos)) * CONE_LEN, CONE_LEN, 28, 1, true)
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    m.colorNode = color('#eaf4ff')
    // `uv().y` runs 0 at the base to 1 at the tip on a cone, which is 0 at the
    // far end and 1 at the glass — the fall-off, without reading a position.
    m.opacityNode = uv().y.pow(2.2).mul(flashLevel).mul(CONE_GAIN)
    return { g, m }
  }, [lens])
  useEffect(() => () => { burst.g.dispose(); burst.m.dispose() }, [burst])

  // fov and aspect are set as props, and a camera does not notice either
  // until it is told to rebuild its projection.
  useEffect(() => { cam.current?.updateProjectionMatrix() }, [lens])

  useFrame((_, dt) => {
    // The flash, decayed off `FLASH.age` — which `Ship` sets to zero and winds
    // on. Invariant 6: a visitor who asked for less motion gets the shutter
    // and the print, and not a light going off in their face.
    flashLevel.value = REDUCED ? 0 : Math.max(0, 1 - FLASH.age / FLASH_FOR)
    if (lamp.current) lamp.current.intensity = flashLevel.value * FLASH_WATTS

    // A new shot is the age going backwards. Take the picture on that frame
    // and no other: the card the visitor reads for the next second or two is
    // one render, not a live view of anything.
    if (FLASH.age < wasAge.current) {
      shoot()
      since.current = 0
    } else if (since.current >= 0) {
      since.current += dt
    }
    wasAge.current = FLASH.age

    if (since.current >= 0) {
      // Invariant 6 again, and this is the half of it that is not the flash:
      // a visitor who asked for less motion gets the photograph, out and
      // developed, with none of the two and a half seconds it takes.
      const p = REDUCED ? { out: 1, dev: 1 } : printAt(print, since.current)
      outAt.value = p.out
      devAt.value = p.dev
      if (card.current) card.current.scale.set(print.w, print.h * Math.max(p.out, 1e-4), 1)
    }

    // Compile the photograph before it is taken. Measured from the lens, in
    // the world, because this is mounted in the landmark's own group.
    const c = cam.current
    if (c) {
      const d = c.getWorldPosition(_at).distanceTo(SHIP.pos)
      if (warm.current === 'idle' && d < WARM_AT) warmUp(c)
      else if (warm.current === 'warm' && d > REARM_AT) warm.current = 'idle'
      else if (warm.current === 'warm' && (counted.current += dt) > RECHECK) {
        counted.current = 0
        if (census() !== warmed.current) warm.current = 'idle'
      }
    }
  })

  /** Hide what the photograph never contains, run `body`, put them back. */
  function without<T>(body: () => T): T {
    const showCard = card.current?.visible ?? false
    const showCone = cone.current?.visible ?? false
    if (card.current) card.current.visible = false
    if (cone.current) cone.current.visible = false
    try {
      return body()
    } finally {
      if (card.current) card.current.visible = showCard
      if (cone.current) cone.current.visible = showCone
    }
  }

  /** Every object in the scene, visible or not. Cheap next to a frame. */
  function census() {
    let n = 0
    scene.traverse(() => { n++ })
    return n
  }

  /**
   * Every pipeline `shoot()` will need, built ahead of it and a piece at a
   * time. The target is only read on `compileAsync`'s first, synchronous
   * stretch — everything after its first `await` works from what it captured
   * — so setting it back straight away is safe, and the frame that follows
   * renders to the screen as usual.
   *
   * Everything in the scene is compiled, not only what the lens sees now: the
   * rider is the point of the picture and he is not in it yet. Culling is off
   * for the same synchronous stretch and back on before anything draws.
   */
  function warmUp(c: THREE.PerspectiveCamera) {
    warm.current = 'warming'
    warmed.current = census()
    counted.current = 0
    const r = gl as unknown as THREE.Renderer
    const culled: THREE.Object3D[] = []
    const done = without(() => {
      scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o) } })
      c.updateMatrixWorld()
      r.setRenderTarget(rt)
      try {
        return r.compileAsync(scene, c)
      } finally {
        r.setRenderTarget(null)
        for (const o of culled) o.frustumCulled = true
      }
    })
    // A pass that fails to build is not retried every frame: it is left as
    // it was before any of this — compiled on the shot, if at all — until the
    // visitor leaves and comes back.
    const settle = () => { if (warm.current === 'warming') warm.current = 'warm' }
    done.then(settle, settle)
  }

  /** One frame through the lens, into the card. The card and the burst are out
   *  of it — a print of a print is a hall of mirrors, and the beam is drawn
   *  from the apex, which is exactly where this camera's eye is. */
  function shoot() {
    const c = cam.current
    if (!c) return
    without(() => {
      c.updateMatrixWorld()
      // Narrow cast at a library boundary, as in `Post.tsx`: r3f types `gl` as a
      // WebGLRenderer and `Scene.tsx` hands it a WebGPURenderer.
      const r = gl as unknown as THREE.Renderer
      r.setRenderTarget(rt)
      r.render(scene, c)
      r.setRenderTarget(null)
    })
  }

  return (
    <>
      {/* Far enough to hold the sky. The dome is a 520-unit sphere about the
          world's origin and this camera stands 30 out from it, so anything
          under about 560 clips a hole in the sky the shape of the far plane —
          which is what the first photograph this ever took came back with. */}
      <perspectiveCamera ref={cam} fov={(lens.frame * 2 * 180) / Math.PI} aspect={1}
        near={0.1} far={1400} position={pose.at} quaternion={pose.look} />
      <pointLight ref={lamp} position={pose.at} color="#eaf4ff" intensity={0} distance={26} decay={2} />
      <mesh ref={cone} geometry={burst.g} material={burst.m}
        position={pose.mid} quaternion={pose.along} />
      {/* Drawn from the first frame at no height at all — zero-area, so it
          covers no pixel — so that its material is compiled with the rest of
          the world at load, and not on the frame the first print comes out. */}
      <mesh ref={card} geometry={paper.g} material={paper.m} frustumCulled={false}
        position={[print.x, print.y, print.z]}
        rotation-y={Math.atan2(lens.dx, lens.dz)}
        scale={[print.w, 0, 1]} />
    </>
  )
}
