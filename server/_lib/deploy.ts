/**
 * Contract deploy core (provider-agnostic, runs on the server only).
 *
 * Mirrors the validated `contracts/scripts/deploy.mjs` flow:
 *   1. Generate + Friendbot-fund an ephemeral testnet deployer.
 *   2. Upload the pre-compiled WASM (published by its sha256 hash).
 *   3. Create the contract, invoking `__constructor` with the user's config.
 *
 * The server never compiles Rust — it deploys committed WASM and passes config
 * to the constructor. See contracts/build.sh for how the WASM is produced.
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import {
  Keypair,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Operation,
  Address,
  Account,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk'
import type { Manifest, ManifestConfigField, DeployResult } from '../../shared/types'

/** Soroban RPC endpoint — overridable via the same STELLAR_RPC_URL env var
 *  the rest of the server uses (see env.example). Defaults to testnet. */
export const RPC_URL =
  process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org'
/** Friendbot endpoint — overridable via FRIENDBOT_URL. Defaults to testnet. */
export const FRIENDBOT =
  process.env.FRIENDBOT_URL ?? 'https://friendbot.stellar.org'
const PASSPHRASE = Networks.TESTNET
type Sleep = (ms: number) => Promise<void>
const sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The Soroban scval type a config field maps to (derived from its UI type). */
function scTypeOf(field: ManifestConfigField): string {
  if (field.scType) return field.scType
  if (field.type === 'address') return 'address'
  if (field.type === 'number') return 'i128'
  return 'string'
}

function toScVal(
  value: unknown,
  scType: string,
  deployerPk: string,
): xdr.ScVal {
  if (scType === 'address') {
    const addr =
      value === '{{deployer}}' || !value ? deployerPk : String(value)
    return new Address(addr).toScVal()
  }
  if (scType === 'i128')
    return nativeToScVal(
      BigInt(typeof value === 'number' ? Math.trunc(value) : String(value).trim()),
      { type: 'i128' },
    )
  if (scType === 'u32') return nativeToScVal(Number(value), { type: 'u32' })
  if (scType === 'u64') return nativeToScVal(BigInt(Number(value)), { type: 'u64' })
  if (scType === 'bool') return nativeToScVal(Boolean(value))
  return nativeToScVal(String(value), { type: 'string' })
}

async function submit(
  server: rpc.Server,
  tx: Parameters<rpc.Server['prepareTransaction']>[0],
  signer: Keypair,
  sleepFn: Sleep,
) {
  const prepared = await server.prepareTransaction(tx)
  prepared.sign(signer)
  const sent = await server.sendTransaction(prepared)
  if (sent.status === 'ERROR') {
    throw new Error(`submit failed: ${JSON.stringify(sent.errorResult)}`)
  }
  let got = await server.getTransaction(sent.hash)
  for (let i = 0; got.status === 'NOT_FOUND' && i < 30; i++) {
    await sleepFn(1000)
    got = await server.getTransaction(sent.hash)
  }
  if (got.status !== 'SUCCESS') throw new Error(`tx ${sent.hash} ended ${got.status}`)
  return { hash: sent.hash, response: got }
}

export interface DeployInput {
  manifest: Manifest
  config: Record<string, unknown>
  /** The user's wallet secret — signs the deploy and becomes the owner. When
   *  omitted, a throwaway funded account is used (so deploys work pre-wallet). */
  deployerSecret?: string
}

/** Injectable seam for tests: swap the RPC server, Friendbot HTTP client, WASM
 *  reader and sleep so the whole deploy flow runs against an in-memory fake with
 *  no network. All default to the real production implementations. */
export interface DeployDeps {
  rpcServer?: rpc.Server
  fetchImpl?: typeof fetch
  readWasm?: (wasmPath: string) => Promise<Buffer>
  sleep?: Sleep
}

/**
 * Resolve the deployed contract id from a create-contract result.
 *
 * A transaction can report success yet carry no usable return value — e.g. the
 * `__constructor` signature does not match the manifest's `init.argsFromConfig`.
 * Surface that as an actionable error naming the manifest, the transaction hash
 * and the explorer URL instead of a bare `TypeError`.
 */
