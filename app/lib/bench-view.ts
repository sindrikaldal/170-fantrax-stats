import type { SeasonView } from './season-view'
import { readLineupSnapshots } from '@/lib/lineups/snapshot'
import { computeBench, type BenchReport } from '@/lib/stats/bench'

/**
 * The bench report for a season, from committed lineup snapshots only.
 *
 * Reading the snapshots is a disk read, never a Fantrax call. A malformed
 * committed file is a bug in the snapshot script, so it is logged and the
 * section renders as if no lineups were captured rather than taking the
 * page down.
 */
export function loadBenchReport(view: SeasonView, now: Date): BenchReport {
  let snapshots: ReturnType<typeof readLineupSnapshots> = []
  try {
    snapshots = readLineupSnapshots(view.year)
  } catch (err) {
    console.error(`Failed to read lineup snapshots for ${view.year}:`, err)
  }
  return computeBench(view.season, snapshots, now)
}
