'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  GATE_COOKIE,
  gateToken,
  passwordMatches,
  resolveGate,
  safeNextPath,
} from '@/lib/auth/gate'

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

/**
 * Checks the submitted password and, if it is right, plants the gate cookie.
 *
 * The password itself is never stored anywhere — the cookie holds an HMAC of
 * a fixed message keyed by the password, so changing `SITE_PASSWORD` logs
 * everybody out without any server-side session state to clear.
 *
 * `redirect` throws to unwind, so none of these calls may sit inside a
 * try/catch.
 */
export async function login(formData: FormData) {
  const gate = resolveGate({
    password: process.env.SITE_PASSWORD,
    isProduction: process.env.NODE_ENV === 'production',
  })

  const next = safeNextPath(formData.get('next')?.toString())

  // `open` means development with no password configured, so there is nothing
  // to check. `closed` is unreachable here — the proxy refuses every request,
  // including this POST — but redirecting is the safe fallback either way.
  if (gate.mode !== 'guarded') redirect(next)

  const supplied = formData.get('password')
  const correct =
    typeof supplied === 'string' && passwordMatches({ supplied, password: gate.password })

  if (!correct) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`)
  }

  const cookieStore = await cookies()
  cookieStore.set(GATE_COOKIE, gateToken(gate.password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_IN_SECONDS,
  })

  redirect(next)
}
