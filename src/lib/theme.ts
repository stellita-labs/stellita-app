import { useSyncExternalStore } from 'react'

/** Light / dark theme, persisted in localStorage and applied as the `.stx-dark`
 *  class on <html> (see index.css for the palette both themes point at). An
 *  inline script in index.html applies the saved theme before first paint to
 *  avoid a flash; this module keeps it in sync at runtime. */
export type Theme = 'light' | 'dark'

/** localStorage key shared with the inline pre-paint script in index.html. The
 *  two MUST stay in sync or users get a flash of the wrong theme on every load. */
export const THEME_STORAGE_KEY = 'stellita_theme'

const listeners = new Set<() => void>()

/** Read the persisted theme: the applied DOM class wins, then localStorage.
 *  Exported so the key/value contract is testable. Never throws. */
export function readStoredTheme(): Theme {
  if (
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('stx-dark')
  ) {
    return 'dark'
  }
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

let current: Theme = readStoredTheme()

export function getTheme(): Theme {
  return current
}

export function setTheme(theme: Theme): void {
  current = theme
  document.documentElement.classList.toggle('stx-dark', theme === 'dark')
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // private mode / storage disabled — theme still applies for this session
  }
  listeners.forEach((l) => l())
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark')
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Reactive theme value + a toggle. All consumers stay in sync. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light' as Theme)
  return { theme, toggle: toggleTheme }
}
