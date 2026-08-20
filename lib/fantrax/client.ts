import {
  LeagueInfoSchema,
  ScheduleResponseSchema,
  StandingsSchema,
  type RawLeagueInfo,
  type RawScheduleResponse,
  type RawStandings,
} from './schemas'

const FXEA = 'https://www.fantrax.com/fxea/general'
const FXPA = 'https://www.fantrax.com/fxpa/req'

/** Revalidation window for live season data, in seconds. */
const LIVE_TTL = 1800

class FantraxError extends Error {
  constructor(endpoint: string, cause: string) {
    super(`Fantrax request failed (${endpoint}): ${cause}`)
    this.name = 'FantraxError'
  }
}

async function getJson(url: string, endpoint: string, ttl: number): Promise<unknown> {
  const res = await fetch(url, { next: { revalidate: ttl } })
  if (!res.ok) throw new FantraxError(endpoint, `HTTP ${res.status}`)
  return res.json()
}

export async function fetchLeagueInfo(leagueId: string): Promise<RawLeagueInfo> {
  // Schedule and settings are immutable once the season starts; cache hard.
  const json = await getJson(
    `${FXEA}/getLeagueInfo?leagueId=${leagueId}`,
    'getLeagueInfo',
    86400,
  )
  return LeagueInfoSchema.parse(json)
}

export async function fetchStandings(leagueId: string): Promise<RawStandings> {
  const json = await getJson(
    `${FXEA}/getStandings?leagueId=${leagueId}`,
    'getStandings',
    LIVE_TTL,
  )
  return StandingsSchema.parse(json)
}

/** Returns every gameweek's matchup scores in a single request. */
export async function fetchSchedule(leagueId: string): Promise<RawScheduleResponse> {
  const res = await fetch(`${FXPA}?leagueId=${leagueId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgs: [{ method: 'getStandings', data: { leagueId, view: 'SCHEDULE' } }],
    }),
    next: { revalidate: LIVE_TTL },
  })
  if (!res.ok) throw new FantraxError('fxpa getStandings', `HTTP ${res.status}`)
  return ScheduleResponseSchema.parse(await res.json())
}
