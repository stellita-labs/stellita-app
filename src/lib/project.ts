import type { SandpackTheme } from '@codesandbox/sandpack-react'
import type { FileOp, FileTree, DeployedContract } from '../../shared/types'
import { SOROBAN_EVENT_HELPERS } from './soroban-events'

/**
 * The user's generated app lives as an in-memory FileTree. Sandpack (classic
 * `react-ts` template) renders it. Tailwind is injected via the Sandpack
 * `externalResources` option (NOT an index.html <script>, which the classic
 * bundler does not execute). We do NOT override the template's index.html.
 */
export const SANDPACK_TEMPLATE = 'react-ts' as const
export const TAILWIND_CDN = 'https://cdn.tailwindcss.com'

/**
 * Light Stellita theme for the in-workspace code editor + Sandpack chrome
 * (the browser Navigator: back/forward/reload/URL bar read these surface and
 * clickable colors too). The generated app renders its own UI in the preview;
 * this theme only styles our editor + chrome, not the generated output.
 */
export const sandpackTheme: SandpackTheme = {
  colors: {
    surface1: '#FFFDF5',
    surface2: '#FFF9E0',
    surface3: '#FFF3C4',
    clickable: '#8a8266',
    base: '#222222',
    disabled: '#a89f80',
    hover: '#222222',
    accent: '#D9A400',
    error: '#dc2626',
    errorSurface: '#FFE0E0',
  },
  syntax: {
    plain: '#222222',
    comment: { color: '#8a8266', fontStyle: 'italic' },
    keyword: '#a15c00',
    tag: '#2563eb',
    punctuation: '#6b6659',
    definition: '#111827',
    property: '#2563eb',
    static: '#dc2626',
    string: '#15803d',
  },
  font: {
    body: "'Poppins', ui-sans-serif, system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    size: '13px',
    lineHeight: '20px',
  },
}

/**
 * Normalises an error of unknown type into a safe user-facing string.
 * Ensures non-Errors (e.g. strings, thrown numbers, objects) render cleanly,
 * and empty or whitespace-only messages fall back to a safe default.
 */
export function formatErrorMessage(e: unknown, fallback = 'Operation failed'): string {
  let msg = ''
  if (e instanceof Error) {
    msg = e.message
  } else if (typeof e === 'string') {
    msg = e
  } else if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    msg = (e as { message: string }).message
  } else if (e != null) {
    msg = String(e)
  }
  return msg.trim() ? msg.trim() : fallback
}

/**
 * Standard error handler for template apps and project actions.
 * Logs the original error once and dispatches a normalized toast error.
 */
export function flashError(
  slug: string,
  e: unknown,
  flash?: (t: { kind: 'err'; text: string }) => void,
  fallback = 'Operation failed'
): string {
  console.error(`[${slug}]`, e)
  const text = formatErrorMessage(e, fallback)
  if (flash) flash({ kind: 'err', text })
  return text
}

const STARTER_APP = `export default function App() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFFDF5] font-sans text-[#222222]">
      <style>{\`
        @keyframes sb-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes sb-glow { 0%,100%{opacity:.45} 50%{opacity:1} }
        @keyframes sb-up { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes sb-spin { to{transform:rotate(360deg)} }
      \`}</style>

      {/* ambient yellow glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFD700] opacity-25 blur-3xl"
        style={{ animation: 'sb-glow 6s ease-in-out infinite' }}
      />
      {/* faint dot grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'radial-gradient(#222 1.3px, transparent 1.3px)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <img
          src="https://www.stellita.app/stellita/mascot-thinking.gif"
          alt="Stellita"
          width="140"
          style={{ imageRendering: 'pixelated', animation: 'sb-float 5s ease-in-out infinite' }}
        />
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ animation: 'sb-up .7s ease both' }}>
          Your app will appear here
        </h1>
        <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-[#6b6659]" style={{ animation: 'sb-up .9s ease both' }}>
          Describe it in the chat and watch it come to life — on Stellar, in seconds.
        </p>

        <div className="mt-9 flex items-center gap-2.5 text-[12px] font-medium text-[#8a8266]" style={{ animation: 'sb-up 1.1s ease both' }}>
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FFD700]" style={{ animation: 'sb-glow 1.4s ease-in-out infinite' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[#FFD700]" style={{ animation: 'sb-glow 1.4s ease-in-out .2s infinite' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[#FFD700]" style={{ animation: 'sb-glow 1.4s ease-in-out .4s infinite' }} />
          </span>
          Waiting for your idea
        </div>
      </div>
    </div>
  )
}
`

// Cosmetic project files so the generated app reads like a real create-vite
// project (and is ejectable). The Sandpack classic bundler runs from /App.tsx;
// these don't change how it runs, only how the project looks in the Code tab.
const PACKAGE_JSON = `{
  "name": "stellar-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^6.0.0",
    "typescript": "~6.0.0",
    "vite": "^8.0.0"
  }
}
`

const README = `# Stellar App

Built with Stellita — React + TypeScript + TailwindCSS, ready to talk to
Stellar smart contracts.

\`\`\`bash
pnpm install
pnpm dev
\`\`\`
`

// The HTML host page. Tailwind is loaded via its CDN here (and also injected
// into the preview by Sandpack). Keep the #root mount point.
const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stellar App</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

/** Files present in every project regardless of content. */
const BASE_FILES: FileTree = {
  '/package.json': PACKAGE_JSON,
  '/README.md': README,
  '/public/index.html': INDEX_HTML,
}

/** Merge the base project files under a set of app files. */
export function withBaseFiles(files: FileTree): FileTree {
  return { ...BASE_FILES, ...files }
}

/**
 * The canvas every new project starts from. Pre-scaffolded with the FULL on-chain
 * dev kit (/stellar.ts, /polyfills.ts, /contracts.ts) + npm deps (incl
 * react-router-dom). So whatever the LLM builds, the wallet + contract plumbing
 * already exists — it never invents or stubs /stellar.ts and never hits "module
 * not found". /contracts.ts starts EMPTY and fills in when the LLM deploys a
 * contract (deploying is the core flow). The visible App is the empty state until
 * the first prompt replaces it.
 */
export function initialFileTree(): FileTree {
  const tree = injectDappPlumbing(withBaseFiles({ '/App.tsx': STARTER_APP }))
  tree['/contracts.ts'] = scaffoldContractsFile()
  return tree
}

/** A /contracts.ts that EXISTS (so the kit's imports always resolve) but is EMPTY.
 *  It fills in when the user deploys a contract — empty by design so the LLM
 *  proposes a real deploy, which is the core of the product. */
function scaffoldContractsFile(): string {
  return `// Auto-generated by Stellita. Do not edit by hand.
// Deployed contracts for this project appear here after you deploy them.
export const NETWORK = 'testnet' as const
export const RPC_URL = 'https://soroban-testnet.stellar.org' as const
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015' as const

// A funded account used as the source for read-only contract simulations.
export const VIEW_SOURCE = '${DEMO_TOKEN_VIEW_SOURCE}'

// Empty until you deploy a contract — the platform fills this in.
export const CONTRACTS: Record<
  string,
  { name: string; category: string; contractId: string; owner: string; explorerUrl: string }
> = {}

export type ContractKey = keyof typeof CONTRACTS
`
}

/** npm deps the on-chain dev kit needs (merged into the app's package.json).
 *  react-router-dom is included so multi-page apps never hit a missing dep. */
const STELLAR_DEPS: Record<string, string> = {
  buffer: '^6.0.3',
  '@stellar/stellar-sdk': '^13.1.0',
  '@stellar/freighter-api': '^4.1.0',
  'react-router-dom': '^6.30.0',
}

/**
 * Inject the on-chain dev kit into a project so the GENERATED app (not just the
 * pre-built demos) can read/write contracts with a wallet: the reusable Stellar
 * client (/stellar.ts), the Buffer polyfill (/polyfills.ts), and the npm deps.
 * Called when a contract is deployed/connected. Idempotent.
 */
