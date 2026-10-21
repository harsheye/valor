import type { ByteSource } from '../local/localByteSource';

type DownloadPriority = 'current' | 'prefetch';

// Add a helper for proxying fetch through the extension background if in a frame
const proxyFetch = (url: string, options: any, blob: boolean): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (window === window.parent) {
      return reject(new Error('Not in iframe, cannot proxy'));
    }
    const id = Math.random().toString(36).substring(2);
    
    const listener = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PROXY_FETCH_RESPONSE' && event.data.id === id) {
        window.removeEventListener('message', listener);
        if (event.data.response.ok) {
          resolve(event.data.response);
        } else {
          reject(new Error(event.data.response.error || `Proxy fetch failed: ${event.data.response.status}`));
        }
      }
    };
    window.addEventListener('message', listener);
    
    // Timeout
    setTimeout(() => {
      window.removeEventListener('message', listener);
      reject(new Error('Proxy fetch timeout'));
    }, 15000);

    window.parent.postMessage({ type: 'PROXY_FETCH', id, url, options, blob }, '*');
  });
};

const getBackendProxyUrl = (url: string): string => {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
};

export class HttpByteSource implements ByteSource {
  private url: string;
  private size: number | null = null;
  private proxyMode: 'none' | 'extension' | 'backend' = 'none';

  constructor(url: string) {
    this.url = url;
  }

  async getSize(): Promise<number> {
    if (this.size !== null) return this.size;

    let lastError: any = null;

    if (this.proxyMode === 'none') {
      try {
        const response = await fetch(this.url, { method: 'HEAD' });
        if (response.status === 200 || response.status === 206) {
          const length = response.headers.get('Content-Length');
          if (length) {
            this.size = parseInt(length, 10);
            return this.size;
          }
        }
      } catch (e) {
        lastError = e;
      }

      try {
        const response = await fetch(this.url, {
          headers: { Range: 'bytes=0-0' }
        });
        if (response.status === 200 || response.status === 206) {
          const range = response.headers.get('Content-Range');
          if (range) {
            const parts = range.split('/');
            if (parts.length > 1) {
              this.size = parseInt(parts[1], 10);
              return this.size;
            }
          }
          const length = response.headers.get('Content-Length');
          if (length) {
            this.size = parseInt(length, 10);
            return this.size;
          }
        }
      } catch (err) {
        lastError = err;
      }
    }

    // Direct fetch failed or blocked by CORS: try extension proxy first if in iframe
    if (window !== window.parent) {
      try {
        const proxyRes = await proxyFetch(this.url, { headers: { Range: 'bytes=0-0' } }, false);
        this.proxyMode = 'extension';
        const range = proxyRes.headers?.['content-range'];
        if (range) {
          const parts = range.split('/');
          if (parts.length > 1) {
            this.size = parseInt(parts[1], 10);
            return this.size;
          }
        }
        const length = proxyRes.headers?.['content-length'];
        if (length) {
          this.size = parseInt(length, 10);
          return this.size;
        }
      } catch (proxyErr) {
        lastError = proxyErr;
      }
    }

    // Try Valor backend proxy fallback (/api/proxy)
    try {
      const proxyUrl = getBackendProxyUrl(this.url);
      const response = await fetch(proxyUrl, {
        headers: { Range: 'bytes=0-0' }
      });
      if (response.status === 200 || response.status === 206) {
        this.proxyMode = 'backend';
        const range = response.headers.get('Content-Range');
        if (range) {
          const parts = range.split('/');
          if (parts.length > 1) {
            this.size = parseInt(parts[1], 10);
            return this.size;
          }
        }
        const length = response.headers.get('Content-Length');
        if (length) {
          this.size = parseInt(length, 10);
          return this.size;
        }
      }
    } catch (backendErr) {
      lastError = backendErr;
    }

    throw lastError || new Error('Could not determine remote file size');
  }

