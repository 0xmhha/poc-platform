import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

const root = resolve(__dirname)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 60000,
    hookTimeout: 30000,
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@stablenet/core': resolve(root, 'packages/sdk-ts/core/src'),
      '@stablenet/accounts': resolve(root, 'packages/sdk-ts/accounts/src'),
      '@stablenet/types': resolve(root, 'packages/types/src'),
      '@stablenet/plugin-stealth': resolve(root, 'packages/sdk-ts/plugins/stealth/src'),
      '@stablenet/plugin-paymaster': resolve(root, 'packages/sdk-ts/plugins/paymaster/src'),
      '@stablenet/plugin-session-keys': resolve(root, 'packages/sdk-ts/plugins/session-keys/src'),
      '@stablenet/plugin-ecdsa': resolve(root, 'packages/sdk-ts/plugins/ecdsa/src'),
    },
  },
})
