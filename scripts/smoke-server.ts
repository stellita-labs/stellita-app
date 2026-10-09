/**
 * Server boot smoke test.
 *
 * Boots `tsx server/index.ts` with a dummy but structurally valid env, waits
 * (bounded) for GET /health to report { ok: true }, asserts a protected route
 * answers 401 (so the routers mounted — a 404 would mean they did not), then
 * kills the child and exits. A boot crash surfaces the child's stderr.
 *
 * Run via `pnpm smoke:server` (wired into the verify job in ci.yml).
 */
import { spawn } from 'node:child_process'

const PORT = 8790 + Math.floor(Math.random() * 100)
const BASE = `http://127.0.0.1:${PORT}`
const HEALTH_TIMEOUT_MS = 30_000

const env = {
  ...process.env,
  PORT: String(PORT),
  NODE_ENV: 'test',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  // Dummy, structurally valid values so clients construct without a network hop.
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
  SUPABASE_SECRET_KEY: 'test-secret-key',
}

const child = spawn('tsx', ['server/index.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let stderr = ''
child.stderr.on('data', (d) => {
  stderr += String(d)
})

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (code ${child.exitCode})\n${stderr}`)
    }
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) {
        const body = (await res.json()) as { ok?: unknown }
        if (body.ok === true) return
      }
    } catch {
      // Not listening yet — keep polling within the bounded window.
    }
    await sleep(250)
  }
  throw new Error(`GET /health did not report { ok: true } within ${HEALTH_TIMEOUT_MS}ms\n${stderr}`)
}

async function stop(): Promise<void> {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([new Promise<void>((r) => child.once('exit', () => r())), sleep(3000)])
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function main(): Promise<void> {
  try {
    await waitForHealth()

    const res = await fetch(`${BASE}/api/projects`)
    if (res.status === 404) {
      throw new Error('protected route /api/projects returned 404 — the router is not mounted')
    }
    if (res.status !== 401) {
      throw new Error(`protected route /api/projects returned ${res.status}, expected 401`)
    }

    console.log('[smoke-server] OK: /health → { ok: true } and /api/projects → 401')
  } catch (err) {
    console.error(`[smoke-server] FAILED: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  } finally {
    await stop()
  }
}

void main()
