'use client'

import { useEffect, useRef, useState } from 'react'
import { formatScore } from '../lib/format'

const DURATION_MS = 900

/**
 * `format` is a keyword, not a function: this component is rendered from
 * server components (AwardsStrip), and functions cannot cross the
 * server/client boundary as props.
 *
 * Money is deliberately NOT one of these — `LedgerTable` renders ISK
 * figures as static text, never through `CountUp`. A screenshot taken
 * mid-animation (this page exists to be screenshotted into a group chat)
 * would show the wrong amount, which the money-legibility constraint rules
 * out as a correctness bug, not a style trade-off. Animation stays only for
 * figures where a transient wrong value is harmless (award scores, etc).
 */
type CountUpFormat = 'score' | 'plain'

function render(n: number, format: CountUpFormat): string {
  return format === 'score' ? formatScore(n) : String(Math.round(n))
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
