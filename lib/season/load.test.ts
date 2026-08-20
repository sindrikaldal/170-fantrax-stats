import { describe, it, expect } from 'vitest'
import { prizeRuleApplies } from '@/lib/season/load'

describe('prizeRuleApplies', () => {
  it('applies from 2026 onward', () => {
    expect(prizeRuleApplies(2026)).toBe(true)
    expect(prizeRuleApplies(2027)).toBe(true)
  })

  it('does not apply to 2025, where the rule did not exist', () => {
    expect(prizeRuleApplies(2025)).toBe(false)
  })
})
