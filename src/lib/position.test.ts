import { describe, it, expect } from 'vitest'
import { parseHouseIdSearch, parsePositionSearch, parsePositionString } from './position'

describe('parsePositionString', () => {
  it('parses {x=123, y=456, z=7} format', () => {
    expect(parsePositionString('{x=123, y=456, z=7}')).toEqual({ x: '123', y: '456', z: '7' })
  })

  it('parses {x: 123, y: 456, z: 7} format', () => {
    expect(parsePositionString('{x: 123, y: 456, z: 7}')).toEqual({ x: '123', y: '456', z: '7' })
  })

  it('parses JSON {"x": 123} format', () => {
    expect(parsePositionString('{"x": 10, "y": 20, "z": 3}')).toEqual({ x: '10', y: '20', z: '3' })
  })

  it('parses CSV format', () => {
    expect(parsePositionString('100, 200, 7')).toEqual({ x: '100', y: '200', z: '7' })
  })

  it('trims whitespace', () => {
    expect(parsePositionString('  123,456,7  ')).toEqual({ x: '123', y: '456', z: '7' })
  })

  it('returns null for empty string', () => {
    expect(parsePositionString('')).toBeNull()
  })

  it('returns null for gibberish', () => {
    expect(parsePositionString('hello world')).toBeNull()
  })

  it('returns null for partial input', () => {
    expect(parsePositionString('x=123')).toBeNull()
  })
})

describe('parsePositionSearch', () => {
  it('reads a valid map deep link', () => {
    expect(parsePositionSearch('?x=32178&y=32373&z=7&house=12010')).toEqual({
      x: 32178,
      y: 32373,
      z: 7,
    })
  })

  describe('parseHouseIdSearch', () => {
    it('reads an optional positive house id', () => {
      expect(parseHouseIdSearch('?x=32178&house=12010')).toBe(12010)
    })

    it.each(['', '?house=0', '?house=-1', '?house=12.5', '?house=nope'])(
      'rejects an invalid house id: %s',
      (search) => {
        expect(parseHouseIdSearch(search)).toBeNull()
      },
    )
  })

  it.each([
    '?x=32178&y=32373',
    '?x=32178.5&y=32373&z=7',
    '?x=-1&y=32373&z=7',
    '?x=32178&y=32373&z=16',
  ])('rejects an invalid map deep link: %s', (search) => {
    expect(parsePositionSearch(search)).toBeNull()
  })
})
