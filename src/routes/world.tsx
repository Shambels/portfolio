import { Suspense, lazy, useEffect, useState } from 'react'

/**
 * The Phase 0/1 scene, kept reachable at `/world` while the flat site ships.
 * Dynamic import plus a mount gate: `three/webgpu` is in no prerendered
 * document and in no first-route chunk (CLAUDE.md, budgets).
 */
const Scene = lazy(() => import('../App'))

export default function World() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <>
      <title>World — blockout</title>
      <meta name="robots" content="noindex" />
      {mounted && (
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      )}
    </>
  )
}
