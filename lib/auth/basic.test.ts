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
    expect(checkCredentials({ authorizationHeader: basic('anyone', 'hunter3'), password })).toBe(
      false,
    )
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
