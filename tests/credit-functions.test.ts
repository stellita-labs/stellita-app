import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const PLANS_AND_STATUS = path.resolve(
  'supabase/migrations/20260701000002_plans_and_prompt_status.sql',
)
const CREDIT_FIX = path.resolve(
  'supabase/migrations/20260701000003_fix_credit_enforcement.sql',
)
const CALLER_GUARD = path.resolve(
  'supabase/migrations/20260701000005_restrict_consume_prompt_caller.sql',
)

function readMigration(file: string): string {
  assert.ok(fs.existsSync(file), `migration must exist: ${file}`)
  return fs.readFileSync(file, 'utf-8')
}

test('direct client edits to prompts_today still raise the privileged-fields guard', () => {
  const sql = readMigration(CREDIT_FIX)

  // A client (auth.uid() not null) that changes a guarded column is rejected...
  assert.match(sql, /auth\.uid\(\)\s+is\s+not\s+null/i)
  assert.match(sql, /new\.prompts_today\s+is\s+distinct\s+from\s+old\.prompts_today/i)
  assert.match(sql, /new\.prompts_day\s+is\s+distinct\s+from\s+old\.prompts_day/i)
  assert.match(
    sql,
    /raise\s+exception\s+'not\s+allowed\s+to\s+modify\s+privileged\s+profile\s+fields'/i,
  )

  // ...unless it is the audited counter write from consume_prompt, authorized
  // only through the transaction-local GUC that clients cannot set.
  assert.match(sql, /current_setting\('xlmcode\.allow_counter_update',\s*true\)\s*=\s*'on'/i)
  assert.match(sql, /set_config\('xlmcode\.allow_counter_update',\s*'on',\s*true\)/i)
})

test('prompt_status is read-only: it never mutates the credit counter', () => {
  const sql = readMigration(PLANS_AND_STATUS)
  const start = sql.indexOf('create or replace function prompt_status')
  const end = sql.indexOf('grant execute on function prompt_status()')
  assert.ok(start >= 0 && end > start, 'prompt_status definition must be present')
  const body = sql.slice(start, end)

  assert.match(body, /returns\s+jsonb/i)
  assert.match(body, /from\s+profiles\s+where\s+id\s*=\s*auth\.uid\(\)/i)
  assert.equal(
    /(^|\n)\s*(insert|update|delete)\s/i.test(body),
    false,
    'prompt_status must never INSERT/UPDATE/DELETE',
  )
  assert.equal(
    /set_config/i.test(body),
    false,
    'prompt_status must not authorize counter writes',
  )
})

test('usage_daily is read-only and scoped to the calling user', () => {
  const sql = readMigration(PLANS_AND_STATUS)
  const start = sql.indexOf('create or replace function usage_daily')
  assert.ok(start >= 0, 'usage_daily definition must be present')
  const body = sql.slice(start).split('grant execute')[0]

  assert.match(body, /where\s+user_id\s*=\s*auth\.uid\(\)/i)
  assert.match(body, /group\s+by\s+created_at::date/i)
  assert.match(body, /order\s+by\s+day\s+desc/i)
  assert.equal(
    /\b(insert|update|delete)\b/i.test(body),
    false,
    'usage_daily must only select',
  )
})

test('consume_prompt rejects another caller before writing anything', () => {
  const sql = readMigration(CALLER_GUARD)
  assert.match(
    sql,
    /if\s+p_user\s+is\s+distinct\s+from\s+auth\.uid\(\)\s+and\s+auth\.uid\(\)\s+is\s+not\s+null\s+then\s+raise\s+exception\s+'not\s+allowed'/i,
  )
})

test('plan caps are the documented values (hacker first-day 30, daily 20)', () => {
  const sql = readMigration(PLANS_AND_STATUS)
  assert.match(
    sql,
    /update\s+plans\s+set\s+first_day_limit\s*=\s*30,\s*daily_limit\s*=\s*20\s+where\s+name\s*=\s*'hacker'/i,
  )
  assert.match(sql, /first_day_limit\s*=\s*-1,\s*daily_limit\s*=\s*-1\s+where\s+name\s*=\s*'admin'/i)
})

type Plan = { firstDayLimit: number; dailyLimit: number }

type Profile = {
  isAdmin: boolean
  createdAtDay: number
  plan: Plan
  promptsToday: number
  promptsDay: number | null
}