export function injectDappPlumbing(tree: FileTree): FileTree {
  const next: FileTree = {
    ...tree,
    '/stellar.ts': STELLAR_LIB,
    '/polyfills.ts': POLYFILLS,
  }
  try {
    const pkg = JSON.parse(tree['/package.json'] ?? PACKAGE_JSON)
    pkg.dependencies = { ...(pkg.dependencies ?? {}), ...STELLAR_DEPS }
    next['/package.json'] = JSON.stringify(pkg, null, 2) + '\n'
  } catch {
    next['/package.json'] = STELLAR_PACKAGE_JSON
  }
  return next
}

/** Apply the LLM's file operations to the tree (PLAN.md §5.4). Pure. */
export function applyFileOps(tree: FileTree, ops: FileOp[]): FileTree {
  const next = { ...tree }
  for (const op of ops) {
    if (op.op === 'create' || op.op === 'edit') next[op.path] = op.content
    else if (op.op === 'delete') delete next[op.path]
  }
  return next
}

// --- Example starters. A `files` example is a pre-built, working dApp (no LLM)
// wired to a SHARED pre-deployed testnet contract: it reads live on-chain state
// and connects Freighter. A `prompt` example drives the LLM from the blank
// template. ---

/** Browser polyfills so @stellar/stellar-sdk runs in the sandbox. Imported
 *  FIRST (before the SDK) so Buffer exists when the SDK module evaluates. */
const POLYFILLS = `import { Buffer } from 'buffer'
const g = globalThis as unknown as { Buffer?: unknown }
if (!g.Buffer) g.Buffer = Buffer
`

/** Shared, pre-deployed Demo fungible token on testnet. Its owner secret lives
 *  in FAUCET_SECRET so /api/faucet can mint test tokens to connected wallets. */
const DEMO_TOKEN_ID = 'CD7XBRBY2IZASZIXZYXWR33ZUSUBUTXTY5MEGDLCAMOBVGQSLU6X675M'
const DEMO_TOKEN_VIEW_SOURCE =
  'GBDFURES5STGVPMBLLPK4DAL5H2LKRETUSWC7T2YSVJO7PGFKN57DIQS'

const STELLAR_PACKAGE_JSON = `{
  "name": "stellar-dapp",
  "private": true,
  "version": "0.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "buffer": "^6.0.3",
    "@stellar/stellar-sdk": "^13.1.0",
    "@stellar/freighter-api": "^4.1.0"
  }
}
`

