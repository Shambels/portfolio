import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { PROJECTS } from './content'
import { ISLAND_SPREAD, ISLES, VIEW, isleShore, lagoonDist } from './world'
import { SOURCE_LOCALE, STRINGS, type Locale } from './i18n'

/**
 * The world's index, since the world stopped showing one: a top view in the
 * bottom right, centred on the character and moving with it — the isle's own
 * coastline, a letter on each project island, and the character's arrow
 * turning in the middle. A project outside the window is held on the box's
 * edge in the direction it lies, so the map is also the way to it.
 *
 * DOM, not canvas — invariant 2, and the letters are links, which is how
 * invariant 5 survives the panel going away. Lazy-loaded beside `Scene` so the
 * flat site never pays for it, and it reads `VIEW` (plain numbers in
 * `world.ts`) rather than `SHIP` (a `Vector3` in the canvas chunk): a value
 * import from anything inside the canvas would drag three in with it.
 *
 * Everything below is measured from the content. A project moves in its
 * frontmatter and the map moves with it.
 */

/**
 * World units across the box, both axes — one scale, or a circular island is
 * drawn as an ellipse. The one number here that is taste rather than
 * measurement: at 120 a project island is a sixth of the box, the isle is
 * two thirds of it, and from the spawn beach the mine is in the window with
 * the other two held on its edge, a hair past it — 140 would bring all three
 * in from there, at the cost of every disc on a phone being the floor size.
 */
const SPAN = 120

/** Island radius on the map — the same coastline `Islands` revolves out to. */
const reach = (p: { radius: number }) => p.radius * ISLAND_SPREAD

/**
 * A letter disc is never drawn smaller than `.map .isle`'s `min-width` in the
 * CSS — a tap target, not a scale — so this is that floor as a radius in
 * fractions of the box, taken at the phone's map width, where it is largest.
 * Only the edge hold reads it; the disc's own size is the island's.
 */
const DISC_MIN = 0.1

/** Between a held disc and the border, as a fraction of the box. */
const GAP = 0.02

/** The SVG's viewBox: the window in world units, top view — +x is right and
 *  +z is down, which is what the SVG's own y axis already is. */
const box = () => `${VIEW.x - SPAN / 2} ${VIEW.z - SPAN / 2} ${SPAN} ${SPAN}`

/**
 * The isle's coast, once, as a path in world units: `isleShore` walked round,
 * the same function the hull is pushed out of and the mesh is lathed from. 96
 * points for a coast with a seventh harmonic on it is 14 per lobe, which is
 * enough at any size this is drawn.
 */
const COAST = ISLES.map((i) => {
  const N = 96
  let d = ''
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2
    const r = isleShore(i, t)
    d += `${k ? 'L' : 'M'}${(i.pos[0] + Math.cos(t) * r).toFixed(2)} ${(i.pos[1] + Math.sin(t) * r).toFixed(2)}`
  }
  return { id: i.id, d: d + 'Z' }
})

/**
 * And the water inside an island that has any, because a coastline drawn round
 * a crescent is a solid blob and the whole point of that island is that you can
 * sail into the middle of it.
 *
 * Star-convex about the LAGOON's own centre even though the island is not
 * star-convex about its: from in there, every bearing crosses from water to
 * land exactly once, whether it leaves through the basin's wall or down the
 * entrance. So it is the same walk `COAST` makes, from a different middle.
 */
const LAGOON = ISLES.filter((i) => i.lagoon).map((i) => {
  const N = 96
  const cx = i.pos[0] + Math.cos(i.lagoon!.bearing) * i.lagoon!.centre
  const cz = i.pos[1] + Math.sin(i.lagoon!.bearing) * i.lagoon!.centre
  let d = ''
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2
    let r = i.lagoon!.radius
    for (let q = 1; q < i.radius * 1.4; q += 0.25) {
      if (lagoonDist(i, cx - i.pos[0] + Math.cos(t) * q, cz - i.pos[1] + Math.sin(t) * q) >= 0) {
        r = q
        break
      }
    }
    d += `${k ? 'L' : 'M'}${(cx + Math.cos(t) * r).toFixed(2)} ${(cz + Math.sin(t) * r).toFixed(2)}`
  }
  return { id: i.id, d: d + 'Z' }
})

