import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')) {
    return true;
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function setCorsHeaders(res, origin = '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization, Content-Type, X-Valor-Headers');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
}

function rewriteM3u8(manifest, baseUrl, proxyBase, encodedHeaders) {
  const toProxyUrl = (raw) => {
    try {
      const resolved = new URL(raw, baseUrl).toString();
      let out = `${proxyBase}?url=${encodeURIComponent(resolved)}`;
      if (encodedHeaders) out += `&headers=${encodeURIComponent(encodedHeaders)}`;
      return out;
    } catch {
      return raw;
    }
  };

  return manifest
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri) => `URI="${toProxyUrl(uri)}"`);
      }
      return toProxyUrl(trimmed);
    })
    .join('\n');
}

export function createValorProxyHandler(options = {}) {
  const {
    mountPath = '/proxy',
    defaultHeaders = {},
    allowPrivateIps = false,
    corsOrigin = '*',
    timeoutMs = 20000,
  } = options;

  return async function valorProxyHandler(req, res) {
    setCorsHeaders(res, corsOrigin);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const targetRaw = reqUrl.searchParams.get('url');
    if (!targetRaw) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing ?url= parameter' }));
      return;
    }

    let targetUrl;
    try {
      targetUrl = new URL(targetRaw);
      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        throw new Error('Only http/https URLs are supported');
      }
    } catch (err) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Invalid URL: ${err.message}` }));
      return;
    }

    if (!allowPrivateIps && isPrivateHost(targetUrl.hostname)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Private/loopback hosts are blocked by default' }));
      return;
    }

    const headersParam = reqUrl.searchParams.get('headers');
    let customHeaders = {};
    if (headersParam) {
      try {
        customHeaders = JSON.parse(headersParam);
      } catch {
        // Ignore malformed headers JSON
      }
    }

    const upstreamHeaders = {
      'user-agent': 'ValorMediaProxy/1.0',
      ...defaultHeaders,
      ...customHeaders,
    };
    if (req.headers.range) {
      upstreamHeaders.range = req.headers.range;
    }

    const proto = targetUrl.protocol === 'https:' ? https : http;

    const proxyReq = proto.request(
      targetUrl,
      {
        method: req.method,
        headers: upstreamHeaders,
        timeout: timeoutMs,
      },
      (upstreamRes) => {
        // Follow 301/302/307/308 redirects transparently
        if (
          upstreamRes.statusCode &&
          [301, 302, 303, 307, 308].includes(upstreamRes.statusCode) &&
          upstreamRes.headers.location
        ) {
          upstreamRes.resume();
          const nextUrl = new URL(upstreamRes.headers.location, targetUrl).toString();
          const protoHeader = req.headers['x-forwarded-proto'] || 'http';
          const proxyBase = `${protoHeader}://${req.headers.host || 'localhost'}${mountPath}`;
          let redirectTo = `${proxyBase}?url=${encodeURIComponent(nextUrl)}`;
          if (headersParam) redirectTo += `&headers=${encodeURIComponent(headersParam)}`;
          res.statusCode = upstreamRes.statusCode;
          res.setHeader('Location', redirectTo);
          res.end();
          return;
        }

        const contentType = (upstreamRes.headers['content-type'] || '').toLowerCase();
        const isM3u8 =
          contentType.includes('mpegurl') ||
          targetUrl.pathname.toLowerCase().endsWith('.m3u8');

        if (isM3u8 && req.method === 'GET') {
          const chunks = [];
          upstreamRes.on('data', (c) => chunks.push(c));
          upstreamRes.on('end', () => {
            const rawText = Buffer.concat(chunks).toString('utf8');
            const protoHeader = req.headers['x-forwarded-proto'] || 'http';
            const proxyBase = `${protoHeader}://${req.headers.host || 'localhost'}${mountPath}`;
            const rewritten = rewriteM3u8(rawText, targetUrl.toString(), proxyBase, headersParam);
            res.statusCode = upstreamRes.statusCode || 200;
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(rewritten);
          });
          return;
        }

        res.statusCode = upstreamRes.statusCode || 200;
        for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
          if (upstreamRes.headers[h]) {
            res.setHeader(h, upstreamRes.headers[h]);
          }
        }
        upstreamRes.pipe(res);
      }
    );

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('Upstream request timed out'));
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `Proxy upstream error: ${err.message}` }));
      } else {
        res.end();
      }
    });

    proxyReq.end();
  };
}

export function startValorProxyServer(options = {}) {
  const { port = 8787, host = '0.0.0.0', mountPath = '/proxy' } = options;
  const handler = createValorProxyHandler({ ...options, mountPath });

  const server = http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    if (pathname === '/health') {
      setCorsHeaders(res, options.corsOrigin || '*');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, service: 'valor-proxy-server' }));
      return;
    }
    if (pathname === mountPath || pathname === '/') {
      handler(req, res);
      return;
    }
    res.statusCode = 404;
    res.end('Not Found');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        port: actualPort,
        host,
        url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}${mountPath}`,
      });
    });
  });
}
