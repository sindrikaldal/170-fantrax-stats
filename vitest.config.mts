import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // `.claude/worktrees/` holds git worktrees of this same repo. Without
    // this exclude, a run from the main checkout also collects the
    // worktree's test files and resolves their `@/` imports against the
    // wrong root, reporting failures that are pure artifacts of the
    // worktree existing. node_modules/dist are the vitest defaults, which
    // setting `exclude` would otherwise drop.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
})
