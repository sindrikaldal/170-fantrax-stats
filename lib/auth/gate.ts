import { createHmac, timingSafeEqual } from 'node:crypto'

/** Name of the cookie holding proof that the password was entered. */
export const GATE_COOKIE = 'broskis_gate'

/**
 * Fixed HMAC message. Bump the version suffix to invalidate every outstanding
 * cookie without changing the password.
 */
const TOKEN_MESSAGE = '170-broskis-gate-v1'

/** Where to send someone whose requested destination is unusable. */
const HOME = '/'

/** The login route, which must never be a post-login destination. */
const LOGIN = '/login'

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
 * The cookie value proving someone knew the password.
 *
 * Keyed by the password itself, so there is no second secret to manage and
 * rotating `SITE_PASSWORD` invalidates every outstanding cookie for free. The
 * password is never stored in the cookie, and the token is deterministic, so
 * no session store is needed to verify it.
 */
export function gateToken(password: string): string {
  return createHmac('sha256', password).update(TOKEN_MESSAGE).digest('hex')
}

/**
 * Constant-time comparison of two secrets.
 *
 * timingSafeEqual throws when the buffers differ in length, so the length
 * check has to come first. Both sides here are fixed-length hex digests, so
 * that leaks nothing.
 */
function secretsMatch(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Whether a password typed into the login form is the configured one. */
export function passwordMatches({
  supplied,
  password,
}: {
  supplied: string
  password: string
}): boolean {
  return secretsMatch(supplied, password)
}

/** Whether a request's gate cookie proves knowledge of the password. */
export function tokenMatches({
  cookieValue,
  password,
}: {
  cookieValue: string | undefined
  password: string
}): boolean {
  if (!cookieValue) return false
  return secretsMatch(cookieValue, gateToken(password))
}

/**
 * Sanitises a post-login redirect target.
 *
 * Without this, `/login?next=https://evil.example` would turn the login
 * screen into an open redirector. Only site-absolute paths survive: one
 * leading slash, no backslash (some browsers normalise those to forward
 * slashes, so `/\evil.example` can escape the origin), and no whitespace or
 * control characters. `/login` itself is rejected because redirecting there
 * after a successful login would loop.
 */
export function safeNextPath(raw: string | undefined | null): string {
  if (!raw) return HOME
  if (!raw.startsWith('/')) return HOME
  if (raw.startsWith('//')) return HOME
  if (raw.includes('\\')) return HOME
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return HOME

  const path = raw.split('?')[0]
  if (path === LOGIN) return HOME

  return raw
}
