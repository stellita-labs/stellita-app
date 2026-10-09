import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const AUTH = path.resolve('src/auth/store.tsx')

function readAuth(): string {
  assert.ok(fs.existsSync(AUTH), 'auth store must exist')
  return fs.readFileSync(AUTH, 'utf-8')
}

test('/auth/me is fetched once on mount and a failure leaves a null session', () => {
  const src = readAuth()
  assert.match(
    src,
    /useEffect\(\(\) => \{[\s\S]*?api<\{ user: User; profile: unknown; credits: Credits \| null \}>\('\/auth\/me'\)[\s\S]*?\}, \[\]\)/,
  )
  assert.match(
    src,
    /\.catch\(\(\) => \{[\s\S]*?setUser\(null\)[\s\S]*?setProfile\(null\)[\s\S]*?setCredits\(null\)/,
  )
  assert.match(src, /\.finally\(\(\) => setLoading\(false\)\)/, 'loading must always resolve')
})

test('loginWithGoogle defaults next to pathname + search and encodes it', () => {
  const src = readAuth()
  assert.match(src, /const dest = next \?\? window\.location\.pathname \+ window\.location\.search/)
  assert.match(
    src,
    /window\.location\.href = `\$\{API_BASE\}\/auth\/google\?next=\$\{encodeURIComponent\(dest\)\}`/,
  )
})

type Session = {
  user: string | null
  profile: unknown
  credits: unknown
  loading: boolean
}

type MeResult = { user: string; profile: unknown; credits: unknown }

function makeSession(): Session {
  return { user: null, profile: null, credits: null, loading: true }
}

/** Mirrors the mount effect body: resolve, or clear to a null session, always stop loading. */
async function loadInitialSession(
  state: Session,
  fetchMe: () => Promise<MeResult>,
): Promise<Session> {
  try {
    const { user, profile, credits } = await fetchMe()
    state.user = user
    state.profile = profile
    state.credits = credits
  } catch {
    state.user = null
    state.profile = null
    state.credits = null
  } finally {
    state.loading = false
  }
  return state
}

function resolveNext(
  explicit: string | undefined,
  loc: { pathname: string; search: string },
): string {
  return explicit ?? loc.pathname + loc.search
}

function googleUrl(apiBase: string, next: string): string {
  return `${apiBase}/auth/google?next=${encodeURIComponent(next)}`
}

test('/me is called once on mount and populates the session', async () => {
  let calls = 0
  const state = makeSession()
  await loadInitialSession(state, async () => {
    calls += 1
    return { user: 'u1', profile: { plan: 'hacker' }, credits: { limit: 20 } }
  })
  assert.equal(calls, 1, 'exactly one /me request on mount')
  assert.equal(state.user, 'u1')
  assert.equal(state.loading, false)
})

test('a 401 on /me leaves user null and never leaves the app loading', async () => {
  const state = makeSession()
  await assert.doesNotReject(() =>
    loadInitialSession(state, async () => {
      throw new Error('Request failed (401)')
    }),
  )
  assert.equal(state.user, null)
  assert.equal(state.profile, null)
  assert.equal(state.credits, null)
  assert.equal(state.loading, false, 'a failed /me must still stop loading')
})

test('the default next preserves both pathname and query string', () => {
  const loc = { pathname: '/p/abc', search: '?clone=1' }
  const next = resolveNext(undefined, loc)
  assert.equal(next, '/p/abc?clone=1')

  const url = googleUrl('http://localhost:8787', next)
  assert.ok(url.includes(encodeURIComponent('/p/abc?clone=1')))
  const decoded = decodeURIComponent(url.split('next=')[1])
  assert.equal(decoded, '/p/abc?clone=1', 'path and query survive the round trip')
})

test('an explicit next is passed through unmodified', () => {
  const explicit = '/p/x?clone=1'
  const resolved = resolveNext(explicit, { pathname: '/app', search: '?ignored=1' })
  assert.equal(resolved, explicit)
  const url = googleUrl('http://localhost:8787', resolved)
  assert.equal(decodeURIComponent(url.split('next=')[1]), explicit)
})
