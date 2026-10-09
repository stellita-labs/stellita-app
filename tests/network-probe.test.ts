import test from 'node:test'
import assert from 'node:assert/strict'
import { probeRpc } from '../scripts/network-probe.js'

test('probeRpc fails and names the endpoint on a 5xx response', async () => {
  const fakeFetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch
  await assert.rejects(
    probeRpc('https://rpc.example.test', fakeFetch),
    /RPC probe failed for https:\/\/rpc\.example\.test: HTTP 503/,
  )
})

test('probeRpc returns the latest ledger sequence on success', async () => {
  const fakeFetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 1, result: { sequence: 4242 } }),
  })) as unknown as typeof fetch
  const out = await probeRpc('https://rpc.example.test', fakeFetch)
  assert.equal(out.latestLedger, 4242)
})
