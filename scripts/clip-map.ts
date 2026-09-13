/**
 * Clip a world-sized OTBM down to one or more regions.
 *
 * A full real-Tibia map (otservbr.otbm: 176 MiB, ~18M tiles) does not fit
 * comfortably in a browser tab, which is where yatme parses and renders. This
 * produces a much smaller map covering only the areas of interest, with
 * absolute coordinates preserved so external position data still joins.
 *
 * Usage:
 *   npm run clip-map -- --in maps/staging/otservbr.otbm --out maps/thais.otbm \
 *     --region thais --region abdendriel
 *   npm run clip-map -- --in a.otbm --out b.otbm --region 32200,32150,32460,32300
 *
 * A region is either a preset name or minX,minY,maxX,maxY[,minZ,maxZ].
 *
 * Runs in two passes because a full parse of a world-sized map exhausts even a
 * 12 GB heap: a byte-level prefilter first drops whole out-of-region tile-area
 * blocks, then the region-sized result is parsed and clipped tile-exactly.
 */
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { parseOtbm, serializeOtbm } from '../src/lib/otbm.ts'
import { clipOtbm, type ClipRegion } from '../src/lib/otbmClip.ts'
import { prefilterOtbmAreas } from '../src/lib/otbmPrefilter.ts'
import { clipSidecars } from '../src/lib/sidecarClip.ts'
import {
  emptySidecars, parseHousesXml, parseSpawnsXml,
  serializeHousesXml, serializeSpawnsXml, type MapSidecars,
} from '../src/lib/sidecars.ts'

// sidecars.ts parses with DOMParser because it normally runs in the browser.
// Lending it a DOM here is what lets this script reuse it instead of growing a
// second XML parser that could disagree with the editor's.
globalThis.DOMParser = new JSDOM().window.DOMParser

/** Named areas of the otservbr real-Tibia map, generous boxes around each city. */
const PRESETS: Record<string, ClipRegion> = {
  thais: { minX: 32200, minY: 32150, maxX: 32460, maxY: 32320 },
  abdendriel: { minX: 32600, minY: 31540, maxX: 32790, maxY: 31700 },
  carlin: { minX: 32260, minY: 31700, maxX: 32460, maxY: 31860 },
  venore: { minX: 32860, minY: 32050, maxX: 33040, maxY: 32240 },
}

function parseRegion(spec: string): ClipRegion {
  const preset = PRESETS[spec.toLowerCase()]
  if (preset) return preset

  const n = spec.split(',').map(s => Number(s.trim()))
  if ((n.length !== 4 && n.length !== 6) || n.some(v => !Number.isFinite(v))) {
    throw new Error(
      `Bad --region "${spec}". Use a preset (${Object.keys(PRESETS).join(', ')}) ` +
      `or minX,minY,maxX,maxY[,minZ,maxZ]`,
    )
  }
  const [minX, minY, maxX, maxY, minZ, maxZ] = n as number[]
  const region: ClipRegion = { minX: minX!, minY: minY!, maxX: maxX!, maxY: maxY! }
  if (minZ !== undefined) region.minZ = minZ
  if (maxZ !== undefined) region.maxZ = maxZ
  return region
}

interface Args {
  input: string
  output: string
  regions: ClipRegion[]
  sidecarDir: string
}

function parseArgs(argv: string[]): Args {
  let input = ''
  let output = ''
  let sidecarDir = ''
  const regions: ClipRegion[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--in' && next) { input = next; i++ }
    else if (arg === '--out' && next) { output = next; i++ }
    else if (arg === '--region' && next) { regions.push(parseRegion(next)); i++ }
    else if (arg === '--sidecar-dir' && next) { sidecarDir = next; i++ }
    else throw new Error(`Unexpected argument "${arg}"`)
  }
  if (!input || !output) throw new Error('Both --in and --out are required')
  if (regions.length === 0) throw new Error('At least one --region is required')
  return { input, output, regions, sidecarDir: sidecarDir || path.dirname(input) }
}

/**
 * Reads the sidecars the map names, from `dir`. Missing files are skipped rather
 * than fatal: a map may legitimately ship without spawns or NPCs.
 */
