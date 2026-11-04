import { Link, useOutletContext } from 'react-router'
import { CONTACT, SOURCE_LOCALE, STRINGS, isLocale, type Locale } from '../i18n'
import type { Route } from './+types/home'
import logo48 from '../assets/logo/logo-48.webp?no-inline'
import logo72 from '../assets/logo/logo-72.webp?no-inline'
import logo87 from '../assets/logo/logo-87.webp?no-inline'

/**
 * The work, by title, in world order — read at build time. A `loader` on a
 * prerendered route runs once per locale during the build and is stripped from
 * the client bundle, so the front page carries six titles and none of the MDX
 * that `content.ts` compiles in. Importing it here instead put the whole
 * content chunk (62 kB gz) on the first route, which the old landing page never
 * loaded. Still the content directory, and nothing listing projects by hand.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const { PROJECTS } = await import('../content')
  const locale = isLocale(params.lang) ? params.lang : SOURCE_LOCALE
  return PROJECTS[locale].map((p) => ({ slug: p.slug, title: p.title }))
}

/** One line of swell across the horizon drawing: `n` crests of `period`,
 *  starting a period left of the frame so the drift below can loop on it. */
function swell(y: number, amp: number, period: number): string {
  let d = `M${-period} ${y}`
  for (let x = -period; x < 1200 + period; x += period) {
    d += `q${period / 4} ${-amp} ${period / 2} 0t${period / 2} 0`
  }
  return d
}

/** The sun's glint on the water, as dashes that shorten towards us. */
const GLINT: [number, number][] = [
  [92, 74],
  [102, 58],
  [113, 44],
  [126, 32],
  [141, 22],
  [158, 13],
]

/**
 * The front page: a name, one line, four links and the work by title, over a
 * horizon drawn in hairlines — the shore's sun and sea with everything else
 * taken away. It is the shore's door rather than its replacement: "3D world"
 * leads there (`/{lang}/shore`), and the shore's button leads on into the
 * world.
 *
 * Every word is in the DOM and prerendered (invariant 2), the drawing is
 * `aria-hidden`, and the only motion — the swell drifting, the glint, the sun
 * coming up once — is CSS under `prefers-reduced-motion: no-preference`
 * (invariant 6). No JavaScript is needed for any of it.
 */
export default function Home({ loaderData: work }: Route.ComponentProps) {
  const locale = useOutletContext<Locale>()
  const t = STRINGS[locale]

  return (
    <>
      <title>{`${t.name} — ${t.role}`}</title>
      <meta name="description" content={t.tagline} />

      <div className="intro">
        <img
          className="mark"
          srcSet={`${logo48} 48w, ${logo72} 72w, ${logo87} 87w`}
          sizes="42px"
          src={logo48}
          alt=""
          width={42}
          height={56}
        />
        <h1>{t.name}</h1>
        <p className="tagline">
          <span className="role">{t.role}</span>
          {t.tagline}
        </p>

        <ul className="reach">
          <li>
            <Link to={`/${locale}/work`}>{t.navWork}</Link>
          </li>
          <li>
            <a href={CONTACT.github} target="_blank" rel="me noreferrer">
              GitHub
            </a>
          </li>
          <li>
            <a href={`mailto:${CONTACT.email}`}>{t.emailLabel}</a>
          </li>
          <li>
            <Link to={`/${locale}/shore`} className="to-shore">
              {t.exploreWorld}
              <span aria-hidden="true"> →</span>
            </Link>
          </li>
        </ul>

        <h2 className="label">{t.homeWorkHeading}</h2>
        <ul className="shelf">
          {work.map(({ slug, title }) => (
            <li key={slug}>
              {/* `?read`, as on the index: a case study opened from here is
                  read, not flown to (`isWorldPath`). */}
              <Link to={`/${locale}/work/${slug}?read`}>{title}</Link>
            </li>
          ))}
        </ul>
      </div>

      <svg className="horizon" viewBox="0 22 1200 198" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <defs>
          <clipPath id="front-sky">
            <rect x="0" y="0" width="1200" height="80" />
          </clipPath>
        </defs>
        <line className="sea-line" x1="0" y1="80" x2="1200" y2="80" />
        <g clipPath="url(#front-sky)">
          <circle className="sun" cx="600" cy="80" r="54" />
        </g>
        <g className="glint">
          {GLINT.map(([y, w], i) => (
            <line key={y} x1={600 - w / 2} y1={y} x2={600 + w / 2} y2={y} style={{ animationDelay: `${i * 0.35}s` }} />
          ))}
        </g>
        <path className="swell s1" d={swell(118, 3, 140)} />
        <path className="swell s2" d={swell(146, 4, 190)} />
        <path className="swell s3" d={swell(176, 5, 250)} />
      </svg>
    </>
  )
}
