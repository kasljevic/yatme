/**
 * Allowed-origin handling for the quest viewer's postMessage bridge.
 *
 * The allowlist is a *server* runtime setting (`VIEWER_ALLOWED_ORIGINS`), not
 * a Vite build-time value: the frontend is typically built once and then
 * deployed by many different self-hosters, each embedding the viewer under a
 * different domain, so baking the allowlist into the JS bundle at build time
 * would make it unconfigurable for anyone using a prebuilt image. Instead
 * the viewer fetches it from the server at startup (see
 * `fetchQuestOriginAllowlist`) and the bridge is only wired up once that
 * settles.
 *
 * Fails closed throughout: if the server has no allowlist configured, or the
 * config endpoint can't be reached at all, the only trusted origin is the
 * page's own origin, so cross-origin embedding must be explicitly opted into
 * by whoever deploys the server.
 */

/** Parse a comma-separated origin allowlist, trimming and dropping empties. */
export function parseOriginAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0)
}

/** Resolve a configured allowlist to what the bridge should actually trust. */
export function resolveQuestOrigins(configuredOrigins: string[]): string[] {
  if (configuredOrigins.length > 0) return configuredOrigins
  return [window.location.origin]
}

export function isAllowedQuestOrigin(origin: string, allowlist: string[]): boolean {
  return allowlist.includes(origin)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * Fetch the server-configured origin allowlist at runtime.
 *
 * Falls back to `resolveQuestOrigins([])` (same-origin only) on any failure:
 * network error, non-2xx response, or a response that doesn't match the
 * expected `{ allowedOrigins: string[] }` shape. A misconfigured or
 * unreachable config endpoint must never widen trust.
 */
export async function fetchQuestOriginAllowlist(): Promise<string[]> {
  try {
    const response = await fetch('/api/quest-config')
    if (!response.ok) return resolveQuestOrigins([])
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null) return resolveQuestOrigins([])
    const allowedOrigins = (data as Record<string, unknown>)['allowedOrigins']
    if (!isStringArray(allowedOrigins)) return resolveQuestOrigins([])
    return resolveQuestOrigins(allowedOrigins)
  } catch {
    return resolveQuestOrigins([])
  }
}
