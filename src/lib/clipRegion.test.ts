import { describe, it, expect } from 'vitest'
import { containsPoint, inAnyRegion, blockOverlaps, anyBlockOverlaps, type ClipRegion } from './clipRegion.ts'

const THAIS: ClipRegion = { minX: 32256, minY: 32000, maxX: 32511, maxY: 32255 }

describe('containsPoint', () => {
  it('accepts a point inside the region', () => {
    expect(containsPoint(THAIS, 32369, 32241, 7)).toBe(true)
  })

  it('accepts points exactly on the boundary', () => {
    expect(containsPoint(THAIS, 32256, 32000, 7)).toBe(true)
    expect(containsPoint(THAIS, 32511, 32255, 7)).toBe(true)
  })

  it('rejects a point outside the region', () => {
    expect(containsPoint(THAIS, 32512, 32241, 7)).toBe(false)
    expect(containsPoint(THAIS, 32369, 31999, 7)).toBe(false)
  })

  it('ignores the floor when no floor range is set', () => {
    expect(containsPoint(THAIS, 32369, 32241, 0)).toBe(true)
    expect(containsPoint(THAIS, 32369, 32241, 15)).toBe(true)
  })

  it('honours an inclusive floor range', () => {
    // Arrange — lower Z is higher elevation, so 6..8 is "around ground level".
    const surface: ClipRegion = { ...THAIS, minZ: 6, maxZ: 8 }

    // Act / Assert
    expect(containsPoint(surface, 32369, 32241, 6)).toBe(true)
    expect(containsPoint(surface, 32369, 32241, 8)).toBe(true)
    expect(containsPoint(surface, 32369, 32241, 5)).toBe(false)
    expect(containsPoint(surface, 32369, 32241, 9)).toBe(false)
  })
})

describe('inAnyRegion', () => {
  it('accepts a point in the second of two regions', () => {
    const abdendriel: ClipRegion = { minX: 32512, minY: 31488, maxX: 32767, maxY: 31743 }
    expect(inAnyRegion([THAIS, abdendriel], 32657, 31583, 7)).toBe(true)
  })

  it('rejects a point in none of the regions', () => {
    expect(inAnyRegion([THAIS], 1000, 1000, 7)).toBe(false)
  })

  it('rejects everything when given no regions', () => {
    expect(inAnyRegion([], 32369, 32241, 7)).toBe(false)
  })
})

describe('blockOverlaps', () => {
  it('accepts a block wholly inside the region', () => {
    expect(blockOverlaps(THAIS, 32256, 32000, 7, 256)).toBe(true)
  })

  it('accepts a block that only partially overlaps the region', () => {
    // Arrange — region ends at 32300, block spans 32256..32511.
    const narrow: ClipRegion = { minX: 32000, minY: 32000, maxX: 32300, maxY: 32300 }

    // Act / Assert
    expect(blockOverlaps(narrow, 32256, 32256, 7, 256)).toBe(true)
  })

  it('rejects a block that ends just before the region starts', () => {
    expect(blockOverlaps(THAIS, 32000, 32000, 7, 256)).toBe(false)
  })

  it('rejects a block on an excluded floor', () => {
    const surface: ClipRegion = { ...THAIS, minZ: 6, maxZ: 8 }
    expect(blockOverlaps(surface, 32256, 32000, 12, 256)).toBe(false)
  })

  it('accepts via any region', () => {
    const abdendriel: ClipRegion = { minX: 32512, minY: 31488, maxX: 32767, maxY: 31743 }
    expect(anyBlockOverlaps([THAIS, abdendriel], 32512, 31488, 7, 256)).toBe(true)
    expect(anyBlockOverlaps([THAIS, abdendriel], 1024, 1024, 7, 256)).toBe(false)
  })
})
