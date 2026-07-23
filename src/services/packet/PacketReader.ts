import { FFmpeg } from '@ffmpeg/ffmpeg';
import { DemuxManager } from '../ffmpeg/DemuxManager';
import type { AudioPacket } from '../pipeline/MediaPipeline';

export class PacketReader {
  constructor(
    private demuxMgr: DemuxManager,
    private audioCtx: AudioContext
  ) {}

  async readAudioPacket(
    ff: FFmpeg,
    streamIndex: number,
    startTime: number,
    duration: number,
    seekMap?: any[],
    signal?: AbortSignal
  ): Promise<AudioPacket> {
    const rawWav = await this.demuxMgr.sliceAudio(ff, streamIndex, startTime, duration, seekMap, signal);
    const audioBuffer = await this.audioCtx.decodeAudioData(rawWav.buffer as ArrayBuffer);

    return {
      startTime,
      endTime: startTime + audioBuffer.duration,
      buffer: audioBuffer,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    };
  }
}
