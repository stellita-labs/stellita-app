import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStreamingMessage } from '../src/lib/api'

test('returns an empty string before the "message" key appears', () => {
  assert.equal(parseStreamingMessage(''), '')
  assert.equal(parseStreamingMessage('{"versionName":"Add'), '')
})

test('reads a complete message value', () => {
  assert.equal(
    parseStreamingMessage('{"message":"Hello world","versionName":"x"}'),
    'Hello world',
  )
})

test('decodes escaped quotes inside the message', () => {
  assert.equal(
    parseStreamingMessage('{"message":"she said \\"hi\\"","versionName":"x"}'),
    'she said "hi"',
  )
})

test('decodes \\n escapes inside the message', () => {
  assert.equal(
    parseStreamingMessage('{"message":"line1\\nline2"}'),
    'line1\nline2',
  )
})

test('keeps the literal text "path" inside the message', () => {
  assert.equal(
    parseStreamingMessage('{"message":"set \\"path\\" to /App.tsx"}'),
    'set "path" to /App.tsx',
  )
})

test('returns the partial value for an unterminated string without throwing', () => {
  assert.doesNotThrow(() => parseStreamingMessage('{"message":"half a sentence'))
  assert.equal(parseStreamingMessage('{"message":"half a sentence'), 'half a sentence')
})

test('ignores text that appears after the closing quote of the message', () => {
  assert.equal(
    parseStreamingMessage('{"message":"first","versionName":"second"}'),
    'first',
  )
})

test('a trailing lone backslash is dropped, never throws', () => {
  assert.equal(parseStreamingMessage('{"message":"trail\\'), 'trail')
})
