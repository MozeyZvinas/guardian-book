import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests resolve the shared package from source; the runtime resolves the built dist.
const sharedSource = fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@guardian-book/shared': sharedSource },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'shared',
          root: './packages/shared',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          root: './apps/api',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        // Needs a loopback Postgres: `docker compose up -d` locally, a service container in CI.
        extends: true,
        test: {
          name: 'api-integration',
          root: './apps/api',
          include: ['test/integration/**/*.test.ts', 'test/**/*.integration.test.ts'],
          setupFiles: ['./test/integration/setup.ts'],
          testTimeout: 15_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
