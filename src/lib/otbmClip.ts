import type { OtbmMap } from './otbm.ts'
import { inAnyRegion, type ClipRegion } from './clipRegion.ts'

export type { ClipRegion } from './clipRegion.ts'

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
