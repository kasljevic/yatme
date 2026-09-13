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
import { parseOtbm, serializeOtbm } from '../src/lib/otbm.ts'
import { clipOtbm, type ClipRegion } from '../src/lib/otbmClip.ts'
import { prefilterOtbmAreas } from '../src/lib/otbmPrefilter.ts'

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

function parseArgs(argv: string[]): { input: string; output: string; regions: ClipRegion[] } {
  let input = ''
  let output = ''
  const regions: ClipRegion[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--in' && next) { input = next; i++ }
    else if (arg === '--out' && next) { output = next; i++ }
    else if (arg === '--region' && next) { regions.push(parseRegion(next)); i++ }
    else throw new Error(`Unexpected argument "${arg}"`)
  }
  if (!input || !output) throw new Error('Both --in and --out are required')
  if (regions.length === 0) throw new Error('At least one --region is required')
  return { input, output, regions }
}

function mib(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

async function main(): Promise<void> {
  const { input, output, regions } = parseArgs(process.argv.slice(2))

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

  const bytes = await serializeOtbm(clipped)
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
  fs.writeFileSync(output, bytes)
  console.log(`wrote   ${output} (${mib(bytes.byteLength)})`)
}

main().catch(err => {
  console.error(`clip-map failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
