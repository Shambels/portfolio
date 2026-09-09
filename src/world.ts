import { PROJECTS } from './content'
import { ISLES, RIM_MAX, isleHeight, isleShore } from './isles'
import { SOURCE_LOCALE } from './i18n/locales'

/**
 * World layout. Read from the content, not written down here: a landmark's
 * position, size, proximity radius and spawn waypoint are English frontmatter
 * (`src/content.ts`), so a new project is a new MDX file and nothing else.
 *
 * This module is deliberately the only place that turns flat XZ content data
 * into scene coordinates — the plateau height is one constant, and putting it
 * in three MDX files would be three chances to disagree about sea level.
 */
export type Landmark = {
  slug: string
  /** Which shape builds it — see `BUILD` in `Landmarks.tsx`. */
  landmark: string
  pos: [number, number, number] // ground centre — y is the island plateau, not sea level
  size: [number, number, number] // blockout box, true scale
  radius: number // proximity trigger, XZ
  waypoint: [number, number, number] // where a deep link puts the ship
}

/**
 * Height of every island plateau above the water. Capped by the ship: it hovers
 * at a constant altitude over flat ground (BUILD-PLAN — no ground following
 * until the terrain gains hills), so a taller island is one the saucer flies
 * through. Raising this means teaching `Ship` to follow the ground first.
 */
export const GROUND = 0.45

/** The isles are their own module — pure arithmetic, no content import, so
 *  `node src/isle.check.ts` can run it. This is where the world is read from. */
export { ISLES, ISLE_EXTENT, ground, isleHeight, isleShore, type Isle } from './isles'

/**
 * Where the character is, in world XZ, and which way it is facing. Written once
 * per frame by `Ship`, read by `MiniMap`.
 *
 * Plain numbers rather than `Ship`'s own `SHIP` vector, and here rather than
 * there, because the map is DOM outside the canvas chunk: a value import from
 * anything under `Scene` would pull three into the first-route bundle.
 */
export const VIEW = { x: 0, z: 0, yaw: 0 }

/**
 * The last time a hull hit the water hard: where, how hard (0 to 1), and how
 * long ago. Written by `Ship`, read by `Scenery` — the ring of foam that opens
 * on the water — and by `Particles`, the burst of spray that goes up with it.
 *
 * Here rather than in `Ship` for the same reason `VIEW` is: two other modules
 * want it, and `Ship` already imports `Scenery`, so the other direction would
 * be an import cycle. A level rather than an event, decayed by `age`, so any
 * number of things can read it and none of them consumes it.
 */
export const SPLASH = { x: 0, z: 0, force: 0, age: 99 }

export const LANDMARKS: Landmark[] = PROJECTS[SOURCE_LOCALE].map((p) => ({
  slug: p.slug,
  landmark: p.landmark,
  pos: [p.pos[0], GROUND, p.pos[1]],
  size: p.size,
  radius: p.radius,
  waypoint: [p.waypoint[0], GROUND, p.waypoint[1]],
}))

/**
 * Island radius as a multiple of the proximity radius. `Islands` revolves its
 * profile out to this; it lives here rather than there because `Particles` has
 * to know where the sea stops, and two files guessing at one coastline is one
 * file too many.
 */
export const ISLAND_SPREAD = 1.9

/**
 * Fraction of that radius where the island's profile crosses sea level, taken
 * at the widest the rim's harmonics push a coastline out. Erring outward is
 * what keeps spray off the beach rather than stopping it short of the water.
 */
const SHORE = 0.93

/** Where an island's profile meets the water, in world units. */
const shoreOf = (l: Landmark) => l.radius * ISLAND_SPREAD * SHORE

/** True where the sea surface is: clear of every island's shoreline. */
export function overWater(x: number, z: number): boolean {
  if (LANDMARKS.some((l) => Math.hypot(x - l.pos[0], z - l.pos[2]) < shoreOf(l))) return false
  return !ISLES.some((i) => {
    const dx = x - i.pos[0]
    const dz = z - i.pos[1]
    return Math.hypot(dx, dz) < isleShore(i, Math.atan2(dz, dx))
  })
}

/**
 * A hull's width of clearance, in world units. A boat stopped exactly on the
 * shoreline is a boat with its side in the sand; this is what holds it off.
 * Not read from the hull's own numbers — those are `Ship`'s, and a beam picked
 * to read well from astern is not a reason to move a coastline.
 */
