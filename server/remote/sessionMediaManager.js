import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { RemoteDownloadManager } from './remoteDownloadManager.js';

const BLOCK_SIZE = 2 * 1024 * 1024; // 2 MB blocks
const FORWARD_BUFFER_SECONDS = 240;  // 4 minutes forward buffer
const BACKWARD_BUFFER_SECONDS = 60;  // 1 minute backward retention
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
    this.bitrateBytesPerSec = DEFAULT_BITRATE_BYTES_PER_SEC;

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
          this.bitrateBytesPerSec = Math.max(200 * 1024, Math.ceil(this.totalSize / this.duration));
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
            // Cap single range response to maximum 16MB to optimize transmission
            end = Math.min(start + 16 * 1024 * 1024 - 1, this.totalSize - 1);
          }
        } else if (match[2]) {
          // Suffix byte range: bytes=-500 (last 500 bytes)
          const suffixLength = parseInt(match[2], 10);
          start = Math.max(0, this.totalSize - suffixLength);
          end = this.totalSize - 1;
        }
      }
    } else {
      // If no range requested, provide initial 4MB chunk
      end = Math.min(4 * 1024 * 1024 - 1, this.totalSize - 1);
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

    // Trigger 240s sliding window prefetch ahead
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
   * Pre-buffers the 240-second forward sliding window in the background.
   */
  triggerPrefetch() {
    if (this.isPrefetching || this.isDestroyed) return;
    this.isPrefetching = true;

    (async () => {
      try {
        const forwardBytes = this.bitrateBytesPerSec * FORWARD_BUFFER_SECONDS;
        const currentBlock = Math.floor(this.currentPlayheadByte / BLOCK_SIZE);
        const maxBlock = Math.min(Math.floor((this.currentPlayheadByte + forwardBytes) / BLOCK_SIZE), this.totalBlocks - 1);

        // Fetch forward blocks sequentially to respect bandwidth
        for (let b = currentBlock; b <= maxBlock; b++) {
          if (this.isDestroyed) break;

          // Check if playhead moved drastically (user sought away)
          const newCurrentBlock = Math.floor(this.currentPlayheadByte / BLOCK_SIZE);
          if (Math.abs(newCurrentBlock - currentBlock) > 5) {
            break; // Restart prefetch from new playhead on next request
          }

          const blockPath = path.join(this.cacheDir, `blk_${b}.bin`);
          if (!fs.existsSync(blockPath)) {
            await this.getBlock(b).catch(() => {});
          }
        }
      } finally {
        this.isPrefetching = false;
      }
    })();
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
        duration: options.duration
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
