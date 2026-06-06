import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

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

class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private isLoading = false;
  private isLoaded = false;
  private progressCallback: ((progress: number) => void) | null = null;
  private logCallback: ((log: string) => void) | null = null;

  async load(onProgress?: (progress: number) => void): Promise<FFmpeg> {
    if (this.isLoaded && this.ffmpeg) return this.ffmpeg;
    if (this.isLoading) {
      // Wait for it to load
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.isLoaded && this.ffmpeg) {
            clearInterval(check);
            resolve(this.ffmpeg);
          }
        }, 100);
      });
    }

    this.isLoading = true;
    this.ffmpeg = new FFmpeg();

    if (onProgress) {
      this.progressCallback = onProgress;
    }

    this.ffmpeg.on('progress', ({ progress }) => {
      // progress is a float between 0 and 1
      if (this.progressCallback) {
        this.progressCallback(Math.round(progress * 100));
      }
    });

    this.ffmpeg.on('log', ({ message }) => {
      if (this.logCallback) {
        this.logCallback(message);
      }
      console.log('FFmpeg:', message);
    });

    try {
      await this.ffmpeg.load({
        coreURL: `${window.location.origin}/ffmpeg-core.js`,
        wasmURL: `${window.location.origin}/ffmpeg-core.wasm`,
      });
      this.isLoaded = true;
      this.isLoading = false;
      return this.ffmpeg;
    } catch (error) {
      this.isLoading = false;
      console.error('Failed to load FFmpeg.wasm', error);
      throw error;
    }
  }

  setLogCallback(callback: ((log: string) => void) | null) {
    this.logCallback = callback;
  }

  setProgressCallback(callback: ((progress: number) => void) | null) {
    this.progressCallback = callback;
  }

  isReady(): boolean {
    return this.isLoaded;
  }

  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
  }

  /**
   * Probe a local file to inspect its streams (video, audio, subtitles)
   */
  async probeFile(file: File): Promise<ProbeResult> {
    const ffmpeg = await this.load();
    const ext = this.getExtension(file.name);
    const tempInFile = `input${ext}`;

    // Write file to virtual FS
    await ffmpeg.writeFile(tempInFile, await fetchFile(file));

    const logs: string[] = [];
    const collectLog = (msg: string) => {
      logs.push(msg);
    };

    const previousLogCallback = this.logCallback;
    this.setLogCallback(collectLog);

    try {
      // Run copy to null command. It runs successfully (exit code 0) and dumps all streams/metadata logs.
      await ffmpeg.exec(['-i', tempInFile, '-c', 'copy', '-f', 'null', '-']);
    } catch (err) {
      console.warn('Probe exec finished with warning:', err);
    } finally {
      // Restore log callback
      this.setLogCallback(previousLogCallback);
      // Clean up the input file to free memory
      try {
        await ffmpeg.deleteFile(tempInFile);
      } catch (e) {
        // ignore
      }
    }

    const fullLog = logs.join('\n');
    return this.parseProbeLogs(fullLog);
  }

  private parseProbeLogs(logText: string): ProbeResult {
    const streams: MediaStream[] = [];
    let duration = 'Unknown';
    let format = 'Unknown';

    // Extract duration
    const durationRegex = /Duration:\s*(\d{2}:\d{2}:\d{2}\.\d{2})/;
    const durationMatch = logText.match(durationRegex);
    if (durationMatch) {
      duration = durationMatch[1];
    }

    // Extract format
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

      // Extract stream index (e.g. Stream #0:1 or Stream #0:2)
      const indexMatch = line.match(/Stream #\d+:(\d+)/);
      if (!indexMatch) continue;
      const index = parseInt(indexMatch[1], 10);

      // Detect type
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

      // Extract language (optional): e.g. (eng)
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

      // Extract details
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
   * Extract a subtitle track as WebVTT or SRT
   */
  async extractSubtitle(file: File, streamIndex: number): Promise<{ url: string; filename: string; format: 'vtt' | 'srt' }> {
    const ffmpeg = await this.load();
    const ext = this.getExtension(file.name);
    const tempInFile = `input${ext}`;
    const tempOutFile = 'subtitles.srt'; // Extract as SRT, we will parse or convert in JS

    await ffmpeg.writeFile(tempInFile, await fetchFile(file));

    try {
      // ffmpeg -i input.mkv -map 0:s:index -c:s copy output.srt
      // Or if subtitle is ASS, we can copy it, but srt is widely supported by our parser.
      // Wait, let's map stream by its absolute stream index (0:streamIndex)
      await ffmpeg.exec([
        '-i', tempInFile,
        '-map', `0:${streamIndex}`,
        '-c:s', 'srt', // Transcode to SRT
        tempOutFile
      ]);

      const data = await ffmpeg.readFile(tempOutFile);
      const blob = new Blob([data as any], { type: 'text/srt' });
      const url = URL.createObjectURL(blob);

      return {
        url,
        filename: `${file.name.replace(/\.[^/.]+$/, '')}.stream_${streamIndex}.srt`,
        format: 'srt'
      };
    } catch (error) {
      console.warn('Text conversion failed, attempting raw copy...');
      // Try again with copying codec directly
      try {
        const copyOutFile = 'subtitles_copy.srt';
        await ffmpeg.exec([
          '-i', tempInFile,
          '-map', `0:${streamIndex}`,
          '-c:s', 'copy',
          copyOutFile
        ]);
        const data = await ffmpeg.readFile(copyOutFile);
        const blob = new Blob([data as any], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        return {
          url,
          filename: `${file.name.replace(/\.[^/.]+$/, '')}.stream_${streamIndex}.srt`,
          format: 'srt'
        };
      } catch (e) {
        console.error('Failed to extract subtitle track', e);
        throw new Error('Subtitle extraction failed. The format may not be supported for direct extraction.');
      }
    } finally {
      // Clean up
      try {
        await ffmpeg.deleteFile(tempInFile);
        await ffmpeg.deleteFile(tempOutFile);
        await ffmpeg.deleteFile('subtitles_copy.srt');
      } catch (e) {}
    }
  }

  /**
   * Extract audio track (and optionally transcode to AAC for browser playability)
   */
  async extractAudio(
    file: File,
    streamIndex: number,
    transcode = true,
    onProgress?: (p: number) => void
  ): Promise<{ url: string; filename: string; mimeType: string }> {
    const ffmpeg = await this.load();
    const ext = this.getExtension(file.name);
    const tempInFile = `input${ext}`;
    
    // Choose output format and codec based on transcoding option
    const tempOutFile = transcode ? 'audio.mp3' : 'audio_extracted.bin';
    const mimeType = transcode ? 'audio/mp3' : 'audio/octet-stream';
    const outExt = transcode ? 'mp3' : 'bin';

    if (onProgress) {
      this.setProgressCallback(onProgress);
    }

    await ffmpeg.writeFile(tempInFile, await fetchFile(file));

    try {
      let args: string[];
      if (transcode) {
        // Transcode to MP3 (widely supported)
        args = [
          '-i', tempInFile,
          '-map', `0:${streamIndex}`,
          '-vn',
          '-acodec', 'libmp3lame',
          '-ab', '192k',
          tempOutFile
        ];
      } else {
        // Demux and copy audio stream without transcoding (very fast!)
        args = [
          '-i', tempInFile,
          '-map', `0:${streamIndex}`,
          '-vn',
          '-acodec', 'copy',
          tempOutFile
        ];
      }

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(tempOutFile);
      const blob = new Blob([data as any], { type: mimeType });
      const url = URL.createObjectURL(blob);

      return {
        url,
        filename: `${file.name.replace(/\.[^/.]+$/, '')}.stream_${streamIndex}.${outExt}`,
        mimeType
      };
    } catch (error) {
      console.error('Audio extraction failed', error);
      throw error;
    } finally {
      this.setProgressCallback(null);
      // Clean up
      try {
        await ffmpeg.deleteFile(tempInFile);
        await ffmpeg.deleteFile(tempOutFile);
      } catch (e) {}
    }
  }

  /**
   * Remux / Transcode unsupported video container (like MKV) into MP4
   */
  async remuxVideo(
    file: File,
    options: { transcodeAudio: boolean },
    onProgress?: (p: number) => void
  ): Promise<{ url: string; filename: string }> {
    const ffmpeg = await this.load();
    const ext = this.getExtension(file.name);
    const tempInFile = `input${ext}`;
    const tempOutFile = 'output.mp4';

    if (onProgress) {
      this.setProgressCallback(onProgress);
    }

    await ffmpeg.writeFile(tempInFile, await fetchFile(file));

    try {
      let args: string[];
      if (options.transcodeAudio) {
        // Copy video, transcode audio to AAC (very fast compared to video transcoding)
        args = [
          '-i', tempInFile,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-strict', 'experimental',
          tempOutFile
        ];
      } else {
        // Copy both video and audio (instant, but might not play if audio codec is incompatible)
        args = [
          '-i', tempInFile,
          '-c', 'copy',
          tempOutFile
        ];
      }

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(tempOutFile);
      const blob = new Blob([data as any], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      return {
        url,
        filename: `${file.name.replace(/\.[^/.]+$/, '')}_playable.mp4`
      };
    } catch (error) {
      console.error('Video remuxing failed', error);
      throw error;
    } finally {
      this.setProgressCallback(null);
      try {
        await ffmpeg.deleteFile(tempInFile);
        await ffmpeg.deleteFile(tempOutFile);
      } catch (e) {}
    }
  }
}

export const ffmpegService = new FFmpegService();
