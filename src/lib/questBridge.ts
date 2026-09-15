import { createReadyMessage, parseQuestInboundMessage, type QuestNavigateMessage, type QuestSetRouteMessage } from './questProtocol.ts'
import { isAllowedQuestOrigin } from './questOrigin.ts'

export interface QuestBridgeHandlers {
  onNavigate?: (message: QuestNavigateMessage) => void
  onSetRoute?: (message: QuestSetRouteMessage) => void
}

export interface QuestBridge {
  /** Announce readiness to the parent window (and opener, if embedded that way). */
  sendReady: () => void
  /** Remove the message listener; call on viewer teardown. */
  destroy: () => void
}

/**
 * Wire up the viewer side of the quest postMessage protocol.
 *
 * `allowedOrigins` is resolved by the caller (see
 * `questOrigin.fetchQuestOriginAllowlist`) rather than read here, so this
 * module has no dependency on how the allowlist was obtained — it just
 * enforces it. Every inbound message is checked against that allowlist
 * *before* it is handed to schema validation — an untrusted origin is
 * dropped silently regardless of how well-formed its payload looks, and a
 * trusted origin with a malformed payload is dropped by
 * parseQuestInboundMessage. Only messages that pass both checks reach the
 * handlers. Outbound `yatme:ready` messages are held to the same allowlist:
 * see `sendReady` below — `postMessage`'s wildcard targetOrigin ('*') is
 * never used.
 */
export function createQuestBridge(quest: string, allowedOrigins: string[], handlers: QuestBridgeHandlers): QuestBridge {
  const onMessage = (event: MessageEvent) => {
    if (!isAllowedQuestOrigin(event.origin, allowedOrigins)) return

    const message = parseQuestInboundMessage(event.data, quest)
    if (!message) return

    if (message.type === 'yatme:navigate') {
      handlers.onNavigate?.(message)
    } else if (message.type === 'yatme:set-route') {
      handlers.onSetRoute?.(message)
    }
  }

  window.addEventListener('message', onMessage)

  return {
    sendReady: () => {
      const message = createReadyMessage(quest)
      // Post to both the parent frame and the opener: the viewer may be
      // embedded either as an iframe or opened as a standalone tab/window.
      //
      // targetOrigin is NEVER '*'. Because the recipient's actual origin is
      // not observable before it replies, we loop over the same allowlist
      // that inbound messages are checked against and post once per
      // allowed origin with that origin as the explicit targetOrigin. The
      // browser only delivers a postMessage to a window whose origin
      // matches targetOrigin exactly, so at most one of these calls (if
      // any) is ever actually received — an unallowlisted parent/opener
      // never gets the ready message, regardless of how many origins are
      // configured.
      for (const origin of allowedOrigins) {
        if (window.parent !== window) {
          window.parent.postMessage(message, origin)
        }
        if (window.opener) {
          window.opener.postMessage(message, origin)
        }
      }
    },
    destroy: () => {
      window.removeEventListener('message', onMessage)
    },
  }
}
