/**
 * No test framework (CLAUDE.md). Locale path juggling is the one bit of Phase 2
 * logic that is not obvious by reading, so it leaves a check behind.
 *
 *   node src/i18n/locales.check.ts
 */
import assert from 'node:assert/strict'
import { canonicalPath, isLocale, localeOf, withLocale } from './locales.ts'

assert.equal(isLocale('fr'), true)
assert.equal(isLocale('de'), false)
assert.equal(isLocale(undefined), false)

assert.equal(localeOf('/fr'), 'fr')
assert.equal(localeOf('/fr/work/scrubble'), 'fr')
assert.equal(localeOf('/world'), null)
assert.equal(localeOf('/'), null)

// The language switcher: same page, other locale, root included.
assert.equal(withLocale('/fr/work/scrubble', 'nl'), '/nl/work/scrubble')
assert.equal(withLocale('/fr', 'en'), '/en')
assert.equal(withLocale('/en/work', 'fr'), '/fr/work')
// hreflang for every prerendered path must round-trip through itself.
for (const p of ['/en', '/en/work', '/en/work/polarsense', '/en/404']) {
  assert.equal(withLocale(p, 'en'), p)
}

assert.equal(canonicalPath('/en/work/'), '/en/work')
assert.equal(canonicalPath('/en/'), '/en')
assert.equal(canonicalPath('/'), '/')
assert.equal(canonicalPath('/en/work'), '/en/work')

console.log('locales: ok')
