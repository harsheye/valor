export interface ByteSource {
  read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array>;
  getSize(): Promise<number>;
}

export class HttpByteSource implements ByteSource {
  private url: string;
  private size: number | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async getSize(): Promise<number> {
    if (this.size !== null) return this.size;

    let lastError: any = null;

    try {
      const response = await fetch(this.url, { method: 'HEAD' });
      if (response.status !== 200 && response.status !== 206) {
        throw new Error(`HEAD request failed with status: ${response.status}`);
      }
      const length = response.headers.get('Content-Length');
      if (length) {
        this.size = parseInt(length, 10);
        return this.size;
      }
    } catch (e) {
      console.warn('HEAD request failed, falling back to GET Range bytes=0-0:', e);
      lastError = e;
    }

    try {
      const response = await fetch(this.url, {
        headers: { Range: 'bytes=0-0' }
      });
      if (response.status !== 200 && response.status !== 206) {
        throw new Error(`GET range request failed with status: ${response.status}`);
      }
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
    } catch (err) {
      console.error('Failed to resolve file size from Range fallback:', err);
      throw err || lastError;
    }
    
    throw new Error('Could not determine remote file size');
  }

  async read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal
    });
    if (response.status !== 206 && response.status !== 200) {
      throw new Error(`Failed to fetch range ${start}-${end}, status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}

export class CachedByteSource implements ByteSource {
  private source: ByteSource;
  private chunkSize: number;
  private cacheLimit: number;
  private cache: Map<number, Uint8Array> = new Map();
  private lruList: number[] = [];
  private lastRequestedChunk: number | null = null;

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
    this.lastRequestedChunk = startChunk;

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
          this.updateLru(chunk.index);
        } else {
          this.touchLru(chunk.index);
        }
      })
    );

    const totalLength = actualEnd - start + 1;
    const result = new Uint8Array(totalLength);
    let resultOffset = 0;

    for (const chunk of chunksToRead) {
      const chunkData = this.cache.get(chunk.index)!;
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
  }

  private touchLru(index: number) {
    this.lruList = this.lruList.filter(x => x !== index);
    this.lruList.push(index);
  }

  private updateLru(index: number) {
    this.touchLru(index);
    if (this.cache.size > this.cacheLimit) {
      const current = this.lastRequestedChunk;
      if (current !== null) {
        // Eviction policy: Keep current chunk, previous 3, next 10.
        // Evict the oldest chunk that is outside this window.
        const evictIndex = this.lruList.findIndex(idx => {
          const inRange = idx >= current - 3 && idx <= current + 10;
          return !inRange;
        });

        if (evictIndex !== -1) {
          const chunkToEvict = this.lruList[evictIndex];
          this.lruList.splice(evictIndex, 1);
          this.cache.delete(chunkToEvict);
          return;
        }
      }

      // Fallback: evict oldest
      const oldest = this.lruList.shift();
      if (oldest !== undefined) {
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
    console.warn('CORS or network error during capability detection:', e);
    return false;
  }
}

export class FileByteSource implements ByteSource {
  private file: File;

  constructor(file: File) {
    this.file = file;
  }

  async getSize(): Promise<number> {
    return this.file.size;
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    const slice = this.file.slice(start, end + 1);
    const arrayBuffer = await slice.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}
