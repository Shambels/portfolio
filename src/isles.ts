/**
 * The isle: the island that is a place rather than a project, and the
 * arithmetic that is its shape.
 *
 * Plural, and that is not a style choice: `Isle.tsx` is the component beside
 * it, macOS cannot tell one from the other, and TypeScript refuses the pair
 * outright. The same trap `Scenery.tsx` is named around.
 *
 * Its own module and not part of `world.ts` for one reason — `world.ts` imports
 * the content, the content is MDX, and MDX cannot be run by node. Everything
 * here is pure arithmetic over numbers written down in this file, so
 * `node src/isle.check.ts` runs it, and the checks that matter (the coast the
 * mesh draws is the coast the hull is pushed out of, the summit is where the
 * ridge says) are asserts rather than a screenshot.
 */

/* ---------------------------------------------------------------------------
 * The isles.
 *
 * An island that is a place rather than a project. It has ground, a coastline,
 * a mooring and a lagoon exactly like the three that carry landmarks, and it
 * has no slug, no panel and no route: sailing to it is the whole of it.
 *
 * Here and not in the content directory because content is projects — a `.mdx`
 * file with a year, a stack and a case study, listed on `/work` and prerendered
 * at its own URL. An island with palm trees on it has none of those, and giving
 * it a fake year to get a coastline would put it in the index beside three real
 * ones. So: a second list, read by `Isle.tsx` for its shape, by `offshore` for
 * its coast, and by the water for its lagoon.
 * ------------------------------------------------------------------------ */

export type Isle = {
  id: string
  /** Centre, XZ. Sea level is the datum; the ground is a function, not a plane. */
  pos: [number, number]
  /** Mean waterline radius. `isleRim` moves the real one around it. */
  radius: number
  /** Phase for those harmonics. Two isles of the same radius are not the same
   *  island, and this is the only thing that makes them different. */
  seed: number
  /** Summit above the water. */
  peak: number
  /** Heading the ridge runs along, radians — an island is a ridge with a coast
   *  around it far more often than it is a cone. */
  ridge: number
}

/**
 * One, and it is the horizon the visitor faces: the camera never yaws, so -Z is
 * the direction every frame looks in, and there was nothing out there. Placed
 * beyond the mine and well clear of every mooring circle (asserted below), far
 * enough that it reads as distance rather than as scenery parked offshore.
 *
 * 35 m of radius against a 1.8 m rider is the scale the whole thing is sized
 * from: 70 m of beach to beach, a 14 m ridge, and palms that stand three times
 * the height of the man on the board. The three project islands are 17 m
 * across, which is a rock — this is what one at human scale looks like next to
 * them, and that difference is the point.
 */
export const ISLES: Isle[] = [
  { id: 'palm-isle', pos: [-52, -58], radius: 35, seed: 2.4, peak: 14, ridge: 0.72 },
]

/** Smoothstep. The scene has TSL's; this side of the file has one function. */
const S = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Waterline radius at an angle, as a multiple of the mean — the same trick
 * `Islands` plays on its lathe, with one more harmonic of travel because this
 * coast is twice as long and a repeat is visible from further away.
 *
 * Star-convex on purpose: every point of the coast is a single radius at a
 * single angle, which is what lets `offshore` push a hull straight out to it
 * instead of solving for the nearest point on a curve.
 */
function isleRim(theta: number, seed: number) {
  return (
    1 +
    0.115 * Math.sin(3 * theta + seed) +
    0.062 * Math.sin(5 * theta + seed * 2.3) -
    0.048 * Math.sin(7 * theta + seed * 0.7)
  )
}

/** Where an isle's coast is, in world units, in the direction `theta`. */
export const isleShore = (i: Isle, theta: number) => i.radius * isleRim(theta, i.seed)

/** The widest that gets — what a circle drawn around the whole island has to
 *  cover. Asserted against the harmonics below rather than trusted. */
export const RIM_MAX = 1.225

// The profile, in metres above the water. Fractions below are of the shore
// radius at that angle, so a bay has the same beach as a headland.
const BERM = 1.25     // top of the beach, where the sand stops climbing
const APRON = 3.4     // the flat the palms stand on
const SHOULDER = 9.0  // where the jungle slope gives out and the ridge starts
/** How much less the along-ridge direction counts than the across one. Every
 *  bit of the difference between a ridge and a volcano is in this number. */
const RIDGE_SQUEEZE = 0.45
// And below it: the lagoon shelf the turquoise comes from, then the drop.
const LAGOON = 1.5
const DROP = 9
const SEABED = 15
/** How far out the underwater skirt runs, as a multiple of the shore radius. */
export const ISLE_EXTENT = 1.46

