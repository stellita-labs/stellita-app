import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output, vendored sources and cloned build trees — never linted.
  // NOTE: this list must not swallow server/, shared/ or scripts/.
  globalIgnores(['dist', 'node_modules', '_reference', 'contracts/.oz-src']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Node-side code — the Express API, repo scripts, shared types and the
    // contract helpers. Adds Node globals on top of the browser ones above.
    files: [
      '*.ts',
      'server/**/*.ts',
      'scripts/**/*.ts',
      'shared/**/*.ts',
      'contracts/**/*.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // React frontend — hooks and fast-refresh rules only make sense here.
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
])
