/** Display-face heading used to open every section of the page. */
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
    <div id={id} className="mb-5 border-b border-line pb-3">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {title}
      </h2>
      {subtitle && <p className="prose-measure mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  )
}