/** A tiny reusable Soroban client: read-only view calls + Freighter writes. */
const STELLAR_LIB = `import {
  rpc,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'
import freighterApi from '@stellar/freighter-api'

export const RPC_URL = 'https://soroban-testnet.stellar.org'
export const NETWORK_PASSPHRASE = Networks.TESTNET
const server = new rpc.Server(RPC_URL)
${SOROBAN_EVENT_HELPERS}

/** Read a view method (no wallet). Uses a funded account just as a sim source. */
export async function readContract(
  contractId: string,
  method: string,
  viewSource: string,
  args: any[] = [],
) {
  const c = new Contract(contractId)
  const source = await server.getAccount(viewSource)
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(c.call(method, ...args))
    .setTimeout(30)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  return scValToNative(sim.result!.retval)
}

export const addr = (a: string) => new Address(a).toScVal()
export const i128 = (n: bigint | number) => nativeToScVal(BigInt(n), { type: 'i128' })
export const u32 = (n: number) => nativeToScVal(n, { type: 'u32' })
export const u64 = (n: bigint | number) => nativeToScVal(BigInt(n), { type: 'u64' })
/** Build a Vec<Address> ScVal — e.g. a Soroswap swap path [tokenIn, tokenOut]. */
export const pathVec = (addresses: string[]) =>
  xdr.ScVal.scvVec(addresses.map((a) => new Address(a).toScVal()))

/** Fund an account with 10,000 test XLM from Stellar friendbot (testnet only).
 *  A 400 means the account is already funded — fine, it already holds XLM. */
export async function fundWithFriendbot(address: string): Promise<void> {
  const r = await fetch('https://friendbot.stellar.org?addr=' + encodeURIComponent(address))
  if (!r.ok && r.status !== 400) throw new Error('Friendbot failed (' + r.status + ')')
}

/** Token ids of an NFT collection currently owned by \`user\` (verified via
 *  owner_of). Candidate ids are gathered from recent contract events. */
export async function getOwnedNftIds(
  contractId: string,
  user: string,
  viewSource: string,
): Promise<number[]> {
  const latest = await server.getLatestLedger()
  const res = await server.getEvents({
    startLedger: Math.max(latest.sequence - 8000, 1),
    filters: [{ type: 'contract', contractIds: [contractId] }],
    limit: 100,
  })
  const candidates = new Set<number>()
  for (const ev of res.events ?? []) {
    try {
      for (const id of nftIdCandidates(ev)) candidates.add(id)
    } catch {}
  }
  const owned: number[] = []
  for (const id of [...candidates].slice(0, 50)) {
    try {
      const owner = await readContract(contractId, 'owner_of', viewSource, [u32(id)])
      if (String(owner) === user) owned.push(id)
    } catch {}
  }
  return owned.sort((a, b) => a - b)
}

export type Movement = {
  kind: 'in' | 'out' | 'mint'
  counterparty: string
  amount: string
  time: string
  txHash: string
}

/** Recent token movements (transfer/mint events) involving \`user\`, newest first. */
export async function getTokenActivity(
  contractId: string,
  user: string,
  decimals: number,
): Promise<Movement[]> {
  const latest = await server.getLatestLedger()
  const startLedger = Math.max(latest.sequence - 8000, 1) // ~11h of history
  const res = await server.getEvents({
    startLedger,
    filters: [{ type: 'contract', contractIds: [contractId] }],
    limit: 100,
  })
  const out: Movement[] = []
  for (const ev of res.events ?? []) {
    try {
      const movement = movementFromEvent(ev, user, decimals)
      if (movement) out.push(movement)
    } catch {
      // skip events we can't decode
    }
  }
  return out.reverse()
}

export type Swap = { paid: string; paidSym: string; received: string; recvSym: string; time: string; txHash: string }

/** Recent swaps between tokens \`a\` and \`b\` by \`user\`. Per tx, the token sent
 *  FROM the user is "paid" and the token sent TO the user is "received". Pass the
 *  LESS-busy token as \`b\` (it anchors — the native XLM SAC is too busy to find
 *  in an unfiltered page, so we topic-filter server-side by the user's address).
 *  Matches both 3-topic (token) and 4-topic (classic SAC) transfer layouts.
 *  Newest first. Window = the RPC's event retention (~7 days on testnet). */
export async function getSwapHistory(
  user: string,
  a: { id: string; sym: string },
  b: { id: string; sym: string },
  decimals = 7,
): Promise<Swap[]> {
  const latest = await server.getLatestLedger()
  const sym = xdr.ScVal.scvSymbol('transfer').toXDR('base64')
  const meScv = new Address(user).toScVal().toXDR('base64')
  // user as sender (idx1) or recipient (idx2), for 3- and 4-topic transfers.
  const involvingMe = [
    [sym, meScv, '*'], [sym, '*', meScv],
    [sym, meScv, '*', '*'], [sym, '*', meScv, '*'],
  ]
  const fetchEvents = async (contractId: string) => {
    for (const back of [120000, 17000, 2000]) {
      try {
        const res = await server.getEvents({
          startLedger: Math.max(latest.sequence - back, 1),
          filters: [{ type: 'contract', contractIds: [contractId], topics: involvingMe }],
          limit: 200,
        })
        return res.events ?? []
      } catch {}
    }
    return []
  }
  const amountOf = (ev: any): bigint => BigInt(eventAmountValue(scValToNative(ev.value)))
  // role: 'out' = user sent it, 'in' = user received it.
  const legsOf = (events: any[]) => {
    const m = new Map<string, { amount: bigint; role: 'in' | 'out'; time: string }>()
    for (const ev of events) {
      try {
        const topic = (ev.topic as any[]).map((t) => scValToNative(t))
        if (String(topic[0]) !== 'transfer') continue
        const role = String(topic[1]) === user ? 'out' : String(topic[2]) === user ? 'in' : null
        if (!role) continue
        m.set((ev as any).txHash ?? '', {
          amount: amountOf(ev),
          role,
          time: (ev as any).ledgerClosedAt ?? '',
        })
      } catch {}
    }
    return m
  }
  const [aEvents, bEvents] = await Promise.all([fetchEvents(a.id), fetchEvents(b.id)])
  const aLegs = legsOf(aEvents)
  const bLegs = legsOf(bEvents)
  const swaps: Swap[] = []
  for (const [tx, bLeg] of bLegs) {
    const aLeg = aLegs.get(tx)
    if (bLeg.role === 'in') {
      // received b => paid a
      swaps.push({
        paid: aLeg ? fromUnits(aLeg.amount, decimals) : '—',
        paidSym: a.sym,
        received: fromUnits(bLeg.amount, decimals),
        recvSym: b.sym,
        time: bLeg.time,
        txHash: tx,
      })
    } else {
      // sent b => received a
      swaps.push({
        paid: fromUnits(bLeg.amount, decimals),
        paidSym: b.sym,
        received: aLeg ? fromUnits(aLeg.amount, decimals) : '—',
        recvSym: a.sym,
        time: bLeg.time,
        txHash: tx,
      })
    }
  }
  swaps.sort((x, y) => String(y.time).localeCompare(String(x.time)))
  return swaps
}

/** Human amount -> base units (scaled by the token's decimals). */
export function toUnits(human: string | number, decimals: number): bigint {
  const s = String(human).trim()
  const [whole, frac = ''] = s.split('.')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
}

/** Base units -> human string (trims trailing zeros; thousands separators). */
export function fromUnits(raw: bigint | string, decimals: number): string {
  const v = BigInt(raw)
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  const wholeStr = whole.toLocaleString('en-US')
  return frac ? wholeStr + '.' + frac : wholeStr
}

// Browser extensions inject only into the top frame, never the cross-origin
// Sandpack preview iframe. So in the preview we delegate wallet ops to the host
// window (which DOES have Freighter) over postMessage; standalone/exported apps
// (top-level) talk to Freighter directly.
const inIframe = typeof window !== 'undefined' && window.parent !== window.self

function bridge(method: string, extra: Record<string, unknown> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    const onMsg = (e: MessageEvent) => {
      const m = e.data
      if (!m || m.source !== 'xlmcode-host' || m.id !== id) return
      window.removeEventListener('message', onMsg)
      if (m.error) reject(new Error(m.error))
      else resolve(m.result)
    }
    window.addEventListener('message', onMsg)
    window.parent.postMessage({ source: 'xlmcode-dapp', id, method, ...extra }, '*')
    setTimeout(() => {
      window.removeEventListener('message', onMsg)
      reject(new Error('Wallet request timed out'))
    }, 120000)
  })
}

/** Connect Freighter and return the user's address. */
export async function connectWallet(): Promise<string> {
  if (inIframe) return bridge('getAddress')
  const c = await freighterApi.isConnected()
  if (!c.isConnected) throw new Error('Freighter is not installed. Get it at freighter.app')
  const access = await freighterApi.requestAccess()
  if (access.error) throw new Error(String(access.error))
  return access.address
}

export async function getConnectedAddress(): Promise<string | null> {
  if (inIframe) return null // require an explicit Connect click inside the preview
  const c = await freighterApi.isConnected()
  if (!c.isConnected) return null
  const a = await freighterApi.getAddress()
  return a.address || null
}

/** Claim test tokens from the demo faucet (owner-minted by the host backend). */
export async function claimTokens(address: string): Promise<string> {
  if (inIframe) return bridge('faucet', { address })
  const data = await claimFaucet(address)
  return data.hash
}

/** Mint a Demo NFT to \`address\` (owner-minted by the host backend). */
export async function mintNft(
  address: string,
): Promise<{ hash: string; tokenId: number | null }> {
  if (inIframe) return JSON.parse(await bridge('mintNft', { address }))
  const data = await mintDemoNft(address)
  return { hash: data.hash, tokenId: data.tokenId != null ? Number(data.tokenId) : null }
}

async function signXDR(xdr: string, address: string): Promise<string> {
  if (inIframe) return bridge('signXDR', { xdr, address, networkPassphrase: NETWORK_PASSPHRASE })
  const s = await freighterApi.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  })
  if (s.error) throw new Error(String(s.error))
  return s.signedTxXdr
}

/** Build, sign (Freighter, via host bridge in the preview) and submit a write. */
export async function invokeContract(
  contractId: string,
  method: string,
  caller: string,
  args: any[] = [],
): Promise<string> {
  // Submit via the raw Soroban JSON-RPC. We deliberately do NOT re-parse the
  // signed envelope client-side (TransactionBuilder.fromXDR), which can throw
  // "Bad union switch" when the signer emits newer XDR than this SDK build.
  const rpcCall = async (m: string, params: any) => {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params }),
    })
    const j = await res.json()
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error))
    return j.result
  }
  const isBadSeq = (resultXdr: string) => {
    try {
      return xdr.TransactionResult.fromXDR(resultXdr, 'base64').result().switch().name === 'txBadSeq'
    } catch { return false }
  }
  // The public testnet RPC is load-balanced and can hand back a stale account
  // sequence right after a previous tx -> txBadSeq. Re-fetch the account and
  // retry (only on txBadSeq, which means the tx was rejected, never executed).
  let lastErr = ''
  for (let attempt = 0; attempt < 4; attempt++) {
    const c = new Contract(contractId)
    const source = await server.getAccount(caller)
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(c.call(method, ...args))
      .setTimeout(60)
      .build()
    const prepared = await server.prepareTransaction(tx)
    const signedXdr = await signXDR(prepared.toXDR(), caller)
    const sent = await rpcCall('sendTransaction', { transaction: signedXdr })
    if (sent.status === 'ERROR') {
      if (isBadSeq(sent.errorResultXdr) && attempt < 3) {
        lastErr = 'txBadSeq'
        await new Promise((r) => setTimeout(r, 1500))
        continue
      }
      throw new Error('Submit failed: ' + (sent.errorResultXdr || JSON.stringify(sent)))
    }
    for (let i = 0; i < 25; i++) {
      const got = await rpcCall('getTransaction', { hash: sent.hash })
      if (got.status === 'SUCCESS') return sent.hash
      if (got.status === 'FAILED') throw new Error('Transaction failed on-chain')
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('Transaction timed out')
  }
  throw new Error('Submit failed after retries (' + lastErr + ')')
}
`

