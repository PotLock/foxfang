import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/setup': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../dist/daemon/ui',
    sourcemap: true,
    emptyOutDir: true
  }
})
