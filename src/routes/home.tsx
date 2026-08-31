import { Link, useOutletContext } from 'react-router'
import { PROJECTS } from '../content'
import { STRINGS, type Locale } from '../i18n'

export default function Home() {
  const locale = useOutletContext<Locale>()
  const t = STRINGS[locale]
  const projects = PROJECTS[locale]

  return (
    <>
      <title>{`${t.name} — ${t.role}`}</title>
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
