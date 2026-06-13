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
import type { ByteSource } from "../utils/remoteByteSource";

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
const COPY_CODEC_RE = /aac|mp3|mpeg|opus|flac|vorbis/i;

/** Codecs that must be transcoded (Dolby/DTS — not supported natively) */
const TRANSCODE_CODEC_RE = /ac3|eac3|dts|truehd|mlp/i;

function getOutputFormat(codec: string): { ext: string; mimeType: string } {
  if (/aac/i.test(codec))    return { ext: "m4a",  mimeType: "audio/mp4" };
  if (/mp3|mpeg/i.test(codec)) return { ext: "mp3",  mimeType: "audio/mpeg" };
  if (/opus|vorbis/i.test(codec)) return { ext: "ogg", mimeType: "audio/ogg" };
  if (/flac/i.test(codec))   return { ext: "flac", mimeType: "audio/flac" };
  // Transcode targets — always transcode to mp3
  return { ext: "mp3", mimeType: "audio/mpeg" };
}

function isCopyCodec(codec: string): boolean {
  return COPY_CODEC_RE.test(codec);
}

function isTranscodeCodec(codec: string): boolean {
  return TRANSCODE_CODEC_RE.test(codec);
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
  private lock = new AsyncLock();
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
        console.debug("[ffmpeg]", message);
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

  private async ensureLoaded(videoId: string): Promise<FFmpeg> {
    return this.load(videoId);
  }

  /**
   * Terminate the worker and free all resources.
   * Called automatically when a new video is opened.
   */
  private async terminateWorker(): Promise<void> {
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
  private async mountFile(ff: FFmpeg, file: File, uniqueId: string): Promise<string> {
    const mountPoint = `${this.INPUT_DIR}_${uniqueId}`;
    const inputPath = `${mountPoint}/${file.name}`;

    try {
      await ff.createDir(mountPoint);
    } catch {
      // Already exists — fine
    }

    try {
      // Use string literal — FFFSType.WORKERFS is undefined in ESM builds
      await ff.mount("WORKERFS" as any, { files: [file] }, mountPoint);
      console.log(`[ffmpeg] WORKERFS mounted successfully at ${inputPath}`);
    } catch (workerFsError) {
      console.warn("[ffmpeg] WORKERFS unavailable, falling back to fetchFile:", workerFsError);
      const data = await fetchFile(file);
      await ff.writeFile(inputPath, data);
    }

    return inputPath;
  }

  /**
   * Unmount WORKERFS and delete output file — always call in finally.
   */
  private async cleanupSession(ff: FFmpeg, inputPath: string, outputPath: string): Promise<void> {
    // Extract mount point directory from inputPath
    const mountPoint = inputPath.substring(0, inputPath.lastIndexOf('/'));
    if (mountPoint && mountPoint.startsWith(this.INPUT_DIR)) {
      try {
        await ff.unmount(mountPoint);
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

  /**
   * Extract an audio track from a video File.
   *
   * @param file        The source video File object
   * @param videoId     Stable identifier for the video (e.g. file name + size)
   * @param stream      Stream info from FFprobe (codec, index, etc.)
   * @param onProgress  Optional progress callback
   * @returns           Blob URL + revoke helper
   */
  extractAudio(
    file: File,
    videoId: string,
    stream: StreamInfo,
    onProgress?: (progress: number) => void
  ): Promise<ExtractionResult> {
    return this.lock.run(async () => {
      const ff = await this.ensureLoaded(videoId);
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const inputPath = await this.mountFile(ff, file, uniqueId);
      const { ext, mimeType } = getOutputFormat(stream.codec);
      const outputPath = `/output_audio_${stream.index}_${uniqueId}.${ext}`;

      if (onProgress) {
        ff.on("progress", ({ progress }) => {
          onProgress(Math.round(progress * 100));
        });
      }

      try {
        const args = this.buildAudioArgs(inputPath, stream, outputPath, ext);
        await ff.exec(args);

        const data = await ff.readFile(outputPath);
        const blob = new Blob([data as any], { type: mimeType });
        const url = URL.createObjectURL(blob);

        return {
          url,
          mimeType,
          revoke: () => URL.revokeObjectURL(url),
        };
      } finally {
        await this.cleanupSession(ff, inputPath, outputPath);
      }
    });
  }

  /**
   * Build FFmpeg args for the audio extraction pass.
   *
   * Copy path  — browser-native codecs:  < 100ms (demux only)
   * Transcode  — Dolby/DTS:              stereo downmix, 128k
   */
  private buildAudioArgs(inputPath: string, stream: StreamInfo, outputPath: string, ext: string): string[] {
    const selectStream = [`-map`, `0:a:${stream.index}`];

    if (isCopyCodec(stream.codec)) {
      // Fast path: pure demux, no decode/encode
      const args = [
        "-i", inputPath,
        ...selectStream,
        "-vn",
        "-acodec", "copy",
      ];
      if (ext === "m4a") {
        args.push("-bsf:a", "aac_adtstoasc");
      }
      args.push(outputPath);
      return args;
    }

    if (isTranscodeCodec(stream.codec)) {
      // Transcode path: downmix to stereo — 3-4x faster on single-threaded WASM
      return [
        "-i", inputPath,
        ...selectStream,
        "-vn",
        "-ac", "2",          // stereo downmix
        "-ab", "128k",       // compact bitrate
        "-acodec", "libmp3lame",
        outputPath,
      ];
    }

    // Unknown codec — attempt a generic transcode to stereo MP3
    console.warn(`[ffmpeg] Unknown codec "${stream.codec}" — attempting generic transcode`);
    return [
      "-i", inputPath,
      ...selectStream,
      "-vn",
      "-ac", "2",
      "-ab", "128k",
      "-acodec", "libmp3lame",
      outputPath,
    ];
  }

  // ── Subtitle extraction ─────────────────────────────────────────────────────

  /**
   * Extract a subtitle track from a video File.
   * Pure stream copy — near-instant (<50ms).
   *
   * @param file      The source video File object
   * @param videoId   Stable identifier for the video
   * @param stream    Stream info from FFprobe (codec, index)
   * @returns         Raw subtitle text + detected format
   */
  extractSubtitle(
    file: File,
    videoId: string,
    stream: StreamInfo
  ): Promise<SubtitleResult> {
    return this.lock.run(async () => {
      const ff = await this.ensureLoaded(videoId);
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const inputPath = await this.mountFile(ff, file, uniqueId);
      const format = this.detectSubtitleFormat(stream.codec);
      const outputPath = `/output_sub_${stream.index}_${uniqueId}.${format}`;

      try {
        try {
          await ff.exec([
            "-i", inputPath,
            "-map", `0:s:${stream.index}`,
            "-c:s", "copy",
            outputPath,
          ]);
        } catch (execErr) {
          console.warn("[ffmpeg] Subtitle copy failed, attempting transcode to srt:", execErr);
          await ff.exec([
            "-i", inputPath,
            "-map", `0:s:${stream.index}`,
            "-c:s", "srt",
            outputPath,
          ]);
        }

        const data = await ff.readFile(outputPath);
        const text = new TextDecoder().decode(data as Uint8Array);

        return { text, format };
      } finally {
        await this.cleanupSession(ff, inputPath, outputPath);
      }
    });
  }

  private detectSubtitleFormat(codec: string): "ass" | "srt" | "vtt" {
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
    console.log('Parsed stream layout:', { duration, format, streams });
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
   * Extract audio segment from a remote byte source using a seek offset
   */
  async extractRemoteAudioSegment(
    source: ByteSource,
    startOffset: number,
    endOffset: number,
    stream: StreamInfo,
    signal?: AbortSignal
  ): Promise<ExtractionResult> {
    return this.lock.run(async () => {
      const ff = await this.ensureLoaded("remote-stream");
      const tempInFile = "chunk.bin";
      const { ext, mimeType } = getOutputFormat(stream.codec);
      const tempOutFile = `audio_remote_${stream.index}.${ext}`;

      const chunkBytes = await source.read(startOffset, endOffset, signal);
      await ff.writeFile(tempInFile, chunkBytes);

      try {
        const selectStream = [`-map`, `0:a:${stream.index}`];
        let args: string[];

        if (isCopyCodec(stream.codec)) {
          args = [
            '-i', tempInFile,
            ...selectStream,
            '-vn',
            '-acodec', 'copy',
            tempOutFile
          ];
        } else {
          args = [
            '-i', tempInFile,
            ...selectStream,
            '-vn',
            '-acodec', 'libmp3lame',
            '-ac', '2',
            '-ab', '128k',
            '-ar', '44100',
            tempOutFile
          ];
        }

        await ff.exec(args);

        const data = await ff.readFile(tempOutFile);
        const blob = new Blob([data as any], { type: mimeType });
        const url = URL.createObjectURL(blob);

        return {
          url,
          mimeType,
          revoke: () => URL.revokeObjectURL(url),
        };
      } finally {
        try {
          await ff.deleteFile(tempInFile);
          await ff.deleteFile(tempOutFile);
        } catch (e) {}
      }
    });
  }

  /**
   * Extract subtitle segment from a remote byte source using a seek offset
   */
  async extractRemoteSubtitleSegment(
    source: ByteSource,
    startOffset: number,
    endOffset: number,
    stream: StreamInfo,
    signal?: AbortSignal
  ): Promise<string> {
    return this.lock.run(async () => {
      const ff = await this.ensureLoaded("remote-stream");
      const tempInFile = "chunk.bin";
      const format = this.detectSubtitleFormat(stream.codec);
      const tempOutFile = `sub_remote_${stream.index}.${format}`;

      const chunkBytes = await source.read(startOffset, endOffset, signal);
      await ff.writeFile(tempInFile, chunkBytes);

      try {
        try {
          await ff.exec([
            '-i', tempInFile,
            '-map', `0:s:${stream.index}`,
            '-c:s', 'copy',
            tempOutFile
          ]);
        } catch (err) {
          try {
            await ff.exec([
              '-i', tempInFile,
              '-map', `0:s:${stream.index}`,
              '-c:s', 'srt',
              tempOutFile
            ]);
          } catch (e) {
            throw err;
          }
        }

        const data = await ff.readFile(tempOutFile);
        return new TextDecoder("utf-8").decode(data as Uint8Array);
      } finally {
        try {
          await ff.deleteFile(tempInFile);
          await ff.deleteFile(tempOutFile);
        } catch (e) {}
      }
    });
  }

  /**
   * Extract audio segment from a single HLS TS segment URL
   */
  async extractHlsAudioSegment(
    segmentUrl: string,
    stream: StreamInfo
  ): Promise<{ url: string; mimeType: string }> {
    return this.lock.run(async () => {
      const ff = await this.ensureLoaded("remote-stream");
      const tempInFile = "segment.ts";
      const { ext, mimeType } = getOutputFormat(stream.codec);
      const tempOutFile = `audio_hls_${stream.index}.${ext}`;

      const response = await fetch(segmentUrl);
      const buffer = await response.arrayBuffer();
      await ff.writeFile(tempInFile, new Uint8Array(buffer));

      try {
        let args: string[];
        if (isCopyCodec(stream.codec)) {
          args = [
            '-i', tempInFile,
            '-acodec', 'copy',
            tempOutFile
          ];
        } else {
          args = [
            '-i', tempInFile,
            '-acodec', 'libmp3lame',
            '-ac', '2',
            '-ab', '128k',
            '-ar', '44100',
            tempOutFile
          ];
        }

        await ff.exec(args);

        const data = await ff.readFile(tempOutFile);
        const blob = new Blob([data as any], { type: mimeType });
        const url = URL.createObjectURL(blob);
        return { url, mimeType };
      } finally {
        try {
          await ff.deleteFile(tempInFile);
          await ff.deleteFile(tempOutFile);
        } catch (e) {}
      }
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

        await ff.exec(args);

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
      await this.terminateWorker();
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
