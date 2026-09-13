import { describe, it, expect } from 'vitest'
import { clipSidecars } from './sidecarClip.ts'
import { emptySidecars, type MapSidecars, type HouseData, type SpawnPoint } from './sidecars.ts'
import type { ClipRegion } from './clipRegion.ts'

const ABDENDRIEL: ClipRegion = { minX: 32600, minY: 31540, maxX: 32790, maxY: 31700 }

function house(id: number, name: string, x: number, y: number, z = 7): HouseData {
  return {
    id, name, entryX: x, entryY: y, entryZ: z,
    rent: 500000, townId: 5, size: 514, clientId: 40112, guildhall: false, beds: 4,
  }
}

function spawn(x: number, y: number, z: number, radius: number, names: string[]): SpawnPoint {
  return {
    centerX: x, centerY: y, centerZ: z, radius,
    creatures: names.map(name => ({ name, x, y, z, spawnTime: 90, direction: 0 })),
  }
}

function sidecarsWith(partial: Partial<MapSidecars>): MapSidecars {
  return { ...emptySidecars(), ...partial }
}

describe('clipSidecars', () => {
  it('keeps houses whose entry lies inside a region', () => {
    // Arrange
    const inside = house(2628, 'Castle of the Winds', 32657, 31583)
    const outside = house(1234, 'Thais House', 32369, 32241)

    // Act
    const clipped = clipSidecars(sidecarsWith({ houses: [inside, outside] }), [ABDENDRIEL])

    // Assert
    expect(clipped.houses.map(h => h.id)).toEqual([2628])
  })

  it('keeps a house whose entry is outside but whose tiles survived the clip', () => {
    // Arrange — the registry records a door tile that can fall outside the box
    // while the rooms it opens onto are inside it.
    const drifted = house(2628, 'Castle of the Winds', 32599, 31583)

    // Act
    const clipped = clipSidecars(
      sidecarsWith({ houses: [drifted] }),
      [ABDENDRIEL],
      { keepHouseIds: new Set([2628]) },
    )

    // Assert
    expect(clipped.houses.map(h => h.id)).toEqual([2628])
  })

  it('drops a house that is neither in a region nor present in the map', () => {
    // Arrange
    const far = house(999, 'Venore House', 32950, 32100)

    // Act
    const clipped = clipSidecars(
      sidecarsWith({ houses: [far] }),
      [ABDENDRIEL],
      { keepHouseIds: new Set([2628]) },
    )

    // Assert
    expect(clipped.houses).toEqual([])
  })

  it('keeps monster spawns centred inside a region and drops the rest', () => {
    // Arrange
    const near = spawn(32657, 31583, 7, 2, ['Elf Scout'])
    const far = spawn(32153, 31124, 7, 2, ['Silver Rabbit'])

    // Act
    const clipped = clipSidecars(sidecarsWith({ monsterSpawns: [near, far] }), [ABDENDRIEL])

    // Assert
    expect(clipped.monsterSpawns).toEqual([near])
  })

  it('keeps a spawn whose radius reaches into the region even when its centre does not', () => {
    // Arrange — centre sits 2 tiles outside, radius 5 covers tiles inside.
    const straddling = spawn(32598, 31583, 7, 5, ['Elf'])

    // Act
    const clipped = clipSidecars(sidecarsWith({ monsterSpawns: [straddling] }), [ABDENDRIEL])

    // Assert
    expect(clipped.monsterSpawns).toEqual([straddling])
  })

  it('keeps every creature of a kept spawn', () => {
    // Arrange
    const multi = spawn(32657, 31583, 7, 2, ['Elf', 'Elf Scout', 'Elf Arcanist'])

    // Act
    const clipped = clipSidecars(sidecarsWith({ monsterSpawns: [multi] }), [ABDENDRIEL])

    // Assert
    expect(clipped.monsterSpawns[0]?.creatures).toHaveLength(3)
  })

  it('filters NPC spawns the same way as monster spawns', () => {
    // Arrange
    const near = spawn(32661, 31590, 7, 1, ['Gwen'])
    const far = spawn(33957, 31513, 7, 1, ['Tanyt'])

    // Act
    const clipped = clipSidecars(sidecarsWith({ npcSpawns: [near, far] }), [ABDENDRIEL])

    // Assert
    expect(clipped.npcSpawns).toEqual([near])
  })

  it('honours a region floor range for spawns', () => {
    // Arrange
    const surface: ClipRegion = { ...ABDENDRIEL, minZ: 6, maxZ: 8 }
    const above = spawn(32657, 31583, 7, 2, ['Elf'])
    const underground = spawn(32657, 31583, 12, 2, ['Ghoul'])

    // Act
    const clipped = clipSidecars(sidecarsWith({ monsterSpawns: [above, underground] }), [surface])

    // Assert
    expect(clipped.monsterSpawns).toEqual([above])
  })

  it('keeps zones unchanged because they carry no coordinates', () => {
    // Arrange
    const zones = [{ id: 1, name: 'no-logout' }]

    // Act
    const clipped = clipSidecars(sidecarsWith({ zones }), [ABDENDRIEL])

    // Assert
    expect(clipped.zones).toEqual(zones)
  })

  it('does not mutate the source sidecars', () => {
    // Arrange
    const source = sidecarsWith({
      houses: [house(2628, 'Castle of the Winds', 32657, 31583), house(1, 'Far', 1, 1)],
      monsterSpawns: [spawn(32153, 31124, 7, 2, ['Silver Rabbit'])],
    })

    // Act
    clipSidecars(source, [ABDENDRIEL])

    // Assert
    expect(source.houses).toHaveLength(2)
    expect(source.monsterSpawns).toHaveLength(1)
  })

  it('rejects an empty region list rather than silently dropping everything', () => {
    // Arrange
    const source = sidecarsWith({ houses: [house(2628, 'Castle of the Winds', 32657, 31583)] })

    // Act / Assert
    expect(() => clipSidecars(source, [])).toThrow(/at least one region/i)
  })
})
