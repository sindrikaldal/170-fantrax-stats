# Site Password Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the whole site behind a single shared password supplied via HTTP Basic auth, to deter casual discovery by anyone outside the league.

**Architecture:** A root `proxy.ts` (Next.js 16's renamed middleware) intercepts every request and enforces HTTP Basic auth against `process.env.SITE_PASSWORD`. All decision logic lives in pure functions in `lib/auth/basic.ts` that never read `process.env` or touch a `NextRequest`, so the decision table is unit-testable without booting Next. `proxy.ts` is a thin adapter over those functions.

**Tech Stack:** Next.js 16.3.1 (App Router), TypeScript, vitest, Node.js `node:crypto`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-site-password-gate-design.md`

## Global Constraints

- **Next.js 16 renamed middleware to Proxy.** The file MUST be `proxy.ts` at the project root (sibling of `app/`), exporting a function named `proxy` or a default export. A file named `middleware.ts` will not run. Verified in `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **Never set `runtime` in `proxy.ts`.** Proxy defaults to the Node.js runtime; setting the `runtime` config option in a proxy file throws at build time.
- **No `config.matcher` export.** Deliberate: the gate covers every request including `_next/static`, `_next/image`, and `public/`. Do not add one as a "fix".
- **No new npm dependencies.** `node:crypto` and `next/server` cover everything.
- **Code style, matching the existing codebase:** no semicolons, single quotes, 2-space indent, named exports, `@/` path alias for cross-directory imports.
- **Test style:** vitest, `import { describe, it, expect } from 'vitest'`, files named `*.test.ts` colocated beside the module under test. No network calls.
- **Environment variable name is exactly `SITE_PASSWORD`.**
- **Realm string is exactly `170 Broskis`.**
- **Dev server runs on port 3001** — port 3000 on this machine is occupied by an unrelated nginx.
- **Never modify anything under `test/fixtures/`.** Those are irreplaceable captured API responses.
- Verify with `npm test` (57 tests pass before this work; expect 57 + the new ones) and `npx tsc --noEmit`.

---

### Task 1: Pure auth decision core

**Files:**
- Create: `lib/auth/basic.ts`
- Test: `lib/auth/basic.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, both consumed by Task 2:
  - `type Gate = { mode: 'open' } | { mode: 'closed' } | { mode: 'guarded'; password: string }`
  - `resolveGate(input: { password: string | undefined; isProduction: boolean }): Gate`
  - `checkCredentials(input: { authorizationHeader: string | null; password: string }): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/auth/basic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveGate, checkCredentials } from '@/lib/auth/basic'

/** Builds an HTTP Basic Authorization header value. */
function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
}

describe('resolveGate', () => {
  it('guards when a password is set, in either environment', () => {
    expect(resolveGate({ password: 'hunter2', isProduction: true })).toEqual({
      mode: 'guarded',
      password: 'hunter2',
    })
    expect(resolveGate({ password: 'hunter2', isProduction: false })).toEqual({
      mode: 'guarded',
      password: 'hunter2',
    })
  })

  it('fails closed in production when the password is missing', () => {
    // A forgotten env var on Vercel must not silently publish the site.
    expect(resolveGate({ password: undefined, isProduction: true })).toEqual({ mode: 'closed' })
  })

  it('opens in development when the password is missing', () => {
    // `npm run dev` needs no setup.
    expect(resolveGate({ password: undefined, isProduction: false })).toEqual({ mode: 'open' })
  })

  it('treats an empty password as unset, not as a password everyone knows', () => {
    expect(resolveGate({ password: '', isProduction: true })).toEqual({ mode: 'closed' })
    expect(resolveGate({ password: '', isProduction: false })).toEqual({ mode: 'open' })
  })
})

