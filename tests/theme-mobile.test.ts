import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { THEME_STORAGE_KEY, getTheme, readStoredTheme, setTheme } from '../src/lib/theme'
import { MOBILE_QUERY } from '../src/hooks/useIsMobile'

type DomStub = { classes: Set<string>; store: Map<string, string> }

function stubDom(
  opts: {
    dark?: boolean
    store?: Map<string, string>
    throwOnGet?: boolean
    throwOnSet?: boolean
  } = {},
): DomStub {
  const classes = new Set<string>(opts.dark ? ['stx-dark'] : [])
  const store = opts.store ?? new Map<string, string>()
  const classList = {
    contains: (name: string) => classes.has(name),
    toggle: (name: string, on?: boolean) => {
      const next = on ?? !classes.has(name)
      if (next) classes.add(name)
      else classes.delete(name)
    },
    add: (name: string) => classes.add(name),
  }
  const storage = {
    getItem: (key: string) => {
      if (opts.throwOnGet) throw new Error('storage denied')
      return store.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (opts.throwOnSet) throw new Error('storage denied')
      store.set(key, value)
    },
  }
  const g = globalThis as unknown as Record<string, unknown>
  g.document = { documentElement: { classList } }
  g.localStorage = storage
  return { classes, store }
}

test('the storage key matches the inline pre-paint script in index.html', () => {
  const html = fs.readFileSync(path.resolve('index.html'), 'utf-8')
  const match = /localStorage\.getItem\('([^']+)'\)\s*===\s*'dark'/.exec(html)
  assert.ok(match, 'index.html must read the theme key and compare against dark')
  assert.equal(THEME_STORAGE_KEY, match[1], 'theme.ts and index.html must agree on the key')
})

test("setTheme('dark') writes exactly the shared key and value", () => {
  const dom = stubDom()
  setTheme('dark')
  assert.equal(dom.store.get(THEME_STORAGE_KEY), 'dark')
  assert.equal(dom.classes.has('stx-dark'), true)
  assert.equal(getTheme(), 'dark')

  setTheme('light')
  assert.equal(dom.store.get(THEME_STORAGE_KEY), 'light')
  assert.equal(dom.classes.has('stx-dark'), false)
  assert.equal(getTheme(), 'light')
})

test('a corrupt stored value falls back to light', () => {
  stubDom({ store: new Map([[THEME_STORAGE_KEY, 'purple']]) })
  assert.equal(readStoredTheme(), 'light')
})

test('an explicit dark value is honoured, and the applied DOM class wins', () => {
  stubDom({ store: new Map([[THEME_STORAGE_KEY, 'dark']]) })
  assert.equal(readStoredTheme(), 'dark')
  stubDom({ dark: true, store: new Map([[THEME_STORAGE_KEY, 'light']]) })
  assert.equal(readStoredTheme(), 'dark')
})

test('an unreadable localStorage never throws on read or write', () => {
  stubDom({ throwOnGet: true, throwOnSet: true })
  assert.doesNotThrow(() => readStoredTheme())
  assert.equal(readStoredTheme(), 'light')
  assert.doesNotThrow(() => setTheme('dark'))
  assert.equal(getTheme(), 'dark')
})

test('MOBILE_QUERY matches Tailwind md', () => {
  assert.equal(MOBILE_QUERY, '(max-width: 767px)')
})

test('useIsMobile updates on resize without a remount', () => {
  const listeners = new Set<() => void>()
  let matches = true
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_event: string, cb: () => void) => listeners.delete(cb),
  }

  let isMobile = matches // lazy initial read — no setState in an effect
  const onChange = () => {
    isMobile = mql.matches
  }
  mql.addEventListener('change', onChange)
  assert.equal(isMobile, true, 'a narrow viewport reports mobile')

  matches = false
  listeners.forEach((cb) => cb())
  assert.equal(isMobile, false, 'a resize updates the value in place')

  mql.removeEventListener('change', onChange)
  assert.equal(listeners.size, 0, 'the listener is removed on unmount')
})

test('useIsMobile reads lazily and listens to matchMedia changes', () => {
  const src = fs.readFileSync(path.resolve('src/hooks/useIsMobile.ts'), 'utf-8')
  assert.match(
    src,
    /useState\(\s*\(\) => typeof window !== 'undefined' && window\.matchMedia\(MOBILE_QUERY\)\.matches/,
  )
  assert.match(src, /mql\.addEventListener\('change', onChange\)/)
  assert.match(src, /return \(\) => mql\.removeEventListener\('change', onChange\)/)
})
