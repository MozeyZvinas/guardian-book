import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  },
})
