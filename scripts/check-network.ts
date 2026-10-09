/**
 * Scheduled network-probe entry point — see the `network` job in
 * .github/workflows/ci.yml. Fails the job on a hard RPC/Friendbot failure and
 * only warns on latency.
 */
import { probeRpc, fundAndVerify } from './network-probe.js'
import { RPC_URL, FRIENDBOT } from '../server/_lib/deploy.js'

async function main(): Promise<void> {
  const rpc = await probeRpc(RPC_URL)
  console.log(
    `[check-network] RPC OK (${RPC_URL}) — latest ledger ${rpc.latestLedger} in ${rpc.latencyMs}ms`,
  )

  const { address } = await fundAndVerify(FRIENDBOT, RPC_URL)
  console.log(`[check-network] Friendbot OK (${FRIENDBOT}) — funded and verified ${address}`)
}

main().catch((err: unknown) => {
  console.error(`[check-network] FAILED: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
