import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const INIT = path.resolve('supabase/migrations/20260628000001_init.sql')

function restoreVersionSql(): string {
  assert.ok(fs.existsSync(INIT), 'init migration must exist')
  const sql = fs.readFileSync(INIT, 'utf-8')
  const start = sql.indexOf('create or replace function restore_version')
  assert.ok(start >= 0, 'restore_version definition must be present')
  const end = sql.indexOf('$$;', start)
  assert.ok(end > start, 'restore_version body must terminate')
  return sql.slice(start, end + 3)
}

test('restore_version is owner-gated with not-found semantics', () => {
  const sql = restoreVersionSql()
  assert.match(
    sql,
    /if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+projects\s+where\s+id\s*=\s*p_project\s+and\s+owner_id\s*=\s*auth\.uid\(\)\s*\)\s*then[\s\S]*?raise\s+exception\s+'not\s+found'/i,
  )
})

test('restore_version scopes the version to the project and raises version not found', () => {
  const sql = restoreVersionSql()
  assert.match(
    sql,
    /from\s+project_versions\s+where\s+id\s*=\s*p_version\s+and\s+project_id\s*=\s*p_project/i,
  )
  assert.match(sql, /raise\s+exception\s+'version\s+not\s+found'/i)
})

test('restore_version is destructive: sets current_files and deletes later versions', () => {
  const sql = restoreVersionSql()
  assert.match(sql, /update\s+projects\s+set\s+current_files\s*=\s*v_files\s+where\s+id\s*=\s*p_project/i)
  assert.match(
    sql,
    /delete\s+from\s+project_versions\s+where\s+project_id\s*=\s*p_project\s+and\s+seq\s*>\s*v_seq/i,
  )
  // Exactly one system message is appended per restore.
  assert.match(
    sql,
    /insert\s+into\s+messages\s*\(\s*project_id,\s*seq,\s*role,\s*content,\s*kind\s*\)[\s\S]*?values\s*\(\s*p_project,\s*next_seq,\s*'assistant',\s*'Restored[\s\S]*?'system'\s*\)/i,
  )
})

type Version = { id: string; seq: number; label: string; files: Record<string, string> }

type Project = {
  id: string
  ownerId: string
  currentFiles: Record<string, string>
  versions: Version[]
  messages: { kind?: string }[]
}

/** Mirrors restore_version() in 20260628000001_init.sql. */
function restoreVersion(
  project: Project,
  versionId: string,
  callerId: string,
): { project: Project; error?: string } {
  if (project.ownerId !== callerId) return { project, error: 'not found' }
  const version = project.versions.find((v) => v.id === versionId)
  if (!version) return { project, error: 'version not found' }
  return {
    project: {
      ...project,
      currentFiles: version.files,
      versions: project.versions.filter((v) => v.seq <= version.seq),
      messages: [
        ...project.messages,
        { role: 'assistant', kind: 'system' } as { kind?: string },
      ],
    },
  }
}

function makeProject(): Project {
  return {
    id: 'p1',
    ownerId: 'owner',
    currentFiles: { '/App.tsx': 'v3' },
    versions: [
      { id: 'v1', seq: 1, label: 'One', files: { '/App.tsx': 'v1' } },
      { id: 'v2', seq: 2, label: 'Two', files: { '/App.tsx': 'v2' } },
      { id: 'v3', seq: 3, label: 'Three', files: { '/App.tsx': 'v3' } },
    ],
    messages: [],
  }
}

test('restoring version n keeps 1..n, deletes later ones, and sets current_files', () => {
  const original = makeProject()
  const { project, error } = restoreVersion(original, 'v2', 'owner')
  assert.equal(error, undefined)
  assert.deepEqual(
    project.versions.map((v) => v.seq),
    [1, 2],
    'versions after the restored one are gone; earlier ones remain',
  )
  assert.deepEqual(project.currentFiles, { '/App.tsx': 'v2' })
})

test('each restore appends exactly one system message', () => {
  const once = restoreVersion(makeProject(), 'v1', 'owner').project
  assert.equal(once.messages.length, 1)
  assert.equal(once.messages[0].kind, 'system')
  const twice = restoreVersion(once, 'v1', 'owner').project
  assert.equal(twice.messages.length, 2, 'one message per restore')
})

test('a non-owner call raises not found and mutates nothing', () => {
  const original = makeProject()
  const { project, error } = restoreVersion(original, 'v2', 'intruder')
  assert.equal(error, 'not found')
  assert.equal(project, original, 'the project object must be untouched')
  assert.equal(project.versions.length, 3)
  assert.deepEqual(project.currentFiles, { '/App.tsx': 'v3' })
  assert.equal(project.messages.length, 0)
})

test('a version belonging to another project raises version not found', () => {
  const project = makeProject()
  project.versions = project.versions.filter((v) => v.id !== 'v2')
  const { error } = restoreVersion(project, 'v2', 'owner')
  assert.equal(error, 'version not found')
})

test('restoring the latest version deletes nothing but still records the restore', () => {
  const { project, error } = restoreVersion(makeProject(), 'v3', 'owner')
  assert.equal(error, undefined)
  assert.equal(project.versions.length, 3)
  assert.equal(project.messages.length, 1)
})
