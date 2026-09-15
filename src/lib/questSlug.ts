/**
 * Quest slug validation, mirrored from server/lib/quests.ts so the client can
 * reject an obviously-bad slug before ever making a request. The server is
 * the actual security boundary (this is UX only), so keep the pattern
 * identical rather than importing across the client/server split.
 */
export const QUEST_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const QUEST_SLUG_MAX_LENGTH = 100

export function isValidQuestSlug(slug: unknown): slug is string {
  return typeof slug === 'string'
    && slug.length > 0
    && slug.length <= QUEST_SLUG_MAX_LENGTH
    && QUEST_SLUG_PATTERN.test(slug)
}

export type ViewerMode =
  | { mode: 'editor' }
  | { mode: 'quest'; quest: string }
  | { mode: 'invalid-quest'; reason: string }

/**
 * Read the viewer mode from a URL query string. Defaults to the existing
 * writable local editor only when `viewer` is absent. Once a caller requests
 * any viewer mode, malformed/unknown values must fail closed instead of
 * exposing the writable editor through a broken embed URL.
 */
export function parseViewerModeSearch(search: string): ViewerMode {
  const params = new URLSearchParams(search)
  const viewer = params.get('viewer')
  if (viewer === null) {
    return { mode: 'editor' }
  }
  if (viewer !== 'quest') {
    return { mode: 'invalid-quest', reason: 'Unknown viewer mode.' }
  }
  const quest = params.get('quest')
  if (!isValidQuestSlug(quest)) {
    return { mode: 'invalid-quest', reason: 'A valid quest slug is required.' }
  }
  return { mode: 'quest', quest }
}
