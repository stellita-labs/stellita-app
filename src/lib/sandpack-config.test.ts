import { describe, expect, it } from 'vitest'
import { SANDPACK_TEMPLATE, TAILWIND_CDN, sandpackTheme } from './project'

describe('sandpack preview configuration', () => {
  it('pins the classic react-ts template the preview renders', () => {
    expect(SANDPACK_TEMPLATE).toBe('react-ts')
  })

  it('loads Tailwind from its CDN (the classic bundler ignores an index.html script)', () => {
    expect(TAILWIND_CDN).toBe('https://cdn.tailwindcss.com')
  })

  it('exposes a theme carrying the Stellita accent colour', () => {
    expect(sandpackTheme.colors?.accent).toBe('#D9A400')
  })
})
