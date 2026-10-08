import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATION_FILE = path.resolve('supabase/migrations/20260701000005_clone_honours_visibility.sql')

test('migration file exists and updates clone_project with visibility check', () => {
  assert.ok(fs.existsSync(MIGRATION_FILE), 'Migration file must exist')
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8')

  // Check 1: create or replace function clone_project
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+clone_project/i,
    'SQL must define clone_project function',
  )

  // Check 2: Authorisation requires visibility = link on share token branch
  assert.match(
    sql,
    /\(select\s+visibility\s+from\s+projects\s+where\s+id\s*=\s*p_source\)\s*=\s*'link'/i,
    'SQL must verify projects.visibility = link on share token branch',
  )

  // Check 3: Preserves owner_id check
  assert.match(sql, /src\.owner_id\s*=\s*\(select\s+auth\.uid\(\)\)/i, 'Must allow owner')

  // Check 4: Preserves is_template check
  assert.match(sql, /src\.is_template/i, 'Must allow templates')
})

test('clone_project authorization logic simulation', () => {
  type Project = {
    id: string
    owner_id: string
    is_template: boolean
    visibility: 'private' | 'link'
  }

  type Share = {
    project_id: string
    token: string
  }

  function simulateCloneAuthorization({
    caller_uid,
    project,
    share_token,
    shares,
  }: {
    caller_uid: string
    project: Project
    share_token?: string | null
    shares: Share[]
  }): { allowed: boolean; reason?: string } {
    // Branch 1: Owner
    if (project.owner_id === caller_uid) {
      return { allowed: true }
    }

    // Branch 2: Template
    if (project.is_template) {
      return { allowed: true }
    }

    // Branch 3: Share token with visibility === 'link'
    if (
      share_token &&
      project.visibility === 'link' &&
      shares.some((s) => s.project_id === project.id && s.token === share_token)
    ) {
      return { allowed: true }
    }

    return { allowed: false, reason: 'not allowed' }
  }

  const ownerId = 'user-owner'
  const nonOwnerId = 'user-other'
  const validToken = 'share-token-xyz'
  const shares: Share[] = [{ project_id: 'proj-1', token: validToken }]

  // 1. Owner can always clone regardless of visibility
  const ownerPrivate = simulateCloneAuthorization({
    caller_uid: ownerId,
    project: { id: 'proj-1', owner_id: ownerId, is_template: false, visibility: 'private' },
    share_token: null,
    shares,
  })
  assert.equal(ownerPrivate.allowed, true, 'Owner must always be allowed')

  // 2. Template is always cloneable by anyone
  const templateUser = simulateCloneAuthorization({
    caller_uid: nonOwnerId,
    project: { id: 'tpl-1', owner_id: ownerId, is_template: true, visibility: 'private' },
    share_token: null,
    shares: [],
  })
  assert.equal(templateUser.allowed, true, 'Templates must always be cloneable')

  // 3. Valid token with visibility = 'link' is allowed
  const linkAllowed = simulateCloneAuthorization({
    caller_uid: nonOwnerId,
    project: { id: 'proj-1', owner_id: ownerId, is_template: false, visibility: 'link' },
    share_token: validToken,
    shares,
  })
  assert.equal(linkAllowed.allowed, true, 'Link sharing allows cloning when visibility is link')

  // 4. Project flipped to 'private' with valid token MUST FAIL ('not allowed')
  const flipToPrivate = simulateCloneAuthorization({
    caller_uid: nonOwnerId,
    project: { id: 'proj-1', owner_id: ownerId, is_template: false, visibility: 'private' },
    share_token: validToken,
    shares,
  })
  assert.equal(flipToPrivate.allowed, false, 'Cloning must fail when flipped to private')
  assert.equal(flipToPrivate.reason, 'not allowed')

  // 5. Flipping back to 'link' restores cloning
  const flipBackToLink = simulateCloneAuthorization({
    caller_uid: nonOwnerId,
    project: { id: 'proj-1', owner_id: ownerId, is_template: false, visibility: 'link' },
    share_token: validToken,
    shares,
  })
  assert.equal(flipBackToLink.allowed, true, 'Flipping back to link restores cloning')

  // 6. Invalid token on 'link' project is rejected
  const invalidToken = simulateCloneAuthorization({
    caller_uid: nonOwnerId,
    project: { id: 'proj-1', owner_id: ownerId, is_template: false, visibility: 'link' },
    share_token: 'invalid-token',
    shares,
  })
  assert.equal(invalidToken.allowed, false, 'Invalid token must be rejected')
})
