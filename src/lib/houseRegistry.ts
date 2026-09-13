import type { HouseData } from './sidecars.ts'

/**
 * A house as reported by the launchpad tibia-houses service: live tibia.com
 * state (ownership, rent, auctions) plus wiki-derived position.
 *
 * Keyed by `houseid`, which is the number tibia.com uses. In an OTBM house
 * registry that same number is stored as `clientid`, while `houseid` there is a
 * server-internal id — so the two datasets join on clientId, not on id.
 */
export interface LiveHouse {
  houseid: number
  name: string
  town: string
  kind: string
  status: string
  owner: string
  rent: number
  size: number
  beds: number
  auctionBid: number
  auctionBidder: string
  auctionEnd: string
  paidUntil: string
  imageUrl: string
  /** Wiki `sector.offset` strings, e.g. "127.145". Decode with decodeWikiCoord. */
  posX: string | null
  posY: string | null
  posZ: string | null
  sourceUrl: string
}

/** A map house with its live counterpart attached, if one was found. */
export interface EnrichedHouse extends HouseData {
  live: LiveHouse | null
}

/** Tiles per wiki map sector — coordinates are recorded as sector.offset. */
const SECTOR_SPAN = 256

/**
 * Decodes a wiki position component. The wiki records positions as
 * `sector.offset`, so "127.145" means 127 * 256 + 145 = 32657. A component
 * without a separator is already absolute.
 */
export function decodeWikiCoord(value: string | null | undefined): number | null {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null

  const parts = text.split('.')
  if (parts.length === 1) {
    const n = Number(parts[0])
    return Number.isFinite(n) ? n : null
  }
  if (parts.length !== 2) return null

  const sector = Number(parts[0])
  const offset = Number(parts[1])
  if (!Number.isFinite(sector) || !Number.isFinite(offset)) return null
  return sector * SECTOR_SPAN + offset
}

/** Absolute map position of a live house, or null when the wiki has none. */
export function liveHousePosition(house: LiveHouse): { x: number; y: number; z: number } | null {
  const x = decodeWikiCoord(house.posX)
  const y = decodeWikiCoord(house.posY)
  const z = decodeWikiCoord(house.posZ)
  if (x == null || y == null || z == null) return null
  return { x, y, z }
}

function str(record: Record<string, unknown>, key: string): string {
  const v = record[key]
  return typeof v === 'string' ? v : ''
}

function num(record: Record<string, unknown>, key: string): number {
  const v = record[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return 0
}

function coord(record: Record<string, unknown>, key: string): string | null {
  const v = record[key]
  if (typeof v === 'string' && v.trim()) return v
  if (typeof v === 'number') return String(v)
  return null
}

/**
 * Converts a tibia-houses API payload into typed records.
 *
 * Deliberately tolerant: this is a live external service, so a missing field
 * yields a default rather than breaking the palette, and an entry without a
 * usable id is skipped rather than joined against by accident.
 */
export function normalizeLiveHouses(payload: unknown): LiveHouse[] {
  const houses = (payload as { houses?: unknown } | null)?.houses
  if (!Array.isArray(houses)) return []

  const out: LiveHouse[] = []
  for (const entry of houses) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const houseid = num(record, 'houseid')
    if (!houseid) continue

    out.push({
      houseid,
      name: str(record, 'name'),
      town: str(record, 'town'),
      kind: str(record, 'kind'),
      status: str(record, 'status'),
      owner: str(record, 'owner'),
      rent: num(record, 'rent'),
      size: num(record, 'size'),
      beds: num(record, 'beds'),
      auctionBid: num(record, 'auction_bid'),
      auctionBidder: str(record, 'auction_bidder'),
      auctionEnd: str(record, 'auction_end'),
      paidUntil: str(record, 'paid_until'),
      imageUrl: str(record, 'house_img'),
      posX: coord(record, 'posx'),
      posY: coord(record, 'posy'),
      posZ: coord(record, 'posz'),
      sourceUrl: str(record, 'source_url'),
    })
  }
  return out
}

/**
 * Attaches live data to each map house, matching clientId against the live
 * house id. Every map house is returned in its original order, with `live` null
 * where nothing matched, so the palette shows the map's own contents whether or
 * not the service is reachable.
 */
export function joinHouses(houses: HouseData[], liveHouses: LiveHouse[]): EnrichedHouse[] {
  const byId = new Map<number, LiveHouse>()
  for (const house of liveHouses) byId.set(house.houseid, house)

  return houses.map(house => ({
    ...house,
    // clientId 0 means "not a tibia.com house" (e.g. created in the editor),
    // so it must not match a live record that also lacks an id.
    live: house.clientId ? byId.get(house.clientId) ?? null : null,
  }))
}

/**
 * Filters houses by a free-text query across the fields someone would search
 * by: the house name, its town, the current owner, and the client id shown on
 * tibia.com. A blank query matches everything.
 */
export function searchHouses(houses: EnrichedHouse[], query: string): EnrichedHouse[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return houses

  return houses.filter(house => {
    const haystack = [
      house.name,
      house.live?.name ?? '',
      house.live?.town ?? '',
      house.live?.owner ?? '',
      String(house.clientId || ''),
    ]
    return haystack.some(field => field.toLowerCase().includes(needle))
  })
}

export interface MapPosition {
  x: number
  y: number
  z: number
}

/** Just enough of a tile to locate a house on the map. */
export interface HouseTileLike {
  x: number
  y: number
  z: number
  houseId?: number
}

/**
 * Finds a tile the house owns, so the camera can fly to somewhere that actually
 * exists in the loaded map.
 */
export function findHouseTile(tiles: Iterable<HouseTileLike>, houseId: number): MapPosition | null {
  for (const tile of tiles) {
    if (tile.houseId === houseId) return { x: tile.x, y: tile.y, z: tile.z }
  }
  return null
}

/**
 * Picks where to send the camera for a house, most trustworthy source first.
 *
 * Owned tiles win because they are the map's own geometry. Failing that a
 * registry position still points at the right neighbourhood — useful for a house
 * whose tiles were clipped away — and the recorded entry is the last resort,
 * since an unplaced house has one of 0,0.
 */
export function resolveHouseTarget(
  tiles: Iterable<HouseTileLike>,
  house: EnrichedHouse,
): MapPosition | null {
  const tile = findHouseTile(tiles, house.id)
  if (tile) return tile

  const livePosition = house.live ? liveHousePosition(house.live) : null
  if (livePosition) return livePosition

  if (house.entryX > 0 && house.entryY > 0) {
    return { x: house.entryX, y: house.entryY, z: house.entryZ }
  }
  return null
}
