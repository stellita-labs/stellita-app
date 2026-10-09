/**
 * Seed the demo templates (token / nft / swap) as system-owned, publicly-readable
 * projects. Run with: pnpm seed:templates
 *
 * - Ensures the system account info@xlmcode.dev exists (auth admin API).
 * - Re-seeds the 3 templates from the SAME code the demos use (EXAMPLE_APPS),
 *   so the stored file tree (incl. the dev kit) always matches the latest code.
 * - Idempotent: wipes the system account's existing templates first, then inserts.
 * - Preserves each template's public share token across re-seeds, so the tokens
 *   hardcoded in src/lib/templates.ts stay valid.
 *
 * Secrets are read from .env.local at runtime (never printed).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { EXAMPLE_APPS } from '../src/lib/project'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ''
const SYSTEM_EMAIL = 'info@xlmcode.dev'

// Template kind + display name aligned to EXAMPLE_APPS order: [token, nft, swap].
const KINDS = ['token', 'nft', 'swap'] as const
const NAMES = ['Fungible Token', 'NFT Collection', 'Token Swap'] as const

/** Thrown before any write when the Supabase secrets are missing. */
export class MissingSecretsError extends Error {
  constructor() {
    super('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
    this.name = 'MissingSecretsError'
  }
}

/** Resolve the Supabase credentials, throwing before any client/write if unset. */
export function requireSecrets(
  env: NodeJS.ProcessEnv = process.env,
): { url: string; secret: string } {
  const url = env.SUPABASE_URL ?? SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY ?? SUPABASE_SECRET_KEY
  if (!url || !secret) throw new MissingSecretsError()
  return { url, secret }
}

export interface SeedResult {
  data: unknown
  error: { message: string } | null
}

/** Minimal chainable query surface used by the seeder (PostgREST builder). */
export interface SeedQuery extends PromiseLike<SeedResult> {
  select(columns?: string): SeedQuery
  insert(values: unknown): SeedQuery
  delete(): SeedQuery
  eq(column: string, value: unknown): SeedQuery
  in(column: string, values: unknown[]): SeedQuery
  single(): Promise<SeedResult>
}

/** Minimal admin surface the seeder needs (testable without a live Supabase). */
export interface SeedAdmin {
  auth: {
    admin: {
      createUser(input: {
        email: string
        email_confirm: boolean
        password: string
        user_metadata: Record<string, unknown>
      }): Promise<{
        data: { user: { id: string } | null } | null
        error: { message: string } | null
      }>
    }
  }
  from(table: string): SeedQuery
}

/** Ensure info@xlmcode.dev exists; return its user id (idempotent). */
export async function ensureSystemUser(admin: SeedAdmin): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: SYSTEM_EMAIL,
    email_confirm: true,
    password: randomUUID(),
    user_metadata: { full_name: 'Stellita' },
  })
  if (created?.user?.id) {
    console.log(`Created system user ${SYSTEM_EMAIL}`)
    return created.user.id
  }
  // Already exists → look it up via profiles (created by the handle_new_user trigger).
  console.log(`System user exists (${error?.message ?? 'lookup'}) — reusing`)
  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('id')
    .eq('email', SYSTEM_EMAIL)
    .single()
  if (profErr || !prof) throw new Error(`Could not resolve system user: ${profErr?.message}`)
  return (prof as { id: string }).id
}

/** Read the existing template share tokens keyed by slug, so a re-seed keeps them. */
async function existingTokensBySlug(
  admin: SeedAdmin,
  systemId: string,
): Promise<Map<string, string>> {
  const { data: projects } = await admin
    .from('projects')
    .select('id, slug')
    .eq('owner_id', systemId)
    .eq('is_template', true)
  const rows = (projects as { id: string; slug: string }[] | null) ?? []
  const byId = new Map(rows.map((p) => [p.id, p.slug]))
  const tokens = new Map<string, string>()
  if (rows.length === 0) return tokens
  const { data: shares } = await admin
    .from('project_shares')
    .select('project_id, token')
    .in('project_id', rows.map((p) => p.id))
  for (const share of (shares as { project_id: string; token: string }[] | null) ?? []) {
    const slug = byId.get(share.project_id)
    if (slug) tokens.set(slug, share.token)
  }
  return tokens
}

/** Seed (or re-seed) the three system templates. Safe to run repeatedly. */
export async function seedTemplates(admin: SeedAdmin): Promise<void> {
  const systemId = await ensureSystemUser(admin)
  const tokensBySlug = await existingTokensBySlug(admin, systemId)

  // Wipe existing system templates (cascades to versions/messages/contracts/shares).
  await admin.from('projects').delete().eq('owner_id', systemId).eq('is_template', true)

  for (let i = 0; i < EXAMPLE_APPS.length; i++) {
    const ex = EXAMPLE_APPS[i]
    const kind = KINDS[i] ?? 'token'
    const name = NAMES[i] ?? ex.label
    if (!ex.files) continue
    const slug = `tpl-${kind}`

    const { data: project, error: pErr } = await admin
      .from('projects')
      .insert({
        owner_id: systemId,
        slug,
        name,
        current_files: ex.files,
        is_template: true,
        kind,
        published: true,
        sort_order: i,
      })
      .select('id')
      .single()
    if (pErr || !project) throw new Error(`insert project failed: ${pErr?.message}`)
    const projectId = (project as { id: string }).id

    await admin.from('project_versions').insert({
      project_id: projectId,
      seq: 1,
      label: 'Template',
      summary: `The ${ex.label} template.`,
      files: ex.files,
    })

    await admin.from('messages').insert({
      project_id: projectId,
      seq: 1,
      role: 'assistant',
      content: `This is the "${ex.label}" template — a complete, working app. Clone it to start building your own.`,
      kind: 'system',
    })

    // Public share token → badges/templates link to /p/:token (read-only preview).
    // Reuse the existing token so src/lib/templates.ts keeps pointing at this row.
    const preservedToken = tokensBySlug.get(slug)
    await admin.from('project_shares').insert(
      preservedToken
        ? { project_id: projectId, created_by: systemId, token: preservedToken }
        : { project_id: projectId, created_by: systemId },
    )

    if (ex.contracts?.length) {
      await admin.from('deployed_contracts').insert(
        ex.contracts.map((c) => ({
          project_id: projectId,
          manifest_id: c.manifestId,
          name: c.name,
          category: c.category,
          contract_id: c.contractId,
          network: c.network,
          explorer_url: c.explorerUrl,
          deployer: c.deployer ?? null,
          config: c.config,
        })),
      )
    }

    console.log(`Seeded template: ${ex.label} (${kind}) → ${projectId}`)
  }

  console.log('Done.')
}

/** CLI entry point: resolve secrets, then seed. */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { url, secret } = requireSecrets(env)
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SeedAdmin
  await seedTemplates(admin)
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
