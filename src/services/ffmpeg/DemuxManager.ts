import { FFmpeg } from '@ffmpeg/ffmpeg';
import { logger } from '../../utils/logger';
import type { ByteSource } from '../local/localByteSource';
import { FFmpegManager } from './FFmpegManager';
import type { ProbeResult, MediaStreamInfo } from '../pipeline/MediaPipeline';
import { sidecarService } from '../remote/sidecarService';
import { getSavedCredentials } from '../remote/mediaAuthStore';

export class DemuxManager {
  private mountedPath: string | null = null;
  private uniqueId = Math.random().toString(36).substring(2, 9);
  private probedDuration = 0;

  constructor(
    private ffmpegMgr: FFmpegManager,
    private videoFileOrSource: File | ByteSource
  ) {}

  private isFile(obj: any): obj is File {
    return obj instanceof File || (obj && typeof obj.size === 'number' && typeof obj.slice === 'function');
  }

  private async getSizeFallback(source: any): Promise<number> {
    if (typeof source.getSize === 'function') {
      return await source.getSize();
    }
    if (typeof source.size === 'number') {
      return source.size;
    }
    throw new Error('Source does not expose getSize() or size');
  }

  createSibling(ffmpegMgr: FFmpegManager): DemuxManager {
    return new DemuxManager(ffmpegMgr, this.videoFileOrSource);
  }

  async getMountedInputPath(ff: FFmpeg): Promise<string> {
    if (this.mountedPath) return this.mountedPath;

    if (this.isFile(this.videoFileOrSource)) {
      const mountPoint = `/input_${this.uniqueId}`;
      const ext = this.videoFileOrSource.name.substring(this.videoFileOrSource.name.lastIndexOf('.')) || '.mkv';
      const cleanName = `input${ext}`;
      const inputPath = `${mountPoint}/${cleanName}`;
      const cleanFile = new File([this.videoFileOrSource], cleanName, { type: this.videoFileOrSource.type });

      try {
        await ff.createDir(mountPoint);
      } catch {}

      try {
        await ff.mount('WORKERFS' as any, { files: [cleanFile] }, mountPoint);
        this.mountedPath = inputPath;
        logger.success(`[DemuxManager] WORKERFS mounted at ${inputPath}`);
      } catch (err) {
        logger.warn('[DemuxManager] WORKERFS mount failed, writing to MEMFS:', err);
        const buffer = await new Response(this.videoFileOrSource).arrayBuffer();
        await ff.writeFile(inputPath, new Uint8Array(buffer));
        this.mountedPath = inputPath;
      }
    } else {
      // Remote source fallback
      this.mountedPath = `remote_input_${this.uniqueId}.mkv`;
    }
    return this.mountedPath;
  }

  async probe(ff: FFmpeg): Promise<ProbeResult> {
    const inputPath = await this.getMountedInputPath(ff);
    
    if (!this.isFile(this.videoFileOrSource)) {
      // remote probe: load first 2MB
      const source = this.videoFileOrSource as ByteSource;
      const size = await this.getSizeFallback(source);
      const bytes = await source.read(0, Math.min(2 * 1024 * 1024, size - 1));
      await ff.writeFile(inputPath, bytes);
    }

    this.ffmpegMgr.clearLogs();
    try {
      await ff.exec(['-i', inputPath, '-hide_banner']);
    } catch {}

    const logs = this.ffmpegMgr.getLogs().join('\n');
    const result = this.parseProbeLogs(logs);
    if (result.duration > 0) this.probedDuration = result.duration;
    return result;
  }

  private parseProbeLogs(logText: string): ProbeResult {
    const streams: MediaStreamInfo[] = [];
    let duration = 0;

    const durationMatch = logText.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (durationMatch) {
      const hrs = parseInt(durationMatch[1], 10);
      const mins = parseInt(durationMatch[2], 10);
      const secs = parseInt(durationMatch[3], 10);
      const ms = parseInt(durationMatch[4], 10);
      duration = hrs * 3600 + mins * 60 + secs + ms / 100;
    }

    const lines = logText.split('\n');
    for (const line of lines) {
      if (!line.includes('Stream #')) continue;

      const indexMatch = line.match(/Stream #\d+:(\d+)/);
      if (!indexMatch) continue;
      const index = parseInt(indexMatch[1], 10);

      let type: 'video' | 'audio' | 'subtitle' | null = null;
      let keyword = '';
      if (line.toLowerCase().includes('video:')) {
        type = 'video';
        keyword = 'video:';
      } else if (line.toLowerCase().includes('audio:')) {
        type = 'audio';
        keyword = 'audio:';
      } else if (line.toLowerCase().includes('subtitle:')) {
        type = 'subtitle';
        keyword = 'subtitle:';
      }

      if (!type) continue;

      let language: string | undefined = undefined;
      const langMatch = line.match(/\(([^)]+)\)(?=\s*:\s*(?:Video|Audio|Subtitle))/i);
      if (langMatch) {
        language = langMatch[1];
      }

      const keywordIndex = line.toLowerCase().indexOf(keyword);
      const details = line.substring(keywordIndex + keyword.length).trim();
      const codec = details.split(',')[0].trim();

      streams.push({ index, type, codec, language, details });
    }

    return { duration, streams };
  }

