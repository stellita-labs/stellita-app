# AGENTS.md

Guidance for humans and AI agents working in this repo. Read this before making changes.

`CLAUDE.md` and `GEMINI.md` are deliberately terse single-line stubs pointing here so all guidance and OpenSpec entry points (`openspec/project.md`) are maintained in one place.

## What this is

Stellita turns a natural-language prompt into a working Stellar dApp: an LLM
generates a multi-file React app (held in memory as a `FileTree`, rendered live
in Sandpack) and deploys audited OpenZeppelin Soroban contracts to **testnet**,
then wires the frontend to them. Everything runs on testnet — no real funds.

## Architecture

```
Browser (Vite/React SPA)
   │  fetch (credentials: include) — VITE_API_BASE
   ▼
Express backend  (server/)         ← the ONLY thing that talks to Supabase
   │  imports
   ▼
server/_lib/  (shared library: llm, guardrail, deploy, faucet, nft, contracts)
   │
   ├─ Supabase (auth, Postgres + RLS, rate-limit RPCs, token accounting)
   └─ Stellar testnet (Soroban) — deploy committed WASM via the JS SDK
```

- **One backend.** `server/_lib/*` is a shared library, not a server. The only HTTP
  server is Express (`server/`). There are no Vercel serverless handlers.
- **The backend is the only Supabase client.** The browser never queries the DB
  directly — it calls Express, which enforces RLS (per-request client with the
  user's cookie) or uses the admin client for system writes only.
- **Deploys are ephemeral.** Each deploy generates a keypair, funds it via
  Friendbot, uploads WASM and invokes the constructor. The user's Freighter
  wallet is set as the contract owner so owner-gated writes succeed.
- **Freighter bridge.** The generated app runs inside a Sandpack iframe and talks
  to Freighter through a `postMessage` bridge (`xlmcode-host` / `xlmcode-dapp`
  source strings). The host side is `useFreighterBridge()` — it MUST be mounted
  on any page that shows a preview (`AppShell`, `SharedProject`).

## Repo layout

| Path | What |
| --- | --- |
| `src/` | React app: `pages/`, `components/`, `marketing/` (landing + sales pages), `auth/`, `projects/` (in-memory + backend-synced store), `lib/`, `wallet/` |
| `server/` | Express: `routes/` (auth, projects, chat, contracts), `lib/` (supabase, email), `middleware/`, `emails/` |
| `server/_lib/` | Shared: `llm.ts`, `prompt.ts`, `guardrail.ts`, `deploy.ts`, `faucet.ts`, `nft.ts`, `contracts.ts` |
| `shared/` | `types.ts` + `schema.ts` (the agent response Zod schema — single source of truth for the LLM output contract) |
| `contracts/manifests/` | Contract manifests (one JSON per deployable/connectable contract) |
| `supabase/migrations/` | SQL migrations (apply with `supabase db push`) |
| `openspec/` | Project conventions + capability specs (see `openspec/project.md`) |

## Commands

```bash
pnpm dev            # web (5173) + API (8787) together
pnpm typecheck      # tsc for app + server — must pass
pnpm lint           # eslint — must pass
pnpm build          # tsc -b + vite build — must pass
pnpm seed:templates # seed example templates into Supabase
```

Before any PR: **`pnpm typecheck && pnpm lint && pnpm build` must all be green.**

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`…). Do
  **not** add AI attribution / `Co-Authored-By` trailers.
- **Secrets** live only in `.env.local` (gitignored). `env.example` holds
  placeholders — never commit a real key.
- **AI artifacts are English** — code, comments, UI copy, commit messages.
- **The agent output contract** is the Zod schema in `shared/schema.ts`
  (`AgentResponse` = `{ message, files: FileOp[], actions?: AgentAction[] }`).
  Change the schema, not ad-hoc parsing. AI SDK v7 usage fields are
  `inputTokens` / `outputTokens` (not prompt/completion).
- **Adding a contract** = add a manifest JSON in `contracts/manifests/` (+ WASM
  for deployables). The LLM catalog is built from these and injected into the
  system prompt — don't hardcode contracts in the prompt.
- **Generated apps style themselves.** Don't rebrand the in-preview demos in
  `src/lib/project.ts`; Stellita branding (Space Grotesk + `#FDDA24`) applies to
  our chrome only.
- **RLS is deny-by-default.** New tables need explicit policies; user data is
  owner-scoped via `auth.uid()`; system writes use the admin client.

## Specs

Capability specs (auth, projects, templates, contracts, sharing, generation) live
in `openspec/specs/` following the [OpenSpec](https://openspec.dev/) convention —
they are the source of truth for *what the system does*. Update the relevant spec
when you change behavior. `openspec/project.md` holds stack + conventions.