const DEMO_TOKEN_APP = `import './polyfills'
import { useCallback, useEffect, useState } from 'react'
import {
  readContract,
  connectWallet,
  getConnectedAddress,
  invokeContract,
  claimTokens,
  getTokenActivity,
  addr,
  i128,
  toUnits,
  fromUnits,
} from './stellar'
import { TOKEN_ID, VIEW_SOURCE, EXPLORER, short, fmt } from './lib'
import type { Toast } from './lib'
import Header from './components/Header'
import BalanceCard from './components/BalanceCard'
import FaucetCard from './components/FaucetCard'
import SendForm from './components/SendForm'
import ActivityList from './components/ActivityList'
import ToastBar from './components/Toast'

export default function App() {
  const [meta, setMeta] = useState<{ name: string; symbol: string; supply: string } | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [activity, setActivity] = useState<any[]>([])
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('100')
  const [decimals, setDecimals] = useState(18)
  const [busy, setBusy] = useState<'' | 'connect' | 'claim' | 'send'>('')
  const [toast, setToast] = useState<Toast>(null)

  const sym = meta?.symbol ?? 'DEMO'
  const flash = (t: Toast) => { setToast(t); if (t) setTimeout(() => setToast(null), 4000) }
  const flashError = (slug: string, e: unknown) => {
    console.error('[' + slug + ']', e)
    let msg = ''
    if (e instanceof Error) msg = e.message
    else if (typeof e === 'string') msg = e
    else if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') msg = (e as any).message
    else if (e != null) msg = String(e)
    const text = msg.trim() ? msg.trim() : 'Operation failed'
  const flashError = (e: unknown, fallback = 'Operation failed') => {
    const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : e != null && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' ? (e as { message: string }).message : String(e ?? '')
    const text = raw.trim() || fallback
    flash({ kind: 'err', text })
  }

  const loadMeta = useCallback(async () => {
    try {
      const [name, symbol, supply, dec] = await Promise.all([
        readContract(TOKEN_ID, 'name', VIEW_SOURCE),
        readContract(TOKEN_ID, 'symbol', VIEW_SOURCE),
        readContract(TOKEN_ID, 'total_supply', VIEW_SOURCE),
        readContract(TOKEN_ID, 'decimals', VIEW_SOURCE),
      ])
      setMeta({ name, symbol, supply: String(supply) })
      setDecimals(Number(dec))
    } catch (e: unknown) { flashError('loadMeta', e) }
    } catch (e: unknown) { flashError(e) }
  }, [])

  const loadBalance = useCallback(async (a: string) => {
    try { setBalance(String(await readContract(TOKEN_ID, 'balance', VIEW_SOURCE, [addr(a)]))) }
    catch (e: unknown) { flashError('loadBalance', e) }
    catch (e: unknown) { flashError(e) }
  }, [])

  const loadActivity = useCallback(async (a: string) => {
    try {
      const fetched = await getTokenActivity(TOKEN_ID, a, decimals)
      setActivity((prev) => {
        const seen = new Set(fetched.map((m) => m.txHash).filter(Boolean))
        const pending = prev.filter((m) => m.txHash && !seen.has(m.txHash))
        return [...pending, ...fetched]
      })
    } catch {}
  }, [decimals])

  const refresh = useCallback(async (a: string) => {
    await Promise.all([loadBalance(a), loadActivity(a), loadMeta()])
  }, [loadBalance, loadActivity, loadMeta])

  useEffect(() => {
    loadMeta()
    getConnectedAddress().then((a) => { if (a) { setAddress(a); refresh(a) } })
  }, [loadMeta, refresh])

  const connect = async () => {
    setBusy('connect')
    try { const a = await connectWallet(); setAddress(a); await refresh(a) }
    catch (e: unknown) { flashError('connect', e) }
    catch (e: unknown) { flashError(e) }
    finally { setBusy('') }
  }

  const disconnect = () => {
    setAddress(null); setBalance(null); setActivity([])
  }

  const prepend = (m: any) => setActivity((prev) => [m, ...prev])

  const claim = async () => {
    if (!address) return
    setBusy('claim')
    try {
      const hash = await claimTokens(address)
      prepend({ kind: 'mint', counterparty: '', amount: '1000', time: new Date().toISOString(), txHash: hash })
      flash({ kind: 'ok', text: 'Claimed 1,000 ' + sym + ' 🎉' })
      refresh(address)
    } catch (e: unknown) { flashError('claim', e) }
    } catch (e: unknown) { flashError(e) }
    finally { setBusy('') }
  }

  const send = async () => {
    if (!address || !to) return
    const recipient = to
    setBusy('send')
    try {
      const hash = await invokeContract(TOKEN_ID, 'transfer', address, [addr(address), addr(recipient), i128(toUnits(amount, decimals))])
      prepend({ kind: 'out', counterparty: recipient, amount, time: new Date().toISOString(), txHash: hash })
      setTo('')
      flash({ kind: 'ok', text: 'Sent ' + fmt(amount) + ' ' + sym + ' · ' + short(hash) })
      refresh(address)
    } catch (e: unknown) { flashError('send', e) }
    } catch (e: unknown) { flashError(e) }
    finally { setBusy('') }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-slate-100 px-4 py-10 font-sans text-slate-900">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Header
          name={meta?.name ?? 'Demo'}
          address={address}
          busy={busy === 'connect'}
          onConnect={connect}
          onDisconnect={disconnect}
        />
        <BalanceCard
          address={address}
          balance={balance}
          meta={meta}
          decimals={decimals}
          sym={sym}
        />
        {!address ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-slate-600">Connect your Freighter wallet to claim test tokens and send them.</p>
            <button onClick={connect} disabled={busy === 'connect'}
              className="mt-3 w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60">
              {busy === 'connect' ? 'Connecting…' : 'Connect Freighter'}
            </button>
          </div>
        ) : (
          <>
            <FaucetCard sym={sym} busy={busy === 'claim'} onClaim={claim} />
            <SendForm
              sym={sym}
              to={to}
              amount={amount}
              busy={busy === 'send'}
              onToChange={setTo}
              onAmountChange={setAmount}
              onSend={send}
            />
            <ActivityList activity={activity} sym={sym} />
          </>
        )}
        <a href={EXPLORER} target="_blank" rel="noreferrer"
          className="block text-center text-xs text-slate-400 transition hover:text-slate-600">
          Live on Stellar testnet · contract {short(TOKEN_ID)} ↗
        </a>
      </div>
      <ToastBar toast={toast} />
    </div>
  )
}
`

const DEMO_TOKEN_LIB = `export const TOKEN_ID = '${DEMO_TOKEN_ID}'
export const VIEW_SOURCE = '${DEMO_TOKEN_VIEW_SOURCE}'
export const EXPLORER = 'https://stellar.expert/explorer/testnet/contract/' + TOKEN_ID
export const short = (a: string) => a.slice(0, 4) + '…' + a.slice(-4)
export const fmt = (n: string | number) => Number(n).toLocaleString()
export const ago = (iso: string) => {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return s + 's ago'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}
export type Toast = { kind: 'ok' | 'err'; text: string } | null
`

const DEMO_TOKEN_HEADER = `import { short } from '../lib'

interface Props {
  name: string
  address: string | null
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
}

export default function Header({ name, address, busy, onConnect, onDisconnect }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-sm">D</div>
        <div>
          <h1 className="text-[15px] font-semibold leading-none">{name} Wallet</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">Stellar testnet</p>
        </div>
      </div>
      {address ? (
        <button onClick={onDisconnect} title="Disconnect"
          className="group inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:ring-red-300 hover:text-red-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 group-hover:bg-red-500" />
          <span className="group-hover:hidden">{short(address)}</span>
          <span className="hidden group-hover:inline">Disconnect</span>
        </button>
      ) : (
        <button onClick={onConnect} disabled={busy}
          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">
          {busy ? 'Connecting…' : 'Connect wallet'}
        </button>
      )}
    </div>
  )
}
`

const DEMO_TOKEN_BALANCE = `import { fromUnits } from '../stellar'

interface Props {
  address: string | null
  balance: string | null
  meta: { name: string; symbol: string; supply: string } | null
  decimals: number
  sym: string
}

export default function BalanceCard({ address, balance, meta, decimals, sym }: Props) {
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-lg shadow-indigo-200">
      <p className="text-xs font-medium uppercase tracking-wide text-indigo-200">
        {address ? 'Your balance' : 'Total supply'}
      </p>
      <p className="mt-1 text-4xl font-bold tracking-tight">
        {address
          ? balance === null ? '—' : fromUnits(balance, decimals)
          : meta ? fromUnits(meta.supply, decimals) : '—'}
        <span className="ml-2 text-lg font-medium text-indigo-200">{sym}</span>
      </p>
      {address && meta && (
        <p className="mt-2 text-xs text-indigo-200">Total supply · {fromUnits(meta.supply, decimals)} {sym}</p>
      )}
    </div>
  )
}
`

