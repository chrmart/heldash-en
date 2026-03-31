import { FastifyRequest } from 'fastify'

/**
 * Returns the caller's group ID for visibility filtering.
 * - null  → admin (no visibility filtering needed)
 * - string → the group ID to filter by (defaults to 'grp_guest' for unauthenticated)
 */
export async function callerGroupId(req: FastifyRequest): Promise<string | null> {
  try {
    await req.jwtVerify()
    if (req.user.role === 'admin') return null
    return req.user.groupId ?? 'grp_guest'
  } catch {
    return 'grp_guest'
  }
}

/** Returns true if the URL is a valid http or https URL. */
export function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
