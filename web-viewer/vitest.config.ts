// Viewer tests exercise the React build and read-only host separately from engine tests.
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['web-viewer/test/**/*.test.ts'], testTimeout: 30_000 },
})
