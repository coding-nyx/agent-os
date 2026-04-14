import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

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

/**
 * Injects VITE_FIREBASE_* env vars into the FCM service worker after build,
 * replacing __FIREBASE_*__ tokens. The service worker cannot use ES modules
 * so it cannot access import.meta.env — this is the standard workaround.
 */
function firebaseSwInject(): Plugin {
  const injectTokens = (content: string, env: Record<string, string>) =>
    content
      .replace(/__FIREBASE_API_KEY__/g, env.VITE_FIREBASE_API_KEY ?? '')
      .replace(/__FIREBASE_AUTH_DOMAIN__/g, env.VITE_FIREBASE_AUTH_DOMAIN ?? '')
      .replace(/__FIREBASE_PROJECT_ID__/g, env.VITE_FIREBASE_PROJECT_ID ?? '')
      .replace(/__FIREBASE_STORAGE_BUCKET__/g, env.VITE_FIREBASE_STORAGE_BUCKET ?? '')
      .replace(/__FIREBASE_MESSAGING_SENDER_ID__/g, env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '')
      .replace(/__FIREBASE_APP_ID__/g, env.VITE_FIREBASE_APP_ID ?? '')

  return {
    name: 'firebase-sw-inject',
    configureServer(server) {
      const swSrc = path.resolve(__dirname, 'public/firebase-messaging-sw.js')
      const env = loadEnv('development', __dirname, 'VITE_')
      server.middlewares.use('/firebase-messaging-sw.js', (_req, res) => {
        const content = injectTokens(fs.readFileSync(swSrc, 'utf-8'), env)
        res.setHeader('Content-Type', 'application/javascript')
        res.setHeader('Service-Worker-Allowed', '/')
        res.end(content)
      })
    },
    closeBundle() {
      const swSrc = path.resolve(__dirname, 'public/firebase-messaging-sw.js')
      const swOut = path.resolve(__dirname, 'out/firebase-messaging-sw.js')
      if (!fs.existsSync(swSrc) || !fs.existsSync(path.resolve(__dirname, 'out'))) return

      const env = loadEnv('production', __dirname, 'VITE_')
      fs.writeFileSync(swOut, injectTokens(fs.readFileSync(swSrc, 'utf-8'), env), 'utf-8')
      console.log('[firebase-sw-inject] Service worker written with real config.')
    },
  }
}

export default defineConfig({
  plugins: [react(), stripCortexSourceMaps(), firebaseSwInject()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react/dist/esm/lucide-react.js'),
      '@cortex-logic': path.resolve(__dirname, './src/cortex-bridge/cortex-logic-runtime.ts'),
      'ws': path.resolve(__dirname, './src/cortex-bridge/ws-browser-shim.ts'),
    },
  },
  optimizeDeps: {
    include: ['lucide-react'],
    // Force re-prebundle on every dev server start. This ensures the cortex-logic
    // UMD bundle is always re-processed after a KMP rebuild, so browsers never
    // load a stale pre-bundle even when source file import paths stay the same.
    force: true,
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // React core — MUST be prioritized and specific to avoid duplicate instances
          // which cause "Cannot read properties of undefined (reading 'useLayoutEffect')"
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/') ||
            id.includes('/node_modules/react-is/')
          ) return 'vendor-core';

          // KMP shared library + js-joda runtime — changes rarely (pinned to git tag),
          // so isolating it maximises long-lived caching (~3.5 MB)
          if (
            id.includes('/cortex-logic/') ||
            id.includes('/@js-joda/')
          ) return 'vendor-cortex';

          // Large data processors — keep isolated to avoid bloating main bundle
          if (id.includes('/pdfjs-dist/')) return 'vendor-pdf';

          // Animation — large lib loaded on every route, worth caching separately
          if (id.includes('/framer-motion/')) return 'vendor-animation';

          // 3D / WebGL — only loaded when 3D view is active
          if (
            id.includes('/three/') ||
            id.includes('/@react-three/') ||
            id.includes('/three-stdlib/') ||
            id.includes('/postprocessing/') ||
            id.includes('/maath/') ||
            id.includes('/camera-controls/') ||
            id.includes('/n8ao/') ||
            id.includes('/meshline/') ||
            id.includes('/stats-gl/') ||
            id.includes('/its-fine/')
          ) return 'vendor-three';

          // Firebase — auth + storage always needed; keep in one chunk for init ordering
          if (id.includes('/firebase/')) return 'vendor-firebase';

          // Rich text editor — only loaded in specific modules
          if (id.includes('/@tiptap/') || id.includes('/tiptap-')) return 'vendor-editor';

          // Markdown rendering ecosystem — used in chat panels, worth caching separately
          if (
            id.includes('/react-markdown/') ||
            id.includes('/unified/') ||
            id.includes('/micromark') ||
            id.includes('/remark-') ||
            id.includes('/rehype-') ||
            id.includes('/mdast-') ||
            id.includes('/hast-') ||
            id.includes('/vfile/')
          ) return 'vendor-markdown';

          // UI primitives & Navigation — Radix, Recharts (+ all transitive deps), React Router.
          //
          // Chunk colocation rationale (prevents circular-chunk init crashes):
          //  - @reduxjs/toolkit + redux + react-redux + redux-thunk: recharts uses createSlice
          //    internally; splitting toolkit into vendor-other leaves createSlice undefined at
          //    recharts module-init time → "Ye is not a function" TypeError.
          //  - clsx/classnames: shared by recharts and @radix-ui.
          //  - tiny-invariant, use-sync-external-store: recharts direct deps.
          //  - cookie, set-cookie-parser: react-router direct deps.
          //  - zustand: imports immer (already here); keeping both in one chunk avoids a
          //    vendor-other → vendor-ui → vendor-other cycle.
          if (
            id.includes('/@radix-ui/') ||
            id.includes('/recharts/') ||
            id.includes('/@reduxjs/') ||
            id.includes('/redux/') ||
            id.includes('/react-redux/') ||
            id.includes('/redux-thunk/') ||
            id.includes('/clsx/') ||
            id.includes('/classnames/') ||
            id.includes('/tiny-invariant/') ||
            id.includes('/use-sync-external-store/') ||
            id.includes('/cookie/') ||
            id.includes('/set-cookie-parser/') ||
            id.includes('/zustand/') ||
            id.includes('/aria-hidden/') ||
            id.includes('/@floating-ui/') ||
            id.includes('/internmap/') ||
            id.includes('/@hello-pangea/') ||
            id.includes('/css-box-model/') ||
            id.includes('/class-variance-authority/') ||
            id.includes('/d3-') ||
            id.includes('/decimal.js') ||
            id.includes('/victory-vendor/') ||
            id.includes('/react-smooth/') ||
            id.includes('/es-toolkit/') ||
            id.includes('/eventemitter3/') ||
            id.includes('/reselect/') ||
            id.includes('/immer/') ||
            id.includes('/react-router/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/lucide-react/')
          ) return 'vendor-ui';

          // Everything else consolidated to avoid too many small chunks
          return 'vendor-other';
        },
      },
    },
  },
})
