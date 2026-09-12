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

  /**
   * The enclosed water, if it has any. `centre` is how far the lagoon's own
   * centre sits from the island's, toward the entrance — that offset is what
   * makes a crescent rather than a doughnut. `radius` is the basin, `mouth`
   * the half-width of the entrance, `floor` how deep, `shelf` how fast it
   * deepens off its own shore, `band` how wide that shore is before the
   * island's height takes over, `round` the rounding of the throat.
   *
   * **An island with one of these is not star-convex**, and that is the
   * invariant this whole file was built on: one coast per bearing, so
   * `offshore` could push a hull out along the bearing it was already on. A
   * crescent has two coasts on most bearings. `world.ts` grew `pushOut` for
   * it — a walk down the ground's own gradient — and `isles.check.ts` grew
   * three asserts in place of the two that could no longer be written.
   */
  lagoon?: {
    bearing: number
    centre: number
    radius: number
    mouth: number
    floor: number
    shelf: number
    band: number
    round: number
  }

  /** A crag instead of a crown: `share` of the shoulder-to-peak climb spent
   *  over `spread` of the radius rather than the broad 0.36, bent by `sharp`.
   *  Both halves are exactly 1 on the axis, so the summit is exactly `peak` by
   *  construction. `off` moves the whole thing back from the island's centre,
   *  away from the entrance — it has to, because the lagoon's centre is the
   *  other way and a summit over the island's own centre would be a summit
   *  under water. */
  spire?: { share: number; spread: number; sharp: number; off: number }

  /** The waterfall's chute, cut in the spire's lagoon-facing side. `lip` is
   *  where the cut starts, measured outward from the spire's axis: that edge
   *  is the headwall the water comes over, and the fall's height is `depth`
   *  times whatever the mountain is there, so it cannot hang in the air. */
  gorge?: { width: number; depth: number; lip: number; lipW: number }

  /** What makes rock read as rock: three crossing sine pairs in XZ, never in
   *  `theta` — the axis term that gave `palm-isle` a four-lobed crown is the
   *  mistake this is shaped to avoid. `amp` has a ceiling; 3 m is free and 4 m
   *  starts putting dips on a radial. */
  crag?: { amp: number; scale: number; from: number; to: number }

  /** The hidden strand: a disc at the foot of the chute inside which the
   *  ground is capped flat. It takes a bite out of the base of the cliff, so
   *  what is left is an alcove — a few metres of sand with a wall of rock
   *  behind it and the fall coming down across its mouth. `r` is metres out
   *  from the spire's axis along the fall's bearing, so it moves when the fall
   *  does. The cave's doorway is in that back wall: see `src/stair.ts`. */
  strand?: { r: number; rad: number; y: number; blend: number }
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
const CRAG_BEARING = Math.PI * 0.72

export const ISLES: Isle[] = [
  // The first one, and `spawn()` reads `ISLES[0]` — this is where the world
  // begins, so it stays first. Not one number of it has changed.
  { id: 'palm-isle', pos: [-52, -58], radius: 35, seed: 2.4, peak: 14, ridge: 0.72 },

  /**
   * The second, and it is the other thing an island can be: a crescent round
   * an almost-closed lagoon, with a 23 m crag standing over the far shore and
   * a waterfall coming off it into the water.
   *
   * 110 units from `palm-isle` and 67 from the easel's mooring at the closest,
   * both clear by the sum this file's own asserts make, with 14 m to spare at
   * the tightest. The other side of the three landmarks from `palm-isle`, so
   * the world has somewhere to go rather than somewhere to go back to.
   */
  {
    id: 'crag-isle',
    pos: [58, -54],
    // "Similarly sized" — the same 35 m mean radius, 70 m of coast to coast.
    radius: 35,
    seed: 5.1,
    // 23 against palm-isle's 14. The reference photograph is a rock taller
    // than the jungle it stands in, and that ratio is the whole read.
    peak: 23,
    // ACROSS the entrance, not along it, and it has to be. The squeeze makes
    // the crown's footprint reach furthest along the ridge, and along the
    // entrance is exactly where there must be no crown left by the time the
    // coast arrives — dug the other way, the ground was 0.76 m above the water
    // at its own waterline and `isles.check.ts` failed on the first bearing.
    ridge: CRAG_BEARING + Math.PI / 2,
    spire: { share: 0.78, spread: 0.30, sharp: 1.45, off: 11 },
    // 27 m of water across, 3.4 m deep, reached through a 9 m entrance.
    lagoon: {
      bearing: CRAG_BEARING,
      centre: 11,
      radius: 13.5,
      mouth: 4.5,
      floor: 3.6,
      shelf: 5,
      band: 3.5,
      round: 2.5,
    },
    gorge: { width: 0.26, depth: 0.55, lip: 0.20, lipW: 0.04 },
    crag: { amp: 1.8, scale: 0.22, from: 8.5, to: 14.5 },
    strand: { r: 7.0, rad: 2.7, y: 0.62, blend: 0.55 },
  },
]

