/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { Plugin } from 'vite'

function stripCortexSourceMaps(): Plugin {
  const cortexDistMarker = `${path.sep}cortex-logic${path.sep}build${path.sep}dist${path.sep}js${path.sep}productionLibrary${path.sep}`
  const sourceMapFooter = /\/\/# sourceMappingURL=.*$/gm

  return {
    name: 'strip-cortex-sourcemap-footers',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes(cortexDistMarker) || !id.endsWith('.js')) return null
      return { code: code.replace(sourceMapFooter, ''), map: null }
    },
  }
}

export default defineConfig({
  plugins: [react(), stripCortexSourceMaps()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react/dist/esm/lucide-react.js'),
      '@cortex-logic': path.resolve(__dirname, './src/test/__mocks__/cortex-logic-mock.ts'),
      'ws': path.resolve(__dirname, './src/cortex-bridge/ws-browser-shim.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    // 15 s timeout to accommodate network-backed adapters (Supabase Realtime
    // WebSocket connection establishment can take several seconds on first use).
    testTimeout: 15_000,
  },
})
