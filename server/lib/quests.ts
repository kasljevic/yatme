import fs from 'node:fs'
import path from 'node:path'

/**
 * Kebab-case quest slug: lowercase letters/digits, single hyphens between
 * segments, no leading/trailing hyphen. Matches the naming style already
 * used for map files in this repo (e.g. "thais-abdendriel-carlin-venore").
 */
export const QUEST_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SLUG_LENGTH = 100

export function isValidQuestSlug(slug: unknown): slug is string {
  return typeof slug === 'string'
    && slug.length > 0
    && slug.length <= MAX_SLUG_LENGTH
    && QUEST_SLUG_PATTERN.test(slug)
}

/**
 * Resolve the OTBM file for a quest slug within the allowlisted quests
 * directory. Returns null — never throws — for an invalid slug, a path that
 * would escape the directory, or a slug with no matching file, so callers can
 * treat every failure mode identically (404) without leaking which case hit.
 */
export function resolveQuestOtbmPath(questsDir: string, slug: unknown): string | null {
  return resolveWithinQuestsDir(questsDir, slug, (s) => `${s}.otbm`)
}

/**
 * Resolve a sidecar file for a quest. Sidecars follow the map's own naming
 * convention: "<slug>-<kind>.xml" (e.g. "<slug>-house.xml"), directly inside
 * the quests directory — so a sidecar for one quest can never be addressed
 * using another quest's slug.
 */
export function resolveQuestSidecarPath(questsDir: string, slug: unknown, name: unknown): string | null {
  if (!isValidQuestSlug(slug)) return null
  if (typeof name !== 'string' || name.length === 0) return null
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return null
  if (!name.startsWith(`${slug}-`) || !name.endsWith('.xml')) return null

  return resolveWithinQuestsDir(questsDir, slug, () => name)
}

function resolveWithinQuestsDir(
  questsDir: string,
  slug: unknown,
  filenameFor: (slug: string) => string,
): string | null {
  if (!isValidQuestSlug(slug)) return null

  const resolvedRoot = path.resolve(questsDir)
  const filename = filenameFor(slug)
  const candidate = path.resolve(resolvedRoot, filename)

  // Defense in depth: the validated slug/name patterns above cannot themselves
  // produce "..", "/" or "\", but this containment check is what actually
  // guards against path traversal, so it must not depend on those patterns
  // never being loosened in the future.
  const isContained = candidate === resolvedRoot || candidate.startsWith(resolvedRoot + path.sep)
  if (!isContained) return null

  let isFile: boolean
  try {
    isFile = fs.statSync(candidate).isFile()
  } catch {
    return null
  }
  if (!isFile) return null

  // Second layer of defense: `fs.statSync` above follows symlinks, so a
  // lexically-contained candidate could still be a symlink whose *target*
  // resolves outside `questsDir` (e.g. a malicious/mistaken "<slug>.otbm"
  // symlink pointing at "/etc/passwd" or a sibling quest owner's private
  // file). Resolve both the candidate and the root to their real,
  // symlink-free paths and re-check containment before trusting the file —
  // the lexical `candidate` (not the realpath) is still what's returned, so
  // callers keep seeing the expected "<slug>.otbm"/"<slug>-<kind>.xml"
  // filename, but only after the real target has been verified safe.
  try {
    const realCandidate = fs.realpathSync(candidate)
    const realRoot = fs.realpathSync(resolvedRoot)
    const isReallyContained = realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep)
    if (!isReallyContained) return null
  } catch {
    return null
  }

  return candidate
}

/** Sidecar files belonging to a quest — filtered by the "<slug>-" naming prefix. */
export function discoverQuestSidecars(questsDir: string, slug: string): string[] {
  try {
    const prefix = `${slug}-`
    return fs.readdirSync(questsDir).filter(e => e.startsWith(prefix) && e.endsWith('.xml'))
  } catch {
    return []
  }
}

/** All valid quest slugs discoverable in the quests directory (for diagnostics/health). */
export function listQuestSlugs(questsDir: string): string[] {
  try {
    return fs.readdirSync(questsDir)
      .filter(e => e.endsWith('.otbm'))
      .map(e => e.slice(0, -'.otbm'.length))
      .filter(isValidQuestSlug)
  } catch {
    return []
  }
}
