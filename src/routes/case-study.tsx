import { Link, useOutletContext, useParams } from 'react-router'
import { getProject } from '../content'
import { STRINGS, type Locale } from '../i18n'
import { useWorld } from '../WorldGate'
import NotFound from './not-found'

/**
 * One route, two presentations of the same project, decided by whether the
 * world is showing behind it.
 *
 * Flying into a landmark pushes this URL, and what opens is a card: enough to
 * know what the thing is, and one link out to the prose. Reading the prose is
 * `?read`, which is also what the flat index links to and what the prerendered
 * document is — so the case study is complete HTML with no JavaScript, with no
 * WebGL, and one click away with both.
 */
export default function CaseStudy() {
  const locale = useOutletContext<Locale>()
  const { slug } = useParams()
  const { active: world } = useWorld()
  const project = getProject(locale, slug)
  if (!project) return <NotFound />
  const t = STRINGS[locale]

  const head = (
    <>
      <title>{`${project.title} — ${t.name}`}</title>
      <meta name="description" content={project.summary} />
    </>
  )

  const meta = (
    <p className="meta">
      <span>{project.year}</span>
      <span>{project.stack.join(' · ')}</span>
    </p>
  )

  const offsite = (
    <>
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
    </>
  )

  if (world) {
    return (
      <section className="card">
        {head}
        {meta}
        <h1>{project.title}</h1>
        <p className="lede">{project.summary}</p>
        <p className="links">
          <Link to={`/${locale}/work/${project.slug}?read`} className="more">
            {t.readCaseStudy}
          </Link>
          {offsite}
        </p>
      </section>
    )
  }

  return (
    <article className="prose">
      {head}

      <header>
        {meta}
        <h1>{project.title}</h1>
        <p className="lede">{project.summary}</p>
        <p className="links">
          {offsite}
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
