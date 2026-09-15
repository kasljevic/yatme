import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createQuestMapRouter } from './quests.ts'
import type { ServerConfig } from '../config.ts'

function makeConfig(questsDir: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    mapDir: path.dirname(questsDir),
    questsDir,
    readOnly: false,
    viewerAllowedOrigins: [],
    ...overrides,
  }
}

async function startServer(config: ServerConfig) {
  const app = express()
  app.use('/api', createQuestMapRouter(config))
  const server: Server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  return { server, baseUrl: `http://127.0.0.1:${port}/api` }
}

describe('quest map routes', () => {
  let questsDir: string

  beforeAll(() => {
    questsDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-quest-routes-'))
    fs.writeFileSync(path.join(questsDir, 'rookgaard-basics.otbm'), 'otbm-bytes')
    fs.writeFileSync(path.join(questsDir, 'rookgaard-basics-house.xml'), '<houses/>')
  })

  afterAll(() => {
    fs.rmSync(questsDir, { recursive: true, force: true })
  })

  it('streams the OTBM file for a valid quest slug', async () => {
    const { server, baseUrl } = await startServer(makeConfig(questsDir))
    try {
      const res = await fetch(`${baseUrl}/quests/rookgaard-basics/map`)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-map-sidecars')).toContain('rookgaard-basics-house.xml')
      expect(await res.text()).toBe('otbm-bytes')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('streams a sidecar file for a valid quest slug', async () => {
    const { server, baseUrl } = await startServer(makeConfig(questsDir))
    try {
      const res = await fetch(`${baseUrl}/quests/rookgaard-basics/map/sidecars/rookgaard-basics-house.xml`)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('<houses/>')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('404s for an unknown quest slug', async () => {
    const { server, baseUrl } = await startServer(makeConfig(questsDir))
    try {
      const res = await fetch(`${baseUrl}/quests/no-such-quest/map`)
      expect(res.status).toBe(404)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('400s for a slug that does not match the allowed pattern, rather than touching the filesystem', async () => {
    const { server, baseUrl } = await startServer(makeConfig(questsDir))
    try {
      const res = await fetch(`${baseUrl}/quests/thais_quest/map`)
      expect(res.status).toBe(400)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('404s for a sidecar name that belongs to a different quest slug', async () => {
    const { server, baseUrl } = await startServer(makeConfig(questsDir))
    try {
      const res = await fetch(`${baseUrl}/quests/rookgaard-basics/map/sidecars/other-quest-house.xml`)
      expect(res.status).toBe(404)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('always refuses POST to the quest map route, independent of READ_ONLY', async () => {
    for (const readOnly of [false, true]) {
      const { server, baseUrl } = await startServer(makeConfig(questsDir, { readOnly }))
      try {
        const res = await fetch(`${baseUrl}/quests/rookgaard-basics/map`, { method: 'POST', body: 'x' })
        expect(res.status).toBe(403)
      } finally {
        await new Promise<void>(resolve => server.close(() => resolve()))
      }
    }
  })

  it('always refuses POST to the quest sidecar route', async () => {
    const { server, baseUrl } = await startServer(makeConfig(questsDir))
    try {
      const res = await fetch(
        `${baseUrl}/quests/rookgaard-basics/map/sidecars/rookgaard-basics-house.xml`,
        { method: 'POST', body: 'x' },
      )
      expect(res.status).toBe(403)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('serves the configured viewer origin allowlist from GET /quest-config', async () => {
    const { server, baseUrl } = await startServer(
      makeConfig(questsDir, { viewerAllowedOrigins: ['https://example.com', 'https://cms.example.com'] }),
    )
    try {
      const res = await fetch(`${baseUrl}/quest-config`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ allowedOrigins: ['https://example.com', 'https://cms.example.com'] })
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('serves an empty allowlist from GET /quest-config when none is configured', async () => {
    const { server, baseUrl } = await startServer(makeConfig(questsDir))
    try {
      const res = await fetch(`${baseUrl}/quest-config`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ allowedOrigins: [] })
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
