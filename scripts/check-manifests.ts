/**
 * Validate every contract manifest in `contracts/manifests/` against
 * `contracts/manifests/manifest.schema.json`, then assert the cross-file rules
 * a JSON Schema cannot express:
 *
 *   - `wasmPath` points at a file that actually exists in the repo;
 *   - every `init.argsFromConfig` entry has a matching `config[].key`;
 *   - `config[].scType` is a type the deploy serialiser supports
 *     (`server/_lib/deploy.ts` → `toScVal()`);
 *   - manifest ids are unique (they are the catalog keys);
 *   - `type: "deployed"` manifests carry no `wasmPath`/`init` and an empty
 *     `config` (see contracts/README.md).
 *
 * Adding a valid manifest must pass with no code change — the schema, not this
 * script, is the source of truth for structure.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MANIFESTS_DIR = path.resolve(ROOT, 'contracts/manifests')
const SCHEMA_FILE = path.join(MANIFESTS_DIR, 'manifest.schema.json')

/** scTypes `toScVal()` in server/_lib/deploy.ts knows how to serialise. */
const SUPPORTED_SC_TYPES = new Set(['string', 'address', 'i128', 'u32', 'u64', 'bool'])

type Schema = Record<string, unknown>

/** Minimal validator for the JSON Schema subset used by manifest.schema.json. */
function validate(value: unknown, schema: Schema, location: string, errors: string[]): void {
  if (schema === null || typeof schema !== 'object') return
  if (Object.keys(schema).length === 0) return

  if ('const' in schema && value !== schema.const) {
    errors.push(`${location}: must be ${JSON.stringify(schema.const)}`)
    return
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((allowed) => allowed === value)) {
    errors.push(`${location}: must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`)
    return
  }

  const expected = schema.type
  if (typeof expected === 'string') {
    const ok =
      expected === 'object'
        ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : expected === 'array'
          ? Array.isArray(value)
          : expected === 'string'
            ? typeof value === 'string'
            : expected === 'number'
              ? typeof value === 'number'
              : expected === 'boolean'
                ? typeof value === 'boolean'
                : expected === 'null'
                  ? value === null
                  : true
    if (!ok) {
      errors.push(`${location}: must be of type ${expected}`)
      return
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${location}: must be at least ${schema.minLength} characters`)
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${location}: ${JSON.stringify(value)} does not match ${schema.pattern}`)
    }
  }

  if (Array.isArray(value)) {
    if (schema.items) value.forEach((item, i) => validate(item, schema.items as Schema, `${location}[${i}]`, errors))
  } else if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const required of (schema.required as string[] | undefined) ?? []) {
      if (!(required in obj)) errors.push(`${location}: missing required property "${required}"`)
    }
    const properties = (schema.properties as Record<string, Schema> | undefined) ?? {}
    for (const [key, sub] of Object.entries(properties)) {
      if (key in obj) validate(obj[key], sub, `${location}.${key}`, errors)
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in properties)) errors.push(`${location}: unexpected property "${key}"`)
      }
    }
  }

  for (const sub of (schema.allOf as Schema[] | undefined) ?? []) validate(value, sub, location, errors)
  if (schema.if) {
    const conditionErrors: string[] = []
    validate(value, schema.if as Schema, location, conditionErrors)
    if (conditionErrors.length === 0) {
      if (schema.then) validate(value, schema.then as Schema, location, errors)
    } else if (schema.else) {
      validate(value, schema.else as Schema, location, errors)
    }
  }
}

function main(): void {
  if (!fs.existsSync(SCHEMA_FILE)) {
    console.error(`❌ Missing schema at ${path.relative(ROOT, SCHEMA_FILE)}`)
    process.exit(1)
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8')) as Schema

  const files = fs
    .readdirSync(MANIFESTS_DIR)
    .filter((name) => name.endsWith('.json') && name !== 'manifest.schema.json')
    .sort()

  if (files.length === 0) {
    console.error('❌ No manifests found in contracts/manifests/')
    process.exit(1)
  }

  const errors: string[] = []
  const seenIds = new Map<string, string>()

  for (const file of files) {
    const rel = path.relative(ROOT, path.join(MANIFESTS_DIR, file))
    let manifest: Record<string, unknown>
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(MANIFESTS_DIR, file), 'utf8')) as Record<string, unknown>
    } catch (err) {
      errors.push(`${rel}: not valid JSON (${(err as Error).message})`)
      continue
    }

    const structural: string[] = []
    validate(manifest, schema, rel, structural)
    errors.push(...structural)

    const id = typeof manifest.id === 'string' ? manifest.id : file
    if (seenIds.has(id)) errors.push(`${rel}: duplicate manifest id "${id}" (also in ${seenIds.get(id)})`)
    else seenIds.set(id, rel)

    const config = Array.isArray(manifest.config) ? (manifest.config as Record<string, unknown>[]) : []
    const configKeys = new Set(config.map((field) => String(field.key)))

    if (manifest.type === 'deployable') {
      const wasmPath = typeof manifest.wasmPath === 'string' ? manifest.wasmPath : ''
      if (wasmPath && !fs.existsSync(path.resolve(ROOT, wasmPath))) {
        errors.push(`${rel}: wasmPath "${wasmPath}" does not exist on disk`)
      }
      const init = manifest.init as { argsFromConfig?: unknown } | undefined
      const args = Array.isArray(init?.argsFromConfig) ? (init!.argsFromConfig as string[]) : []
      for (const arg of args) {
        if (!configKeys.has(arg)) {
          errors.push(`${rel}: init.argsFromConfig entry "${arg}" has no matching config[].key`)
        }
      }
      for (const field of config) {
        const scType = field.scType
        if (typeof scType === 'string' && !SUPPORTED_SC_TYPES.has(scType)) {
          errors.push(`${rel}: config key "${String(field.key)}" has unsupported scType "${scType}"`)
        }
      }
    }

    if (manifest.type === 'deployed') {
      if (manifest.wasmPath) errors.push(`${rel}: type "deployed" must not set wasmPath`)
      if (manifest.init) errors.push(`${rel}: type "deployed" must not set init`)
      if (config.length > 0) errors.push(`${rel}: type "deployed" must have an empty config array`)
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`  ❌ ${error}`)
    console.error(`\n❌ ${errors.length} manifest problem(s) found.`)
    process.exit(1)
  }

  console.log(`✅ Validated ${files.length} contract manifests against manifest.schema.json.`)
}

main()
