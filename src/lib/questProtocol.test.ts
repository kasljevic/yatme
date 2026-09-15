import { describe, it, expect } from 'vitest'
import {
  QUEST_PROTOCOL_VERSION,
  QUEST_ROUTE_POINTS_MAX,
  createReadyMessage,
  parseQuestInboundMessage,
} from './questProtocol.ts'

describe('createReadyMessage', () => {
  it('builds a ready message with the current protocol version and quest slug', () => {
    expect(createReadyMessage('thais-quest')).toEqual({
      type: 'yatme:ready',
      version: QUEST_PROTOCOL_VERSION,
      quest: 'thais-quest',
    })
  })
})

describe('parseQuestInboundMessage — yatme:navigate', () => {
  const base = { type: 'yatme:navigate', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest' }

  it('accepts a well-formed navigate message', () => {
    const msg = parseQuestInboundMessage(
      { ...base, stepId: 'step-1', pointId: 'point-1', x: 100, y: 200, z: 7 },
      'thais-quest',
    )
    expect(msg).toEqual({
      type: 'yatme:navigate',
      version: QUEST_PROTOCOL_VERSION,
      quest: 'thais-quest',
      stepId: 'step-1',
      pointId: 'point-1',
      x: 100,
      y: 200,
      z: 7,
    })
  })

  it.each([
    ['missing stepId', { pointId: 'point-1' }],
    ['missing pointId', { stepId: 'step-1' }],
    ['empty stepId', { stepId: '', pointId: 'point-1' }],
    ['empty pointId', { stepId: 'step-1', pointId: '' }],
    ['non-string stepId', { stepId: 42, pointId: 'point-1' }],
    ['non-string pointId', { stepId: 'step-1', pointId: 42 }],
    ['overlong stepId', { stepId: 'x'.repeat(201), pointId: 'point-1' }],
  ])('rejects a navigate message with %s', (_label, idFields) => {
    expect(parseQuestInboundMessage({ ...base, ...idFields, x: 0, y: 0, z: 0 }, 'thais-quest')).toBeNull()
  })

  it.each([
    ['x below bounds', { x: -1, y: 0, z: 0 }],
    ['x above bounds', { x: 65536, y: 0, z: 0 }],
    ['y above bounds', { x: 0, y: 65536, z: 0 }],
    ['z above bounds', { x: 0, y: 0, z: 16 }],
    ['non-integer x', { x: 1.5, y: 0, z: 0 }],
    ['non-numeric x', { x: '1', y: 0, z: 0 }],
  ])('rejects out-of-bounds coordinates: %s', (_label, coords) => {
    expect(parseQuestInboundMessage({ ...base, stepId: 'step-1', pointId: 'point-1', ...coords }, 'thais-quest')).toBeNull()
  })

  it('rejects a mismatched protocol version', () => {
    const msg = { ...base, version: QUEST_PROTOCOL_VERSION + 1, stepId: 'step-1', pointId: 'point-1', x: 0, y: 0, z: 0 }
    expect(parseQuestInboundMessage(msg, 'thais-quest')).toBeNull()
  })

  it('rejects a quest slug that does not match the expected viewer', () => {
    const msg = { ...base, quest: 'other-quest', stepId: 'step-1', pointId: 'point-1', x: 0, y: 0, z: 0 }
    expect(parseQuestInboundMessage(msg, 'thais-quest')).toBeNull()
  })

  it.each([null, undefined, 'a string', 42, [], true])('rejects a non-plain-object payload: %s', (data) => {
    expect(parseQuestInboundMessage(data, 'thais-quest')).toBeNull()
  })

  it('rejects an unknown message type', () => {
    const msg = { ...base, type: 'yatme:explode', stepId: 'step-1', pointId: 'point-1', x: 0, y: 0, z: 0 }
    expect(parseQuestInboundMessage(msg, 'thais-quest')).toBeNull()
  })

  it('rejects the legacy quest:navigate type from the previous protocol', () => {
    const msg = { ...base, type: 'quest:navigate', stepId: 'step-1', pointId: 'point-1', x: 0, y: 0, z: 0 }
    expect(parseQuestInboundMessage(msg, 'thais-quest')).toBeNull()
  })
})

describe('parseQuestInboundMessage — yatme:set-route', () => {
  const base = { type: 'yatme:set-route', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest' }

  function point(overrides: Partial<Record<string, unknown>> = {}) {
    return { id: 'pt-1', stepId: 'step-1', missionId: 'mission-1', x: 100, y: 100, z: 7, ...overrides }
  }

  it('accepts an empty route', () => {
    const msg = parseQuestInboundMessage({ ...base, points: [] }, 'thais-quest')
    expect(msg).toEqual({ type: 'yatme:set-route', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest', points: [] })
  })

  it('accepts a well-formed route with labels and confidence', () => {
    const points = [point({ label: 'Start', confidence: 0.9 }), point({ id: 'pt-2', x: 101 })]
    const msg = parseQuestInboundMessage({ ...base, points }, 'thais-quest')
    expect(msg).toEqual({ type: 'yatme:set-route', version: QUEST_PROTOCOL_VERSION, quest: 'thais-quest', points })
  })

  it.each([
    ['missing id', point({ id: undefined })],
    ['missing stepId', point({ stepId: undefined })],
    ['missing missionId', point({ missionId: undefined })],
    ['empty id', point({ id: '' })],
    ['non-string id', point({ id: 42 })],
  ])('rejects a route point with %s', (_label, badPoint) => {
    expect(parseQuestInboundMessage({ ...base, points: [badPoint] }, 'thais-quest')).toBeNull()
  })

  it('rejects a route point with out-of-bounds coordinates', () => {
    const points = [point({ x: -1 })]
    expect(parseQuestInboundMessage({ ...base, points }, 'thais-quest')).toBeNull()
  })

  it('rejects a route point with a non-string label', () => {
    const points = [point({ label: 42 })]
    expect(parseQuestInboundMessage({ ...base, points }, 'thais-quest')).toBeNull()
  })

  it.each([
    ['negative confidence', -0.1],
    ['confidence above 1', 1.1],
    ['non-numeric confidence', 'high'],
    ['NaN confidence', NaN],
  ])('rejects a route point with an invalid confidence: %s', (_label, confidence) => {
    const points = [point({ confidence })]
    expect(parseQuestInboundMessage({ ...base, points }, 'thais-quest')).toBeNull()
  })

  it('accepts confidence at the 0 and 1 boundaries', () => {
    expect(parseQuestInboundMessage({ ...base, points: [point({ confidence: 0 })] }, 'thais-quest')).not.toBeNull()
    expect(parseQuestInboundMessage({ ...base, points: [point({ confidence: 1 })] }, 'thais-quest')).not.toBeNull()
  })

  it('rejects when points is not an array', () => {
    expect(parseQuestInboundMessage({ ...base, points: 'nope' }, 'thais-quest')).toBeNull()
  })

  it(`rejects a route with more than ${QUEST_ROUTE_POINTS_MAX} points`, () => {
    const points = Array.from({ length: QUEST_ROUTE_POINTS_MAX + 1 }, (_, i) => point({ id: `pt-${i}` }))
    expect(parseQuestInboundMessage({ ...base, points }, 'thais-quest')).toBeNull()
  })

  it(`accepts a route with exactly ${QUEST_ROUTE_POINTS_MAX} points`, () => {
    const points = Array.from({ length: QUEST_ROUTE_POINTS_MAX }, (_, i) => point({ id: `pt-${i}` }))
    expect(parseQuestInboundMessage({ ...base, points }, 'thais-quest')).not.toBeNull()
  })

  it('rejects the legacy quest:setRoute type from the previous protocol', () => {
    const msg = { ...base, type: 'quest:setRoute', points: [] }
    expect(parseQuestInboundMessage(msg, 'thais-quest')).toBeNull()
  })
})