const BEAM = 0.55

/** The circle a floating hull may not enter. */
export const moorRadius = (l: Landmark) => shoreOf(l) + BEAM

/**
 * How far past a shoreline the big rollers take to come back to full height.
 *
 * The agitated sea carries swells taller than the ship, and an island plateau
 * is `GROUND` — 45 cm — above the water. A swell that ran over one would put
 * the mine under the sea twice a minute, so it does not: the rollers are damped
 * to nothing over every island's shallows and each island sits in its own patch
 * of sheltered water, which is also what a real one does.
 *
 * Seven and not ten, which was the first guess: the three islands are close
 * enough together that three overlapping ten-unit fades multiplied out to a
 * quarter of the swell at the world's origin, which is where the visitor
 * arrives. At seven they are clear of each other and the sea is running where
 * the ship starts.
 */
export const SHOAL = 7

/** Islands as the swell sees them: a centre, and the radius inside which there
 *  is no swell at all. Here rather than in `Scenery` for the same reason
 *  `shoreOf` exists at all — two files guessing at one coastline is one too
 *  many, and this one is read by the water shader *and* by the hull. */
/**
 * Islands as the *water's colour* sees them: a centre and the radius where the
 * beach is. Not `SHOALS` — those circles are drawn around the outside of an
 * island so no roller can stand up over a headland, and turquoise starting
 * eight metres offshore is a ring, not a lagoon. This is the coastline itself,
 * and `Scenery` ramps outward from it.
 */
export const LAGOONS = [
  ...LANDMARKS.map((l) => ({ x: l.pos[0], z: l.pos[2], r: shoreOf(l) })),
  ...ISLES.map((i) => ({ x: i.pos[0], z: i.pos[1], r: i.radius })),
]

export const SHOALS = [
  ...LANDMARKS.map((l) => ({ x: l.pos[0], z: l.pos[2], r: shoreOf(l) })),
  // An isle's coast is not a circle, and this list is one the water shader
  // unrolls — so it gets the circle that contains the whole island. Erring
  // outward is the safe direction: the cost is a wider patch of sheltered
  // water, which is what a 70 m island in a swell actually makes, and the
  // alternative is a roller standing up over a headland.
  ...ISLES.map((i) => ({ x: i.pos[0], z: i.pos[1], r: i.radius * RIM_MAX })),
]

/**
 * How much of a roller survives at (x, z), 0 over a shoreline and 1 in open
 * water — and the gradient of that, because the water is displaced by this
 * product and the surface it draws has to be the surface the hull rides.
 *
 * The factor is a product of one smoothstep per island; its derivative is the
 * product rule, which with three islands is nine multiplications and no
 * allocation. `Scenery` builds the same expression in TSL, and the
 * finite-difference assert there is what keeps the two honest.
 *
 * Returns a shared object — read it, do not keep it.
 */
const _fade = new Float64Array(SHOALS.length)
const _rate = new Float64Array(SHOALS.length) // d(fade)/d(distance)
const _ux = new Float64Array(SHOALS.length)
const _uz = new Float64Array(SHOALS.length)
const _shoal = { f: 1, dx: 0, dz: 0 }
export function shoal(x: number, z: number) {
  for (let i = 0; i < SHOALS.length; i++) {
    const c = SHOALS[i]
    const dx = x - c.x
    const dz = z - c.z
    const d = Math.hypot(dx, dz)
    const t = Math.min(Math.max((d - c.r) / SHOAL, 0), 1)
    _fade[i] = t * t * (3 - 2 * t)
    // Zero outside the ramp, so a hull in open water pays for three clamps and
    // nothing else.
    _rate[i] = t > 0 && t < 1 ? (6 * t * (1 - t)) / SHOAL : 0
    const inv = d > 1e-6 ? 1 / d : 0
    _ux[i] = dx * inv
    _uz[i] = dz * inv
  }
  let f = 1
  for (let i = 0; i < SHOALS.length; i++) f *= _fade[i]
  let gx = 0
  let gz = 0
  for (let i = 0; i < SHOALS.length; i++) {
    if (_rate[i] === 0) continue
    let others = 1
    for (let j = 0; j < SHOALS.length; j++) if (j !== i) others *= _fade[j]
    gx += _rate[i] * _ux[i] * others
    gz += _rate[i] * _uz[i] * others
  }
  _shoal.f = f
  _shoal.dx = gx
  _shoal.dz = gz
  return _shoal
}

