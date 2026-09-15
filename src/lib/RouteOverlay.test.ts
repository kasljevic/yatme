import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock pixi.js, following the pattern established in GridOverlay.test.ts.
vi.mock('pixi.js', () => {
  class MockGraphics {
    clear = vi.fn().mockReturnThis()
    moveTo = vi.fn().mockReturnThis()
    lineTo = vi.fn().mockReturnThis()
    stroke = vi.fn().mockReturnThis()
    circle = vi.fn().mockReturnThis()
    fill = vi.fn().mockReturnThis()
    destroy = vi.fn()
  }
  class MockContainer {
    children: unknown[] = []
    visible = true
    position = { set: vi.fn() }
    addChild = vi.fn((child: unknown) => { this.children.push(child); return child })
    removeChildren = vi.fn(() => {
      const removed = this.children
      this.children = []
      return removed
    })
    destroy = vi.fn()
  }
  class MockText {
    text: string
    anchor = { set: vi.fn() }
    scale = { set: vi.fn() }
    position = { set: vi.fn() }
    destroy = vi.fn()
    constructor(opts: { text: string }) { this.text = opts.text }
  }
  return { Container: MockContainer, Graphics: MockGraphics, Text: MockText }
})

import { RouteOverlay } from './RouteOverlay.ts'
import type { QuestRoutePoint } from './questProtocol.ts'

// Typed accessors into RouteOverlay's private mocked members, so tests avoid
// `any` while still reaching into the pixi.js mocks configured above.
interface MockGraphicsInternal {
  clear: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  circle: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}
interface MockContainerInternal {
  children: unknown[]
  destroy: ReturnType<typeof vi.fn>
}
interface RouteOverlayInternals {
  _graphics: MockGraphicsInternal
  _labelContainer: MockContainerInternal
}
function internals(overlay: RouteOverlay): RouteOverlayInternals {
  return overlay as unknown as RouteOverlayInternals
}

function makeCamera(zoom = 1) {
  return { zoom } as unknown as import('./Camera').Camera
}

function makePoint(overrides: Partial<QuestRoutePoint> = {}): QuestRoutePoint {
  return { id: 'pt-0', stepId: 'step-0', missionId: 'mission-0', x: 100, y: 100, z: 7, ...overrides }
}

describe('RouteOverlay', () => {
  let overlay: RouteOverlay

  beforeEach(() => {
    overlay = new RouteOverlay()
  })

  it('starts invisible', () => {
    expect(overlay.container.visible).toBe(false)
    expect(overlay.visible).toBe(false)
  })

  it('does not draw when invisible, even with points set', () => {
    overlay.setPoints([makePoint()])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    expect(g.circle).not.toHaveBeenCalled()
  })

  it('draws a point on the matching floor once visible', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint({ z: 7 })])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    expect(g.circle).toHaveBeenCalledTimes(1)
    expect(g.fill).toHaveBeenCalled()
  })

  it('does not draw a point belonging to a different floor', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint({ z: 8 })])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    expect(g.circle).not.toHaveBeenCalled()
  })

  it('draws a connector between two consecutive same-floor points', () => {
    overlay.setVisible(true)
    overlay.setPoints([
      makePoint({ id: 'pt-1', x: 100, y: 100 }),
      makePoint({ id: 'pt-2', x: 101, y: 100 }),
    ])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    expect(g.moveTo).toHaveBeenCalledTimes(1)
    expect(g.lineTo).toHaveBeenCalledTimes(1)
  })

  it('preserves array order (no implicit sorting) when drawing connectors', () => {
    overlay.setVisible(true)
    // Deliberately supplied out of x-coordinate order — the overlay must
    // connect them in the order given, not by any coordinate heuristic.
    overlay.setPoints([
      makePoint({ id: 'pt-1', x: 105 }),
      makePoint({ id: 'pt-2', x: 100 }),
    ])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    expect(g.moveTo).toHaveBeenCalledWith(105 * 32 + 16, 100 * 32 + 16)
    expect(g.lineTo).toHaveBeenCalledWith(100 * 32 + 16, 100 * 32 + 16)
  })

  it('does not draw a connector across a point on a different floor that was skipped', () => {
    overlay.setVisible(true)
    overlay.setPoints([
      makePoint({ id: 'pt-1', z: 7 }),
      makePoint({ id: 'pt-2', z: 8 }), // filtered out for floor 7, breaking adjacency
      makePoint({ id: 'pt-3', z: 7 }),
    ])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    expect(g.moveTo).not.toHaveBeenCalled()
  })

  it('does not draw a connector between two consecutive points on different floors', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint({ id: 'pt-1', z: 7 }), makePoint({ id: 'pt-2', z: 8 })])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    expect(g.moveTo).not.toHaveBeenCalled()
  })

  it('creates a label for each point on the current floor', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint({ id: 'pt-1' }), makePoint({ id: 'pt-2', x: 105 })])
    overlay.rebuild(7, makeCamera())
    expect(internals(overlay)._labelContainer.children.length).toBe(2)
  })

  it('falls back to stepId for the label text when no label is provided', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint({ id: 'pt-1', stepId: 'find-the-key' })])
    overlay.rebuild(7, makeCamera())
    const label = internals(overlay)._labelContainer.children[0] as { text: string }
    expect(label.text).toBe('find-the-key')
  })

  it('uses the provided label text over stepId when both are present', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint({ id: 'pt-1', stepId: 'find-the-key', label: 'Find the key' })])
    overlay.rebuild(7, makeCamera())
    const label = internals(overlay)._labelContainer.children[0] as { text: string }
    expect(label.text).toBe('Find the key')
  })

  it('skips redraw when nothing relevant changed (dirty key)', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint()])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    const clearCount = g.clear.mock.calls.length

    overlay.rebuild(7, makeCamera())
    expect(g.clear.mock.calls.length).toBe(clearCount)
  })

  it('redraws when the active point changes', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint({ id: 'pt-1' }), makePoint({ id: 'pt-2' })])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    const clearCount = g.clear.mock.calls.length

    overlay.setActivePoint('pt-2')
    overlay.rebuild(7, makeCamera())
    expect(g.clear.mock.calls.length).toBeGreaterThan(clearCount)
  })

  it('setActivePoint is a no-op (no re-render) when the id does not change', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint({ id: 'pt-1' })])
    overlay.setActivePoint('pt-1')
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    const clearCount = g.clear.mock.calls.length

    overlay.setActivePoint('pt-1')
    overlay.rebuild(7, makeCamera())
    expect(g.clear.mock.calls.length).toBe(clearCount)
  })

  it('redraws when markDirty is called explicitly', () => {
    overlay.setVisible(true)
    overlay.setPoints([makePoint()])
    overlay.rebuild(7, makeCamera())
    const g = internals(overlay)._graphics
    const clearCount = g.clear.mock.calls.length

    overlay.markDirty()
    overlay.rebuild(7, makeCamera())
    expect(g.clear.mock.calls.length).toBeGreaterThan(clearCount)
  })

  it('applies floor offset via the container position', () => {
    overlay.updateContainerOffset(64)
    expect(overlay.container.position.set).toHaveBeenCalledWith(-64, -64)
  })

  it('destroy cleans up graphics, label container, and root container', () => {
    overlay.destroy()
    expect(internals(overlay)._graphics.destroy).toHaveBeenCalled()
    expect(internals(overlay)._labelContainer.destroy).toHaveBeenCalled()
    expect(overlay.container.destroy).toHaveBeenCalled()
  })
})
