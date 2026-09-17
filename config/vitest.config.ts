// Offline tests include the real local Playwright fixture application.
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 30_000 } })
