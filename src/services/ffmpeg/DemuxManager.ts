import { FFmpeg } from '@ffmpeg/ffmpeg';
import { logger } from '../../utils/logger';
import type { ByteSource } from '../local/localByteSource';
import { FFmpegManager } from './FFmpegManager';
import type { ProbeResult, MediaStreamInfo } from '../pipeline/MediaPipeline';

export class DemuxManager {
  private mountedPath: string | null = null;
  private uniqueId = Math.random().toString(36).substring(2, 9);

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
    return this.parseProbeLogs(logs);
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
    const mountedInputPath = await this.getMountedInputPath(ff);
    const tempOutFile = `slice_${streamIndex}_${startTime}.wav`;
    const isRemoteSource = !this.isFile(this.videoFileOrSource);
    const inputPath = isRemoteSource
      ? `remote_input_${this.uniqueId}_${streamIndex}_${Math.floor(startTime * 1000)}_${Math.random().toString(36).substring(2, 7)}.mkv`
      : mountedInputPath;
    let ffmpegSeekTime = startTime;

    if (isRemoteSource) {
      // Remote chunk: resolve byte range and write chunk
      const source = this.videoFileOrSource as ByteSource;
      const seekList = seekMap || [];
      
      let startOffset = 0;
      let endOffset = 8 * 1024 * 1024;
      let offsetTime = 0;
      const fileSize = await this.getSizeFallback(source);

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
        endOffset = matchedEnd ? matchedEnd.offset + 8 * 1024 * 1024 : startOffset + 24 * 1024 * 1024;
      } else {
        // Linear fallback
        const size = await this.getSizeFallback(source);
        startOffset = Math.floor((startTime / 3600) * size);
        endOffset = Math.min(startOffset + 24 * 1024 * 1024, size);
        offsetTime = startTime;
      }

      endOffset = Math.min(endOffset, fileSize - 1);
      ffmpegSeekTime = Math.max(0, startTime - offsetTime);

      // Fetch chunk
      const headerProbeBytes = await source.read(0, Math.min(2 * 1024 * 1024, fileSize - 1), signal);
      const headerBytes = this.getMkvHeaderOnly(headerProbeBytes);
      const chunkBytes = await source.read(startOffset, endOffset, signal);

      const concatenated = new Uint8Array(headerBytes.length + chunkBytes.length);
      concatenated.set(headerBytes, 0);
      concatenated.set(chunkBytes, headerBytes.length);

      await ff.writeFile(inputPath, concatenated);
      console.log(
        `[DemuxManager] Remote audio slice start=${startTime}s offset=${offsetTime}s ffmpegSeek=${ffmpegSeekTime}s header=${headerBytes.length} bytes=${startOffset}-${endOffset}`
      );
    }

    try {
      const runSlice = async (seekSeconds: number): Promise<Uint8Array> => {
        const args = [
          '-ss', seekSeconds.toString(),
          '-i', inputPath,
          '-t', duration.toString(),
          '-map', `0:${streamIndex}`,
          '-vn',
          '-acodec', 'pcm_s16le',
          '-ac', '2',
          '-ar', '44100',
          '-f', 'wav',
          tempOutFile
        ];

        console.log(`[FFmpeg Command] ffmpeg ${args.join(" ")}`);
        const startTimeMs = performance.now();
        const code = await ff.exec(args);
        const durationMs = performance.now() - startTimeMs;
        console.log(`[FFmpeg Status] Exit code: ${code}, Duration: ${durationMs.toFixed(2)}ms`);
        if (code !== 0) {
          throw new Error(`FFmpeg Slicing returned exit code ${code}`);
        }

        const outputData = await ff.readFile(tempOutFile);
        return outputData as Uint8Array;
      };

      let outputData = await runSlice(ffmpegSeekTime);
      if (isRemoteSource && outputData.byteLength <= 512 && ffmpegSeekTime > 0) {
        console.warn(
          `[DemuxManager] Remote audio slice was empty at seek ${ffmpegSeekTime}s; retrying from start of byte window.`
        );
        try {
          await ff.deleteFile(tempOutFile);
        } catch {}
        outputData = await runSlice(0);
      }
      return outputData;
    } finally {
      try {
        await ff.deleteFile(tempOutFile);
        if (isRemoteSource) {
          await ff.deleteFile(inputPath);
        }
      } catch {}
    }
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
