import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const TEMPLATE_MIGRATION = path.resolve(
  'supabase/migrations/20260628000003_templates_clone_delete.sql',
)
const TEMPLATE_CONTRACTS = path.resolve(
  'supabase/migrations/20260628000004_clone_copies_template_contracts.sql',
)
const CONTRACT_CLONE = path.resolve(
  'supabase/migrations/20260628000006_clone_copies_contracts.sql',
)
const VISIBILITY_CLONE = path.resolve(
  'supabase/migrations/20260701000005_clone_honours_visibility.sql',
)

function readMigration(file: string): string {
  assert.ok(fs.existsSync(file), `migration must exist: ${file}`)
  return fs.readFileSync(file, 'utf-8')
}

test('projects_owner_name_key unique (owner_id, name) backs clone name dedup', () => {
  const sql = readMigration(TEMPLATE_MIGRATION)
  assert.match(
    sql,
    /alter\s+table\s+projects\s+add\s+constraint\s+projects_owner_name_key\s+unique\s*\(\s*owner_id,\s*name\s*\)/i,
  )
})

test('clone_project dedups the name as (Clone), (Clone 1), (Clone 2)...', () => {
  const sql = readMigration(VISIBILITY_CLONE)
  assert.match(sql, /create\s+or\s+replace\s+function\s+clone_project/i)
  assert.match(sql, /candidate\s*:=\s*src\.name\s*\|\|\s*'\s*\(Clone\)'/i)
  assert.match(
    sql,
    /while\s+exists\s*\(\s*select\s+1\s+from\s+projects\s+where\s+owner_id\s*=\s*\(select\s+auth\.uid\(\)\)\s+and\s+name\s*=\s*candidate\s*\)/i,
  )
  assert.match(sql, /candidate\s*:=\s*src\.name\s*\|\|\s*'\s*\(Clone\s*'\s*\|\|\s*i\s*\|\|\s*'\)'/i)
})

test('clone_project derives a distinct random slug from the source slug', () => {
  const sql = readMigration(VISIBILITY_CLONE)
  assert.match(
    sql,
    /new_slug\s*:=\s*left\(src\.slug,\s*40\)\s*\|\|\s*'-'\s*\|\|\s*substr\(replace\(gen_random_uuid\(\)::text,\s*'-',\s*''\),\s*1,\s*8\)/i,
  )
})

test('the current clone_project always copies deployed_contracts rows', () => {
  const current = readMigration(VISIBILITY_CLONE)
  assert.match(
    current,
    /insert\s+into\s+deployed_contracts[\s\S]*?from\s+deployed_contracts\s+where\s+project_id\s*=\s*p_source/i,
  )
  assert.equal(
    /if\s+src\.is_template\s+then/i.test(current),
    false,
    'the latest clone_project copies contracts unconditionally',
  )

  // Historical context: the intermediate rewrite gated the copy on templates.
  const gated = readMigration(TEMPLATE_CONTRACTS)
  assert.match(gated, /if\s+src\.is_template\s+then[\s\S]*?deployed_contracts/i)

  // And the following rewrite made it unconditional again.
  const unconditional = readMigration(CONTRACT_CLONE)
  assert.match(
    unconditional,
    /insert\s+into\s+deployed_contracts[\s\S]*?from\s+deployed_contracts\s+where\s+project_id\s*=\s*p_source/i,
  )
  assert.equal(/if\s+src\.is_template\s+then/i.test(unconditional), false)
})

type Project = {
  id: string
  owner_id: string
  is_template: boolean
  visibility: 'private' | 'link'
  name: string
  slug: string
}

type Share = { project_id: string; token: string }

/** Mirrors the name-dedup loop in clone_project. */
function nextCloneName(baseName: string, existingNames: Set<string>): string {
  let candidate = `${baseName} (Clone)`
  let i = 0
  while (existingNames.has(candidate)) {
    i += 1
    candidate = `${baseName} (Clone ${i})`
  }
  return candidate
}

/** Mirrors the randomised slug derivation. */
function deriveSlug(sourceSlug: string, randomHex8: string): string {
  return `${sourceSlug.slice(0, 40)}-${randomHex8}`
}

/** Mirrors the authorisation branch of the current clone_project. */
function canClone(
  project: Project,
  callerUid: string,
  shareToken: string | null,
  shares: Share[],
): boolean {
  if (project.owner_id === callerUid) return true
  if (project.is_template) return true
  return (
    shareToken !== null &&
    project.visibility === 'link' &&
    shares.some((s) => s.project_id === project.id && s.token === shareToken)
  )
}

test('three sequential clones never violate projects_owner_name_key', () => {
  const existing = new Set<string>()
  const names: string[] = []
  for (let i = 0; i < 3; i++) {
    const name = nextCloneName('X', existing)
    assert.equal(existing.has(name), false, 'a candidate must never collide')
    existing.add(name)
    names.push(name)
  }
  assert.deepEqual(names, ['X (Clone)', 'X (Clone 1)', 'X (Clone 2)'])
  assert.equal(new Set(names).size, 3)
})

test('all clone slugs are distinct and derived from the source slug', () => {
  const sourceSlug = 'my-project'
  const slugs = new Set<string>()
  for (const hex of ['aaaaaaaa', 'bbbbbbbb', 'cccccccc']) {
    const slug = deriveSlug(sourceSlug, hex)
    assert.ok(slug.startsWith('my-project-'), 'slug must derive from the source slug')
    slugs.add(slug)
  }
  assert.equal(slugs.size, 3, 'random suffixes keep slugs distinct')
})

test('a token-less clone of a foreign private project is not allowed', () => {
  const foreignPrivate: Project = {
    id: 'p1',
    owner_id: 'owner',
    is_template: false,
    visibility: 'private',
    name: 'Secret',
    slug: 'secret',
  }
  assert.equal(canClone(foreignPrivate, 'intruder', null, []), false)
  // A stale token on a now-private project is also rejected.
  assert.equal(
    canClone(foreignPrivate, 'intruder', 'tok', [{ project_id: 'p1', token: 'tok' }]),
    false,
  )
  // The owner and templates remain allowed.
  assert.equal(canClone(foreignPrivate, 'owner', null, []), true)
  assert.equal(
    canClone({ ...foreignPrivate, is_template: true }, 'intruder', null, []),
    true,
  )
  // A valid token on a link-shared project is allowed.
  assert.equal(
    canClone(
      { ...foreignPrivate, visibility: 'link' },
      'intruder',
      'tok',
      [{ project_id: 'p1', token: 'tok' }],
    ),
    true,
  )
})
