import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  // Static beats dynamic in the ranker, so this is not swallowed by `:lang`.
  // Not linked from the site: it is the Phase 0/1 scene, kept flyable while the
  // flat site ships. Phase 3 moves the canvas into the root layout.
  route('world', './routes/world.tsx'),

  route(':lang', './routes/locale.tsx', [
    index('./routes/home.tsx'),
    route('work', './routes/work.tsx'),
    route('work/:slug', './routes/case-study.tsx'),
    route('404', './routes/not-found.tsx'),
  ]),
] satisfies RouteConfig
