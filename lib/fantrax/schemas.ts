import { z } from 'zod'

/** ---------- fxea/general/getLeagueInfo ---------- */

const ScoringPeriodSchema = z.object({
  number: z.number(),
  startDate: z.string(),
  endDate: z.string(),
})

const TeamInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const LeagueInfoSchema = z
  .object({
    leagueName: z.string(),
    seasonYear: z.number(),
    leagueHistoryId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    scoringPeriods: z.array(ScoringPeriodSchema),
    teamInfo: z.record(z.string(), TeamInfoSchema),
    playoffs: z
      .object({
        lastRegularSeasonPeriod: z.number(),
        firstPlayoffPeriod: z.number(),
        numPlayoffTeams: z.number(),
      })
      .passthrough(),
  })
  .passthrough()

export type RawLeagueInfo = z.infer<typeof LeagueInfoSchema>

/** ---------- fxpa/req getStandings, view SCHEDULE ---------- */

/**
 * A cell in a schedule row. Real team cells carry teamId; the
 * *League Average* pseudo-team cell does not. That absence is the
 * discriminator between a real fixture and an average fixture, and it is
 * structural rather than name-based, so it survives team renames.
 */
const ScheduleCellSchema = z
  .object({
    content: z.string(),
    teamId: z.string().optional(),
  })
  .passthrough()

const ScheduleRowSchema = z
  .object({
    cells: z.array(ScheduleCellSchema),
  })
  .passthrough()

const ScheduleTableSchema = z
  .object({
    caption: z.string(),
    rows: z.array(ScheduleRowSchema),
  })
  .passthrough()

const FantasyTeamInfoSchema = z
  .object({
    name: z.string(),
    shortName: z.string().optional(),
    logoUrl512: z.string().optional(),
  })
  .passthrough()

export const ScheduleResponseSchema = z
  .object({
    responses: z
      .array(
        z
          .object({
            data: z
              .object({
                tableList: z.array(ScheduleTableSchema),
                fantasyTeamInfo: z.record(z.string(), FantasyTeamInfoSchema),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()

export type RawScheduleResponse = z.infer<typeof ScheduleResponseSchema>

/** ---------- fxea/general/getStandings ---------- */

export const StandingsSchema = z.array(
  z
    .object({
      teamId: z.string(),
      teamName: z.string(),
      rank: z.number(),
      points: z.string(),
      totalPointsFor: z.number(),
      winPercentage: z.number(),
    })
    .passthrough(),
)

export type RawStandings = z.infer<typeof StandingsSchema>
