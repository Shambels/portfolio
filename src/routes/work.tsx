import { Link, useOutletContext, useViewTransitionState } from 'react-router'
import { LABEL, PROJECTS, linksOf, type Project } from '../content'
import { STRINGS, type Locale } from '../i18n'

/**
 * The flat index — where the skip link lands, and the one route that is a
 * reading surface whatever the visitor's hardware. Its links carry `?read` so
 * that stays true one click later: see `isWorldPath` in `src/i18n/locales.ts`.
 *
 * Two columns that answer each other: a chart of the archipelago, drawn from
 * each project's frontmatter, and a ledger of the projects in world order, each
 * with its signature — `{slug}.svg` beside the MDX, a drawing of what the thing
 * does. Hovering either lights the other, in CSS (`:has()`), so it all works
 * prerendered with JS off; a browser without `:has()` gets one column and no
 * lighting, which is the page it had before. `docs/STATUS.md`, "The index is
 * a chart".
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

  // The one pairing CSS cannot write generically: this entry with that island.
  // A rule per slug, written from the content, so a sixth project lights up
  // without anyone touching the stylesheet. Slugs are CSS identifiers already.
  const lit =
    projects
      .map((p) => {
        const e = `#p-${p.slug}`
        const i = `.isle[data-s=${p.slug}]`
        return `.atlas:has(${e}:is(:hover,:focus-within),${i}:hover) :is(${e},${i})`
      })
      .join(',') + '{--lit:1}'

  return (
    <>
      <title>{`${t.workTitle} — ${t.name}`}</title>
      <meta name="description" content={t.workDescription} />
      <style dangerouslySetInnerHTML={{ __html: lit }} />

      <header className="index-head">
        <h1>{t.workTitle}</h1>
        <p className="lede">{t.workIntro}</p>
      </header>

      <div className="atlas">
        <div className="spread">
          <Chart projects={projects} />
          {/* Highest number first. `reversed` so a screen reader counts down with
              the numbers drawn beside it. The chart's route keeps world order. */}
          <ol className="ledger" reversed>
            {[...projects].reverse().map((p) => (
              <Entry key={p.slug} p={p} locale={locale} />
            ))}
          </ol>
        </div>
      </div>
    </>
  )
}
