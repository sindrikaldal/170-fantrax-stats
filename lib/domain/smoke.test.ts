import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('fixtures', () => {
  it('the 2025 schedule fixture is present and parseable', () => {
    const raw = readFileSync('test/fixtures/2025/fxpa-getStandings-schedule.json', 'utf8')
    const json = JSON.parse(raw)
    expect(json.responses[0].data.tableList).toHaveLength(35)
  })
})
