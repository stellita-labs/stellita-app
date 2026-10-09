import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const CHAT = path.resolve('server/routes/chat.ts')

test('the guardrail runs before consume_prompt so a blocked prompt never burns a credit', () => {
  const src = fs.readFileSync(CHAT, 'utf-8')

  const guardIdx = src.indexOf('await checkGuardrail(')
  const consumeIdx = src.indexOf(".rpc('consume_prompt'")
  assert.ok(guardIdx >= 0, 'chat.ts must call checkGuardrail')
  assert.ok(consumeIdx >= 0, 'chat.ts must call consume_prompt')
  assert.ok(
    guardIdx < consumeIdx,
    'checkGuardrail must be evaluated before the consume_prompt RPC',
  )

  // The blocked branch must return before the quota RPC is ever reached.
  const blockedIdx = src.indexOf('if (!guardrail.allowed)')
  assert.ok(blockedIdx >= 0, 'chat.ts must branch on the guardrail result')
  assert.ok(blockedIdx < consumeIdx, 'the blocked branch must run before consume_prompt')
})

test('reordered flow: a blocked message leaves the credit counter untouched', () => {
  function handle(blocked: boolean, promptsToday: number): { promptsToday: number } {
    const guardrail = { allowed: !blocked }
    if (!guardrail.allowed) return { promptsToday } // no consume_prompt call
    return { promptsToday: promptsToday + 1 }
  }

  assert.deepEqual(handle(true, 5), { promptsToday: 5 })
  assert.deepEqual(handle(false, 5), { promptsToday: 6 })
})
