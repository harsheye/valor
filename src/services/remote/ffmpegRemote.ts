import { ffmpegService, getOutputFormat, isCopyCodec } from '../ffmpeg';
import type { StreamInfo, ExtractionResult } from '../ffmpeg';
import type { ByteSource } from '../local/localByteSource';
import { logger } from '../../utils/logger';

/**
 * Extract audio segment from a remote byte source using a seek offset
 */
export async function extractRemoteAudioSegment(
  videoId: string,
  source: ByteSource,
  startOffset: number,
  endOffset: number,
  stream: StreamInfo,
  signal?: AbortSignal
): Promise<ExtractionResult> {
  return ffmpegService.lock.run(async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ff = await ffmpegService.ensureLoaded(videoId);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const tempInFile = "chunk.bin";
    const { ext, mimeType } = getOutputFormat(stream.codec);
    const tempOutFile = `audio_remote_${stream.index}.${ext}`;

    // Read headers (first 1MB) and target chunk, then concatenate them
    const size = await source.getSize();
    const headerLimit = Math.min(1024 * 1024, size - 1);
    
    let concatenated: Uint8Array;
    if (startOffset < headerLimit) {
      concatenated = await source.read(0, endOffset, signal);
    } else {
      const headerBytes = await source.read(0, headerLimit, signal);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const chunkBytes = await source.read(startOffset, endOffset, signal);

      concatenated = new Uint8Array(headerBytes.length + chunkBytes.length);
      concatenated.set(headerBytes, 0);
      concatenated.set(chunkBytes, headerBytes.length);
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await ff.writeFile(tempInFile, concatenated);

    try {
      const selectStream = [`-map`, `0:${stream.index}`];
      let args: string[];

      const faststartFlags = ext === 'm4a' ? ['-movflags', '+faststart'] : [];

      if (isCopyCodec(stream.codec)) {
        args = [
          '-fflags', '+ignidx',
          '-i', tempInFile,
          ...selectStream,
          '-vn',
          '-acodec', 'copy',
          ...faststartFlags,
          tempOutFile
        ];
      } else {
        args = [
          '-fflags', '+ignidx',
          '-i', tempInFile,
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
        logger.warn("[ffmpeg] Remote segment ff.exec threw an error, forcing worker recreation:", execError);
        execFailed = true;
        ffmpegService.terminateWorker(); // Force recreate next time
      }

      if (code !== 0 || execFailed) {
        logger.warn(`[ffmpeg] Remote segment ff.exec returned code ${code}, attempting to read output file anyway.`);
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
        throw new Error(`Remote audio extraction failed. Output file is empty or missing. Exit status code: ${code}`);
      }

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
export async function extractRemoteSubtitleSegment(
  videoId: string,
  source: ByteSource,
  startOffset: number,
  endOffset: number,
  stream: StreamInfo,
  signal?: AbortSignal
): Promise<string> {
  return ffmpegService.lock.run(async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ff = await ffmpegService.ensureLoaded(videoId);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const tempInFile = "chunk.bin";
    let format = ffmpegService.detectSubtitleFormat(stream.codec);
    let tempOutFile = `sub_remote_${stream.index}.${format}`;

    const size = await source.getSize();
    const headerLimit = Math.min(1024 * 1024, size - 1);

    let concatenated: Uint8Array;
    if (startOffset < headerLimit) {
      concatenated = await source.read(0, endOffset, signal);
    } else {
      const headerBytes = await source.read(0, headerLimit, signal);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const chunkBytes = await source.read(startOffset, endOffset, signal);

      concatenated = new Uint8Array(headerBytes.length + chunkBytes.length);
      concatenated.set(headerBytes, 0);
      concatenated.set(chunkBytes, headerBytes.length);
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await ff.writeFile(tempInFile, concatenated);

    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const code = await ff.exec([
        '-fflags', '+ignidx',
        '-i', tempInFile,
        '-map', `0:${stream.index}`,
        '-c:s', 'copy',
        tempOutFile
      ]);
      if (code !== 0) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        logger.warn("[ffmpeg] Remote subtitle copy failed, attempting transcode to srt...");
        const fallbackOutFile = `sub_remote_${stream.index}.srt`;
        const fallbackCode = await ff.exec([
          '-fflags', '+ignidx',
          '-i', tempInFile,
          '-map', `0:${stream.index}`,
          '-c:s', 'srt',
          fallbackOutFile
        ]);
        if (fallbackCode !== 0) {
          throw new Error(`Remote subtitle extraction failed. Exit code ${fallbackCode}`);
        }
        tempOutFile = fallbackOutFile;
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
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
export async function extractHlsAudioSegment(
  videoId: string,
  segmentUrl: string,
  stream: StreamInfo,
  signal?: AbortSignal
): Promise<{ url: string; mimeType: string }> {
  return ffmpegService.lock.run(async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ff = await ffmpegService.ensureLoaded(videoId);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const tempInFile = "segment.ts";
    const { ext, mimeType } = getOutputFormat(stream.codec);
    const tempOutFile = `audio_hls_${stream.index}.${ext}`;

    const response = await fetch(segmentUrl, { signal });
    const buffer = await response.arrayBuffer();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
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
          '-acodec', 'aac',
          '-ac', '2',
          '-ab', '128k',
          tempOutFile
        ];
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const code = await ff.exec(args);
      if (code !== 0) {
        throw new Error(`HLS audio extraction failed. Exit code ${code}`);
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
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
