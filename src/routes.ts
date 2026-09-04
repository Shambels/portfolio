import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  // `/world` is back, and linked this time. Phase 3 retired it because the
  // scene was behind `/{lang}` and an unlinked route had nothing left to hold;
  // the landing page has taken `/{lang}`, so the world needs an address again —
  // one that is shareable, survives a reload, and is a complete flat page for a
  // visitor with no renderer.
  route(':lang', './routes/locale.tsx', [
    index('./routes/home.tsx'),
    route('world', './routes/world.tsx'),
    route('work', './routes/work.tsx'),
    route('work/:slug', './routes/case-study.tsx'),
    route('404', './routes/not-found.tsx'),
  ]),
] satisfies RouteConfig
