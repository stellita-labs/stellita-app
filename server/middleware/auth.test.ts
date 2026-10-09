import test from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response, NextFunction } from 'express'
import { createRequireUser } from './auth.js'
import type { serverClient } from '../lib/supabase.js'

type ClientFactory = typeof serverClient

/** Minimal Response double that records status + JSON body. */
function mockRes() {
  let statusCode = 200
  let jsonBody: Record<string, unknown> | null = null
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: Record<string, unknown>) {
      jsonBody = body
      return this
    },
  } as unknown as Response
  return { res, getStatus: () => statusCode, getBody: () => jsonBody }
}

function mockReq(cookies: Record<string, string>): Request {
  return { cookies, headers: {} } as unknown as Request
}

/**
 * A client factory whose getUser() outcome depends on which session cookie the
 * request carries — so a single stub covers missing / garbage / expired / valid.
 */
function authClientFactory(): ClientFactory {
  const factory = (req: Request) => ({
    auth: {
      getUser: async () => {
        const cookies = (req.cookies ?? {}) as Record<string, string>
        if (cookies['sb-valid']) {
          return {
            data: { user: { id: 'user-123', email: 'user@example.com' } },
            error: null,
          }
        }
        if (cookies['sb-expired']) {
          return {
            data: { user: null },
            error: { message: 'AuthApiError: token expired', code: 'token_expired', status: 403 },
          }
        }
        return { data: { user: null }, error: null }
      },
    },
  })
  return factory as unknown as ClientFactory
}

const requireUser = createRequireUser(authClientFactory())

function run(req: Request) {
  const { res, getStatus, getBody } = mockRes()
  let nextCalls = 0
  const next: NextFunction = () => {
    nextCalls += 1
  }
  const promise = requireUser(req, res, next)
  return { promise, getStatus, getBody, nextCalls: () => nextCalls, req }
}

test('no session cookie → 401 and next() is never called', async () => {
  const { promise, getStatus, getBody, nextCalls } = run(mockReq({}))
  await promise
  assert.equal(getStatus(), 401)
  assert.deepEqual(getBody(), { error: 'unauthorized' })
  assert.equal(nextCalls(), 0)
})

test('a malformed/garbage cookie → 401', async () => {
  const { promise, getStatus, getBody, nextCalls } = run(
    mockReq({ 'sb-something-auth-token': 'not-a-real-jwt' }),
  )
  await promise
  assert.equal(getStatus(), 401)
  assert.deepEqual(getBody(), { error: 'unauthorized' })
  assert.equal(nextCalls(), 0)
})

test('an expired cookie (getUser error) → 401 without leaking the auth error', async () => {
  const { promise, getStatus, getBody, nextCalls } = run(
    mockReq({ 'sb-expired': 'stale-jwt' }),
  )
  await promise
  assert.equal(getStatus(), 401)
  const body = getBody()
  assert.deepEqual(body, { error: 'unauthorized' })
  const serialized = JSON.stringify(body)
  assert.equal(serialized.includes('AuthApiError'), false)
  assert.equal(serialized.includes('token expired'), false)
  assert.equal(serialized.includes('token_expired'), false)
  assert.equal(nextCalls(), 0)
})

test('a valid session populates req.user + req.supabase and calls next() once', async () => {
  const req = mockReq({ 'sb-valid': 'valid-jwt' })
  const { promise, nextCalls } = run(req)
  await promise
  assert.equal(nextCalls(), 1)
  assert.equal(req.user.id, 'user-123')
  assert.equal(req.user.email, 'user@example.com')
  assert.ok(req.supabase, 'req.supabase must be attached')
})

test('no 401 response body ever contains a user id or email', async () => {
  const cases: Record<string, string>[] = [{}, { 'sb-x': 'garbage' }, { 'sb-expired': 'stale' }]
  for (const cookies of cases) {
    const { promise, getBody } = run(mockReq(cookies))
    await promise
    const serialized = JSON.stringify(getBody())
    assert.equal(serialized.includes('user-123'), false)
    assert.equal(serialized.includes('user@example.com'), false)
  }
})
