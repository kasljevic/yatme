// @vitest-environment jsdom
// This is the first hook test that actually renders, so it needs a DOM; the
// project default is the node environment because the rest are pure functions.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLiveHouses } from './useLiveHouses.ts'

function mockFetch(impl: () => Promise<unknown>): void {
  vi.stubGlobal('fetch', vi.fn(impl))
}

function okResponse(body: unknown): Promise<unknown> {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
}

describe('useLiveHouses', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('reports the houses the registry returns', async () => {
    mockFetch(() => okResponse({ houses: [{ houseid: 1234, name: 'Castle of the Winds' }] }))

    const { result } = renderHook(() => useLiveHouses())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.houses).toHaveLength(1)
    expect(result.current.houses[0]?.houseid).toBe(1234)
    expect(result.current.error).toBeNull()
  })

  it('starts out loading before the registry answers', () => {
    mockFetch(() => new Promise(() => { /* never settles */ }))

    const { result } = renderHook(() => useLiveHouses())

    expect(result.current.loading).toBe(true)
    expect(result.current.houses).toEqual([])
  })

  it('yields an empty list when no registry is configured', async () => {
    mockFetch(() => okResponse({ houses: [], configured: false }))

    const { result } = renderHook(() => useLiveHouses())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.houses).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('reports an error instead of throwing when the registry is unreachable', async () => {
    mockFetch(() => Promise.reject(new Error('connect ECONNREFUSED')))

    const { result } = renderHook(() => useLiveHouses())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.houses).toEqual([])
    expect(result.current.error).toContain('ECONNREFUSED')
  })

  it('reports an error when the registry answers with a failure status', async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) }))

    const { result } = renderHook(() => useLiveHouses())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('502')
  })
})
