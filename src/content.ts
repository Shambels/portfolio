import type { MDXProps } from 'mdx/types'
import type { ComponentType } from 'react'
import { LOCALES, SOURCE_LOCALE, isLocale, type Locale } from './i18n/locales'

/**
 * Content is files (CLAUDE.md, invariant 7). Every `.mdx` under
 * `content/projects` is a project in one locale; nothing else lists them.
 *
 * English carries the structural frontmatter — year, stack, links, and since
 * Phase 3 the landmark's placement in the world — and the translations carry
 * only `title` and `summary` beside their prose, so a URL, a stack entry or a
 * coordinate is never written down three times and never drifts.
 *
 * `src/world.ts` reads its whole layout from here. That is the direction the
 * import runs: a new project is a new MDX file and, at most, a new entry in
 * `Landmarks.tsx` if it wants a shape nothing else has.
 */
export type Project = {
  slug: string
  /** Structural, from the English file. */
  year: number
  stack: string[]
  /** A running build of the thing, on this domain. Its own key rather than a
   *  second `site`: `site` is somebody else's server and opens as such, and
   *  this is a path — `/sudoku/`, a static demo nginx serves beside the site
   *  out of its own repository, not a route this app knows how to render. */
  demo?: string
  site?: string
  repo?: string
  /** The two stores, for a project that ships as an app. Their own keys rather
   *  than a second `site`: they are two destinations with two names, and a
   *  list of links keyed by a store would be a list nothing else here needs. */
  play?: string
  appStore?: string
  /** Which shape builds it — see `BUILD` in `src/Landmarks.tsx`. */
  landmark: string
  /** Island centre, XZ. The plateau height is one constant, `GROUND`. */
  pos: [number, number]
  /** Blockout box the built geometry must fit inside. */
  size: [number, number, number]
  /** Proximity trigger, XZ. */
  radius: number
  /** How big the island is drawn on the flat index's chart, as a fraction of
   *  its coast in the world. Optional, 1 by default — the chart is a picture of
   *  the archipelago, not a survey, and this is its one knob that the world
   *  does not share. */
  mapScale: number
  /** Where a deep link puts the ship. Must be inside `radius` — `world.ts` checks. */
  waypoint: [number, number]
  /** Reading order, in the flat index and around the world. */
  order: number
  /** Per locale. */
  locale: Locale
  title: string
  summary: string
  Body: ComponentType<MDXProps>
  /** False when this locale has no file yet and English is standing in. */
  translated: boolean
  /** The project's signature — `{slug}.svg` beside its MDX, inlined by the flat
   *  index as a drawing of what the thing does. Optional: a project without one
   *  gets an entry without a panel. Language-neutral, so one file per slug. */
  sig?: string
}

type Module = { default: ComponentType<MDXProps>; frontmatter: unknown }

const modules = import.meta.glob<Module>('./content/projects/*.mdx', { eager: true })

/** Raw markup, not a URL: the index inlines it, so its own `<style>` can animate
 *  it off the entry's hover and it paints with no request. ~6 kB gz for five. */
const sigs = import.meta.glob<string>('./content/projects/*.svg', { query: '?raw', import: 'default', eager: true })

type Entry = { slug: string; locale: Locale; fm: Record<string, unknown>; Body: ComponentType<MDXProps> }

/** The one cast at the loader boundary: MDX cannot type its own frontmatter. */
const entries: Entry[] = Object.entries(modules).map(([path, mod]) => {
  const file = path.slice(path.lastIndexOf('/') + 1)
  const [slug, locale] = file.split('.')
  if (!slug || !isLocale(locale)) throw new Error(`${file}: expected {slug}.{en|fr|nl}.mdx`)
  const fm = mod.frontmatter
  if (typeof fm !== 'object' || fm === null) throw new Error(`${file}: missing frontmatter`)
  return { slug, locale, fm: fm as Record<string, unknown>, Body: mod.default }
})

const byKey = new Map(entries.map((e) => [`${e.slug}.${e.locale}`, e]))

const str = (v: unknown, file: string, key: string): string => {
  if (typeof v !== 'string' || !v) throw new Error(`${file}: frontmatter '${key}' must be a string`)
  return v
}

