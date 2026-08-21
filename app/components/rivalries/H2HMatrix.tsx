'use client'

import { useState } from 'react'
import type { ManagerId } from '@/lib/domain/types'
import type { HeadToHead } from '@/lib/stats/rivalries'
import type { ManagerCard } from '../../lib/manager-view'
import { CrestImage } from '../CrestImage'
import { formatScore } from '../../lib/format'

/** Strongest tint applied to the most lopsided pairing on the board. */
const MAX_TINT_PCT = 26

function signed(n: number): string {
  const s = formatScore(Math.abs(n))
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : '0'
}


/**
 * Manager x manager grid of every real meeting, aggregated. Cells carry a
 * diverging tint — money for a positive aggregate margin, analysis for a
 * negative one — scaled against the most lopsided pairing on the board.
 *
 * Tints only, never a solid fill: at the strongest step the cell is still
 * ~74% paper, so the ink label stays far above 4.5:1. A saturated scale
 * would force per-cell text colour switching and put the least readable
 * cells exactly where the most interesting numbers are.
 *
 * This is the one component allowed to scroll horizontally on a phone, and
 * it scrolls inside its own container — the page body never does.
 */
export function H2HMatrix({
  matrix,
  managers,
}: {
  matrix: HeadToHead[]
  managers: ManagerCard[]
}) {
  const [selected, setSelected] = useState<{ a: ManagerId; b: ManagerId } | null>(null)

  const byPair = new Map(matrix.map((h) => [`${h.managerId}|${h.opponentId}`, h]))
  const cardById = new Map(managers.map((m) => [m.managerId, m]))

  // Only managers who have actually played someone belong on the axes; the
  // rest are surfaced by NemesisBunny's "no history yet" list instead of
  // padding the grid with empty rows.
  const present = new Set(matrix.map((h) => h.managerId))
  const totalMargin = new Map<ManagerId, number>()
  for (const h of matrix) {
    totalMargin.set(h.managerId, (totalMargin.get(h.managerId) ?? 0) + h.aggregateMargin)
  }
  // Best aggregate first, so dominance reads top-left and the tint forms a
  // gradient across the diagonal instead of scattering.
  const axis = managers
    .filter((m) => present.has(m.managerId))
    .sort(
      (a, b) =>
        (totalMargin.get(b.managerId) ?? 0) - (totalMargin.get(a.managerId) ?? 0) ||
        a.name.localeCompare(b.name, 'is'),
    )

  if (axis.length === 0) return null

  const maxAbs = Math.max(...matrix.map((h) => Math.abs(h.aggregateMargin)), 1)

  const tint = (margin: number) => {
    const pct = (Math.min(Math.abs(margin) / maxAbs, 1) * MAX_TINT_PCT).toFixed(1)
    const token = margin > 0 ? 'var(--money)' : 'var(--analysis)'
    return { backgroundColor: `color-mix(in srgb, ${token} ${pct}%, var(--surface))` }
  }

  const open = selected ? byPair.get(`${selected.a}|${selected.b}`) : undefined

  return (
    /*
      The grid is only as wide as the league is big — ten managers make an
      ~840px table inside a 1200px column, which left the bordered box
      stretched with a third of it empty. `w-fit` shrinks the box onto the
      table and `mx-auto` centres it; `max-w-full` hands the width back on
      a phone, where the inner container scrolls instead. The caption and
      the scoreline panel share the wrapper so they stay aligned to the
      grid rather than to the page.
    */
    <div className="mx-auto w-fit max-w-full">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="border-collapse text-sm">
          <caption className="sr-only">
            Head-to-head aggregate margin, every manager against every other. Read a row
            left to right: positive means that manager is up on the opponent overall.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 border-b border-r border-line bg-surface px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted"
              >
                Manager
              </th>
              {axis.map((m) => (
                <th
                  key={m.managerId}
                  scope="col"
                  className="w-16 border-b border-line px-1 py-2 align-bottom"
                >
                  <span className="flex flex-col items-center gap-1">
                    <CrestImage url={m?.logoUrl ?? null} name={m?.name ?? ''} />
                    <span className="max-w-[3.5rem] truncate text-[10px] font-medium text-muted">
                      {m.shortName}
                    </span>
                  </span>
                  <span className="sr-only">{m.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axis.map((row) => (
              <tr key={row.managerId}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-2 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <CrestImage url={row?.logoUrl ?? null} name={row?.name ?? ''} />
                    <span className="max-w-[9rem] truncate" title={row.name}>
                      {row.name}
                    </span>
                  </span>
                </th>
                {axis.map((col) => {
                  if (row.managerId === col.managerId) {
                    return (
                      <td
                        key={col.managerId}
                        className="border-b border-line bg-raised text-center text-muted"
                      >
                        <span aria-hidden>&middot;</span>
                        <span className="sr-only">Same manager</span>
                      </td>
                    )
                  }
                  const h = byPair.get(`${row.managerId}|${col.managerId}`)
                  if (!h) {
                    return (
                      <td
                        key={col.managerId}
                        className="border-b border-line text-center text-xs text-muted"
                      >
                        <span aria-hidden>&mdash;</span>
                        <span className="sr-only">Never met</span>
                      </td>
                    )
                  }
                  const isOpen =
                    selected?.a === row.managerId && selected?.b === col.managerId
                  return (
                    <td key={col.managerId} className="border-b border-line p-0">
                      <button
                        type="button"
                        onClick={() =>
                          setSelected(
                            isOpen ? null : { a: row.managerId, b: col.managerId },
                          )
                        }
                        aria-pressed={isOpen}
                        aria-label={`${row.name} versus ${col.name}: ${h.wins} won, ${h.draws} drawn, ${h.losses} lost, aggregate ${signed(h.aggregateMargin)}. Show the ${h.meetings.length} meetings.`}
                        style={tint(h.aggregateMargin)}
                        className={`h-11 w-16 cursor-pointer text-center tabular-nums transition-[outline] hover:outline hover:outline-2 hover:outline-offset-[-2px] hover:outline-ink/30 ${
                          isOpen ? 'outline outline-2 outline-offset-[-2px] outline-ink' : ''
                        }`}
                      >
                        <span aria-hidden className="text-xs font-medium">
                          {signed(h.aggregateMargin)}
                        </span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted">
        Aggregate margin across every meeting, from the row manager&rsquo;s point of view.
        Pick a cell for the scorelines.
      </p>

      {open && (
        <MeetingList
          h={open}
          rowName={cardById.get(open.managerId)?.name ?? open.managerId}
          colName={cardById.get(open.opponentId)?.name ?? open.opponentId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/**
 * The scorelines behind one cell. Rendered below the grid rather than
 * expanded inside it: a row that grows mid-table shoves every other cell
 * sideways, and on a phone the expansion would open inside the horizontal
 * scroller where it cannot be read.
 */
function MeetingList({
  h,
  rowName,
  colName,
  onClose,
}: {
  h: HeadToHead
  rowName: string
  colName: string
  onClose: () => void
}) {
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="font-display text-lg font-semibold tracking-tight text-ink">
          {rowName} <span className="text-muted">vs.</span> {colName}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-muted underline underline-offset-2 hover:text-ink"
        >
          Close
        </button>
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {h.wins}&ndash;{h.draws}&ndash;{h.losses} over {h.meetings.length} meeting
        {h.meetings.length === 1 ? '' : 's'} &middot; aggregate{' '}
        <span className={h.aggregateMargin >= 0 ? 'text-money' : 'text-analysis'}>
          {signed(h.aggregateMargin)}
        </span>
      </p>
      <ul className="mt-3 divide-y divide-line">
        {[...h.meetings].reverse().map((m) => {
          const result = m.margin > 0 ? 'W' : m.margin < 0 ? 'L' : 'D'
          const color =
            result === 'W' ? 'text-up' : result === 'L' ? 'text-down' : 'text-muted'
          return (
            <li
              key={`${m.seasonYear}-${m.period}`}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <span className={`w-4 shrink-0 font-semibold ${color}`} aria-hidden>
                {result}
              </span>
              <span className="w-20 shrink-0 tabular-nums text-muted">
                GW{m.period} &rsquo;{String(m.seasonYear).slice(2)}
              </span>
              <span className="tabular-nums">
                <span className={m.margin > 0 ? 'font-semibold' : ''}>
                  {formatScore(m.forScore)}
                </span>
                <span className="mx-1.5 text-muted">&ndash;</span>
                <span className={m.margin < 0 ? 'font-semibold' : ''}>
                  {formatScore(m.againstScore)}
                </span>
              </span>
              <span className="sr-only">
                {result === 'W' ? 'Won' : result === 'L' ? 'Lost' : 'Drew'} by{' '}
                {formatScore(Math.abs(m.margin))}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
