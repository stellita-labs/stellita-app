import type { Manifest, DeployResult } from '../../shared/types'

const API_BASE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ??
  'http://localhost:8787'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class RateLimitError extends Error {
  constructor() {
    super('Daily rate limit reached. Try again tomorrow.')
    this.name = 'RateLimitError'
  }
}

/**
 * Thrown when a chat stream receives no data for longer than the configured
 * idle window. Distinguishable from a caller-initiated abort (AbortError) so the
 * UI can tell "the upstream stalled" from "the user pressed Stop".
 */
export class StreamTimeoutError extends Error {
  constructor(idleTimeoutMs: number) {
    super(`The chat stream stalled (no data for ${idleTimeoutMs} ms) and was aborted.`)
    this.name = 'StreamTimeoutError'
  }
}

/** Options for streamChat: caller-initiated cancellation + a bounded idle window. */
export interface StreamChatOptions {
  /** Abort the request and the body read loop (e.g. a Stop button). */
  signal?: AbortSignal
  /** Abort when no chunk arrives within this many ms. Default 30s. */
  idleTimeoutMs?: number
}

/** True for caller aborts and idle-timeout aborts. */
export function isAbortError(err: unknown): boolean {
  const name = (err as { name?: string } | null | undefined)?.name
  return name === 'AbortError' || name === 'StreamTimeoutError'
}

/** Build an AbortError-shaped Error for the abort/timeout race. */
function abortError(): Error {
  const err = new Error('The chat stream was aborted.')
  err.name = 'AbortError'
  return err
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json() as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

export function fetchCatalog(): Promise<Manifest[]> {
  return api<Manifest[]>('/api/contracts')
}

export interface TemplateSummary {
  id: string
  slug: string
  name: string
  kind: string | null
  /** Public share token → open the read-only preview at /p/:token. */
  token: string | null
}

/** System-owned starter templates shown as badges. */
export function fetchTemplates(): Promise<TemplateSummary[]> {
  return api<TemplateSummary[]>('/api/templates')
}

export function deployContract(
  projectId: string,
  manifestId: string,
  config: Record<string, unknown>,
  deployerSecret?: string,
): Promise<DeployResult> {
  return api<DeployResult>(`/api/projects/${projectId}/deploy`, {
    method: 'POST',
    body: JSON.stringify({ manifestId, config, deployerSecret }),
  })
}

export function claimFaucet(address: string, amount?: number): Promise<{ hash: string }> {
  return api<{ hash: string }>('/api/faucet', {
    method: 'POST',
    body: JSON.stringify({ address, amount }),
  })
}

export function mintDemoNft(address: string): Promise<{ hash: string; tokenId: string }> {
  return api<{ hash: string; tokenId: string }>('/api/mint-nft', {
    method: 'POST',
    body: JSON.stringify({ address }),
  })
}

/** Public read-only view of a shared project (no auth required). */
export function fetchShared(token: string): Promise<{
  project: { id: string; name: string; slug: string; current_files?: Record<string, string> }
  versions: { id: string; label: string; summary: string; files: Record<string, string>; created_at: string }[]
  messages: { role: string; content: string; created_at: string }[]
  contracts: unknown[]
}> {
  return api(`/api/shared/${token}`)
}

/** Clone a shared project into the caller's account (requires login). */
export function cloneShared(token: string): Promise<{ id: string; slug: string; name: string }> {
  return api(`/api/shared/${token}/clone`, { method: 'POST' })
}

/** Create a share link for a project and email it via Resend. */
export function emailShareLink(projectId: string, to: string): Promise<{ ok: boolean; url: string }> {
  return api(`/api/projects/${projectId}/share/email`, {
    method: 'POST',
    body: JSON.stringify({ to }),
  })
}

export async function streamChat(
  projectId: string,
  body: { userMessage: string; history?: unknown[]; fileTree?: unknown; modelType?: string },
  onChunk: (chunk: string) => void,
  opts: StreamChatOptions = {},
): Promise<string> {
  const idleTimeoutMs = opts.idleTimeoutMs ?? 30_000
  const externalSignal = opts.signal

  const res = await fetch(`${API_BASE}/api/projects/${projectId}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: externalSignal,
  })
  if (res.status === 429) throw new RateLimitError()
  if (!res.ok || !res.body) {
    let message = `Chat request failed (${res.status})`
    try {
      const b = await res.json() as { error?: string }
      if (b.error) message = b.error
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let timedOut = false
  let onAbort: (() => void) | null = null

  // A promise that resolves when the caller aborts. With no signal we use a
  // never-settling promise so Promise.race ignores it.
  const aborted = new Promise<'abort'>((resolve) => {
    onAbort = () => resolve('abort')
    if (externalSignal?.aborted) onAbort()
    else externalSignal?.addEventListener('abort', onAbort, { once: true })
  })
  const abortRace: Promise<'abort'> = externalSignal
    ? aborted
    : new Promise<'abort'>(() => {})

  try {
    for (;;) {
      // Arm the idle watchdog freshly for each chunk read.
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), idleTimeoutMs)
      })

      const outcome = await Promise.race([reader.read(), abortRace, timeout])
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }

      if (outcome === 'abort') throw abortError()
      if (outcome === 'timeout') {
        timedOut = true
        throw new StreamTimeoutError(idleTimeoutMs)
      }

      const { done, value } = outcome
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      full += chunk
      onChunk(chunk)
    }
    return full
  } finally {
    if (timer !== null) clearTimeout(timer)
    if (onAbort) externalSignal?.removeEventListener('abort', onAbort)
    // Release the socket when we bailed out early; the body may already be gone.
    if (timedOut || externalSignal?.aborted) {
      await reader.cancel().catch(() => {})
    }
  }
}
