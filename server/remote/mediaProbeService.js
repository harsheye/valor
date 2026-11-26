import { spawn } from 'child_process';
import http from 'http';
import https from 'https';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { validateRemoteUrl } from './ssrfGuard.js';

const ffprobePath = ffprobeInstaller.path;

function parseContentDispositionHeader(header) {
  if (!header || typeof header !== 'string') return null;
  const fnStarMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (fnStarMatch) {
    let val = fnStarMatch[1].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    const qIdx = val.indexOf("''");
    let encoded = qIdx !== -1 ? val.slice(qIdx + 2) : val;
    try {
      const decoded = decodeURIComponent(encoded.trim());
      if (decoded) {
        const clean = decoded.split(/[\/\\]/).pop();
        if (clean && clean.trim()) return clean.trim();
      }
    } catch {}
  }
  const fnMatch = header.match(/filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (fnMatch) {
    let raw = fnMatch[1] || fnMatch[2] || '';
    raw = raw.trim();
    try {
      if (raw.includes('%')) raw = decodeURIComponent(raw);
    } catch {}
    if (raw) {
      const clean = raw.split(/[\/\\]/).pop();
      if (clean && clean.trim()) return clean.trim();
    }
  }
  return null;
}

async function fetchRemoteFilename(urlStr, headers) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;
      const reqHeaders = { ...headers, Range: 'bytes=0-0' };
      const req = lib.request(parsed, { method: 'GET', headers: reqHeaders, timeout: 3500 }, (res) => {
        req.destroy();
        const cd = res.headers['content-disposition'];
        if (cd) {
          const fn = parseContentDispositionHeader(cd);
          if (fn) return resolve(fn);
        }
        resolve(null);
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

export class MediaProbeService {
  /**
   * Probes a remote media URL using ffprobe.
   * @param {string} url
   * @param {object} [options]
   * @param {object} [options.headers]
   * @param {object} [options.auth]
   * @returns {Promise<object>} Probe metadata
   */
  static async probe(url, options = {}) {
    const validated = await validateRemoteUrl(url);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(options.headers || {})
    };

    let targetUrlStr = validated.toString();
    const effectiveUser = options.auth?.username || (validated.username ? decodeURIComponent(validated.username) : '');
    const effectivePass = options.auth?.password !== undefined ? options.auth.password : (validated.password ? decodeURIComponent(validated.password) : '');

    if (effectiveUser) {
      const creds = Buffer.from(`${effectiveUser}:${effectivePass}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
      try {
        const u = new URL(targetUrlStr);
        u.username = '';
        u.password = '';
        targetUrlStr = u.toString();
      } catch {}
    }

    const headerLines = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n') + '\r\n';

    // In parallel, fetch content-disposition filename if server provides one
    const remoteFilenamePromise = fetchRemoteFilename(targetUrlStr, headers);

    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-headers', headerLines,
        '-show_format',
        '-show_streams',
        '-print_format', 'json',
        targetUrlStr
      ];

      const child = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => {
        stdout += chunk;
      });

      child.stderr.on('data', chunk => {
        stderr += chunk;
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('MediaProbeService: ffprobe timed out after 25s'));
      }, 25000);

      child.on('close', code => {
        clearTimeout(timer);

        if (code !== 0) {
          const lowerErr = stderr.toLowerCase();
          if (lowerErr.includes('401') || lowerErr.includes('unauthorized') || lowerErr.includes('authorization failed')) {
            const err = new Error('Remote media requires authentication (401 Unauthorized: Basic realm="Restricted")');
            err.statusCode = 401;
            return reject(err);
          }
          if (lowerErr.includes('403') || lowerErr.includes('forbidden')) {
            const err = new Error('Remote media access forbidden (403 Forbidden)');
            err.statusCode = 403;
            return reject(err);
          }
          if (lowerErr.includes('404') || lowerErr.includes('not found')) {
            const err = new Error('Remote media not found (404 Not Found)');
            err.statusCode = 404;
            return reject(err);
          }
          return reject(new Error(`MediaProbeService failed with code ${code}: ${stderr || 'Unknown error'}`));
        }

        try {
          const raw = JSON.parse(stdout);
          const format = raw.format || {};
          const allStreams = raw.streams || [];

          let duration = parseFloat(format.duration) || 0;

          const videoStreams = [];
          const audioStreams = [];
          const subtitleStreams = [];

          let audioRelativeIdx = 0;
          let subRelativeIdx = 0;

          for (const s of allStreams) {
            const sType = s.codec_type;
            const sCodec = (s.codec_name || '').toLowerCase();
            const tags = s.tags || {};
            const language = tags.language || tags.lang || 'und';
            const title = tags.title || tags.handler_name || '';

            if (sType === 'video') {
              if (!duration && s.duration) {
                duration = parseFloat(s.duration) || 0;
              }
              videoStreams.push({
                index: s.index,
                codec: sCodec,
                width: s.width || 0,
                height: s.height || 0,
                fps: s.r_frame_rate ? evalFraction(s.r_frame_rate) : 0,
                bitrate: parseInt(s.bit_rate || format.bit_rate || '0', 10),
                isH264: sCodec === 'h264'
              });
            } else if (sType === 'audio') {
              audioStreams.push({
                index: s.index,
                relativeIndex: audioRelativeIdx++,
                codec: sCodec,
                language,
                title: title || `Track #${audioRelativeIdx} (${language})`,
                channels: s.channels || 2,
                sampleRate: parseInt(s.sample_rate || '48000', 10),
                isAac: sCodec === 'aac'
              });
            } else if (sType === 'subtitle') {
              subtitleStreams.push({
                index: s.index,
                relativeIndex: subRelativeIdx++,
                codec: sCodec,
                language,
                title: title || `Subtitle #${subRelativeIdx} (${language})`,
                isText: ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text'].includes(sCodec)
              });
            }
          }

          const primaryVideo = videoStreams[0] || null;
          const primaryAudio = audioStreams[0] || null;

          const canCopyVideo = primaryVideo ? primaryVideo.codec === 'h264' : false;
          const canCopyAudio = primaryAudio ? primaryAudio.codec === 'aac' : false;

          remoteFilenamePromise.then((fileName) => {
            resolve({
              fileName: fileName || undefined,
              duration,
              size: parseInt(format.size || '0', 10),
              bitrate: parseInt(format.bit_rate || '0', 10),
              formatName: format.format_name || '',
              videoStreams,
              audioStreams,
              subtitleStreams,
              canCopyVideo,
              canCopyAudio,
              headers
            });
          }).catch(() => {
            resolve({
              duration,
              size: parseInt(format.size || '0', 10),
              bitrate: parseInt(format.bit_rate || '0', 10),
              formatName: format.format_name || '',
              videoStreams,
              audioStreams,
              subtitleStreams,
              canCopyVideo,
              canCopyAudio,
              headers
            });
          });
        } catch (parseErr) {
          reject(new Error(`MediaProbeService: JSON parse failed: ${parseErr.message}. Output: ${stdout.slice(0, 300)}`));
        }
      });
    });
  }
}

function evalFraction(str) {
  if (!str) return 0;
  const parts = str.split('/');
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    return den !== 0 ? num / den : 0;
  }
  return parseFloat(str) || 0;
}
