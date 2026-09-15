import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// `config.ts` reads ASSETS_DIR/MAP_DIR at module-evaluation time (top-level
// `path.resolve(root, process.env[...]!)`), so those env vars must be set
// before the module is first imported. Static imports are hoisted ahead of
// any statement in this file, so we set them here and load the module
// dynamically inside each test instead of via a static `import`.
const originalEnv = { ...process.env }

describe('loadConfig', () => {
  let mapDir: string

  beforeEach(() => {
    mapDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-config-test-'))
    process.env['ASSETS_DIR'] = path.join(process.cwd(), 'server')
    process.env['MAP_DIR'] = mapDir
    delete process.env['QUEST_MAP_DIR']
    delete process.env['QUESTS_DIR']
    delete process.env['VIEWER_ALLOWED_ORIGINS']
    delete process.env['READ_ONLY']
    delete process.env['MAP_FILE']
    delete process.env['HOUSES_URL']
    delete process.env['PORT']
  })

  afterEach(() => {
    fs.rmSync(mapDir, { recursive: true, force: true })
    process.env = { ...originalEnv }
  })

  it('defaults readOnly to false', async () => {
    const { loadConfig } = await import('./config.ts')
    expect(loadConfig().readOnly).toBe(false)
  })

  it('defaults questsDir to <mapDir>/quests when QUEST_MAP_DIR is unset', async () => {
    const { loadConfig } = await import('./config.ts')
    expect(loadConfig().questsDir).toBe(path.join(mapDir, 'quests'))
  })

  it.each(['1', 'true', 'TRUE', 'True', 'yes', 'on', ' true '])(
    'parses READ_ONLY=%s as true',
    async (value) => {
      const { loadConfig } = await import('./config.ts')
      process.env['READ_ONLY'] = value
      expect(loadConfig().readOnly).toBe(true)
    },
  )

  it.each(['0', 'false', '', 'nope', 'undefined'])(
    'parses READ_ONLY=%s as false',
    async (value) => {
      const { loadConfig } = await import('./config.ts')
      process.env['READ_ONLY'] = value
      expect(loadConfig().readOnly).toBe(false)
    },
  )

  it('honours an explicit QUEST_MAP_DIR override, resolved against cwd', async () => {
    const { loadConfig } = await import('./config.ts')
    process.env['QUEST_MAP_DIR'] = './some-quests-dir'
    expect(loadConfig().questsDir).toBe(path.resolve(process.cwd(), './some-quests-dir'))
  })

  it('falls back to QUESTS_DIR when QUEST_MAP_DIR is unset (backward compatibility)', async () => {
    const { loadConfig } = await import('./config.ts')
    process.env['QUESTS_DIR'] = './legacy-quests-dir'
    expect(loadConfig().questsDir).toBe(path.resolve(process.cwd(), './legacy-quests-dir'))
  })

  it('prefers QUEST_MAP_DIR over QUESTS_DIR when both are set', async () => {
    const { loadConfig } = await import('./config.ts')
    process.env['QUEST_MAP_DIR'] = './new-quests-dir'
    process.env['QUESTS_DIR'] = './legacy-quests-dir'
    expect(loadConfig().questsDir).toBe(path.resolve(process.cwd(), './new-quests-dir'))
  })

  it('defaults viewerAllowedOrigins to an empty array when VIEWER_ALLOWED_ORIGINS is unset', async () => {
    const { loadConfig } = await import('./config.ts')
    expect(loadConfig().viewerAllowedOrigins).toEqual([])
  })

  it('parses a comma-separated VIEWER_ALLOWED_ORIGINS, trimming whitespace and dropping empties', async () => {
    const { loadConfig } = await import('./config.ts')
    process.env['VIEWER_ALLOWED_ORIGINS'] = ' https://example.com , https://cms.example.com ,,'
    expect(loadConfig().viewerAllowedOrigins).toEqual(['https://example.com', 'https://cms.example.com'])
  })

  it('leaves mapDir/mapFile/housesUrl/port behaviour unchanged (backward compatibility)', async () => {
    const { loadConfig } = await import('./config.ts')
    process.env['MAP_FILE'] = 'custom.otbm'
    process.env['HOUSES_URL'] = 'http://houses.internal'
    process.env['PORT'] = '9090'
    const config = loadConfig()
    expect(config.mapDir).toBe(path.resolve(mapDir))
    expect(config.mapFile).toBe('custom.otbm')
    expect(config.housesUrl).toBe('http://houses.internal')
    expect(config.port).toBe(9090)
  })
})
