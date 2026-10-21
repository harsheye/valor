import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const ffmpegPath = ffmpegInstaller.path;

export class FFmpegWorker {
  /**
   * Spawns an FFmpeg worker to produce HLS segments starting at a given segment index / timestamp.
   * @param {object} params
   * @param {string} params.url
   * @param {string} params.tempDir
   * @param {number} params.startSegmentIndex
   * @param {number} params.seekTimeSeconds
   * @param {number} params.audioStreamIndex
   * @param {boolean} params.canCopyVideo
   * @param {boolean} params.canCopyAudio
   * @param {object} [params.headers]
   * @param {function} [params.onSegmentGenerated]
   * @param {function} [params.onError]
   * @returns {{ process: import('child_process').ChildProcess, kill: () => void }}
   */
  static startHlsWorker({
    url,
    tempDir,
    startSegmentIndex,
    seekTimeSeconds,
    audioStreamIndex,
    canCopyVideo,
    canCopyAudio,
    headers = {},
    onSegmentGenerated,
    onError
  }) {
    const headerLines = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n') + '\r\n';

    const segmentPattern = path.join(tempDir, 'seg_%05d.ts').replace(/\\/g, '/');
    const workerPlaylist = path.join(tempDir, 'worker.m3u8').replace(/\\/g, '/');

    const args = [
      '-y',
      '-headers', headerLines,
    ];

    if (seekTimeSeconds > 0) {
      args.push('-ss', seekTimeSeconds.toFixed(3));
    }

    args.push('-i', url);

    // Map primary video
    args.push('-map', '0:v:0');

    // Map audio if available
    if (audioStreamIndex !== null && audioStreamIndex !== undefined) {
      args.push('-map', `0:${audioStreamIndex}`);
    }

    // Video codec
    if (canCopyVideo) {
      args.push('-c:v', 'copy');
    } else {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22');
    }

    // Audio codec
    if (canCopyAudio) {
      args.push('-c:a', 'copy');
    } else if (audioStreamIndex !== null && audioStreamIndex !== undefined) {
      args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
    }

    args.push(
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_segment_type', 'mpegts',
      '-hls_flags', 'independent_segments',
      '-start_number', String(startSegmentIndex),
      '-hls_segment_filename', segmentPattern,
      workerPlaylist
    );

    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', chunk => {
      const msg = chunk.toString();
      stderr += msg;
      // Detect written segments from FFmpeg output
      if (msg.includes('Opening') && msg.includes('.ts') && onSegmentGenerated) {
        onSegmentGenerated();
      }
    });

    child.on('close', code => {
      if (code !== 0 && code !== null && !child.killed) {
        if (onError) onError(new Error(`FFmpegWorker exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    return {
      process: child,
      kill: () => {
        try {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        } catch {
          // ignore
        }
      }
    };
  }

  /**
   * Extracts an embedded subtitle track to WebVTT format.
   * @param {object} params
   * @param {string} params.url
   * @param {string} params.outputPath
   * @param {number} params.subtitleStreamIndex
   * @param {object} [params.headers]
   * @returns {Promise<string>}
   */
  static async extractSubtitleToVtt({ url, outputPath, subtitleStreamIndex, headers = {} }) {
    if (fs.existsSync(outputPath)) {
      return outputPath;
    }

    const headerLines = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n') + '\r\n';

    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-headers', headerLines,
        '-i', url,
        '-map', `0:${subtitleStreamIndex}`,
        '-c:s', 'webvtt',
        '-f', 'webvtt',
        outputPath
      ];

      const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      child.stderr.on('data', d => { stderr += d; });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Subtitle extraction timed out'));
      }, 30000);

      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`Subtitle extraction failed with code ${code}: ${stderr.slice(-300)}`));
        }
      });
    });
  }
}