export function contractIdFromReturnValue(
  returnValue: xdr.ScVal | undefined,
  opts: { manifestId: string; txHash: string },
): string {
  const txExplorerUrl = `https://stellar.expert/explorer/testnet/tx/${opts.txHash}`
  const hint =
    `The __constructor signature may not match init.argsFromConfig in ` +
    `contracts/manifests/${opts.manifestId}.json.`
  if (!returnValue) {
    throw new Error(
      `Deploy of manifest "${opts.manifestId}" returned no contract address ` +
        `(tx ${opts.txHash}, ${txExplorerUrl}). ${hint}`,
    )
  }
  try {
    return Address.fromScAddress(returnValue.address()).toString()
  } catch {
    throw new Error(
      `Deploy of manifest "${opts.manifestId}" returned a non-address value ` +
        `(tx ${opts.txHash}, ${txExplorerUrl}). ${hint}`,
    )
  }
}

export async function deployContract(
  { manifest, config, deployerSecret }: DeployInput,
  deps: DeployDeps = {},
): Promise<DeployResult & { deployer: string; wasmHash: string }> {
  if (manifest.type !== 'deployable' || !manifest.wasmPath || !manifest.init) {
    throw new Error(`Manifest "${manifest.id}" is not a deployable contract`)
  }

  const readWasm =
    deps.readWasm ?? ((wasmPath: string) => readFile(resolve(process.cwd(), wasmPath)))
  const doFetch = deps.fetchImpl ?? fetch
  const doSleep = deps.sleep ?? sleep

  const wasm = await readWasm(manifest.wasmPath)
  const server = deps.rpcServer ?? new rpc.Server(RPC_URL)
  const deployer = deployerSecret
    ? Keypair.fromSecret(deployerSecret)
    : Keypair.random()
  const deployerPk = deployer.publicKey()

  // 1. Ensure the deployer is funded; poll until the RPC sees the account.
  // A provided wallet is funded at login, but fund defensively if it's missing.
  let funded = false
  if (deployerSecret) {
    try {
      await server.getAccount(deployerPk)
      funded = true
    } catch {
      funded = false
    }
  }
  if (!funded) {
    const fb = await doFetch(`${FRIENDBOT}?addr=${deployerPk}`)
    if (!fb.ok && fb.status !== 400) throw new Error(`friendbot failed: ${fb.status}`)
  }
  const getAccount = async () => {
    for (let i = 0; i < 30; i++) {
      try {
        return await server.getAccount(deployerPk)
      } catch {
        await doSleep(1000)
      }
    }
    throw new Error('deployer account never became visible on RPC')
  }

  // Build + submit, re-fetching the account each attempt and retrying on
  // transient errors: txBadSeq (sequence raced by a prior tx / RPC lag),
  // txNoAccount (a freshly funded account not yet visible), and MissingValue
  // (the just-uploaded WASM not yet visible to the create simulation).
  type Tx = Parameters<rpc.Server['prepareTransaction']>[0]
  const attemptSubmit = async (makeTx: (account: Account) => Tx) => {
    for (let i = 0; ; i++) {
      const tx = makeTx(await getAccount())
      try {
        return await submit(server, tx, deployer, doSleep)
      } catch (err) {
        const transient = /txBadSeq|txNoAccount|MissingValue/.test(String(err))
        if (!transient || i >= 15) throw err
        await doSleep(1000)
      }
    }
  }

  // 2. Upload the WASM (published by its sha256 hash).
  const wasmHash = createHash('sha256').update(wasm).digest()
  await attemptSubmit((account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(Operation.uploadContractWasm({ wasm }))
      .setTimeout(60)
      .build(),
  )

  // 3. Create the contract, invoking __constructor with the config (ordered).
  const fields = new Map(manifest.config.map((f) => [f.key, f]))
  const constructorArgs = manifest.init.argsFromConfig.map((key) => {
    const field = fields.get(key)
    if (!field) throw new Error(`Constructor arg "${key}" has no config field`)
    return toScVal(config[key] ?? field.default, scTypeOf(field), deployerPk)
  })

  const result = await attemptSubmit((account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(
        Operation.createCustomContract({
          address: new Address(deployerPk),
          wasmHash,
          constructorArgs,
        }),
      )
      .setTimeout(60)
      .build(),
  )

  const contractId = contractIdFromReturnValue(result.response.returnValue, {
    manifestId: manifest.id,
    txHash: result.hash,
  })

  return {
    contractId,
    deployer: deployerPk,
    txHash: result.hash,
    wasmHash: wasmHash.toString('hex'),
    explorerUrl: `https://stellar.expert/explorer/testnet/contract/${contractId}`,
  }
}
