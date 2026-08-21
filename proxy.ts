import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { GATE_COOKIE, resolveGate, tokenMatches } from '@/lib/auth/gate'

const LOGIN_PATH = '/login'

const PLAIN_TEXT = { 'content-type': 'text/plain; charset=utf-8' }

/**
 * Paths reachable without the password.
 *
 * `/login` obviously. `/_next/static` because the login page inherits the
 * root layout, so without its stylesheet and fonts it renders unstyled — the
 * accepted cost of a real login page over an HTTP Basic prompt. These are
 * build artefacts with no league data in them; everything that reads Fantrax
 * lives behind a gated route.
 *
 * `/_next/image` is deliberately absent: only crests on gated pages use it.
 */
function isPublic(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname.startsWith('/_next/static/')
}

/**
 * Gates the site behind one shared password held in a cookie.
 *
 * There is deliberately no `config.matcher`. The allowlist above is an
 * explicit function rather than a regex in exported config because it needs a
 * comment explaining each entry, and because a matcher regex that is subtly
 * wrong fails open.
 *
 * Next.js 16 renamed middleware to Proxy; this file must stay named
 * `proxy.ts` at the project root. Proxy runs on the Node.js runtime, which is
 * what makes `node:crypto` available to the decision core.
 */
export function proxy(request: NextRequest) {
  const gate = resolveGate({
    password: process.env.SITE_PASSWORD,
    isProduction: process.env.NODE_ENV === 'production',
  })

  if (gate.mode === 'open') return NextResponse.next()

  // Checked before the allowlist: a misconfigured deployment must not serve
  // even the login page, or it would collect passwords it cannot verify.
  if (gate.mode === 'closed') {
    return new NextResponse(
      'SITE_PASSWORD is not set. Refusing to serve this site unprotected.\n',
      { status: 503, headers: PLAIN_TEXT },
    )
  }

  const { pathname, search } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const authorized = tokenMatches({
    cookieValue: request.cookies.get(GATE_COOKIE)?.value,
    password: gate.password,
  })

  if (authorized) return NextResponse.next()

  const login = new URL(LOGIN_PATH, request.url)
  login.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(login)
}
