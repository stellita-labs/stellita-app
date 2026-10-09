import { useEffect, useState } from 'react'

/** Phone breakpoint — matches Tailwind's `md` (768px). Below this we render the
 *  mobile layout; at/above it the desktop layout renders untouched. */
export const MOBILE_QUERY = '(max-width: 767px)'

/**
 * True when the viewport is phone-sized (< md). Drives the desktop↔mobile layout
 * switch so we render ONE tree, never both — critical because the workspace
 * preview is Sandpack (a heavy iframe/bundler) that must mount exactly once.
 *
 * The initial value is read lazily (no setState in an effect) to avoid a flash
 * and to satisfy the repo's `react-hooks/set-state-in-effect` rule.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