/**
 * The ground at a world XZ, in metres above the water, negative under it.
 *
 * This is the island: `Isle.tsx` builds its mesh by evaluating this on a polar
 * grid, and `Ship` reads the same function to fly over it. One function, the
 * way `swell()` is one function for the water and the hull — a mesh and a
 * collision that merely agree are a mesh and a collision that will stop.
 */
export function isleHeight(i: Isle, x: number, z: number): number {
  const dx = x - i.pos[0]
  const dz = z - i.pos[1]
  const r = Math.hypot(dx, dz)
  const theta = Math.atan2(dz, dx)
  const shore = isleShore(i, theta)
  const u = r / shore

  // Land. Every term is zero at and beyond the waterline, so the same
  // expression runs on both sides of it and the beach meets the sea at 0.
  let h =
    BERM * S(1, 0.9, u) +
    (APRON - BERM) * S(0.9, 0.62, u) +
    (SHOULDER - APRON) * S(0.62, 0.3, u)

  // The ridge, on an axis of its own: distance measured with the along-ridge
  // direction squeezed is a crest with ends rather than a summit with a rim.
  const c = Math.cos(i.ridge)
  const sn = Math.sin(i.ridge)
  const q = Math.hypot((dx * c + dz * sn) * RIDGE_SQUEEZE, -dx * sn + dz * c) / shore
  h += (i.peak - SHOULDER) * S(0.36, 0.05, q)

  // Gullies. A multiplier and not an addend, so it is nothing at the waterline
  // and deepest where the island is highest — which is where water running off
  // one cuts them.
  //
  // And nothing at the *axis* either, which is the second fade and was missing.
  // `theta` is undefined at r = 0 and flips by pi across it, so an angular term
  // that is still at full strength there is a discontinuity in the height
  // field: this island's summit was a four-lobed crown 2.1 m tall with a step
  // down the middle of it, at every radius in to a millimetre of the centre.
  // Nothing had shown it. The mesh draws the crown and the saucer flies 1.4 m
  // over it behind a third of a second of lag, so it reads as shape; the
  // surfer's own feet are what put a man on top of it, and `beach.check.ts`
  // found the 2.1 m step the first time it walked one over the peak.
  //
  // Water running off a peak cuts gullies down the flanks and not across the
  // summit, so the fix is also the more honest island.
  // It is also subtractive now where it used to be signed, and that is the same
  // fix and not a second one: a term that *adds* height on some bearings makes
  // the profile rise on the way out of the axis fade, which is the terrace
  // `isles.check.ts` refuses. A gully is a cut. Cutting only ever takes the
  // island down, the summit is whatever is left when nothing is cut, and the
  // climb to it is monotonic on every bearing by construction.
  //
  // **This is a change to the isle's committed look and it is small.** The old
  // multiplier ran 0.925 to 1.075 and this one runs 0.925 to 1.0: the gullies
  // are exactly as deep as they were and the spurs between them are gone,
  // flattened to the profile they were standing proud of. The island is about
  // 4% lower on average and its summit is 14.00 m where it read 13.15 — because
  // the peak is no longer whichever side of a crown `theta` 0 happened to land
  // on. It cannot go back up to 0.15 without the terrace: `isles.check.ts`
  // rejects 0.10 and passes 0.075, and the flat spot it catches is at u 0.62,
  // where the apron's smoothstep runs out of slope.
  h *= 1 - 0.075 * (0.5 + 0.5 * Math.sin(4.3 * theta + i.seed * 1.7)) *
    S(1, 0.45, u) * S(0.02, 0.2, u)

  // And the shelf under the sea. Wide and shallow first — that is the lagoon,
  // and it is why the water round the island is turquoise rather than navy —
  // then away.
  h -=
    LAGOON * S(1, 1.1, u) +
    (DROP - LAGOON) * S(1.1, 1.34, u) +
    (SEABED - DROP) * S(1.34, ISLE_EXTENT, u)

  return h
}

/**
 * Land height at a world XZ across every isle, sea level where there is none.
 * Read once a frame by the flight controller.
 */
export function ground(x: number, z: number): number {
  let h = 0
  for (const i of ISLES) {
    // Cheap reject first: the isles are tens of units wide and the ship is
    // almost never on one.
    const dx = x - i.pos[0]
    const dz = z - i.pos[1]
    if (dx * dx + dz * dz > (i.radius * RIM_MAX) ** 2) continue
    h = Math.max(h, isleHeight(i, x, z))
  }
  return h
}
