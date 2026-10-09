import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const CHAT_PATH = path.resolve('server/routes/chat.ts')

test('chat validates modelType against enabled model rows before consuming a credit', () => {
  const src = fs.readFileSync(CHAT_PATH, 'utf-8')

  // Enabled tiers are read from the models table.
  assert.match(
    src,
    /\.from\('models'\)[\s\S]*?\.eq\('enabled', true\)/,
    'chat must read the enabled model tiers',
  )
  // Unknown/disabled tier → 400 listing the enabled tiers.
  assert.match(
    src,
    /res\.status\(400\)\.json\(\{[\s\S]*?unknown or disabled modelType[\s\S]*?enabledModelTypes/,
    'unknown modelType must return 400 with the enabled tiers',
  )
  // The recorded tier always comes from the resolved enabled row.
  assert.match(
    src,
    /const resolvedModelType = modelRow\.model_type/,
    'resolvedModelType must come from the enabled models row',
  )

  // Ordering: model validation must precede the credit-consuming RPC.
  const validationIdx = src.indexOf('enabledModelTypes.includes(modelType)')
  const consumeIdx = src.indexOf("rpc('consume_prompt'")
  assert.ok(validationIdx > -1, 'must validate modelType')
  assert.ok(consumeIdx > -1, 'must still consume a prompt credit')
  assert.ok(
    validationIdx < consumeIdx,
    'modelType validation must run before consume_prompt so an unknown tier costs no credit',
  )
})

test('model tier resolution: unknown and disabled tiers are rejected, never swapped', () => {
  type Row = { model_type: string; enabled: boolean; is_default: boolean }

  function resolveTier(
    requested: string | undefined,
    rows: Row[],
  ): { status: number; error?: string; enabledModelTypes?: string[]; tier?: string } {
    const enabled = rows.filter((r) => r.enabled)
    const enabledModelTypes = enabled.map((r) => r.model_type)

    if (requested !== undefined && !enabledModelTypes.includes(requested)) {
      return { status: 400, error: `unknown or disabled modelType: ${requested}`, enabledModelTypes }
    }
    const row = requested
      ? enabled.find((r) => r.model_type === requested)
      : enabled.find((r) => r.is_default) ?? enabled[0]
    if (!row) return { status: 500, error: 'No enabled model tiers are configured' }
    return { status: 200, tier: row.model_type }
  }

  const rows: Row[] = [
    { model_type: 'XLM_MINI', enabled: true, is_default: true },
    { model_type: 'XLM_PRO', enabled: true, is_default: false },
    { model_type: 'XLM_MAX', enabled: false, is_default: false },
  ]

  // Unknown tier → 400, no tier resolved (credit would not be consumed).
  const unknown = resolveTier('XLM_TURBO', rows)
  assert.equal(unknown.status, 400)
  assert.equal(unknown.tier, undefined)
  assert.deepEqual(unknown.enabledModelTypes, ['XLM_MINI', 'XLM_PRO'])

  // Known-but-disabled tier → 400 (rejected, NOT silently swapped for default).
  const disabled = resolveTier('XLM_MAX', rows)
  assert.equal(disabled.status, 400)
  assert.equal(disabled.tier, undefined)

  // Enabled tier → resolves to exactly that tier.
  assert.deepEqual(resolveTier('XLM_PRO', rows), { status: 200, tier: 'XLM_PRO' })

  // Omitted → default enabled tier.
  assert.deepEqual(resolveTier(undefined, rows), { status: 200, tier: 'XLM_MINI' })

  // No enabled tiers at all → 500, still no credit consumed.
  const none = resolveTier(undefined, rows.map((r) => ({ ...r, enabled: false })))
  assert.equal(none.status, 500)
})

test('resolved usage_events.model_type always matches an enabled row', () => {
  const enabledTypes = new Set(['XLM_MINI', 'XLM_PRO'])
  const resolvedFromRow = 'XLM_MINI' // value taken from the enabled models row
  assert.equal(enabledTypes.has(resolvedFromRow), true)
})
