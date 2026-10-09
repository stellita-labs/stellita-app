import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { applyFileOps, injectDappPlumbing } from '../src/lib/project'
import type { DeployedContract, FileOp, FileTree } from '../shared/types'

const STORE = path.resolve('src/projects/store.tsx')

function readStore(): string {
  assert.ok(fs.existsSync(STORE), 'store must exist')
  return fs.readFileSync(STORE, 'utf-8')
}

function sliceBetween(src: string, from: string, to: string): string {
  const start = src.indexOf(from)
  const end = src.indexOf(to, start + from.length)
  assert.ok(start >= 0 && end > start, `expected "${from}" before "${to}"`)
  return src.slice(start, end)
}

test('applyFileOps applies create/edit/delete as a pure transition', () => {
  const base: FileTree = { '/App.tsx': 'a', '/keep.ts': 'k' }
  const ops: FileOp[] = [
    { op: 'create', path: '/lib.ts', content: 'x' },
    { op: 'edit', path: '/App.tsx', content: 'b' },
    { op: 'delete', path: '/keep.ts' },
  ]
  const next = applyFileOps(base, ops)
  assert.deepEqual(next, { '/App.tsx': 'b', '/lib.ts': 'x' })
  assert.deepEqual(base, { '/App.tsx': 'a', '/keep.ts': 'k' }, 'input must not mutate')
})

test('injectDappPlumbing adds the dev kit idempotently', () => {
  const once = injectDappPlumbing({ '/App.tsx': 'x' })
  assert.ok(once['/stellar.ts'], 'must add /stellar.ts')
  assert.ok(once['/polyfills.ts'], 'must add /polyfills.ts')
  assert.ok(once['/package.json'], 'must add /package.json')
  assert.deepEqual(injectDappPlumbing(once), once, 'injecting twice is a no-op')
})

test('renameProject does not bump generation (no Sandpack remount)', () => {
  const block = sliceBetween(readStore(), 'const renameProject =', 'const setVisibility =')
  assert.match(block, /patch\(slug, \{ name: trimmed \}\)/)
  assert.equal(/generation/.test(block), false, 'a rename must not remount Sandpack')
})

test('syncFiles syncs editor edits without bumping generation', () => {
  const block = sliceBetween(readStore(), 'const syncFiles =', 'const discardEdits =')
  assert.match(block, /patch\(slug, \{ fileTree: files, dirty \}\)/)
  assert.equal(/generation/.test(block), false, 'typing must not remount Sandpack')
})

test('every content-changing transition bumps generation', () => {
  const src = readStore()
  const blocks: [string, string][] = [
    ['const openVersion =', 'const restoreVersion ='],
    ['const restoreVersion =', 'const syncFiles ='],
    ['const discardEdits =', 'const markSaved ='],
    ['const createEntry =', 'const deleteEntry ='],
    ['const deleteEntry =', 'const addDeployedContract ='],
    ['const addDeployedContract =', 'const renameProject ='],
  ]
  for (const [from, to] of blocks) {
    const block = sliceBetween(src, from, to)
    assert.match(block, /generation:\s*p\.generation \+ 1/, `${from} must bump generation`)
  }
})

test('addDeployedContract dedups per manifest and injects /contracts.ts', () => {
  const block = sliceBetween(readStore(), 'const addDeployedContract =', 'const renameProject =')
  assert.match(
    block,
    /p\.contracts\.findIndex\(\(c\) => c\.manifestId === contract\.manifestId\)/,
    'a repeat deploy of the same manifest must replace, not append',
  )
  assert.match(block, /\[CONTRACTS_FILE\]: buildContractsFile\(contracts\)/)
})

type StoreState = {
  name: string
  fileTree: FileTree
  savedFileTree: FileTree
  generation: number
  dirty: boolean
  contracts: DeployedContract[]
}

function makeState(over: Partial<StoreState> = {}): StoreState {
  const fileTree: FileTree = { '/App.tsx': 'a' }
  return {
    name: 'X',
    fileTree,
    savedFileTree: { ...fileTree },
    generation: 1,
    dirty: false,
    contracts: [],
    ...over,
  }
}

