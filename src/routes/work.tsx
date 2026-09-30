import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Link, useOutletContext, useViewTransitionState } from 'react-router'
import { LABEL, PROJECTS, linksOf, type Plate, type Project } from '../content'
import { Hologram } from '../Hologram'
import { Iceberg } from '../Iceberg'
import { Instant } from '../Instant'
import { Tiles } from '../Tiles'
import { Studio } from '../Studio'
import { STRINGS, type Locale } from '../i18n'
import mark from '../assets/logo/logo-512.webp?no-inline'

/**
 * The flat index — where the skip link lands, and the one route that is a
 * reading surface whatever the visitor's hardware. Its links carry `?read` so
 * that stays true one click later: see `isWorldPath` in `src/i18n/locales.ts`.
 *
 * A stage down the left third, a ledger beside it, and a small chart of the
 * archipelago in the bottom-right corner. The ledger is one project to a
 * screen, snapped; the stage holds each project's picture and swipes the one
 * leaving out to one side as the next comes in from the other. The chart and
 * the ledger still light each other on hover, in CSS (`:has()`), and the chart
 * lights the island on stage as well. `docs/STATUS.md`, "The index is a
 * stage".
 *
 * The page's own title has a slide too, the first: the mark, for now. So the
 * stage opens on the site and not on whichever project happens to be first.
 * On a phone the stage is a strip over the ledger rather than a column beside
 * it, and swipes the same way.
 *
 * With JS off the ledger is the whole page, as it always was, and the stage
 * stands on the mark — the swipe is the one thing here that needs a script,
 * because which card is in the middle of the screen is not something CSS can
 * be asked.
 */

/**
 * The coastline's radius over the proximity radius — `ISLAND_SPREAD` in
 * `world.ts`, copied rather than imported: `world.ts` is the canvas chunk's, and
 * a value import from it would drag the plateau, the isles and their tables into
 * the first-route chunk for one number. If the islands are ever lathed wider,
 * this is the second place to say so.
 */
const SPREAD = 1.9

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The archipelago from above, in world units: +x right, +z down, which is what
 * the SVG's own axes already are and what the minimap draws. Each island at its
 * `pos`, its coast at `radius * SPREAD * mapScale`, the minimap's letter on it, and the
 * route between them in `order`. A label sits on the side of its island that
 * faces away from the middle of the group, so no two meet over the water.
 *
 * Decoration for a screen reader — the ledger beside it says all of this in
 * words — so it is hidden, and its islands are links for a pointer only: a click
 * scrolls to the entry, which is where the keyboard already is.
 */
/**
 * What brings a plate to life, by landmark — the same key the world's `BUILD`
 * uses. The sudoku's draws the puzzle into its empty panel, because a
 * generated picture cannot be trusted with the digits; PolarSense's puts its
 * iceberg in water the cursor can stir; Arts by Sandra's gives the cursor a
 * brush and a palette; Memojo's is a camera that takes the picture; Scrubble's
 * rack plays the best move on the board, then the ones a person might have.
 */
const OVERLAY: Record<string, ComponentType<{ on: boolean; plate: Plate }>> = {
  sudoku: Hologram,
  mine: Iceberg,
  easel: Studio,
  ramp: Instant,
  board: Tiles,
}

/**
 * The title's slide, then one per project in ledger order. `at` is where each
 * one is: on stage,
 * or off it to the side it left by or will come in from — so scrolling down
 * sends the current one out left and brings the next in from the right, and
 * scrolling up runs the same thing backwards. Only the two that are changing
 * places move; a jump from the chart does not drag the ones between across.
 */
function Stage({ projects, on, was }: { projects: Project[]; on: number; was: number }) {
  const at = (i: number) => ({
    'data-at': i === on ? 'on' : i < on ? 'before' : 'after',
    'data-moving': i === on || i === was || undefined,
  })
  return (
    <div className="showcase" aria-hidden="true">
      <figure className="slide" {...at(0)}>
        <img className="mark" src={mark} alt="" decoding="async" />
      </figure>
      {projects.map((p, n) => {
        const Overlay = OVERLAY[p.landmark]
        return (
          <figure key={p.slug} className="slide" {...at(n + 1)}>
            {p.plate ? (
              <div className="plate">
                {p.plate.base && <img src={p.plate.base} alt="" decoding="async" />}
                {p.plate.light && <img className="light" src={p.plate.light} alt="" decoding="async" />}
                {Overlay && <Overlay on={n + 1 === on} plate={p.plate} />}
              </div>
            ) : (
              p.sig && <div className="plate sig" dangerouslySetInnerHTML={{ __html: p.sig }} />
            )}
          </figure>
        )
      })}
    </div>
  )
}

