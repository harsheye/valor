import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { RemoteDownloadManager } from './remoteDownloadManager.js';

const BLOCK_SIZE = 2 * 1024 * 1024; // 2 MB blocks
const FORWARD_BUFFER_SECONDS = 120;  // 120s buffer ahead
const BACKWARD_BUFFER_SECONDS = 30;  // 30s buffer retention behind
const DEFAULT_BITRATE_BYTES_PER_SEC = 600 * 1024; // ~4.8 Mbps default video+audio bitrate

export class SessionMediaWorker {
  /**
   * @param {string} sessionId
   * @param {string} url
   * @param {object} options
   * @param {string} options.cacheDir
   * @param {object} [options.auth]
   * @param {number} [options.duration]
   */
  constructor(sessionId, url, options) {
    this.sessionId = sessionId;
    this.rawUrl = url;
    this.auth = options.auth;
    this.duration = options.duration || 0;
    this.cacheDir = options.cacheDir;

    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch {}
    }

    this.totalSize = 0;
    this.totalBlocks = 0;
    this.contentType = 'video/mp4';
    this.contentDisposition = null;
    this.is4K = Boolean(options.is4K || /\b(4k|2160p|uhd|hdr10|hdr10\+|dovi|dv)\b/i.test(url));
    this.forwardBufferSeconds = this.is4K ? 180 : FORWARD_BUFFER_SECONDS;
    this.backwardBufferSeconds = this.is4K ? 45 : BACKWARD_BUFFER_SECONDS;
    this.bitrateBytesPerSec = this.is4K ? (2500 * 1024) : DEFAULT_BITRATE_BYTES_PER_SEC;

    this.currentPlayheadByte = 0;
    this.lastActivityTime = Date.now();
    this.isInitialized = false;
    this.initPromise = null;