/** Mirrors consume_prompt() in 20260701000005_restrict_consume_prompt_caller.sql. */
function consumePrompt(profile: Profile, today: number): Profile {
  if (profile.isAdmin) return profile

  let promptsToday = profile.promptsToday
  let promptsDay = profile.promptsDay
  if (promptsDay !== today) {
    promptsToday = 0
    promptsDay = today
  }

  const cap =
    profile.createdAtDay === today ? profile.plan.firstDayLimit : profile.plan.dailyLimit
  if (cap >= 0 && promptsToday >= cap) {
    return { ...profile, promptsToday, promptsDay }
  }
  return { ...profile, promptsToday: promptsToday + 1, promptsDay: today }
}

/** Mirrors prompt_status(): pure read, day-rollover aware, never mutates. */
function promptStatus(profile: Profile, today: number) {
  if (profile.isAdmin) {
    return { used: 0, limit: -1, remaining: -1, unlimited: true }
  }
  const used = profile.promptsDay === today ? profile.promptsToday : 0
  const cap =
    profile.createdAtDay === today ? profile.plan.firstDayLimit : profile.plan.dailyLimit
  return {
    used,
    limit: cap,
    remaining: Math.max(cap - used, 0),
    unlimited: cap < 0,
  }
}

const HACKER: Plan = { firstDayLimit: 30, dailyLimit: 20 }

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    isAdmin: false,
    createdAtDay: 0,
    plan: HACKER,
    promptsToday: 0,
    promptsDay: 0,
    ...over,
  }
}

test('consume_prompt returns true exactly cap times and false on the next call', () => {
  const cap = 3
  let profile = makeProfile({ plan: { firstDayLimit: cap, dailyLimit: cap } })
  for (let i = 0; i < cap; i++) {
    const before = profile.promptsToday
    profile = consumePrompt(profile, 0)
    assert.equal(profile.promptsToday, before + 1, `call ${i + 1} must increment`)
  }
  const atCap = consumePrompt(profile, 0)
  assert.equal(atCap.promptsToday, cap, 'the call after the cap increments nothing')
  const stillAtCap = consumePrompt(atCap, 0)
  assert.equal(stillAtCap.promptsToday, cap, 'repeated calls at cap stay flat')
})

test('a hacker at the first-day cap is rejected and nothing is incremented', () => {
  const today = 0
  const profile = makeProfile({ promptsToday: 30, promptsDay: today, createdAtDay: today })
  const next = consumePrompt(profile, today)
  assert.equal(next.promptsToday, 30)
  assert.equal(next.promptsDay, today)
})

test('prompt_status never increments prompts_today', () => {
  let profile = makeProfile({ promptsToday: 5, promptsDay: 0, createdAtDay: 0 })
  for (let i = 0; i < 5; i++) {
    const status = promptStatus(profile, 0)
    assert.equal(status.used, 5)
    assert.equal(status.limit, 30)
    assert.equal(status.remaining, 25)
    assert.equal(status.unlimited, false)
    // The status call is pure: the profile is untouched.
    assert.equal(profile.promptsToday, 5)
    assert.equal(profile.promptsDay, 0)
    profile = { ...profile }
  }
})

test('admin is unlimited: consume_prompt returns true and never increments', () => {
  const profile = makeProfile({ isAdmin: true, promptsToday: 999, promptsDay: 0 })
  const next = consumePrompt(profile, 0)
  assert.equal(next, profile)
  assert.equal(promptStatus(profile, 0).unlimited, true)
  assert.equal(promptStatus(profile, 0).limit, -1)
})

test('day rollover resets the counter exactly once', () => {
  const yesterday = 9
  const today = 10
  let profile = makeProfile({
    promptsToday: 20,
    promptsDay: yesterday,
    createdAtDay: yesterday,
    plan: HACKER,
  })

  // First call on the new day: reset to 0, then consume one -> 1.
  profile = consumePrompt(profile, today)
  assert.equal(profile.promptsToday, 1, 'rollover resets to 0 then increments')
  assert.equal(profile.promptsDay, today)

  // Second call on the same day must NOT reset again.
  profile = consumePrompt(profile, today)
  assert.equal(profile.promptsToday, 2, 'the reset happens at most once per day')
})

test('usage_daily counts only the calling user per day', () => {
  type Event = { user_id: string; day: number }
  const events: Event[] = [
    { user_id: 'me', day: 1 },
    { user_id: 'me', day: 1 },
    { user_id: 'me', day: 2 },
    { user_id: 'other', day: 1 },
  ]
  const countFor = (userId: string, days: number, today: number) => {
    const rows = events.filter(
      (e) => e.user_id === userId && e.day >= today - Math.max(days - 1, 0),
    )
    const byDay = new Map<number, number>()
    for (const e of rows) byDay.set(e.day, (byDay.get(e.day) ?? 0) + 1)
    return [...byDay.entries()].sort((a, b) => b[0] - a[0])
  }
  assert.deepEqual(countFor('me', 2, 2), [
    [2, 1],
    [1, 2],
  ])
})
