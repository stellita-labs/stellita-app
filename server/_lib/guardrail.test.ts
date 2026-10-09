import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkGuardrail,
  guardrailSystemPrompt,
  refusalMessage,
} from './guardrail.js'
import type {
  GuardrailCategory,
  GuardrailClassifier,
  GuardrailClassifierInput,
} from './guardrail.js'

const CATEGORIES: GuardrailCategory[] = [
  'build_request',
  'off_topic',
  'prompt_injection',
  'unsafe',
]

/** A classifier stub that resolves the given category and records its inputs. */
function classifierReturning(
  category: GuardrailCategory,
  calls: GuardrailClassifierInput[] = [],
): GuardrailClassifier {
  return async (input) => {
    calls.push(input)
    return { object: { category, reason: `${category} because`, refusal: 'no thanks' } }
  }
}

test('only build_request is allowed; every other category is blocked', async () => {
  for (const category of CATEGORIES) {
    const result = await checkGuardrail(
      { apiKey: 'test-key', model: 'test-model', userMessage: 'build me a dapp' },
      { classifier: classifierReturning(category) },
    )
    assert.equal(result.category, category)
    assert.equal(
      result.allowed,
      category === 'build_request',
      `category ${category} must be allowed=${category === 'build_request'}`,
    )
    assert.equal(typeof result.reason, 'string')
    assert.equal(typeof result.refusal, 'string')
  }
})

test('a thrown classifier error fails OPEN (allowed: true, classifier unavailable)', async () => {
  const throwing: GuardrailClassifier = async () => {
    throw new Error('openai 500')
  }
  const result = await checkGuardrail(
    { apiKey: 'test-key', model: 'test-model', userMessage: 'build me a dapp' },
    { classifier: throwing },
  )
  assert.equal(result.allowed, true)
  assert.equal(result.category, 'build_request')
  assert.equal(result.reason, 'classifier unavailable')
  assert.equal(result.refusal, '')
})

test('the ongoing flag changes the system prompt passed to the classifier', async () => {
  const ongoingCalls: GuardrailClassifierInput[] = []
  const freshCalls: GuardrailClassifierInput[] = []

  await checkGuardrail(
    { apiKey: 'k', model: 'm', userMessage: 'make it blue', ongoing: true },
    { classifier: classifierReturning('build_request', ongoingCalls) },
  )
  await checkGuardrail(
    { apiKey: 'k', model: 'm', userMessage: 'make it blue' },
    { classifier: classifierReturning('build_request', freshCalls) },
  )

  assert.equal(ongoingCalls.length, 1)
  assert.equal(freshCalls.length, 1)
  assert.notEqual(ongoingCalls[0].system, freshCalls[0].system)
  assert.ok(ongoingCalls[0].system.includes('ONGOING build conversation'))
  assert.equal(freshCalls[0].system.includes('ONGOING build conversation'), false)
  // The user message is passed as untrusted data, never as a system instruction.
  assert.equal(ongoingCalls[0].messages[0].role, 'user')
  assert.equal(ongoingCalls[0].messages[0].content, 'make it blue')
})

test('guardrailSystemPrompt only appends the leniency addendum when ongoing', () => {
  assert.equal(
    guardrailSystemPrompt(false).includes('ONGOING build conversation'),
    false,
  )
  assert.equal(
    guardrailSystemPrompt(undefined).includes('ONGOING build conversation'),
    false,
  )
  assert.ok(guardrailSystemPrompt(true).includes('ONGOING build conversation'))
  assert.notEqual(guardrailSystemPrompt(true), guardrailSystemPrompt(false))
})

test('refusalMessage returns a non-empty, category-specific message', () => {
  const blocked: GuardrailCategory[] = ['off_topic', 'prompt_injection', 'unsafe']
  for (const category of blocked) {
    const message = refusalMessage(category)
    assert.ok(message.length > 0, `refusal for ${category} must be non-empty`)
  }
  assert.notEqual(refusalMessage('unsafe'), refusalMessage('prompt_injection'))
})
