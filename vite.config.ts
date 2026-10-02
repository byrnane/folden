/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ isPreview }) => {
  if (!process.env.VITEST && isPreview !== true) {
    execFileSync(process.execPath, ['scripts/third-party-notices.mjs'], {
      cwd: import.meta.dirname,
      stdio: 'inherit',
    })
  }

  return {
    plugins: [vue()],
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    server: {
      watch: {
        ignored: ['**/src-tauri/target/**', '**/build/**', '**/.cache/**'],
      },
    },
  }
})