function Chart({ projects }: { projects: Project[] }) {
  const coast = (p: Project) => p.radius * SPREAD * p.mapScale
  const cz = projects.reduce((s, p) => s + p.pos[1], 0) / projects.length
  const x0 = Math.min(...projects.map((p) => p.pos[0] - coast(p))) - 3
  const x1 = Math.max(...projects.map((p) => p.pos[0] + coast(p))) + 3
  const z0 = Math.min(...projects.map((p) => p.pos[1] - coast(p))) - 5
  const z1 = Math.max(...projects.map((p) => p.pos[1] + coast(p))) + 6
  const grid = []
  for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) grid.push(`M${x} ${z0}V${z1}`)
  for (let z = Math.ceil(z0 / 10) * 10; z < z1; z += 10) grid.push(`M${x0} ${z}H${x1}`)

  return (
    <figure className="chart" aria-hidden="true">
      <svg viewBox={`${x0} ${z0} ${x1 - x0} ${z1 - z0}`}>
        <path className="grid" d={grid.join('')} />
        <polyline className="route" points={projects.map((p) => p.pos.join(',')).join(' ')} />
        {projects.map((p) => {
          const [x, z] = p.pos
          const r = coast(p)
          const above = z < cz
          return (
            <a key={p.slug} className="isle" data-s={p.slug} href={`#p-${p.slug}`} tabIndex={-1}>
              <circle className="shoal" cx={x} cy={z} r={r + 1.6} />
              <circle className="land" cx={x} cy={z} r={r} />
              <circle className="disc" cx={x} cy={z} r={2.6} />
              <text className="letter" x={x} y={z} data-wide={(LABEL.get(p.slug)?.length ?? 1) > 1 || undefined}>
                {LABEL.get(p.slug)}
              </text>
              <text className="name" x={x} y={above ? z - r - 2.2 : z + r + 3.4}>
                {`${pad(p.order)} ${p.title}`}
              </text>
            </a>
          )
        })}
        <g className="rose" transform={`translate(${x1 - 3.5} ${z0 + 5})`}>
          <path d="M0-3 .8 0 0-.6-.8 0Z" />
          <path d="M0 3 .8 0 0 .6-.8 0Z" opacity=".35" />
          <text y="-3.8">N</text>
        </g>
        <g className="scale" transform={`translate(${x1 - 16} ${z1 - 2.5})`}>
          <path d="M0-.5V.5M0 0H10M10-.5V.5" />
          <text x="11" y=".45">10 m</text>
        </g>
      </svg>
    </figure>
  )
}

/**
 * One project. The whole card is its title's link (`h2 a::after` covers it) and
 * the ways out sit above that on their own layer. The link asks for a view
 * transition and the card names itself `study` while it runs — `<main>` carries
 * that name on the case study, so the card grows into the page the way the
 * world's panel does. `useViewTransitionState` is what puts the name on this
 * card and no other, for the length of the transition and no longer.
 */
function Entry({ p, locale }: { p: Project; locale: Locale }) {
  const t = STRINGS[locale]
  const to = `/${locale}/work/${p.slug}?read`
  const growing = useViewTransitionState(to)

  return (
    <li className="entry" id={`p-${p.slug}`} style={growing ? { viewTransitionName: 'study' } : undefined}>
      <span className="num" aria-hidden="true">
        {pad(p.order)}
      </span>
      <div className="text">
        <h2>
          <Link to={to} viewTransition>
            {p.title}
          </Link>
        </h2>
        <p className="summary">{p.summary}</p>
        <p className="stack">
          <span className="year">{p.year}</span>
          {p.stack.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </p>
        <p className="out">
          {linksOf(p).map((l) => (
            <a key={l.key} href={l.href} target="_blank" rel={l.rel}>
              {t[l.key]}
            </a>
          ))}
          <span className="go" aria-hidden="true">
            {t.readCaseStudy} →
          </span>
        </p>
      </div>
      {p.sig && <div className="glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: p.sig }} />}
    </li>
  )
}

export default function Work() {
  const locale = useOutletContext<Locale>()
  const t = STRINGS[locale]
  const projects = PROJECTS[locale]
  // Highest number first. The chart's route keeps world order.
  const ledger = [...projects].reverse()

  // Which of the title and the cards is across the middle of the screen, and
  // which one was — the stage's two moving slides. A line at half height
  // rather than a fraction of each, so exactly one holds it at a time and a
  // tall card counts the same as a short one.
  const [[on, was], setOn] = useState<[number, number]>([0, 0])
  const head = useRef<HTMLElement>(null)
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const items = [head.current, ...(list.current?.children ?? [])].filter((e): e is Element => !!e)
    const seen = new IntersectionObserver(
      (hits) => {
        for (const h of hits) {
          if (!h.isIntersecting) continue
          const i = items.indexOf(h.target)
          setOn(([cur]) => (i === cur ? [cur, cur] : [i, cur]))
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    for (const el of items) seen.observe(el)
    return () => seen.disconnect()
  }, [])

  // The one pairing CSS cannot write generically: this entry with that island.
  // A rule per slug, written from the content, so a sixth project lights up
  // without anyone touching the stylesheet. Slugs are CSS identifiers already.
  const lit =
    projects
      .map((p) => {
        const e = `#p-${p.slug}`
        const i = `.isle[data-s=${p.slug}]`
        return `.atlas:has(${e}:is(:hover,:focus-within),${i}:hover) :is(${e},${i}),.atlas[data-on=${p.slug}] ${i}`
      })
      .join(',') + '{--lit:1}'

  return (
    <>
      <title>{`${t.workTitle} — ${t.name}`}</title>
      <meta name="description" content={t.workDescription} />
      <style dangerouslySetInnerHTML={{ __html: lit }} />

      <div className="atlas" data-on={ledger[on - 1]?.slug}>
        <Stage projects={ledger} on={on} was={was} />
        <div className="reel">
          <header className="index-head" ref={head}>
            <h1>{t.workTitle}</h1>
            <p className="lede">{t.workIntro}</p>
          </header>
          {/* `reversed` so a screen reader counts down with the numbers drawn
              beside it. */}
          <ol className="ledger" reversed ref={list}>
            {ledger.map((p) => (
              <Entry key={p.slug} p={p} locale={locale} />
            ))}
          </ol>
        </div>
        <Chart projects={projects} />
      </div>
    </>
  )
}
