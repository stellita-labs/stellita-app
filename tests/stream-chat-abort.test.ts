import test from 'node:test'
import assert from 'node:assert/strict'
import { streamChat, StreamTimeoutError, isAbortError } from '../src/lib/backend.js'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

function abortErr(): Error {
  const e = new Error('aborted')
  e.name = 'AbortError'
  return e
}

/** Swap global fetch for the duration of fn, then restore it. */
async function withFetch(
  mock: (input: FetchInput, init?: FetchInit) => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch
  globalThis.fetch = mock as unknown as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
}

function streamResponse(body: ReadableStream<Uint8Array>): Response {
  return { ok: true, status: 200, body } as unknown as Response
}

test('StreamTimeoutError is distinguishable from a user abort', () => {
  const err = new StreamTimeoutError(1234)
  assert.equal(err.name, 'StreamTimeoutError')
  assert.equal(err instanceof Error, true)
  assert.match(err.message, /1234/)
  assert.equal(isAbortError(err), true)

  const user = abortErr()
  assert.equal(isAbortError(user), true)
  assert.equal(isAbortError(new Error('boom')), false)
  assert.equal(isAbortError(null), false)
})

test('a normal stream resolves with the concatenated text', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('Hello '))
      c.enqueue(new TextEncoder().encode('world'))
      c.close()
    },
  })

  const chunks: string[] = []
  let full = ''
  await withFetch(
    async () => streamResponse(body),
    async () => {
      full = await streamChat('p1', { userMessage: 'hi' }, (c) => chunks.push(c), {
        idleTimeoutMs: 1000,
      })
    },
  )

  assert.equal(full, 'Hello world')
  assert.deepEqual(chunks, ['Hello ', 'world'])
})

test('an already-aborted signal rejects and passes the signal into the fetch init', async () => {
  const controller = new AbortController()
  controller.abort()

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('never delivered'))
      c.close()
    },
  })

  let sawAbortedSignal = false
  const chunks: string[] = []
  await withFetch(
    async (_input, init) => {
      if (init?.signal?.aborted) {
        sawAbortedSignal = true
        throw abortErr()
      }
      return streamResponse(body)
    },
    async () => {
      await assert.rejects(
        streamChat('p1', { userMessage: 'hi' }, (c) => chunks.push(c), {
          signal: controller.signal,
        }),
        (err: unknown) => isAbortError(err),
      )
    },
  )

  assert.equal(sawAbortedSignal, true, 'the aborted signal must be wired into fetch')
  assert.deepEqual(chunks, [], 'no chunk may be delivered after an abort')
})

test('aborting mid-stream rejects and stops reading the body', async () => {
  const controller = new AbortController()
  const chunks: string[] = []

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('partial'))
      // Never closes — simulates an upstream that stalled mid-stream.
    },
  })

  let resolveFirst: () => void = () => {}
  const firstChunk = new Promise<void>((resolve) => {
    resolveFirst = resolve
  })

  await withFetch(
    async (_input, init) => {
      if (init?.signal?.aborted) throw abortErr()
      return streamResponse(body)
    },
    async () => {
      const pending = streamChat(
        'p1',
        { userMessage: 'hi' },
        (c) => {
          chunks.push(c)
          resolveFirst()
        },
        { signal: controller.signal, idleTimeoutMs: 10_000 },
      )

      await firstChunk
      controller.abort()
      await assert.rejects(pending, (err: unknown) => isAbortError(err))
    },
  )

  assert.deepEqual(chunks, ['partial'])
})

test('a stream that stalls past the idle window aborts with StreamTimeoutError', async () => {
  const body = new ReadableStream<Uint8Array>({
    start() {
      // Never enqueues or closes: the upstream hangs.
    },
  })

  await withFetch(
    async () => streamResponse(body),
    async () => {
      await assert.rejects(
        streamChat('p1', { userMessage: 'hi' }, () => {}, { idleTimeoutMs: 20 }),
        (err: unknown) => err instanceof StreamTimeoutError,
      )
    },
  )
})
