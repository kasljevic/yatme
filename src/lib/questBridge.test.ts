// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createQuestBridge } from './questBridge.ts'
import { QUEST_PROTOCOL_VERSION, type QuestNavigateMessage, type QuestSetRouteMessage } from './questProtocol.ts'

const SAME_ORIGIN = window.location.origin

function dispatchMessage(data: unknown, origin: string) {
  window.dispatchEvent(new MessageEvent('message', { data, origin }))
}

// jsdom does not define `window.opener` as an accessor property by default
// (it's simply absent), so `vi.spyOn(window, 'opener', 'get')` cannot be
// used to stub it the way it can for `window.parent`. Define it directly
// instead, and always restore it to `undefined` afterward.
function stubOpener(value: unknown): () => void {
  Object.defineProperty(window, 'opener', { value, configurable: true, writable: true })
  return () => {
    Object.defineProperty(window, 'opener', { value: undefined, configurable: true, writable: true })
  }
}

describe('createQuestBridge', () => {
  let bridge: ReturnType<typeof createQuestBridge>
  let onNavigate: (message: QuestNavigateMessage) => void
  let onSetRoute: (message: QuestSetRouteMessage) => void

  beforeEach(() => {
    onNavigate = vi.fn<(message: QuestNavigateMessage) => void>()
    onSetRoute = vi.fn<(message: QuestSetRouteMessage) => void>()
    bridge = createQuestBridge('thais-quest', [SAME_ORIGIN], { onNavigate, onSetRoute })
  })

  afterEach(() => {
    bridge.destroy()
  })

  it('invokes onNavigate for a well-formed, allowed-origin navigate message', () => {
    dispatchMessage(
      {
        type: 'yatme:navigate',
        version: QUEST_PROTOCOL_VERSION,
        quest: 'thais-quest',
        stepId: 'step-1',
        pointId: 'point-1',
        x: 100,
        y: 100,
        z: 7,
      },
      SAME_ORIGIN,
    )
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onSetRoute).not.toHaveBeenCalled()
  })

  it('invokes onSetRoute for a well-formed, allowed-origin set-route message', () => {
    dispatchMessage(
      { type: 'yatme:set-route', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest', points: [] },
      SAME_ORIGIN,
    )
    expect(onSetRoute).toHaveBeenCalledTimes(1)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('trusts an explicitly configured cross-origin sender that is in the allowlist', () => {
    const crossOriginBridge = createQuestBridge('thais-quest', ['https://embed.example'], { onNavigate, onSetRoute })
    dispatchMessage(
      { type: 'yatme:set-route', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest', points: [] },
      'https://embed.example',
    )
    expect(onSetRoute).toHaveBeenCalledTimes(1)
    crossOriginBridge.destroy()
  })

  it('drops a message from a disallowed origin, even if perfectly well-formed', () => {
    dispatchMessage(
      {
        type: 'yatme:navigate',
        version: QUEST_PROTOCOL_VERSION,
        quest: 'thais-quest',
        stepId: 'step-1',
        pointId: 'point-1',
        x: 100,
        y: 100,
        z: 7,
      },
      'https://evil.example',
    )
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('drops an allowed-origin message that fails schema validation', () => {
    dispatchMessage({ type: 'yatme:navigate', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest' }, SAME_ORIGIN)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('drops an allowed-origin message for a different quest slug', () => {
    dispatchMessage(
      {
        type: 'yatme:navigate',
        version: QUEST_PROTOCOL_VERSION,
        quest: 'other-quest',
        stepId: 'step-1',
        pointId: 'point-1',
        x: 100,
        y: 100,
        z: 7,
      },
      SAME_ORIGIN,
    )
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('stops delivering messages after destroy()', () => {
    bridge.destroy()
    dispatchMessage(
      {
        type: 'yatme:navigate',
        version: QUEST_PROTOCOL_VERSION,
        quest: 'thais-quest',
        stepId: 'step-1',
        pointId: 'point-1',
        x: 100,
        y: 100,
        z: 7,
      },
      SAME_ORIGIN,
    )
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('sendReady posts a yatme:ready message to window.parent, targeted at the allowed origin (never "*")', () => {
    const postMessage = vi.fn()
    const fakeParent = { postMessage } as unknown as Window
    const parentSpy = vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent)

    bridge.sendReady()

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'yatme:ready', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest' },
      SAME_ORIGIN,
    )
    expect(postMessage).not.toHaveBeenCalledWith(expect.anything(), '*')
    parentSpy.mockRestore()
  })

  it('sendReady posts once per configured origin to both parent and opener, using each origin as targetOrigin', () => {
    const multiOriginBridge = createQuestBridge(
      'thais-quest',
      ['https://a.example', 'https://b.example'],
      { onNavigate, onSetRoute },
    )

    const parentPostMessage = vi.fn()
    const openerPostMessage = vi.fn()
    const parentSpy = vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: parentPostMessage } as unknown as Window)
    const restoreOpener = stubOpener({ postMessage: openerPostMessage })

    multiOriginBridge.sendReady()

    const message = { type: 'yatme:ready', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest' }
    expect(parentPostMessage).toHaveBeenCalledTimes(2)
    expect(parentPostMessage).toHaveBeenNthCalledWith(1, message, 'https://a.example')
    expect(parentPostMessage).toHaveBeenNthCalledWith(2, message, 'https://b.example')
    expect(openerPostMessage).toHaveBeenCalledTimes(2)
    expect(openerPostMessage).toHaveBeenNthCalledWith(1, message, 'https://a.example')
    expect(openerPostMessage).toHaveBeenNthCalledWith(2, message, 'https://b.example')

    parentSpy.mockRestore()
    restoreOpener()
    multiOriginBridge.destroy()
  })

  it('never uses the wildcard targetOrigin ("*") on any sendReady call, regardless of allowlist size', () => {
    const manyOriginsBridge = createQuestBridge(
      'thais-quest',
      ['https://a.example', 'https://b.example', 'https://c.example'],
      { onNavigate, onSetRoute },
    )
    const parentPostMessage = vi.fn()
    const openerPostMessage = vi.fn()
    const parentSpy = vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: parentPostMessage } as unknown as Window)
    const restoreOpener = stubOpener({ postMessage: openerPostMessage })

    manyOriginsBridge.sendReady()

    for (const call of [...parentPostMessage.mock.calls, ...openerPostMessage.mock.calls]) {
      expect(call[1]).not.toBe('*')
    }

    parentSpy.mockRestore()
    restoreOpener()
    manyOriginsBridge.destroy()
  })

  it('never sends the ready message to an unallowlisted parent origin', () => {
    // Because targetOrigin restricts delivery to a window whose origin
    // matches exactly, and the bridge only ever calls postMessage with
    // origins drawn from its own allowlist, a parent at an origin outside
    // that allowlist can never receive the message — simulated here by
    // asserting the disallowed origin never appears as a targetOrigin arg.
    const restrictedBridge = createQuestBridge('thais-quest', ['https://a.example'], { onNavigate, onSetRoute })
    const postMessage = vi.fn()
    const parentSpy = vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage } as unknown as Window)

    restrictedBridge.sendReady()

    expect(postMessage).not.toHaveBeenCalledWith(expect.anything(), 'https://evil.example')
    expect(postMessage).not.toHaveBeenCalledWith(expect.anything(), '*')
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(expect.anything(), 'https://a.example')

    parentSpy.mockRestore()
    restrictedBridge.destroy()
  })

  it('sends nothing when the resolved allowlist is empty (no safe target origin known)', () => {
    const noOriginBridge = createQuestBridge('thais-quest', [], { onNavigate, onSetRoute })
    const parentPostMessage = vi.fn()
    const openerPostMessage = vi.fn()
    const parentSpy = vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: parentPostMessage } as unknown as Window)
    const restoreOpener = stubOpener({ postMessage: openerPostMessage })

    noOriginBridge.sendReady()

    expect(parentPostMessage).not.toHaveBeenCalled()
    expect(openerPostMessage).not.toHaveBeenCalled()

    parentSpy.mockRestore()
    restoreOpener()
    noOriginBridge.destroy()
  })
})

