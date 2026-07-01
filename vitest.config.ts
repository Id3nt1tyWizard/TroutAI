import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Map the `@/*` path alias (from tsconfig) so tests can import modules the same
// way the app does. Without this, Vitest can't resolve `@/lib/...` imports.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
