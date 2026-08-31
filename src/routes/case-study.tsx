import { Link, useOutletContext, useParams } from 'react-router'
import { getProject } from '../content'
import { STRINGS, type Locale } from '../i18n'
import NotFound from './not-found'

export default function CaseStudy() {
  const locale = useOutletContext<Locale>()
  const { slug } = useParams()
  const project = getProject(locale, slug)
  if (!project) return <NotFound />
  const t = STRINGS[locale]

  return (
    <article className="prose">
      <title>{`${project.title} — ${t.name}`}</title>
      <meta name="description" content={project.summary} />

      <header>
        <p className="meta">
          <span>{project.year}</span>
          <span>{project.stack.join(' · ')}</span>
        </p>
        <h1>{project.title}</h1>
        <p className="lede">{project.summary}</p>
        <p className="links">
          {project.site && (
            <a href={project.site} rel="noreferrer">
              {t.linkSite}
            </a>
          )}
          {project.repo && (
            <a href={project.repo} rel="noreferrer">
              {t.linkRepo}
            </a>
          )}
          {!project.site && !project.repo && <span className="fine">{t.noLink}</span>}
        </p>
      </header>

      <project.Body />

      <p className="back">
        <Link to={`/${locale}/work`}>← {t.backToWork}</Link>
      </p>
    </article>
  )
}
