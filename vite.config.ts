import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Detect build-time flags from process.env or process.argv
const argv = process.argv;
const env = process.env;

const hasArg = (prefix: string) => argv.some(arg => arg.toLowerCase().startsWith(prefix));
const getArgVal = (name: string) => {
  const match = argv.find(arg => arg.toLowerCase().startsWith(`--${name}=`));
  return match ? match.split('=')[1] : null;
};

const disableListArg = getArgVal('disable') || env.DISABLE_SERVICES || env.DISABLE || '';
const disabledList = disableListArg.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

const isOnlineDisabled = 
  env.DISABLE_ONLINE === 'true' || 
  env.DISABLE_ONLINE === '1' || 
  env.VITE_DISABLE_ONLINE === 'true' ||
  hasArg('--disable-online') || 
  hasArg('--no-online') ||
  hasArg('--offline') ||
  disabledList.includes('online') ||
  disabledList.includes('stream');

const isEngineDisabled = 
  env.DISABLE_ENGINE === 'true' || 
  env.DISABLE_ENGINE === '1' || 
  env.VITE_DISABLE_ENGINE === 'true' ||
  hasArg('--disable-engine') || 
  hasArg('--no-engine') ||
  disabledList.includes('engine') ||
  disabledList.includes('companion');

const isAppDisabled = 
  env.DISABLE_APP === 'true' || 
  env.DISABLE_APP === '1' || 
  env.VITE_DISABLE_APP === 'true' ||
  hasArg('--disable-app') || 
  hasArg('--no-app') ||
  hasArg('--maintenance') ||
  disabledList.includes('app') ||
  disabledList.includes('all');

if (isOnlineDisabled || isEngineDisabled || isAppDisabled) {
  console.log('\x1b[33m%s\x1b[0m', '>> [BUILD FEATURE FLAGS ACTIVE]');
  if (isOnlineDisabled) console.log('\x1b[33m%s\x1b[0m', '   - Online Stream: DISABLED in build');
  if (isEngineDisabled) console.log('\x1b[33m%s\x1b[0m', '   - Local Engine: DISABLED in build');
  if (isAppDisabled)    console.log('\x1b[31m%s\x1b[0m', '   - Entire Application: DISABLED (Maintenance mode in build)');
}

export default defineConfig(({ mode }): any => {
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_DISABLE_ONLINE': JSON.stringify(isOnlineDisabled ? 'true' : 'false'),
      'import.meta.env.VITE_DISABLE_ENGINE': JSON.stringify(isEngineDisabled ? 'true' : 'false'),
      'import.meta.env.VITE_DISABLE_APP': JSON.stringify(isAppDisabled ? 'true' : 'false'),
    },
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
        },
        '/admin/stream': {
          target: process.env.PORT_BACKEND ? `http://127.0.0.1:${process.env.PORT_BACKEND}` : 'http://127.0.0.1:50001',
          changeOrigin: true,
        }
      }
    },
  };
})
