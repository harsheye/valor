import { PacketCache } from '../cache/PacketCache';
import type { TimeRange } from '../cache/PacketCache';
import { ChunkManifest } from './ChunkManifest';

export class BufferScheduler {
  private readonly lowWaterMark = 30;   // seconds (keep 30s minimum buffer)
  private readonly highWaterMark = 60;  // seconds (buffer up to 60s ahead)
  private readonly chunkSize = 10;      // seconds
  private isBufferingState = true;      // Start true to buffer 60s initially

  constructor(private cache: PacketCache, private manifest: ChunkManifest) {}

  shouldBuffer(currentTime: number): boolean {
    const bufferedAhead = this.getBufferedAhead(currentTime);

    if (this.isBufferingState) {
      if (bufferedAhead >= this.highWaterMark) {
        this.isBufferingState = false;
      }
    } else {
      if (bufferedAhead < this.lowWaterMark) {
        this.isBufferingState = true;
      }
    }

    return this.isBufferingState;
  }

  reset(): void {
    this.isBufferingState = true;
  }

  getBufferedAhead(currentTime: number): number {
    const ranges = this.getBufferedRanges();
    const activeRange = ranges.find(r => currentTime >= r.start && currentTime <= r.end);
    if (activeRange) {
      return activeRange.end - currentTime;
    }
    return 0;
  }

  getBufferedRanges(): TimeRange[] {
    const ranges: TimeRange[] = [];
    const packets = this.cache.getAllPackets().sort((a, b) => a.startTime - b.startTime);
    for (const p of packets) {
      if (ranges.length === 0) {
        ranges.push({ start: p.startTime, end: p.endTime });
      } else {
        const last = ranges[ranges.length - 1];
        if (p.startTime <= last.end + 0.5) {
          last.end = Math.max(last.end, p.endTime);
        } else {
          ranges.push({ start: p.startTime, end: p.endTime });
        }
      }
    }
    return ranges;
  }

  getMissingTargets(currentTime: number): number[] {
    const missing: number[] = [];
    const startChunk = Math.floor(currentTime / this.chunkSize) * this.chunkSize;
    const limit = startChunk + this.highWaterMark;
    for (let t = startChunk; t < limit; t += this.chunkSize) {
      const state = this.manifest.getState(t);
      const requiredStart = t;
      const requiredEnd = t + this.chunkSize;
      const hasCoverage = this.cache.hasCoverage(requiredStart, requiredEnd);
      const hasChunk = this.cache.hasChunk(t);
      const isCachedState = state === 'CACHED' || state === 'QUEUED' || state === 'PLAYING' || state === 'PLAYED';
      
      if (!hasChunk && !isCachedState && (!hasCoverage || state === 'EMPTY')) {
        missing.push(t);
      }
    }
    return missing;
  }
}
