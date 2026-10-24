import type { ByteSource } from '../local/localByteSource';

export interface MediaStreamInfo {
  index: number;
  type: 'video' | 'audio' | 'subtitle';
  codec: string;
  language?: string;
  title?: string;
  details: string;
}

export interface ProbeResult {
  duration: number; // in seconds
  streams: MediaStreamInfo[];
}

export interface AudioPacket {
  startTime: number; // presentation timestamp start
  endTime: number;   // presentation timestamp end
  buffer: AudioBuffer;
  duration: number;
  sampleRate: number;
  channels: number;
}

export class FileReaderService {
  constructor(private source: ByteSource) {}

  async getSize(): Promise<number> {
    return this.source.getSize();
  }

  async read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    return this.source.read(start, end, signal);
  }
}