const DEMO_TOKEN_FAUCET = `interface Props {
  sym: string
  busy: boolean
  onClaim: () => void
}

export default function FaucetCard({ sym, busy, onClaim }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-medium">Need tokens?</p>
        <p className="text-xs text-slate-500">Claim 1,000 {sym} free on testnet.</p>
      </div>
      <button onClick={onClaim} disabled={busy}
        className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60">
        {busy ? 'Claiming…' : 'Claim'}
      </button>
    </div>
  )
}
`

const DEMO_TOKEN_SEND = `interface Props {
  sym: string
  to: string
  amount: string
  busy: boolean
  onToChange: (v: string) => void
  onAmountChange: (v: string) => void
  onSend: () => void
}

const field =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

export default function SendForm({ sym, to, amount, busy, onToChange, onAmountChange, onSend }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-3 text-sm font-semibold">Send {sym}</p>
      <label className="mb-1 block text-xs font-medium text-slate-500">Recipient</label>
      <input value={to} onChange={(e) => onToChange(e.target.value)} placeholder="G…" className={field} />
      <label className="mb-1 mt-3 block text-xs font-medium text-slate-500">Amount</label>
      <input value={amount} onChange={(e) => onAmountChange(e.target.value)} inputMode="numeric" className={field} />
      <button onClick={onSend} disabled={!to || busy}
        className="mt-4 w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
        {busy ? 'Signing…' : 'Sign & send'}
      </button>
    </div>
  )
}
`

const DEMO_TOKEN_ACTIVITY = `import { short, ago } from '../lib'

interface Movement {
  kind: string
  counterparty: string
  amount: string
  time: string
  txHash: string
}

export default function ActivityList({ activity, sym }: { activity: Movement[]; sym: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-3 text-sm font-semibold">Activity</p>
      {activity.length === 0 ? (
        <p className="text-xs text-slate-400">No movements yet. Claim or send to see them here.</p>
      ) : (
        <ul className="space-y-1">
          {activity.slice(0, 8).map((m, i) => (
            <li key={i}>
              <a
                href={m.txHash ? 'https://stellar.expert/explorer/testnet/tx/' + m.txHash : undefined}
                target="_blank" rel="noreferrer"
                className={'-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition ' + (m.txHash ? 'hover:bg-slate-50' : '')}>
                <div className="flex items-center gap-2.5">
                  <span className={'flex h-7 w-7 items-center justify-center rounded-full text-xs ' +
                    (m.kind === 'out' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600')}>
                    {m.kind === 'out' ? '↑' : '↓'}
                  </span>
                  <div>
                    <p className="font-medium leading-none">
                      {m.kind === 'out' ? 'Sent' : m.kind === 'mint' ? 'Claimed' : 'Received'}
                      {m.txHash && <span className="ml-1 text-[10px] text-slate-400">↗</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {m.counterparty ? short(m.counterparty) + ' · ' : ''}{ago(m.time)}
                    </p>
                  </div>
                </div>
                <span className={'font-semibold ' + (m.kind === 'out' ? 'text-rose-600' : 'text-emerald-600')}>
                  {m.kind === 'out' ? '-' : '+'}{m.amount} {sym}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
`

const DEMO_TOKEN_TOAST = `import type { Toast } from '../lib'

export default function ToastBar({ toast }: { toast: Toast }) {
  if (!toast) return null
  return (
    <div className={'fixed bottom-5 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ' +
      (toast.kind === 'ok' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white')}>
      {toast.text}
    </div>
  )
}
`

/** Shared, pre-deployed Demo NFT collection on testnet (same owner as the token,
 *  so /api/mint-nft signs mints with FAUCET_SECRET). */
const DEMO_NFT_ID = 'CD4HFX54Y3WIUYZUYRYK5LMNIYSX27CNDFYSZLEVE66MJCVVPSCYA3CU'
const DEMO_NFT_VIEW_SOURCE =
  'GBDFURES5STGVPMBLLPK4DAL5H2LKRETUSWC7T2YSVJO7PGFKN57DIQS'

const DEMO_NFT_APP = `import './polyfills'
import { useCallback, useEffect, useState } from 'react'
import {
  readContract,
  connectWallet,
  getConnectedAddress,
  mintNft,
  getOwnedNftIds,
} from './stellar'
import { NFT_ID, VIEW_SOURCE, EXPLORER, short } from './lib'
import type { Toast } from './lib'
import Header from './components/Header'
import MintCard from './components/MintCard'
import Gallery from './components/Gallery'
import ToastBar from './components/Toast'

export default function App() {
  const [meta, setMeta] = useState<{ name: string; symbol: string } | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [owned, setOwned] = useState<number[]>([])
  const [loadingOwned, setLoadingOwned] = useState(false)
  const [busy, setBusy] = useState<'' | 'connect' | 'mint'>('')
  const [toast, setToast] = useState<Toast>(null)

  const flash = (t: Toast) => { setToast(t); if (t) setTimeout(() => setToast(null), 4000) }
  const flashError = (slug: string, e: unknown) => {
    console.error('[' + slug + ']', e)
    let msg = ''
    if (e instanceof Error) msg = e.message
    else if (typeof e === 'string') msg = e
    else if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') msg = (e as any).message
    else if (e != null) msg = String(e)
    const text = msg.trim() ? msg.trim() : 'Operation failed'
  const flashError = (e: unknown, fallback = 'Operation failed') => {
    const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : e != null && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' ? (e as { message: string }).message : String(e ?? '')
    const text = raw.trim() || fallback
    flash({ kind: 'err', text })
  }

  const loadMeta = useCallback(async () => {
    try {
      const [name, symbol] = await Promise.all([
        readContract(NFT_ID, 'name', VIEW_SOURCE),
        readContract(NFT_ID, 'symbol', VIEW_SOURCE),
      ])
      setMeta({ name: String(name), symbol: String(symbol) })
    } catch (e: unknown) { flashError('loadMeta', e) }
    } catch (e: unknown) { flashError(e) }
  }, [])

  const loadOwned = useCallback(async (a: string) => {
    setLoadingOwned(true)
    try {
      const ids = await getOwnedNftIds(NFT_ID, a, VIEW_SOURCE)
      setOwned((prev) => Array.from(new Set([...prev, ...ids])).sort((x, y) => x - y))
    } catch {} finally {
      setLoadingOwned(false)
    }
  }, [])

  useEffect(() => {
    loadMeta()
    getConnectedAddress().then((a) => { if (a) { setAddress(a); loadOwned(a) } })
  }, [loadMeta, loadOwned])

  const connect = async () => {
    setBusy('connect')
    try { const a = await connectWallet(); setAddress(a); await loadOwned(a) }
    catch (e: unknown) { flashError('connect', e) }
    catch (e: unknown) { flashError(e) }
    finally { setBusy('') }
  }

  const disconnect = () => { setAddress(null); setOwned([]) }

  const mint = async () => {
    if (!address) return
    setBusy('mint')
    try {
      const { tokenId } = await mintNft(address)
      if (tokenId != null) setOwned((o) => [...new Set([...o, tokenId])].sort((x, y) => x - y))
      await loadOwned(address)
      flash({ kind: 'ok', text: tokenId != null ? 'Minted NFT #' + tokenId + ' 🎨' : 'Minted! 🎨' })
    } catch (e: unknown) { flashError('mint', e) }
    } catch (e: unknown) { flashError(e) }
    finally { setBusy('') }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 font-sans text-zinc-100"
      style={{ backgroundImage: 'radial-gradient(60rem 40rem at 50% -10%, rgba(139,92,246,0.18), transparent), radial-gradient(40rem 30rem at 90% 10%, rgba(34,211,238,0.12), transparent)' }}>
      <div className="mx-auto w-full max-w-2xl">
        <Header
          name={meta?.name ?? 'Demo NFTs'}
          symbol={meta?.symbol ?? 'DNFT'}
          address={address}
          busy={busy === 'connect'}
          onConnect={connect}
          onDisconnect={disconnect}
        />
        <MintCard
          address={address}
          owned={owned}
          busy={busy}
          onMint={mint}
          onConnect={connect}
        />
        <Gallery owned={owned} loading={loadingOwned} symbol={meta?.symbol ?? 'DNFT'} />
        <a href={EXPLORER} target="_blank" rel="noreferrer"
          className="mt-6 block text-center text-xs text-zinc-600 transition hover:text-zinc-400">
          Live on Stellar testnet · contract {short(NFT_ID)} ↗
        </a>
      </div>
      <ToastBar toast={toast} />
    </div>
  )
}
`

