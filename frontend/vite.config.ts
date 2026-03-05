import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE: set to '/repo-name/' for GitHub Pages, leave unset for local/Docker
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