describe('checkCredentials', () => {
  const password = 'hunter2'

  it('accepts the correct password regardless of username', () => {
    expect(checkCredentials({ authorizationHeader: basic('anyone', password), password })).toBe(true)
    expect(checkCredentials({ authorizationHeader: basic('', password), password })).toBe(true)
  })

  it('rejects a wrong password', () => {
    expect(checkCredentials({ authorizationHeader: basic('anyone', 'hunter3'), password })).toBe(false)
  })

  it('rejects a password that is a prefix or extension of the real one', () => {
    expect(checkCredentials({ authorizationHeader: basic('a', 'hunter'), password })).toBe(false)
    expect(checkCredentials({ authorizationHeader: basic('a', 'hunter22'), password })).toBe(false)
  })

  it('rejects an absent header', () => {
    expect(checkCredentials({ authorizationHeader: null, password })).toBe(false)
  })

  it('rejects a non-Basic scheme', () => {
    expect(checkCredentials({ authorizationHeader: `Bearer ${password}`, password })).toBe(false)
  })

  it('accepts the Basic scheme case-insensitively, per RFC 7235', () => {
    const encoded = Buffer.from(`a:${password}`, 'utf8').toString('base64')
    expect(checkCredentials({ authorizationHeader: `basic ${encoded}`, password })).toBe(true)
  })

  it('rejects a header with a scheme but no credentials', () => {
    expect(checkCredentials({ authorizationHeader: 'Basic', password })).toBe(false)
    expect(checkCredentials({ authorizationHeader: 'Basic ', password })).toBe(false)
  })

  it('rejects credentials with no colon separator', () => {
    const encoded = Buffer.from('nocolonhere', 'utf8').toString('base64')
    expect(checkCredentials({ authorizationHeader: `Basic ${encoded}`, password })).toBe(false)
  })

  it('rejects garbage that is not valid base64', () => {
    expect(checkCredentials({ authorizationHeader: 'Basic !!!not base64!!!', password })).toBe(false)
  })

  it('splits on the first colon only, so passwords may contain colons', () => {
    const colonful = 'a:b:c'
    expect(
      checkCredentials({ authorizationHeader: basic('user', colonful), password: colonful }),
    ).toBe(true)
  })

  it('rejects an empty password supplied by the client', () => {
    expect(checkCredentials({ authorizationHeader: basic('user', ''), password })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run lib/auth/basic.test.ts
```

Expected: FAIL — the module `@/lib/auth/basic` does not exist ("Failed to resolve import").

- [ ] **Step 3: Write the implementation**

Create `lib/auth/basic.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run lib/auth/basic.test.ts
```

Expected: PASS, all tests in both `describe` blocks.

If `rejects garbage that is not valid base64` fails, do not loosen the test: check that the decoded string genuinely lacks a colon. `Buffer.from('!!!not base64!!!', 'base64')` strips invalid characters rather than throwing, so the decode succeeds and the no-colon guard is what rejects it.

- [ ] **Step 5: Run the whole suite and the type checker**

```bash
npm test && npx tsc --noEmit
```

Expected: all pre-existing tests still pass (57 before this task), plus the new ones. No type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/basic.ts lib/auth/basic.test.ts
git commit -m "Add pure HTTP Basic auth decision core"
```

---

### Task 2: Wire the gate into the request path

**Files:**
- Create: `proxy.ts` (project root — sibling of `app/`, NOT inside it, and NOT named `middleware.ts`)
- Create: `.env.example`
- Modify: `AGENTS.md` — rescope invariant #1

**Interfaces:**
- Consumes from Task 1: `resolveGate` and `checkCredentials` from `@/lib/auth/basic`. The `Gate` type is inferred, so do not import it — an unused import will fail lint.
- Produces: nothing consumed by later tasks. This is the final task.

- [ ] **Step 1: Create the proxy**

Create `proxy.ts` at the project root:

```ts
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
```

- [ ] **Step 2: Verify the guarded path against a running server**

The pure core is unit-tested; this step verifies the wiring, which unit tests
cannot reach. Development mode is `open`, so set the variable explicitly to
force `guarded`:

```bash
SITE_PASSWORD=hunter2 npm run dev
```

In a second terminal, run each of these against port 3001:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/
```

Expected: `401`.

```bash
curl -si http://localhost:3001/ | grep -i www-authenticate
```

Expected: `www-authenticate: Basic realm="170 Broskis", charset="UTF-8"`

```bash
curl -s -o /dev/null -w '%{http_code}\n' -u 'anyone:hunter2' http://localhost:3001/
```

Expected: `200`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -u 'anyone:wrong' http://localhost:3001/
```

Expected: `401`.

Confirm static assets are gated too (the no-matcher decision):

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/_next/static/chunks/main-app.js
```

Expected: `401`. (Any `/_next/static/...` path works — a 404 would mean the
path is wrong, not that the gate leaked. `401` is the signal being checked.)

Then stop the server (Ctrl-C).

- [ ] **Step 3: Verify the open path in development**

```bash
npm run dev
```

With no `SITE_PASSWORD` set and no `.env.local` defining one:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/
```

Expected: `200`, no prompt. Then stop the server.

- [ ] **Step 4: Verify the closed path**

`next build` followed by `next start` runs with `NODE_ENV=production`:

```bash
npm run build && npm start -- --port 3001
```

Run with no `SITE_PASSWORD` in the environment:

```bash
curl -s -w '\n%{http_code}\n' http://localhost:3001/
```

Expected: the body `SITE_PASSWORD is not set. Refusing to serve this site unprotected.` and status `503`.

Then stop the server.

- [ ] **Step 5: Add `.env.example`**

```bash
cat > .env.example <<'EOF'
# Shared password for the site gate (HTTP Basic; any username works).
# Unset in development means no gate. Unset in production means 503.
SITE_PASSWORD=
EOF
```

Confirm it is not ignored — `.gitignore` covers `.env` and `.env*.local`, but
not `.env.example`:

```bash
git check-ignore -v .env.example; echo "exit=$?"
```

Expected: no output and `exit=1`, meaning the file is NOT ignored and will be
committed.

- [ ] **Step 6: Rescope `AGENTS.md` invariant #1**

The invariant currently reads "No authentication, anywhere" and forbids
cookies, API keys, and `.env` secrets. As written it forbids the feature just
built. The thing actually worth protecting is that the app holds no *Fantrax*
credentials. Replace the whole of invariant #1 — from the line
`**1. No authentication, anywhere.**` up to (but not including) the line
`**2. The normalization boundary.**` — with:

```markdown
**1. No Fantrax credentials, ever.** The Fantrax league is public-readable, so
there are deliberately no Fantrax cookies, API keys, or tokens anywhere in
this app. A private league plus a stored session cookie was considered and
rejected: it introduces a rotating secret and a silent-staleness failure mode.
If you find yourself adding a Fantrax credential, the approach is wrong.

Operational dependency: this rests on "Allow public to view league" being
enabled in Fantrax. If it is ever switched off, the app stops working.

The one bounded exception, and it is unrelated to fetching data: the site
itself is gated behind a single shared password (`SITE_PASSWORD`, HTTP Basic,
enforced in `proxy.ts`) purely to deter casual discovery, since the ledger
names real people and real money. It authenticates *visitors to this site*,
never requests *to Fantrax*. See
`docs/superpowers/specs/2026-08-21-site-password-gate-design.md`.
```

Verify the edit landed and the surrounding structure is intact:

```bash
sed -n '/^## These four break the app/,/^\*\*3\./p' AGENTS.md
```

Expected: the new invariant #1 text, then invariant #2 unchanged, then the
start of #3.

- [ ] **Step 7: Full verification**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tests pass, no type errors, no lint errors, build succeeds. The
build is included because a misplaced or misnamed proxy file, or a `runtime`
option in it, surfaces at build time rather than in tests.

- [ ] **Step 8: Commit**

```bash
git add proxy.ts .env.example AGENTS.md
git commit -m "Gate the site behind a shared password

Adds proxy.ts enforcing HTTP Basic against SITE_PASSWORD. Missing in
development means no gate; missing in production means 503, so a forgotten
env var cannot silently publish the site. Rescopes AGENTS.md invariant #1,
which forbade authentication outright, to what it actually protects: no
Fantrax credentials."
```

---

## Post-implementation: manual deploy step

Not code, and not something the implementer can do. Report it to the user:

`SITE_PASSWORD` must be set in the Vercel dashboard for the **Production**
and **Preview** environments (Project → Settings → Environment Variables),
then the project redeployed for the value to take effect. Until it is set,
those deployments return `503` by design. Preview deployments run with
`NODE_ENV=production`, so they fail closed the same way.
