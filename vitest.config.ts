import { defineConfig } from 'vitest/config'

/**
 * Vitest projects.
 *
 * The repo keeps two test systems on purpose:
 *   - `web` / `node` here run Vitest (`pnpm test`), colocated as `*.test.ts(x)`.
 *   - the older built-in `node:test` suite runs via `pnpm test:node` (files live
 *     under `tests/` and `server/_lib/`). It is intentionally NOT collected here.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**', 'server/**', 'shared/**'],
      reporter: ['text', 'html'],
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['shared/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
