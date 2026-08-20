/**
 * The locked empty-state copy: "Needs N more gameweeks. Patience." Every
 * gated stat component renders this instead of a confident wrong number
 * when it doesn't have enough settled gameweeks yet. Purely presentational
 * — deciding whether to render it (have >= needed) is the caller's job.
 */
export function EmptyState({
  needed,
  have,
  what,
}: {
  needed: number
  have: number
  what: string
}) {
  const remaining = Math.max(needed - have, 0)

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface px-6 py-8 text-center">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 opacity-70"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, var(--gold) 0, var(--gold) 10px, transparent 10px, transparent 20px)',
        }}
      />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{what}</p>
      <p className="mt-2 font-display text-xl font-extrabold uppercase tracking-wide text-foreground sm:text-2xl">
        Needs {remaining} more gameweek{remaining === 1 ? '' : 's'}.{' '}
        <span className="text-gold">Patience.</span>
      </p>
    </div>
  )
}