function readSidecars(dir: string, map: { houseFile: string; spawnFile: string; npcFile: string }): MapSidecars {
  const sidecars = emptySidecars()
  const read = (name: string): string | null => {
    if (!name) return null
    const full = path.join(dir, name)
    if (!fs.existsSync(full)) {
      console.log(`skip    ${name} (not found in ${dir})`)
      return null
    }
    return fs.readFileSync(full, 'utf8')
  }

  const houseXml = read(map.houseFile)
  if (houseXml) sidecars.houses = parseHousesXml(houseXml)
  const spawnXml = read(map.spawnFile)
  if (spawnXml) sidecars.monsterSpawns = parseSpawnsXml(spawnXml, 'monsters')
  const npcXml = read(map.npcFile)
  if (npcXml) sidecars.npcSpawns = parseSpawnsXml(npcXml, 'npcs')
  return sidecars
}

function mib(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

async function main(): Promise<void> {
  const { input, output, regions, sidecarDir } = parseArgs(process.argv.slice(2))

  const raw = fs.readFileSync(input)
  console.log(`read    ${input} (${mib(raw.byteLength)})`)

  const prefiltered = prefilterOtbmAreas(raw, regions)
  console.log(`prefilt ${mib(prefiltered.byteLength)} after dropping out-of-region area blocks`)

  const started = Date.now()
  const map = parseOtbm(prefiltered)
  console.log(`parsed  ${map.tiles.size.toLocaleString()} tiles, ` +
    `${map.towns.length} towns, otbm v${map.version} ${map.width}x${map.height} ` +
    `in ${((Date.now() - started) / 1000).toFixed(1)}s`)

  const clipped = clipOtbm(map, regions)
  const kept = map.tiles.size === 0 ? 0 : (clipped.tiles.size / map.tiles.size) * 100
  console.log(`clipped ${clipped.tiles.size.toLocaleString()} tiles ` +
    `(${kept.toFixed(2)}% of prefiltered), ${clipped.towns.length} towns, ` +
    `${clipped.waypoints.length} waypoints`)

  if (clipped.tiles.size === 0) {
    throw new Error('Clip produced no tiles — check the region coordinates')
  }

  // Sidecars are renamed to match the output map so the "<map>-house.xml"
  // convention still holds, and the map's own references are updated to match.
  const stem = path.basename(output).replace(/\.otbm$/i, '')
  const sourceSidecars = readSidecars(sidecarDir, clipped)
  const houseIds = new Set<number>()
  for (const tile of clipped.tiles.values()) {
    if (tile.houseId) houseIds.add(tile.houseId)
  }
  const clippedSidecars = clipSidecars(sourceSidecars, regions, { keepHouseIds: houseIds })
  console.log(`sidecar ${clippedSidecars.houses.length}/${sourceSidecars.houses.length} houses, ` +
    `${clippedSidecars.monsterSpawns.length}/${sourceSidecars.monsterSpawns.length} monster spawns, ` +
    `${clippedSidecars.npcSpawns.length}/${sourceSidecars.npcSpawns.length} NPC spawns`)

  if (clippedSidecars.houses.length > 0) clipped.houseFile = `${stem}-house.xml`
  if (clippedSidecars.monsterSpawns.length > 0) clipped.spawnFile = `${stem}-monster.xml`
  if (clippedSidecars.npcSpawns.length > 0) clipped.npcFile = `${stem}-npc.xml`

  const bytes = await serializeOtbm(clipped)
  const outDir = path.dirname(path.resolve(output))
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(output, bytes)
  console.log(`wrote   ${output} (${mib(bytes.byteLength)})`)

  const writeSidecar = (name: string, xml: string): void => {
    fs.writeFileSync(path.join(outDir, name), xml)
    console.log(`wrote   ${name} (${mib(Buffer.byteLength(xml))})`)
  }
  if (clippedSidecars.houses.length > 0) {
    writeSidecar(clipped.houseFile, serializeHousesXml(clippedSidecars.houses))
  }
  if (clippedSidecars.monsterSpawns.length > 0) {
    writeSidecar(clipped.spawnFile, serializeSpawnsXml(clippedSidecars.monsterSpawns, 'monsters'))
  }
  if (clippedSidecars.npcSpawns.length > 0) {
    writeSidecar(clipped.npcFile, serializeSpawnsXml(clippedSidecars.npcSpawns, 'npcs'))
  }
}

main().catch(err => {
  console.error(`clip-map failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
