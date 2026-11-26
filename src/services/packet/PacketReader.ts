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
    const wavBytes = (rawWav.byteOffset === 0 && rawWav.byteLength === rawWav.buffer.byteLength)
      ? (rawWav.buffer as ArrayBuffer).slice(0)
      : rawWav.buffer.slice(rawWav.byteOffset, rawWav.byteOffset + rawWav.byteLength);
    const audioBuffer = await this.audioCtx.decodeAudioData(wavBytes as ArrayBuffer);

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
