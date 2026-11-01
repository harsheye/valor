import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }): any => {
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    build: {
      sourcemap: false,
      minify: isProd ? 'terser' : 'esbuild',
      terserOptions: isProd
        ? {
            compress: {
              drop_console: true,
              drop_debugger: true,
            },
          }
        : undefined,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('hls.js')) {
                return 'vendor-hls';
              }
              if (id.includes('lucide-react') || id.includes('@tabler/icons-react')) {
                return 'vendor-icons';
              }
              if (id.includes('@radix-ui')) {
                return 'vendor-radix';
              }
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
            }
          },
        },
      },
    },
    server: {
      allowedHosts: true,
      proxy: {
        '/api': {
          target: process.env.PORT_BACKEND ? `http://127.0.0.1:${process.env.PORT_BACKEND}` : 'http://127.0.0.1:50001',
          changeOrigin: true,
        }
      }
    },
  };
})
