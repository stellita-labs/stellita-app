import test from 'node:test'
import assert from 'node:assert/strict'
import { SOROBAN_EVENT_HELPERS } from '../src/lib/soroban-events'

type Native = { native: unknown }
type Movement = {
  kind: 'in' | 'out' | 'mint'
  counterparty: string
  amount: string
  time: string
  txHash: string
}
type Decoders = {
  movementFromEvent: (ev: unknown, user: string, decimals: number) => Movement | null
  nftIdCandidates: (ev: unknown) => number[]
  eventStableTime: (ev: unknown) => string
  eventStableTxHash: (ev: unknown) => string
  eventAmountValue: (raw: unknown) => unknown
}

// The generated /stellar.ts resolves `scValToNative` from the SDK; in the test we
// feed already-decoded values (the shape `getEvents` hands back once decoded).
const scv = (native: unknown): Native => ({ native })
const stubScValToNative = (v: Native) => v.native
const stubFromUnits = (raw: bigint | number | string, decimals: number) => {
  const base = 10n ** BigInt(decimals)
  const v = BigInt(raw)
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

function decoders(): Decoders {
  const factory = new Function(
    'scValToNative',
    'fromUnits',
    SOROBAN_EVENT_HELPERS +
      '\nreturn { movementFromEvent, nftIdCandidates, eventStableTime, eventStableTxHash, eventAmountValue }',
  )
  return factory(stubScValToNative, stubFromUnits) as Decoders
}

const USER = 'GUSER'
const OTHER = 'GOTHER'

test('a scalar-valued transfer decodes into a movement for the sender', () => {
  const { movementFromEvent } = decoders()
  const ev = {
    topic: [scv('transfer'), scv(USER), scv(OTHER)],
    value: scv(1000000000000000000n),
    ledgerClosedAt: '2026-01-01T00:00:00Z',
    txHash: 'abc123',
  }
  assert.deepEqual(movementFromEvent(ev, USER, 18), {
    kind: 'out',
    counterparty: OTHER,
    amount: '1',
    time: '2026-01-01T00:00:00Z',
    txHash: 'abc123',
  })
})

test('an object-valued mint decodes for the recipient', () => {
  const { movementFromEvent } = decoders()
  const ev = { topic: [scv('mint'), scv(USER)], value: scv({ amount: 500n, to: USER }) }
  const mv = movementFromEvent(ev, USER, 0)
  assert.ok(mv)
  assert.equal(mv.kind, 'mint')
  assert.equal(mv.amount, '500')
})

test('an event with no txHash/ledgerClosedAt renders empty placeholders, never undefined', () => {
  const { movementFromEvent } = decoders()
  const ev = { topic: [scv('transfer'), scv(OTHER), scv(USER)], value: scv(10n) }
  const mv = movementFromEvent(ev, USER, 0)
  assert.ok(mv)
  assert.equal(mv.time, '')
  assert.equal(mv.txHash, '')
})

test('the stable accessors return "" for missing fields', () => {
  const { eventStableTime, eventStableTxHash } = decoders()
  assert.equal(eventStableTime({}), '')
  assert.equal(eventStableTime(null), '')
  assert.equal(eventStableTxHash({ txHash: null }), '')
  assert.equal(eventStableTxHash({ txHash: 'h' }), 'h')
})

test('an unknown event name decodes to null and never throws', () => {
  const { movementFromEvent } = decoders()
  const ev = { topic: [scv('approve')], value: scv(1n) }
  assert.equal(movementFromEvent(ev, USER, 0), null)
})

test('nftIdCandidates reads a u32 scalar value (sequential-mint shape)', () => {
  const { nftIdCandidates } = decoders()
  assert.deepEqual(nftIdCandidates({ topic: [scv('mint')], value: scv(7) }), [7])
})

test('nftIdCandidates reads an object value and ignores out-of-range ids', () => {
  const { nftIdCandidates } = decoders()
  const ev = {
    topic: [scv('transfer'), scv(USER), scv(OTHER)],
    value: scv({ token_id: 3, extra: 'x' }),
  }
  assert.deepEqual(nftIdCandidates(ev), [3])
})

test('nftIdCandidates tolerates an empty topic list and filters junk', () => {
  const { nftIdCandidates } = decoders()
  assert.deepEqual(nftIdCandidates({ value: scv({ id: 1 }) }), [1])
  assert.deepEqual(nftIdCandidates({ value: scv(999999999) }), [])
})
