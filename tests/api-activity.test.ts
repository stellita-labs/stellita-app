import test from 'node:test'
import assert from 'node:assert/strict'
import { parseActivity } from '../src/lib/api'

test('pairs each op with its adjacent path in stream order', () => {
  const stream =
    '{"files":[{"op":"create","path":"/App.tsx","content":"x"},' +
    '{"op":"delete","path":"/old.ts"}]}'
  assert.deepEqual(parseActivity(stream), [
    { op: 'create', path: '/App.tsx' },
    { op: 'delete', path: '/old.ts' },
  ])
})

test('a "path" literal inside file content no longer shifts the pairing', () => {
  const stream =
    '{"files":[{"op":"delete","path":"/old.ts","content":"fetch(\\"path\\")"},' +
    '{"op":"create","path":"/new.ts","content":"x"}]}'
  assert.deepEqual(parseActivity(stream), [
    { op: 'delete', path: '/old.ts' },
    { op: 'create', path: '/new.ts' },
  ])
})

test('a "path" appearing before the first op is ignored', () => {
  const stream = '{"note":"the \\"path\\" key is reserved","op":"create","path":"/App.tsx"}'
  assert.deepEqual(parseActivity(stream), [{ op: 'create', path: '/App.tsx' }])
})

test('a stream with more paths than ops only reports the paired ops', () => {
  const stream = '{"op":"create","path":"/a.ts","content":"\\"path\\": \\"/b.ts\\""}'
  assert.deepEqual(parseActivity(stream), [{ op: 'create', path: '/a.ts' }])
})

test('a stream with no ops returns [] without undefined entries', () => {
  assert.deepEqual(parseActivity('{"files":[]}'), [])
  assert.deepEqual(parseActivity('not json at all'), [])
})
