import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // or whatever framework plugin you use

export default defineConfig({
  server: {
    allowedHosts: true, // Disables host header checking entirely
  },
})