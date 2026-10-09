import test from 'node:test'
import assert from 'node:assert/strict'
import { buildExportTree } from '../src/lib/export'
import type { FileTree } from '../shared/types'

const APP: FileTree = {
  '/App.tsx': 'export default function App(){return null}',
  '/polyfills.ts': '// buffer polyfill',
  '/stellar.ts': '// soroban client',
  '/contracts.ts': '// deployed contract registry',
  '/components/Hero.tsx': 'export const Hero = () => null',
  '/src/lib/format.ts': 'export const fmt = (x: string) => x',
}

test('the on-chain dev kit is exported as importable modules', () => {
  const out = buildExportTree(APP)
  for (const p of ['/src/polyfills.ts', '/src/stellar.ts', '/src/contracts.ts']) {
    assert.ok(p in out, `expected dev-kit file ${p} in the export`)
  }
})

test('the real Vite scaffold triple is always present', () => {
  const out = buildExportTree({})
  for (const p of ['/package.json', '/tsconfig.json', '/vite.config.ts']) {
    assert.ok(p in out, `expected scaffold file ${p}`)
  }
})

test('a tree without package.json still exports a valid package.json', () => {
  const out = buildExportTree({ '/App.tsx': 'x' })
  assert.ok('/package.json' in out)
  assert.doesNotThrow(() => JSON.parse(out['/package.json']))
})

test('app files move under /src and keep POSIX relative paths', () => {
  const out = buildExportTree(APP)
  assert.equal(out['/src/App.tsx'], APP['/App.tsx'])
  assert.equal(out['/src/components/Hero.tsx'], APP['/components/Hero.tsx'])
  assert.equal(out['/src/lib/format.ts'], APP['/src/lib/format.ts'])
  for (const p of Object.keys(out)) assert.equal(p.includes('\\'), false)
})

test('preview-only package/README/index are replaced by the real scaffold', () => {
  const out = buildExportTree({ '/package.json': 'stale', '/README.md': 'stale', '/index.html': 'stale' })
  assert.notEqual(out['/package.json'], 'stale')
  assert.notEqual(out['/README.md'], 'stale')
  assert.notEqual(out['/index.html'], 'stale')
  assert.ok('/index.html' in out)
})
