// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseOriginAllowlist, resolveQuestOrigins, isAllowedQuestOrigin, fetchQuestOriginAllowlist } from './questOrigin.ts'

describe('parseOriginAllowlist', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseOriginAllowlist('https://a.example, https://b.example ,https://c.example'))
      .toEqual(['https://a.example', 'https://b.example', 'https://c.example'])
  })

  it('drops empty entries produced by trailing/double commas', () => {
    expect(parseOriginAllowlist('https://a.example,,')).toEqual(['https://a.example'])
  })

  it.each([undefined, null, ''])('returns an empty list for %s', (raw) => {
    expect(parseOriginAllowlist(raw)).toEqual([])
  })
})

describe('resolveQuestOrigins', () => {
  it('uses the configured allowlist when set', () => {
    expect(resolveQuestOrigins(['https://a.example', 'https://b.example']))
      .toEqual(['https://a.example', 'https://b.example'])
  })

  it('fails closed to the page origin when the configured list is empty (no cross-origin embedding by default)', () => {
    expect(resolveQuestOrigins([])).toEqual([window.location.origin])
  })
})

describe('isAllowedQuestOrigin', () => {
  it('allows an origin present in the allowlist', () => {
    expect(isAllowedQuestOrigin('https://a.example', ['https://a.example', 'https://b.example'])).toBe(true)
  })

  it('rejects an origin absent from the allowlist', () => {
    expect(isAllowedQuestOrigin('https://evil.example', ['https://a.example'])).toBe(false)
  })

  it('rejects everything against an empty allowlist', () => {
    expect(isAllowedQuestOrigin('https://a.example', [])).toBe(false)
  })

  it('does not perform partial/substring matching', () => {
    expect(isAllowedQuestOrigin('https://a.example.evil.com', ['https://a.example'])).toBe(false)
  })
})

describe('fetchQuestOriginAllowlist', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('resolves to the server-configured allowlist on a successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowedOrigins: ['https://example.com', 'https://cms.example.com'] }),
    } as Response)

    await expect(fetchQuestOriginAllowlist()).resolves.toEqual(['https://example.com', 'https://cms.example.com'])
    expect(global.fetch).toHaveBeenCalledWith('/api/quest-config')
  })

  it('falls back to the page origin when the server has no allowlist configured', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowedOrigins: [] }),
    } as Response)

    await expect(fetchQuestOriginAllowlist()).resolves.toEqual([window.location.origin])
  })

  it('falls back to the page origin on a non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    await expect(fetchQuestOriginAllowlist()).resolves.toEqual([window.location.origin])
  })

  it('falls back to the page origin when the response body has the wrong shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowedOrigins: 'not-an-array' }),
    } as Response)
    await expect(fetchQuestOriginAllowlist()).resolves.toEqual([window.location.origin])
  })

  it('falls back to the page origin when allowedOrigins contains non-string entries', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowedOrigins: ['https://example.com', 42] }),
    } as Response)
    await expect(fetchQuestOriginAllowlist()).resolves.toEqual([window.location.origin])
  })

  it('falls back to the page origin when fetch rejects (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(fetchQuestOriginAllowlist()).resolves.toEqual([window.location.origin])
  })

  it('falls back to the page origin when the response body is not JSON-parseable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('invalid json') },
    } as unknown as Response)
    await expect(fetchQuestOriginAllowlist()).resolves.toEqual([window.location.origin])
  })
})
