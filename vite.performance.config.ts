/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/performance/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
