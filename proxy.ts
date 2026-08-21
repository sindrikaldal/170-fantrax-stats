import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveGate, checkCredentials } from '@/lib/auth/basic'

const REALM = '170 Broskis'

const PLAIN_TEXT = { 'content-type': 'text/plain; charset=utf-8' }

/**
 * Gates the entire site behind one shared password (HTTP Basic).
 *
 * There is deliberately no `config.matcher`, so every request is covered —
 * including `_next/static`, `_next/image`, and `public/`. Excluding assets
 * would buy nothing under Basic auth, since the browser resends credentials
 * on every request once it has them, and a matcher regex is one more place
 * to be subtly wrong.
 *
 * Next.js 16 renamed middleware to Proxy; this file must stay named
 * `proxy.ts` at the project root. Proxy runs on the Node.js runtime, which
 * is what makes `node:crypto` available to the decision core.
 */
export function proxy(request: NextRequest) {
  const gate = resolveGate({
    password: process.env.SITE_PASSWORD,
    isProduction: process.env.NODE_ENV === 'production',
  })

  if (gate.mode === 'open') return NextResponse.next()

  if (gate.mode === 'closed') {
    return new NextResponse(
      'SITE_PASSWORD is not set. Refusing to serve this site unprotected.\n',
      { status: 503, headers: PLAIN_TEXT },
    )
  }

  const authorized = checkCredentials({
    authorizationHeader: request.headers.get('authorization'),
    password: gate.password,
  })

  if (authorized) return NextResponse.next()

  return new NextResponse('Authentication required.\n', {
    status: 401,
    headers: {
      // charset="UTF-8" (RFC 7617) tells the browser to encode the password
      // it collects as UTF-8, matching how the decision core decodes it.
      'www-authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      ...PLAIN_TEXT,
    },
  })
}
