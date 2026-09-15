import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createMapRouter } from './map.ts'
import type { ServerConfig } from '../config.ts'

function makeConfig(mapDir: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    mapDir,
    questsDir: path.join(mapDir, 'quests'),
    readOnly: false,
    viewerAllowedOrigins: [],
    ...overrides,
  }
}

async function startServer(config: ServerConfig) {
  const app = express()
  app.use('/api', createMapRouter(config))
  const server: Server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  return { server, baseUrl: `http://127.0.0.1:${port}/api` }
}

describe('map routes — write enforcement', () => {
  let mapDir: string

  beforeAll(() => {
    mapDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-map-routes-'))
    fs.writeFileSync(path.join(mapDir, 'existing.otbm'), 'existing-bytes')
    fs.writeFileSync(path.join(mapDir, 'existing-house.xml'), '<houses/>')
  })

  afterAll(() => {
    fs.rmSync(mapDir, { recursive: true, force: true })
  })

  it('accepts a LAN save when the server is not read-only (backward compatibility)', async () => {
    const { server, baseUrl } = await startServer(makeConfig(mapDir))
    try {
      const res = await fetch(`${baseUrl}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Map-Filename': 'existing.otbm' },
        body: new Uint8Array([1, 2, 3]),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean }
      expect(body.ok).toBe(true)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      // Restore original bytes for subsequent tests in this file.
      fs.writeFileSync(path.join(mapDir, 'existing.otbm'), 'existing-bytes')
    }
  })

  it('refuses a save when the server is configured read-only', async () => {
    const { server, baseUrl } = await startServer(makeConfig(mapDir, { readOnly: true }))
    try {
      const res = await fetch(`${baseUrl}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Map-Filename': 'existing.otbm' },
        body: new Uint8Array([9, 9, 9]),
      })
      expect(res.status).toBe(403)
      const body = await res.json() as { error: string }
      expect(body.error).toMatch(/read-only/i)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('refuses a portal-originated save even when not explicitly read-only (existing behavior)', async () => {
    const { server, baseUrl } = await startServer(makeConfig(mapDir))
    try {
      const res = await fetch(`${baseUrl}/map`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Map-Filename': 'existing.otbm',
          'X-Portal-Auth': 'tenant.123.sig',
        },
        body: new Uint8Array([9, 9, 9]),
      })
      expect(res.status).toBe(403)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('refuses a read-only sidecar save the same way', async () => {
    const { server, baseUrl } = await startServer(makeConfig(mapDir, { readOnly: true }))
    try {
      const res = await fetch(`${baseUrl}/map/sidecars/existing-house.xml`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array([1]),
      })
      expect(res.status).toBe(403)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('still serves GET /map when read-only (reads are never blocked)', async () => {
    const { server, baseUrl } = await startServer(makeConfig(mapDir, { readOnly: true }))
    try {
      const res = await fetch(`${baseUrl}/map`)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('existing-bytes')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
