import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

interface BudgetConfig {
  date: string
  comment?: string
  budgets: Record<string, Record<string, number>>
}

interface MatchOccurrence {
  file: string
  line: number
  pattern: string
  text: string
}

const PATTERNS: Record<string, RegExp> = {
  'as any': /\bas\s+any\b/g,
  ': any': /:\s*any\b/g,
  '@ts-ignore': /@ts-ignore/g,
  'console.': /\bconsole\./g,
}

function scanDirectory(dirPath: string): {
  counts: Record<string, number>
  matches: MatchOccurrence[]
} {
  const counts: Record<string, number> = {
    'as any': 0,
    ': any': 0,
    '@ts-ignore': 0,
    'console.': 0,
  }
  const matches: MatchOccurrence[] = []

  function walk(current: string) {
    if (!fs.existsSync(current)) return
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
          walk(fullPath)
        }
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.d.ts')
      ) {
        const content = fs.readFileSync(fullPath, 'utf8')
        const lines = content.split('\n')
        lines.forEach((lineText, idx) => {
          for (const [patternName, regex] of Object.entries(PATTERNS)) {
            // Reset stateful RegExp instances
            regex.lastIndex = 0
            const found = lineText.match(regex)
            if (found) {
              counts[patternName] = (counts[patternName] ?? 0) + found.length
              const relativePath = path.relative(rootDir, fullPath)
              matches.push({
                file: relativePath,
                line: idx + 1,
                pattern: patternName,
                text: lineText.trim(),
              })
            }
          }
        })
      }
    }
  }

  walk(dirPath)
  return { counts, matches }
}

function run(): void {
  const budgetPath = path.join(__dirname, 'forbidden-patterns-budget.json')
  if (!fs.existsSync(budgetPath)) {
    console.error(`❌ Budget file missing at ${budgetPath}`)
    process.exit(1)
  }

  const budgetConfig: BudgetConfig = JSON.parse(fs.readFileSync(budgetPath, 'utf8'))
  console.log(`📋 Forbidden patterns budget (baseline date: ${budgetConfig.date})`)

  let hasFailure = false

  for (const [directory, patternBudgets] of Object.entries(budgetConfig.budgets)) {
    const targetDir = path.join(rootDir, directory)
    const { counts, matches } = scanDirectory(targetDir)

    console.log(`\nDirectory: ${directory}/`)
    for (const [patternName, maxAllowed] of Object.entries(patternBudgets)) {
      const actual = counts[patternName] ?? 0
      const delta = actual - maxAllowed

      if (actual > maxAllowed) {
        hasFailure = true
        console.error(
          `  ❌ EXCEEDED BUDGET: "${patternName}" count is ${actual} (budget: ${maxAllowed}, +${delta})`,
        )
        const relevantMatches = matches.filter((m) => m.pattern === patternName)
        for (const m of relevantMatches) {
          console.error(`     at ${m.file}:${m.line} -> ${m.text}`)
        }
      } else {
        const diffStr = delta < 0 ? ` (${delta} below budget)` : ''
        console.log(`  ✓ ${patternName}: ${actual}/${maxAllowed}${diffStr}`)
      }
    }
  }

  if (hasFailure) {
    console.error('\n❌ Forbidden pattern check failed. Reduce occurrences or bump budget in review.')
    process.exit(1)
  }

  console.log('\n✅ All forbidden pattern counts are within budget.')
}

run()
