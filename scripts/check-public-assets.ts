import fs from 'node:fs'
import path from 'node:path'

const PUBLIC_DIR = path.resolve(process.cwd(), 'public')
const ALLOWED_RUNTIME = new Set([
  'robots.txt',
  'sitemap.xml',
  'icons.svg',
])

function getAllFiles(dir: string, base = ''): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  let files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = path.join(base, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(full, rel))
    } else {
      files.push(rel)
    }
  }
  return files
}

function searchReferences(): Set<string> {
  const sources = [
    path.resolve(process.cwd(), 'index.html'),
    path.resolve(process.cwd(), 'src'),
    path.resolve(process.cwd(), 'server'),
  ]

  let corpus = ''
  function readRecursive(target: string) {
    if (!fs.existsSync(target)) return
    const stat = fs.statSync(target)
    if (stat.isFile()) {
      corpus += '\n' + fs.readFileSync(target, 'utf8')
    } else if (stat.isDirectory()) {
      for (const f of fs.readdirSync(target)) {
        readRecursive(path.join(target, f))
      }
    }
  }

  for (const s of sources) readRecursive(s)
  return new Set([corpus])
}

const allPublic = getAllFiles(PUBLIC_DIR)
const [corpus] = Array.from(searchReferences())

const orphans: string[] = []
for (const rel of allPublic) {
  if (ALLOWED_RUNTIME.has(rel)) continue
  const filename = path.basename(rel)
  const relPath = '/' + rel.replace(/\\/g, '/')
  if (!corpus.includes(filename) && !corpus.includes(relPath)) {
    orphans.push(rel)
  }
}

if (orphans.length > 0) {
  console.error('[check-public-assets] Found unreferenced orphan assets in public/:')
  for (const o of orphans) console.error(` - public/${o}`)
  process.exit(1)
} else {
  console.log(`[check-public-assets] OK: All ${allPublic.length} assets in public/ are referenced.`)
}
