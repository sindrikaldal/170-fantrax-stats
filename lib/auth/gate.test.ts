import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  resolveGate,
  gateToken,
  tokenMatches,
  passwordMatches,
  safeNextPath,
  GATE_COOKIE,
} from '@/lib/auth/gate'

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

describe('gateToken', () => {
  it('is an HMAC of a fixed message keyed by the password', () => {
    const expected = createHmac('sha256', 'hunter2').update('170-broskis-gate-v1').digest('hex')
    expect(gateToken('hunter2')).toBe(expected)
  })

  it('is deterministic, so no session store is needed', () => {
    expect(gateToken('hunter2')).toBe(gateToken('hunter2'))
  })

  it('never contains the password itself', () => {
    expect(gateToken('hunter2')).not.toContain('hunter2')
  })

  it('changes completely when the password changes, invalidating old cookies', () => {
    expect(gateToken('hunter2')).not.toBe(gateToken('hunter3'))
  })

  it('is a 64-character hex string', () => {
    expect(gateToken('hunter2')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('tokenMatches', () => {
  const password = 'hunter2'

  it('accepts the token derived from the same password', () => {
    expect(tokenMatches({ cookieValue: gateToken(password), password })).toBe(true)
  })

  it('rejects a token derived from a different password', () => {
    expect(tokenMatches({ cookieValue: gateToken('hunter3'), password })).toBe(false)
  })

  it('rejects an absent cookie', () => {
    expect(tokenMatches({ cookieValue: undefined, password })).toBe(false)
  })

  it('rejects an empty cookie', () => {
    expect(tokenMatches({ cookieValue: '', password })).toBe(false)
  })

  it('rejects the raw password used as the cookie value', () => {
    // Someone who guesses the cookie's purpose should not be able to set it
    // to the password and get in without going through the form.
    expect(tokenMatches({ cookieValue: password, password })).toBe(false)
  })

  it('rejects a truncated token', () => {
    expect(tokenMatches({ cookieValue: gateToken(password).slice(0, 32), password })).toBe(false)
  })

  it('rejects garbage of the right length', () => {
    expect(tokenMatches({ cookieValue: 'x'.repeat(64), password })).toBe(false)
  })
})

describe('passwordMatches', () => {
  const password = 'hunter2'

  it('accepts the configured password', () => {
    expect(passwordMatches({ supplied: password, password })).toBe(true)
  })

  it('rejects a wrong password', () => {
    expect(passwordMatches({ supplied: 'hunter3', password })).toBe(false)
  })

  it('rejects a prefix or an extension of it', () => {
    expect(passwordMatches({ supplied: 'hunter', password })).toBe(false)
    expect(passwordMatches({ supplied: 'hunter22', password })).toBe(false)
  })

  it('rejects an empty submission', () => {
    expect(passwordMatches({ supplied: '', password })).toBe(false)
  })

  it('is case sensitive', () => {
    expect(passwordMatches({ supplied: 'Hunter2', password })).toBe(false)
  })
})

describe('safeNextPath', () => {
  it('keeps an ordinary in-site path', () => {
    expect(safeNextPath('/season/2026')).toBe('/season/2026')
  })

  it('keeps a path with a query string', () => {
    expect(safeNextPath('/season/2026?tab=luck')).toBe('/season/2026?tab=luck')
  })

  it('keeps the root', () => {
    expect(safeNextPath('/')).toBe('/')
  })

  it('falls back to root when absent or empty', () => {
    expect(safeNextPath(undefined)).toBe('/')
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath('')).toBe('/')
  })

  it('rejects a protocol-relative URL, which would leave the site', () => {
    expect(safeNextPath('//evil.example')).toBe('/')
    expect(safeNextPath('///evil.example')).toBe('/')
  })

  it('rejects an absolute URL', () => {
    expect(safeNextPath('https://evil.example')).toBe('/')
    expect(safeNextPath('http://evil.example/x')).toBe('/')
  })

  it('rejects a scheme with no slash prefix', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe('/')
    expect(safeNextPath('data:text/html,x')).toBe('/')
  })

  it('rejects a bare relative path, since it must be site-absolute', () => {
    expect(safeNextPath('season/2026')).toBe('/')
  })

  it('rejects backslashes, which some browsers normalise to forward slashes', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/')
    expect(safeNextPath('\\\\evil.example')).toBe('/')
  })

  it('rejects whitespace and control characters', () => {
    expect(safeNextPath('/foo\nbar')).toBe('/')
    expect(safeNextPath('/foo\rbar')).toBe('/')
    expect(safeNextPath('/foo\tbar')).toBe('/')
    expect(safeNextPath('/foo bar')).toBe('/')
  })

  it('never returns the login page itself, which would loop', () => {
    expect(safeNextPath('/login')).toBe('/')
    expect(safeNextPath('/login?error=1')).toBe('/')
  })
})

describe('GATE_COOKIE', () => {
  it('is a stable name the proxy and the login action agree on', () => {
    expect(GATE_COOKIE).toBe('broskis_gate')
  })
})