const DEMO_NFT_LIB = `export const NFT_ID = '${DEMO_NFT_ID}'
export const VIEW_SOURCE = '${DEMO_NFT_VIEW_SOURCE}'
export const EXPLORER = 'https://stellar.expert/explorer/testnet/contract/' + NFT_ID
export const short = (a: string) => a.slice(0, 4) + '…' + a.slice(-4)
export const art = (id: number) => {
  const h = (id * 53) % 360
  return 'conic-gradient(from ' + (id * 40) + 'deg, hsl(' + h + ' 90% 60%), hsl(' + ((h + 90) % 360) + ' 90% 55%), hsl(' + ((h + 200) % 360) + ' 90% 60%), hsl(' + h + ' 90% 60%))'
}
export type Toast = { kind: 'ok' | 'err'; text: string } | null
`

const DEMO_NFT_HEADER = `import { short } from '../lib'

interface Props {
  name: string
  symbol: string
  address: string | null
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
}

export default function Header({ name, symbol, address, busy, onConnect, onDisconnect }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          {name}
        </h1>
        <p className="mt-0.5 text-[11px] uppercase tracking-widest text-zinc-500">
          {symbol} · Stellar testnet
        </p>
      </div>
      {address ? (
        <button onClick={onDisconnect} title="Disconnect"
          className="group inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur transition hover:border-rose-500/50 hover:text-rose-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 group-hover:bg-rose-400" />
          <span className="group-hover:hidden">{short(address)}</span>
          <span className="hidden group-hover:inline">Disconnect</span>
        </button>
      ) : (
        <button onClick={onConnect} disabled={busy}
          className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:opacity-90 disabled:opacity-60">
          {busy ? 'Connecting…' : 'Connect wallet'}
        </button>
      )}
    </div>
  )
}
`

const DEMO_NFT_MINT = `import { art } from '../lib'

interface Props {
  address: string | null
  owned: number[]
  busy: '' | 'connect' | 'mint'
  onMint: () => void
  onConnect: () => void
}

export default function MintCard({ address, owned, busy, onMint, onConnect }: Props) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 text-center backdrop-blur">
      <div className="h-20 w-20 rounded-2xl shadow-lg shadow-violet-500/20" style={{ background: art(owned.length + 1) }} />
      <p className="text-sm text-zinc-400">
        {address ? 'Mint a unique collectible to your wallet.' : 'Connect your wallet to mint collectibles.'}
      </p>
      <button
        onClick={address ? onMint : onConnect}
        disabled={busy !== ''}
        className="rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition hover:opacity-90 disabled:opacity-60">
        {busy === 'mint' ? 'Minting…' : busy === 'connect' ? 'Connecting…' : address ? 'Mint NFT' : 'Connect Freighter'}
      </button>
      {address && (
        <>
          <p className="text-xs text-zinc-500">You own <span className="font-semibold text-zinc-300">{owned.length}</span> in this collection</p>
          <p className="text-[10px] text-zinc-600">Gasless — the collection mints it to your wallet (no signature needed)</p>
        </>
      )}
    </div>
  )
}
`

const DEMO_NFT_GALLERY = `import { art } from '../lib'

interface Props {
  owned: number[]
  loading: boolean
  symbol: string
}

export default function Gallery({ owned, loading, symbol }: Props) {
  return (
    <div className="mt-6">
      <p className="mb-3 text-sm font-semibold text-zinc-300">Your collection</p>
      {loading && owned.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />
          ))}
        </div>
      ) : owned.length === 0 ? (
        <p className="text-xs text-zinc-500">No NFTs yet — mint your first above.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {owned.map((id) => (
            <div key={id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="aspect-square" style={{ background: art(id) }} />
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold">#{id}</span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">{symbol}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
`

const DEMO_NFT_TOAST = `import type { Toast } from '../lib'

export default function ToastBar({ toast }: { toast: Toast }) {
  if (!toast) return null
  return (
    <div className={'fixed bottom-5 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ' +
      (toast.kind === 'ok' ? 'bg-gradient-to-r from-violet-500 to-cyan-400 text-zinc-950' : 'bg-rose-600 text-white')}>
      {toast.text}
    </div>
  )
}
`

// --- Soroswap swap demo. Soroswap is an AMM/DEX already deployed on testnet
// (we do NOT deploy it — the user's wallet swaps against the live Router). XLM
// is the native asset SAC; USDC is a Soroswap testnet token. Pool has liquidity. ---
const SOROSWAP_ROUTER = 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD'
const SWAP_XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
const SWAP_USDC = 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F'

const DEMO_SWAP_LIB = `export const ROUTER = '${SOROSWAP_ROUTER}'
export const XLM = '${SWAP_XLM}'
export const USDC = '${SWAP_USDC}'
export const VIEW_SOURCE = '${DEMO_TOKEN_VIEW_SOURCE}'
export const DEC = 7
export const EXPLORER = 'https://stellar.expert/explorer/testnet/contract/' + ROUTER
export const TOKENS = {
  XLM: { id: XLM, sym: 'XLM', badge: '✦', badgeBg: 'bg-slate-900' },
  USDC: { id: USDC, sym: 'USDC', badge: '$', badgeBg: 'bg-blue-500' },
}
export const short = (a: string) => a.slice(0, 4) + '…' + a.slice(-4)
export const fmt = (n: string | number) => {
  const x = Number(n)
  return x.toLocaleString('en-US', { maximumFractionDigits: x < 1 ? 6 : 2 })
}
export const ago = (iso: string) => {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return s + 's ago'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}
export type Toast = { kind: 'ok' | 'err'; text: string } | null
`

const DEMO_SWAP_HEADER = `import { short } from '../lib'

interface Props {
  address: string | null
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
}

export default function Header({ address, busy, onConnect, onDisconnect }: Props) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-base font-bold text-white shadow-sm">⇄</div>
        <div>
          <h1 className="text-[15px] font-bold leading-none tracking-tight">Stellar Swap</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">Powered by Soroswap · testnet</p>
        </div>
      </div>
      {address ? (
        <button onClick={onDisconnect} title="Disconnect"
          className="group inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-red-600 hover:ring-red-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 group-hover:bg-red-500" />
          <span className="group-hover:hidden">{short(address)}</span>
          <span className="hidden group-hover:inline">Disconnect</span>
        </button>
      ) : (
        <button onClick={onConnect} disabled={busy}
          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">
          {busy ? 'Connecting…' : 'Connect wallet'}
        </button>
      )}
    </div>
  )
}
`

