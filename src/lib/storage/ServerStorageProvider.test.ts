import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ServerStorageProvider } from './ServerStorageProvider'

interface MockXHRInstance {
  open: ReturnType<typeof vi.fn>
  setRequestHeader: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  status: number
  statusText: string
  upload: { addEventListener: ReturnType<typeof vi.fn> }
  addEventListener: ReturnType<typeof vi.fn>
}

function installMockXHR(status = 200, statusText = 'OK') {
  const instances: MockXHRInstance[] = []
  ;(globalThis as Record<string, unknown>).XMLHttpRequest = function MockXHR(this: MockXHRInstance) {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
    this.open = vi.fn()
    this.setRequestHeader = vi.fn()
    this.send = vi.fn(() => {
      setTimeout(() => {
        this.status = status
        this.statusText = statusText
        for (const h of (listeners['load'] || [])) h()
      }, 0)
    })
    this.status = 0
    this.statusText = ''
    this.upload = {
      addEventListener: vi.fn(),
    }
    this.addEventListener = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
    })
    instances.push(this)
  }
  return instances
}

describe('ServerStorageProvider', () => {
  let origXHR: typeof globalThis.XMLHttpRequest | undefined

  beforeEach(() => {
    vi.restoreAllMocks()
    origXHR = (globalThis as Record<string, unknown>).XMLHttpRequest as typeof globalThis.XMLHttpRequest | undefined
  })

  afterEach(() => {
    if (origXHR !== undefined) {
      (globalThis as Record<string, unknown>).XMLHttpRequest = origXHR
    } else {
      delete (globalThis as Record<string, unknown>).XMLHttpRequest
    }
  })

  it('canSave is true', () => {
    expect(new ServerStorageProvider().canSave).toBe(true)
  })

  describe('loadMap', () => {
    it('fetches OTBM from GET /api/map', async () => {
      const data = new Uint8Array([10, 20, 30])
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="world.otbm"',
        }),
        arrayBuffer: vi.fn().mockResolvedValue(data.buffer),
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

      const provider = new ServerStorageProvider('/api')
      const bundle = await provider.loadMap()

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/map')
      expect(bundle.otbm).toEqual(data)
      expect(bundle.filename).toBe('world.otbm')
      expect(bundle.sidecars.size).toBe(0)
    })

    it('defaults filename to map.otbm when no Content-Disposition', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

      const provider = new ServerStorageProvider()
      const bundle = await provider.loadMap()

      expect(bundle.filename).toBe('map.otbm')
    })

    it('throws on non-OK response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

      const provider = new ServerStorageProvider()
      await expect(provider.loadMap()).rejects.toThrow('Failed to load map: 500')
    })

    it('fetches sidecars when X-Map-Sidecars header present', async () => {
      const otbmData = new Uint8Array([1])
      const sidecarData = new Uint8Array([2, 3])

      const mainResponse = {
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Map-Sidecars': 'spawns.xml',
        }),
        arrayBuffer: vi.fn().mockResolvedValue(otbmData.buffer),
      }
      const sidecarResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(sidecarData.buffer),
      }

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mainResponse as unknown as Response)
        .mockResolvedValueOnce(sidecarResponse as unknown as Response)

      const provider = new ServerStorageProvider('/api')
      const bundle = await provider.loadMap()

      expect(fetchSpy).toHaveBeenCalledWith('/api/map/sidecars/spawns.xml')
      expect(bundle.sidecars.get('spawns.xml')).toEqual(sidecarData)
    })
  })

  describe('saveMap', () => {
    it('POSTs OTBM to /api/map with correct headers', async () => {
      const instances = installMockXHR(200, 'OK')

      const provider = new ServerStorageProvider('/api')
      const otbm = new Uint8Array([1, 2, 3])
      await provider.saveMap({
        otbm,
        sidecars: new Map(),
        filename: 'world.otbm',
      })

      const xhr = instances[0]
      expect(xhr.open).toHaveBeenCalledWith('POST', '/api/map')
      expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream')
      expect(xhr.setRequestHeader).toHaveBeenCalledWith('X-Map-Filename', 'world.otbm')
      expect(xhr.send).toHaveBeenCalled()
    })

    it('throws on non-OK response', async () => {
      installMockXHR(403, 'Forbidden')

      const provider = new ServerStorageProvider()
      await expect(provider.saveMap({
        otbm: new Uint8Array(),
        sidecars: new Map(),
        filename: 'test.otbm',
      })).rejects.toThrow('Failed to save map: 403')
    })
  })

  // The portal serves this app in an iframe under /c/yatme/page/ and rewrites
  // the absolute references it finds in the bundle. Its rewriter only matches
  // the declared prefix "/api/" -- slash included -- so the default base has to
  // ship with that trailing slash to be seen at all, which means every base
  // this class receives may or may not end in one. See portal/pagerewrite.py.
  describe('base URL normalisation', () => {
    it('does not double the slash when the base already ends in one', async () => {
      const data = new Uint8Array([1, 2, 3])
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: vi.fn().mockResolvedValue(data.buffer),
      }) as unknown as typeof globalThis.fetch

      const provider = new ServerStorageProvider('/c/yatme/page/api/')
      await provider.loadMap()

      expect(globalThis.fetch).toHaveBeenCalledWith('/c/yatme/page/api/map')
    })
  })

  // The public copy of the editor is a viewer. One map on one disk is shared by
  // every visitor, so only the copy served straight from the container may
  // write to it -- and "served straight from the container" is exactly the case
  // where the portal has not rewritten the base out from under us.
  describe('canSave', () => {
    it('allows saving when served from the root', () => {
      expect(new ServerStorageProvider().canSave).toBe(true)
      expect(new ServerStorageProvider('/api/').canSave).toBe(true)
      expect(new ServerStorageProvider('/api').canSave).toBe(true)
    })

    it('refuses saving when the portal has mounted it under a prefix', () => {
      expect(new ServerStorageProvider('/c/yatme/page/api/').canSave).toBe(false)
      expect(new ServerStorageProvider('/c/yatme/page/api').canSave).toBe(false)
    })

    it('fails closed on any unexpected mount point', () => {
      expect(new ServerStorageProvider('/editor/api/').canSave).toBe(false)
    })
  })
})
