import { Router } from 'express'
import type { ServerConfig } from '../config.ts'

/** How long a fetched snapshot is reused. The upstream refreshes on a schedule. */
const CACHE_TTL_MS = 60_000

/** Upstream page size. The full Tibia house registry is ~1000 records. */
const UPSTREAM_LIMIT = 2000

interface CachedPayload {
  fetchedAt: number
  body: unknown
}

/**
 * Proxies the launchpad tibia-houses service.
 *
 * The editor runs on a different port from that service, so a direct browser
 * fetch would be cross-origin. Proxying keeps the client same-origin and keeps
 * the upstream's address a deployment detail rather than something baked into
 * the bundle.
 */
export function createHousesRouter(config: ServerConfig): Router {
  const router = Router()
  let cache: CachedPayload | null = null

  router.get('/houses', async (_req, res) => {
    if (!config.housesUrl) {
      // Not configured is a normal standalone deployment, not an error: answer
      // with an empty registry so the editor still shows the map's own houses.
      res.json({ houses: [], source: null, configured: false })
      return
    }

    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      res.json(cache.body)
      return
    }

    const url = `${config.housesUrl.replace(/\/$/, '')}/api/houses?limit=${UPSTREAM_LIMIT}`
    try {
      const upstream = await fetch(url)
      if (!upstream.ok) {
        res.status(502).json({ error: `Houses service returned ${upstream.status}`, houses: [] })
        return
      }
      const body = await upstream.json()
      cache = { fetchedAt: Date.now(), body }
      res.json(body)
    } catch (err) {
      console.error('Failed to fetch houses:', err)
      res.status(502).json({ error: 'Houses service unreachable', houses: [] })
    }
  })

  return router
}