const DEMO_SWAP_TOKENPANEL = `import { fmt } from '../lib'

interface Token { sym: string; badge: string; badgeBg: string }

interface Props {
  label: string
  token: Token
  balance: number | null
  address: string | null
  editable: boolean
  value?: string
  onChange?: (v: string) => void
  onMax?: () => void
  maxDisabled?: boolean
  insufficient?: boolean
  quote?: number | null
  quoting?: boolean
}

export default function TokenPanel(p: Props) {
  return (
    <div className={'rounded-2xl p-4 ' + (p.editable ? 'bg-slate-50' : 'bg-emerald-50/70')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{p.label}</span>
        {p.address && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            Balance: {p.balance === null ? '—' : fmt(p.balance)} {p.token.sym}
            {p.editable && p.onMax && (
              <button onClick={p.onMax} disabled={p.maxDisabled}
                className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-40">
                Max
              </button>
            )}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        {p.editable ? (
          <input value={p.value} onChange={(e) => p.onChange && p.onChange(e.target.value)} inputMode="decimal"
            className={'w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-slate-300 ' + (p.insufficient ? 'text-red-500' : 'text-slate-900')}
            placeholder="0.0" />
        ) : (
          <span className="w-full truncate text-3xl font-semibold tracking-tight text-slate-900">
            {p.quoting ? <span className="text-slate-300">…</span> : p.quote != null ? fmt(p.quote) : <span className="text-slate-300">0.0</span>}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200">
          <span className={'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ' + p.token.badgeBg}>{p.token.badge}</span>
          <span className="text-sm font-semibold">{p.token.sym}</span>
        </div>
      </div>
    </div>
  )
}
`

const DEMO_SWAP_CARD = `import TokenPanel from './TokenPanel'
import { fmt } from '../lib'

interface Token { sym: string; badge: string; badgeBg: string }

interface Props {
  pay: Token
  recv: Token
  payBal: number | null
  recvBal: number | null
  address: string | null
  amount: string
  onAmount: (v: string) => void
  onMax: () => void
  maxDisabled: boolean
  insufficient: boolean
  quote: number | null
  quoting: boolean
  rate: number | null
  amt: number
  busy: string
  onConnect: () => void
  onSwap: () => void
  onFlip: () => void
  onFund: () => void
}

export default function SwapCard(p: Props) {
  return (
    <>
      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/50">
        <TokenPanel label="You pay" token={p.pay} balance={p.payBal} address={p.address}
          editable value={p.amount} onChange={p.onAmount} onMax={p.onMax} maxDisabled={p.maxDisabled} insufficient={p.insufficient} />

        <div className="relative flex h-0 items-center justify-center">
          <button onClick={p.onFlip} title="Flip direction"
            className="absolute -top-3 flex h-9 w-9 items-center justify-center rounded-xl border-4 border-white bg-emerald-500 text-base text-white shadow-sm transition hover:rotate-180 hover:bg-emerald-600">
            ↓
          </button>
        </div>

        <div className="mt-1.5">
          <TokenPanel label="You receive" token={p.recv} balance={p.recvBal} address={p.address}
            editable={false} quote={p.quote} quoting={p.quoting} />
        </div>

        {p.rate && (
          <p className="px-2 pt-2.5 text-center text-[11px] text-slate-400">
            1 {p.pay.sym} ≈ {fmt(p.rate)} {p.recv.sym} · 5% max slippage
          </p>
        )}

        {!p.address ? (
          <button onClick={p.onConnect} disabled={p.busy === 'connect'}
            className="mt-3 w-full rounded-2xl bg-slate-900 px-3 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">
            {p.busy === 'connect' ? 'Connecting…' : 'Connect Freighter to swap'}
          </button>
        ) : (
          <button onClick={p.onSwap}
            disabled={p.busy === 'swap' || p.insufficient || !p.quote || !(p.amt > 0)}
            className="mt-3 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300">
            {p.busy === 'swap' ? 'Swapping…' : p.insufficient ? 'Insufficient ' + p.pay.sym + ' balance' : !(p.amt > 0) ? 'Enter an amount' : 'Swap'}
          </button>
        )}
      </div>

      {p.address && (
        <button onClick={p.onFund} disabled={p.busy === 'fund'}
          className="mx-auto mt-3 block text-xs font-medium text-slate-400 transition hover:text-emerald-600 disabled:opacity-60">
          {p.busy === 'fund' ? 'Funding…' : 'Need XLM? Get 10,000 free from friendbot →'}
        </button>
      )}
    </>
  )
}
`

const DEMO_SWAP_TOAST = `import type { Toast } from '../lib'

export default function ToastBar({ toast }: { toast: Toast }) {
  if (!toast) return null
  return (
    <div className={'fixed bottom-5 left-1/2 -translate-x-1/2 max-w-[90vw] truncate rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ' +
      (toast.kind === 'ok' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white')}>
      {toast.text}
    </div>
  )
}
`

const DEMO_SWAP_APP = `import './polyfills'
import { useCallback, useEffect, useState } from 'react'
import {
  readContract,
  connectWallet,
  getConnectedAddress,
  invokeContract,
  fundWithFriendbot,
  addr,
  i128,
  u64,
  pathVec,
  toUnits,
} from './stellar'
import { ROUTER, XLM, USDC, VIEW_SOURCE, DEC, TOKENS, EXPLORER, short, fmt } from './lib'
import type { Toast } from './lib'
import Header from './components/Header'
import SwapCard from './components/SwapCard'
import ToastBar from './components/Toast'

export default function App() {
  const [address, setAddress] = useState<string | null>(null)
  const [xlmBal, setXlmBal] = useState<number | null>(null)
  const [usdcBal, setUsdcBal] = useState<number | null>(null)
  const [amount, setAmount] = useState('100')
  const [quote, setQuote] = useState<number | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState<'' | 'connect' | 'fund' | 'swap'>('')
  const [toast, setToast] = useState<Toast>(null)
  const [dir, setDir] = useState<'XLM_USDC' | 'USDC_XLM'>('XLM_USDC')

  const pay = dir === 'XLM_USDC' ? TOKENS.XLM : TOKENS.USDC
  const recv = dir === 'XLM_USDC' ? TOKENS.USDC : TOKENS.XLM
  const payBal = dir === 'XLM_USDC' ? xlmBal : usdcBal
  const recvBal = dir === 'XLM_USDC' ? usdcBal : xlmBal

  const flash = (t: Toast) => { setToast(t); if (t) setTimeout(() => setToast(null), 4500) }
  const flashError = (slug: string, e: unknown) => {
    console.error('[' + slug + ']', e)
    let msg = ''
    if (e instanceof Error) msg = e.message
    else if (typeof e === 'string') msg = e
    else if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') msg = (e as any).message
    else if (e != null) msg = String(e)
    const text = msg.trim() ? msg.trim() : 'Operation failed'
  const flashError = (e: unknown, fallback = 'Operation failed') => {
    const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : e != null && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' ? (e as { message: string }).message : String(e ?? '')
    const text = raw.trim() || fallback
    flash({ kind: 'err', text })
  }

  const loadBalances = useCallback(async (a: string) => {
    try {
      const [x, u] = await Promise.all([
        readContract(XLM, 'balance', VIEW_SOURCE, [addr(a)]),
        readContract(USDC, 'balance', VIEW_SOURCE, [addr(a)]),
      ])
      setXlmBal(Number(BigInt(x)) / 10 ** DEC)
      setUsdcBal(Number(BigInt(u)) / 10 ** DEC)
    } catch (e: unknown) { flashError('loadBalances', e) }
    } catch (e: unknown) { flashError(e) }
  }, [])

  useEffect(() => {
    getConnectedAddress().then((a) => { if (a) { setAddress(a); loadBalances(a) } })
  }, [loadBalances])

  // Live quote (debounced): how much of recv \`amount\` of pay buys.
  useEffect(() => {
    const n = Number(amount)
    if (!n || n <= 0) { setQuote(null); return }
    let cancelled = false
    setQuoting(true)
    const t = setTimeout(async () => {
      try {
        const amounts = await readContract(ROUTER, 'router_get_amounts_out', VIEW_SOURCE, [
          i128(toUnits(amount, DEC)),
          pathVec([pay.id, recv.id]),
        ])
        const out = BigInt(amounts[amounts.length - 1])
        if (!cancelled) setQuote(Number(out) / 10 ** DEC)
      } catch { if (!cancelled) setQuote(null) }
      finally { if (!cancelled) setQuoting(false) }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [amount, dir])

  const connect = async () => {
    setBusy('connect')
    try { const a = await connectWallet(); setAddress(a); await loadBalances(a) }
    catch (e: unknown) { flashError('connect', e) }
    catch (e: unknown) { flashError(e) }
    finally { setBusy('') }
  }

  const disconnect = () => { setAddress(null); setXlmBal(null); setUsdcBal(null) }

  const flip = () => {
    setAmount(quote != null ? String(quote) : '')
    setDir((d) => (d === 'XLM_USDC' ? 'USDC_XLM' : 'XLM_USDC'))
  }

  const fund = async () => {
    if (!address) return
    setBusy('fund')
    try {
      await fundWithFriendbot(address)
      flash({ kind: 'ok', text: 'Requested 10,000 test XLM 🚀' })
      setTimeout(() => loadBalances(address), 2500)
    } catch (e: unknown) { flashError('fund', e) }
    } catch (e: unknown) { flashError(e) }
    finally { setBusy('') }
  }

  const swap = async () => {
    if (!address) return
    setBusy('swap')
    try {
      const amtIn = toUnits(amount, DEC)
      const amounts = await readContract(ROUTER, 'router_get_amounts_out', VIEW_SOURCE, [
        i128(amtIn),
        pathVec([pay.id, recv.id]),
      ])
      const out = BigInt(amounts[amounts.length - 1])
      const minOut = (out * 95n) / 100n // 5% slippage (shared testnet pool drifts)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)
      const hash = await invokeContract(ROUTER, 'swap_exact_tokens_for_tokens', address, [
        i128(amtIn),
        i128(minOut),
        pathVec([pay.id, recv.id]),
        addr(address),
        u64(deadline),
      ])
      const recvAmt = fmt(Number(out) / 10 ** DEC)
      flash({ kind: 'ok', text: 'Swapped ' + fmt(amount) + ' ' + pay.sym + ' → ' + recvAmt + ' ' + recv.sym + ' · ' + short(hash) })
      await loadBalances(address)
    } catch (e: unknown) { flashError('swap', e) }
    } catch (e: unknown) { flashError(e) }
    finally { setBusy('') }
  }

  const amt = Number(amount) || 0
  const rate = quote != null && amt > 0 ? quote / amt : null
  const insufficient = address != null && payBal != null && amt > payBal
  // When paying XLM, leave ~1 for the base reserve + tx fees; USDC needs no buffer.
  const maxSpend =
    payBal == null ? 0
      : pay.sym === 'XLM' ? Math.max(0, Math.floor((payBal - 1) * 1e7) / 1e7)
      : payBal
  const setMax = () => setAmount(String(maxSpend))

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-emerald-50/40 px-4 py-10 font-sans text-slate-900">
      <div className="mx-auto w-full max-w-md">
        <Header address={address} busy={busy === 'connect'} onConnect={connect} onDisconnect={disconnect} />
        <SwapCard
          pay={pay}
          recv={recv}
          payBal={payBal}
          recvBal={recvBal}
          address={address}
          amount={amount}
          onAmount={setAmount}
          onMax={setMax}
          maxDisabled={!maxSpend}
          insufficient={insufficient}
          quote={quote}
          quoting={quoting}
          rate={rate}
          amt={amt}
          busy={busy}
          onConnect={connect}
          onSwap={swap}
          onFlip={flip}
          onFund={fund}
        />

        <a href={EXPLORER} target="_blank" rel="noreferrer"
          className="mt-4 block text-center text-xs text-slate-400 transition hover:text-slate-600">
          Soroswap Router on Stellar testnet · {short(ROUTER)} ↗
        </a>
      </div>

      <ToastBar toast={toast} />
    </div>
  )
}
`

