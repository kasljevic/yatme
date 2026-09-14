import express, { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import type { ServerConfig } from '../config.ts'
import { findOtbmFile, discoverSidecars } from '../lib/mapDir.ts'
import { isPortalOriginated, READ_ONLY_THROUGH_PORTAL } from '../lib/portalOrigin.ts'

function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^\w.-]/g, '_')
}

export function createMapRouter(config: ServerConfig): Router {
  const router = Router()

  // GET /health — liveness for an orchestrator's status probe.
  // Reports what the server can actually see, not merely that Express answered:
  // the SPA fallback returns 200 for every unknown path, so a probe of any
  // other URL would report "up" with an unmounted or empty map directory.
  router.get('/health', (_req, res) => {
    // findOtbmFile throws when the map directory does not exist (an unmounted
    // volume). That is a report-worthy state, not a crash: answer ok:false.
    let otbmPath: string | null = null
    try {
      otbmPath = findOtbmFile(config.mapDir, config.mapFile)
    } catch {
      otbmPath = null
    }
    res.json({
      ok: otbmPath !== null,
      map: otbmPath ? path.basename(otbmPath) : null,
      sidecars: discoverSidecars(config.mapDir).length,
    })
  })

  // GET /map — stream the OTBM file
  router.get('/map', (_req, res) => {
    const otbmPath = findOtbmFile(config.mapDir, config.mapFile)
    if (!otbmPath) {
      res.status(404).json({ error: 'No .otbm file found in map directory' })
      return
    }

    const stat = fs.statSync(otbmPath)
    const filename = path.basename(otbmPath)
    const sidecars = discoverSidecars(config.mapDir)

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    if (sidecars.length > 0) {
      res.setHeader('X-Map-Sidecars', sidecars.join(', '))
    }

    fs.createReadStream(otbmPath).pipe(res)
  })

  // GET /map/sidecars/:name — stream a sidecar file
  router.get('/map/sidecars/:name', (req, res) => {
    const name = req.params['name']
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
      res.status(400).json({ error: 'Invalid sidecar name' })
      return
    }

    const filePath = path.join(config.mapDir, name)

    // Ensure resolved path is within mapDir
    if (!path.resolve(filePath).startsWith(path.resolve(config.mapDir))) {
      res.status(400).json({ error: 'Invalid sidecar name' })
      return
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.status(404).json({ error: 'Sidecar not found' })
      return
    }

    const stat = fs.statSync(filePath)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    fs.createReadStream(filePath).pipe(res)
  })

  // POST /map — save the OTBM file
  router.post('/map',
    express.raw({ type: 'application/octet-stream', limit: '200mb' }),
    (req, res) => {
      // Refused for anyone who arrived through the public portal. The portal
      // already declines the verb, so reaching this line means that layer was
      // bypassed or removed; there is one map file on one disk and every
      // visitor is reading it, so the machine holding the bytes gets the last
      // word. A LAN request carries no X-Portal-Auth, so editing at
      // localhost:8004 is untouched.
      if (isPortalOriginated(req.headers)) {
        res.status(403).json(READ_ONLY_THROUGH_PORTAL)
        return
      }

      const body = req.body as Buffer
      if (!body || body.length === 0) {
        res.status(400).json({ error: 'Empty body' })
        return
      }

      const rawFilename = req.headers['x-map-filename']
      const filename = typeof rawFilename === 'string' && rawFilename
        ? sanitizeFilename(rawFilename)
        : 'map.otbm'

      const targetPath = path.join(config.mapDir, filename)

      // Ensure target is within mapDir
      if (!path.resolve(targetPath).startsWith(path.resolve(config.mapDir))) {
        res.status(400).json({ error: 'Invalid filename' })
        return
      }

      const tmpPath = targetPath + '.tmp'
      try {
        fs.writeFileSync(tmpPath, body)
        fs.renameSync(tmpPath, targetPath)
        res.json({ ok: true, bytes: body.length })
      } catch (err) {
        // Clean up tmp file if rename failed
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        console.error('Failed to save map:', err)
        res.status(500).json({ error: 'Failed to save map' })
      }
    }
  )

  // POST /map/sidecars/:name — save a sidecar file
  router.post('/map/sidecars/:name',
    express.raw({ type: 'application/octet-stream', limit: '50mb' }),
    (req, res) => {
      // Refused for anyone who arrived through the public portal. The portal
      // already declines the verb, so reaching this line means that layer was
      // bypassed or removed; there is one map file on one disk and every
      // visitor is reading it, so the machine holding the bytes gets the last
      // word. A LAN request carries no X-Portal-Auth, so editing at
      // localhost:8004 is untouched.
      if (isPortalOriginated(req.headers)) {
        res.status(403).json(READ_ONLY_THROUGH_PORTAL)
        return
      }

      const name = req.params['name']
      if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
        res.status(400).json({ error: 'Invalid sidecar name' })
        return
      }

      const body = req.body as Buffer
      if (!body || body.length === 0) {
        res.status(400).json({ error: 'Empty body' })
        return
      }

      const safeName = sanitizeFilename(name)
      const targetPath = path.join(config.mapDir, safeName)

      if (!path.resolve(targetPath).startsWith(path.resolve(config.mapDir))) {
        res.status(400).json({ error: 'Invalid sidecar name' })
        return
      }

      const tmpPath = targetPath + '.tmp'
      try {
        fs.writeFileSync(tmpPath, body)
        fs.renameSync(tmpPath, targetPath)
        res.json({ ok: true, bytes: body.length })
      } catch (err) {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        console.error('Failed to save sidecar:', err)
        res.status(500).json({ error: 'Failed to save sidecar' })
      }
    }
  )

  return router
}
