import type { Manifest, DeployResult } from '../../shared/types'

const API_BASE = import.meta.env?.VITE_API_BASE ?? 'http://localhost:8787'

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
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    full += chunk
    onChunk(chunk)
  }
  return full
}
