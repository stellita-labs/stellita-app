import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fileOpSchema,
  agentActionSchema,
  agentResponseSchema,
} from '../shared/schema'

test('fileOpSchema accepts the create, edit and delete variants', () => {
  for (const op of ['create', 'edit', 'delete'] as const) {
    const value =
      op === 'delete'
        ? { op, path: '/App.tsx' }
        : { op, path: '/App.tsx', content: 'export default function App(){return null}' }
    const result = fileOpSchema.safeParse(value)
    assert.equal(result.success, true, `expected "${op}" to parse`)
  }
})

test('fileOpSchema rejects a create/edit op that is missing its path', () => {
  assert.equal(fileOpSchema.safeParse({ op: 'create', content: 'x' }).success, false)
  assert.equal(fileOpSchema.safeParse({ op: 'edit', content: 'x' }).success, false)
})

test('fileOpSchema rejects an unknown op kind', () => {
  assert.equal(fileOpSchema.safeParse({ op: 'move', path: '/a', content: 'x' }).success, false)
})

test('fileOpSchema parses a delete down to just op + path', () => {
  assert.deepEqual(fileOpSchema.parse({ op: 'delete', path: '/old.ts' }), {
    op: 'delete',
    path: '/old.ts',
  })
})

test('agentActionSchema accepts every AgentAction variant', () => {
  const deploy = agentActionSchema.safeParse({
    type: 'deploy_contract',
    manifestId: 'oz-fungible-token',
    configJson: '{"name":"Demo","symbol":"DEMO"}',
    reason: 'Deploy the demo token',
  })
  const wallet = agentActionSchema.safeParse({
    type: 'create_wallet',
    label: 'Player 2',
    reason: 'Create a wallet for the second player',
  })
  assert.equal(deploy.success, true)
  assert.equal(wallet.success, true)
})

test('agentActionSchema rejects an unknown action type', () => {
  assert.equal(agentActionSchema.safeParse({ type: 'burn', reason: 'x' }).success, false)
})

test('agentResponseSchema accepts a well-formed response', () => {
  const result = agentResponseSchema.safeParse({
    message: 'Built the pricing page',
    versionName: 'Add pricing',
    files: [{ op: 'create', path: '/src/Pricing.tsx', content: 'export const Pricing = () => null' }],
    actions: [],
  })
  assert.equal(result.success, true)
})

test('agentResponseSchema keeps `actions` required and accepts an empty array for "none"', () => {
  // OpenAI strict structured outputs put every key in `required`, so unlike the
  // older AGENTS.md wording the real contract does NOT allow `actions` to be
  // omitted -- an empty array is how "no actions" is expressed.
  const omitted = agentResponseSchema.safeParse({
    message: 'hi',
    versionName: 'v',
    files: [],
  })
  assert.equal(omitted.success, false)
  const empty = agentResponseSchema.safeParse({
    message: 'hi',
    versionName: 'v',
    files: [],
    actions: [],
  })
  assert.equal(empty.success, true)
})

test('agentResponseSchema reports the offending field in the Zod issue path', () => {
  const result = agentResponseSchema.safeParse({
    message: 123,
    versionName: 'v',
    files: [],
    actions: [],
  })
  assert.equal(result.success, false)
  if (!result.success) {
    assert.ok(
      result.error.issues.some((issue) => issue.path.join('.') === 'message'),
      `expected an issue on "message", got ${JSON.stringify(result.error.issues.map((i) => i.path))}`,
    )
  }
})
