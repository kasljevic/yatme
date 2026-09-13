import type { ClipRegion } from './otbmClip.ts'

const NODE_START = 0xfe
const NODE_END = 0xff
const ESCAPE_CHAR = 0xfd

const OTBM_MAP_DATA = 2
const OTBM_TILE_AREA = 4

/** Tiles are grouped into 256x256 blocks, so one area covers this span per axis. */
const AREA_SPAN = 256

/** Bytes of area header: u16 baseX, u16 baseY, u8 baseZ. */
const AREA_HEADER_BYTES = 5

interface ByteRange {
  start: number
  end: number
}

/**
 * Reads `count` logical bytes starting at `offset`, undoing OTBM escaping.
 *
 * Header fields are normally plain — base coordinates are 256-aligned, so their
 * low byte is always 0x00 — but a high byte of 0xFD/0xFE/0xFF would be escaped,
 * and silently misreading the header would drop the wrong region.
 */
function readUnescaped(raw: Uint8Array, offset: number, count: number): number[] {
  const out: number[] = []
  let i = offset
  while (out.length < count && i < raw.length) {
    if (raw[i] === ESCAPE_CHAR) i++
    out.push(raw[i]!)
    i++
  }
  return out
}

function areaOverlaps(region: ClipRegion, baseX: number, baseY: number, baseZ: number): boolean {
  if (baseX + AREA_SPAN - 1 < region.minX || baseX > region.maxX) return false
  if (baseY + AREA_SPAN - 1 < region.minY || baseY > region.maxY) return false
  if (region.minZ !== undefined && baseZ < region.minZ) return false
  if (region.maxZ !== undefined && baseZ > region.maxZ) return false
  return true
}

/**
 * Removes whole `OTBM_TILE_AREA` blocks that lie outside every region, returning
 * a smaller but still valid OTBM stream.
 *
 * This exists because a world-sized map (otservbr is ~18M tiles) cannot be held
 * in memory as parsed tile objects at all — a full parse exhausts a 12 GB heap.
 * Filtering at the byte level sidesteps that: every kept area is copied verbatim,
 * so no item attribute is ever decoded and nothing is re-serialized.
 *
 * Filtering is deliberately coarse — an area is kept whenever it overlaps a
 * region at all, so the result can still contain tiles outside it. Feed the
 * result through `parseOtbm` + `clipOtbm` for exact per-tile trimming; that pair
 * is affordable once the map is region-sized.
 */
export function prefilterOtbmAreas(raw: Uint8Array, regions: ClipRegion[]): Uint8Array {
  if (regions.length === 0) {
    throw new Error('prefilterOtbmAreas requires at least one region')
  }
  // A stream begins with 4 version bytes, then the root node.
  if (raw.length < 6 || raw[4] !== NODE_START) {
    throw new Error('Not an OTBM stream: missing root node marker')
  }

  const drop: ByteRange[] = []
  // Node types by depth, so an area is only recognised as a child of map data.
  const stack: number[] = []
  // Start offset of the area currently being skipped over, if any.
  let pendingStart = -1
  let pendingDepth = -1

  let i = 4
  while (i < raw.length) {
    const byte = raw[i]

    if (byte === ESCAPE_CHAR) {
      i += 2
      continue
    }

    if (byte === NODE_START) {
      const type = raw[i + 1]!
      // Only areas directly under map data hold tiles; anything deeper is data.
      if (type === OTBM_TILE_AREA && pendingStart < 0 && stack[stack.length - 1] === OTBM_MAP_DATA) {
        const [xLo, xHi, yLo, yHi, z] = readUnescaped(raw, i + 2, AREA_HEADER_BYTES)
        const baseX = xLo! | (xHi! << 8)
        const baseY = yLo! | (yHi! << 8)
        if (!regions.some(r => areaOverlaps(r, baseX, baseY, z!))) {
          pendingStart = i
          pendingDepth = stack.length
        }
      }
      stack.push(type)
      i += 2
      continue
    }

    if (byte === NODE_END) {
      stack.pop()
      if (pendingStart >= 0 && stack.length === pendingDepth) {
        drop.push({ start: pendingStart, end: i + 1 })
        pendingStart = -1
      }
      i += 1
      continue
    }

    i += 1
  }

  if (drop.length === 0) return raw

  const kept = raw.length - drop.reduce((sum, r) => sum + (r.end - r.start), 0)
  const out = new Uint8Array(kept)
  let write = 0
  let read = 0
  for (const range of drop) {
    out.set(raw.subarray(read, range.start), write)
    write += range.start - read
    read = range.end
  }
  out.set(raw.subarray(read), write)
  return out
}
