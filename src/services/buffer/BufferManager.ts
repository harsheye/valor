import { FFmpeg } from '@ffmpeg/ffmpeg';
import { PacketCache } from '../cache/PacketCache';
import { PacketReader } from '../packet/PacketReader';
import type { AudioPacket } from '../pipeline/MediaPipeline';
import { extractLocalSubtitleSegment } from '../local/ffmpegLocal';
import { extractRemoteSubtitleSegment } from '../remote/ffmpegRemote';
import { parseSubtitles } from '../../utils/subtitleParser';

function isAbortError(err: any, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err?.name === 'AbortError') return true;
  const msg = (err?.message || String(err)).toLowerCase();
  return msg.includes('abort') || msg.includes('canceled') || msg.includes('cancelled');
}

export class BufferManager {
  private packetCache = new PacketCache(60, 120);
  private subtitleCache = new Map<string, any[]>(); // keyed by streamIndex_offsetTime
  private activeFills = new Map<string, Promise<any>>();
  private failedFills = new Map<string, { count: number; lastTime: number }>();
  private isBuffering = false;

  private readonly COOLDOWN_MS = 8000;
  private readonly MAX_RETRIES = 3;

  constructor(
    private packetReader: PacketReader,
    private onBufferingChange?: (buffering: boolean) => void
  ) {}

  getCache(): PacketCache {
    return this.packetCache;
  }

  getSubtitleCache(): Map<string, any[]> {
    return this.subtitleCache;
  }

  isFailedOrInCooldown(key: string): boolean {
    const record = this.failedFills.get(key);
    if (!record) return false;

    if (record.count >= this.MAX_RETRIES) {
      return true;
    }

    const elapsed = Date.now() - record.lastTime;
    if (elapsed < this.COOLDOWN_MS) {
      return true;
    }

    return false;
  }

  markFailed(key: string): void {
    const record = this.failedFills.get(key) || { count: 0, lastTime: 0 };
    record.count += 1;
    record.lastTime = Date.now();
    this.failedFills.set(key, record);
    console.warn(`[BufferManager] Key ${key} failed. Attempt count: ${record.count}/${this.MAX_RETRIES}`);
  }

  resetFailures(): void {
    this.failedFills.clear();
  }

  clearActiveFills(): void {
    this.activeFills.clear();
    this.setBuffering(false);
  }

  setBufferingCallback(cb: (buffering: boolean) => void): void {
    this.onBufferingChange = cb;
  }

  private setBuffering(state: boolean): void {
    if (this.isBuffering === state) return;
    this.isBuffering = state;
    if (this.onBufferingChange) {
      this.onBufferingChange(state);
    }
  }

  async getOrFetchPacket(
    ff: FFmpeg,
    streamIndex: number,
    startTime: number,
    duration: number,
    seekMap?: any[],
    signal?: AbortSignal,
    showBuffering = false,
    cacheKeyStartTime = startTime,
    packetReader = this.packetReader
  ): Promise<AudioPacket> {
    // Critical validation
    if (streamIndex === null || streamIndex === undefined || streamIndex === -1 || isNaN(streamIndex)) {
      throw new Error(`Invalid audio stream selection streamIndex: ${streamIndex}`);
    }

    const chunkKey = Math.floor(cacheKeyStartTime / 10) * 10;
    const key = `audio_${streamIndex}_${chunkKey}`;

    // Check Cooldown/Failure
    if (this.isFailedOrInCooldown(key)) {
      throw new Error(`Buffer request for key ${key} blocked due to cooldown or retry limit`);
    }

    // 1. Check Cache strictly by chunk key to avoid overlap collisions
    const cached = this.packetCache.getExactChunk(chunkKey);
    if (cached) {
      return cached;
    }

    // 2. Check if a fetch is already in flight for this chunk
    let promise = this.activeFills.get(key);
    if (!promise) {
      this.setBuffering(true);
      promise = packetReader.readAudioPacket(ff, streamIndex, startTime, duration, seekMap, signal)
        .then((packet) => {
          this.packetCache.add(packet, chunkKey);
          return packet;
        })
        .catch((err) => {
          if (!isAbortError(err, signal)) {
            this.markFailed(key);
          }
          throw err;
        })
        .finally(() => {
          this.activeFills.delete(key);
          if (this.activeFills.size === 0) {
            this.setBuffering(false);
          }
        });
      this.activeFills.set(key, promise);
    } else {
    }

    return promise;
  }

  async getOrFetchSubtitles(
    videoId: string,
    streamIndex: number,
    startTime: number,
    duration: number,
    codec: string,
    isRemote: boolean,
    videoFile: File | null,
    cachedSource: any,
    startOffset: number,
    endOffset: number,
    signal?: AbortSignal
  ): Promise<any[]> {
    // Critical validation
    if (streamIndex === null || streamIndex === undefined || streamIndex === -1 || isNaN(streamIndex)) {
      throw new Error(`Invalid subtitle stream selection streamIndex: ${streamIndex}`);
    }

    const key = `sub_${streamIndex}_${Math.floor(startTime)}`;

    // Check Cooldown/Failure
    if (this.isFailedOrInCooldown(key)) {
      throw new Error(`Subtitle request for key ${key} blocked due to cooldown or retry limit`);
    }

    // 1. Check Cache
    const cached = this.subtitleCache.get(key);
    if (cached) {
      return cached;
    }

    // 2. Check if a fetch is already in flight
    let promise = this.activeFills.get(key);
    if (!promise) {
      this.setBuffering(true);
      promise = (async () => {
        let text = '';
        if (!isRemote && videoFile) {
          text = await extractLocalSubtitleSegment(videoId, videoFile, startTime, duration, { index: streamIndex, codec }, signal);
        } else {
          text = await extractRemoteSubtitleSegment(videoId, cachedSource, startOffset, endOffset, { index: streamIndex, codec }, signal);
        }
        const isAss = /ass|ssa/i.test(codec);
        const isVtt = /webvtt/i.test(codec);
        const formatExt = isAss ? 'ass' : (isVtt ? 'vtt' : 'srt');
        const parsedCues = parseSubtitles(text, `subtitles.${formatExt}`);
        this.subtitleCache.set(key, parsedCues);
        return parsedCues;
      })()
      .catch((err) => {
        if (!isAbortError(err, signal)) {
          this.markFailed(key);
        }
        throw err;
      })
      .finally(() => {
        this.activeFills.delete(key);
        if (this.activeFills.size === 0) {
          this.setBuffering(false);
        }
      });
      this.activeFills.set(key, promise);
    } else {
    }

    return promise;
  }

  clear(): void {
    this.activeFills.clear();
    this.packetCache.clear();
    this.subtitleCache.clear();
    this.setBuffering(false);
  }
}
