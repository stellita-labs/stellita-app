/**
 * CI entry point: validate every commit subject/body in a PR range.
 *
 * Range comes from COMMIT_FROM / COMMIT_TO (set by the `commits` job in
 * .github/workflows/ci.yml) or --from/--to. An all-zero COMMIT_FROM (a brand
 * new branch) falls back to validating just the head commit.
 */
import { execFileSync } from 'node:child_process'
import { validateCommitMessage } from './commit-message.js'

const RECORD = '\x1f'
const FIELD = '\x1e'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function commitRange(): string {
  const from = arg('from') ?? process.env.COMMIT_FROM ?? ''
  const to = arg('to') ?? process.env.COMMIT_TO ?? 'HEAD'
  return from && !/^0+$/.test(from) ? `${from}..${to}` : to
}

function readCommits(range: string): { hash: string; message: string }[] {
  const out = execFileSync('git', ['log', `--format=%H%x1e%B%x1f`, range], {
    encoding: 'utf8',
  })
  return out
    .split(RECORD)
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const sep = rec.indexOf(FIELD)
      return { hash: rec.slice(0, sep), message: rec.slice(sep + 1).trim() }
    })
}

function main(): void {
  const range = commitRange()
  const commits = readCommits(range)
  if (commits.length === 0) {
    console.log('[check-commits] No commits in range; nothing to validate.')
    return
  }

  let failed = false
  for (const { hash, message } of commits) {
    for (const error of validateCommitMessage(message)) {
      failed = true
      console.error(`[check-commits] ${hash.slice(0, 12)}: ${error}`)
    }
  }

  if (failed) {
    console.error(
      '[check-commits] FAILED: commit messages must follow Conventional Commits and carry no AI attribution.',
    )
    process.exit(1)
  }
  console.log(`[check-commits] OK: ${commits.length} commit(s) valid.`)
}

main()