/**
 * How much wider the circle that opens a panel is than the one that stops the
 * boat. A hair, and it has to be more than nothing: `offshore` puts the hull
 * *on* the stopping circle, and a strict `<` there is a panel that opens or
 * does not depending on the last bit of a float.
 */
const MOOR_REACH = 0.6

/**
 * Push an XZ position out of every island's mooring circle, in place. Takes
 * anything with `x` and `z`, which is what a `Vector3` is here.
 *
 * A push rather than a stop, so a boat held against a coast keeps whatever
 * component of its motion runs along it — the same reason a wall in any other
 * game projects instead of blocking. The circles do not overlap (asserted
 * below), so one pass is enough: nothing this pushes out of one island can
 * land inside another.
 *
 * `isles` is the one exception the world has, and it is the surfer's: a man
 * standing on a plank he can pick up is the only craft here whose vehicle is
 * portable, so he crosses the isle's coast and walks up the beach instead of
 * being held off it. The landmark islands are not his to walk on — arriving
 * alongside one is what opens its panel, and their mooring circles are nearly
 * twice the radius that does it — so they are still a push for every craft
 * that floats. See `WALK_IN` in `Ship.tsx`.
 */
export function offshore(p: { x: number; z: number }, isles = true): void {
  // The isles first: they are the big ones, and their coast is a radius at an
  // angle rather than a circle. `isleRim` is star-convex, so the push is the
  // same one line of arithmetic — out along the bearing the hull is already on,
  // onto the coast in that direction and not onto some average of it.
  if (isles) for (const i of ISLES) {
    const dx = p.x - i.pos[0]
    const dz = p.z - i.pos[1]
    const d = Math.hypot(dx, dz)
    if (d >= i.radius * RIM_MAX + BEAM) continue
    const r = isleShore(i, Math.atan2(dz, dx)) + BEAM
    if (d >= r) continue
    const k = d > 1e-6 ? r / d : 0
    p.x = i.pos[0] + (d > 1e-6 ? dx * k : r)
    p.z = i.pos[1] + (d > 1e-6 ? dz * k : 0)
  }
  for (const l of LANDMARKS) {
    const dx = p.x - l.pos[0]
    const dz = p.z - l.pos[2]
    const d = Math.hypot(dx, dz)
    const r = moorRadius(l)
    if (d >= r) continue
    // Dead centre has no direction to be pushed in. Due east is as good as any,
    // and the only way to be there is to have been put there.
    const k = d > 1e-6 ? r / d : 0
    p.x = l.pos[0] + (d > 1e-6 ? dx * k : r)
    p.z = l.pos[2] + (d > 1e-6 ? dz * k : 0)
  }
}

export const landmarkOf = (slug: string | null): Landmark | undefined =>
  slug ? LANDMARKS.find((l) => l.slug === slug) : undefined

/**
 * Nearest landmark whose radius contains (x, z), or null. Pure — easy to check.
 *
 * `moored` is the floating character's version of the same question. A hull is
 * stopped at the shoreline, which is nearly twice as far out as `radius`, so it
 * can never reach the circle a flying saucer triggers on: arriving *alongside*
 * an island is what counts as arriving when you cannot fly over it.
 */
export function landmarkAt(x: number, z: number, moored = false): Landmark | null {
  let best: Landmark | null = null
  let bestD = Infinity
  for (const l of LANDMARKS) {
    const dx = x - l.pos[0]
    const dz = z - l.pos[2]
    const d = dx * dx + dz * dz
    const r = moored ? moorRadius(l) + MOOR_REACH : l.radius
    if (d < r * r && d < bestD) { bestD = d; best = l }
  }
  return best
}

/**
 * A waypoint outside its own radius is the Phase 3 bug that looks like a
 * feature: the deep link lands the ship next to the landmark, the very next
 * frame reports nothing in range, and the panel the visitor followed a link to
 * read closes itself. Two islands sharing a radius is the same failure wearing
 * a different hat. Checked in dev, from the built data, once.
 */
