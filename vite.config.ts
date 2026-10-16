import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'node:https';
import http from 'node:http';

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
            try {
              targetUrlString = decodeURIComponent(targetUrlString);
            } catch {}
            // Fix for potential connect normalization of 'https://' to 'https:/'
            targetUrlString = targetUrlString.replace(/^(https?):\/([^\/])/, '$1://$2');
            
            if (!targetUrlString.startsWith('http')) {
              res.statusCode = 400;
              return res.end('Invalid or missing target URL: ' + targetUrlString);
            }
            
            const forwardRequest = (targetUrl: string, redirectCount = 0) => {
              if (redirectCount > 5) {
                res.statusCode = 502;
                return res.end('Too many redirects');
              }
              const target = new URL(targetUrl);
              const isHttps = target.protocol === 'https:';
              const client = isHttps ? https : http;
              const options = {
                hostname: target.hostname,
                port: target.port || (isHttps ? 443 : 80),
                path: target.pathname + target.search,
                method: req.method,
                headers: {
                  'Origin': 'https://www.twitch.tv',
                  'Referer': 'https://www.twitch.tv/',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
              };
              
              const proxyReq = client.request(options, (proxyRes) => {
                if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                  let nextLoc = proxyRes.headers.location;
                  if (!nextLoc.startsWith('http')) {
                    nextLoc = new URL(nextLoc, targetUrl).toString();
                  }
                  return forwardRequest(nextLoc, redirectCount + 1);
                }
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
              
              if (req.readable && redirectCount === 0) {
                req.pipe(proxyReq);
              } else {
                proxyReq.end();
              }
            };

            forwardRequest(targetUrlString);
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
      '/api': {
        target: process.env.PORT_BACKEND ? `http://127.0.0.1:${process.env.PORT_BACKEND}` : 'http://127.0.0.1:50001',
        changeOrigin: true,
      },
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