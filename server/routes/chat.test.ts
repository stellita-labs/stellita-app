import test from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response } from 'express'
import { createChatHandler } from './chat.js'
import type { ChatDeps } from './chat.js'
import { PROMPT_MAX } from '../../shared/types.js'

type Row = Record<string, unknown>

interface TableConfig {
  single?: Row | null
  list?: Row[]
  error?: unknown
}

/** A chainable Supabase double: records inserts/updates and returns canned rows. */
function makeSupabase(opts: {
  rpcResult?: { data: unknown; error: unknown }
  tables?: Record<string, TableConfig>
}) {
  const inserted: Record<string, Row[]> = {}
  const updated: Record<string, Row[]> = {}
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
      update(values: Row) {
        ;(updated[table] ??= []).push(values)
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

  return { client, inserted, updated, eqCalls, rpcCalls }
}

function makeAdminClient(modelRow: Row | null) {
  const usageInserts: Row[] = []
  const builder = {
    select() {
      return builder
    },
    eq() {
      return builder
    },
    single() {
      return Promise.resolve({ data: modelRow, error: null })
    },
    maybeSingle() {
      return Promise.resolve({ data: modelRow, error: null })
    },
    insert(values: Row) {
      usageInserts.push(values)
      return builder
    },
    then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
      return resolve({ data: null, error: null })
    },
  }
  return { client: { from: () => builder }, usageInserts }
}

interface StreamStub {
  textStream: AsyncIterable<string>
  object: Promise<unknown>
  usage: Promise<{ inputTokens?: number; outputTokens?: number } | undefined>
}

function makeStream(parts: {
  text?: string[]
  object?: unknown
  usage?: { inputTokens?: number; outputTokens?: number }
}): StreamStub {
  const text = parts.text ?? []
  return {
    textStream: (async function* generate() {
      for (const chunk of text) yield chunk
    })(),
    object: Promise.resolve(
      parts.object ?? { message: 'done', versionName: 'v1', files: [], actions: [] },
    ),
    usage: Promise.resolve(parts.usage),
  }
}

function makeDeps(overrides: Record<string, unknown> = {}): ChatDeps {
  const deps = {
    checkGuardrail: async () => ({
      allowed: true,
      category: 'build_request',
      reason: '',
      refusal: '',
    }),
    listManifests: async () => [],
    adminClient: () => makeAdminClient(null).client,
    streamChat: () => makeStream({}),
    ...overrides,
  }
  return deps as unknown as ChatDeps
}

function mockReq(body: Row, supabase: unknown): Request {
  return { params: { id: 'p-1' }, body, user: { id: 'u-1' }, supabase } as unknown as Request
}

function mockRes() {
  const state = {
    statusCode: 200,
    json: null as unknown,
    headers: {} as Record<string, string>,
    written: '',
    ended: false,
  }
  const res = {
    status(code: number) {
      state.statusCode = code
      return res
    },
    json(body: unknown) {
      state.json = body
      return res
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value
      return res
    },
    write(chunk: string) {
      state.written += chunk
      return true
    },
    end() {
      state.ended = true
      return res
    },
  }
  return { res: res as unknown as Response, state }
}

test('missing userMessage → 400', async () => {
  const handler = createChatHandler(makeDeps())
  const { res, state } = mockRes()
  await handler(mockReq({}, {}), res)
  assert.equal(state.statusCode, 400)
  assert.deepEqual(state.json, { error: 'userMessage required' })
})

test('an over-long prompt → 400', async () => {
  const handler = createChatHandler(makeDeps())
  const { res, state } = mockRes()
  await handler(mockReq({ userMessage: 'x'.repeat(PROMPT_MAX + 1) }, {}), res)
  assert.equal(state.statusCode, 400)
  assert.match(String((state.json as Row)['error']), /message too long/)
})

test('a consume_prompt RPC error → 500', async () => {
  const supa = makeSupabase({ rpcResult: { data: null, error: { message: 'rpc exploded' } } })
  const handler = createChatHandler(makeDeps())
  const { res, state } = mockRes()
  await handler(mockReq({ userMessage: 'hello' }, supa.client), res)
  assert.equal(state.statusCode, 500)
  assert.equal((state.json as Row)['error'], 'Failed to verify account prompt quota')
})

test('consume_prompt returning allowed=false → 429 rate_limited', async () => {
  const supa = makeSupabase({ rpcResult: { data: false, error: null } })
  const handler = createChatHandler(makeDeps())
  const { res, state } = mockRes()
  await handler(mockReq({ userMessage: 'hello' }, supa.client), res)
  assert.equal(state.statusCode, 429)
  assert.deepEqual(state.json, { error: 'rate_limited' })
})

test('a blocked guardrail persists two messages and returns { blocked: true }', async () => {
  const supa = makeSupabase({ rpcResult: { data: true, error: null } })
  const handler = createChatHandler(
    makeDeps({
      checkGuardrail: async () => ({
        allowed: false,
        category: 'unsafe',
        reason: 'unsafe',
        refusal: 'Nope.',
      }),
    }),
  )
  const { res, state } = mockRes()
  await handler(mockReq({ userMessage: 'do something bad' }, supa.client), res)

  assert.equal((state.json as Row)['blocked'], true)
  assert.equal(supa.inserted['messages'].length, 2)
  assert.equal(supa.inserted['messages'][0]['role'], 'user')
  assert.equal(supa.inserted['messages'][1]['kind'], 'blocked')
  assert.equal(supa.inserted['messages'][1]['content'], 'Nope.')
})

test('the streamed happy path writes a project_version and a usage_event', async () => {
  const supa = makeSupabase({
    rpcResult: { data: true, error: null },
    tables: { messages: { single: null }, project_versions: { single: null } },
  })
  const admin = makeAdminClient({
    model_type: 'XLM_MINI',
    provider_model: 'gpt-test',
    input_usd_per_mtok: 1,
    cached_input_usd_per_mtok: 0,
    output_usd_per_mtok: 2,
  })
  const handler = createChatHandler(
    makeDeps({
      adminClient: () => admin.client,
      streamChat: () =>
        makeStream({
          text: ['{"message"', ':"done"}'],
          object: {
            message: 'Built your app',
            versionName: 'Add hero',
            files: [{ op: 'create', path: '/App.tsx', content: 'export default 1' }],
            actions: [],
          },
          usage: { inputTokens: 1000, outputTokens: 2000 },
        }),
    }),
  )
  const { res, state } = mockRes()
  await handler(mockReq({ userMessage: 'build a todo app', fileTree: {} }, supa.client), res)

  assert.match(state.headers['Content-Type'] ?? '', /text\/plain/)
  assert.equal(state.written, '{"message":"done"}')
  assert.equal(state.ended, true)
  assert.equal(supa.inserted['project_versions'].length, 1)
  assert.equal(supa.inserted['messages'].length, 2)
  assert.equal(supa.updated['projects'].length, 1)
  assert.equal(admin.usageInserts.length, 1)
  assert.equal(admin.usageInserts[0]['kind'], 'generation')
  assert.equal(admin.usageInserts[0]['project_id'], 'p-1')
})
