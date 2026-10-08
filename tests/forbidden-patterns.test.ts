import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const BUDGET_FILE = path.resolve('scripts/forbidden-patterns-budget.json')
const SCRIPT_FILE = path.resolve('scripts/check-forbidden-patterns.ts')

test('budget file exists, contains date and per-directory pattern counts', () => {
  assert.ok(fs.existsSync(BUDGET_FILE), 'Budget file must exist')
  const content = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'))

  assert.ok(content.date, 'Budget file must specify date')
  assert.match(content.date, /^\d{4}-\d{2}-\d{2}$/, 'Date must be ISO format (YYYY-MM-DD)')
  assert.ok(content.budgets, 'Budget file must specify budgets')
  assert.ok(content.budgets.src, 'src directory must have budgets')
  assert.equal(typeof content.budgets.src['as any'], 'number')
  assert.equal(typeof content.budgets.src[': any'], 'number')
  assert.equal(typeof content.budgets.src['@ts-ignore'], 'number')
  assert.equal(typeof content.budgets.src['console.'], 'number')
})

test('check-forbidden-patterns passes on current codebase', () => {
  assert.ok(fs.existsSync(SCRIPT_FILE), 'Script file must exist')
  const output = execFileSync('npx', ['tsx', 'scripts/check-forbidden-patterns.ts'], {
    encoding: 'utf8',
  })
  assert.ok(output.includes('✅ All forbidden pattern counts are within budget.'))
})

test('adding one new "as any" under src fails the check with file and line', () => {
  const dummyFile = path.resolve('src/dummy-test-violation.ts')
  fs.writeFileSync(dummyFile, 'export const bad = (x as any)\n', 'utf8')

  try {
    let threw = false
    try {
      execFileSync('npx', ['tsx', 'scripts/check-forbidden-patterns.ts'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    } catch (err: unknown) {
      threw = true
      const stderr = (err as { stderr?: string }).stderr ?? ''
      const stdout = (err as { stdout?: string }).stdout ?? ''
      const combined = `${stdout}\n${stderr}`
      assert.ok(combined.includes('EXCEEDED BUDGET: "as any"'), 'Must report exceeded budget for as any')
      assert.ok(combined.includes('src/dummy-test-violation.ts:1'), 'Must report file and line')
    }
    assert.ok(threw, 'Check must fail when new as any is introduced')
  } finally {
    if (fs.existsSync(dummyFile)) {
      fs.unlinkSync(dummyFile)
    }
  }
})