if (import.meta.env.DEV) {
  for (const i of ISLES) {
    // RIM_MAX is a number written down twice — here and in the harmonics — and
    // the one that matters is the shader's shoal circle and the hull's early
    // reject. Both are wrong the moment a harmonic changes and this does not.
    let widest = 0
    let zero = 0
    for (let k = 0; k < 720; k++) {
      const theta = (k / 720) * Math.PI * 2
      widest = Math.max(widest, isleShore(i, theta) / i.radius)
      // And the profile has to meet the water where the coast says it does, or
      // the mesh draws a beach the hull is pushed out of somewhere else.
      const s = isleShore(i, theta)
      zero = Math.max(zero, Math.abs(isleHeight(i, i.pos[0] + Math.cos(theta) * s, i.pos[1] + Math.sin(theta) * s)))
    }
    console.assert(widest <= RIM_MAX, `${i.id}: rim reaches ${widest.toFixed(3)}, RIM_MAX is ${RIM_MAX}`)
    console.assert(zero < 1e-6, `${i.id}: the ground is ${zero.toFixed(3)} off the water at its own coastline`)
    console.assert(isleHeight(i, i.pos[0], i.pos[1]) > i.peak * 0.8, `${i.id}: no summit — the ridge missed the middle`)
    // Clear of every landmark, moorings included: an isle overlapping one is a
    // hull pushed out of a coast into a coast, forever.
    for (const l of LANDMARKS) {
      const gap = Math.hypot(l.pos[0] - i.pos[0], l.pos[2] - i.pos[1])
      const need = i.radius * RIM_MAX + BEAM + moorRadius(l) + MOOR_REACH
      console.assert(gap > need, `${i.id} and ${l.slug} overlap: ${gap.toFixed(1)} apart, need ${need.toFixed(1)}`)
    }
  }
  for (const l of LANDMARKS) {
    const d = Math.hypot(l.waypoint[0] - l.pos[0], l.waypoint[2] - l.pos[2])
    console.assert(d < l.radius, `${l.slug}: waypoint is ${d.toFixed(2)} out, radius is ${l.radius}`)
    // And it has to frame the thing it arrived at. This used to be read
    // straight off the arithmetic, because the camera never yawed: a landmark
    // at a lower z was in front of the ship rather than between it and the
    // camera, and one at a higher x was in the right half of the frame, the
    // half the reading panel does not cover. The camera swings round behind the
    // heading now, and a deep link parks the ship *facing* its landmark, so the
    // first of those is true by construction and the second no longer decides
    // which half of the frame anything lands in — arriving points the camera at
    // it, near enough centred.
    //
    // Both are kept, because they still fix which side the world is approached
    // from, and every waypoint in the content was placed against them: the
    // approach runs up from behind and to the left of the thing, which is the
    // composition the sun and the islands were lit and laid out for. Where a
    // landmark now sits against the panel is a thing to look at rather than a
    // thing to assert — see `docs/STATUS.md`.
    console.assert(l.pos[2] < l.waypoint[2], `${l.slug}: waypoint is in front of the landmark — the camera would sit on it`)
    console.assert(l.pos[0] > l.waypoint[0], `${l.slug}: waypoint is right of the landmark — it would arrive under the panel`)
    // A waypoint inside an island is where the boat's deep link starts, and
    // `offshore` is what moves it out — to exactly `moorRadius`, which has to
    // still be inside the circle that opens the panel or the deep link opens a
    // panel and closes it one frame later, the Phase 3 bug wearing a hull.
    console.assert(MOOR_REACH > 0, 'the mooring circle must be wider than the one it stops on')
    for (const o of LANDMARKS) {
      if (o === l) continue
      const gap = Math.hypot(o.pos[0] - l.pos[0], o.pos[2] - l.pos[2])
      console.assert(gap > l.radius + o.radius, `${l.slug} and ${o.slug} overlap: ${gap.toFixed(2)} apart`)
      // And the same for the circles a boat is pushed out of, which are wider.
      // Two that overlap leave a pocket where being pushed out of one puts you
      // inside the other, and the hull buzzes between them forever.
      const moor = moorRadius(l) + MOOR_REACH + moorRadius(o) + MOOR_REACH
      console.assert(gap > moor, `${l.slug} and ${o.slug} moorings overlap: ${gap.toFixed(2)} apart, need ${moor.toFixed(2)}`)
    }
  }
}
