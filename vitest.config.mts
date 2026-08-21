import { defineConfig, configDefaults } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // Nested git worktrees under .claude/ carry their own copies of these
    // tests, with their own vitest config. Sweeping them up here runs
    // in-progress work from another branch against this branch's `@` alias,
    // which fails on modules that only exist over there.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
})
