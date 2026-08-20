'use client'

import { useEffect, useRef, useState } from 'react'

const DURATION_MS = 900

/**
 * `format` is a keyword, not a function: this component is rendered from
 * server components (LedgerTable, AwardsStrip), and functions cannot cross
 * the server/client boundary as props.
 */
type CountUpFormat = 'isk' | 'plain'

/**
 * Deliberately not `Intl.NumberFormat('is-IS')` here (that's `lib/format.ts`'s
 * `isk`, used everywhere this value is server-rendered only). This component
 * is a Client Component: Next.js renders it once on the server and again on
 * the client during hydration, and those two passes can land on different
 * ICU data for the same locale (observed: "52.500" server, "52,500"
 * client) — a hydration-mismatch bug, not a formatting preference. A plain
 * grouping regex has no locale dependency, so both passes always agree.
 */
function formatIsk(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function render(n: number, format: CountUpFormat): string {
  return format === 'isk' ? formatIsk(n) : String(n)
}

/**
 * Animates a number counting up from 0 the first time it scrolls into
 * view. The final value is what gets server-rendered and is exactly what
 * shows before hydration and under `prefers-reduced-motion: reduce` — the
 * count-up is a pure enhancement, never load-bearing for correctness.
 */
export function CountUp({
  value,
  format = 'plain',
}: {
  value: number
  format?: CountUpFormat
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(value)
  const startedRef = useRef(false)

  useEffect(() => {
    // Keep the server-rendered final value in sync if it changes (e.g. a
    // client-side navigation re-renders with fresh data) without
    // re-triggering the animation.
    if (!startedRef.current) setDisplay(value)
  }, [value])

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let rafId: number | null = null

    const observer = new IntersectionObserver(
      (entries) => {
        if (startedRef.current) return
        if (!entries.some((e) => e.isIntersecting)) return
        startedRef.current = true
        observer.disconnect()

        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min((now - start) / DURATION_MS, 1)
          const eased = 1 - (1 - t) ** 3
          if (t < 1) {
            setDisplay(Math.round(value * eased))
            rafId = requestAnimationFrame(tick)
          } else {
            setDisplay(value)
          }
        }
        rafId = requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [value])

  return <span ref={ref}>{render(display, format)}</span>
}
