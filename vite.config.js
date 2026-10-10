import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './', // relative paths so it works on GitHub Pages and locally
  plugins: [react()],
  server: {
    port: 5173,
    // professor chat backend (backend/main.py)
    proxy: { '/api': 'http://127.0.0.1:8002' },
  },
})
