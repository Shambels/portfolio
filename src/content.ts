import type { MDXProps } from 'mdx/types'
import type { ComponentType } from 'react'
import { LOCALES, SOURCE_LOCALE, isLocale, type Locale } from './i18n/locales'
import { LANDMARKS } from './world'

/**
 * Content is files (CLAUDE.md, invariant 7). Every `.mdx` under
 * `content/projects` is a project in one locale; nothing else lists them.
 *
 * English carries the structural frontmatter — year, stack, landmark, links —
 * and the translations carry only `title` and `summary` beside their prose, so
 * a URL or a stack entry is never written down three times and never drifts.
 */
export type Project = {
  slug: string
  /** Structural, from the English file. */
  year: number
  stack: string[]
  landmark: string
  site?: string
  repo?: string
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

/** World order, so the flat index and the islands read in the same sequence. */
const order = LANDMARKS.map((l) => l.slug)
const slugs = [...new Set(entries.map((e) => e.slug))].sort(
  (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b),
)

const str = (v: unknown, file: string, key: string): string => {
  if (typeof v !== 'string' || !v) throw new Error(`${file}: frontmatter '${key}' must be a string`)
  return v
}

function build(slug: string, locale: Locale): Project {
  const source = byKey.get(`${slug}.${SOURCE_LOCALE}`)
  if (!source) throw new Error(`${slug}: no ${SOURCE_LOCALE} file — English is the source of truth`)
  const entry = byKey.get(`${slug}.${locale}`) ?? source
  const file = `${slug}.${SOURCE_LOCALE}.mdx`
  const stack = source.fm.stack
  return {
    slug,
    year: Number(source.fm.year) || new Date().getFullYear(),
    stack: Array.isArray(stack) ? stack.map(String) : [],
    landmark: str(source.fm.landmark, file, 'landmark'),
    site: typeof source.fm.site === 'string' ? source.fm.site : undefined,
    repo: typeof source.fm.repo === 'string' ? source.fm.repo : undefined,
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
