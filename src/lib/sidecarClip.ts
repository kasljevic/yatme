import type { MapSidecars, SpawnPoint } from './sidecars.ts'
import { anyBlockOverlaps, inAnyRegion, type ClipRegion } from './clipRegion.ts'

export interface ClipSidecarsOptions {
  /**
   * Ids of houses known to own tiles in the clipped map. A house is kept when
   * its id appears here even if its recorded entry position falls outside every
   * region — registries commonly record a door or sign tile just outside the
   * rooms it belongs to.
   */
  keepHouseIds?: Set<number>
}

/**
 * A spawn is kept when the square its radius covers overlaps a region, not
 * merely when its centre does: a spawn just outside the boundary still places
 * creatures inside it.
 */
function spawnOverlaps(regions: ClipRegion[], spawn: SpawnPoint): boolean {
  const radius = Math.max(spawn.radius, 0)
  return anyBlockOverlaps(
    regions,
    spawn.centerX - radius,
    spawn.centerY - radius,
    spawn.centerZ,
    radius * 2 + 1,
  )
}

/**
 * Filters sidecar data down to the same regions used to clip the map, so a
 * clipped map ships with houses, spawns and NPCs that actually exist in it.
 *
 * Zones pass through untouched: a zone record is an id and a name, with its
 * tiles stored in the map itself, so there is nothing positional to filter.
 *
 * The source is not modified; records are shared by reference.
 */
export function clipSidecars(
  sidecars: MapSidecars,
  regions: ClipRegion[],
  options: ClipSidecarsOptions = {},
): MapSidecars {
  if (regions.length === 0) {
    throw new Error('clipSidecars requires at least one region')
  }

  const keepHouseIds = options.keepHouseIds

  return {
    houses: sidecars.houses.filter(h =>
      keepHouseIds?.has(h.id) || inAnyRegion(regions, h.entryX, h.entryY, h.entryZ),
    ),
    monsterSpawns: sidecars.monsterSpawns.filter(s => spawnOverlaps(regions, s)),
    npcSpawns: sidecars.npcSpawns.filter(s => spawnOverlaps(regions, s)),
    zones: sidecars.zones,
  }
}
