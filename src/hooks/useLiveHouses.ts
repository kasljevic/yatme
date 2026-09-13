import { useEffect, useState } from 'react'
import { normalizeLiveHouses, type LiveHouse } from '../lib/houseRegistry.ts'

export interface LiveHousesState {
  houses: LiveHouse[]
  loading: boolean
  /** Set when the registry could not be reached, so the UI can stay quiet about it. */
  error: string | null
}

/**
 * Fetches the live house registry once, through the editor's own origin.
 *
 * The registry is optional decoration: the map already knows where houses are,
 * so a failure here must never block loading. Errors are reported rather than
 * thrown, and an unconfigured service simply yields an empty list.
 */
export function useLiveHouses(): LiveHousesState {
  const [state, setState] = useState<LiveHousesState>({ houses: [], loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    fetch('/api/houses')
      .then(res => {
        if (!res.ok) throw new Error(`Houses service returned ${res.status}`)
        return res.json()
      })
      .then(payload => {
        if (cancelled) return
        setState({ houses: normalizeLiveHouses(payload), loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({ houses: [], loading: false, error: err instanceof Error ? err.message : String(err) })
      })
    return () => { cancelled = true }
  }, [])

  return state
}
