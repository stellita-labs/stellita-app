import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parsePersistSentinel } from '../src/lib/api.js'

test('parsePersistSentinel reads a trailing saved:false sentinel', () => {
  const stream = '{"message":"done","files":[]}\n{"saved":false,"error":"save_failed"}\n'
  assert.deepEqual(parsePersistSentinel(stream), { saved: false })
})

test('parsePersistSentinel reads a trailing saved:true sentinel', () => {
  assert.deepEqual(parsePersistSentinel('{"message":"ok"}\n{"saved":true}\n'), { saved: true })
})

test('parsePersistSentinel returns null when absent', () => {
  assert.equal(parsePersistSentinel('{"message":"hi","files":[]}'), null)
})

test('chat.ts emits the sentinel and logs the failure with the project id', () => {
  const src = fs.readFileSync(path.resolve('server/routes/chat.ts'), 'utf-8')
  assert.match(src, /saved: false, error: 'save_failed'/)
  assert.match(src, /saved: true/)
  assert.match(src, /persistence error for project \$\{id\}/)
  // The raw error is never serialized into the response.
  assert.ok(!/JSON\.stringify\(\s*\{\s*saved[^}]*persistErr/.test(src))
})
