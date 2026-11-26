import { ffmpegService, getOutputFormat, isCopyCodec } from '../ffmpeg';
import type { StreamInfo, ExtractionResult } from '../ffmpeg';
import { logger } from '../../utils/logger';

/**
 * Extract audio segment from a local file using WORKERFS zero-copy mount and fast seeking
 */
export async function extractLocalAudioSegment(
  videoId: string,
  file: File,
  startTime: number,
  duration: number,
  stream: StreamInfo,
  signal?: AbortSignal
): Promise<ExtractionResult> {
  return ffmpegService.lock.run(async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ff = await ffmpegService.ensureLoaded(videoId);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const inputPath = await ffmpegService.mountFile(ff, file, uniqueId);
    if (signal?.aborted) {
      await ffmpegService.cleanupSession(ff, inputPath, "");
      throw new DOMException("Aborted", "AbortError");
    }
    const { ext, mimeType } = getOutputFormat(stream.codec);
    const tempOutFile = `audio_local_${stream.index}.${ext}`;

    try {
      const selectStream = [`-map`, `0:${stream.index}`];
      let args: string[];

      const faststartFlags = ext === 'm4a' ? ['-movflags', '+faststart'] : [];

      if (isCopyCodec(stream.codec)) {
        args = [
          '-ss', startTime.toFixed(3),
          '-i', inputPath,
          '-t', duration.toFixed(3),
          ...selectStream,
          '-vn',
          '-acodec', 'copy',
          ...faststartFlags,
          tempOutFile
        ];
      } else {
        args = [
          '-ss', startTime.toFixed(3),
          '-i', inputPath,
          '-t', duration.toFixed(3),
          ...selectStream,
          '-vn',
          '-acodec', 'aac',
          '-ac', '2',
          '-ab', '128k',
          ...faststartFlags,
          tempOutFile
        ];
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      
      let code = -1;
      let execFailed = false;
      try {
        code = await ff.exec(args);
      } catch (execError) {
        logger.warn("[ffmpeg] Local segment ff.exec threw an error, forcing worker recreation:", execError);
        execFailed = true;
        ffmpegService.terminateWorker(); // Force recreate next time
      }

      if (code !== 0 || execFailed) {
        logger.warn(`[ffmpeg] Local segment ff.exec returned code ${code}, attempting to read output file anyway.`);
        if (!execFailed) {
          ffmpegService.terminateWorker(); // Force recreate next time
        }
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      
      let data: Uint8Array | null = null;
      try {
        data = await ff.readFile(tempOutFile) as Uint8Array;
      } catch (readErr) {
        logger.warn("[ffmpeg] Failed to read output file after extraction:", readErr);
      }

      if (!data || data.length === 0) {
        throw new Error(`Local audio chunk extraction failed. Output file is empty or missing. Exit status code: ${code}`);
      }

      const blob = new Blob([data as any], { type: mimeType });
      const url = URL.createObjectURL(blob);

      return {
        url,
        mimeType,
        revoke: () => URL.revokeObjectURL(url),
      };
    } finally {
      await ffmpegService.cleanupSession(ff, inputPath, tempOutFile);
    }
  });
}

/**
 * Extract the entire subtitle track from a local file in one go (fast & persistent)
 */
export async function extractLocalSubtitleTrack(
  videoId: string,
  file: File,
  stream: StreamInfo,
  signal?: AbortSignal
): Promise<string> {
  return ffmpegService.lock.run(async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ff = await ffmpegService.ensureLoaded(videoId);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const inputPath = await ffmpegService.mountFile(ff, file, uniqueId);
    if (signal?.aborted) {
      await ffmpegService.cleanupSession(ff, inputPath, "");
      throw new DOMException("Aborted", "AbortError");
    }
    let format = ffmpegService.detectSubtitleFormat(stream.codec);
    let tempOutFile = `sub_local_${stream.index}.${format}`;

    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const code = await ff.exec([
        '-i', inputPath,
        '-map', `0:${stream.index}`,
        '-c:s', 'copy',
        tempOutFile
      ]);
      if (code !== 0) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        logger.warn("[ffmpeg] Local subtitle copy failed, attempting transcode to srt...");
        const fallbackOutFile = `sub_local_${stream.index}.srt`;
        const fallbackCode = await ff.exec([
          '-i', inputPath,
          '-map', `0:${stream.index}`,
          '-c:s', 'srt',
          fallbackOutFile
        ]);
        if (fallbackCode !== 0) {
          throw new Error(`Local subtitle extraction failed. Exit code ${fallbackCode}`);
        }
        tempOutFile = fallbackOutFile;
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const data = await ff.readFile(tempOutFile);
      return new TextDecoder("utf-8").decode(data as Uint8Array);
    } finally {
      await ffmpegService.cleanupSession(ff, inputPath, tempOutFile);
    }
  });
}

/**
 * Extract a subtitle segment from a local file using a start offset and duration
 */
export async function extractLocalSubtitleSegment(
  videoId: string,
  file: File,
  startTime: number,
  duration: number,
  stream: StreamInfo,
  signal?: AbortSignal
): Promise<string> {
  return ffmpegService.lock.run(async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ff = await ffmpegService.ensureLoaded(videoId);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const inputPath = await ffmpegService.mountFile(ff, file, uniqueId);
    if (signal?.aborted) {
      await ffmpegService.cleanupSession(ff, inputPath, "");
      throw new DOMException("Aborted", "AbortError");
    }
    const format = ffmpegService.detectSubtitleFormat(stream.codec);
    const tempOutFile = `sub_local_seg_${stream.index}.${format}`;

    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const code = await ff.exec([
        '-ss', startTime.toFixed(3),
        '-i', inputPath,
        '-t', duration.toFixed(3),
        '-map', `0:${stream.index}`,
        '-c:s', 'copy',
        tempOutFile
      ]);

      if (code !== 0) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        logger.warn("[ffmpeg] Local subtitle segment copy failed, attempting transcode to srt...");
        const fallbackOutFile = `sub_local_seg_${stream.index}.srt`;
        const fallbackCode = await ff.exec([
          '-ss', startTime.toFixed(3),
          '-i', inputPath,
          '-t', duration.toFixed(3),
          '-map', `0:${stream.index}`,
          '-c:s', 'srt',
          fallbackOutFile
        ]);
        if (fallbackCode !== 0) {
          throw new Error(`Local subtitle segment extraction failed. Exit code ${fallbackCode}`);
        }
        const data = await ff.readFile(fallbackOutFile);
        await ff.deleteFile(fallbackOutFile);
        return new TextDecoder("utf-8").decode(data as Uint8Array);
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const data = await ff.readFile(tempOutFile);
      return new TextDecoder("utf-8").decode(data as Uint8Array);
    } finally {
      await ffmpegService.cleanupSession(ff, inputPath, tempOutFile);
    }
  });
}
