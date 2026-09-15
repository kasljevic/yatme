import { describe, it, expect } from 'vitest'
import { rejectWrite, READ_ONLY_SERVER_MODE } from './writeGuard.ts'
import { READ_ONLY_THROUGH_PORTAL } from './portalOrigin.ts'
import type { ServerConfig } from '../config.ts'

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 8080,
    mapDir: '/maps',
    questsDir: '/maps/quests',
    readOnly: false,
    viewerAllowedOrigins: [],
    ...overrides,
  }
}

describe('rejectWrite', () => {
  it('allows a LAN write when not read-only and not portal-originated (backward compatibility)', () => {
    expect(rejectWrite(makeConfig(), { host: 'localhost:8004' })).toBeNull()
  })

  it('refuses every write when the server is configured read-only, even from the LAN', () => {
    const result = rejectWrite(makeConfig({ readOnly: true }), { host: 'localhost:8004' })
    expect(result).toEqual({ status: 403, body: READ_ONLY_SERVER_MODE })
  })

  it('refuses a portal-originated write when not explicitly read-only (existing behavior)', () => {
    const result = rejectWrite(makeConfig(), { 'x-portal-auth': 'tenant.123.sig' })
    expect(result).toEqual({ status: 403, body: READ_ONLY_THROUGH_PORTAL })
  })

  it('read-only config wins over the portal heuristic when both would refuse', () => {
    const result = rejectWrite(makeConfig({ readOnly: true }), { 'x-portal-auth': 'tenant.123.sig' })
    expect(result?.body).toBe(READ_ONLY_SERVER_MODE)
  })

  it('treats an array-valued x-portal-auth header the same as a string one', () => {
    const result = rejectWrite(makeConfig(), { 'x-portal-auth': ['tenant.123.sig'] })
    expect(result).toEqual({ status: 403, body: READ_ONLY_THROUGH_PORTAL })
  })
})
