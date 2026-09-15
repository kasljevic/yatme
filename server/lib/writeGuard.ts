import type { ServerConfig } from '../config.ts'
import { isPortalOriginated, READ_ONLY_THROUGH_PORTAL } from './portalOrigin.ts'

/** Body returned when the server is explicitly configured as read-only. */
export const READ_ONLY_SERVER_MODE = {
  error: 'This server is configured as read-only',
}

export interface WriteRejection {
  status: number
  body: unknown
}

/**
 * Whether a write (POST) request to a map or sidecar route must be refused,
 * and the response to send if so — otherwise null.
 *
 * The explicit `READ_ONLY` config is checked first and always wins: it is an
 * operator's deliberate choice (e.g. a quest-viewer-only deployment) and must
 * hold regardless of how the request arrived. The portal-origin heuristic
 * remains as the existing backstop for the public-portal deployment, so a
 * server that is not configured read-only still refuses portal-forwarded
 * writes exactly as before.
 */
export function rejectWrite(config: ServerConfig, headers: Record<string, unknown>): WriteRejection | null {
  if (config.readOnly) return { status: 403, body: READ_ONLY_SERVER_MODE }
  if (isPortalOriginated(headers)) return { status: 403, body: READ_ONLY_THROUGH_PORTAL }
  return null
}
