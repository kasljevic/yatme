import path from 'node:path'

export interface ServerConfig {
  port: number
  mapDir: string
  mapFile?: string
  /** Base URL of the launchpad tibia-houses service, if one is available. */
  housesUrl?: string
  /**
   * When true, every write (POST) route for map and sidecar data is refused
   * regardless of caller — an explicit deployment choice for servers that
   * only ever host read-only quest viewers. Independent of, and checked
   * before, the portal-origin heuristic in `lib/portalOrigin.ts`.
   */
  readOnly: boolean
  /**
   * Directory allowlisted for quest map lookups. Each quest is exactly one
   * file named "<slug>.otbm" directly inside this directory — never an
   * arbitrary path supplied by a caller. Defaults to a "quests" subfolder of
   * `mapDir` so a standard deployment works without extra configuration.
   */
  questsDir: string
  /**
   * Origins allowed to send postMessage commands to a quest viewer instance.
   * Served to the client at runtime via `GET /api/quest-config` rather than
   * baked into the build, since the frontend bundle is typically built once
   * and self-hosted under many different domains. Empty means "no
   * server-configured allowlist" — the client then falls back to trusting
   * only its own origin (see `src/lib/questOrigin.ts`).
   */
  viewerAllowedOrigins: string[]
}

const root = process.cwd()

export const assetsDir = path.resolve(root, process.env['ASSETS_DIR']!)
export const dataDir = path.resolve(root, './data')
export const distDir = path.resolve(root, './dist')

/** Truthy env string parser: "1", "true", "yes", "on" (case-insensitive). */
function parseBoolEnv(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

/** Parse a comma-separated origin list, trimming and dropping empties. */
function parseOriginListEnv(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0)
}

export function loadConfig(): ServerConfig {
  const mapDir = path.resolve(root, process.env['MAP_DIR']!)
  // QUEST_MAP_DIR is the primary name; QUESTS_DIR is accepted as a fallback
  // for anyone who deployed against the earlier name.
  const questsDirEnv = process.env['QUEST_MAP_DIR'] ?? process.env['QUESTS_DIR']
  return {
    port: parseInt(process.env['PORT'] ?? '8080', 10),
    mapDir,
    mapFile: process.env['MAP_FILE'] || undefined,
    housesUrl: process.env['HOUSES_URL'] || undefined,
    readOnly: parseBoolEnv(process.env['READ_ONLY']),
    questsDir: questsDirEnv ? path.resolve(root, questsDirEnv) : path.join(mapDir, 'quests'),
    viewerAllowedOrigins: parseOriginListEnv(process.env['VIEWER_ALLOWED_ORIGINS']),
  }
}