export interface ExampleApp {
  label: string
  /** Pre-built dApp files (no LLM) — a working demo on a shared contract. */
  files?: FileTree
  /** Shared pre-deployed contract(s) to seed into the project's Contracts tab. */
  contracts?: DeployedContract[]
  /** Or a starter prompt the LLM builds from the blank template. */
  prompt?: string
}

/** The shared Demo token shown in the Contracts tab for the token demo. */
const DEMO_TOKEN_CONTRACT: DeployedContract = {
  manifestId: 'oz-fungible-token',
  name: 'Demo',
  category: 'token',
  contractId: DEMO_TOKEN_ID,
  network: 'testnet',
  explorerUrl:
    'https://stellar.expert/explorer/testnet/contract/' + DEMO_TOKEN_ID,
  config: { name: 'Demo', symbol: 'DEMO', initial_supply: '1000000' },
  createdAt: 0,
}

/** The shared Demo NFT collection shown in the Contracts tab for the NFT demo. */
const DEMO_NFT_CONTRACT: DeployedContract = {
  manifestId: 'oz-nft',
  name: 'Demo NFTs',
  category: 'nft',
  contractId: DEMO_NFT_ID,
  network: 'testnet',
  explorerUrl: 'https://stellar.expert/explorer/testnet/contract/' + DEMO_NFT_ID,
  config: { name: 'Demo NFTs', symbol: 'DNFT', uri: 'https://stellar.org/nft/' },
  createdAt: 0,
}

/** Soroswap Router (an existing AMM on testnet) shown in the swap demo's
 *  Contracts tab. We don't deploy it — the user's wallet swaps against it. */
const SOROSWAP_CONTRACT: DeployedContract = {
  manifestId: 'soroswap-router',
  name: 'Soroswap Router',
  category: 'dex',
  contractId: SOROSWAP_ROUTER,
  network: 'testnet',
  explorerUrl:
    'https://stellar.expert/explorer/testnet/contract/' + SOROSWAP_ROUTER,
  config: { pair: 'XLM/USDC', kind: 'existing' },
  createdAt: 0,
}

export const EXAMPLE_APPS: ExampleApp[] = [
  {
    label: 'Fungible token dashboard',
    files: withBaseFiles({
      '/package.json': STELLAR_PACKAGE_JSON,
      '/polyfills.ts': POLYFILLS,
      '/stellar.ts': STELLAR_LIB,
      '/lib.ts': DEMO_TOKEN_LIB,
      '/components/Header.tsx': DEMO_TOKEN_HEADER,
      '/components/BalanceCard.tsx': DEMO_TOKEN_BALANCE,
      '/components/FaucetCard.tsx': DEMO_TOKEN_FAUCET,
      '/components/SendForm.tsx': DEMO_TOKEN_SEND,
      '/components/ActivityList.tsx': DEMO_TOKEN_ACTIVITY,
      '/components/Toast.tsx': DEMO_TOKEN_TOAST,
      '/App.tsx': DEMO_TOKEN_APP,
    }),
    contracts: [DEMO_TOKEN_CONTRACT],
  },
  {
    label: 'NFT minting app',
    files: withBaseFiles({
      '/package.json': STELLAR_PACKAGE_JSON,
      '/polyfills.ts': POLYFILLS,
      '/stellar.ts': STELLAR_LIB,
      '/lib.ts': DEMO_NFT_LIB,
      '/components/Header.tsx': DEMO_NFT_HEADER,
      '/components/MintCard.tsx': DEMO_NFT_MINT,
      '/components/Gallery.tsx': DEMO_NFT_GALLERY,
      '/components/Toast.tsx': DEMO_NFT_TOAST,
      '/App.tsx': DEMO_NFT_APP,
    }),
    contracts: [DEMO_NFT_CONTRACT],
  },
  {
    label: 'Token swap (Soroswap)',
    files: withBaseFiles({
      '/package.json': STELLAR_PACKAGE_JSON,
      '/polyfills.ts': POLYFILLS,
      '/stellar.ts': STELLAR_LIB,
      '/lib.ts': DEMO_SWAP_LIB,
      '/components/Header.tsx': DEMO_SWAP_HEADER,
      '/components/TokenPanel.tsx': DEMO_SWAP_TOKENPANEL,
      '/components/SwapCard.tsx': DEMO_SWAP_CARD,
      '/components/Toast.tsx': DEMO_SWAP_TOAST,
      '/App.tsx': DEMO_SWAP_APP,
    }),
    contracts: [SOROSWAP_CONTRACT],
  },
]
