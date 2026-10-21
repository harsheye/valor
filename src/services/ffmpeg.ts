/**
 * FFmpegService — Optimized in-browser audio & subtitle extractor
 *
 * Optimizations:
 *  - WORKERFS zero-copy mounting (no 2MB MEMFS truncation)
 *  - Stream copy for browser-native codecs (<100ms)
 *  - Stereo downmix (-ac 2) for Dolby/DTS (3-4x faster on WASM)
 *  - Singleton worker — reused across track switches
 *  - Promise-lock — prevents concurrent MEMFS corruption
 *  - Robust cleanup in finally blocks
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { ByteSource } from "./local/localByteSource";
import { logger } from "../utils/logger";
import { isWasmSupported } from "../utils/wasmCheck";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractionResult {
  url: string;
  mimeType: string;
  /** Call this when the player no longer needs the audio to free memory */
  revoke: () => void;
}

export interface SubtitleResult {
  text: string;
  format: "ass" | "srt" | "vtt";
}

export interface StreamInfo {
  index: number;
  codec: string;
  language?: string;
  title?: string;
}

export interface MediaStream {
  index: number;
  type: 'video' | 'audio' | 'subtitle';
  codec: string;
  language?: string;
  details: string;
}

export interface ProbeResult {
  duration: string;
  format: string;
  streams: MediaStream[];
}

// ─── Codec helpers ────────────────────────────────────────────────────────────

/** Codecs browsers can play natively — use stream copy, no transcode */
export const COPY_CODEC_RE = /aac|mp3|mpeg|opus|flac|vorbis/i;

export function getOutputFormat(codec: string): { ext: string; mimeType: string } {
  if (/aac/i.test(codec))    return { ext: "m4a",  mimeType: "audio/mp4" };
  if (/mp3|mpeg/i.test(codec)) return { ext: "mp3",  mimeType: "audio/mpeg" };
  if (/opus|vorbis/i.test(codec)) return { ext: "ogg", mimeType: "audio/ogg" };
  if (/flac/i.test(codec))   return { ext: "flac", mimeType: "audio/flac" };
  // Transcode targets — transcode to M4A with faststart for instant play/seek
  return { ext: "m4a", mimeType: "audio/mp4" };
}

export function isCopyCodec(codec: string): boolean {
  return COPY_CODEC_RE.test(codec);
}

// ─── Promise-based mutex ──────────────────────────────────────────────────────

type LockFn<T> = () => Promise<T>;

class AsyncLock {
  private queue: Promise<unknown> = Promise.resolve();

  run<T>(fn: LockFn<T>): Promise<T> {
    const next = this.queue.then(fn);
    // Prevent unhandled rejection from stopping the queue
    this.queue = next.catch(() => {});
    return next;
  }
}

// ─── FFmpegService ─────────────────────────────────────────────────────────────

