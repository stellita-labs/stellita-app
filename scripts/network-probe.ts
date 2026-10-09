/**
 * Testnet network probe logic.
 *
 * Deploys depend on exactly two external services: the Soroban RPC
 * (STELLAR_RPC_URL) and https://friendbot.stellar.org. These helpers fail on
 * hard failures and only warn on latency, so the scheduled job stays quiet
 * while healthy but names the degraded endpoint when it is not.
 *
 * Kept in a module with no top-level side effects so it can be unit tested.
 */
import { Keypair, rpc } from '@stellar/stellar-sdk'
import { RPC_URL, FRIENDBOT } from '../server/_lib/deploy.js'

export const LATENCY_WARN_MS = 2500

interface RpcEnvelope {
  result?: unknown
  error?: { message?: string }
}

/** Raw JSON-RPC call against the Soroban RPC. `fetchImpl` is injectable for tests. */
export async function rpcCall(
  url: string,
  method: string,
  params: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) {
    throw new Error(`RPC probe failed for ${url}: HTTP ${res.status}`)
  }
  const body = (await res.json()) as RpcEnvelope
  if (body.error) {
    throw new Error(`RPC probe failed for ${url}: ${body.error.message ?? 'rpc error'}`)
  }
  return body.result
}

/** Assert the RPC is healthy and return the latest ledger sequence. */
export async function probeRpc(
  url: string = RPC_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ latestLedger: number; latencyMs: number }> {
  const started = Date.now()
  await rpcCall(url, 'getHealth', {}, fetchImpl)
  const result = (await rpcCall(url, 'getLatestLedger', {}, fetchImpl)) as {
    sequence?: unknown
  }
  const latencyMs = Date.now() - started
  if (typeof result?.sequence !== 'number') {
    throw new Error(`RPC probe failed for ${url}: getLatestLedger returned no sequence`)
  }
  if (latencyMs > LATENCY_WARN_MS) {
    console.warn(
      `[check-network] WARN: ${url} is slow (${latencyMs}ms > ${LATENCY_WARN_MS}ms)`,
    )
  }
  return { latestLedger: result.sequence, latencyMs }
}

/**
 * Fund a throwaway account with Friendbot, then prove the funded balance is
 * readable on the RPC (`getAccount` throws while the account is missing).
 * The keypair is ephemeral and never persisted, so no funded account is left
 * behind unused.
 */
export async function fundAndVerify(
  friendbotUrl: string = FRIENDBOT,
  rpcUrl: string = RPC_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ address: string }> {
  const keypair = Keypair.random()
  const address = keypair.publicKey()

  const started = Date.now()
  const res = await fetchImpl(`${friendbotUrl}?addr=${encodeURIComponent(address)}`)
  // 400 means the account was already funded; any other non-2xx is a hard failure.
  if (!res.ok && res.status !== 400) {
    throw new Error(`Friendbot probe failed for ${friendbotUrl}: HTTP ${res.status}`)
  }
  const latencyMs = Date.now() - started
  if (latencyMs > LATENCY_WARN_MS) {
    console.warn(
      `[check-network] WARN: ${friendbotUrl} is slow (${latencyMs}ms > ${LATENCY_WARN_MS}ms)`,
    )
  }

  // Bounded wait for the RPC to see the freshly funded account.
  const server = new rpc.Server(rpcUrl)
  const deadline = Date.now() + 20_000
  let lastError = 'account not yet visible on the RPC'
  while (Date.now() < deadline) {
    try {
      await server.getAccount(address)
      return { address }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Funded account ${address} was not readable on ${rpcUrl}: ${lastError}`)
}
