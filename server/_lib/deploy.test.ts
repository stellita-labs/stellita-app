import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk'
import { contractIdFromReturnValue } from './deploy'

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