export class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private loadedVideoId: string | null = null;
  public lock = new AsyncLock();
  private logCollector: string[] | null = null;

  private readonly INPUT_DIR = "/input";

  // ── Worker lifecycle ────────────────────────────────────────────────────────

  /**
   * Ensure the FFmpeg worker is loaded.
   * Re-uses the existing worker if videoId hasn't changed.
   */
  async load(
    videoIdOrOnProgress?: string | ((progress: number) => void),
    onProgress?: (progress: number) => void
  ): Promise<FFmpeg> {
    let videoId = "default";
    let actualOnProgress = onProgress;

    if (typeof videoIdOrOnProgress === "function") {
      actualOnProgress = videoIdOrOnProgress;
    } else if (typeof videoIdOrOnProgress === "string") {
      videoId = videoIdOrOnProgress;
    }

    if (this.ffmpeg && this.loadedVideoId === videoId) {
      return this.ffmpeg;
    }

    // Different video — tear down and restart
    if (this.ffmpeg) {
      await this.terminateWorker();
    }

    if (!isWasmSupported()) {
      logger.warn('[FFmpegService] WebAssembly is not supported in this browser environment.');
      throw new Error('WebAssembly is not supported in this browser environment.');
    }

    const ff = new FFmpeg();

    if (actualOnProgress) {
      ff.on("progress", ({ progress }) => {
        if (actualOnProgress) {
          actualOnProgress(Math.round(progress * 100));
        }
      });
    }

    ff.on("log", ({ message }) => {
      if (this.logCollector) {
        this.logCollector.push(message);
      }
      if (import.meta.env?.DEV) {
        const msg = message.toLowerCase();
        
        // Skip uninteresting build/configuration headers to keep logs clear and concise
        if (msg.includes("configuration:") || msg.includes("libav") || msg.includes("built with")) {
          return;
        }
        
        // Skip spammy speed/time progress stats as we already have a visual progress bar
        if (msg.includes("speed=") || msg.includes("time=") || msg.includes("bitrate=")) {
          return;
        }

        // Color code errors, warnings, stream mapping info, and success logs
        if (msg.includes("error") || msg.includes("failed") || msg.includes("invalid")) {
          logger.ffmpegError(message);
        } else if (msg.includes("warning") || msg.includes("deprecated")) {
          logger.ffmpegWarning(message);
        } else if (msg.includes("stream #") || msg.includes("mapping") || msg.includes("output #")) {
          logger.ffmpegMap(message);
        } else {
          logger.ffmpeg(message);
        }
      }
    });

    await ff.load({
      coreURL: `${window.location.origin}/ffmpeg-core.js`,
      wasmURL: `${window.location.origin}/ffmpeg-core.wasm`,
    });

    this.ffmpeg = ff;
    this.loadedVideoId = videoId;
    return ff;
  }

  public async ensureLoaded(videoId: string): Promise<FFmpeg> {
    return this.load(videoId);
  }

  /**
   * Terminate the worker and free all resources.
   * Called automatically when a new video is opened.
   */
  public async terminateWorker(): Promise<void> {
    if (!this.ffmpeg) return;
    try {
      this.ffmpeg.terminate();
    } catch {
      // ignore
    }
    this.ffmpeg = null;
    this.loadedVideoId = null;
  }

  // ── WORKERFS mounting ───────────────────────────────────────────────────────

  /**
   * Mount the source File via WORKERFS (zero-copy) to a unique sub-directory.
   * Falls back to writing via fetchFile if WORKERFS unavailable.
   */
  public async mountFile(ff: FFmpeg, file: File, uniqueId: string): Promise<string> {
    const mountPoint = `${this.INPUT_DIR}_${uniqueId}`;
    const ext = file.name.substring(file.name.lastIndexOf('.')) || '.mkv';
    const cleanName = `input${ext}`;
    const inputPath = `${mountPoint}/${cleanName}`;
    const cleanFile = new File([file], cleanName, { type: file.type });

    try {
      await ff.createDir(mountPoint);
    } catch {
      // Already exists — fine
    }

    try {
      // Use string literal — FFFSType.WORKERFS is undefined in ESM builds
      await ff.mount("WORKERFS" as any, { files: [cleanFile] }, mountPoint);
      logger.success(`[ffmpeg] WORKERFS mounted successfully at ${inputPath}`);
    } catch (workerFsError) {
      // WORKERFS unavailable in this environment — fall back to MEMFS write
      logger.warn("[ffmpeg] WORKERFS unavailable, falling back to fetchFile:", workerFsError);
      const data = await fetchFile(file);
      await ff.writeFile(inputPath, data);
    }

    return inputPath;
  }

  /**
   * Unmount WORKERFS and delete output file — always call in finally.
   */
  public async cleanupSession(ff: FFmpeg, inputPath: string, outputPath: string): Promise<void> {
    const mountPoint = inputPath.substring(0, inputPath.lastIndexOf('/'));
    let unmounted = false;

    if (mountPoint && mountPoint.startsWith(this.INPUT_DIR)) {
      try {
        await ff.unmount(mountPoint);
        unmounted = true;
      } catch {
        // Not mounted or already unmounted
      }
    }

    if (!unmounted) {
      try {
        await ff.deleteFile(inputPath);
      } catch {
        // File not found
      }
    }

    if (mountPoint && mountPoint.startsWith(this.INPUT_DIR)) {
      try {
        await ff.deleteDir(mountPoint);
      } catch {
        // Was never mounted or already unmounted
      }
    }
    try {
      await ff.deleteFile(inputPath);
    } catch {
      // File may not exist if we used WORKERFS
    }
    if (outputPath) {
      try {
        await ff.deleteFile(outputPath);
      } catch {
        // Output may not have been written if FFmpeg errored
      }
    }
  }

  // ── Audio extraction ────────────────────────────────────────────────────────



  public detectSubtitleFormat(codec: string): "ass" | "srt" | "vtt" {
    if (/ass|ssa/i.test(codec))  return "ass";
    if (/webvtt/i.test(codec))   return "vtt";
    return "srt"; // subrip, mov_text, etc.
  }

  // ── Probe and extra helpers ─────────────────────────────────────────────────

  /**
   * Probe a local file to inspect its streams (video, audio, subtitles)
   */
  async probeFile(file: File, videoId: string): Promise<ProbeResult> {
    return this.lock.run(async () => {
      const ff = await this.ensureLoaded(videoId);
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const inputPath = await this.mountFile(ff, file, uniqueId);

      this.logCollector = [];

      try {
        await ff.exec(["-i", inputPath, "-t", "0", "-c", "copy", "-f", "null", "-"]);
      } catch (err) {
        // Ignore warnings/errors from probe
      } finally {
        await this.cleanupSession(ff, inputPath, "");
      }

      const fullLog = this.logCollector.join("\n");
      this.logCollector = null;

      return this.parseProbeLogs(fullLog);
    });
  }

  private parseProbeLogs(logText: string): ProbeResult {
    const streams: MediaStream[] = [];
    let duration = 'Unknown';
    let format = 'Unknown';

    const durationRegex = /Duration:\s*(\d{2}:\d{2}:\d{2}\.\d{2})/;
    const durationMatch = logText.match(durationRegex);
    if (durationMatch) {
      duration = durationMatch[1];
    }

    const formatRegex = /Input #0,\s*([^,]+)/;
    const formatMatch = logText.match(formatRegex);
    if (formatMatch) {
      format = formatMatch[1];
    }

    const lines = logText.split('\n');
    for (const line of lines) {
      if (line.includes('Output #')) {
        break;
      }
      if (!line.includes('Stream #')) continue;

      const indexMatch = line.match(/Stream #\d+:(\d+)/);
      if (!indexMatch) continue;
      const index = parseInt(indexMatch[1], 10);

      let type: 'video' | 'audio' | 'subtitle' | null = null;
      let typeKeyword = '';
      if (line.toLowerCase().includes('video:')) {
        type = 'video';
        typeKeyword = 'video:';
      } else if (line.toLowerCase().includes('audio:')) {
        type = 'audio';
        typeKeyword = 'audio:';
      } else if (line.toLowerCase().includes('subtitle:')) {
        type = 'subtitle';
        typeKeyword = 'subtitle:';
      }

      if (!type) continue;

      let language: string | undefined = undefined;
      const langMatch = line.match(/\(([^)]+)\)(?=\s*:\s*(?:Video|Audio|Subtitle))/i);
      if (langMatch) {
        language = langMatch[1];
      } else {
        const genericLangMatch = line.match(/\(([a-zA-Z]{3})\)/);
        if (genericLangMatch) {
          language = genericLangMatch[1];
        }
      }

      const keywordIndex = line.toLowerCase().indexOf(typeKeyword);
      const details = line.substring(keywordIndex + typeKeyword.length).trim();
      const codec = details.split(',')[0].trim();

      streams.push({
        index,
        type,
        codec,
        language,
        details
      });
    }
    logger.success('Parsed stream layout:', { duration, format, streams });
    return { duration, format, streams };
  }

  /**
   * Probe a remote file's streams using only the first 2MB of headers
   */
  async probeRemoteHeader(_url: string, ext: string, source: ByteSource): Promise<ProbeResult> {
    return this.lock.run(async () => {
      const ff = await this.ensureLoaded("remote-probe");
      const tempInFile = `input${ext}`;

      const size = await source.getSize();
      const headerLimit = Math.min(2 * 1024 * 1024, size - 1);
      const headerBytes = await source.read(0, headerLimit);

      await ff.writeFile(tempInFile, headerBytes);

      this.logCollector = [];

      try {
        await ff.exec(["-i", tempInFile, "-t", "0", "-c", "copy", "-f", "null", "-"]);
      } catch (err) {
        // ignore
      } finally {
        try {
          await ff.deleteFile(tempInFile);
        } catch (e) {}
      }

      const fullLog = this.logCollector.join("\n");
      this.logCollector = null;

      return this.parseProbeLogs(fullLog);
    });
  }





  /**
   * Remux / Transcode video container to playable MP4
   */
  async remuxVideo(
    file: File,
    videoId: string,
    options: { transcodeAudio: boolean },
    onProgress?: (p: number) => void
  ): Promise<{ url: string; filename: string }> {
    return this.lock.run(async () => {
      const ff = await this.ensureLoaded(videoId);
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const inputPath = await this.mountFile(ff, file, uniqueId);
      const tempOutFile = 'output.mp4';

      if (onProgress) {
        ff.on("progress", ({ progress }) => {
          onProgress(Math.round(progress * 100));
        });
      }

      try {
        let args: string[];
        if (options.transcodeAudio) {
          args = [
            '-i', inputPath,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-ac', '2',
            '-ab', '128k',
            '-strict', 'experimental',
            tempOutFile
          ];
        } else {
          args = [
            '-i', inputPath,
            '-c', 'copy',
            tempOutFile
          ];
        }

        const code = await ff.exec(args);
        if (code !== 0) {
          throw new Error(`Video remuxing failed. Exit code ${code}`);
        }

        const data = await ff.readFile(tempOutFile);
        const blob = new Blob([data as any], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);

        return {
          url,
          filename: `${file.name.replace(/\.[^/.]+$/, '')}_playable.mp4`
        };
      } finally {
        await this.cleanupSession(ff, inputPath, tempOutFile);
      }
    });
  }

  isReady(): boolean {
    return this.ffmpeg !== null;
  }

  // ── Public cleanup ──────────────────────────────────────────────────────────

  /**
   * Call when a new video is opened.
   * Terminates the current WASM worker so the next call gets a fresh one.
   */
  async reset(): Promise<void> {
    return this.lock.run(async () => {
      // Keep the WASM worker alive for instant reuse across different videos.
      this.logCollector = [];
    });
  }

  /**
   * Full teardown — call on component unmount / app close.
   */
  async destroy(): Promise<void> {
    await this.terminateWorker();
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────

/** Single shared instance — reuse across the app */
export const ffmpegService = new FFmpegService();
