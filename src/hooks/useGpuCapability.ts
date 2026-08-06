import { useEffect, useState } from 'react'
import { useWispClient } from './useWispClient'
import type { GpuCapability } from '../wisp/types'

/**
 * Loads the host GPU capability from `GET /images` (the top-level `gpu`
 * object). Returns `null` until it resolves, when the request fails, or when
 * the field is absent (older wisp) — callers treat `null` as "no GPU info".
 *
 * Contract views use this to cross-reference their assigned device ids against
 * `capability.devices` to resolve a class; an id missing from the live
 * inventory simply stays unresolved (rendered as its bare id).
 */
export function useGpuCapability(): GpuCapability | null {
  const { getImages } = useWispClient()
  const [gpu, setGpu] = useState<GpuCapability | null>(null)

  useEffect(() => {
    let cancelled = false
    getImages()
      .then((res) => {
        if (!cancelled) setGpu(res.gpu ?? null)
      })
      .catch(() => {
        // Offline / unauthorized / older wisp — degrade to "no GPU info".
        if (!cancelled) setGpu(null)
      })
    return () => {
      cancelled = true
    }
  }, [getImages])

  return gpu
}
