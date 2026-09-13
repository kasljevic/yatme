import { describe, it, expect } from 'vitest'
import {
  decodeWikiCoord, normalizeLiveHouses, joinHouses, searchHouses, liveHousePosition,
  type LiveHouse,
} from './houseRegistry.ts'
import type { HouseData } from './sidecars.ts'

function mapHouse(id: number, name: string, clientId: number): HouseData {
  return {
    id, name, clientId, entryX: 32657, entryY: 31583, entryZ: 7,
    rent: 0, townId: 5, size: 0, guildhall: false, beds: 0,
  }
}

function live(partial: Partial<LiveHouse> & { houseid: number }): LiveHouse {
  return {
    name: '', town: '', kind: '', status: '', owner: '', rent: 0, size: 0, beds: 0,
    auctionBid: 0, auctionBidder: '', auctionEnd: '', paidUntil: '', imageUrl: '',
    posX: null, posY: null, posZ: null, sourceUrl: '',
    ...partial,
  }
}

describe('decodeWikiCoord', () => {
  it('decodes a sector.offset pair into an absolute coordinate', () => {
    // Arrange / Act / Assert — 127 * 256 + 145 = 32657
    expect(decodeWikiCoord('127.145')).toBe(32657)
  })

  it('decodes a plain integer as itself', () => {
    expect(decodeWikiCoord('7')).toBe(7)
  })

  it('returns null for missing or unparseable values', () => {
    expect(decodeWikiCoord(null)).toBeNull()
    expect(decodeWikiCoord('')).toBeNull()
    expect(decodeWikiCoord('not-a-number')).toBeNull()
  })
})

describe('normalizeLiveHouses', () => {
  it('reads the houses array and maps snake_case fields', () => {
    // Arrange
    const payload = {
      houses: [{
        houseid: 40112, name: 'Castle of the Winds', town: "Ab'Dendriel",
        kind: 'guildhall', status: 'rented', owner: 'Szofer Edzio',
        rent: 500000, size: 514, beds: 18, auction_bid: 0, auction_bidder: '',
        auction_end: '', paid_until: '2026-10-04T09:03:06Z',
        house_img: 'https://static.tibia.com/images/houses/house_40112.png',
        posx: '127.145', posy: '123.95', posz: '7', source_url: 'https://tibia.com/x',
      }],
    }

    // Act
    const [house] = normalizeLiveHouses(payload)

    // Assert
    expect(house).toMatchObject({
      houseid: 40112,
      name: 'Castle of the Winds',
      owner: 'Szofer Edzio',
      rent: 500000,
      paidUntil: '2026-10-04T09:03:06Z',
      imageUrl: 'https://static.tibia.com/images/houses/house_40112.png',
      posX: '127.145',
    })
  })

  it('returns an empty list for a payload with no houses', () => {
    expect(normalizeLiveHouses({})).toEqual([])
    expect(normalizeLiveHouses(null)).toEqual([])
    expect(normalizeLiveHouses({ houses: 'nope' })).toEqual([])
  })

  it('skips entries without a numeric house id', () => {
    // Arrange
    const payload = { houses: [{ name: 'No Id' }, { houseid: 40112, name: 'Real' }] }

    // Act / Assert
    expect(normalizeLiveHouses(payload).map(h => h.houseid)).toEqual([40112])
  })

  it('defaults absent optional fields instead of yielding undefined', () => {
    // Arrange
    const payload = { houses: [{ houseid: 40112 }] }

    // Act
    const [house] = normalizeLiveHouses(payload)

    // Assert
    expect(house).toMatchObject({ name: '', owner: '', rent: 0, posX: null })
  })
})

describe('joinHouses', () => {
  it('joins a map house to live data on clientId equals houseid', () => {
    // Arrange — the map's own id (2629) is server-internal; clientId is the
    // number tibia.com uses, which is what the live registry is keyed by.
    const houses = [mapHouse(2629, "Ab'Dendriel Clanhall", 40111)]
    const liveHouses = [live({ houseid: 40111, owner: 'Wolfvverine', status: 'rented' })]

    // Act
    const [joined] = joinHouses(houses, liveHouses)

    // Assert
    expect(joined?.live?.owner).toBe('Wolfvverine')
    expect(joined?.id).toBe(2629)
  })

  it('leaves live data null when no live record matches', () => {
    // Arrange
    const houses = [mapHouse(2629, 'Unlisted House', 99999)]

    // Act
    const [joined] = joinHouses(houses, [live({ houseid: 40111 })])

    // Assert
    expect(joined?.live).toBeNull()
  })

  it('leaves live data null for a map house with no clientId', () => {
    // Arrange — houses created in the editor have clientId 0.
    const houses = [mapHouse(2629, 'New House', 0)]

    // Act
    const [joined] = joinHouses(houses, [live({ houseid: 0 })])

    // Assert
    expect(joined?.live).toBeNull()
  })

  it('keeps every map house regardless of whether it matched', () => {
    // Arrange
    const houses = [mapHouse(1, 'A', 40111), mapHouse(2, 'B', 55555)]

    // Act / Assert
    expect(joinHouses(houses, [live({ houseid: 40111 })])).toHaveLength(2)
  })

  it('preserves map order so the palette does not reshuffle', () => {
    // Arrange
    const houses = [mapHouse(3, 'C', 40113), mapHouse(1, 'A', 40111)]

    // Act
    const joined = joinHouses(houses, [live({ houseid: 40111 }), live({ houseid: 40113 })])

    // Assert
    expect(joined.map(h => h.id)).toEqual([3, 1])
  })
})

describe('liveHousePosition', () => {
  it('decodes a live record into absolute map coordinates', () => {
    // Arrange
    const house = live({ houseid: 40112, posX: '127.145', posY: '123.95', posZ: '7' })

    // Act / Assert — 127*256+145, 123*256+95
    expect(liveHousePosition(house)).toEqual({ x: 32657, y: 31583, z: 7 })
  })

  it('returns null when any coordinate is missing', () => {
    expect(liveHousePosition(live({ houseid: 1, posX: '127.145', posY: null, posZ: '7' }))).toBeNull()
  })
})

describe('searchHouses', () => {
  const joined = joinHouses(
    [mapHouse(1, 'Castle of the Winds', 40112), mapHouse(2, 'Harbour Place 4', 40501)],
    [
      live({ houseid: 40112, town: "Ab'Dendriel", owner: 'Szofer Edzio' }),
      live({ houseid: 40501, town: 'Thais', owner: 'Mario Pakiito' }),
    ],
  )

  it('returns every house for a blank query', () => {
    expect(searchHouses(joined, '   ')).toHaveLength(2)
  })

  it('matches on house name, case-insensitively', () => {
    expect(searchHouses(joined, 'castle').map(h => h.id)).toEqual([1])
  })

  it('matches on town', () => {
    expect(searchHouses(joined, 'thais').map(h => h.id)).toEqual([2])
  })

  it('matches on owner so a player can be located', () => {
    expect(searchHouses(joined, 'szofer').map(h => h.id)).toEqual([1])
  })

  it('matches on the client id a player sees on tibia.com', () => {
    expect(searchHouses(joined, '40501').map(h => h.id)).toEqual([2])
  })

  it('returns nothing when there is no match', () => {
    expect(searchHouses(joined, 'zzzz')).toEqual([])
  })
})