  async read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    if (this.proxyMode === 'extension') {
      const proxyRes = await proxyFetch(this.url, { headers: { Range: `bytes=${start}-${end}` } }, true);
      const binaryString = atob(proxyRes.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }

    if (this.proxyMode === 'backend') {
      const proxyUrl = getBackendProxyUrl(this.url);
      const response = await fetch(proxyUrl, {
        headers: { Range: `bytes=${start}-${end}` },
        signal
      });
      if (response.status !== 206 && response.status !== 200) {
        throw new Error(`Failed to fetch range ${start}-${end} via backend proxy, status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }

    try {
      const response = await fetch(this.url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal
      });
      if (response.status === 206 || response.status === 200) {
        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }
    } catch (directErr) {
      // Fallback to backend proxy
      try {
        const proxyUrl = getBackendProxyUrl(this.url);
        const response = await fetch(proxyUrl, {
          headers: { Range: `bytes=${start}-${end}` },
          signal
        });
        if (response.status === 206 || response.status === 200) {
          this.proxyMode = 'backend';
          const arrayBuffer = await response.arrayBuffer();
          return new Uint8Array(arrayBuffer);
        }
      } catch (e) {}
      throw directErr;
    }

    throw new Error(`Failed to fetch range ${start}-${end}`);
  }
}

export class RemoteDownloadManager implements ByteSource {
  private size: number | null = null;
  private cache = new Map<number, Uint8Array>();
  private lruList: number[] = [];
  private inFlight = new Map<number, Promise<Uint8Array>>();
  private activeControllers = new Set<AbortController>();
  private bandwidthSamples: number[] = [];
  private generation = 0;

  constructor(
    private source: ByteSource,
    private chunkSize = 4 * 1024 * 1024,
    private cacheLimit = 24,
    private maxRetries = 3
  ) {}

  async getSize(): Promise<number> {
    if (this.size !== null) return this.size;
    this.size = await this.source.getSize();
    return this.size;
  }

  cancelAll(): void {
    this.generation++;
    for (const controller of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
    this.inFlight.clear();
  }

  getEstimatedBandwidthMbps(): number {
    if (!this.bandwidthSamples.length) return 0;
    const averageBytesPerMs = this.bandwidthSamples.reduce((sum, value) => sum + value, 0) / this.bandwidthSamples.length;
    return averageBytesPerMs * 8 / 1000;
  }

  async prefetch(start: number, end: number, signal?: AbortSignal): Promise<void> {
    await this.readRange(start, end, signal, 'prefetch');
  }

  async read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    return this.readRange(start, end, signal, 'current');
  }

  private async readRange(
    start: number,
    end: number,
    signal: AbortSignal | undefined,
    priority: DownloadPriority
  ): Promise<Uint8Array> {
    const size = await this.getSize();
    const actualEnd = Math.min(end, size - 1);
    if (start > actualEnd) return new Uint8Array(0);

    const startChunk = Math.floor(start / this.chunkSize);
    const endChunk = Math.floor(actualEnd / this.chunkSize);
    const chunkIndexes: number[] = [];
    for (let index = startChunk; index <= endChunk; index++) {
      chunkIndexes.push(index);
    }

    if (priority === 'current') {
      chunkIndexes.sort((a, b) => Math.abs(a - startChunk) - Math.abs(b - startChunk));
    }

    for (const index of chunkIndexes) {
      await this.ensureChunk(index, signal, priority);
    }

    const result = new Uint8Array(actualEnd - start + 1);
    let resultOffset = 0;
    for (const index of chunkIndexes) {
      const chunkData = this.cache.get(index);
      if (!chunkData) throw new Error(`Remote byte chunk ${index} was not cached after download`);

      const chunkStart = index * this.chunkSize;
      const readStart = Math.max(0, start - chunkStart);
      const readEnd = Math.min(chunkData.length - 1, actualEnd - chunkStart);
      const length = readEnd - readStart + 1;
      if (length > 0) {
        result.set(chunkData.subarray(readStart, readStart + length), resultOffset);
        resultOffset += length;
      }
    }

    return result;
  }

  private async ensureChunk(index: number, signal: AbortSignal | undefined, priority: DownloadPriority): Promise<void> {
    if (this.cache.has(index)) {
      this.touchLru(index);
      return;
    }

    let promise = this.inFlight.get(index);
    if (!promise) {
      promise = this.downloadChunk(index, signal, priority);
      this.inFlight.set(index, promise);
    }

    const bytes = await promise;
    this.cache.set(index, bytes);
    this.touchLru(index);
    this.evict(index);
  }

  private async downloadChunk(index: number, outerSignal: AbortSignal | undefined, priority: DownloadPriority): Promise<Uint8Array> {
    const generation = this.generation;
    const size = await this.getSize();
    const start = index * this.chunkSize;
    const end = Math.min((index + 1) * this.chunkSize - 1, size - 1);
    let lastError: unknown = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      if (outerSignal?.aborted || generation !== this.generation) {
        throw new DOMException('Remote range request aborted', 'AbortError');
      }

      const controller = new AbortController();
      this.activeControllers.add(controller);
      const abortOuter = () => controller.abort();
      outerSignal?.addEventListener('abort', abortOuter, { once: true });

      try {
        const startedAt = performance.now();
        const bytes = await this.source.read(start, end, controller.signal);
        const elapsed = Math.max(1, performance.now() - startedAt);
        this.recordBandwidth(bytes.byteLength / elapsed);
        return bytes;
      } catch (error) {
        lastError = error;
        if (controller.signal.aborted || outerSignal?.aborted || generation !== this.generation) {
          throw error;
        }
        await this.delay(this.retryDelayMs(attempt, priority), outerSignal);
      } finally {
        outerSignal?.removeEventListener('abort', abortOuter);
        this.activeControllers.delete(controller);
        this.inFlight.delete(index);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to download remote range chunk ${index}`);
  }

  private recordBandwidth(bytesPerMs: number): void {
    this.bandwidthSamples.push(bytesPerMs);
    if (this.bandwidthSamples.length > 8) {
      this.bandwidthSamples.shift();
    }
  }

  private retryDelayMs(attempt: number, priority: DownloadPriority): number {
    const base = priority === 'current' ? 180 : 420;
    return base * 2 ** attempt;
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Remote range retry aborted', 'AbortError'));
        return;
      }
      const id = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new DOMException('Remote range retry aborted', 'AbortError'));
      }, { once: true });
    });
  }

  private touchLru(index: number): void {
    this.lruList = this.lruList.filter((item) => item !== index);
    this.lruList.push(index);
  }

  private evict(currentIndex: number): void {
    while (this.cache.size > this.cacheLimit) {
      const evictIndex = this.lruList.findIndex((index) => Math.abs(index - currentIndex) > 12);
      const targetIndex = evictIndex === -1 ? 0 : evictIndex;
      const [chunkIndex] = this.lruList.splice(targetIndex, 1);
      this.cache.delete(chunkIndex);
    }
  }
}

