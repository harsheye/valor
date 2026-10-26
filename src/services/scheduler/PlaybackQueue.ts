import { PacketCache } from '../cache/PacketCache';
import { AudioScheduler } from './AudioScheduler';
import { ChunkManifest } from './ChunkManifest';

export class PlaybackQueue {
  public readonly instanceId = Math.random().toString(36).substring(7);
  private scheduledTimes = new Set<number>();

  constructor(
    private cache: PacketCache,
    private audioScheduler: AudioScheduler,
    private manifest: ChunkManifest
  ) {}

  update(currentTime: number, playbackRate: number): void {
    // Reschedule any cached packets that fall within the upcoming 50-second window and are not yet scheduled
    const highWaterTarget = currentTime + 50;
    const cachedPackets = this.cache.getEntries()
      .filter(({ packet }) => packet.endTime > currentTime && packet.startTime < highWaterTarget)
      .sort((a, b) => {
        const aCoversPlayhead = currentTime >= a.packet.startTime && currentTime < a.packet.endTime;
        const bCoversPlayhead = currentTime >= b.packet.startTime && currentTime < b.packet.endTime;
        if (aCoversPlayhead !== bCoversPlayhead) return aCoversPlayhead ? -1 : 1;
        return a.packet.startTime - b.packet.startTime;
      });

    for (const { chunkKey, packet } of cachedPackets) {
      if (packet.endTime > currentTime && packet.startTime < highWaterTarget) {
        if (!this.scheduledTimes.has(chunkKey)) {
          this.scheduledTimes.add(chunkKey);
          this.manifest.transitionTo(chunkKey, 'QUEUED');
          console.log(`[PlaybackQueue-${this.instanceId}] Scheduling Audio:`, chunkKey);
          this.audioScheduler.schedule(packet, currentTime, playbackRate);
          console.log(`[PlaybackQueue-${this.instanceId}] Scheduled cached chunk ${chunkKey}s on-the-fly.`);
        }
      }
    }

    // Evict played chunks from scheduled tracking based on audioScheduler's evicted nodes
    const evicted = this.audioScheduler.evictPlayed(currentTime);
    for (const startTime of evicted) {
      const chunkKey = Math.floor(startTime / 10) * 10;
      this.scheduledTimes.delete(chunkKey);
      this.manifest.transitionTo(chunkKey, 'PLAYED');
    }
  }

  hasScheduled(startTime: number): boolean {
    const chunkKey = Math.floor(startTime / 10) * 10;
    return this.scheduledTimes.has(chunkKey);
  }

  markScheduled(startTime: number): void {
    const chunkKey = Math.floor(startTime / 10) * 10;
    this.scheduledTimes.add(chunkKey);
  }

  clear(): void {
    this.audioScheduler.stopAll();
    this.scheduledTimes.clear();
  }

  getQueueSize(): number {
    return this.scheduledTimes.size;
  }
}
