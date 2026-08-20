/** Condensed-type heading used to open every section of the page. */
export function SectionHeader({
  title,
  subtitle,
  id,
}: {
  title: string
  subtitle?: string
  id?: string
}) {
  return (
    <div id={id} className="mb-4 border-b border-line pb-2">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide text-foreground sm:text-3xl">
        {title}
      </h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
  )
}
