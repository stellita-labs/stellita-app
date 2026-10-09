import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Account, Keypair, nativeToScVal, rpc } from '@stellar/stellar-sdk'
import { contractIdFromReturnValue, deployContract } from './deploy'
import type { DeployDeps } from './deploy'
import type { Manifest } from '../../shared/types'

const MANIFEST_ID = 'test-manifest'
const TX_HASH = 'deadbeef1234'
const TX_EXPLORER = `https://stellar.expert/explorer/testnet/tx/${TX_HASH}`

describe('contractIdFromReturnValue', () => {
  it('returns the strkey contract id for an address returnValue', () => {
    const keypair = Keypair.random()
    const returnValue = nativeToScVal(keypair.publicKey(), { type: 'address' })
    assert.equal(
      contractIdFromReturnValue(returnValue, {
        manifestId: MANIFEST_ID,
        txHash: TX_HASH,
      }),
      keypair.publicKey(),
    )
  })

  it('throws a named error when returnValue is missing', () => {
    assert.throws(
      () =>
        contractIdFromReturnValue(undefined, {
          manifestId: MANIFEST_ID,
          txHash: TX_HASH,
        }),
      (err: unknown) => {
        const message = (err as Error).message
        return (
          message.includes(MANIFEST_ID) &&
          message.includes(TX_HASH) &&
          message.includes(TX_EXPLORER)
        )
      },
    )
  })

  it('throws the same class of error for a non-address returnValue', () => {
    const returnValue = nativeToScVal(42, { type: 'i32' })
    assert.throws(
      () =>
        contractIdFromReturnValue(returnValue, {
          manifestId: MANIFEST_ID,
          txHash: TX_HASH,
        }),
      (err: unknown) => {
        const message = (err as Error).message
        return (
          err instanceof Error &&
          message.includes(MANIFEST_ID) &&
          message.includes(TX_HASH) &&
          message.includes(TX_EXPLORER)
        )
      },
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Full deployContract flow against an in-memory RPC + Friendbot fake
// ─────────────────────────────────────────────────────────────────────────────

const DEPLOYER = Keypair.random()

const MANIFEST: Manifest = {
  id: MANIFEST_ID,
  name: 'Demo Token',
  description: 'Test manifest',
  type: 'deployable',
  category: 'token',
  wasmPath: 'contracts/wasm/demo.wasm',
  init: { method: '__constructor', argsFromConfig: ['name'] },
  config: [{ key: 'name', label: 'Name', type: 'string', default: 'Demo' }],
  methods: [],
}

interface FakePlan {
  /** getAccount always throws (account never becomes visible). */
  blockAccount?: boolean
  /** Errors thrown from prepareTransaction on successive calls (then success). */
  prepareErrors?: string[]
  /** Errors thrown from sendTransaction on successive calls (then success). */
  sendErrors?: string[]
  /** The create transaction's final status. */
  createStatus?: 'SUCCESS' | 'FAILED'
  /** The create transaction succeeds but carries no returnValue. */
  missingReturnValue?: boolean
  /** Friendbot HTTP status returned by the fetch stub. */
  friendbotStatus?: number
}

function makeFakeServer(plan: FakePlan) {
  const prepareErrors = [...(plan.prepareErrors ?? [])]
  const sendErrors = [...(plan.sendErrors ?? [])]
  let sendCount = 0
  const server = {
    async getAccount() {
      if (plan.blockAccount) throw new Error('account not found')
      return new Account(DEPLOYER.publicKey(), '0')
    },
    async prepareTransaction(tx: unknown) {
      const err = prepareErrors.shift()
      if (err) throw new Error(err)
      return tx
    },
    async sendTransaction() {
      const err = sendErrors.shift()
      if (err) throw new Error(err)
      sendCount += 1
      return { status: 'PENDING', hash: sendCount === 1 ? 'upload-hash' : 'create-hash' }
    },
    async getTransaction(hash: string) {
      if (hash === 'create-hash') {
        if (plan.createStatus === 'FAILED') return { status: 'FAILED' }
        if (plan.missingReturnValue) return { status: 'SUCCESS' }
        return {
          status: 'SUCCESS',
          returnValue: nativeToScVal(DEPLOYER.publicKey(), { type: 'address' }),
        }
      }
      return { status: 'SUCCESS' }
    },
  }
  return server as unknown as rpc.Server
}

function makeDeps(plan: FakePlan): DeployDeps {
  return {
    rpcServer: makeFakeServer(plan),
    readWasm: async () => Buffer.from('wasm-bytes'),
    sleep: async () => undefined,
    fetchImpl: (async () => ({
      ok: (plan.friendbotStatus ?? 200) < 400,
      status: plan.friendbotStatus ?? 200,
    })) as unknown as typeof fetch,
  }
}

function deploy(plan: FakePlan = {}) {
  return deployContract(
    { manifest: MANIFEST, config: { name: 'Demo' }, deployerSecret: DEPLOYER.secret() },
    makeDeps(plan),
  )
}

describe('deployContract (mocked RPC)', () => {
  it('uploads the WASM, creates the contract and returns the recorded id', async () => {
    const result = await deploy()
    assert.equal(result.contractId, DEPLOYER.publicKey())
    assert.equal(result.deployer, DEPLOYER.publicKey())
    assert.equal(result.txHash, 'create-hash')
    assert.equal(result.wasmHash.length, 64)
    assert.ok(result.explorerUrl.includes(result.contractId))
  })

  it('retries once on a transient txBadSeq and then succeeds', async () => {
    const result = await deploy({ prepareErrors: ['txBadSeq'] })
    assert.equal(result.contractId, DEPLOYER.publicKey())
  })

  it('retries once on a transient txNoAccount and then succeeds', async () => {
    const result = await deploy({ sendErrors: ['txNoAccount'] })
    assert.equal(result.contractId, DEPLOYER.publicKey())
  })

  it('retries once on a transient MissingValue and then succeeds', async () => {
    const result = await deploy({ prepareErrors: ['MissingValue'] })
    assert.equal(result.contractId, DEPLOYER.publicKey())
  })

  it('surfaces a FAILED transaction as an error instead of a fabricated id', async () => {
    await assert.rejects(
      () => deploy({ createStatus: 'FAILED' }),
      (err: unknown) => /FAILED/.test((err as Error).message),
    )
  })

  it('throws an actionable error when a successful tx carries no returnValue', async () => {
    await assert.rejects(
      () => deploy({ missingReturnValue: true }),
      (err: unknown) => {
        const message = (err as Error).message
        return message.includes(MANIFEST_ID) && message.includes('no contract address')
      },
    )
  })

  it('terminates with a bounded error when Friendbot responds with an error status', async () => {
    await assert.rejects(
      () => deploy({ blockAccount: true, friendbotStatus: 500 }),
      (err: unknown) => /friendbot failed: 500/.test((err as Error).message),
    )
  })

  it('terminates with a bounded error when the funded account never becomes visible', async () => {
    await assert.rejects(
      () => deploy({ blockAccount: true, friendbotStatus: 200 }),
      (err: unknown) => /never became visible on RPC/.test((err as Error).message),
    )
  })

  it('refuses to deploy a non-deployable manifest', async () => {
    await assert.rejects(
      () =>
        deployContract(
          {
            manifest: { ...MANIFEST, type: 'deployed' },
            config: {},
          },
          makeDeps({}),
        ),
      (err: unknown) => /not a deployable contract/.test((err as Error).message),
    )
  })
})
