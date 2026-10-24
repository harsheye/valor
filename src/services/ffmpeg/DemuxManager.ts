import { FFmpeg } from '@ffmpeg/ffmpeg';
import { logger } from '../../utils/logger';
import type { ByteSource } from '../local/localByteSource';
import { FFmpegManager } from './FFmpegManager';
import { remoteMediaAccess } from '../remote/remoteMediaAccess';
import { getSavedCredentials } from '../remote/mediaAuthStore';
import { sidecarService } from '../remote/sidecarService';
import type { ProbeResult, MediaStreamInfo } from '../pipeline/MediaPipeline';

export class DemuxManager {
  private mountedPath: string | null = null;
  private uniqueId = Math.random().toString(36).substring(2, 9);

  constructor(
    private ffmpegMgr: FFmpegManager,
    private videoFileOrSource: File | ByteSource,
    private remoteUrl?: string
  ) {}

  public getRemoteUrl(): string | null {
    if (this.remoteUrl) return this.remoteUrl;
    if (this.isFile(this.videoFileOrSource)) return null;
    const src = this.videoFileOrSource as any;
    if (typeof src?.url === 'string') return src.url;
    if (src?.source && typeof src.source.url === 'string') return src.source.url;
    return null;
  }

  private isFile(obj: any): obj is File {
    return obj instanceof File || (obj && typeof obj.size === 'number' && typeof obj.slice === 'function');
  }

  createSibling(ffmpegMgr: FFmpegManager): DemuxManager {
    return new DemuxManager(ffmpegMgr, this.videoFileOrSource, this.remoteUrl || this.getRemoteUrl() || undefined);
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
      } catch { /* ignore */ }

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
    const remoteUrl = this.getRemoteUrl();
    if (remoteUrl) {
      try {
        const creds = getSavedCredentials(remoteUrl);
        const apiBase = sidecarService.getRemoteApiBase();
        const res = await fetch(`${apiBase}/api/remote/probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: remoteUrl,
            auth: creds ? { username: creds.username, password: creds.password } : undefined
          })
        });

        if (res.ok) {
          const data = await res.json();
          const streams: MediaStreamInfo[] = [];

          for (const v of (data.videoStreams || [])) {
            streams.push({
              index: v.index,
              type: 'video',
              codec: v.codec,
              details: `${v.codec}, ${v.width}x${v.height}`
            });
          }

          for (const a of (data.audioStreams || [])) {
            streams.push({
              index: a.index,
              type: 'audio',
              codec: a.codec,
              language: a.language,
              details: `${a.codec}, ${a.sampleRate} Hz, ${a.channels} channels`
            });
          }

          for (const s of (data.subtitleStreams || [])) {
            streams.push({
              index: s.index,
              type: 'subtitle',
              codec: s.codec,
              language: s.language,
              details: `${s.codec} (${s.language})`
            });
          }

          logger.success(`[DemuxManager] Remote probe succeeded via backend for ${remoteUrl}: ${streams.length} streams found`);
          return {
            duration: data.duration || 0,
            streams
          };
        }
      } catch (probeErr) {
        logger.warn('[DemuxManager] Backend remote probe failed, falling back:', probeErr);
      }
    }

    const inputPath = await this.getMountedInputPath(ff);
    
    if (!this.isFile(this.videoFileOrSource)) {
      const details = await remoteMediaAccess.probeRemoteMedia(
        ff,
        this.videoFileOrSource as ByteSource
      );
      return {
        duration: details.duration,
        streams: details.streams
      };
    }

    this.ffmpegMgr.clearLogs();
    try {
      await ff.exec(['-i', inputPath, '-hide_banner']);
    } catch { /* ignore */ }

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
    const remoteUrl = this.getRemoteUrl();
    if (remoteUrl) {
      const creds = getSavedCredentials(remoteUrl);
      const params = new URLSearchParams({
        url: remoteUrl,
        streamIndex: streamIndex.toString(),
        startTime: startTime.toFixed(3),
        duration: duration.toString()
      });
      if (creds?.username) {
        params.set('user', creds.username);
        if (creds.password) {
          params.set('pass', creds.password);
        }
      }

      const apiBase = sidecarService.getRemoteApiBase();
      const res = await fetch(`${apiBase}/api/remote/audio-packet?${params.toString()}`, {
        signal
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch audio packet from backend: ${res.status} ${res.statusText}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }

    const mountedInputPath = await this.getMountedInputPath(ff);
    const tempOutFile = `slice_${streamIndex}_${startTime}.wav`;
    const isRemoteSource = !this.isFile(this.videoFileOrSource);
    if (isRemoteSource) {
      return await remoteMediaAccess.extractRemoteAudioToPcmWav(
        ff,
        this.videoFileOrSource as ByteSource,
        streamIndex,
        startTime,
        duration,
        seekMap,
        undefined,
        signal
      );
    }

    const inputPath = mountedInputPath;
    const ffmpegSeekTime = startTime;

    try {
      const runSlice = async (seekSeconds: number): Promise<Uint8Array> => {
        const args = [
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
        const startTimeMs = performance.now();
        const code = await ff.exec(args);
        const durationMs = performance.now() - startTimeMs;
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
        } catch { /* ignore */ }
        outputData = await runSlice(0);
      }
      return outputData;
    } finally {
      try {
        await ff.deleteFile(tempOutFile);
        if (isRemoteSource) {
          await ff.deleteFile(inputPath);
        }
      } catch { /* ignore */ }
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
        } catch { /* ignore */ }
      } else {
        try {
          await ff.deleteFile(path);
        } catch { /* ignore */ }
      }
    }
  }
}