/** Smoothstep. The scene has TSL's; this side of the file has one function. */
const S = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t
/** Shortest signed angle. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
/** Polynomial smooth minimum — the union of two water shapes without a crease
 *  where they meet. `k` is how many metres the rounding is spread over. */
const smin = (a: number, b: number, k: number) => {
  const t = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k))
  return mix(b, a, t) - k * t * (1 - t)
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
  //
  // The spire, if it has one, moves the whole crown off the island's centre —
  // `px, pz` is the point in the SPIRE's frame, and everything that belongs to
  // the mountain rather than to the coast is measured there: the crown, the
  // gullies that run off it, and the chute the fall comes down.
  const sp = i.spire
  const ox = sp ? -Math.cos(i.lagoon!.bearing) * sp.off : 0
  const oz = sp ? -Math.sin(i.lagoon!.bearing) * sp.off : 0
  const px = dx - ox
  const pz = dz - oz
  const c = Math.cos(i.ridge)
  const sn = Math.sin(i.ridge)
  // Divided by the coast's own radius when the summit is over the middle, and
  // by the island's mean radius when it is not. A point's distance to an
  // offset summit has nothing to do with how far away the coast happens to be
  // on the bearing from the island's centre, and normalising by it drags the
  // mountain's contours toward whichever side of the island is widest.
  const den = sp ? i.radius : shore
  const q = Math.hypot((px * c + pz * sn) * RIDGE_SQUEEZE, -px * sn + pz * c) / den
  // What ships on `palm-isle`: a broad smoothstep from the shoulder to the
  // peak. The draft beside it spends `share` of that same climb over a much
  // shorter run and bends what is left toward the top. Both are exactly 1 at
  // q = 0, so the summit is exactly `peak` whichever way they are mixed.
  const crest = S(0.36, 0.05, q)
  const pin = sp ? Math.pow(S(sp.spread, 0, q), sp.sharp) : 0
  h += (i.peak - SHOULDER) * (sp ? crest * (1 - sp.share) + pin * sp.share : crest)

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
  //
  // And cut round the PEAK rather than round the island's centre, once there
  // is a peak that is not at the centre. Same term, same 0.075, same 4.3
  // lobes; what changed is where its angle is measured from. Water cuts
  // gullies running off a summit, so when the summit moves they move with it —
  // otherwise the axis fade that keeps them off the peak sits eleven metres
  // away from the peak, and the summit comes out 13 mm short of `peak` for no
  // reason anyone could name. Found by the assert, not by looking.
  const thetaS = sp ? Math.atan2(pz, px) : theta
  const uS = sp ? Math.hypot(px, pz) / i.radius : u
  h *= 1 - 0.075 * (0.5 + 0.5 * Math.sin(4.3 * thetaS + i.seed * 1.7)) *
    S(1, 0.45, uS) * S(0.02, 0.2, uS)

  // The waterfall's chute, cut in the spire's lagoon-facing side so the fall
  // lands in the water rather than beside it. `lip` is where the cut starts,
  // measured outward from the axis: inside it the spire is untouched, outside
  // it the ground is taken down by `depth` of its own height. That edge is the
  // headwall, and the height of the fall is `depth` times whatever the
  // mountain is there — so it cannot hang in the air, and it moves when the
  // island does.
  //
  // No fade at the coast and it needs none: every land term is already zero at
  // the waterline, so a multiplier is zero there whatever it says. Which is
  // what lets the chute run unbroken into the water instead of stopping a
  // metre short of it.
  const g = i.gorge
  if (g) {
    const across = Math.exp(-((wrap(thetaS - i.lagoon!.bearing) / g.width) ** 2))
    h *= 1 - g.depth * across * S(g.lip - g.lipW, g.lip + g.lipW, uS)
  }

  // Crag detail: three crossing sine pairs in XZ and deliberately not in
  // `theta` — an angular term at full strength on the axis is the four-lobed
  // crown this file already grew once. Faded in by height so the beach and the
  // jungle never see it, and faded out at the summit so `peak` stays the
  // number it says it is.
  const cr = i.crag
  if (cr) {
    const k = cr.scale
    const n =
      0.55 * Math.sin(dx * k + dz * k * 0.6 + i.seed) * Math.sin(dz * k * 1.3 - dx * k * 0.4) +
      0.30 * Math.sin(dx * k * 2.1 - dz * k * 1.7 + i.seed * 2) * Math.sin(dz * k * 2.4 + dx * k * 0.9) +
      0.15 * Math.sin(dx * k * 4.3 + dz * k * 3.1) * Math.sin(dz * k * 3.7 - dx * k * 2.2)
    h += cr.amp * n * S(cr.from, cr.to, h) * S(0.02, 0.12, q)
  }

  // The hidden strand, at the foot of the chute: a disc inside which the
  // ground is capped flat. It takes a bite out of the base of the cliff, so
  // what is left is an alcove — sand, a wall of rock behind it, and the fall
  // coming down across its mouth. Before the lagoon's carve and not after, so
  // the waterline at its front edge is cut by the same arithmetic as every
  // other shoreline on the island.
  if (i.strand) {
    const scx = ox + Math.cos(i.lagoon!.bearing) * i.strand.r
    const scz = oz + Math.sin(i.lagoon!.bearing) * i.strand.r
    const sd = Math.hypot(dx - scx, dz - scz) - i.strand.rad
    h = mix(Math.min(h, i.strand.y), h, S(0, i.strand.blend, sd))
  }

  // And the shelf under the sea. Wide and shallow first — that is the lagoon,
  // and it is why the water round the island is turquoise rather than navy —
  // then away.
  h -=
    LAGOON * S(1, 1.1, u) +
    (DROP - LAGOON) * S(1.1, 1.34, u) +
    (SEABED - DROP) * S(1.34, ISLE_EXTENT, u)

  // And the lagoon carved out of all of it, for an island that has one.
  //
  // The floor saturates at `floor` going in, with slope 1 at the shoreline, so
  // the first metre off its beach shelves exactly as it does everywhere else
  // and only the bottom flattens. Going out, the island's own height is ramped
  // in over `band` metres — that ramp is the lagoon's shore, and it is short,
  // because forest at the water is a wall and not a beach.
  //
  // The `min` before the ramp is what keeps the open sea open: on land it
  // picks the flat zero the ramp climbs from, and in water already deeper than
  // the lagoon it picks that deeper water and the ramp does nothing. Without
  // it the entrance builds a bar across its own mouth.
  if (i.lagoon) {
    const d = lagoonDist(i, dx, dz)
    const floor = -i.lagoon.floor * (1 - Math.exp(Math.min(d, 0) / i.lagoon.shelf))
    h = mix(Math.min(h, floor), h, S(0, i.lagoon.band, d))
  }

  return h
}

