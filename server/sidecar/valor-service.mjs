#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ⚡ VALOR LOCAL MEDIA COMPANION SERVICE
 *  Lightweight Local Streaming Engine & Media Cache for Valor Player
 *  Version 1.0.0 — Zero Dependencies (Node.js 18+)
 * ════════════════════════════════════════════════════════════════════════════
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';

const PORT = parseInt(process.env.VALOR_SIDECAR_PORT || process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '45454', 10);
const HOST = '127.0.0.1';
const VERSION = '1.0.0';
const startTime = Date.now();

// Cache directory in user's home folder
const HOME_DIR = os.homedir();
const CACHE_DIR = process.env.VALOR_CACHE_DIR || path.join(HOME_DIR, '.valor_sidecar_cache');
const BLOCKS_DIR = path.join(CACHE_DIR, 'blocks');
const SUBS_DIR = path.join(CACHE_DIR, 'subtitles');

for (const d of [CACHE_DIR, BLOCKS_DIR, SUBS_DIR]) {
  if (!fs.existsSync(d)) {
    try { fs.mkdirSync(d, { recursive: true }); } catch {}
  }
}

// Global metrics
let totalBytesProxied = 0;
let totalRequests = 0;
let cacheHits = 0;
let activeStreams = 0;

const BLOCK_SIZE = 2 * 1024 * 1024; // 2 MB blocks

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 16, timeout: 30000 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 16, timeout: 30000 });

/**
 * Checks if a CLI tool exists in PATH
 */
function hasCliTool(toolName) {
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where' : 'which';
    const child = spawn(cmd, [toolName], { stdio: 'ignore' });
    return new Promise(resolve => {
      child.on('close', code => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  } catch {
    return Promise.resolve(false);
  }
}

let hasFfmpeg = false;
let hasFfprobe = false;
hasCliTool('ffmpeg').then(res => { hasFfmpeg = res; });
hasCliTool('ffprobe').then(res => { hasFfprobe = res; });

/**
 * Remote download helper with redirect tracking and basic auth
 */
function fetchRemote(url, options = {}) {
  const { headers = {}, method = 'GET', maxRedirects = 5, timeout = 25000 } = options;
  let currentUrl = url;
  let redirectCount = 0;

  return new Promise((resolve, reject) => {
    function execute(targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;
        const agent = isHttps ? httpsAgent : httpAgent;

        const reqHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ValorLocalEngine/1.0',
          'Accept': '*/*',
          'Accept-Encoding': 'identity',
          ...headers
        };

        if (parsed.username || parsed.password) {
          const creds = Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64');
          reqHeaders['Authorization'] = `Basic ${creds}`;
        }

        const req = client.request(parsed, { method, headers: reqHeaders, agent, timeout }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              res.resume();
              return reject(new Error('Too many redirects'));
            }
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            res.resume();
            return execute(nextUrl);
          }

          resolve({
            statusCode: res.statusCode || 200,
            headers: res.headers,
            stream: res,
            url: targetUrl
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error('Connection timeout'));
        });
        req.on('error', reject);
        req.end();
      } catch (err) {
        reject(err);
      }
    }

    execute(currentUrl);
  });
}

/**
 * Active block download deduplicator
 */
const inFlightBlocks = new Map();

/**
 * Downloads and caches a specific 2MB block to local disk
 */
async function getOrFetchBlock(url, blockIndex, auth) {
  const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
  const blockFile = path.join(BLOCKS_DIR, `${urlHash}_b${blockIndex}.bin`);

  if (fs.existsSync(blockFile)) {
    try {
      const stats = fs.statSync(blockFile);
      if (stats.size > 0) {
        cacheHits++;
        return fs.readFileSync(blockFile);
      }
    } catch {}
  }

  const key = `${urlHash}_${blockIndex}`;
  if (inFlightBlocks.has(key)) {
    return inFlightBlocks.get(key);
  }

  const promise = (async () => {
    const startByte = blockIndex * BLOCK_SIZE;
    const endByte = startByte + BLOCK_SIZE - 1;

    const headers = { 'Range': `bytes=${startByte}-${endByte}` };
    if (auth && auth.username) {
      const creds = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    }

    const res = await fetchRemote(url, { headers });
    if (res.statusCode !== 200 && res.statusCode !== 206) {
      if (res.stream) res.stream.resume();
      throw new Error(`Block fetch failed: HTTP ${res.statusCode}`);
    }

    const chunks = [];
    for await (const chunk of res.stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length > 0) {
      try {
        fs.writeFileSync(blockFile, buffer);
      } catch {}
    }
    return buffer;
  })();

  inFlightBlocks.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightBlocks.delete(key);
  }
}

