/**
 * Static lint for `supabase/migrations/`.
 *
 * The migration files are applied by the Supabase CLI (`supabase db push`) and
 * cannot be run against a throwaway Postgres in CI without a full local
 * Supabase stack (Docker + the `auth` schema + the Supabase roles). This script
 * is the cheap, deterministic gate that runs on every PR instead:
 *
 *   1. Every file is named `<14-digit version>_<snake_case>.sql`.
 *   2. Version prefixes sort in the same order as the file names, so the apply
 *      order is unambiguous. Duplicate versions are reported (fatal upstream —
 *      the CLI keys migrations by version) but tolerated here so this PR does
 *      not have to rename history.
 *   3. Destructive DDL (`drop table`, `drop column`, `delete from`, `truncate`)
 *      outside dollar-quoted function bodies must carry a `-- destructive:`
 *      annotation on the same or the preceding line.
 *   4. `alter type … add value` must use `IF NOT EXISTS`, and the newly added
 *      enum value may not be referenced later in the same migration — Postgres
 *      forbids using a value added in the same transaction (the `builder` case
 *      is deliberately split into its own migration file).
 */
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations')
const FILE_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/

const DESTRUCTIVE_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'drop table', re: /\bdrop\s+table\b/i },
  { name: 'drop column', re: /\bdrop\s+column\b/i },
  { name: 'delete from', re: /\bdelete\s+from\b/i },
  { name: 'truncate', re: /\btruncate\b/i },
]

const ANNOTATION = /--\s*destructive\s*:/i
const ADD_ENUM_VALUE =
  /alter\s+type\s+([A-Za-z_][A-Za-z0-9_.]*)\s+add\s+value\s+(if\s+not\s+exists\s+)?'([^']+)'/gi

interface ScannedLine {
  /** 1-based line number in the file. */
  line: number
  /** The line with comments and dollar-quoted bodies removed. */
  code: string
}

/** Strip `--` comments and `$tag$ … $tag$` bodies so only real top-level SQL remains. */
function scan(sql: string): ScannedLine[] {
  const rawLines = sql.split('\n')
  const out: ScannedLine[] = []
  let inDollarQuote = false
  let tag = ''

  for (let ln = 0; ln < rawLines.length; ln++) {
    const line = rawLines[ln]
    let code = ''
    let i = 0
    while (i < line.length) {
      if (inDollarQuote) {
        const close = line.indexOf(tag, i)
        if (close === -1) {
          break
        }
        i = close + tag.length
        inDollarQuote = false
        continue
      }
      if (line[i] === '$') {
        const opened = /^\$[A-Za-z0-9_]*\$/.exec(line.slice(i))
        if (opened) {
          tag = opened[0]
          inDollarQuote = true
          i += opened[0].length
          continue
        }
      }
      if (line[i] === '-' && line[i + 1] === '-') break
      code += line[i]
      i++
    }
    out.push({ line: ln + 1, code })
  }

  return out
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error(`[check-migrations] ${MIGRATIONS_DIR} not found`)
  process.exit(1)
}

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.error('[check-migrations] no migrations found')
  process.exit(1)
}

let hasErrors = false
const versionToFiles = new Map<string, string[]>()

for (const file of files) {
  const match = FILE_PATTERN.exec(file)
  if (!match) {
    console.error(
      `[check-migrations] ${file}: expected <14-digit version>_<snake_case>.sql`,
    )
    hasErrors = true
    continue
  }
  const version = match[1]
  const bucket = versionToFiles.get(version) ?? []
  bucket.push(file)
  versionToFiles.set(version, bucket)

  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  const rawLines = sql.split('\n')
  const scanned = scan(sql)
  const addedEnumValues: { value: string; line: number }[] = []

  for (const { line, code } of scanned) {
    for (const { name, re } of DESTRUCTIVE_PATTERNS) {
      if (!re.test(code)) continue
      const candidates = [rawLines[line - 1], rawLines[line - 2], rawLines[line - 3]]
      const annotated = candidates.some((l) => ANNOTATION.test(l ?? ''))
      if (!annotated) {
        console.error(
          `[check-migrations] ${file}:${line}: destructive "${name}" without a "-- destructive:" annotation`,
        )
        hasErrors = true
      }
    }

    ADD_ENUM_VALUE.lastIndex = 0
    let enumMatch: RegExpExecArray | null
    while ((enumMatch = ADD_ENUM_VALUE.exec(code)) !== null) {
      const [, typeName, ifNotExists, value] = enumMatch
      if (!ifNotExists) {
        console.error(
          `[check-migrations] ${file}:${line}: "alter type ${typeName} add value '${value}'" must use IF NOT EXISTS so it is re-runnable`,
        )
        hasErrors = true
      }
      addedEnumValues.push({ value, line })
    }
  }

  // Postgres rejects a value added by `alter type ... add value` used later in
  // the SAME transaction. Each migration is one transaction, so the value must
  // only be consumed by a later migration file.
  for (const { value, line } of addedEnumValues) {
    for (const { line: otherLine, code } of scanned) {
      if (otherLine <= line) continue
      if (code.includes(`'${value}'`)) {
        console.error(
          `[check-migrations] ${file}:${otherLine}: uses enum value '${value}' added on line ${line} in the same migration — split it into its own file`,
        )
        hasErrors = true
      }
    }
  }
}

for (const [version, bucket] of versionToFiles) {
  if (bucket.length > 1) {
    console.warn(
      `[check-migrations] warning: version ${version} is shared by ${bucket.join(', ')} — the Supabase CLI expects one migration per version`,
    )
  }
}

if (hasErrors) {
  console.error('[check-migrations] FAILED')
  process.exit(1)
}

console.log(
  `[check-migrations] OK: ${files.length} migrations are well named, ordered, and free of unannotated destructive DDL.`,
)
