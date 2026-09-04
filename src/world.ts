import { PROJECTS } from './content'
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
  return !LANDMARKS.some((l) => Math.hypot(x - l.pos[0], z - l.pos[2]) < shoreOf(l))
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
 */
export function offshore(p: { x: number; z: number }): void {
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
  for (const l of LANDMARKS) {
    const d = Math.hypot(l.waypoint[0] - l.pos[0], l.waypoint[2] - l.pos[2])
    console.assert(d < l.radius, `${l.slug}: waypoint is ${d.toFixed(2)} out, radius is ${l.radius}`)
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
