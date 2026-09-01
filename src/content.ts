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
  site?: string
  repo?: string
  /** Which shape builds it — see `BUILD` in `src/Landmarks.tsx`. */
  landmark: string
  /** Island centre, XZ. The plateau height is one constant, `GROUND`. */
  pos: [number, number]
  /** Blockout box the built geometry must fit inside. */
  size: [number, number, number]
  /** Proximity trigger, XZ. */
  radius: number
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
}

type Module = { default: ComponentType<MDXProps>; frontmatter: unknown }

const modules = import.meta.glob<Module>('./content/projects/*.mdx', { eager: true })

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
    site: typeof fm.site === 'string' ? fm.site : undefined,
    repo: typeof fm.repo === 'string' ? fm.repo : undefined,
    landmark: str(fm.landmark, file, 'landmark'),
    pos: [px, pz],
    size: [sx, sy, sz],
    radius: num(fm.radius, file, 'radius'),
    waypoint: [wx, wz],
    order: orderOf(slug),
    locale,
    title: str(entry.fm.title, `${slug}.${entry.locale}.mdx`, 'title'),
    summary: str(entry.fm.summary, `${slug}.${entry.locale}.mdx`, 'summary'),
    Body: entry.Body,
    translated: entry.locale === locale,
  }
}

export const PROJECTS = Object.fromEntries(
  LOCALES.map((locale) => [locale, slugs.map((slug) => build(slug, locale))]),
) as Record<Locale, Project[]>

export function getProject(locale: Locale, slug: string | undefined): Project | undefined {
  return PROJECTS[locale].find((p) => p.slug === slug)
}
