import { FFmpeg } from '@ffmpeg/ffmpeg';
import { logger } from '../../utils/logger';
import { isWasmSupported } from '../../utils/wasmCheck';

export class FFmpegManager {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;
  private logCollector: string[] = [];

  constructor(private videoId: string) {}

  createSibling(): FFmpegManager {
    return new FFmpegManager(this.videoId);
  }

  async load(onProgress?: (progress: number) => void): Promise<FFmpeg> {
    if (this.ffmpeg && this.isLoaded) return this.ffmpeg;

    if (!isWasmSupported()) {
      logger.warn('[FFmpegManager] WebAssembly is not supported in this browser environment.');
      throw new Error('WebAssembly is not supported in this browser environment.');
    }

    const ff = new FFmpeg();

    if (onProgress) {
      ff.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    ff.on('log', ({ message }) => {
      this.logCollector.push(message);
      if (this.logCollector.length > 1000) {
        this.logCollector.shift();
      }
      if (import.meta.env?.DEV) {
        const msg = message.toLowerCase();
        if (msg.includes('error') || msg.includes('failed')) {
          logger.ffmpegError(message);
        } else if (msg.includes('warning')) {
          logger.ffmpegWarning(message);
        }
      }
    });

    await ff.load({
      coreURL: `${window.location.origin}/ffmpeg-core.js`,
      wasmURL: `${window.location.origin}/ffmpeg-core.wasm`,
    });

    this.ffmpeg = ff;
    this.isLoaded = true;
    return ff;
  }

  getLogs(): string[] {
    return this.logCollector;
  }

  clearLogs(): void {
    this.logCollector = [];
  }

  async destroy(): Promise<void> {
    if (this.ffmpeg) {
      try {
        this.ffmpeg.terminate();
      } catch {}
      this.ffmpeg = null;
      this.isLoaded = false;
    }
  }
}
