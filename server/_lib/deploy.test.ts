import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, nativeToScVal, scValToNative } from '@stellar/stellar-sdk'
import type { ManifestConfigField } from '../../shared/types'
import { contractIdFromReturnValue, scTypeOf, toScVal } from './deploy'

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
describe('scTypeOf', () => {
  it('derives the scval type from the field UI type', () => {
    assert.equal(scTypeOf({ key: 'name', label: 'Name', type: 'string' }), 'string')
    assert.equal(scTypeOf({ key: 'owner', label: 'Owner', type: 'address' }), 'address')
    assert.equal(scTypeOf({ key: 'supply', label: 'Supply', type: 'number' }), 'i128')
  })

  it('honours an explicit scType override', () => {
    assert.equal(scTypeOf({ key: 'n', label: 'N', type: 'number', scType: 'u32' }), 'u32')
  })
})

describe('toScVal', () => {
  const deployerPk = Keypair.random().publicKey()

  it('encodes every scType the manifests use', () => {
    assert.equal(toScVal('Demo', 'string', deployerPk).switch().name, 'scvString')
    assert.equal(toScVal(deployerPk, 'address', deployerPk).switch().name, 'scvAddress')
    assert.equal(toScVal(1000, 'i128', deployerPk).switch().name, 'scvI128')
    assert.equal(toScVal(7, 'u32', deployerPk).switch().name, 'scvU32')
    assert.equal(toScVal(7, 'u64', deployerPk).switch().name, 'scvU64')
    assert.equal(toScVal(true, 'bool', deployerPk).switch().name, 'scvBool')
  })

  it('resolves the {{deployer}} placeholder to the deployer public key', () => {
    const val = toScVal('{{deployer}}', 'address', deployerPk)
    assert.equal(String(scValToNative(val)), deployerPk)
  })

  it('resolves a manifest default placeholder (oz-nft owner)', () => {
    const owner: ManifestConfigField = {
      key: 'owner',
      label: 'Owner',
      type: 'address',
      default: '{{deployer}}',
    }
    const val = toScVal(owner.default, scTypeOf(owner), deployerPk, owner.key)
    assert.equal(String(scValToNative(val)), deployerPk)
  })

  it('throws a clear error naming the field and the unsupported type', () => {
    assert.throws(
      () => toScVal('x', 'blob', deployerPk, 'uri'),
      (err: unknown) =>
        err instanceof Error && err.message.includes('uri') && err.message.includes('blob'),
    )
  })
})
