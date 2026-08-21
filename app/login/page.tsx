import type { Metadata } from 'next'
import { safeNextPath } from '@/lib/auth/gate'
import { login } from './actions'

export const metadata: Metadata = {
  title: 'Sign in — 170 Broskis',
  // The gate exists to keep the league's money talk off the open web; no
  // reason to help a crawler index the door either.
  robots: { index: false, follow: false },
}

/**
 * The password gate's front door.
 *
 * A plain server-rendered form posting to a Server Action: no client
 * JavaScript, so it works before hydration and on anything that can submit a
 * form. Sanitising `next` here as well as in the action keeps an arbitrary
 * attacker-supplied value from being reflected into the markup.
 */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const failed = params.error === '1'
  const next = safeNextPath(typeof params.next === 'string' ? params.next : undefined)

  return (
    <main className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          170 Broskis
        </h1>
        <p className="mt-2 text-sm text-muted">
          This one&rsquo;s just for the league. Enter the password to carry on.
        </p>

        <form action={login} className="mt-8 rounded-xl border border-line bg-surface p-5">
          <input type="hidden" name="next" value={next} />

          <label htmlFor="password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            aria-describedby={failed ? 'password-error' : undefined}
            aria-invalid={failed || undefined}
            className={`mt-2 w-full rounded-lg border bg-paper px-3 py-2.5 text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-analysis/40 ${
              failed ? 'border-down' : 'border-line focus:border-analysis'
            }`}
          />

          {failed && (
            <p id="password-error" role="alert" className="mt-2 text-sm text-down">
              That&rsquo;s not the password. Try again.
            </p>
          )}

          <button
            type="submit"
            className="mt-5 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-analysis/40"
          >
            Enter
          </button>
        </form>

        <p className="mt-4 text-xs text-muted">
          Ask in the league chat if you don&rsquo;t have it.
        </p>
      </div>
    </main>
  )
}
