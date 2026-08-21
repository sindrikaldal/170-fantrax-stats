# Login page gate

**Date:** 2026-08-21
**Status:** Implemented
**Supersedes:** `2026-08-21-site-password-gate-design.md` (HTTP Basic prompt)

## Problem

The site was gated with HTTP Basic, which works but shows the browser's
unstyled native credential dialog. The gate should look like the rest of the
site: a login screen with a single password field.

The threat model is unchanged and deliberately modest — deter casual
discovery of a page that names real people and real money. Not defence
against a determined attacker.

## What carried over unchanged

- `resolveGate` and its three modes: `guarded` when `SITE_PASSWORD` is set,
  `open` in development when it is not, `closed` (503) in production when it
  is not. An empty string counts as unset.
- Constant-time secret comparison via `crypto.timingSafeEqual`, with the
  length check first because it throws on length mismatch.
- Enforcement in `proxy.ts` (Next.js 16's renamed middleware), on the Node.js
  runtime, with no `runtime` config option set.

## What changed

`checkCredentials` and the `WWW-Authenticate` 401 are gone. In their place:
a cookie, a login page, and a Server Action.

**This removes `curl -u user:password` access.** There are no scripts or
uptime monitors hitting the site today, but anything added later would need
to carry the cookie instead.

## The cookie

Value is `HMAC-SHA256(key = SITE_PASSWORD, message = "170-broskis-gate-v1")`,
hex, in a cookie named `broskis_gate`. The proxy recomputes it per request and
compares in constant time.

Keying the HMAC with the password itself, rather than introducing a separate
signing secret, buys three things:

- No second environment variable to manage or rotate.
- The cookie never contains the password.
- Changing `SITE_PASSWORD` invalidates every outstanding cookie for free —
  no session store, no revocation list, nothing to clear server-side.

The message carries a `-v1` suffix so all cookies can be invalidated without
changing the password.

Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production,
`Max-Age` one year. A year because there is no logout and no appetite for
re-prompting a dozen friends; rotating the password remains the revocation
mechanism.

## The allowlist

`proxy.ts` allows two things without a cookie: `/login`, and
`/_next/static/**`. Everything else redirects to `/login?next=<path>`.

`/_next/static` has to be public because the login page inherits the root
layout, so without its stylesheet and self-hosted fonts it renders unstyled.
**This is a real reduction from the Basic-auth version**, where the gate
covered every byte: the compiled CSS and JS chunks are now publicly
fetchable, exposing app structure. No league data is in them — everything
that reads Fantrax lives behind a gated route, and those routes' RSC payloads
are gated with them.

`/_next/image` is deliberately *not* allowlisted: only crests on gated pages
use it.

The allowlist is a function with comments rather than an exported
`config.matcher` regex, because each entry needs justifying and because a
matcher regex that is subtly wrong fails open.

Order matters: the `closed` check runs *before* the allowlist, so a
deployment with no `SITE_PASSWORD` returns 503 even for `/login`. A login
form that cannot verify what it collects should not be served.

## The login page

`app/login/page.tsx`, a server component. Fraunces masthead, one
`type="password"` input with `autoComplete="current-password"` and autofocus,
submit button, built on the existing `paper`/`ink`/`line`/`down` tokens.
`robots: noindex, nofollow` in its metadata.

**No client JavaScript.** It is a plain form posting to a Server Action, so it
works before hydration and anywhere a form can be submitted.

Wrong password redirects to `/login?error=1&next=…`, which renders an inline
error with `role="alert"`, a red border, and `aria-invalid` on the field.
Rendering the error from a query parameter rather than component state is
what keeps the page free of client JS.

`SiteNav` early-returns on `/login`. Every link in it needs the password, so
showing it there would offer a row of redirects back to the form. The
alternative — moving the routes into a `(site)` route group with its own
layout — is more idiomatic and keeps the nav ignorant of auth, but costs file
moves and leaves the 404 page without nav.

## Open redirect

`safeNextPath` sanitises the post-login destination, applied both in the
action and when rendering the hidden field. Without it,
`/login?next=https://evil.example` turns the login screen into an open
redirector.

Only site-absolute paths survive: exactly one leading slash, no backslash
(some browsers normalise `/\evil.example` into a protocol-relative URL), no
whitespace or control characters. `/login` itself is rejected, since
redirecting there after a successful login would loop.

## Testing

`lib/auth/gate.test.ts` covers `resolveGate` (all four password × environment
combinations plus empty string), `gateToken` (determinism, shape, that it
excludes the password, that it changes with the password), `tokenMatches`
(correct, wrong, absent, empty, truncated, right-length garbage, and the raw
password used as a cookie value), `passwordMatches`, and `safeNextPath`
against every rejection rule above.

End-to-end verification against a production build confirmed: gated route
redirects with an encoded `next`; `/login` and `/_next/static` reachable
without a cookie; wrong password sets no cookie; correct password sets the
cookie with the documented attributes and lands on `next`; the cookie then
opens every gated route; a forged 64-character cookie is rejected;
`next=https://evil.example` redirects to `/` and is sanitised in the markup;
`/login` with a valid cookie returns 200 rather than looping; and `closed`
mode 503s every route including `/login`.

Enter-to-submit is guaranteed by HTML implicit submission (single-line input
plus a `type="submit"` button inside the form) and was confirmed via
`form.requestSubmit()`, which is what the Enter key invokes. Synthetic
keypresses from browser automation do not trigger it, since they are not
trusted events.
