import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import type { ServerConfig } from '../config.ts'
import {
  isValidQuestSlug,
  resolveQuestOtbmPath,
  resolveQuestSidecarPath,
  discoverQuestSidecars,
} from '../lib/quests.ts'
import { rejectWrite } from '../lib/writeGuard.ts'

/**
 * Read-only quest map access, mounted under /api alongside the existing
 * single-map routes. Each quest is one allowlisted OTBM file selected by a
 * validated slug — never an arbitrary path — so one embedded viewer instance
 * can only ever see the map it asked for by name.
 *
 * There is deliberately no way to write through these routes: the POST
 * handlers below always refuse, independent of `config.readOnly`, because a
 * quest viewer is read-only by construction, not merely by configuration.
 */
export function createQuestMapRouter(config: ServerConfig): Router {
  const router = Router()

  // GET /quest-config — the runtime settings the quest viewer's postMessage
  // bridge needs from the server before it can trust any cross-origin
  // message. Served at runtime (not baked into the client bundle) so a
  // prebuilt image can be deployed under any domain and still configure its
  // own allowlist via VIEWER_ALLOWED_ORIGINS.
  router.get('/quest-config', (_req, res) => {
    res.json({ allowedOrigins: config.viewerAllowedOrigins })
  })

  // GET /quests/:slug/map — stream the quest's OTBM file
  router.get('/quests/:slug/map', (req, res) => {
    const slug = req.params['slug']
    if (!isValidQuestSlug(slug)) {
      res.status(400).json({ error: 'Invalid quest slug' })
      return
    }

    const otbmPath = resolveQuestOtbmPath(config.questsDir, slug)
    if (!otbmPath) {
      res.status(404).json({ error: 'Quest map not found' })
      return
    }

    const stat = fs.statSync(otbmPath)
    const filename = path.basename(otbmPath)
    const sidecars = discoverQuestSidecars(config.questsDir, slug)

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    if (sidecars.length > 0) {
      res.setHeader('X-Map-Sidecars', sidecars.join(', '))
    }

    fs.createReadStream(otbmPath).pipe(res)
  })

  // GET /quests/:slug/map/sidecars/:name — stream a quest sidecar file
  router.get('/quests/:slug/map/sidecars/:name', (req, res) => {
    const slug = req.params['slug']
    const name = req.params['name']
    if (!isValidQuestSlug(slug)) {
      res.status(400).json({ error: 'Invalid quest slug' })
      return
    }

    const filePath = resolveQuestSidecarPath(config.questsDir, slug, name)
    if (!filePath) {
      res.status(404).json({ error: 'Sidecar not found' })
      return
    }

    const stat = fs.statSync(filePath)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    fs.createReadStream(filePath).pipe(res)
  })

  // POST /quests/:slug/map — always refused. Quest maps have no writer: this
  // route exists only so a misbehaving client gets a clear 403 instead of
  // falling through to the SPA fallback with a confusing 200.
  router.post('/quests/:slug/map', (req, res) => {
    const rejection = rejectWrite(config, req.headers) ?? { status: 403, body: { error: 'Quest maps are read-only' } }
    res.status(rejection.status).json(rejection.body)
  })

  // POST /quests/:slug/map/sidecars/:name — always refused, for the same reason.
  router.post('/quests/:slug/map/sidecars/:name', (req, res) => {
    const rejection = rejectWrite(config, req.headers) ?? { status: 403, body: { error: 'Quest maps are read-only' } }
    res.status(rejection.status).json(rejection.body)
  })

  return router
}