    /** @type {Map<number, Promise<Buffer>>} */
    this.activeBlockDownloads = new Map();
    this.isPrefetching = false;
    this.isDestroyed = false;
  }

  /**
   * Initializes remote media info (size, content-type)
   */
  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const headers = { 'Range': 'bytes=0-1' };
        if (this.auth && this.auth.username) {
          const creds = Buffer.from(`${this.auth.username}:${this.auth.password || ''}`).toString('base64');
          headers['Authorization'] = `Basic ${creds}`;
        }

        const res = await RemoteDownloadManager.request(this.rawUrl, {
          method: 'GET',
          headers
        });

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          if (res.stream) res.stream.resume();
          throw new Error(`Remote media returned HTTP ${res.statusCode}`);
        }

        if (res.headers['content-type']) {
          this.contentType = res.headers['content-type'];
        }

        const contentRange = res.headers['content-range'];
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)$/);
          if (match) {
            this.totalSize = parseInt(match[1], 10);
          }
        }

        if (!this.totalSize && res.headers['content-length']) {
          this.totalSize = parseInt(res.headers['content-length'], 10);
        }

        if (res.stream) {
          res.stream.resume();
        }

        if (!this.totalSize) {
          this.totalSize = 2 * 1024 * 1024 * 1024; // fallback 2GB if unknown
        }

        this.totalBlocks = Math.ceil(this.totalSize / BLOCK_SIZE);

        // Guess proper MIME type if generic or octet-stream
        try {
          const parsedU = new URL(res.url || this.rawUrl);
          const p = parsedU.pathname.toLowerCase();
          if (!this.contentType || this.contentType === 'application/octet-stream') {
            if (p.endsWith('.mkv')) this.contentType = 'video/x-matroska';
            else if (p.endsWith('.mp4') || p.endsWith('.m4v')) this.contentType = 'video/mp4';
            else if (p.endsWith('.webm')) this.contentType = 'video/webm';
            else if (p.endsWith('.ts')) this.contentType = 'video/mp2t';
            else if (p.endsWith('.avi')) this.contentType = 'video/x-msvideo';
            else if (p.endsWith('.mov')) this.contentType = 'video/quicktime';
            else this.contentType = 'video/mp4';
          }
        } catch {}

        if (this.duration > 0) {
          const calcBitrate = Math.ceil(this.totalSize / this.duration);
          this.bitrateBytesPerSec = Math.max(this.is4K ? 1800 * 1024 : 200 * 1024, calcBitrate);
        } else if (this.is4K) {
          this.bitrateBytesPerSec = Math.max(this.bitrateBytesPerSec, 2500 * 1024);
        }

        this.isInitialized = true;
        console.log(`[SessionMediaWorker-${this.sessionId}] Initialized: size=${(this.totalSize / (1024 * 1024)).toFixed(1)}MB, totalBlocks=${this.totalBlocks}, bitrate=${(this.bitrateBytesPerSec / 1024).toFixed(0)}KB/s`);
      } catch (err) {
        this.initPromise = null;
        this.isInitialized = false;
        throw err;
      }
    })();

    return this.initPromise;
  }

  /**
   * Serves an HTTP Range request for the media.
   * @param {string} [rangeHeader]
   * @returns {Promise<{ buffer?: Buffer, totalSize: number, contentType?: string, isPartial?: boolean, isRangeNotSatisfiable?: boolean, start?: number, end?: number }>}
   */
  async serveRange(rangeHeader) {
    await this.init();
    this.lastActivityTime = Date.now();

    let start = 0;
    let end = this.totalSize - 1;
    let isPartial = false;

    if (rangeHeader) {
      isPartial = true;
      const match = rangeHeader.match(/bytes\s*=\s*(\d*)\s*-\s*(\d*)/);
      if (match) {
        if (match[1]) {
          start = parseInt(match[1], 10);
          if (match[2]) {
            end = parseInt(match[2], 10);
          } else {
            // Stream in 2MB chunk per 206 response for instant TTFB; prefetcher caches ahead on disk
            end = Math.min(start + BLOCK_SIZE - 1, this.totalSize - 1);
          }
        } else if (match[2]) {
          // Suffix byte range: bytes=-500 (last 500 bytes)
          const suffixLength = parseInt(match[2], 10);
          start = Math.max(0, this.totalSize - suffixLength);
          end = this.totalSize - 1;
        }
      }
    } else {
      // If no range requested, provide initial 2MB block
      end = Math.min(BLOCK_SIZE - 1, this.totalSize - 1);
    }

    if (start >= this.totalSize) {
      return {
        isRangeNotSatisfiable: true,
        totalSize: this.totalSize
      };
    }

    start = Math.max(0, Math.min(start, this.totalSize - 1));
    end = Math.max(start, Math.min(end, this.totalSize - 1));

    this.currentPlayheadByte = start;

    // Trigger sliding window prefetch ahead
    this.triggerPrefetch();

    const startBlock = Math.floor(start / BLOCK_SIZE);
    const endBlock = Math.floor(end / BLOCK_SIZE);

    const blockPromises = [];
    for (let b = startBlock; b <= endBlock; b++) {
      blockPromises.push(this.getBlock(b));
    }

    const blocks = await Promise.all(blockPromises);

    // Stitch and slice the requested range across blocks
    const chunks = [];
    for (let b = startBlock; b <= endBlock; b++) {
      const blockBuffer = blocks[b - startBlock];
      const blockStartByte = b * BLOCK_SIZE;

      const sliceStart = Math.max(0, start - blockStartByte);
      const sliceEnd = Math.min(blockBuffer.length, (end - blockStartByte) + 1);

      if (sliceEnd > sliceStart) {
        chunks.push(blockBuffer.subarray(sliceStart, sliceEnd));
      }
    }

    const finalBuffer = Buffer.concat(chunks);
    return {
      buffer: finalBuffer,
      totalSize: this.totalSize,
      contentType: this.contentType,
      isPartial,
      start,
      end
    };
  }

  /**
   * Retrieves or downloads a 2MB block from cache/remote.
   * @param {number} blockIndex
   * @returns {Promise<Buffer>}
   */
  async getBlock(blockIndex) {
    if (this.isDestroyed) throw new Error('Worker destroyed');
    const blockPath = path.join(this.cacheDir, `blk_${blockIndex}.bin`);

    // 1. Check local disk cache (Instant 0ms read)
    if (fs.existsSync(blockPath)) {
      try {
        const stats = fs.statSync(blockPath);
        if (stats.size > 0) {
          return fs.readFileSync(blockPath);
        }
      } catch {}
    }

    // 2. In-flight download deduplication
    if (this.activeBlockDownloads.has(blockIndex)) {
      return this.activeBlockDownloads.get(blockIndex);
    }

    // 3. Download block from remote server
    const downloadPromise = (async () => {
      const startByte = blockIndex * BLOCK_SIZE;
      const endByte = Math.min((blockIndex + 1) * BLOCK_SIZE - 1, this.totalSize - 1);

      const headers = {};
      if (this.auth && this.auth.username) {
        const creds = Buffer.from(`${this.auth.username}:${this.auth.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
      }

      const buf = await RemoteDownloadManager.fetchRange(this.rawUrl, startByte, endByte, headers);

      // Atomic write to disk
      try {
        const tmpPath = path.join(this.cacheDir, `blk_${blockIndex}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.tmp`);
        fs.writeFileSync(tmpPath, buf);
        fs.renameSync(tmpPath, blockPath);
      } catch (wErr) {
        if (!fs.existsSync(blockPath)) {
          try { fs.writeFileSync(blockPath, buf); } catch {}
        }
      }

      return buf;
    })();

    this.activeBlockDownloads.set(blockIndex, downloadPromise);
    try {
      return await downloadPromise;
    } finally {
      this.activeBlockDownloads.delete(blockIndex);
    }
  }

  /**
   * Evicts cached 2MB blocks older than the 30-second backward sliding window (minKeepBlock).
   * Block 0 is permanently retained because it contains the media container header (moov/ftyp).
   * @param {number} minKeepBlock
   */
  pruneOldBlocks(minKeepBlock) {
    if (minKeepBlock <= 1 || !fs.existsSync(this.cacheDir)) return;
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        const match = file.match(/^blk_(\d+)\.bin$/);
        if (match) {
          const blockIdx = parseInt(match[1], 10);
          // Keep block 0 (essential headers) and anything within/ahead of the backward window
          if (blockIdx > 0 && blockIdx < minKeepBlock) {
            try {
              fs.unlinkSync(path.join(this.cacheDir, file));
            } catch {}
          }
        }
      }
    } catch {
      // Non-fatal directory read error
    }
  }

  /**
   * Pre-buffers the 120-second forward sliding window in the background
   * and retains the 30-second backward sliding window, evicting blocks older than 30s behind.
   */
  triggerPrefetch() {
    if (this.isPrefetching || this.isDestroyed) return;
    this.isPrefetching = true;

    (async () => {
      try {
        const forwardBytes = this.bitrateBytesPerSec * this.forwardBufferSeconds;
        const forwardBlocks = Math.max(10, Math.ceil(forwardBytes / BLOCK_SIZE));
        const backwardBytes = this.bitrateBytesPerSec * this.backwardBufferSeconds;
        const backwardBlocks = Math.max(2, Math.ceil(backwardBytes / BLOCK_SIZE));

        // 1. Evict blocks older than backwardBufferSeconds behind current playhead (keeping block 0 for headers)
        const curPlayheadBlock = Math.floor(this.currentPlayheadByte / BLOCK_SIZE);
        const minKeepBlock = Math.max(1, curPlayheadBlock - backwardBlocks);
        this.pruneOldBlocks(minKeepBlock);

        const failedBlocks = new Map();
        const CONCURRENCY = this.is4K ? 6 : 4;

        while (!this.isDestroyed) {
          const curPlayheadBlock = Math.floor(this.currentPlayheadByte / BLOCK_SIZE);
          const maxTargetBlock = Math.min(curPlayheadBlock + forwardBlocks, this.totalBlocks - 1);

          const missingBlocks = [];
          for (let b = curPlayheadBlock; b <= maxTargetBlock; b++) {
            const blockPath = path.join(this.cacheDir, `blk_${b}.bin`);
            if (!fs.existsSync(blockPath) && !this.activeBlockDownloads.has(b)) {
              const fails = failedBlocks.get(b) || 0;
              if (fails < 3) {
                missingBlocks.push(b);
                if (missingBlocks.length >= CONCURRENCY) break;
              }
            }
          }

          if (missingBlocks.length === 0) {
            break;
          }

          await Promise.all(missingBlocks.map(async (b) => {
            try {
              await this.getBlock(b);
            } catch (err) {
              const prev = failedBlocks.get(b) || 0;
              failedBlocks.set(b, prev + 1);
            }
          }));

          await new Promise(r => setTimeout(r, 30));
        }
      } finally {
        this.isPrefetching = false;
      }
    })();
  }

  /**
   * Actively pre-buffers the 120s window ahead and retains 30s behind for a given playhead time.
   * Can be called periodically while playing or while paused.
   */
  async prefetchWindow(currentTime = 0, explicitDuration = 0) {
    await this.init();
    if (explicitDuration > 0 && (!this.duration || this.duration <= 0)) {
      this.duration = explicitDuration;
      this.bitrateBytesPerSec = Math.max(200 * 1024, Math.ceil(this.totalSize / this.duration));
    }

    if (this.duration > 0 && this.totalSize > 0) {
      const playheadByte = Math.max(0, Math.min(Math.floor((currentTime / this.duration) * this.totalSize), this.totalSize - 1));
      this.currentPlayheadByte = playheadByte;
    }
    this.lastActivityTime = Date.now();
    this.triggerPrefetch();
    return this.getCacheStatus(currentTime);
  }

  /**
   * Scans disk cache and returns actual coverage metrics around currentTime.
   */
  getCacheStatus(currentTime = 0) {
    const curBlock = Math.floor(this.currentPlayheadByte / BLOCK_SIZE);
    const forwardBytes = this.bitrateBytesPerSec * this.forwardBufferSeconds;
    const forwardBlocks = Math.max(10, Math.ceil(forwardBytes / BLOCK_SIZE));
    const backwardBytes = this.bitrateBytesPerSec * this.backwardBufferSeconds;
    const backwardBlocks = Math.max(2, Math.ceil(backwardBytes / BLOCK_SIZE));

    let contiguousForwardBlocks = 0;
    const maxTargetBlock = Math.min(curBlock + forwardBlocks, this.totalBlocks - 1);
    for (let b = curBlock; b <= maxTargetBlock; b++) {
      const blockPath = path.join(this.cacheDir, `blk_${b}.bin`);
      if (fs.existsSync(blockPath)) {
        contiguousForwardBlocks++;
      } else {
        break;
      }
    }

    const secondsPerBlock = (BLOCK_SIZE / this.bitrateBytesPerSec);
    const cachedAheadSec = contiguousForwardBlocks * secondsPerBlock;
    const effectiveDur = this.duration > 0 ? this.duration : (this.totalBlocks * secondsPerBlock);
    const cachedUntilSeconds = Math.min(effectiveDur, currentTime + cachedAheadSec);

    let contiguousBackwardBlocks = 0;
    const minTargetBlock = Math.max(1, curBlock - backwardBlocks);
    for (let b = curBlock - 1; b >= minTargetBlock; b--) {
      const blockPath = path.join(this.cacheDir, `blk_${b}.bin`);
      if (fs.existsSync(blockPath)) {
        contiguousBackwardBlocks++;
      } else {
        break;
      }
    }
    const cachedFromSeconds = Math.max(0, currentTime - (contiguousBackwardBlocks * secondsPerBlock));

    return {
      success: true,
      currentTime,
      duration: effectiveDur,
      cachedUntilSeconds,
      cachedFromSeconds,
      cachedAheadSeconds: Math.min(this.forwardBufferSeconds, cachedAheadSec),
      targetAheadSeconds: this.forwardBufferSeconds,
      targetBehindSeconds: this.backwardBufferSeconds,
      is4K: this.is4K,
      curBlock,
      totalBlocks: this.totalBlocks
    };
  }

  /**
   * Destroys worker and stops downloads.
   */
  destroy() {
    this.isDestroyed = true;
    this.activeBlockDownloads.clear();
  }
}

export class SessionMediaManager {
  /**
   * @param {string} [baseDataDir]
   */
  constructor(baseDataDir) {
    const rootDir = baseDataDir || path.join(process.cwd(), '.valor_data');
    this.mediaCacheDir = path.join(rootDir, 'media_cache');

    if (!fs.existsSync(this.mediaCacheDir)) {
      try {
        fs.mkdirSync(this.mediaCacheDir, { recursive: true });
      } catch {}
    }

    /** @type {Map<string, SessionMediaWorker>} */
    this.workers = new Map();

    // Auto-cleanup idle session workers every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleWorkers(15 * 60 * 1000); // 15 mins idle
    }, 2 * 60 * 1000);
  }

  /**
   * Gets or creates a worker for a session and URL.
   * @param {string} sessionId
   * @param {string} url
   * @param {object} [options]
   * @returns {SessionMediaWorker}
   */
  getOrCreateWorker(sessionId, url, options = {}) {
    const key = `${sessionId}_${crypto.createHash('md5').update(url).digest('hex').slice(0, 12)}`;
    let worker = this.workers.get(key);

    if (worker && !worker.isDestroyed) {
      if (options.is4K && !worker.is4K) {
        worker.is4K = true;
        worker.forwardBufferSeconds = 180;
        worker.backwardBufferSeconds = 45;
        if (worker.duration > 0) {
          worker.bitrateBytesPerSec = Math.max(1800 * 1024, Math.ceil(worker.totalSize / worker.duration));
        } else {
          worker.bitrateBytesPerSec = Math.max(worker.bitrateBytesPerSec, 2500 * 1024);
        }
      }
      if (options.auth && options.auth.username) {
        const authChanged = !worker.auth ||
          worker.auth.username !== options.auth.username ||
          worker.auth.password !== options.auth.password;

        if (authChanged || !worker.isInitialized) {
          worker.auth = options.auth;
          worker.initPromise = null;
          worker.isInitialized = false;
          worker.activeBlockDownloads.clear();
        }
      }
      return worker;
    }

    if (!worker || worker.isDestroyed) {
      const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
      const cacheDir = path.join(this.mediaCacheDir, urlHash);

      worker = new SessionMediaWorker(sessionId, url, {
        cacheDir,
        auth: options.auth,
        duration: options.duration,
        is4K: options.is4K
      });
      this.workers.set(key, worker);
    }

    return worker;
  }

  /**
   * Cleans up workers idle for more than maxIdleMs.
   */
  cleanupIdleWorkers(maxIdleMs = 15 * 60 * 1000) {
    const now = Date.now();
    for (const [key, worker] of this.workers.entries()) {
      if (now - worker.lastActivityTime > maxIdleMs) {
        worker.destroy();
        this.workers.delete(key);
        try {
          fs.rmSync(worker.cacheDir, { recursive: true, force: true });
        } catch {}
        console.log(`[SessionMediaManager] Cleaned up idle session worker: ${key}`);
      }
    }
  }

  destroyAll() {
    clearInterval(this.cleanupInterval);
    for (const worker of this.workers.values()) {
      worker.destroy();
    }
    this.workers.clear();
  }
}