/**
 * How far a point is OUTSIDE an isle's enclosed water, in metres — negative
 * inside it, zero on its shoreline, and it is a real distance rather than a
 * ratio of a radius.
 *
 * The lagoon is a circle; the entrance is a corridor running out of it along
 * the bearing; the two are joined with a smooth minimum, so the throat is a
 * throat and not two square corners.
 *
 * **A signed distance and not an angle, and that is the whole change of
 * approach.** Angles are measured from a centre and a crescent has two of
 * them: the rim's and the lagoon's. Everything the first two drafts fought —
 * a gaussian notch coming to a cusp at its head, a bay forced to widen
 * seaward, a polar mesh running out of radius inside it — was that mismatch.
 * In a distance field the shape is just the shape.
 */
export function lagoonDist(i: Isle, dx: number, dz: number): number {
  const l = i.lagoon!
  const bx = Math.cos(l.bearing)
  const bz = Math.sin(l.bearing)
  const ex = dx - bx * l.centre
  const ez = dz - bz * l.centre
  const dCircle = Math.hypot(ex, ez) - l.radius
  const along = ex * bx + ez * bz
  const perp = -ex * bz + ez * bx
  const dChannel = Math.max(
    Math.abs(perp) - l.mouth,
    l.radius * 0.5 - along,
    along - (i.radius * RIM_MAX - l.centre + 6),
  )
  return smin(dCircle, dChannel, l.round)
}