const num = (v: unknown, file: string, key: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${file}: frontmatter '${key}' must be a number`)
  return v
}

/** A fixed-length list of numbers. Destructured at the call site, which is what
 *  turns it back into the tuple the scene indexes. */
function nums(v: unknown, file: string, key: string, n: number): number[] {
  if (!Array.isArray(v) || v.length !== n || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new Error(`${file}: frontmatter '${key}' must be ${n} numbers`)
  }
  return v as number[]
}

const orderOf = (slug: string): number =>
  num(byKey.get(`${slug}.${SOURCE_LOCALE}`)?.fm.order, `${slug}.${SOURCE_LOCALE}.mdx`, 'order')

/** World order, so the flat index and the islands read in the same sequence. */
const slugs = [...new Set(entries.map((e) => e.slug))].sort(
  (a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b),
)

function build(slug: string, locale: Locale): Project {
  const source = byKey.get(`${slug}.${SOURCE_LOCALE}`)
  if (!source) throw new Error(`${slug}: no ${SOURCE_LOCALE} file — English is the source of truth`)
  const entry = byKey.get(`${slug}.${locale}`) ?? source
  const file = `${slug}.${SOURCE_LOCALE}.mdx`
  const fm = source.fm
  const stack = fm.stack
  const [px, pz] = nums(fm.pos, file, 'pos', 2)
  const [wx, wz] = nums(fm.waypoint, file, 'waypoint', 2)
  const [sx, sy, sz] = nums(fm.size, file, 'size', 3)
  return {
    slug,
    year: Number(fm.year) || new Date().getFullYear(),
    stack: Array.isArray(stack) ? stack.map(String) : [],
    demo: typeof fm.demo === 'string' ? fm.demo : undefined,
    site: typeof fm.site === 'string' ? fm.site : undefined,
    repo: typeof fm.repo === 'string' ? fm.repo : undefined,
    play: typeof fm.play === 'string' ? fm.play : undefined,
    appStore: typeof fm.appStore === 'string' ? fm.appStore : undefined,
    landmark: str(fm.landmark, file, 'landmark'),
    pos: [px, pz],
    size: [sx, sy, sz],
    radius: num(fm.radius, file, 'radius'),
    mapScale: fm.mapScale === undefined ? 1 : num(fm.mapScale, file, 'mapScale'),
    waypoint: [wx, wz],
    order: orderOf(slug),
    locale,
    title: str(entry.fm.title, `${slug}.${entry.locale}.mdx`, 'title'),
    summary: str(entry.fm.summary, `${slug}.${entry.locale}.mdx`, 'summary'),
    Body: entry.Body,
    translated: entry.locale === locale,
    sig: sigs[`./content/projects/${slug}.svg`],
  }
}

export const PROJECTS = Object.fromEntries(
  LOCALES.map((locale) => [locale, slugs.map((slug) => build(slug, locale))]),
) as Record<Locale, Project[]>

/**
 * What a project's disc says, on the minimap and on the index's chart. The slug
 * and not the title: it is the one name a project has that is the same in all
 * three locales, so "Arts by Sandra" is an A in Dutch too and a letter can never
 * collide with itself.
 *
 * One letter where that tells them apart and as many as it takes where it does
 * not — `scrubble` and `sudoku` are both S, and on a map whose whole job is to
 * be the way to a project, two identical discs are worse than one busier one.
 * Derived from the slugs rather than written down, so a sixth project starting
 * with an S gets three letters instead of a collision, and the assert is what
 * says the derivation still works.
 */
export const LABEL = (() => {
  const out = new Map<string, string>()
  for (const slug of slugs) {
    let n = 1
    while (n < slug.length && slugs.some((o) => o !== slug && o.slice(0, n) === slug.slice(0, n))) n++
    out.set(slug, slug.slice(0, n).toUpperCase())
  }
  return out
})()

if (import.meta.env.DEV) {
  console.assert(new Set(LABEL.values()).size === LABEL.size, 'two projects share a map label')
}

/**
 * A project's ways out, in the order they are offered: the running build first,
 * then somebody else's server, the source, the two stores. Data rather than
 * markup because two pages draw it — the case study and the flat index — and
 * each draws it its own way; the key names the string in `STRINGS`.
 *
 * `demo` is on this domain and outside this app. `/sudoku/` is five static files
 * nginx serves out of the demo's own repository (`deploy/nginx.conf`), which is
 * why it must be an `<a>` and never a `<Link>`: a router navigation to a path
 * outside `/:lang` matches `:lang` against `sudoku`, and `locale.tsx` answers a
 * non-locale with the 404 — the SPA would render "not found" over a page that is
 * sitting right there on the server. `noopener` rather than `noreferrer`: this is
 * our own page, so there is no referrer to withhold from ourselves, and a tab
 * that cannot reach back into this one is worth having from anybody.
 *
 * Everything else is off the site, so out of the site's way: a new tab leaves
 * the panel open, the ship where it was parked and the scene running behind it,
 * which a same-tab navigation to somebody else's server does not.
 * `rel="noreferrer"` already implies `noopener`, which is what makes handing a
 * tab over safe.
 */
export function linksOf(p: Project) {
  const all = [
    { key: 'linkDemo', href: p.demo, rel: 'noopener' },
    { key: 'linkSite', href: p.site, rel: 'noreferrer' },
    { key: 'linkRepo', href: p.repo, rel: 'noreferrer' },
    { key: 'linkPlay', href: p.play, rel: 'noreferrer' },
    { key: 'linkAppStore', href: p.appStore, rel: 'noreferrer' },
  ] as const
  return all.filter((l): l is (typeof all)[number] & { href: string } => !!l.href)
}

export function getProject(locale: Locale, slug: string | undefined): Project | undefined {
  return PROJECTS[locale].find((p) => p.slug === slug)
}
