import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCommitMessage } from '../scripts/commit-message.js'

test('accepts a Conventional Commit subject', () => {
  assert.deepEqual(
    validateCommitMessage('fix(chat): stop swallowing persistence errors\n\nmore detail'),
    [],
  )
})

test('rejects a subject without a type', () => {
  const errors = validateCommitMessage('updated the readme')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Conventional Commits/)
})

test('rejects an AI Co-Authored-By trailer', () => {
  const errors = validateCommitMessage(
    'feat: add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /AI attribution/)
})

test('allows a human Co-Authored-By trailer', () => {
  assert.deepEqual(
    validateCommitMessage('feat: add thing\n\nCo-Authored-By: Jane Dev <jane@example.com>'),
    [],
  )
})
