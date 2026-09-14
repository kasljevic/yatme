import { describe, it, expect } from 'vitest'
import { isPortalOriginated } from './portalOrigin.ts'

describe('isPortalOriginated', () => {
  it('recognises a request forwarded by the portal', () => {
    expect(isPortalOriginated({ 'x-portal-auth': 'malovski.1757800000.abc' }))
      .toBe(true)
  })

  it('treats a LAN request as local, so home editing keeps working', () => {
    expect(isPortalOriginated({ host: 'localhost:8004' })).toBe(false)
  })

  // An empty header value is what a stripped-but-present header looks like; it
  // carries no claim, so it must not count as portal-originated either way
  // round -- the write routes fail closed on true, so false here is the
  // permissive answer and has to be the deliberate one.
  it('ignores an empty header value', () => {
    expect(isPortalOriginated({ 'x-portal-auth': '' })).toBe(false)
  })

  it('refuses a duplicated header rather than reading only the first', () => {
    expect(isPortalOriginated({ 'x-portal-auth': ['a', 'b'] })).toBe(true)
  })
})
