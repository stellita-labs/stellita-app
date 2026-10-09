import test from 'node:test'
import assert from 'node:assert/strict'
import { initialFileTree } from '../src/lib/project'

const tree = initialFileTree()

test('the scaffold contains the Sandpack entry component', () => {
  assert.ok('/App.tsx' in tree, 'expected the /App.tsx entry the classic bundler runs')
  assert.match(tree['/App.tsx'], /export default function App/)
})

test('the on-chain dev kit is scaffolded', () => {
  for (const p of ['/polyfills.ts', '/stellar.ts', '/contracts.ts']) {
    assert.ok(p in tree, `expected dev-kit file ${p}`)
  }
})

test('the base project files are scaffolded', () => {
  for (const p of ['/package.json', '/README.md', '/public/index.html']) {
    assert.ok(p in tree, `expected base file ${p}`)
  }
})

test('the scaffolded package.json is valid JSON and carries the dev-kit deps', () => {
  const pkg = JSON.parse(tree['/package.json']) as {
    dependencies: Record<string, string>
  }
  assert.equal(typeof pkg, 'object')
  assert.ok(pkg.dependencies['@stellar/stellar-sdk'], 'expected stellar-sdk dependency')
  assert.ok(pkg.dependencies['@stellar/freighter-api'], 'expected freighter-api dependency')
  assert.ok(pkg.dependencies.buffer, 'expected the buffer polyfill dependency')
})

test('the /stellar.ts dev kit imports the Stellar SDK', () => {
  assert.match(tree['/stellar.ts'], /@stellar\/stellar-sdk/)
})

test('every relative import in the scaffolded App resolves to a scaffolded file', () => {
  const imports = [...tree['/App.tsx'].matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1])
  for (const spec of imports) {
    const base = '/' + spec.replace(/^\.\//, '').replace(/\.tsx?$/, '')
    const candidates = [base, base + '.ts', base + '.tsx']
    assert.ok(candidates.some((c) => c in tree), `unresolved scaffold import ${spec}`)
  }
})
