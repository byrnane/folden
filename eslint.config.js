import eslint from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import eslintConfigPrettier from 'eslint-config-prettier/flat'

const browserGlobals = {
  BeforeUnloadEvent: 'readonly',
  KeyboardEvent: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  localStorage: 'readonly',
  window: 'readonly',
}

const nodeGlobals = {
  Buffer: 'readonly',
  console: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
}

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.cache/**',
    '**/build/**',
    '**/dist/**',
    '**/src-tauri/target/**',
    '**/test-results/**',
    '**/coverage/**',
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,vue}', 'tests/**/*.ts', 'vite.config.ts', 'playwright.config.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-undef': 'off',
      'no-control-regex': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'vue/html-indent': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
  eslintConfigPrettier,
])
