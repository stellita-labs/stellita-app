import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const GUARDRAIL = path.resolve('server/_lib/guardrail.ts')
const CHAT = path.resolve('server/routes/chat.ts')

test('checkGuardrail surfaces the SDK token usage', () => {
  const src = fs.readFileSync(GUARDRAIL, 'utf-8')
  assert.match(src, /usage:\s*\{\s*\n?\s*inputTokens:/, 'must return inputTokens in usage')
  assert.match(src, /outputTokens:/, 'must return outputTokens in usage')
  assert.match(src, /const \{ object, usage \} = await generateObject\(/, 'must read usage from generateObject')
})

test('every chat request writes exactly one guardrail usage_event', () => {
  const src = fs.readFileSync(CHAT, 'utf-8')
  const guardrailRows = src.match(/kind: 'guardrail'/g) ?? []
  assert.equal(guardrailRows.length, 1, 'exactly one guardrail usage_event insert')

  // The row is written before the allowed/blocked branch, so the blocked path
  // records it too.
  const insertIdx = src.indexOf("kind: 'guardrail'")
  const branchIdx = src.indexOf('if (!guardrail.allowed)')
  assert.ok(insertIdx >= 0 && branchIdx >= 0 && insertIdx < branchIdx)

  // The generation row is still written on the success path.
  assert.match(src, /kind: 'generation'/)
  assert.match(src, /prompt_tokens: guardrailInputTokens/)
  assert.match(src, /completion_tokens: guardrailOutputTokens/)
})
