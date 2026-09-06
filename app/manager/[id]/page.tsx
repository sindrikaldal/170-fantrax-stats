import { notFound } from 'next/navigation'
import { loadAllSeasonViews } from '@/app/lib/season-view'
import { managerIndex } from '@/app/lib/manager-view'
import { managerSeasonStats } from '@/app/lib/manager-season'
import { resolveManagers } from '@/lib/stats/managers'
import { headToHeadMatrix, nemesisAndBunny, revengeFixtures } from '@/lib/stats/rivalries'
import { SectionHeader } from '@/app/components/SectionHeader'
import { CrestImage } from '@/app/components/CrestImage'
import { ManagerRivals } from '@/app/components/manager/ManagerRivals'
import { ManagerSeasonCard } from '@/app/components/manager/ManagerSeasonCard'
import { RevengeWeek } from '@/app/components/rivalries/RevengeWeek'

/**
 * One manager across every season: rivalries, grudge fixtures, and a card
 * per season with their prize money, near misses, luck and bench regret.
 *
 * Keyed by manager id rather than a per-season teamId, because a manager
 * is the thing that persists — Fantrax issues new team ids every season.
 */
export default async function ManagerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  const now = new Date()

  const views = await loadAllSeasonViews(now)
  const seasons = views.map((v) => v.season)
  const resolution = resolveManagers(seasons)
  const manager = resolution.managers.find((m) => m.managerId === id)
  if (!manager) notFound()

  const managers = [...managerIndex(resolution, seasons).values()]
  const card = managers.find((m) => m.managerId === id)
  const matrix = headToHeadMatrix(seasons, resolution, now)
  const verdict = nemesisAndBunny(matrix).find((v) => v.managerId === id)
  const revenge = revengeFixtures(seasons, resolution, now)

  const perSeason = [...manager.teams]
    .sort((a, b) => b.seasonYear - a.seasonYear)
    .flatMap((t) => {
      const view = views.find((v) => v.year === t.seasonYear)
      return view ? [managerSeasonStats(view, t.teamId, now)] : []
    })
  const renamed = manager.teams.filter((t) => t.teamName !== manager.displayName)

  return (
    <main className="container-page py-10 sm:py-14">
      <header className="mb-10 border-b border-line pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-analysis">Manager</p>
        <h1 className="mt-1 flex min-w-0 items-center gap-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          <CrestImage url={card?.logoUrl ?? null} name={manager.displayName} size="h-6 w-6" />
          <span className="min-w-0 truncate">{manager.displayName}</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          {manager.teams.length === 1 ? 'Season' : 'Seasons'}{' '}
          {manager.teams.map((t) => t.seasonYear).join(', ')}
          {renamed.length > 0 &&
            ` · formerly ${renamed.map((t) => `${t.teamName} (${t.seasonYear})`).join(', ')}`}
        </p>
      </header>

      <section className="space-y-10">
        <SectionHeader title="Rivalries" subtitle="Every meeting, every season." />
        <ManagerRivals managerId={id} matrix={matrix} verdict={verdict} managers={managers} />
        <RevengeWeek fixtures={revenge} managers={managers} focusManagerId={id} />
      </section>

      <section className="mt-14 space-y-6">
        <SectionHeader title="Season by season" subtitle="Money, near misses, luck and regret." />
        {perSeason.map((stats) => (
          <ManagerSeasonCard key={stats.view.year} stats={stats} />
        ))}
      </section>
    </main>
  )
}
