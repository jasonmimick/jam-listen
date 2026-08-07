import { defineConfig } from 'vite'

// Dev only — in production this app is served BY the FastAPI backend (server/app/main.py
// mounts dist/ as static files), so there's no proxy to configure there.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
      '/music': 'http://localhost:8000',
      '/stream': 'http://localhost:8000',
    },
  },
})
