<div align="center">

# Stellita

**Build on Stellar without writing a single line of Rust.**

Describe a dApp in plain language → Stellita generates a React frontend, deploys
audited OpenZeppelin Soroban contracts to Stellar **testnet**, and wires them up.
A "v0 / Lovable for Stellar".

</div>

---

## Stack

- **Frontend** — Vite + React 19 + TypeScript + Tailwind v4, live preview via [Sandpack](https://sandpack.codesandbox.io/).
- **AI** — [Vercel AI SDK](https://sdk.vercel.ai/) (`streamObject` + Zod) with OpenAI.
- **Backend** — Express (`server/`) — the only thing that talks to Supabase (auth, persistence, rate-limit, token accounting).
- **Auth + DB** — Supabase (email OTP + Google OAuth, Postgres + RLS).
- **Chain** — Stellar testnet (Soroban), contracts deployed from committed WASM via the JS SDK.
- **Email** — Resend (share links).

## Quick start

```bash
pnpm install
cp env.example .env.local        # then fill it in (see below)
pnpm dev                         # runs the web app (5173) + the API (8787)
```

Apply the database schema to your Supabase project (one-time):

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Then seed the example templates (optional):

```bash
pnpm seed:templates
```

## Environment (`.env.local`)

Copy `env.example` → `.env.local` (gitignored — **never commit real secrets**).

| Variable | Where to get it |
| --- | --- |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) → API keys |
| `OPENAI_MODEL` | Model id, e.g. `gpt-5.4-mini` (overridden per-tier by the `models` table) |
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → **publishable** key (server-side RLS client) |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **secret** key (server only) |
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database → password (for `supabase db push`) |
| `RESEND_API_KEY` | [resend.com](https://resend.com/api-keys) → API Keys |
| `EMAIL_FROM` | Sender, e.g. `Stellita <noreply@yourdomain.dev>` (domain must be verified in Resend) |
| `FAUCET_SECRET` | Secret key (`S…`) of a funded testnet account that owns the demo token (see below) |
| `STELLAR_DEPLOYER_SECRET` | Optional — deploys use an ephemeral friendbot-funded account, so this can be left blank |
| `VITE_API_BASE` | Backend URL — `http://localhost:8787` in dev |

### Creating `FAUCET_SECRET`

It's a funded Stellar **testnet** account secret key. Generate one and fund it via Friendbot:

```bash
# 1. Generate a keypair
node -e "import('@stellar/stellar-sdk').then(s=>{const k=s.Keypair.random();console.log('PUBLIC',k.publicKey());console.log('SECRET',k.secret())})"

# 2. Fund the PUBLIC key on testnet
curl "https://friendbot.stellar.org/?addr=<PUBLIC_KEY>"
```

Put the `SECRET` (`S…`) into `FAUCET_SECRET`. The faucet mints the shared demo token
to connected wallets — for it to mint, the account must own the demo token contract.
To run a fully independent fork, deploy your own fungible token, set its `contractId`
in `src/lib/project.ts` (`DEMO_TOKEN_ID`) and `server/_lib/faucet.ts`, and use that
owner's secret here.

### Supabase auth config

- **Email OTP**: set the confirmation email template to send the code — use `{{ .Token }}`.
- **Google OAuth**: add a redirect URL pointing at the backend callback,
  e.g. `http://localhost:8787/auth/callback` (and your production backend URL).

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Web app + API together (concurrently) |
| `pnpm dev:web` | Web app only |
| `pnpm server` | API only |
| `pnpm seed:templates` | Seed the example templates into Supabase |
| `pnpm build` | Type-check + production build |
| `pnpm typecheck` | App + API + server type-check |
| `pnpm lint` | ESLint |

## Quality gate

Before opening a pull request, all three checks must pass (`pnpm typecheck && pnpm lint && pnpm build`):

- **`pnpm typecheck`** (`tsc -b && tsc -p server/tsconfig.json --noEmit`) ? Type-checks the frontend/shared TypeScript project references (`tsconfig.app.json`, `tsconfig.node.json`) and the Express backend (`server/tsconfig.json`) without emitting files.
- **`pnpm lint`** (`eslint .`) ? Runs ESLint across the repository.
- **`pnpm build`** (`tsc -b && vite build`) ? Type-checks the app references and bundles the production SPA into `dist/`.

No automated test suite exists yet (`package.json` defines no `test` script); verification relies on `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Build and deploy

- **Frontend (`Dockerfile.web`)** ? Runs `pnpm install --frozen-lockfile` and `pnpm build` (`tsc -b && vite build`), producing static assets in `dist/`, then copies `/app/dist` into `/usr/share/nginx/html` in an `nginx:alpine` image (`nginx.web.conf`). `VITE_API_BASE` is baked into the client bundle at build time.
- **Backend (`Dockerfile`)** ? Installs dependencies with `pnpm install --frozen-lockfile` (including `devDependencies`) and runs the Express server directly from TypeScript source at runtime via `pnpm start` (`tsx server/index.ts`) on port `8787` rather than compiling `server/` to a separate JavaScript build artefact.

## Project layout

```
src/         React app (editor, marketing pages, auth, project store)
server/      Express backend — routes, lib, emails, and _lib (shared: LLM,
             guardrail, deploy, faucet, contracts)
shared/      Types + the agent response Zod schema
contracts/   Contract manifests (+ WASM)
supabase/    SQL migrations
openspec/    Specs & project conventions (see openspec/project.md)
```

## Contributing

Read [AGENTS.md](AGENTS.md) for architecture, conventions and the workflow. Capability
specs live in [`openspec/`](openspec/) following the [OpenSpec](https://openspec.dev/)
convention. PRs welcome.

## License

MIT
