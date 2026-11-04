import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * A string that changes on every build (brief B09 §3): the service worker names its
 * caches with it, so a new deploy drops every older cache on activate. The platform's
 * commit SHA when there is one, plus a timestamp so two builds of one commit still differ.
 */
function buildId(): string {
  const sha = process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GITHUB_SHA'] ?? process.env['GIT_SHA']
  const stamp = Date.now().toString(36)
  return sha ? `${sha.slice(0, 7)}-${stamp}` : stamp
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __GB_BUILD_ID__: JSON.stringify(buildId()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Fonts stay files (never base64 in the CSS): the CSP allows fonts from 'self' only.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf)$/.test(filePath) ? false : undefined),
    rolldownOptions: {
      // The service worker is its own entry at a fixed URL (/sw.js): no hash, so the
      // browser can re-fetch and byte-compare it; it imports nothing shared with the app.
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        sw: path.resolve(import.meta.dirname, 'src/sw/sw.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
