import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { validateRemoteUrl } from './ssrfGuard.js';

export class RemoteAudioCacheService {
  /**
   * @param {string} [baseDataDir]
   */
  constructor(baseDataDir) {
    const rootDir = baseDataDir || path.join(process.cwd(), '.valor_data');
    this.chunkCacheDir = path.join(rootDir, 'audio_chunks');
    this.streamsDir = path.join(rootDir, 'audio_streams');
    this.subsDir = path.join(rootDir, 'sub_cache');

    for (const dir of [this.chunkCacheDir, this.streamsDir, this.subsDir]) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
          console.warn(`[RemoteAudioCache] Failed to create dir ${dir}:`, e.message);
        }
      }
    }

    /** @type {Map<string, Promise<Buffer>>} */
    this.inFlightChunks = new Map();
    /** @type {Map<string, Promise<string>>} */
    this.inFlightSubs = new Map();
    /** @type {Map<string, { process: import('child_process').ChildProcess, promise: Promise<void> }>} */
    this.activeStreamExtractions = new Map();
  }

  /**
   * @private
   */
  async buildTarget(rawUrl, auth, customHeaders = {}) {
    const validated = await validateRemoteUrl(rawUrl);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': validated.origin + '/',
      'Accept': '*/*',
      ...customHeaders
    };

    let targetUrlStr = validated.toString();
    if (auth && auth.username) {
      const creds = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
      try {
        const u = new URL(targetUrlStr);
        u.username = encodeURIComponent(auth.username);
        u.password = encodeURIComponent(auth.password || '');
        targetUrlStr = u.toString();
      } catch {}
    } else if (validated.username || validated.password) {
      const creds = Buffer.from(`${decodeURIComponent(validated.username)}:${decodeURIComponent(validated.password)}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    }

    const headerLines = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n') + '\r\n';

    const urlHash = crypto.createHash('md5').update(validated.origin + validated.pathname).digest('hex').slice(0, 16);

    return { validated, targetUrlStr, headerLines, urlHash };
  }

  /**
   * Returns path or active transcode stream for continuous audio streaming.
   * @param {object} params
   * @param {string} params.url
   * @param {number} [params.streamIndex]
   * @param {number} [params.startTime]
   * @param {object} [params.auth]
   * @param {object} [params.headers]
   * @returns {Promise<{ filePath?: string, isFile: boolean, stream?: import('stream').Readable, process?: import('child_process').ChildProcess }>}
   */
  async getAudioStream({ url, streamIndex = 0, startTime = 0, auth, headers }) {
    const sIdx = parseInt(streamIndex, 10) || 0;
    const parsedStart = Math.max(0, parseFloat(startTime) || 0);
    const { targetUrlStr, headerLines, urlHash } = await this.buildTarget(url, auth, headers);

    const streamPath = path.join(this.streamsDir, `${urlHash}_s${sIdx}.mka`);
    const doneMarkerPath = path.join(this.streamsDir, `${urlHash}_s${sIdx}.done`);

    if (fs.existsSync(doneMarkerPath) && fs.existsSync(streamPath)) {
      return { filePath: streamPath, isFile: true };
    }

    // Trigger full stream background extraction if not already running
    this.triggerBackgroundExtraction(url, sIdx, auth, headers);

    // Live stream via FFmpeg transcode pipe
    const args = [
      '-v', 'error',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
          '-rw_timeout', '10000000',
          '-headers', headerLines,
      ...(parsedStart > 0 ? ['-ss', parsedStart.toFixed(3)] : []),
      '-i', targetUrlStr,
      '-map', `0:${sIdx}`,
      '-vn',
      '-c:a', 'libmp3lame',
      '-q:a', '2',
      '-f', 'mp3',
      'pipe:1'
    ];

    const child = spawn(ffmpegInstaller.path, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    return { isFile: false, stream: child.stdout, process: child };
  }

  /**
   * Slices or retrieves a cached PCM WAV audio packet for the given remote media parameters.
   * @param {object} params
   * @param {string} params.url
   * @param {number} params.streamIndex
   * @param {number} params.startTime
   * @param {number} params.duration
   * @param {object} [params.auth]
   * @param {object} [params.headers]
   * @returns {Promise<Buffer>}
   */
  async getAudioChunk({ url, streamIndex = 0, startTime = 0, duration = 10, auth, headers }) {
    const parsedStart = Math.max(0, parseFloat(startTime) || 0);
    const parsedDur = Math.max(0.1, parseFloat(duration) || 10);
    const sIdx = parseInt(streamIndex, 10) || 0;

    const { targetUrlStr, headerLines, urlHash } = await this.buildTarget(url, auth, headers);

    const chunkKey = `${urlHash}_s${sIdx}_t${parsedStart.toFixed(2)}_d${parsedDur.toFixed(2)}`;
    const chunkPath = path.join(this.chunkCacheDir, `${chunkKey}.wav`);

    // 1. Check disk cache
    if (fs.existsSync(chunkPath)) {
      try {
        const stats = fs.statSync(chunkPath);
        if (stats.size > 44) {
          return fs.readFileSync(chunkPath);
        }
      } catch {}
    }

    // 2. Check in-flight requests (deduplication)
    if (this.inFlightChunks.has(chunkKey)) {
      return this.inFlightChunks.get(chunkKey);
    }

    // 3. Perform slice
    const chunkPromise = (async () => {
      const streamPath = path.join(this.streamsDir, `${urlHash}_s${sIdx}.mka`);
      const doneMarkerPath = path.join(this.streamsDir, `${urlHash}_s${sIdx}.done`);

      // Check if local complete audio stream is ready
      const hasLocalStream = fs.existsSync(doneMarkerPath) && fs.existsSync(streamPath);

      let args;
      if (hasLocalStream) {
        // Fast local slice (10-30ms)
        args = [
          '-v', 'error',
          '-ss', parsedStart.toFixed(3),
          '-i', streamPath,
          '-t', parsedDur.toFixed(3),
          '-acodec', 'pcm_s16le',
          '-ac', '2',
          '-ar', '44100',
          '-f', 'wav',
          'pipe:1'
        ];
      } else {
        // Trigger background download of full audio stream if not yet started
        this.triggerBackgroundExtraction(url, sIdx, auth, headers);

        // Slice directly from remote URL using exact parameters and reconnect flags
        args = [
          '-v', 'error',
          '-reconnect', '1',
          '-reconnect_at_eof', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '5',
          '-rw_timeout', '10000000',
          '-headers', headerLines,
          '-ss', parsedStart.toFixed(3),
          '-i', targetUrlStr,
          '-t', parsedDur.toFixed(3),
          '-map', `0:${sIdx}`,
          '-vn',
          '-acodec', 'pcm_s16le',
          '-ac', '2',
          '-ar', '44100',
          '-f', 'wav',
          'pipe:1'
        ];
      }

      return new Promise((resolve, reject) => {
        const child = spawn(ffmpegInstaller.path, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 15000);
        const chunks = [];
        let stderr = '';

        child.stdout.on('data', chunk => {
          chunks.push(chunk);
        });

        child.stderr.on('data', chunk => {
          stderr += chunk.toString();
        });

        child.on('close', code => {
          clearTimeout(killTimer);
          const buffer = Buffer.concat(chunks);
          if (code !== 0 && buffer.length <= 44) {
            const lower = stderr.toLowerCase();
            if (lower.includes('401') || lower.includes('unauthorized')) {
              const err = new Error('Remote media requires authentication (401 Unauthorized)');
              err.statusCode = 401;
              return reject(err);
            }
            return reject(new Error(`FFmpeg audio extraction exited with code ${code}: ${stderr}`));
          }

          if (buffer.length > 44) {
            try {
              fs.writeFileSync(chunkPath, buffer);
            } catch (writeErr) {
              console.warn('[RemoteAudioCache] Failed to write chunk cache:', writeErr.message);
            }

            // Asynchronously pre-fetch the NEXT contiguous chunk so it is instant
            this.prefetchChunk({
              url,
              streamIndex: sIdx,
              startTime: parsedStart + parsedDur,
              duration: parsedDur,
              auth,
              headers
            }).catch(() => {});

            return resolve(buffer);
          }

          reject(new Error('Audio extraction produced an empty or corrupted WAV payload'));
        });

        child.on('error', reject);
      });
    })();

    this.inFlightChunks.set(chunkKey, chunkPromise);
    try {
      return await chunkPromise;
    } finally {
      this.inFlightChunks.delete(chunkKey);
    }
  }

  /**
   * Prefetches a chunk in the background if not already cached.
   */
  async prefetchChunk(params) {
    const { url, streamIndex = 0, startTime = 0, duration = 10, auth, headers } = params;
    const parsedStart = Math.max(0, parseFloat(startTime) || 0);
    const parsedDur = Math.max(0.1, parseFloat(duration) || 10);
    const sIdx = parseInt(streamIndex, 10) || 0;

    const { targetUrlStr, urlHash } = await this.buildTarget(url, auth, headers);
    const chunkKey = `${urlHash}_s${sIdx}_t${parsedStart.toFixed(2)}_d${parsedDur.toFixed(2)}`;
    const chunkPath = path.join(this.chunkCacheDir, `${chunkKey}.wav`);

    if (fs.existsSync(chunkPath) || this.inFlightChunks.has(chunkKey)) {
      return;
    }

    // Fire off fetch in background
    this.getAudioChunk(params).catch(() => {});
  }

  /**
   * Downloads the complete audio stream in the background using direct stream copy (-c:a copy).
   */
  async triggerBackgroundExtraction(rawUrl, streamIndex = 0, auth, customHeaders) {
    const sIdx = parseInt(streamIndex, 10) || 0;
    const { targetUrlStr, headerLines, urlHash } = await this.buildTarget(rawUrl, auth, customHeaders);

    const streamPath = path.join(this.streamsDir, `${urlHash}_s${sIdx}.mka`);
    const doneMarkerPath = path.join(this.streamsDir, `${urlHash}_s${sIdx}.done`);
    const tempStreamPath = path.join(this.streamsDir, `${urlHash}_s${sIdx}.tmp.mka`);

    if (fs.existsSync(doneMarkerPath) && fs.existsSync(streamPath)) {
      return;
    }

    const streamKey = `${urlHash}_s${sIdx}`;
    if (this.activeStreamExtractions.has(streamKey)) {
      return;
    }

    const args = [
      '-v', 'error',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-headers', headerLines,
      '-i', targetUrlStr,
      '-map', `0:${sIdx}`,
      '-vn',
      '-c:a', 'copy',
      '-y',
      tempStreamPath
    ];

    console.log(`[RemoteAudioCache] Starting background audio stream extraction for ${streamKey}...`);
    const child = spawn(ffmpegInstaller.path, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    const promise = new Promise((resolve) => {
      child.on('close', code => {
        this.activeStreamExtractions.delete(streamKey);
        if (code === 0 && fs.existsSync(tempStreamPath) && fs.statSync(tempStreamPath).size > 1024) {
          try {
            fs.renameSync(tempStreamPath, streamPath);
            fs.writeFileSync(doneMarkerPath, 'OK');
            console.log(`[RemoteAudioCache] Full audio stream ready in cache: ${streamKey}.mka (${fs.statSync(streamPath).size} bytes)`);
          } catch (e) {
            console.warn('[RemoteAudioCache] Failed to finalize stream file:', e.message);
          }
        } else {
          try {
            if (fs.existsSync(tempStreamPath)) fs.unlinkSync(tempStreamPath);
          } catch {}
          console.warn(`[RemoteAudioCache] Background stream extraction finished with code ${code}: ${stderr}`);
        }
        resolve();
      });

      child.on('error', err => {
        this.activeStreamExtractions.delete(streamKey);
        console.warn('[RemoteAudioCache] Background stream extraction error:', err.message);
        resolve();
      });
    });

    this.activeStreamExtractions.set(streamKey, { process: child, promise });
  }

  /**
   * Extracts and caches a full subtitle track converted to WebVTT.
   * @param {object} params
   * @param {string} params.url
   * @param {number} params.streamIndex
   * @param {object} [params.auth]
   * @param {object} [params.headers]
   * @returns {Promise<string>} WebVTT content
   */
  async getSubtitleTrack({ url, streamIndex = 0, auth, headers }) {
    const sIdx = parseInt(streamIndex, 10) || 0;
    const { targetUrlStr, headerLines, urlHash } = await this.buildTarget(url, auth, headers);

    const subKey = `${urlHash}_s${sIdx}`;
    const subPath = path.join(this.subsDir, `${subKey}.vtt`);

    // 1. Check disk cache
    if (fs.existsSync(subPath)) {
      try {
        const stats = fs.statSync(subPath);
        if (stats.size > 0) {
          return fs.readFileSync(subPath, 'utf8');
        }
      } catch {}
    }

    // 2. Check in-flight requests
    if (this.inFlightSubs.has(subKey)) {
      return this.inFlightSubs.get(subKey);
    }

    // 3. Extract via FFmpeg
    const subPromise = (async () => {
      const args = [
        '-v', 'error',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-rw_timeout', '10000000',
        '-headers', headerLines,
        '-i', targetUrlStr,
        '-map', `0:${sIdx}`,
        '-c:s', 'webvtt',
        '-f', 'webvtt',
        'pipe:1'
      ];

      return new Promise((resolve, reject) => {
        const child = spawn(ffmpegInstaller.path, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 15000);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', chunk => {
          stdout += chunk.toString();
        });

        child.stderr.on('data', chunk => {
          stderr += chunk.toString();
        });

        child.on('close', code => {
          clearTimeout(killTimer);
          if (code !== 0 && !stdout.includes('WEBVTT')) {
            const lower = stderr.toLowerCase();
            if (lower.includes('401') || lower.includes('unauthorized')) {
              const err = new Error('Remote media requires authentication (401 Unauthorized)');
              err.statusCode = 401;
              return reject(err);
            }
            return reject(new Error(`FFmpeg subtitle extraction exited with code ${code}: ${stderr}`));
          }

          let finalVtt = stdout.trim();
          if (!finalVtt.startsWith('WEBVTT')) {
            finalVtt = 'WEBVTT\n\n' + finalVtt;
          }

          try {
            fs.writeFileSync(subPath, finalVtt, 'utf8');
          } catch (writeErr) {
            console.warn('[RemoteAudioCache] Failed to write subtitle cache:', writeErr.message);
          }

          resolve(finalVtt);
        });

        child.on('error', reject);
      });
    })();

    this.inFlightSubs.set(subKey, subPromise);
    try {
      return await subPromise;
    } finally {
      this.inFlightSubs.delete(subKey);
    }
  }
}
