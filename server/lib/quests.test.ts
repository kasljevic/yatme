import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  isValidQuestSlug,
  resolveQuestOtbmPath,
  resolveQuestSidecarPath,
  discoverQuestSidecars,
  listQuestSlugs,
} from './quests.ts'

/**
 * Feature-detect symlink support once, at collection time (not inside a
 * test/beforeAll), so `it.skipIf` sees a settled boolean before the test
 * tree is built. Creating symlinks requires elevated privileges on some
 * Windows configurations (no Developer Mode / SeCreateSymbolicLinkPrivilege)
 * — the symlink-escape tests below are skipped rather than failed in that
 * environment, per "a symlink test where supported".
 */
function canCreateSymlinks(): boolean {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-symlink-check-'))
  try {
    const target = path.join(dir, 'target.txt')
    const link = path.join(dir, 'link.txt')
    fs.writeFileSync(target, 'x')
    fs.symlinkSync(target, link, 'file')
    return true
  } catch {
    return false
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const symlinkSupported = canCreateSymlinks()


describe('isValidQuestSlug', () => {
  it.each(['thais-quest', 'a', 'quest2', 'a-b-c-1', 'thais-abdendriel-carlin-venore'])(
    'accepts %s',
    (slug) => {
      expect(isValidQuestSlug(slug)).toBe(true)
    },
  )

  it.each([
    ['empty string', ''],
    ['uppercase', 'Thais'],
    ['underscore', 'quest_1'],
    ['space', 'quest 1'],
    ['dot-dot', '../etc'],
    ['forward slash', 'a/b'],
    ['backslash', 'a\\b'],
    ['leading hyphen', '-quest'],
    ['trailing hyphen', 'quest-'],
    ['double hyphen', 'a--b'],
    ['too long', 'a'.repeat(101)],
  ])('rejects %s: %s', (_label, slug) => {
    expect(isValidQuestSlug(slug)).toBe(false)
  })

  it.each([123, null, undefined, {}, []])('rejects non-string input: %s', (slug) => {
    expect(isValidQuestSlug(slug)).toBe(false)
  })
})

describe('resolveQuestOtbmPath / resolveQuestSidecarPath / discovery', () => {
  let questsDir: string
  let outsideFile: string

  beforeAll(() => {
    questsDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-quests-lib-'))
    fs.writeFileSync(path.join(questsDir, 'thais-quest.otbm'), 'fake-otbm-bytes')
    fs.writeFileSync(path.join(questsDir, 'thais-quest-house.xml'), '<houses/>')
    fs.writeFileSync(path.join(questsDir, 'thais-quest-spawns.xml'), '<spawns/>')
    fs.writeFileSync(path.join(questsDir, 'other-quest.otbm'), 'other-bytes')
    fs.writeFileSync(path.join(questsDir, 'other-quest-house.xml'), '<houses/>')
    fs.mkdirSync(path.join(questsDir, 'a-directory.otbm'))

    // A sibling file outside the allowlisted directory, to prove traversal
    // attempts genuinely cannot reach it.
    outsideFile = path.join(path.dirname(questsDir), `outside-${path.basename(questsDir)}.otbm`)
    fs.writeFileSync(outsideFile, 'outside-bytes')

    if (symlinkSupported) {
      // A lexically-contained ".otbm"/sidecar filename whose *target*
      // escapes questsDir — this is exactly what the real-path containment
      // check in resolveWithinQuestsDir must catch, since fs.statSync alone
      // follows the symlink and would otherwise report it as a normal file.
      fs.symlinkSync(outsideFile, path.join(questsDir, 'evil-quest.otbm'), 'file')
      fs.symlinkSync(outsideFile, path.join(questsDir, 'thais-quest-evil.xml'), 'file')

      // A symlink whose target legitimately resolves *within* questsDir
      // should keep working — the containment check must not reject every
      // symlink, only ones that escape.
      fs.symlinkSync(
        path.join(questsDir, 'other-quest.otbm'),
        path.join(questsDir, 'aliased-quest.otbm'),
        'file',
      )
    }
  })

  afterAll(() => {
    fs.rmSync(questsDir, { recursive: true, force: true })
    fs.rmSync(outsideFile, { force: true })
  })

  it('resolves a valid slug to its otbm file', () => {
    expect(resolveQuestOtbmPath(questsDir, 'thais-quest')).toBe(path.join(questsDir, 'thais-quest.otbm'))
  })

  it('returns null for a slug with no matching file', () => {
    expect(resolveQuestOtbmPath(questsDir, 'no-such-quest')).toBeNull()
  })

  it('returns null for an invalid slug shape, without touching the filesystem', () => {
    expect(resolveQuestOtbmPath(questsDir, 'Thais-Quest')).toBeNull()
    expect(resolveQuestOtbmPath(questsDir, 'thais_quest')).toBeNull()
    expect(resolveQuestOtbmPath(questsDir, '')).toBeNull()
  })

  it('returns null for path traversal attempts disguised as a slug', () => {
    expect(resolveQuestOtbmPath(questsDir, '..')).toBeNull()
    expect(resolveQuestOtbmPath(questsDir, '../outside')).toBeNull()
    expect(resolveQuestOtbmPath(questsDir, 'a/../../outside')).toBeNull()
    expect(resolveQuestOtbmPath(questsDir, '..\\outside')).toBeNull()
  })

  it.skipIf(!symlinkSupported)(
    'returns null for an otbm filename that is a symlink escaping the quests directory (real-path containment)',
    () => {
      // "evil-quest.otbm" lexically resolves inside questsDir and passes
      // fs.statSync().isFile(), but its real target is outsideFile — the
      // real-path containment check must reject it.
      expect(resolveQuestOtbmPath(questsDir, 'evil-quest')).toBeNull()
    },
  )

  it.skipIf(!symlinkSupported)(
    'returns null for a sidecar filename that is a symlink escaping the quests directory (real-path containment)',
    () => {
      expect(resolveQuestSidecarPath(questsDir, 'thais-quest', 'thais-quest-evil.xml')).toBeNull()
    },
  )

  it.skipIf(!symlinkSupported)(
    'still resolves a symlink whose target legitimately resolves within the quests directory',
    () => {
      // Containment is checked against the real path, not "is a symlink at
      // all" — an intra-directory symlink (e.g. an alias/shared-asset
      // pattern) must keep working.
      expect(resolveQuestOtbmPath(questsDir, 'aliased-quest')).toBe(path.join(questsDir, 'aliased-quest.otbm'))
    },
  )

  it('returns null when the resolved path is a directory, not a file', () => {
    expect(resolveQuestOtbmPath(questsDir, 'a-directory')).toBeNull()
  })

  it('resolves a valid sidecar name for its own quest', () => {
    const resolved = resolveQuestSidecarPath(questsDir, 'thais-quest', 'thais-quest-house.xml')
    expect(resolved).toBe(path.join(questsDir, 'thais-quest-house.xml'))
  })

  it('refuses a sidecar name that belongs to a different quest', () => {
    expect(resolveQuestSidecarPath(questsDir, 'thais-quest', 'other-quest-house.xml')).toBeNull()
  })

  it('refuses a sidecar name containing traversal sequences', () => {
    expect(resolveQuestSidecarPath(questsDir, 'thais-quest', '../thais-quest-house.xml')).toBeNull()
    expect(resolveQuestSidecarPath(questsDir, 'thais-quest', 'thais-quest-house.xml/../../outside')).toBeNull()
  })

  it('refuses a sidecar name that is not an .xml file for the quest', () => {
    expect(resolveQuestSidecarPath(questsDir, 'thais-quest', 'thais-quest.otbm')).toBeNull()
  })

  it('discovers all sidecars matching the "<slug>-" prefix', () => {
    const sidecars = discoverQuestSidecars(questsDir, 'thais-quest').sort()
    // discoverQuestSidecars is a directory listing for diagnostics/headers
    // (not a trusted path-resolution step), so the "thais-quest-evil.xml"
    // symlink fixture — created only when symlinkSupported — legitimately
    // shows up here too; it is exercised as an escape attempt separately,
    // in the resolveQuestSidecarPath symlink test above.
    const expected = symlinkSupported
      ? ['thais-quest-evil.xml', 'thais-quest-house.xml', 'thais-quest-spawns.xml']
      : ['thais-quest-house.xml', 'thais-quest-spawns.xml']
    expect(sidecars).toEqual(expected)
  })

  it('lists all valid quest slugs discoverable in the directory', () => {
    // listQuestSlugs is diagnostics-only (not used for path resolution), and
    // filters by ".otbm" suffix without checking file-vs-directory — so the
    // "a-directory.otbm" directory created above is legitimately included,
    // as are the "evil-quest"/"aliased-quest" symlink fixtures when present.
    const slugs = listQuestSlugs(questsDir).sort()
    const expected = symlinkSupported
      ? ['a-directory', 'aliased-quest', 'evil-quest', 'other-quest', 'thais-quest']
      : ['a-directory', 'other-quest', 'thais-quest']
    expect(slugs).toEqual(expected)
  })

  it('returns an empty list for a missing quests directory rather than throwing', () => {
    const missing = path.join(questsDir, 'does-not-exist')
    expect(listQuestSlugs(missing)).toEqual([])
    expect(discoverQuestSidecars(missing, 'thais-quest')).toEqual([])
  })
})
