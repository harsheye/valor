import type { AudioPacket } from '../pipeline/MediaPipeline';

export interface TimeRange {
  start: number;
  end: number;
}

export class PacketCache {
  private cache = new Map<number, AudioPacket>(); // keyed by integer startTime

  constructor(
    private keepBehind = 30, // seconds to keep behind currentTime
    private keepAhead = 90   // seconds to keep ahead currentTime
  ) {}

  add(packet: AudioPacket, keyStartTime = packet.startTime): void {
    const key = Math.floor(keyStartTime / 10) * 10;
    this.cache.set(key, packet);
  }

  get(time: number): AudioPacket | null {
    const chunkKey = Math.floor(time / 10) * 10;
    const exact = this.cache.get(chunkKey);
    if (exact && time >= exact.startTime && time < exact.endTime) {
      return exact;
    }

    return Array.from(this.cache.values()).find(packet => time >= packet.startTime && time < packet.endTime) || null;
  }

  getExactChunk(chunkKey: number): AudioPacket | null {
    return this.cache.get(chunkKey) || null;
  }

  hasChunk(startTime: number): boolean {
    const chunkKey = Math.floor(startTime / 10) * 10;
    return this.cache.has(chunkKey);
  }

  hasCoverage(startTime: number, endTime: number): boolean {
    const packets = this.getAllPackets().sort((a, b) => a.startTime - b.startTime);
    let coveredUntil = startTime;

    for (const packet of packets) {
      if (packet.endTime <= coveredUntil) continue;
      if (packet.startTime > coveredUntil + 0.15) continue;
      coveredUntil = Math.max(coveredUntil, packet.endTime);
      if (coveredUntil >= endTime - 0.15) return true;
    }

    return false;
  }

  getAllPackets(): AudioPacket[] {
    return Array.from(this.cache.values()).sort((a, b) => a.startTime - b.startTime);
  }

  getEntries(): { chunkKey: number; packet: AudioPacket }[] {
    return Array.from(this.cache.entries()).map(([chunkKey, packet]) => ({ chunkKey, packet }));
  }

  evict(currentTime: number): void {
    for (const [key, packet] of this.cache.entries()) {
      if (packet.endTime < currentTime - this.keepBehind || packet.startTime > currentTime + this.keepAhead) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