function syncFiles(s: StoreState, files: FileTree): StoreState {
  return { ...s, fileTree: files, dirty: JSON.stringify(files) !== JSON.stringify(s.savedFileTree) }
}

function markSaved(s: StoreState): StoreState {
  return { ...s, savedFileTree: s.fileTree, dirty: false }
}

function discardEdits(s: StoreState): StoreState {
  return { ...s, fileTree: s.savedFileTree, dirty: false, generation: s.generation + 1 }
}

function rename(s: StoreState, name: string): StoreState {
  return { ...s, name }
}

function contract(manifestId: string): DeployedContract {
  return {
    manifestId,
    name: manifestId,
    category: 'token',
    contractId: `C-${manifestId}`,
    network: 'testnet',
    explorerUrl: `https://stellar.expert/explorer/testnet/contract/C-${manifestId}`,
    config: {},
    createdAt: 0,
  }
}

function buildContractsFile(contracts: DeployedContract[]): string {
  const entries = contracts.map((c) => `  ${JSON.stringify(c.manifestId)}: {},`).join('\n')
  return `export const CONTRACTS = {\n${entries}\n} as const\n`
}

function addDeployedContract(s: StoreState, next: DeployedContract): StoreState {
  const existing = s.contracts.findIndex((c) => c.manifestId === next.manifestId)
  const contracts =
    existing === -1
      ? [...s.contracts, next]
      : s.contracts.map((c, i) => (i === existing ? next : c))
  const fileTree: FileTree = {
    ...injectDappPlumbing(s.fileTree),
    '/contracts.ts': buildContractsFile(contracts),
  }
  return { ...s, contracts, fileTree, savedFileTree: fileTree, dirty: false, generation: s.generation + 1 }
}

test('dirty is false right after markSaved and after discardEdits', () => {
  let s = makeState()
  s = syncFiles(s, { '/App.tsx': 'edited' })
  assert.equal(s.dirty, true, 'an edit marks the project dirty')
  s = markSaved(s)
  assert.equal(s.dirty, false, 'markSaved clears dirty')
  assert.equal(s.generation, 1, 'markSaved does not remount Sandpack')
  s = syncFiles(s, { '/App.tsx': 'edited-again' })
  assert.equal(s.dirty, true)
  s = discardEdits(s)
  assert.equal(s.dirty, false, 'discardEdits clears dirty')
  assert.deepEqual(s.fileTree, s.savedFileTree, 'discardEdits restores savedFileTree')
  assert.equal(s.generation, 2, 'discardEdits remounts Sandpack')
})

test('a rename never changes generation or dirty', () => {
  const s = makeState({ dirty: true, generation: 4 })
  const renamed = rename(s, 'New name')
  assert.equal(renamed.name, 'New name')
  assert.equal(renamed.generation, 4)
  assert.equal(renamed.dirty, true)
})

test('deploying the same manifest twice does not duplicate /contracts.ts', () => {
  let s = makeState()
  s = addDeployedContract(s, contract('fungible-token'))
  s = addDeployedContract(s, contract('fungible-token'))
  assert.equal(s.contracts.length, 1, 'one entry per manifest')
  const contractKeys = Object.keys(s.fileTree).filter((k) => k === '/contracts.ts')
  assert.equal(contractKeys.length, 1, '/contracts.ts is a single file entry')
  const occurrences = s.fileTree['/contracts.ts'].split('"fungible-token"').length - 1
  assert.equal(occurrences, 1, 'the manifest appears exactly once in the registry')
})

test('deploying two different manifests keeps both registrations', () => {
  let s = makeState()
  s = addDeployedContract(s, contract('fungible-token'))
  s = addDeployedContract(s, contract('nft-collection'))
  assert.deepEqual(s.contracts.map((c) => c.manifestId), ['fungible-token', 'nft-collection'])
  assert.ok(s.fileTree['/contracts.ts'].includes('"fungible-token"'))
  assert.ok(s.fileTree['/contracts.ts'].includes('"nft-collection"'))
})
