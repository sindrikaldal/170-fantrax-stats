'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A crest that always renders something.
 *
 * Fantrax hands out generic placeholder icons (gloves, jerseys, a shoe) to
 * teams that never uploaded a logo, and those URLs now 404 — 23 of them on
 * the 2025 season page alone. A null `logoUrl` we can detect on the server;
 * a URL that resolves to nothing we cannot, which is why this leaf is a
 * client component: only the browser knows the load failed.
 *
 * The fallback is a monogram rather than a generic glyph, so a team without
 * a badge still reads as that team down a column of ten.
 *
 * It takes a resolved URL, never a `SeasonData` — passing the season into a
 * client component would serialize the whole thing into the RSC payload
 * once per crest.
 */

/** Sized to sit optically inside the tile, per crest size actually used. */
const TEXT_FOR_SIZE: Record<string, string> = {
  'h-4 w-4': 'text-[7px]',
  'h-5 w-5': 'text-[8px]',
  'h-6 w-6': 'text-[9px]',
}

function monogram(name: string): string {
  const alnum = (w: string) => [...w].filter((c) => /\p{L}|\p{N}/u.test(c))
  const words = name.trim().split(/\s+/).filter((w) => alnum(w).length > 0)
  // Two initials from the first two words; for a one-word name, the first
  // two of its own letters — a lone "A" tells you nothing in a column of
  // ten, and several of these teams are single words.
  const letters =
    words.length >= 2
      ? words.slice(0, 2).map((w) => alnum(w)[0]).join('')
      : alnum(words[0] ?? name).slice(0, 2).join('')
  return (letters || '?').toUpperCase()
}

export function CrestImage({
  url,
  name,
  size = 'h-5 w-5',
}: {
  url: string | null
  name: string
  size?: string
}) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  // `onError` alone is not enough. These images are server-rendered and
  // most of them have already finished failing by the time React hydrates,
  // and React does not replay an error that fired before it attached the
  // handler — so the broken-image glyph would just sit there. Checking
  // `complete && naturalWidth === 0` on mount catches exactly that case;
  // onError still covers anything that fails afterwards.
  useEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth === 0) setFailed(true)
  }, [url])

  if (!url || failed) {
    return (
      <span
        aria-hidden
        title={name}
        className={`${size} ${TEXT_FOR_SIZE[size] ?? 'text-[8px]'} flex shrink-0 select-none items-center justify-center rounded-sm bg-raised font-semibold leading-none tracking-tight text-muted`}
      >
        {monogram(name)}
      </span>
    )
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      ref={ref}
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded-sm object-cover`}
    />
  )
}
