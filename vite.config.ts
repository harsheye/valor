import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'node:https';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'twitch-proxy-plugin',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/twitch-proxy/')) return next();
          
          try {
            let targetUrlString = req.url.slice('/twitch-proxy/'.length);
            if (!targetUrlString.startsWith('http')) {
              targetUrlString = decodeURIComponent(targetUrlString);
            }
            // Fix for potential connect normalization of 'https://' to 'https:/'
            targetUrlString = targetUrlString.replace(/^(https?):\/([^\/])/, '$1://$2');
            
            if (!targetUrlString.startsWith('http')) {
              res.statusCode = 400;
              return res.end('Invalid or missing target URL: ' + targetUrlString);
            }
            
            const target = new URL(targetUrlString);
            const options = {
              hostname: target.hostname,
              port: target.port || (target.protocol === 'https:' ? 443 : 80),
              path: target.pathname + target.search,
              method: req.method,
              headers: {
                'Origin': 'https://www.twitch.tv',
                'Referer': 'https://www.twitch.tv/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
              }
            };
            
            const proxyReq = https.request(options, (proxyRes) => {
              const headers = { ...proxyRes.headers };
              delete headers['access-control-allow-origin'];
              headers['Access-Control-Allow-Origin'] = '*';
              
              res.writeHead(proxyRes.statusCode || 200, headers);
              proxyRes.pipe(res);
            });
            
            proxyReq.on('error', (e) => {
              res.statusCode = 500;
              res.end(e.message);
            });
            
            req.pipe(proxyReq);
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      }
    }
  ],
  server: {
    allowedHosts: true,
    proxy: {
      '/twitch-usher': {
        target: 'https://usher.ttvnw.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/twitch-usher/, ''),
      },
      '/stripchat-api': {
        target: 'https://stripchat.com/api/front/v2/models/username',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/stripchat-api/, ''),
      }
    }
  },
})