export class CachedByteSource implements ByteSource {
  private source: ByteSource;
  private chunkSize: number;
  private cacheLimit: number;
  private cache: Map<number, Uint8Array> = new Map();
  private lruList: number[] = [];
  private activeChunks: Map<number, number> = new Map();

  constructor(source: ByteSource, chunkSize = 1024 * 1024, cacheLimit = 8) {
    this.source = source;
    this.chunkSize = chunkSize;
    this.cacheLimit = cacheLimit;
  }

  async getSize(): Promise<number> {
    return this.source.getSize();
  }

  async read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    const size = await this.getSize();
    const actualEnd = Math.min(end, size - 1);
    if (start > actualEnd) {
      return new Uint8Array(0);
    }

    const startChunk = Math.floor(start / this.chunkSize);
    const endChunk = Math.floor(actualEnd / this.chunkSize);

    // Track active chunks to avoid eviction during read/copy
    for (let c = startChunk; c <= endChunk; c++) {
      this.activeChunks.set(c, (this.activeChunks.get(c) || 0) + 1);
    }

    try {
      const chunksToRead: { index: number; startByte: number; endByte: number }[] = [];
      for (let c = startChunk; c <= endChunk; c++) {
        chunksToRead.push({
          index: c,
          startByte: c * this.chunkSize,
          endByte: Math.min((c + 1) * this.chunkSize - 1, size - 1)
        });
      }

      await Promise.all(
        chunksToRead.map(async (chunk) => {
          if (!this.cache.has(chunk.index)) {
            const chunkData = await this.source.read(chunk.startByte, chunk.endByte, signal);
            this.cache.set(chunk.index, chunkData);
            this.updateLru(chunk.index, startChunk);
          } else {
            this.touchLru(chunk.index);
          }
        })
      );

      const totalLength = actualEnd - start + 1;
      const result = new Uint8Array(totalLength);
      let resultOffset = 0;

      for (const chunk of chunksToRead) {
        let chunkData = this.cache.get(chunk.index);
        if (!chunkData) {
          console.warn(`Chunk ${chunk.index} was evicted during concurrent read, fetching directly`);
          chunkData = await this.source.read(chunk.startByte, chunk.endByte, signal);
        }
        const chunkStartOffset = chunk.startByte;
        
        const readStartInChunk = Math.max(0, start - chunkStartOffset);
        const readEndInChunk = Math.min(chunkData.length - 1, actualEnd - chunkStartOffset);
        
        const lengthToCopy = readEndInChunk - readStartInChunk + 1;
        if (lengthToCopy > 0) {
          result.set(chunkData.subarray(readStartInChunk, readStartInChunk + lengthToCopy), resultOffset);
          resultOffset += lengthToCopy;
        }
      }

      return result;
    } finally {
      // Decrement reference count of active chunks
      for (let c = startChunk; c <= endChunk; c++) {
        const count = this.activeChunks.get(c) || 0;
        if (count <= 1) {
          this.activeChunks.delete(c);
        } else {
          this.activeChunks.set(c, count - 1);
        }
      }
    }
  }

  private touchLru(index: number) {
    this.lruList = this.lruList.filter(x => x !== index);
    this.lruList.push(index);
  }

  private updateLru(index: number, current: number) {
    this.touchLru(index);
    if (this.cache.size > this.cacheLimit) {
      // Eviction policy: Keep current chunk, previous 3, next 10.
      // Evict the oldest chunk that is outside this window and not active.
      const evictIndex = this.lruList.findIndex(idx => {
        if (this.activeChunks.has(idx)) return false;
        const inRange = idx >= current - 3 && idx <= current + 10;
        return !inRange;
      });

      if (evictIndex !== -1) {
        const chunkToEvict = this.lruList[evictIndex];
        this.lruList.splice(evictIndex, 1);
        this.cache.delete(chunkToEvict);
        return;
      }

      // Fallback: evict oldest that is not active
      const oldestEvictIndex = this.lruList.findIndex(idx => !this.activeChunks.has(idx));
      if (oldestEvictIndex !== -1) {
        const oldest = this.lruList[oldestEvictIndex];
        this.lruList.splice(oldestEvictIndex, 1);
        this.cache.delete(oldest);
      }
    }
  }
}

export async function detectUrlCapabilities(url: string): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 3000);

  try {
    // Validate protocol for security
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      console.warn('URL capability detection rejected: Unsupported protocol:', parsedUrl.protocol);
      clearTimeout(id);
      return false;
    }
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-15' },
      signal: controller.signal
    });
    clearTimeout(id);
    if (response.status === 200 || response.status === 206) {
      const buffer = await response.arrayBuffer();
      return buffer.byteLength > 0;
    }
    return false;
  } catch (e) {
    clearTimeout(id);
    console.warn('Direct capability detection failed (CORS or network error). Trying backend proxy fallback...', e);
    try {
      const proxyUrl = getBackendProxyUrl(url);
      const proxyController = new AbortController();
      const pId = setTimeout(() => proxyController.abort(), 4000);
      const res = await fetch(proxyUrl, {
        headers: { Range: 'bytes=0-15' },
        signal: proxyController.signal
      });
      clearTimeout(pId);
      if (res.status === 200 || res.status === 206) {
        const buffer = await res.arrayBuffer();
        return buffer.byteLength > 0;
      }
    } catch (err) {}
    return false;
  }
}
