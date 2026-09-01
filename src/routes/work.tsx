import { Link, useOutletContext } from 'react-router'
import { PROJECTS } from '../content'
import { STRINGS, type Locale } from '../i18n'

/**
 * The flat index — where the skip link lands, and the one route that is a
 * reading surface whatever the visitor's hardware. Its links carry `?read` so
 * that stays true one click later: see `isWorldPath` in `src/i18n/locales.ts`.
 */
export default function Work() {
  const locale = useOutletContext<Locale>()
  const t = STRINGS[locale]

  return (
    <>
      <title>{`${t.workTitle} — ${t.name}`}</title>
      <meta name="description" content={t.workDescription} />

      <h1>{t.workTitle}</h1>
      <p className="lede">{t.workIntro}</p>

      <ol className="projects index">
        {PROJECTS[locale].map((p) => (
          <li key={p.slug}>
            <h2>
              <Link to={`/${locale}/work/${p.slug}?read`}>{p.title}</Link>
            </h2>
            <p className="meta">
              <span>{p.year}</span>
              <span>{p.stack.join(' · ')}</span>
            </p>
            <p>{p.summary}</p>
            <p>
              <Link to={`/${locale}/work/${p.slug}?read`} className="more">
                {t.readCaseStudy}
              </Link>
            </p>
          </li>
        ))}
      </ol>
    </>
  )
}
