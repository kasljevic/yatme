import type { OtbmMap } from './otbm.ts'

/**
 * An inclusive rectangular region of the map, optionally limited to a range of
 * floors. Coordinates are absolute map coordinates, never region-relative.
 */
export interface ClipRegion {
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** Lowest floor index to keep. Omit for all floors. Remember: lower Z = higher elevation. */
  minZ?: number
  /** Highest floor index to keep. Omit for all floors. */
  maxZ?: number
}

function containsPoint(region: ClipRegion, x: number, y: number, z: number): boolean {
  if (x < region.minX || x > region.maxX) return false
  if (y < region.minY || y > region.maxY) return false
  if (region.minZ !== undefined && z < region.minZ) return false
  if (region.maxZ !== undefined && z > region.maxZ) return false
  return true
}

function inAnyRegion(regions: ClipRegion[], x: number, y: number, z: number): boolean {
  return regions.some(r => containsPoint(r, x, y, z))
}

/**
 * Returns a copy of `map` containing only the tiles, towns and waypoints that
 * fall inside one of `regions`.
 *
 * Absolute coordinates are preserved deliberately — the point of clipping is to
 * shrink a world-sized map to something a browser can hold while keeping tile
 * coordinates joinable against external data (house registries, wiki positions).
 * Re-origining the region would break that join.
 *
 * Tiles are shared by reference rather than cloned: the source map can hold
 * millions of tiles, and duplicating them would double peak memory for no gain.
 * The source map is not modified.
 */
export function clipOtbm(map: OtbmMap, regions: ClipRegion[]): OtbmMap {
  if (regions.length === 0) {
    throw new Error('clipOtbm requires at least one region')
  }

  const tiles: OtbmMap['tiles'] = new Map()
  for (const [key, tile] of map.tiles) {
    if (inAnyRegion(regions, tile.x, tile.y, tile.z)) {
      tiles.set(key, tile)
    }
  }

  const clipped: OtbmMap = {
    ...map,
    tiles,
    towns: map.towns.filter(t => inAnyRegion(regions, t.templeX, t.templeY, t.templeZ)),
    waypoints: map.waypoints.filter(w => inAnyRegion(regions, w.x, w.y, w.z)),
  }

  // The area sequence exists so a re-save can reproduce the original grouping.
  // Prune it to the surviving tiles and drop areas that lost all of theirs,
  // otherwise serialization would emit empty area nodes.
  if (map._areaSequence) {
    clipped._areaSequence = map._areaSequence
      .map(area => ({ ...area, tileKeys: area.tileKeys.filter(k => tiles.has(k)) }))
      .filter(area => area.tileKeys.length > 0)
  }

  return clipped
}
