import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContractsFile } from '../src/lib/contracts'
import type { DeployedContract } from '../shared/types'

function contract(over: Partial<DeployedContract> = {}): DeployedContract {
  return {
    manifestId: 'oz-fungible-token',
    name: 'Fungible Token',
    category: 'token',
    contractId: 'CABCDEF',
    network: 'testnet',
    explorerUrl: 'https://stellar.expert/explorer/testnet/contract/CABCDEF',
    deployer: 'GDEPLOYER',
    config: { owner: 'GOWNER' },
    createdAt: 0,
    ...over,
  }
}

test('an empty contract list still emits a valid object literal', () => {
  const src = buildContractsFile([])
  assert.match(src, /export const CONTRACTS = \{/)
  assert.match(src, /\} as const/)
  assert.match(src, /export const VIEW_SOURCE = ""/)
  assert.match(src, /export type ContractKey = keyof typeof CONTRACTS/)
})

test('each contract is keyed by its manifest id, hyphens preserved', () => {
  const src = buildContractsFile([contract(), contract({ manifestId: 'oz-nft', name: 'NFT' })])
  assert.ok(src.includes('"oz-fungible-token": {'))
  assert.ok(src.includes('"oz-nft": {'))
})

test('entries carry category, contractId, owner and explorerUrl', () => {
  const src = buildContractsFile([contract()])
  assert.ok(src.includes('category: "token"'))
  assert.ok(src.includes('contractId: "CABCDEF"'))
  assert.ok(src.includes('owner: "GOWNER"'))
  assert.ok(src.includes('explorerUrl: "https://stellar.expert/explorer/testnet/contract/CABCDEF"'))
})

test('owner falls back to the deployer when config.owner is absent', () => {
  const src = buildContractsFile([contract({ config: {} })])
  assert.ok(src.includes('owner: "GDEPLOYER"'))
})

test('VIEW_SOURCE uses the first deployer present', () => {
  const src = buildContractsFile([
    contract({ deployer: undefined }),
    contract({ deployer: 'GSECOND' }),
  ])
  assert.match(src, /export const VIEW_SOURCE = "GSECOND"/)
})

test('injection-shaped ids and names cannot break out of their string literal', () => {
  const src = buildContractsFile([
    contract({ manifestId: 'x"; globalThis.PWNED = true; //', name: 'quote" name' }),
  ])
  assert.equal(src.includes('"x"; globalThis.PWNED'), false, 'raw breakout must not appear')
  assert.ok(src.includes('"x\\"; globalThis.PWNED'), 'the id must be JSON-escaped')
  assert.ok(src.includes('"quote\\" name"'), 'the name must be JSON-escaped')
})
