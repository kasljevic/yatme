/**
 * Whether a request reached this server through the public portal.
 *
 * The portal attaches X-Portal-Auth (an HMAC over "<tenant>.<timestamp>") to
 * every request it forwards to a home-placed component, and nothing on the LAN
 * sends that header. So its presence is a reliable "this came from a public
 * visitor" signal, and its absence means the caller is on the same network as
 * the map file -- which is where editing is meant to happen.
 *
 * Deliberately not a signature check. This is a backstop behind the portal's
 * own verb refusal, and its job is to fail closed on anything portal-shaped: a
 * forged or expired header still gets refused, which is the safe direction. The
 * portal is the component that must not be fooled about identity, and it
 * verifies nothing here -- it signs.
 */
export function isPortalOriginated(headers: Record<string, unknown>): boolean {
  const v = headers['x-portal-auth']
  if (Array.isArray(v)) return v.length > 0
  return typeof v === 'string' && v.length > 0
}

/** The refusal body, so both write routes answer identically. */
export const READ_ONLY_THROUGH_PORTAL = {
  error: 'The map is read-only through the portal',
}