  private getMkvHeaderOnly(bytes: Uint8Array): Uint8Array {
    for (let i = 0; i <= bytes.length - 4; i++) {
      if (bytes[i] === 0x1f && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xb6 && bytes[i + 3] === 0x75) {
        return bytes.subarray(0, i);
      }
    }
    return bytes;
  }

  private findFirstMkvCluster(bytes: Uint8Array): number {
    const limit = Math.min(bytes.length - 4, 128 * 1024);
    for (let i = 0; i <= limit; i++) {
      if (bytes[i] === 0x1f && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xb6 && bytes[i + 3] === 0x75) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Slice a short segment of audio into WAV bytes
   */
  async sliceAudio(
    ff: FFmpeg,
    streamIndex: number,
    startTime: number,
    duration: number,
    seekMap?: any[],
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const isRemoteSource = !this.isFile(this.videoFileOrSource);

    // Try client-side WebAssembly demuxing first (optimized for high-end PCs / laptops with 4K adaptive window & video discard)
    let wasmError: any = null;
    try {
      const mountedInputPath = await this.getMountedInputPath(ff);
      const tempOutFile = `slice_${streamIndex}_${startTime}.wav`;
      const source = this.videoFileOrSource as ByteSource;
      const rawUrl = isRemoteSource ? (source as any)?.url : undefined;
      const isMkv = rawUrl ? (rawUrl.toLowerCase().includes('.mkv') || !rawUrl.toLowerCase().includes('.mp4')) : true;
      const ext = isMkv ? 'mkv' : 'mp4';
      const inputPath = isRemoteSource
        ? `remote_input_${this.uniqueId}_${streamIndex}_${Math.floor(startTime * 1000)}_${Math.random().toString(36).substring(2, 7)}.${ext}`
        : mountedInputPath;
      let ffmpegSeekTime = startTime;

      if (isRemoteSource) {
        const seekList = seekMap || [];
        const fileSize = await this.getSizeFallback(source);

        // High-end PC adaptive byte window: dynamically scale window for 4K / high bitrate media
        const estDuration = Math.max(startTime + duration + 60, this.probedDuration || 7200);
        const estBitrateBytesPerSec = fileSize / estDuration;
        const targetWindowDuration = duration + 25; // 35 seconds of media coverage
        const adaptiveWindowBytes = Math.max(24 * 1024 * 1024, Math.min(80 * 1024 * 1024, Math.ceil(estBitrateBytesPerSec * targetWindowDuration)));

        let startOffset = 0;
        let endOffset = adaptiveWindowBytes;
        let offsetTime = 0;

        const matchedStart = seekList.reduce((prev: any, curr: any) => {
          return curr.time <= startTime ? curr : prev;
        }, seekList[0]);

        if (matchedStart) {
          startOffset = matchedStart.offset;
          offsetTime = matchedStart.time || 0;
          const targetEndTime = startTime + duration + 30;
          const matchedEnd = seekList.reduce((prev: any, curr: any) => {
            return curr.time <= targetEndTime ? curr : prev;
          }, matchedStart);
          endOffset = matchedEnd ? matchedEnd.offset + 16 * 1024 * 1024 : startOffset + adaptiveWindowBytes;
        } else {
          startOffset = Math.floor((startTime / estDuration) * fileSize);
          endOffset = Math.min(startOffset + adaptiveWindowBytes, fileSize);
          offsetTime = (startOffset / fileSize) * estDuration;
        }

        endOffset = Math.min(endOffset, fileSize - 1);
        ffmpegSeekTime = Math.max(0, startTime - offsetTime);

        // Fetch chunk bytes
        const headerProbeBytes = await source.read(0, Math.min(2 * 1024 * 1024, fileSize - 1), signal);
        const headerBytes = this.getMkvHeaderOnly(headerProbeBytes);
        const chunkBytes = await source.read(startOffset, endOffset, signal);

        // Matroska cluster alignment
        let finalChunk = chunkBytes;
        if (isMkv && startOffset > 0) {
          const shift = this.findFirstMkvCluster(chunkBytes);
          if (shift > 0 && shift < chunkBytes.length - 1024) {
            finalChunk = chunkBytes.subarray(shift);
          }
        }

        const concatenated = new Uint8Array(headerBytes.length + finalChunk.length);
        concatenated.set(headerBytes, 0);
        concatenated.set(finalChunk, headerBytes.length);

        await ff.writeFile(inputPath, concatenated);
        logger.ffmpeg(`[DemuxManager] Client WASM audio slice start=${startTime}s offset=${offsetTime}s ffmpegSeek=${ffmpegSeekTime}s window=${((endOffset - startOffset) / (1024 * 1024)).toFixed(1)}MB bytes=${startOffset}-${endOffset}`);
      }

      try {
        const runSlice = async (seekSeconds: number): Promise<Uint8Array> => {
          const args = [
            '-discard:v', 'all',
            '-analyzeduration', '1500000',
            '-probesize', '2000000',
            '-ss', seekSeconds.toString(),
            '-accurate_seek',
            '-i', inputPath,
            '-ss', '0',
            '-t', duration.toString(),
            '-map', `0:${streamIndex}`,
            '-vn',
            '-avoid_negative_ts', 'make_zero',
            '-acodec', 'pcm_s16le',
            '-ac', '2',
            '-ar', '44100',
            '-f', 'wav',
            tempOutFile
          ];

          logger.ffmpeg(`[FFmpeg Command] ffmpeg ${args.join(' ')}`);
          const startTimeMs = performance.now();
          const code = await ff.exec(args);
          const durationMs = performance.now() - startTimeMs;
          logger.ffmpeg(`[FFmpeg Status] Exit code: ${code}, Duration: ${durationMs.toFixed(2)}ms`);
          if (code !== 0) {
            throw new Error(`FFmpeg WASM slicing returned exit code ${code}`);
          }

          const outputData = await ff.readFile(tempOutFile);
          return outputData as Uint8Array;
        };

        let outputData = await runSlice(ffmpegSeekTime);
        if (isRemoteSource && outputData.byteLength <= 512 && ffmpegSeekTime > 0) {
          logger.ffmpegWarning(
            `[DemuxManager] WASM audio slice was empty at seek ${ffmpegSeekTime}s; retrying from start of byte window.`
          );
          try {
            await ff.deleteFile(tempOutFile);
          } catch {}
          outputData = await runSlice(0);
        }

        if (outputData && outputData.byteLength > 44) {
          logger.buffer(`[DemuxManager] Client WASM demuxed audio slice successfully (${outputData.byteLength} bytes)`);
          return outputData;
        }
      } finally {
        try {
          await ff.deleteFile(tempOutFile);
          if (isRemoteSource) {
            await ff.deleteFile(inputPath);
          }
        } catch {}
      }
    } catch (err: any) {
      if (signal?.aborted) throw err;
      wasmError = err;
      logger.ffmpegWarning(`[DemuxManager] Client WASM demuxing failed, falling back to backend audio packet API:`, err?.message || err);
    }

    // Fallback: If client WASM demuxing fails on remote source, fetch clean pre-sliced WAV from backend API
    if (isRemoteSource) {
      const source = this.videoFileOrSource as ByteSource;
      const rawUrl = (source as any)?.url;
      if (typeof rawUrl === 'string' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
        try {
          const apiBase = sidecarService.getRemoteApiBase();
          const creds = getSavedCredentials(rawUrl);
          const params = new URLSearchParams({
            url: rawUrl,
            streamIndex: streamIndex.toString(),
            startTime: startTime.toFixed(3),
            duration: duration.toFixed(3)
          });
          if (creds?.username) {
            params.set('user', creds.username);
            if (creds.password) params.set('pass', creds.password);
          }
          const packetUrl = `${apiBase}/api/remote/audio-packet?${params.toString()}`;
          const response = await fetch(packetUrl, { signal });
          if (response.ok) {
            const buf = await response.arrayBuffer();
            if (buf.byteLength > 44) {
              logger.buffer(`[DemuxManager] Direct remote audio packet delivered for ${startTime}s (${buf.byteLength} bytes)`);
              return new Uint8Array(buf);
            }
          }
        } catch (apiErr: any) {
          if (signal?.aborted) throw apiErr;
          logger.error(`[DemuxManager] Both client WASM and backend audio API failed:`, apiErr);
        }
      }
    }

    if (wasmError) throw wasmError;
    throw new Error('Audio slice extraction failed');
  }

  async cleanup(ff: FFmpeg): Promise<void> {
    if (this.mountedPath) {
      const path = this.mountedPath;
      this.mountedPath = null;
      if (this.isFile(this.videoFileOrSource)) {
        const mountPoint = path.substring(0, path.lastIndexOf('/'));
        try {
          await ff.unmount(mountPoint);
          await ff.deleteDir(mountPoint);
        } catch {}
      } else {
        try {
          await ff.deleteFile(path);
        } catch {}
      }
    }
  }
}
