import { timingSafeEqual } from 'node:crypto'

/**
 * Whether the site gate is active, deliberately bypassed, or misconfigured.
 * A discriminated union rather than a bare string so the `guarded` case can
 * carry the password and give callers a narrowed `string`.
 */
export type Gate =
  | { mode: 'open' }
  | { mode: 'closed' }
  | { mode: 'guarded'; password: string }

/**
 * Decides what the gate does, given the configured password and environment.
 *
 * A missing password fails closed in production: a forgotten environment
 * variable on Vercel must be loud, not silently serve the site to the world.
 * In development it opens, so `npm run dev` needs no setup. An empty string
 * counts as missing, never as a password everyone knows.
 */
export function resolveGate({
  password,
  isProduction,
}: {
  password: string | undefined
  isProduction: boolean
}): Gate {
  if (password) return { mode: 'guarded', password }
  return { mode: isProduction ? 'closed' : 'open' }
}

/**
 * Constant-time comparison of two secrets.
 *
 * timingSafeEqual throws when the buffers differ in length, so the length
 * check has to come first. That leaks the password's length, which is an
 * acceptable trade for a shared league password.
 */
function secretsMatch(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Validates an HTTP Basic `Authorization` header against the shared password.
 * The username is ignored entirely — there is one secret to share, not two.
 */
export function checkCredentials({
  authorizationHeader,
  password,
}: {
  authorizationHeader: string | null
  password: string
}): boolean {
  if (!authorizationHeader) return false

  const [scheme, encoded] = authorizationHeader.split(' ')
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return false

  // Buffer.from(_, 'base64') never throws: invalid characters are skipped.
  // Garbage therefore decodes to garbage, which fails the checks below.
  const decoded = Buffer.from(encoded, 'base64').toString('utf8')

  // Split on the first colon only: usernames cannot contain one, but
  // passwords can.
  const separator = decoded.indexOf(':')
  if (separator === -1) return false

  return secretsMatch(decoded.slice(separator + 1), password)
}
