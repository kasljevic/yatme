import { isValidWorldPosition } from './position.ts'

/**
 * postMessage protocol between a parent page (e.g. a quest article) and the
 * YATME quest viewer running in an iframe.
 *
 * Every message carries an exact `version` and a `quest` slug that must
 * match the viewer's own quest; both are checked before anything else, so a
 * stale embed or a message meant for a sibling iframe is dropped rather than
 * partially applied.
 */
export const QUEST_PROTOCOL_VERSION = 1

export const QUEST_ROUTE_POINTS_MAX = 500

/** Max length for the free-form string identifiers/labels below (abuse guard, not a real limit). */
const MAX_ID_LENGTH = 200
const MAX_LABEL_LENGTH = 500

export type QuestOutboundMessageType = 'yatme:ready'
export type QuestInboundMessageType = 'yatme:navigate' | 'yatme:set-route'

export interface QuestReadyMessage {
  type: 'yatme:ready'
  version: number
  quest: string
}

export interface QuestRoutePoint {
  id: string
  stepId: string
  missionId: string
  x: number
  y: number
  z: number
  label?: string
  /** Optional confidence score in [0, 1] for how certain this point's position is. */
  confidence?: number
}

export interface QuestNavigateMessage {
  type: 'yatme:navigate'
  version: number
  quest: string
  stepId: string
  pointId: string
  x: number
  y: number
  z: number
}

export interface QuestSetRouteMessage {
  type: 'yatme:set-route'
  version: number
  quest: string
  points: QuestRoutePoint[]
}

export type QuestInboundMessage = QuestNavigateMessage | QuestSetRouteMessage

/** Build the message the viewer posts to its parent once it has finished loading. */
export function createReadyMessage(quest: string): QuestReadyMessage {
  return { type: 'yatme:ready', version: QUEST_PROTOCOL_VERSION, quest }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A non-empty string under MAX_ID_LENGTH — used for id/stepId/missionId/pointId. */
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

function isValidLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_LABEL_LENGTH
}

function isValidConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isValidRoutePoint(value: unknown): value is QuestRoutePoint {
  if (!isPlainObject(value)) return false
  const { id, stepId, missionId, x, y, z, label, confidence } = value
  if (!isValidId(id) || !isValidId(stepId) || !isValidId(missionId)) return false
  if (!isValidWorldPosition(x, y, z)) return false
  if (label !== undefined && !isValidLabel(label)) return false
  if (confidence !== undefined && !isValidConfidence(confidence)) return false
  return true
}

/**
 * Parse and strictly validate a message received from a parent window.
 *
 * Returns `null` for anything that does not match the expected schema
 * exactly: wrong shape, wrong protocol version, a quest slug that does not
 * match this viewer instance, out-of-bounds coordinates, or a route so long
 * it looks more like abuse than a real quest. Callers are expected to pair
 * this with an origin check (see questOrigin.ts) before calling it — schema
 * validation alone does not establish trust in the sender.
 */
export function parseQuestInboundMessage(data: unknown, expectedQuest: string): QuestInboundMessage | null {
  if (!isPlainObject(data)) return null
  if (data['version'] !== QUEST_PROTOCOL_VERSION) return null
  if (data['quest'] !== expectedQuest) return null

  if (data['type'] === 'yatme:navigate') {
    const { stepId, pointId, x, y, z } = data
    if (!isValidId(stepId) || !isValidId(pointId)) return null
    if (!isValidWorldPosition(x, y, z)) return null
    return {
      type: 'yatme:navigate',
      version: QUEST_PROTOCOL_VERSION,
      quest: expectedQuest,
      stepId,
      pointId,
      x: x as number,
      y: y as number,
      z: z as number,
    }
  }

  if (data['type'] === 'yatme:set-route') {
    const points = data['points']
    if (!Array.isArray(points) || points.length > QUEST_ROUTE_POINTS_MAX) return null
    if (!points.every(isValidRoutePoint)) return null
    return {
      type: 'yatme:set-route',
      version: QUEST_PROTOCOL_VERSION,
      quest: expectedQuest,
      points: points as QuestRoutePoint[],
    }
  }

  return null
}
