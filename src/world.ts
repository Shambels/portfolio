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

/** True where the sea surface is: clear of every island's shoreline. */
export function overWater(x: number, z: number): boolean {
  return !LANDMARKS.some(
    (l) => Math.hypot(x - l.pos[0], z - l.pos[2]) < l.radius * ISLAND_SPREAD * SHORE,
  )
}

export const landmarkOf = (slug: string | null): Landmark | undefined =>
  slug ? LANDMARKS.find((l) => l.slug === slug) : undefined

/** Nearest landmark whose radius contains (x, z), or null. Pure — easy to check. */
export function landmarkAt(x: number, z: number): Landmark | null {
  let best: Landmark | null = null
  let bestD = Infinity
  for (const l of LANDMARKS) {
    const dx = x - l.pos[0]
    const dz = z - l.pos[2]
    const d = dx * dx + dz * dz
    if (d < l.radius * l.radius && d < bestD) { bestD = d; best = l }
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
    for (const o of LANDMARKS) {
      if (o === l) continue
      const gap = Math.hypot(o.pos[0] - l.pos[0], o.pos[2] - l.pos[2])
      console.assert(gap > l.radius + o.radius, `${l.slug} and ${o.slug} overlap: ${gap.toFixed(2)} apart`)
    }
  }
}
