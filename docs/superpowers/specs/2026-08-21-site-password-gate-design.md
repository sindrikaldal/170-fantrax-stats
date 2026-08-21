# Site password gate

**Date:** 2026-08-21
**Status:** Approved

## Problem

The stats site is deployed publicly on Vercel with no access control. The
league's ledger names real people and real money owed. The goal is not
security in any meaningful sense — it is to deter casual discovery by anyone
who is not in the league. Explicitly: "just to deter 99% of people."

Vercel's built-in Password Protection is a paid add-on and not available on
the current plan, so the gate is implemented in application code.

## Non-goals

These are deliberately excluded. They are the wrong shape for a shared
password among roughly a dozen friends, and each one adds a failure mode:

- Per-user accounts or identities
- Logout, session expiry, or token rotation
- Rate limiting or lockout on failed attempts
- Any protection against a league member sharing the password

## Approach

HTTP Basic authentication enforced in `proxy.ts`, against a single shared
password read from the `SITE_PASSWORD` environment variable.

Basic auth was chosen over a styled login page with a signed cookie because
it needs no UI, no cookie signing, and no session state — the browser's own
credential manager handles persistence. The cost is an unstyled native
prompt and no logout, both acceptable here.

A secret-in-URL scheme (`?key=...`) was considered and rejected: the secret
would leak through shared links, browser history, and referrer headers.

## Next.js 16 convention

Middleware is named **`proxy.ts`** as of Next.js 16 (verified in
`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). It
lives at the project root, exports a function named `proxy` or a default
export, and runs on the Node.js runtime. Setting the `runtime` config option
in a proxy file throws.

## Structure

Framework glue is separated from decision logic so the decision logic can be
unit tested without booting Next. This follows the purity discipline already
established for `lib/stats/` (project invariant #3).

| File | Responsibility |
| --- | --- |
| `lib/auth/basic.ts` | Pure decision functions. No `process.env`, no `NextRequest`. |
| `lib/auth/basic.test.ts` | Unit tests for the decision table. |
| `proxy.ts` | Adapter: reads env, calls the pure functions, builds a `NextResponse`. |

### `lib/auth/basic.ts`

```ts
type Gate =
  | { mode: 'open' }
  | { mode: 'closed' }
  | { mode: 'guarded'; password: string }

resolveGate(input: { password: string | undefined; isProduction: boolean }): Gate

checkCredentials(input: { authorizationHeader: string | null; password: string }): boolean
```

`resolveGate` encodes the missing-secret rule as a total function of two
booleans, so every branch is enumerable in tests. It returns a discriminated
union rather than a bare string so that the `guarded` case carries the
password: the caller then gets a narrowed `string` from the compiler instead
of needing a non-null assertion.

`checkCredentials` parses the `Authorization` header, requires the `Basic`
scheme, base64-decodes the credentials, splits on the **first** colon only
(passwords may contain colons; usernames may not), ignores the username
entirely, and compares the password.

Comparison uses `crypto.timingSafeEqual` over UTF-8 buffers, guarded by a
length check because `timingSafeEqual` throws on length mismatch. This is
three lines and removes a class of question rather than requiring a judgment
call about whether timing attacks matter here.

## Behaviour

### Gate modes

| `SITE_PASSWORD` | Environment | Mode | Result |
| --- | --- | --- | --- |
| set (non-empty) | any | `guarded` | Credentials required |
| unset or empty | development | `open` | All requests pass through |
| unset or empty | production | `closed` | `503` on every request |

`closed` exists so that a forgotten environment variable on Vercel fails
loudly rather than silently serving the site to the world. Its response body
names the missing variable in plain text. An empty-string password is
treated as unset, not as a password that everyone knows.

`open` in development means `npm run dev` needs no setup and is never
prompted.

Verified during implementation: `next start` pins `NODE_ENV` to `production`
regardless of what the surrounding environment sets, so `open` mode is
unreachable in a production server even if `NODE_ENV` is tampered with. The
only way to reach `open` is an actual `next dev`.

### Guarded responses

- Valid credentials → `NextResponse.next()`.
- Missing, malformed, or wrong credentials → `401` with
  `WWW-Authenticate: Basic realm="170 Broskis"`, which triggers the browser's
  native prompt and its offer to save the credentials.
- Any username is accepted. There is one secret to share, not two.

### Matcher

`proxy.ts` exports **no** `config.matcher`. The gate therefore covers every
request, including `_next/static`, `_next/image`, and `public/`.

The conventional reason to exclude static assets is that they are harmless.
The reasons not to, here: a matcher regex is a place to be subtly wrong, and
excluding assets buys nothing under Basic auth — once the browser holds
credentials it sends them on every subsequent request regardless. The cost is
one proxy invocation per asset request, which is irrelevant at this traffic
level.

On Vercel the proxy runs before the CDN cache, so a cached page cannot be
served to an unauthenticated visitor.

## Testing

`lib/auth/basic.test.ts` covers:

- `resolveGate`: all four combinations of password-present × is-production,
  plus empty string treated as absent.
- `checkCredentials`: correct password; wrong password; absent header;
  non-`Basic` scheme (e.g. `Bearer`); malformed base64; header with no colon
  in the decoded credentials; password containing a colon; empty password
  supplied by the client.

No network calls, consistent with the existing suite.

## Documentation changes

`AGENTS.md` invariant #1 currently reads "No authentication, anywhere" and
forbids cookies, API keys, and `.env` secrets. As written it would forbid
this feature. The invariant being protected is actually about *upstream*
access: the Fantrax league is public-readable, so the app must never hold
Fantrax credentials.

The section is rescoped to say that, and the site gate is recorded as an
explicit, bounded exception: one environment variable, `SITE_PASSWORD`, which
gates the site's own pages and has nothing to do with how Fantrax data is
fetched.

## Deployment

`SITE_PASSWORD` must be added in the Vercel dashboard for the Production and
Preview environments. Until it is, production returns `503` by design.

`.env.example` is added with an empty `SITE_PASSWORD=` so the variable is
discoverable. `.gitignore` covers `.env` and `.env*.local` but not
`.env.example`, so it is committed.
