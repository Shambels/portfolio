import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { PROJECTS } from './content'
import { ISLAND_SPREAD, VIEW } from './world'
import { SOURCE_LOCALE, STRINGS, type Locale } from './i18n'

/**
 * The world's index, since the world stopped showing one: a top view of the
 * three islands in the bottom right, a letter on each, and the character's
 * arrow moving across it.
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

/** Island radius on the map — the same coastline `Islands` revolves out to. */
const reach = (p: { radius: number }) => p.radius * ISLAND_SPREAD

/** Room around the outermost coastline, as a multiple of the world's extent. */
const PAD = 1.16

function bounds(axis: 0 | 1) {
  const ls = PROJECTS[SOURCE_LOCALE]
  const lo = Math.min(...ls.map((p) => p.pos[axis] - reach(p)))
  const hi = Math.max(...ls.map((p) => p.pos[axis] + reach(p)))
  return { mid: (lo + hi) / 2, span: hi - lo }
}

const X = bounds(0)
const Z = bounds(1)

/** One scale for both axes, or a circular island is drawn as an ellipse. */
const SPAN = Math.max(X.span, Z.span) * PAD

/** World units to a percentage of the map's box. Top view: +x is right and +z
 *  is down, which is what the camera behind the ship already shows. */
const pct = (v: number, mid: number) => `${((v - mid) / SPAN + 0.5) * 100}%`
const size = (p: { radius: number }) => `${((reach(p) * 2) / SPAN) * 100}%`

/** The ship can fly past every coast; the map cannot grow with it. Held at the
 *  edge instead, which still reads as "out that way". */
const held = (v: number, mid: number) =>
  `${Math.max(4, Math.min(96, ((v - mid) / SPAN + 0.5) * 100))}%`

export default function MiniMap({ locale }: { locale: Locale }) {
  const me = useRef<HTMLDivElement>(null!)

  // One rAF loop writing three properties on one element. Not React state: the
  // arrow moves every frame and nothing else on the page does.
  useEffect(() => {
    let raf = requestAnimationFrame(function tick() {
      const s = me.current.style
      s.left = held(VIEW.x, X.mid)
      s.top = held(VIEW.z, Z.mid)
      // The arrow is drawn pointing down, which is yaw 0 — the ship faces +z.
      // Screen y runs the other way from a rotation about Y, hence the sign.
      s.rotate = `${-VIEW.yaw}rad`
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <nav className="map" aria-label={STRINGS[locale].worldMap}>
      {PROJECTS[locale].map((p) => (
        <Link
          key={p.slug}
          className="isle"
          to={`/${locale}/work/${p.slug}`}
          aria-label={p.title}
          title={p.title}
          style={{ left: pct(p.pos[0], X.mid), top: pct(p.pos[1], Z.mid), width: size(p), height: size(p) }}
        >
          {/* The slug, not the title: it is the one name a project has that is
              the same in all three locales, so "Arts by Sandra" is an A in
              Dutch too and no letter can collide with itself. */}
          {p.slug[0]!.toUpperCase()}
        </Link>
      ))}

      <div
        ref={me}
        className="me"
        style={{ left: held(VIEW.x, X.mid), top: held(VIEW.z, Z.mid), rotate: `${-VIEW.yaw}rad` }}
      />
    </nav>
  )
}
