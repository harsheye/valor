import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { MediaProbeService } from './mediaProbeService.js';
import { validateRemoteUrl } from './ssrfGuard.js';
import { RemoteAudioCacheService } from './remoteAudioCacheService.js';

const audioCacheService = new RemoteAudioCacheService();

/**
 * Attaches the Remote Streaming & Packet API routes to the backend HTTP server.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {import('url').URL} parsedUrl
 * @param {import('./remoteSessionManager.js').RemoteSessionManager} sessionManager
 * @returns {Promise<boolean>} True if route was handled
 */
export async function handleStreamRoute(req, res, parsedUrl, sessionManager) {
  const pathname = parsedUrl.pathname;

  // Add CORS headers to all remote streaming responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // 1. POST or GET /api/remote/probe - Fast backend probe via native ffprobe
  if (pathname === '/api/remote/probe' && (req.method === 'POST' || req.method === 'GET')) {
    let rawUrl = '';
    let auth = null;
    let customHeaders = {};

    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      try {
        const data = body ? JSON.parse(body) : {};
        rawUrl = data.url;
        auth = data.auth;
        customHeaders = data.headers || {};
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        return true;
      }
    } else {
      rawUrl = parsedUrl.searchParams.get('url');
      const user = parsedUrl.searchParams.get('user');
      const pass = parsedUrl.searchParams.get('pass');
      if (user) {
        auth = { username: user, password: pass || '' };
      }
    }

    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required "url" parameter' }));
      return true;
    }

    try {
      const probeResult = await MediaProbeService.probe(rawUrl, {
        headers: customHeaders,
        auth
      });

      // Pre-warm the audio stream cache immediately upon probe
      if (probeResult.audioStreams && probeResult.audioStreams.length > 0) {
        const defaultAudio = probeResult.audioStreams[0];
        audioCacheService.triggerBackgroundExtraction(rawUrl, defaultAudio.index, auth, customHeaders).catch(() => {});
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(probeResult));
      return true;
    } catch (err) {
      const statusCode = err.statusCode || 500;
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Probe failed', statusCode }));
      return true;
    }
  }

  // 1.5. GET /api/remote/audio-stream - Continuous audio stream for alternate tracks
  if (pathname === '/api/remote/audio-stream' && req.method === 'GET') {
    const rawUrl = parsedUrl.searchParams.get('url');
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return true;
    }

    try {
      const streamIndex = parseInt(parsedUrl.searchParams.get('streamIndex') || '0', 10);
      const startTime = parseFloat(parsedUrl.searchParams.get('startTime') || '0');
      const user = parsedUrl.searchParams.get('user');
      const pass = parsedUrl.searchParams.get('pass');
      const auth = user ? { username: user, password: pass || '' } : undefined;

      const result = await audioCacheService.getAudioStream({
        url: rawUrl,
        streamIndex,
        startTime,
        auth,
        headers: req.headers['authorization'] ? { Authorization: req.headers['authorization'] } : {}
      });

      if (result.isFile && result.filePath) {
        const stat = fs.statSync(result.filePath);
        const total = stat.size;
        const range = req.headers['range'];

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
          const chunksize = (end - start) + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/mp4'
          });
          fs.createReadStream(result.filePath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': total,
            'Content-Type': 'audio/mp4',
            'Accept-Ranges': 'bytes'
          });
          fs.createReadStream(result.filePath).pipe(res);
        }
        return true;
      }

      // Stream via pipe
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache'
      });
      result.stream.pipe(res);

      req.on('close', () => {
        try {
          if (result.process && !result.process.killed) result.process.kill('SIGKILL');
        } catch {}
      });
      return true;
    } catch (err) {
      if (!res.headersSent) {
        const statusCode = err.statusCode || 500;
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Failed to stream audio', statusCode }));
      }
      return true;
    }
  }

  // 2. GET /api/remote/audio-packet - Slices 10s 44.1kHz stereo PCM WAV via audio cache engine
  if (pathname === '/api/remote/audio-packet' && req.method === 'GET') {
    const rawUrl = parsedUrl.searchParams.get('url');
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return true;
    }

    try {
      const streamIndex = parseInt(parsedUrl.searchParams.get('streamIndex') || '0', 10);
      const startTime = parseFloat(parsedUrl.searchParams.get('startTime') || '0');
      const duration = parseFloat(parsedUrl.searchParams.get('duration') || '10');
      const user = parsedUrl.searchParams.get('user');
      const pass = parsedUrl.searchParams.get('pass');
      const auth = user ? { username: user, password: pass || '' } : undefined;

      const wavBuffer = await audioCacheService.getAudioChunk({
        url: rawUrl,
        streamIndex,
        startTime,
        duration,
        auth,
        headers: req.headers['authorization'] ? { Authorization: req.headers['authorization'] } : {}
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', wavBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(wavBuffer);
      return true;
    } catch (err) {
      if (!res.headersSent) {
        const statusCode = err.statusCode || 500;
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Failed to extract audio packet', statusCode }));
      }
      return true;
    }
  }

  // 3. GET /api/remote/subtitle-packet - Extracts embedded subtitle stream to WebVTT with caching
  if (pathname === '/api/remote/subtitle-packet' && req.method === 'GET') {
    const rawUrl = parsedUrl.searchParams.get('url');
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return true;
    }

    try {
      const streamIndex = parseInt(parsedUrl.searchParams.get('streamIndex') || '0', 10);
      const startTime = parsedUrl.searchParams.has('startTime') ? parseFloat(parsedUrl.searchParams.get('startTime')) : undefined;
      const duration = parsedUrl.searchParams.has('duration') ? parseFloat(parsedUrl.searchParams.get('duration')) : undefined;
      const user = parsedUrl.searchParams.get('user');
      const pass = parsedUrl.searchParams.get('pass');
      const auth = user ? { username: user, password: pass || '' } : undefined;

      const { vttContent, isFullTrack } = await audioCacheService.getSubtitleTrack({
        url: rawUrl,
        streamIndex,
        startTime,
        duration,
        auth,
        headers: req.headers['authorization'] ? { Authorization: req.headers['authorization'] } : {}
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(vttContent, 'utf8'));
      if (isFullTrack) {
        res.setHeader('X-Full-Track', 'true');
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(vttContent);
      return true;
    } catch (err) {
      if (!res.headersSent) {
        const statusCode = err.statusCode || 500;
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Failed to extract subtitle packet', statusCode }));
      }
      return true;
    }
  }

  // 4. POST /api/remote/session - Create new playback session (Legacy fallback)
  if (pathname === '/api/remote/session' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    try {
      const data = body ? JSON.parse(body) : {};
      if (!data.url) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing required "url" property' }));
        return true;
      }

      const result = await sessionManager.createSession({
        url: data.url,
        headers: data.headers || {},
        auth: data.auth,
        selectedAudioIndex: data.selectedAudioIndex || 0
      });

      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return true;
    } catch (err) {
      const statusCode = err.statusCode || 500;
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Failed to create playback session' }));
      return true;
    }
  }

  // Check prefix /api/remote/session/
  const sessionPrefix = '/api/remote/session/';
  if (!pathname.startsWith(sessionPrefix)) {
    return false;
  }

  const rest = pathname.slice(sessionPrefix.length); // e.g. "abc123/master.m3u8" or "abc123/seg_00000.ts"
  const parts = rest.split('/');
  const sessionId = parts[0];
  const action = parts[1]; // master.m3u8, media.m3u8, seg_XXXXX.ts, subtitles, switch-audio, etc.

  if (!sessionId) {
    return false;
  }

  // 2. DELETE /api/remote/session/:sessionId - Destroy session
  if (req.method === 'DELETE' && (!action || action === '')) {
    sessionManager.destroySession(sessionId);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Playback session not found or expired' }));
    return true;
  }

  // 3. GET /api/remote/session/:sessionId/master.m3u8
  if (action === 'master.m3u8' && req.method === 'GET') {
    const masterPath = path.join(session.tempDir, 'master.m3u8');
    if (fs.existsSync(masterPath)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(fs.readFileSync(masterPath));
      return true;
    }
  }

  // 4. GET /api/remote/session/:sessionId/media.m3u8
  if (action === 'media.m3u8' && req.method === 'GET') {
    const mediaPath = path.join(session.tempDir, 'media.m3u8');
    if (fs.existsSync(mediaPath)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(fs.readFileSync(mediaPath));
      return true;
    }
  }

  // 5. POST /api/remote/session/:sessionId/switch-audio
  if (action === 'switch-audio' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const data = body ? JSON.parse(body) : {};
    sessionManager.switchAudioTrack(sessionId, data.audioStreamIndex, data.currentTimeSeconds || 0);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // 6. GET /api/remote/session/:sessionId/subtitles/:index.vtt
  if (action === 'subtitles' && parts[2] && req.method === 'GET') {
    const subIndexStr = parts[2].replace('.vtt', '');
    const subIndex = parseInt(subIndexStr, 10);

    try {
      const vttPath = await sessionManager.getSubtitleVtt(sessionId, subIndex);
      if (fs.existsSync(vttPath)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(vttPath).pipe(res);
        return true;
      }
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Failed to extract subtitle' }));
      return true;
    }
  }

  // 7. GET /api/remote/session/:sessionId/seg_XXXXX.ts - Deliver MPEG-TS segment
  if (action && action.startsWith('seg_') && action.endsWith('.ts') && req.method === 'GET') {
    const numPart = action.replace('seg_', '').replace('.ts', '');
    const segmentIndex = parseInt(numPart, 10);

    if (isNaN(segmentIndex) || segmentIndex < 0) {
      res.statusCode = 400;
      res.end('Invalid segment index');
      return true;
    }

    try {
      const segFilePath = await sessionManager.chunkManager.ensureSegment(session, segmentIndex);
      const stat = fs.statSync(segFilePath);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const stream = fs.createReadStream(segFilePath);
      stream.pipe(res);
      return true;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Failed to generate segment' }));
      return true;
    }
  }

  return false;
}
