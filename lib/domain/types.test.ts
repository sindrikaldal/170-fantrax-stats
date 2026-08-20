import { describe, it, expect } from 'vitest'
import { LEAGUES, SEASON_YEARS } from '@/config/leagues'

describe('league config', () => {
  it('registers both seasons with their real league IDs', () => {
    expect(LEAGUES[2026]).toBe('ywhebyp7msyix1sj')
    expect(LEAGUES[2025]).toBe('7he4pkgpme8uz58b')
  })

  it('lists season years newest first', () => {
    expect(SEASON_YEARS).toEqual([2026, 2025])
  })
})
