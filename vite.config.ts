import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

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
  plugins: [react(), firebaseSwInject()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react/dist/esm/lucide-react.js'),
    },
  },
  optimizeDeps: {
    include: ['lucide-react'],
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // Large data processors — keep isolated to avoid bloating main bundle
          if (id.includes('/gpt-tokenizer/')) return 'vendor-gpt';
          if (id.includes('/pdfjs-dist/')) return 'vendor-pdf';

          // Animation — large lib loaded on every route, worth caching separately
          if (id.includes('/framer-motion/')) return 'vendor-animation';

          // 3D / WebGL — only loaded when 3D view is active
          if (id.includes('/three/') || id.includes('/@react-three/')) return 'vendor-three';

          // Firebase — auth + storage always needed; keep in one chunk for init ordering
          if (id.includes('/firebase/')) return 'vendor-firebase';

          // Rich text editor — only loaded in specific modules
          if (id.includes('/@tiptap/') || id.includes('/tiptap-')) return 'vendor-editor';

          // UI primitives — Radix, Recharts; cached across deploys
          if (id.includes('/@radix-ui/') || id.includes('/recharts/')) return 'vendor-ui';

          // React core — very stable, maximize cache lifetime
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) return 'vendor-core';

          // Everything else consolidated to avoid too many small chunks
          return 'vendor-other';
        },
      },
    },
  },
})
