import test from 'node:test'
import assert from 'node:assert/strict'
import { sendEmail } from './email.js'

interface FetchCall {
  url: string
  init?: RequestInit
}

const realFetch = globalThis.fetch

/** Install a fetch stub for the duration of a test and return the recorded calls. */
function stubFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>): FetchCall[] {
  const calls: FetchCall[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return impl(url, init)
  }) as unknown as typeof fetch
  return calls
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

const MESSAGE = { to: 'a@b.co', subject: 'hi', html: '<p>hi</p>' }

test('missing RESEND_API_KEY: returns not-configured and makes zero network calls', async () => {
  delete process.env.RESEND_API_KEY
  const calls = stubFetch(async () => {
    throw new Error('fetch must not be called without a key')
  })
  try {
    const result = await sendEmail(MESSAGE)
    assert.equal(result.ok, false)
    assert.equal(result.error, 'email not configured')
    assert.equal(calls.length, 0)
  } finally {
    restoreFetch()
  }
})

test('a non-2xx Resend response surfaces the upstream message', async () => {
  process.env.RESEND_API_KEY = 'test-key'
  stubFetch(async () => ({
    ok: false,
    status: 422,
    json: async () => ({ message: 'Invalid `from` domain' }),
  }))
  try {
    const result = await sendEmail(MESSAGE)
    assert.equal(result.ok, false)
    assert.equal(result.error, 'Invalid `from` domain')
  } finally {
    restoreFetch()
    delete process.env.RESEND_API_KEY
  }
})

test('a non-2xx response without a message falls back to the status', async () => {
  process.env.RESEND_API_KEY = 'test-key'
  stubFetch(async () => ({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error('not json')
    },
  }))
  try {
    const result = await sendEmail(MESSAGE)
    assert.equal(result.ok, false)
    assert.equal(result.error, 'Resend error 500')
  } finally {
    restoreFetch()
    delete process.env.RESEND_API_KEY
  }
})

test('a thrown network error is swallowed into { ok: false, error }', async () => {
  process.env.RESEND_API_KEY = 'test-key'
  stubFetch(async () => {
    throw new Error('network down')
  })
  try {
    const result = await sendEmail(MESSAGE)
    assert.equal(result.ok, false)
    assert.equal(result.error, 'network down')
  } finally {
    restoreFetch()
    delete process.env.RESEND_API_KEY
  }
})

test('successful send returns the Resend id and sends the bearer key', async () => {
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_FROM = 'Stellita <noreply@test.dev>'
  const calls = stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'resend-id-1' }),
  }))
  try {
    const result = await sendEmail(MESSAGE)
    assert.equal(result.ok, true)
    assert.equal(result.id, 'resend-id-1')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.resend.com/emails')
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    assert.equal(headers['Authorization'], 'Bearer test-key')
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>
    assert.equal(body['from'], 'Stellita <noreply@test.dev>')
    assert.equal(body['to'], 'a@b.co')
  } finally {
    restoreFetch()
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
  }
})
