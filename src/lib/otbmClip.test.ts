import { describe, it, expect } from 'vitest'
import { createEmptyMap, tileKey, type OtbmMap, type OtbmTile } from './otbm.ts'
import { clipOtbm, type ClipRegion } from './otbmClip.ts'

function tile(x: number, y: number, z: number): OtbmTile {
  return { x, y, z, flags: 0, items: [{ id: 100 }] }
}

/** Map with one tile per given coordinate, plus an area sequence covering them. */
function mapWith(coords: Array<[number, number, number]>): OtbmMap {
  const map = createEmptyMap()
  map.width = 35143
  map.height = 34812
  map.houseFile = 'otservbr-house.xml'
  for (const [x, y, z] of coords) map.tiles.set(tileKey(x, y, z), tile(x, y, z))
  map._areaSequence = [
    { baseX: 32256, baseY: 32000, baseZ: 7, tileKeys: coords.map(([x, y, z]) => tileKey(x, y, z)) },
  ]
  return map
}

const THAIS: ClipRegion = { minX: 32256, minY: 32000, maxX: 32511, maxY: 32255 }

describe('clipOtbm', () => {
  it('keeps tiles inside the region and drops tiles outside it', () => {
    // Arrange
    const map = mapWith([[32300, 32100, 7], [1500, 1600, 7]])

    // Act
    const clipped = clipOtbm(map, [THAIS])

    // Assert
    expect(clipped.tiles.has(tileKey(32300, 32100, 7))).toBe(true)
    expect(clipped.tiles.has(tileKey(1500, 1600, 7))).toBe(false)
    expect(clipped.tiles.size).toBe(1)
  })

  it('preserves absolute coordinates rather than re-origining the region', () => {
    // Arrange — the whole point: the houses join is a coordinate primary key.
    const map = mapWith([[32300, 32100, 7]])

    // Act
    const kept = clipOtbm(map, [THAIS]).tiles.get(tileKey(32300, 32100, 7))

    // Assert
    expect(kept).toMatchObject({ x: 32300, y: 32100, z: 7 })
  })

  it('keeps tiles from any of several disjoint regions', () => {
    // Arrange
    const abdendriel: ClipRegion = { minX: 32512, minY: 31488, maxX: 32767, maxY: 31743 }
    const map = mapWith([[32300, 32100, 7], [32657, 31583, 7], [1000, 1000, 7]])

    // Act
    const clipped = clipOtbm(map, [THAIS, abdendriel])

    // Assert
    expect(clipped.tiles.size).toBe(2)
    expect(clipped.tiles.has(tileKey(32657, 31583, 7))).toBe(true)
  })

  it('honours an optional floor range', () => {
    // Arrange — lower Z is higher elevation; z=7 is ground.
    const surfaceOnly: ClipRegion = { ...THAIS, minZ: 6, maxZ: 8 }
    const map = mapWith([[32300, 32100, 7], [32300, 32100, 12]])

    // Act
    const clipped = clipOtbm(map, [surfaceOnly])

    // Assert
    expect(clipped.tiles.has(tileKey(32300, 32100, 7))).toBe(true)
    expect(clipped.tiles.has(tileKey(32300, 32100, 12))).toBe(false)
  })

  it('includes tiles exactly on the region boundary', () => {
    // Arrange
    const map = mapWith([[32256, 32000, 7], [32511, 32255, 7], [32512, 32000, 7]])

    // Act
    const clipped = clipOtbm(map, [THAIS])

    // Assert
    expect(clipped.tiles.size).toBe(2)
    expect(clipped.tiles.has(tileKey(32512, 32000, 7))).toBe(false)
  })

  it('carries over map metadata and sidecar filenames unchanged', () => {
    // Arrange
    const map = mapWith([[32300, 32100, 7]])

    // Act
    const clipped = clipOtbm(map, [THAIS])

    // Assert
    expect(clipped).toMatchObject({
      version: map.version,
      width: map.width,
      height: map.height,
      houseFile: 'otservbr-house.xml',
    })
  })

  it('keeps only towns whose temple falls inside a region', () => {
    // Arrange
    const map = mapWith([[32300, 32100, 7]])
    map.towns = [
      { id: 1, name: 'Thais', templeX: 32369, templeY: 32241, templeZ: 7 },
      { id: 2, name: 'Carlin', templeX: 32360, templeY: 31782, templeZ: 6 },
    ]

    // Act
    const clipped = clipOtbm(map, [THAIS])

    // Assert
    expect(clipped.towns.map(t => t.name)).toEqual(['Thais'])
  })

  it('keeps only waypoints inside a region', () => {
    // Arrange
    const map = mapWith([[32300, 32100, 7]])
    map.waypoints = [
      { name: 'inside', x: 32300, y: 32100, z: 7 },
      { name: 'outside', x: 100, y: 100, z: 7 },
    ]

    // Act
    const clipped = clipOtbm(map, [THAIS])

    // Assert
    expect(clipped.waypoints.map(w => w.name)).toEqual(['inside'])
  })

  it('prunes dropped tiles from the area sequence and discards emptied areas', () => {
    // Arrange
    const map = mapWith([[32300, 32100, 7], [1500, 1600, 7]])
    map._areaSequence!.push({ baseX: 1280, baseY: 1536, baseZ: 7, tileKeys: [tileKey(1500, 1600, 7)] })

    // Act
    const seq = clipOtbm(map, [THAIS])._areaSequence!

    // Assert
    expect(seq).toHaveLength(1)
    expect(seq[0]!.tileKeys).toEqual([tileKey(32300, 32100, 7)])
  })

  it('does not mutate the source map', () => {
    // Arrange
    const map = mapWith([[32300, 32100, 7], [1500, 1600, 7]])

    // Act
    clipOtbm(map, [THAIS])

    // Assert
    expect(map.tiles.size).toBe(2)
  })

  it('rejects an empty region list rather than silently producing an empty map', () => {
    // Arrange
    const map = mapWith([[32300, 32100, 7]])

    // Act / Assert
    expect(() => clipOtbm(map, [])).toThrow(/at least one region/i)
  })
})
