import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const ENV_EXAMPLE = path.resolve(ROOT, 'env.example')

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — env.example must never contain a real secret / non-default value.
// ─────────────────────────────────────────────────────────────────────────────

if (!fs.existsSync(ENV_EXAMPLE)) {
  console.error('[check-env-example] env.example not found')
  process.exit(1)
}

const content = fs.readFileSync(ENV_EXAMPLE, 'utf8')
const lines = content.split('\n')

const SAFE_DEFAULTS = new Set([
  '',
  '8787',
  'http://localhost:8787',
  'http://localhost:5173',
  'https://soroban-testnet.stellar.org',
  'Test SDF Network ; September 2015',
  'gpt-5.4-mini',
  'Stellita <noreply@stellita.app>',
])

// Dangerous secret prefixes
const SECRET_PREFIXES = ['sk-', 'sb_secret_', 'ssec_']
const STELLAR_SECRET_PATTERN = /^S[A-Z2-7]{55}$/

let hasErrors = false

/** key -> true for every variable documented in env.example. */
const documented = new Set<string>()

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim()
  if (!line || line.startsWith('#')) continue

  const eqIdx = line.indexOf('=')
  if (eqIdx === -1) continue

  const key = line.slice(0, eqIdx).trim()
  let val = line.slice(eqIdx + 1).trim()

  // Strip inline comments: val could have " # comment"
  const commentIdx = val.indexOf('#')
  if (commentIdx !== -1) {
    val = val.slice(0, commentIdx).trim()
  }

  documented.add(key)

  // Value must be empty or match one of SAFE_DEFAULTS
  const isSafe = SAFE_DEFAULTS.has(val)

  // Explicit check for secret prefixes or Stellar private keys
  const hasSecretPrefix = SECRET_PREFIXES.some((p) => val.startsWith(p))
  const isStellarSecret = STELLAR_SECRET_PATTERN.test(val)

  if (!isSafe || hasSecretPrefix || isStellarSecret) {
    console.error(`[check-env-example] Line ${i + 1}: Key "${key}" has non-default or sensitive value: "${val}"`)
    hasErrors = true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — env.example must list exactly the variables the code reads.
//
// Every `process.env.<NAME>` read under server/, src/, scripts/, shared/ and
// contracts/ must be documented (or be an explicitly allowed CI-provided
// variable). Every documented variable must be read somewhere — unless it is
// CLI/ops-only (listed below) or a VITE_* variable, which Vite inlines at build
// time via `import.meta.env`.
// ─────────────────────────────────────────────────────────────────────────────

const SCAN_DIRS = ['server', 'src', 'scripts', 'shared', 'contracts']
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.oz-src', '.git'])

/** Read by the code but deliberately not part of env.example. */
const READ_BUT_UNDOCUMENTED_ALLOWLIST = new Set([
  // Provided by GitHub Actions itself when a step appends to the job summary.
  'GITHUB_STEP_SUMMARY',
])

/** Documented for operators/CLI tooling, but never read by application code. */
const DOCUMENTED_BUT_UNREAD_ALLOWLIST = new Set([
  // Supabase CLI only (`supabase link` / `supabase db push`).
  'SUPABASE_DB_PASSWORD',
  // Standalone deploy tooling / reserved for a future server-side deployer.
  'STELLAR_RPC_URL',
  'STELLAR_NETWORK_PASSPHRASE',
  'STELLAR_DEPLOYER_SECRET',
])

interface EnvRead {
  name: string
  file: string
  line: number
}

const reads: EnvRead[] = []

function walk(dir: string): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walk(full)
      continue
    }
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue

    const source = fs.readFileSync(full, 'utf8')
    source.split('\n').forEach((text, idx) => {
      const re = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g
      let match: RegExpExecArray | null
      while ((match = re.exec(text)) !== null) {
        reads.push({ name: match[1], file: path.relative(ROOT, full), line: idx + 1 })
      }
    })
  }
}

for (const dir of SCAN_DIRS) walk(path.resolve(ROOT, dir))

// `import.meta.env.VITE_*` is inlined by Vite; it is not a Node env read.
const appReads = reads.filter((r) => !r.name.startsWith('VITE_'))

const readNames = new Set(appReads.map((r) => r.name))
const reportedReads = new Set<string>()

for (const read of appReads) {
  if (documented.has(read.name)) continue
  if (READ_BUT_UNDOCUMENTED_ALLOWLIST.has(read.name)) continue
  const dedupe = `${read.name}:${read.file}:${read.line}`
  if (reportedReads.has(dedupe)) continue
  reportedReads.add(dedupe)
  console.error(
    `[check-env-example] ${read.file}:${read.line}: reads process.env.${read.name} but ${read.name} is not documented in env.example`,
  )
  hasErrors = true
}

for (const key of documented) {
  if (readNames.has(key)) continue
  if (key.startsWith('VITE_')) continue
  if (DOCUMENTED_BUT_UNREAD_ALLOWLIST.has(key)) continue
  console.error(
    `[check-env-example] env.example documents ${key} but nothing in server/, src/, scripts/, shared/ or contracts/ reads it`,
  )
  hasErrors = true
}

if (hasErrors) {
  console.error('[check-env-example] FAILED: env.example does not match the code.')
  process.exit(1)
}

console.log(
  `[check-env-example] OK: env.example is secret-free and documents all ${readNames.size} variables read by the code.`,
)
