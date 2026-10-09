import test from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@stellar/stellar-sdk'
import {
  handleFaucetRequest,
  handleMintNftRequest,
  isValidStellarAddress,
} from './contracts.js'
import type { MintFns } from './contracts.js'
import { DEMO_TOKEN_ID } from '../_lib/faucet.js'
import { DEMO_NFT_ID } from '../_lib/nft.js'

const VALID_ADDRESS = Keypair.random().publicKey()
const SECRET = 'S' + 'A'.repeat(55)

interface Calls {
  faucet: { to: string; amount: number | undefined; secret: string | undefined }[]
  nft: { to: string; secret: string | undefined }[]
}

function recordingMints(overrides: Partial<MintFns> = {}): { mints: MintFns; calls: Calls } {
  const calls: Calls = { faucet: [], nft: [] }
  const mints: MintFns = {
    mintDemoTokens: async (to, amount, secret) => {
      calls.faucet.push({ to, amount, secret })
      return 'tx-hash-demo'
    },
    mintNft: async (to, secret) => {
      calls.nft.push({ to, secret })
      return { hash: 'tx-hash-nft', tokenId: 7 }
    },
    ...overrides,
  }
  return { mints, calls }
}

test('isValidStellarAddress accepts account and contract addresses only', () => {
  assert.equal(isValidStellarAddress(VALID_ADDRESS), true)
  assert.equal(isValidStellarAddress(DEMO_TOKEN_ID), true)
  assert.equal(isValidStellarAddress('not-an-address'), false)
  assert.equal(isValidStellarAddress(''), false)
  assert.equal(isValidStellarAddress(undefined), false)
  assert.equal(isValidStellarAddress(42), false)
})

test('faucet: a missing address is a 400 and never reaches the minting helper', async () => {
  const { mints, calls } = recordingMints()
  const outcome = await handleFaucetRequest({}, SECRET, mints)
  assert.equal(outcome.kind, 'json')
  assert.equal(outcome.status, 400)
  assert.deepEqual(outcome.body, { error: 'address required' })
  assert.equal(calls.faucet.length, 0)
})

test('faucet: a non-Stellar address is a 400 and never reaches the minting helper', async () => {
  const { mints, calls } = recordingMints()
  const outcome = await handleFaucetRequest({ address: '0xdeadbeef' }, SECRET, mints)
  assert.equal(outcome.kind, 'json')
  assert.equal(outcome.status, 400)
  assert.deepEqual(outcome.body, { error: 'invalid Stellar address' })
  assert.equal(calls.faucet.length, 0)
})

test('faucet: an unset FAUCET_SECRET returns 503 without leaking the env var name', async () => {
  const { mints, calls } = recordingMints()
  const outcome = await handleFaucetRequest({ address: VALID_ADDRESS }, undefined, mints)
  assert.equal(outcome.kind, 'json')
  assert.equal(outcome.status, 503)
  const serialized = JSON.stringify(outcome.body)
  assert.equal(serialized.includes('FAUCET_SECRET'), false)
  assert.equal(serialized.includes('environment'), false)
  assert.equal(calls.faucet.length, 0)
})

test('faucet: an SDK throw becomes a 502 error outcome, not a fabricated success', async () => {
  const { mints } = recordingMints({
    mintDemoTokens: async () => {
      throw new Error('rpc unavailable')
    },
  })
  const outcome = await handleFaucetRequest({ address: VALID_ADDRESS }, SECRET, mints)
  assert.equal(outcome.kind, 'error')
  assert.equal(outcome.status, 502)
  if (outcome.kind === 'error') {
    assert.equal(outcome.message, 'Failed to mint demo tokens')
    assert.ok(outcome.error instanceof Error)
  }
})

test('faucet: the happy path returns the tx hash and token id', async () => {
  const { mints, calls } = recordingMints()
  const outcome = await handleFaucetRequest({ address: VALID_ADDRESS, amount: 25 }, SECRET, mints)
  assert.equal(outcome.kind, 'json')
  assert.equal(outcome.status, 200)
  assert.deepEqual(outcome.body, { hash: 'tx-hash-demo', tokenId: DEMO_TOKEN_ID })
  assert.equal(calls.faucet.length, 1)
  assert.equal(calls.faucet[0].to, VALID_ADDRESS)
  assert.equal(calls.faucet[0].amount, 25)
  assert.equal(calls.faucet[0].secret, SECRET)
})

test('mint-nft: missing/invalid address and unset secret short-circuit to 400/503', async () => {
  const { mints, calls } = recordingMints()
  assert.deepEqual(
    (await handleMintNftRequest({}, SECRET, mints)).status,
    400,
  )
  assert.deepEqual(
    (await handleMintNftRequest({ address: 'bogus' }, SECRET, mints)).status,
    400,
  )
  const unset = await handleMintNftRequest({ address: VALID_ADDRESS }, undefined, mints)
  assert.equal(unset.status, 503)
  if (unset.kind === 'json') {
    assert.equal(JSON.stringify(unset.body).includes('FAUCET_SECRET'), false)
  }
  assert.equal(calls.nft.length, 0)
})

test('mint-nft: an SDK throw becomes a 502 error outcome', async () => {
  const { mints } = recordingMints({
    mintNft: async () => {
      throw new Error('mint failed')
    },
  })
  const outcome = await handleMintNftRequest({ address: VALID_ADDRESS }, SECRET, mints)
  assert.equal(outcome.kind, 'error')
  assert.equal(outcome.status, 502)
})

test('mint-nft: the happy path returns hash, tokenId and the collection id', async () => {
  const { mints } = recordingMints()
  const outcome = await handleMintNftRequest({ address: VALID_ADDRESS }, SECRET, mints)
  assert.equal(outcome.kind, 'json')
  assert.equal(outcome.status, 200)
  assert.deepEqual(outcome.body, { hash: 'tx-hash-nft', tokenId: 7, nftId: DEMO_NFT_ID })
})