/**
 * Where a project's disc goes, as a fraction of the box from its centre —
 * which is the character. Exact while the whole disc fits; past that it is
 * held inside the edge *along the line from the character to it*, so a
 * project that is north-east reads north-east and not "somewhere up". A
 * square's edge along a ray is the Chebyshev clamp: scale by the larger of
 * the two distances.
 */
function place(p: { pos: [number, number]; radius: number }) {
  let dx = (p.pos[0] - VIEW.x) / SPAN
  let dz = (p.pos[1] - VIEW.z) / SPAN
  const lim = 0.5 - Math.max(reach(p) / SPAN, DISC_MIN) - GAP
  const m = Math.max(Math.abs(dx), Math.abs(dz))
  const far = m > lim
  if (far) {
    dx *= lim / m
    dz *= lim / m
  }
  return { left: `${(dx + 0.5) * 100}%`, top: `${(dz + 0.5) * 100}%`, far }
}

const size = (p: { radius: number }) => `${((reach(p) * 2) / SPAN) * 100}%`

export default function MiniMap({ locale, slug }: { locale: Locale; slug: string | null }) {
  const coast = useRef<SVGSVGElement>(null!)
  const me = useRef<HTMLDivElement>(null!)
  const discs = useRef(new Map<string, HTMLAnchorElement>())

  // One rAF loop writing a handful of properties on a handful of elements.
  // Not React state: the window moves every frame and nothing else on the
  // page does. The discs are looked up by slug rather than by index so the
  // loop does not care which locale's list rendered them.
  useEffect(() => {
    let raf = requestAnimationFrame(function tick() {
      coast.current.setAttribute('viewBox', box())
      for (const p of PROJECTS[SOURCE_LOCALE]) {
        const el = discs.current.get(p.slug)
        if (!el) continue
        const at = place(p)
        el.style.left = at.left
        el.style.top = at.top
        el.toggleAttribute('data-far', at.far)
      }
      // The arrow is drawn pointing down, which is yaw 0 — the ship faces +z.
      // Screen y runs the other way from a rotation about Y, hence the sign.
      me.current.style.rotate = `${-VIEW.yaw}rad`
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <nav className="map" aria-label={STRINGS[locale].worldMap}>
      {/* Scenery, not a link: the isle has no route to go to. */}
      <svg ref={coast} className="coast" viewBox={box()} aria-hidden="true">
        {COAST.map((c) => (
          <path key={c.id} d={c.d} vectorEffect="non-scaling-stroke" />
        ))}
        {LAGOON.map((c) => (
          <path key={`${c.id}-lagoon`} d={c.d} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {PROJECTS[locale].map((p) => {
        const at = place(p)
        return (
          <Link
            key={p.slug}
            ref={(el) => {
              if (el) discs.current.set(p.slug, el)
              else discs.current.delete(p.slug)
            }}
            className="isle"
            to={`/${locale}/work/${p.slug}`}
            aria-current={p.slug === slug ? 'page' : undefined}
            aria-label={p.title}
            title={p.title}
            data-far={at.far || undefined}
            style={{ left: at.left, top: at.top, width: size(p), height: size(p) }}
          >
            {/* The slug, not the title: it is the one name a project has that is
                the same in all three locales, so "Arts by Sandra" is an A in
                Dutch too and no letter can collide with itself. */}
            {p.slug[0]!.toUpperCase()}
          </Link>
        )
      })}

      {/* Centred by the CSS: the window is drawn around the character. */}
      <div ref={me} className="me" style={{ rotate: `${-VIEW.yaw}rad` }} />
    </nav>
  )
}
