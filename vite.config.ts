import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.PORT_BACKEND ? `http://127.0.0.1:${process.env.PORT_BACKEND}` : 'http://127.0.0.1:50001',
        changeOrigin: true,
      }
    }
  },
})