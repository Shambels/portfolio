import mdx from '@mdx-js/rollup'
import { reactRouter } from '@react-router/dev/vite'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { type Plugin, defineConfig } from 'vite'
import { SOURCE_LOCALE } from './src/i18n/locales.ts'

/**
 * The one line of `deploy/nginx.conf` the dev server does not have. `/` matches
 * the root route with no child under it, so without this it renders an empty
 * document — a black screen at the URL everyone types first.
 */
const rootRedirect: Plugin = {
  name: 'root-redirect',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/') return next()
      res.writeHead(302, { location: `/${SOURCE_LOCALE}` })
      res.end()
    })
  },
}

export default defineConfig({
  plugins: [
    // `enforce: 'pre'` so MDX is compiled to JS before React Router looks at it.
    { enforce: 'pre', ...mdx({ remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter] }) },
    reactRouter(),
    rootRedirect,
  ],
})
