# Backend (Express API) image for Dokploy / any container host.
# The frontend is deployed separately (Vercel); this runs only the server.
FROM node:25-slim

# pnpm via corepack (version pinned by package.json "packageManager")
RUN corepack enable

WORKDIR /app

# Install dependencies first (better layer caching). devDeps included — the
# server runs TypeScript at runtime via tsx.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# App source (server/, shared/, contracts/ manifests + wasm, etc.)
COPY . .

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Prod start (no watch). Reads config from the container env (no .env.local).
CMD ["pnpm", "start"]
