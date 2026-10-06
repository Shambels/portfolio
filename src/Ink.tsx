import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { ANIME } from './device'
import { INK } from './toon'

/** A mesh that can take an outline: lit, opaque, one-sided, not skinned or
 *  instanced, and not already inked. */
function inkable(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh
  if (!m.isMesh || m.userData.inked || m.userData.ink) return false
  if ((m as unknown as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return false
  if (!m.geometry?.attributes.normal) return false
  // The board draws its own outline beside itself (`OUTLINE` in `Ship.tsx`).
  if (m.parent?.getObjectByName('outline')) return false
  const mat = m.material as THREE.Material
  if (Array.isArray(mat) || !(mat as THREE.MeshStandardNodeMaterial).isMeshStandardNodeMaterial) return false
  return !mat.transparent && mat.side === THREE.FrontSide
}

/**
 * Inks every inkable mesh under it, including the ones whose model arrives
 * later: models load behind `Suspense`, so it looks again every half second
 * and a mesh is inked once. The outline is a child of the mesh it
 * outlines, so it moves, hides and unmounts with it. Under `?look=classic`
 * it is the group and nothing else.
 */
export function Ink({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null!)
  const next = useRef(0)
  useFrame(() => {
    if (!ANIME) return
    const now = performance.now()
    if (now < next.current) return
    next.current = now + 500
    const found: THREE.Mesh[] = []
    group.current.traverse((o) => { if (inkable(o)) found.push(o) })
    for (const m of found) {
      const edge = new THREE.Mesh(m.geometry, INK)
      edge.userData.ink = true
      edge.raycast = () => {}
      m.userData.inked = true
      m.add(edge)
    }
  })
  return <group ref={group}>{children}</group>
}
