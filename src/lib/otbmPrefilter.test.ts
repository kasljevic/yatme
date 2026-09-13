import { describe, it, expect } from 'vitest'
import { createEmptyMap, parseOtbm, serializeOtbm, tileKey, type OtbmMap } from './otbm.ts'
import { prefilterOtbmAreas } from './otbmPrefilter.ts'
import type { ClipRegion } from './clipRegion.ts'

/**
 * Builds a real OTBM byte stream via the project's own serializer, so these
 * tests never hand-roll the binary format. Item ids 0xFD/0xFE/0xFF are used
 * deliberately: they force the writer to emit escape bytes, which is exactly
 * what a byte-level scanner can get wrong.
 */
async function serializedMapWith(coords: Array<[number, number, number]>): Promise<Uint8Array> {
  const map: OtbmMap = createEmptyMap()
  map.width = 35143
  map.height = 34812
  for (const [x, y, z] of coords) {
    map.tiles.set(tileKey(x, y, z), {
      x, y, z, flags: 0,
      items: [{ id: 0xFD }, { id: 0xFE }, { id: 0xFF }, { id: 1234 }],
    })
  }
  map.towns = [{ id: 1, name: 'Thais', templeX: 32369, templeY: 32241, templeZ: 7 }]
  return serializeOtbm(map)
}

const THAIS: ClipRegion = { minX: 32256, minY: 32000, maxX: 32511, maxY: 32255 }

describe('prefilterOtbmAreas', () => {
  it('keeps tiles whose area block is inside the region', async () => {
    // Arrange
    const raw = await serializedMapWith([[32300, 32100, 7]])

    // Act
    const parsed = parseOtbm(prefilterOtbmAreas(raw, [THAIS]))

    // Assert
    expect(parsed.tiles.has(tileKey(32300, 32100, 7))).toBe(true)
  })

  it('drops tiles whose area block lies outside every region', async () => {
    // Arrange
    const raw = await serializedMapWith([[32300, 32100, 7], [1500, 1600, 7]])

    // Act
    const parsed = parseOtbm(prefilterOtbmAreas(raw, [THAIS]))

    // Assert
    expect(parsed.tiles.has(tileKey(32300, 32100, 7))).toBe(true)
    expect(parsed.tiles.has(tileKey(1500, 1600, 7))).toBe(false)
  })

  it('shrinks the file when areas are dropped', async () => {
    // Arrange
    const raw = await serializedMapWith([[32300, 32100, 7], [1500, 1600, 7], [9000, 9000, 7]])

    // Act
    const filtered = prefilterOtbmAreas(raw, [THAIS])

    // Assert
    expect(filtered.byteLength).toBeLessThan(raw.byteLength)
  })

  it('preserves escaped item bytes in the areas it keeps', async () => {
    // Arrange — 0xFD/0xFE/0xFF ids round-trip only if escapes are handled.
    const raw = await serializedMapWith([[32300, 32100, 7], [1500, 1600, 7]])

    // Act
    const tile = parseOtbm(prefilterOtbmAreas(raw, [THAIS])).tiles.get(tileKey(32300, 32100, 7))

    // Assert
    expect(tile?.items.map(i => i.id)).toEqual([0xFD, 0xFE, 0xFF, 1234])
  })

  it('preserves map metadata and towns', async () => {
    // Arrange
    const raw = await serializedMapWith([[32300, 32100, 7], [1500, 1600, 7]])

    // Act
    const parsed = parseOtbm(prefilterOtbmAreas(raw, [THAIS]))

    // Assert
    expect(parsed).toMatchObject({ version: 4, width: 35143, height: 34812 })
    expect(parsed.towns.map(t => t.name)).toEqual(['Thais'])
  })

  it('keeps a block that only partially overlaps the region', async () => {
    // Arrange — block base 32256 spans 32256..32511; region ends at 32300.
    const narrow: ClipRegion = { minX: 32000, minY: 32000, maxX: 32300, maxY: 32300 }
    const raw = await serializedMapWith([[32400, 32100, 7]])

    // Act
    const parsed = parseOtbm(prefilterOtbmAreas(raw, [narrow]))

    // Assert — kept at block granularity, exact trimming is clipOtbm's job.
    expect(parsed.tiles.has(tileKey(32400, 32100, 7))).toBe(true)
  })

  it('respects an optional floor range', async () => {
    // Arrange
    const surface: ClipRegion = { ...THAIS, minZ: 6, maxZ: 8 }
    const raw = await serializedMapWith([[32300, 32100, 7], [32300, 32100, 12]])

    // Act
    const parsed = parseOtbm(prefilterOtbmAreas(raw, [surface]))

    // Assert
    expect(parsed.tiles.has(tileKey(32300, 32100, 7))).toBe(true)
    expect(parsed.tiles.has(tileKey(32300, 32100, 12))).toBe(false)
  })

  it('keeps areas matching any of several regions', async () => {
    // Arrange
    const abdendriel: ClipRegion = { minX: 32512, minY: 31488, maxX: 32767, maxY: 31743 }
    const raw = await serializedMapWith([[32300, 32100, 7], [32657, 31583, 7], [1000, 1000, 7]])

    // Act
    const parsed = parseOtbm(prefilterOtbmAreas(raw, [THAIS, abdendriel]))

    // Assert
    expect(parsed.tiles.size).toBe(2)
  })

  it('rejects an empty region list', async () => {
    // Arrange
    const raw = await serializedMapWith([[32300, 32100, 7]])

    // Act / Assert
    expect(() => prefilterOtbmAreas(raw, [])).toThrow(/at least one region/i)
  })

  it('rejects a buffer that is not an OTBM stream', () => {
    // Arrange
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

    // Act / Assert
    expect(() => prefilterOtbmAreas(junk, [THAIS])).toThrow(/otbm/i)
  })
})
