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
    /**
     * Which renderer Fantrax picked for this gameweek's table. It differs
     * between a gameweek with published results and one still holding
     * placeholder zeros, which is the only per-gameweek signal in this
     * response that a gameweek has actually been scored. Optional so that
     * a Fantrax change degrades to the date-based rule instead of breaking.
     */
    tableType: z.string().optional(),
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

/** ---------- fxpa/req getTeamRosterInfo, timeframe BY_PERIOD ---------- */

/**
 * A stat cell. Observed as `{ content: "13.5" }`; a bare string is accepted
 * too so a Fantrax simplification does not break parsing.
 */
const RosterCellSchema = z.union([z.object({ content: z.string() }).passthrough(), z.string()])

const RosterHeaderCellSchema = z
  .object({
    name: z.string(),
    shortName: z.string().optional(),
    key: z.string().optional(),
  })
  .passthrough()

/**
 * A roster row. Rows for empty lineup slots carry no `scorer`, and the
 * per-table totals row carries a `scorer` without a `scorerId`; only rows
 * with a `scorerId` describe a player.
 */
const RosterRowSchema = z
  .object({
    scorer: z
      .object({
        scorerId: z.string().optional(),
        name: z.string().optional(),
        shortName: z.string().optional(),
        posShortNames: z.string().optional(),
      })
      .passthrough()
      .optional(),
    /** "1" active, "2" reserve, "y" a totals row. */
    statusId: z.string().optional(),
    posId: z.string().nullable().optional(),
    eligiblePosIds: z.array(z.string()).optional(),
    cells: z.array(RosterCellSchema),
  })
  .passthrough()

const RosterTableSchema = z
  .object({
    header: z.object({ cells: z.array(RosterHeaderCellSchema) }).passthrough(),
    rows: z.array(RosterRowSchema),
  })
  .passthrough()

export const RosterInfoResponseSchema = z
  .object({
    responses: z
      .array(
        z
          .object({
            data: z
              .object({
                displayedSelections: z
                  .object({
                    displayedPeriod: z.number(),
                    displayedFantasyTeamId: z.string().optional(),
                    displayedSeasonOrProjection: z
                      .object({ timeframeTypeCode: z.string() })
                      .passthrough(),
                  })
                  .passthrough(),
                tables: z.array(RosterTableSchema),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()

export type RawRosterInfoResponse = z.infer<typeof RosterInfoResponseSchema>
