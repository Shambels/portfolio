import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  // No `/world`: Phase 3 moved the canvas into the root layout, so the scene is
  // behind `/{lang}` and `/{lang}/work/{slug}` and there is nothing left for an
  // unlinked route to hold.
  route(':lang', './routes/locale.tsx', [
    index('./routes/home.tsx'),
    route('work', './routes/work.tsx'),
    route('work/:slug', './routes/case-study.tsx'),
    route('404', './routes/not-found.tsx'),
  ]),
] satisfies RouteConfig