/**
 * Where the world begins: on the isle's beach, facing the three islands across
 * the water, the ridge at his back — the landing page's shore, drawn in the
 * world.
 *
 * On the bearing from the isle's centre to the origin, because that is the
 * direction the three project islands are in, and a coast is only a place to
 * start from if what you are meant to reach is in front of it — turned
 * `bearing` to starboard of that line, which puts the origin 9deg left of
 * centre with all three islands still in the frame, because that is where
 * the gap in the undergrowth is: the camera stands on the slope behind him,
 * and on the line itself it stood in a fern. Two distances
 * along it, as fractions of the shore radius there: `sand` is up the beach,
 * where the surfer stands with the board under his arm and runs from — 1.4 m
 * up, four units of sand to the water, two running strides — and `sea` is
 * where that run leaves him: seven units off the beach, on the edge of the
 * lagoon shelf, in water the rollers are damped out of. A craft that cannot
 * walk starts there, and so does a visitor who asked for less motion, instead
 * of being made to watch the run.
 *
 * Checked in `isles.check.ts`: the sand is high enough to be on foot by
 * `beach.ts`'s own numbers, the sea is over water, and the line between them
 * runs downhill and crosses the coast once. What is *not* asserted is the
 * planting: the palms and the ferns are `Isle.tsx`'s and need three, so the
 * bearing was chosen by replaying its planting in node — the camera's way
 * down the slope is clear of every fern, the nearest crown is eight units off
 * the line of sight, and the one big palm is at the water's edge to the right
 * of the frame. A change to the isle's seed, or to how it is planted, moves
 * that, and this number has to be looked at again when one happens.
 */
export const SPAWN = { bearing: 0.15, sand: 0.85, sea: 1.25 }

/** That, as a place and a heading. `yaw` is the ship's — atan2(x, z), so
 *  forward is (sin, cos) — and it points straight out to sea. */
export function spawn(ashore: boolean): { x: number; z: number; yaw: number } {
  const i = ISLES[0]!
  const theta = Math.atan2(-i.pos[1], -i.pos[0]) + SPAWN.bearing
  const r = isleShore(i, theta) * (ashore ? SPAWN.sand : SPAWN.sea)
  return {
    x: i.pos[0] + Math.cos(theta) * r,
    z: i.pos[1] + Math.sin(theta) * r,
    yaw: Math.atan2(Math.cos(theta), Math.sin(theta)),
  }
}

/**
 * Push an XZ position out of an isle's land, along the ground's own gradient.
 *
 * `offshore`'s radial push works because a star-convex island has one coast
 * per bearing, so "out" is a direction you can name from the centre. A
 * crescent has two coasts on most bearings and the push has to know which one
 * the hull is behind — and the ground field already knows. It is negative in
 * water and positive on land, and its gradient points uphill, so: walk down
 * it. One Newton step lands on the waterline if the slope holds, and the slope
 * does not hold, which is what the loop is for.
 *
 * Four height samples a step against the radial push's none. It also ends the
 * star-convex constraint for good, which is worth more than it costs: the same
 * function works for `palm-isle`, for the three landmark islands, and for
 * whatever gets drawn next.
 *
 * `clear` is how far below the waterline the hull wants to end up — the job
 * `BEAM` does in the radial push.
 */
export function pushOut(i: Isle, p: { x: number; z: number }, clear = 0.35, steps = 24): void {
  const e = 0.5
  for (let n = 0; n < steps; n++) {
    const h = isleHeight(i, p.x, p.z)
    if (h < -clear) return
    const gx = (isleHeight(i, p.x + e, p.z) - isleHeight(i, p.x - e, p.z)) / (2 * e)
    const gz = (isleHeight(i, p.x, p.z + e) - isleHeight(i, p.x, p.z - e)) / (2 * e)
    const g2 = gx * gx + gz * gz
    // Dead flat and above water has no direction to be pushed in, and the only
    // way to be there is to have been put there.
    if (g2 < 1e-8) return
    const t = Math.min(8, (h + clear) / g2)
    p.x -= gx * t
    p.z -= gz * t
  }
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
