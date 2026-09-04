import { Link, useOutletContext } from 'react-router'
import { PROJECTS } from '../content'
import { STRINGS, type Locale } from '../i18n'

/**
 * `/{lang}/world` — the world's own address, and what was `/{lang}` until the
 * landing page took it. The canvas shows behind this route and behind a case
 * study, and behind nothing else (`isWorldPath`).
 *
 * With no renderer, or no JavaScript, this is the flat page it has always been:
 * the bio and the three projects. Invariant 4 is why the button on the landing
 * page needs no capability check — the address it points at is a complete page
 * either way.
 */
export default function World() {
  const locale = useOutletContext<Locale>()
  const t = STRINGS[locale]
  const projects = PROJECTS[locale]

  return (
    <>
      {/* Not the landing page's title: `/{lang}` and this are two prerendered
          documents, and two documents that claim the same title are one of them
          wasted. */}
      <title>{`${t.homeWorkHeading} — ${t.name}`}</title>
      <meta name="description" content={t.bio} />

      <section className="intro">
        <h1>{t.name}</h1>
        <p className="lede">{t.bio}</p>
      </section>

      <h2>{t.homeWorkHeading}</h2>
      <ul className="projects">
        {projects.map((p) => (
          <li key={p.slug}>
            <h3>
              <Link to={`/${locale}/work/${p.slug}`}>{p.title}</Link>
            </h3>
            <p>{p.summary}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
