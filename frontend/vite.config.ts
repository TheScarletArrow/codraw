import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // The lazily loaded board page carries maxGraph (~580 kB, ~155 kB gzipped).
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/collab': {
        target: 'ws://localhost:1234',
        ws: true,
        configure: (proxy) => {
          // Browsers drop sync sockets abruptly when a tab closes; that is not an error worth logging.
          proxy.on('error', (error) => {
            if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') console.error('collab proxy error:', error)
          })
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
