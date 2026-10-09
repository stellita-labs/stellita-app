import test from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import express from 'express'
import cookieParser from 'cookie-parser'
import type { Request, Response } from 'express'

// The routes build the Supabase client from env at module load, so set it BEFORE
// importing them. An unreachable URL is fine: requireUser 401s before any query.
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'
process.env.SUPABASE_SECRET_KEY = 'test-secret-key'

const projectsModule = await import('./projects.js')
const {
  listProjectsHandler,
  createProjectHandler,
  updateFilesHandler,
  cloneProjectHandler,
} = projectsModule

type Row = Record<string, unknown>

interface TableConfig {
  single?: Row | null
  list?: Row[]
  error?: unknown
}

function makeSupabase(opts: {
  rpcResult?: { data: unknown; error: unknown }
  tables?: Record<string, TableConfig>
} = {}) {
  const inserted: Record<string, Row[]> = {}
  const eqCalls: { table: string; column: string; value: unknown }[] = []
  const rpcCalls: { name: string; args: unknown }[] = []

  function tableBuilder(table: string) {
    const cfg = opts.tables?.[table] ?? {}
    const builder = {
      select() {
        return builder
      },
      insert(values: Row) {
        ;(inserted[table] ??= []).push(values)
        return builder
      },
      update() {
        return builder
      },
      delete() {
        return builder
      },
      eq(column: string, value: unknown) {
        eqCalls.push({ table, column, value })
        return builder
      },
      order() {
        return builder
      },
      limit() {
        return builder
      },
      single() {
        return Promise.resolve({ data: cfg.single ?? null, error: cfg.error ?? null })
      },
      maybeSingle() {
        return Promise.resolve({ data: cfg.single ?? null, error: cfg.error ?? null })
      },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        return resolve({ data: cfg.list ?? cfg.single ?? null, error: cfg.error ?? null })
      },
    }
    return builder
  }

  const client = {
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args })
      return Promise.resolve(opts.rpcResult ?? { data: null, error: null })
    },
    from(table: string) {
      return tableBuilder(table)
    },
  }

  return { client, inserted, eqCalls, rpcCalls }
}

function mockReq(body: Row, supabase: unknown): Request {
  return {
    params: { id: 'p-1' },
    body,
    user: { id: 'u-1' },
    supabase,
  } as unknown as Request
}

function mockRes() {
  const state = { statusCode: 200, json: null as unknown }
  const res = {
    status(code: number) {
      state.statusCode = code
      return res
    },
    json(body: unknown) {
      state.json = body
      return res
    },
  }
  return { res: res as unknown as Response, state }
}

test('every mutating route rejects an unauthenticated request with 401', async () => {
  const app = express()
  app.use(cookieParser())
  app.use(express.json({ limit: '5mb' }))
  app.use('/api', projectsModule.default)

  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`

  const mutating: [string, string][] = [
    ['POST', '/api/projects'],
    ['PATCH', '/api/projects/p1'],
    ['DELETE', '/api/projects/p1'],
    ['PATCH', '/api/projects/p1/files'],
    ['POST', '/api/projects/p1/versions'],
    ['POST', '/api/projects/p1/versions/v1/restore'],
    ['POST', '/api/projects/p1/messages'],
    ['PATCH', '/api/projects/p1/messages/m1'],
    ['POST', '/api/projects/p1/contracts'],
    ['POST', '/api/projects/p1/share'],
    ['POST', '/api/projects/p1/visibility'],
    ['POST', '/api/projects/p1/share/email'],
    ['POST', '/api/projects/p1/clone'],
    ['POST', '/api/shared/tok/clone'],
  ]

  try {
    for (const [method, path] of mutating) {
      const response = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'DELETE' ? undefined : '{}',
      })
      assert.equal(response.status, 401, `${method} ${path} must be 401`)
      assert.deepEqual(await response.json(), { error: 'unauthorized' })
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('GET /api/projects filters out templates and scopes to the owner', async () => {
  const supa = makeSupabase({
    tables: {
      projects: { list: [{ id: 'p1', slug: 's', name: 'Mine' }] },
    },
  })
  const { res, state } = mockRes()
  await listProjectsHandler(mockReq({}, supa.client), res)

  assert.deepEqual(state.json, [{ id: 'p1', slug: 's', name: 'Mine' }])
  assert.ok(
    supa.eqCalls.some(
      (c) => c.table === 'projects' && c.column === 'is_template' && c.value === false,
    ),
    'query must filter is_template = false',
  )
  assert.ok(
    supa.eqCalls.some((c) => c.column === 'owner_id' && c.value === 'u-1'),
    'query must be scoped to the current user',
  )
})

test('POST /api/projects returns 201 with the deduped name', async () => {
  const supa = makeSupabase({
    tables: {
      projects: {
        list: [{ name: 'My App' }],
        single: { id: 'p2', slug: 'my-app', name: 'My App 2' },
      },
    },
  })
  const { res, state } = mockRes()
  await createProjectHandler(
    mockReq({ name: 'My App', slug: 'my-app', current_files: {} }, supa.client),
    res,
  )

  assert.equal(state.statusCode, 201)
  assert.equal(supa.inserted['projects'][0]['name'], 'My App 2')
  assert.equal(supa.inserted['projects'][0]['owner_id'], 'u-1')
  assert.deepEqual(state.json, { id: 'p2', slug: 'my-app', name: 'My App 2' })
})

test('POST /api/projects without a name/slug → 400 (never 500)', async () => {
  const supa = makeSupabase()
  const { res, state } = mockRes()
  await createProjectHandler(mockReq({ name: 'X' }, supa.client), res)
  assert.equal(state.statusCode, 400)
  assert.deepEqual(state.json, { error: 'name and slug required' })
  assert.equal(supa.inserted['projects'], undefined)
})

test('PATCH /api/projects/:id/files without files → 400', async () => {
  const supa = makeSupabase()
  const { res, state } = mockRes()
  await updateFilesHandler(mockReq({}, supa.client), res)
  assert.equal(state.statusCode, 400)
  assert.deepEqual(state.json, { error: 'files required' })
})

test('POST /api/projects/:id/clone surfaces an RPC error as a 500', async () => {
  const supa = makeSupabase({ rpcResult: { data: null, error: { message: 'clone exploded' } } })
  const { res, state } = mockRes()
  await cloneProjectHandler(mockReq({}, supa.client), res)
  assert.equal(state.statusCode, 500)
  assert.equal((state.json as Row)['error'], 'Failed to clone project')
})
