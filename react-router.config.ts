import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Config } from '@react-router/dev/config'
import { LOCALES } from './src/i18n/locales.ts'

/**
 * Slugs come from the content directory, not from a list kept in sync by hand —
 * a new project is a new MDX file (CLAUDE.md, invariant 7). Read at config time,
 * so this cannot import anything that touches MDX.
 */
const dir = fileURLToPath(new URL('./src/content/projects', import.meta.url))
const slugs = [...new Set(readdirSync(dir).map((f) => f.split('.')[0]))].sort()

export default {
  appDirectory: 'src',
  // No server anywhere: every route below is written to disk at build time and
  // served as a file. `_redirects` sends `/` to a locale; Cloudflare serves
  // 404.html for anything unmatched.
  ssr: false,
  prerender: [
    ...LOCALES.flatMap((l) => [
      `/${l}`,
      `/${l}/work`,
      `/${l}/404`,
      ...slugs.map((s) => `/${l}/work/${s}`),
    ]),
    '/world',
  ],
} satisfies Config