/**
 * Media Metadata Cache for initialized remote files
 */
const metadataCache = new Map();

async function getMediaMetadata(url, auth) {
  const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
  if (metadataCache.has(urlHash)) return metadataCache.get(urlHash);

  const headers = { 'Range': 'bytes=0-1' };
  if (auth && auth.username) {
    const creds = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64');
    headers['Authorization'] = `Basic ${creds}`;
  }

  const res = await fetchRemote(url, { headers });
  if (res.stream) res.stream.resume();

  let totalSize = 0;
  let contentType = res.headers['content-type'] || 'video/mp4';

  const contentRange = res.headers['content-range'];
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) totalSize = parseInt(match[1], 10);
  }
  if (!totalSize && res.headers['content-length']) {
    totalSize = parseInt(res.headers['content-length'], 10);
  }
  if (!totalSize) totalSize = 2 * 1024 * 1024 * 1024; // 2GB default fallback

  const meta = { totalSize, contentType };
  metadataCache.set(urlHash, meta);
  return meta;
}

/**
 * Calculate total cached size on disk
 */
function getCachedSize() {
  try {
    let size = 0;
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const file of fs.readdirSync(dir)) {
        const full = path.join(dir, file);
        try {
          const st = fs.statSync(full);
          if (st.isDirectory()) walk(full);
          else size += st.size;
        } catch {}
      }
    };
    walk(CACHE_DIR);
    return size;
  } catch {
    return 0;
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  totalRequests++;

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type, X-Full-Track');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health & Status endpoint
  if (pathname === '/api/sidecar/status' || pathname === '/status' || pathname === '/health') {
    const cachedBytes = getCachedSize();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: 'ok',
      service: 'valor-companion-service',
      version: VERSION,
      port: PORT,
      os: process.platform,
      uptime: Math.round((Date.now() - startTime) / 1000),
      cacheDir: CACHE_DIR,
      cachedBytes,
      totalBytesProxied,
      totalRequests,
      cacheHits,
      activeStreams,
      hasFfmpeg,
      hasFfprobe
    }));
    return;
  }

  // 2. Clear Cache endpoint
  if (pathname === '/api/sidecar/clear-cache' && req.method === 'POST') {
    let clearedBytes = 0;
    try {
      clearedBytes = getCachedSize();
      for (const d of [BLOCKS_DIR, SUBS_DIR]) {
        if (fs.existsSync(d)) {
          for (const f of fs.readdirSync(d)) {
            try { fs.unlinkSync(path.join(d, f)); } catch {}
          }
        }
      }
    } catch {}
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, clearedBytes }));
    return;
  }

  // 3. Local Media Proxy with 2MB Block Caching (/api/proxy-media)
  if (pathname === '/api/proxy-media') {
    const rawUrl = parsedUrl.searchParams.get('url');
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    try {
      activeStreams++;
      const user = parsedUrl.searchParams.get('user');
      const pass = parsedUrl.searchParams.get('pass');
      const auth = user ? { username: user, password: pass || '' } : undefined;

      const { totalSize, contentType } = await getMediaMetadata(rawUrl, auth);
      const rangeHeader = req.headers['range'];

      if (req.method === 'HEAD') {
        res.statusCode = 200;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', totalSize);
        res.end();
        activeStreams = Math.max(0, activeStreams - 1);
        return;
      }

      let start = 0;
      let end = totalSize - 1;
      let isPartial = false;

      if (rangeHeader) {
        const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (matches) {
          start = parseInt(matches[1], 10);
          if (matches[2]) {
            end = parseInt(matches[2], 10);
          }
          isPartial = true;
        }
      }

      if (start >= totalSize || end >= totalSize || start > end) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        res.end();
        activeStreams = Math.max(0, activeStreams - 1);
        return;
      }

      // Limit response length to max 4MB chunks so browser streams continuously
      const requestedLength = end - start + 1;
      const responseLength = Math.min(requestedLength, 4 * 1024 * 1024);
      end = start + responseLength - 1;

      const firstBlock = Math.floor(start / BLOCK_SIZE);
      const lastBlock = Math.floor(end / BLOCK_SIZE);

      const blockBuffers = [];
      for (let b = firstBlock; b <= lastBlock; b++) {
        const buf = await getOrFetchBlock(rawUrl, b, auth);
        blockBuffers.push(buf);
      }

      const mergedBlocks = Buffer.concat(blockBuffers);
      const startInMerged = start - (firstBlock * BLOCK_SIZE);
      const resultBuffer = mergedBlocks.subarray(startInMerged, startInMerged + responseLength);

      res.statusCode = isPartial ? 206 : 200;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', resultBuffer.length);
      if (isPartial) {
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      }

      totalBytesProxied += resultBuffer.length;
      res.end(resultBuffer);

      // Asynchronously prefetch next block in background
      const nextBlock = lastBlock + 1;
      const totalBlocks = Math.ceil(totalSize / BLOCK_SIZE);
      if (nextBlock < totalBlocks) {
        getOrFetchBlock(rawUrl, nextBlock, auth).catch(() => {});
      }
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Proxy fetch failed', message: err.message }));
      }
    } finally {
      activeStreams = Math.max(0, activeStreams - 1);
    }
    return;
  }

  // 4. Remote Probe endpoint (/api/remote/probe)
  if (pathname === '/api/remote/probe' && (req.method === 'POST' || req.method === 'GET')) {
    let body = {};
    if (req.method === 'POST') {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {}
    }
    const targetUrl = body.url || parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    try {
      const auth = body.auth || (parsedUrl.searchParams.get('user') ? { username: parsedUrl.searchParams.get('user'), password: parsedUrl.searchParams.get('pass') || '' } : undefined);

      if (hasFfprobe) {
        const args = [
          '-v', 'error',
          '-show_streams',
          '-show_format',
          '-print_format', 'json',
          targetUrl
        ];
        const child = spawn('ffprobe', args);
        const stdoutChunks = [];
        for await (const c of child.stdout) stdoutChunks.push(c);
        const data = JSON.parse(Buffer.concat(stdoutChunks).toString('utf8'));

        const videoStreams = [];
        const audioStreams = [];
        const subtitleStreams = [];

        for (const s of (data.streams || [])) {
          if (s.codec_type === 'video') {
            videoStreams.push({ index: s.index, codec: s.codec_name, width: s.width, height: s.height });
          } else if (s.codec_type === 'audio') {
            audioStreams.push({ index: s.index, codec: s.codec_name, language: s.tags?.language, title: s.tags?.title, sampleRate: parseInt(s.sample_rate, 10), channels: s.channels });
          } else if (s.codec_type === 'subtitle') {
            subtitleStreams.push({ index: s.index, codec: s.codec_name, language: s.tags?.language, title: s.tags?.title });
          }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          duration: parseFloat(data.format?.duration || '0'),
          videoStreams,
          audioStreams,
          subtitleStreams
        }));
        return;
      }

      // If ffprobe is not installed, fetch metadata & forward probe
      const meta = await getMediaMetadata(targetUrl, auth);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        duration: 0,
        videoStreams: [{ index: 0, codec: 'h264', width: 1920, height: 1080 }],
        audioStreams: [{ index: 1, codec: 'aac', language: 'und', sampleRate: 48000, channels: 2 }],
        subtitleStreams: []
      }));
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  // 5. Remote Subtitle Packet endpoint (/api/remote/subtitle-packet)
  if (pathname === '/api/remote/subtitle-packet' && req.method === 'GET') {
    const rawUrl = parsedUrl.searchParams.get('url');
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    try {
      const streamIndex = parseInt(parsedUrl.searchParams.get('streamIndex') || '0', 10);
      const startTime = parsedUrl.searchParams.has('startTime') ? parseFloat(parsedUrl.searchParams.get('startTime')) : 0;
      const duration = parsedUrl.searchParams.has('duration') ? parseFloat(parsedUrl.searchParams.get('duration')) : 120;

      const urlHash = crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 16);
      const fullSubPath = path.join(SUBS_DIR, `${urlHash}_s${streamIndex}.vtt`);
      const fullDoneMarker = path.join(SUBS_DIR, `${urlHash}_s${streamIndex}.done`);

      if (fs.existsSync(fullDoneMarker) && fs.existsSync(fullSubPath)) {
        const content = fs.readFileSync(fullSubPath, 'utf8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
        res.setHeader('X-Full-Track', 'true');
        res.end(content);
        return;
      }

      if (hasFfmpeg) {
        const args = [
          '-v', 'error',
          '-copyts',
          '-ss', startTime.toFixed(3),
          '-accurate_seek',
          '-i', rawUrl,
          '-to', (startTime + duration).toFixed(3),
          '-map', `0:${streamIndex}`,
          '-c:s', 'webvtt',
          '-f', 'webvtt',
          'pipe:1'
        ];
        const child = spawn('ffmpeg', args);
        const outChunks = [];
        for await (const c of child.stdout) outChunks.push(c);
        let vtt = Buffer.concat(outChunks).toString('utf8').trim();
        if (!vtt.startsWith('WEBVTT')) vtt = 'WEBVTT\n\n' + vtt;

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(vtt, 'utf8'));
        res.end(vtt);
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.end('WEBVTT\n\n');
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  // 6. Remote Audio Packet endpoint (/api/remote/audio-packet)
  if (pathname === '/api/remote/audio-packet' && req.method === 'GET') {
    const rawUrl = parsedUrl.searchParams.get('url');
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    try {
      const streamIndex = parseInt(parsedUrl.searchParams.get('streamIndex') || '0', 10);
      const startTime = parseFloat(parsedUrl.searchParams.get('startTime') || '0');
      const duration = parseFloat(parsedUrl.searchParams.get('duration') || '10');

      if (hasFfmpeg) {
        const args = [
          '-v', 'error',
          '-ss', startTime.toFixed(3),
          '-accurate_seek',
          '-i', rawUrl,
          '-ss', '0',
          '-t', duration.toFixed(3),
          '-map', `0:${streamIndex}`,
          '-vn',
          '-avoid_negative_ts', 'make_zero',
          '-acodec', 'pcm_s16le',
          '-ac', '2',
          '-ar', '44100',
          '-f', 'wav',
          'pipe:1'
        ];
        const child = spawn('ffmpeg', args);
        const chunks = [];
        for await (const c of child.stdout) chunks.push(c);
        const wavBuffer = Buffer.concat(chunks);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', wavBuffer.length);
        res.end(wavBuffer);
        return;
      }

      res.statusCode = 501;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'FFmpeg not detected on local system for audio packet slicing' }));
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, HOST, () => {
  const line = '═'.repeat(64);
  console.log(`\n\x1b[36m${line}\x1b[0m`);
  console.log(`\x1b[1m\x1b[32m  ⚡ VALOR LOCAL MEDIA ENGINE v${VERSION}\x1b[0m`);
  console.log(`\x1b[36m${line}\x1b[0m`);
  console.log(`  \x1b[33mStatus:\x1b[0m     Active & Listening`);
  console.log(`  \x1b[33mAddress:\x1b[0m    http://${HOST}:${PORT}`);
  console.log(`  \x1b[33mCache Dir:\x1b[0m  ${CACHE_DIR}`);
  console.log(`  \x1b[33mFeatures:\x1b[0m   Direct Stream Proxy (2MB Blocks), Subtitle & Audio Slicing`);
  console.log(`  \x1b[33mCORS:\x1b[0m       Enabled (Any Origin)`);
  console.log(`\x1b[36m${line}\x1b[0m`);
  console.log(`  \x1b[90mKeep this terminal window running while watching remote media.\x1b[0m`);
  console.log(`  \x1b[90mYour browser will automatically detect and stream through this engine.\x1b[0m\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\x1b[31m[Valor Service] Error: Port ${PORT} is already in use.\x1b[0m`);
    console.error(`\x1b[33mAnother instance of Valor Local Media Engine is already running!\x1b[0m`);
    process.exit(0);
  } else {
    console.error(`[Valor Service] Fatal Error:`, err);
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  console.log('\n\x1b[33m[Valor Service] Shutting down gracefully...\x1b[0m');
  server.close(() => process.exit(0));
});
