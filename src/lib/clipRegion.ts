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

/** True when the region's optional floor range admits `z`. */
export function includesFloor(region: ClipRegion, z: number): boolean {
  if (region.minZ !== undefined && z < region.minZ) return false
  if (region.maxZ !== undefined && z > region.maxZ) return false
  return true
}

export function containsPoint(region: ClipRegion, x: number, y: number, z: number): boolean {
  if (x < region.minX || x > region.maxX) return false
  if (y < region.minY || y > region.maxY) return false
  return includesFloor(region, z)
}

export function inAnyRegion(regions: ClipRegion[], x: number, y: number, z: number): boolean {
  return regions.some(r => containsPoint(r, x, y, z))
}

/**
 * True when a square block of `span` tiles with its corner at (baseX, baseY)
 * overlaps the region at all. Used to keep or drop whole OTBM tile-area blocks
 * without inspecting the tiles inside them.
 */
export function blockOverlaps(
  region: ClipRegion,
  baseX: number,
  baseY: number,
  baseZ: number,
  span: number,
): boolean {
  if (baseX + span - 1 < region.minX || baseX > region.maxX) return false
  if (baseY + span - 1 < region.minY || baseY > region.maxY) return false
  return includesFloor(region, baseZ)
}

export function anyBlockOverlaps(
  regions: ClipRegion[],
  baseX: number,
  baseY: number,
  baseZ: number,
  span: number,
): boolean {
  return regions.some(r => blockOverlaps(r, baseX, baseY, baseZ, span))
}
