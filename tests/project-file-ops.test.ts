import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFileOps } from '../src/lib/project'
import type { FileTree } from '../shared/types'

test('create adds a new file and does not mutate the input tree', () => {
  const tree: FileTree = { '/App.tsx': 'a' }
  const next = applyFileOps(tree, [{ op: 'create', path: '/new.ts', content: 'n' }])
  assert.deepEqual(next, { '/App.tsx': 'a', '/new.ts': 'n' })
  assert.deepEqual(tree, { '/App.tsx': 'a' })
  assert.notEqual(next, tree)
})

test('edit replaces the whole file content', () => {
  const next = applyFileOps({ '/a.ts': 'old' }, [{ op: 'edit', path: '/a.ts', content: 'new' }])
  assert.deepEqual(next, { '/a.ts': 'new' })
})

test('delete removes an existing file', () => {
  const next = applyFileOps({ '/a.ts': 'x', '/b.ts': 'y' }, [{ op: 'delete', path: '/a.ts' }])
  assert.deepEqual(next, { '/b.ts': 'y' })
})

test('delete of a missing path is a no-op and never throws', () => {
  const tree: FileTree = { '/a.ts': 'x' }
  assert.doesNotThrow(() => applyFileOps(tree, [{ op: 'delete', path: '/missing.ts' }]))
  assert.deepEqual(applyFileOps(tree, [{ op: 'delete', path: '/missing.ts' }]), { '/a.ts': 'x' })
})

test('a create followed by an edit in one list yields the edited content', () => {
  const next = applyFileOps({}, [
    { op: 'create', path: '/a.ts', content: 'first' },
    { op: 'edit', path: '/a.ts', content: 'second' },
  ])
  assert.deepEqual(next, { '/a.ts': 'second' })
})

test('create then delete of the same path applies in order', () => {
  const next = applyFileOps({}, [
    { op: 'create', path: '/a.ts', content: 'x' },
    { op: 'delete', path: '/a.ts' },
  ])
  assert.deepEqual(next, {})
})

test('an empty op list returns an equal (but fresh) tree', () => {
  const tree: FileTree = { '/a.ts': 'x' }
  assert.deepEqual(applyFileOps(tree, []), tree)
})
