import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  MissingSecretsError,
  ensureSystemUser,
  requireSecrets,
  seedTemplates,
  type SeedAdmin,
  type SeedQuery,
  type SeedResult,
} from '../scripts/seed-templates'

type Row = Record<string, unknown>

/** In-memory stand-in for the Supabase admin client, mirroring the constraints
 *  the seeder relies on (unique (owner_id, name), unique share token, cascade). */
class FakeDb {
  users: Row[] = []
  profiles: Row[] = []
  projects: Row[] = []
  project_versions: Row[] = []
  messages: Row[] = []
  project_shares: Row[] = []
  deployed_contracts: Row[] = []
  createUserCalls = 0
  nextId = 1

  table(name: string): Row[] {
    const t = (this as unknown as Record<string, Row[]>)[name]
    assert.ok(Array.isArray(t), `unknown table ${name}`)
    return t
  }
}

class FakeQuery implements SeedQuery {
  private op: 'select' | 'insert' | 'delete' = 'select'
  private filters: [string, unknown][] = []
  private setFilters: [string, unknown[]][] = []
  private payload: Row | Row[] | null = null

  constructor(private db: FakeDb, private table: string) {}

  select(): SeedQuery {
    return this
  }

  delete(): SeedQuery {
    this.op = 'delete'
    return this
  }

  insert(values: unknown): SeedQuery {
    this.op = 'insert'
    this.payload = values as Row | Row[]
    return this
  }

  eq(column: string, value: unknown): SeedQuery {
    this.filters.push([column, value])
    return this
  }

  in(column: string, values: unknown[]): SeedQuery {
    this.setFilters.push([column, values])
    return this
  }

  private matches(row: Row): boolean {
    return (
      this.filters.every(([c, v]) => row[c] === v) &&
      this.setFilters.every(([c, vs]) => vs.includes(row[c]))
    )
  }

  private run(): SeedResult {
    const rows = this.db.table(this.table)

    if (this.op === 'select') {
      return { data: rows.filter((r) => this.matches(r)), error: null }
    }

    if (this.op === 'delete') {
      const doomed = rows.filter((r) => this.matches(r))
      for (const d of doomed) {
        if (this.table === 'projects') {
          for (const child of ['project_versions', 'messages', 'project_shares', 'deployed_contracts']) {
            const ct = this.db.table(child)
            for (let i = ct.length - 1; i >= 0; i--) {
              if (ct[i].project_id === d.id) ct.splice(i, 1)
            }
          }
        }
        rows.splice(rows.indexOf(d), 1)
      }
      return { data: null, error: null }
    }

    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
    const inserted: Row[] = []
    for (const p of payloads) {
      const row: Row = { id: (p.id as string) ?? `id-${this.db.nextId++}`, ...p }
      if (this.table === 'project_shares' && row.token == null) row.token = `tok-${row.id}`
      // Enforce the constraints the real schema declares.
      if (
        this.table === 'projects' &&
        rows.some((r) => r.owner_id === row.owner_id && r.name === row.name)
      ) {
        return {
          data: null,
          error: { message: 'duplicate key value violates unique constraint "projects_owner_name_key"' },
        }
      }
      if (this.table === 'project_shares' && rows.some((r) => r.token === row.token)) {
        return {
          data: null,
          error: { message: 'duplicate key value violates unique constraint "project_shares_token_key"' },
        }
      }
      rows.push(row)
      inserted.push(row)
    }
    return { data: Array.isArray(this.payload) ? inserted : inserted[0], error: null }
  }

  single(): Promise<SeedResult> {
    const result = this.run()
    if (Array.isArray(result.data)) {
      return Promise.resolve({ data: result.data[0] ?? null, error: result.error })
    }
    return Promise.resolve(result)
  }

  then<TResult1 = SeedResult, TResult2 = never>(
    onfulfilled?: ((value: SeedResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

class FakeAdmin implements SeedAdmin {
  db = new FakeDb()
  auth = {
    admin: {
      createUser: async (input: { email: string }) => {
        this.db.createUserCalls += 1
        const existing = this.db.users.find((u) => u.email === input.email)
        if (existing) {
          return {
            data: { user: null },
            error: { message: 'A user with this email address has already been registered' },
          }
        }
        const id = `user-${this.db.nextId++}`
        this.db.users.push({ id, email: input.email })
        // handle_new_user trigger equivalent.
        this.db.profiles.push({ id, email: input.email })
        return { data: { user: { id } }, error: null }
      },
    },
  }
  from(table: string): SeedQuery {
    return new FakeQuery(this.db, table)
  }
}

function slugTokens(admin: FakeAdmin): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of admin.db.projects) {
    const share = admin.db.project_shares.find((s) => s.project_id === p.id)
    out[p.slug as string] = share?.token as string
  }
  return out
}

test('requireSecrets throws before any write when a secret is missing', () => {
  assert.throws(() => requireSecrets({ SUPABASE_URL: 'https://x.supabase.co' }), MissingSecretsError)
  assert.throws(() => requireSecrets({}), MissingSecretsError)
  assert.throws(() => requireSecrets({}), /Missing SUPABASE_URL/)
})

test('ensureSystemUser creates once and reuses the profile afterwards', async () => {
  const admin = new FakeAdmin()
  const first = await ensureSystemUser(admin as unknown as SeedAdmin)
  const second = await ensureSystemUser(admin as unknown as SeedAdmin)
  assert.equal(first, second)
  assert.equal(admin.db.users.length, 1, 'exactly one system account')
})

test('running the seed twice leaves one row per template and no constraint error', async () => {
  const admin = new FakeAdmin()
  const fake = admin as unknown as SeedAdmin
  await seedTemplates(fake)
  const before = admin.db.projects.map((p) => `${p.slug}:${p.name}`).sort()

  await assert.doesNotReject(() => seedTemplates(fake), 'a re-seed must not hit the unique key')

  const after = admin.db.projects.map((p) => `${p.slug}:${p.name}`).sort()
  assert.deepEqual(after, before)
  assert.equal(admin.db.projects.length, 3, 'one row per template')
  assert.equal(admin.db.createUserCalls, 2, 'the second run reuses the account')
  assert.deepEqual(after, [
    'tpl-nft:NFT Collection',
    'tpl-swap:Token Swap',
    'tpl-token:Fungible Token',
  ])
})

test('re-seeding preserves each template share token', async () => {
  const admin = new FakeAdmin()
  const fake = admin as unknown as SeedAdmin
  await seedTemplates(fake)
  const before = slugTokens(admin)
  assert.equal(typeof before['tpl-token'], 'string')
  assert.equal(typeof before['tpl-nft'], 'string')
  assert.equal(typeof before['tpl-swap'], 'string')

  await seedTemplates(fake)
  const after = slugTokens(admin)
  assert.deepEqual(after, before, 'src/lib/templates.ts tokens must stay valid')
})

test('the CLI checks secrets before writing and exits non-zero on failure', () => {
  const src = fs.readFileSync(path.resolve('scripts/seed-templates.ts'), 'utf-8')
  assert.match(src, /throw new MissingSecretsError\(\)/)
  assert.match(src, /process\.exit\(1\)/)
  const mainBody = src.slice(
    src.indexOf('export async function main'),
    src.indexOf('const invokedDirectly'),
  )
  assert.ok(
    mainBody.indexOf('requireSecrets(env)') < mainBody.indexOf('seedTemplates(admin)'),
    'main must resolve secrets before it can write anything',
  )
})
