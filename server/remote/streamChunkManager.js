import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { FFmpegWorker } from './ffmpegWorker.js';

export const TARGET_SEGMENT_DURATION = 4; // 4 seconds per segment

export class StreamChunkManager extends EventEmitter {
  constructor() {
    super();
    this.activeWorkers = new Map(); // sessionId -> worker state
  }

  /**
   * Generates the Master and Media HLS playlists for a session.
   * @param {object} session
   */
  generatePlaylists(session) {
    const duration = session.probe.duration || 0;
    const targetDuration = TARGET_SEGMENT_DURATION;
    const totalSegments = Math.max(1, Math.ceil(duration / targetDuration));

    // 1. Generate media playlist (VOD)
    let m3u8Content = '#EXTM3U\n';
    m3u8Content += '#EXT-X-VERSION:3\n';
    m3u8Content += `#EXT-X-TARGETDURATION:${targetDuration}\n`;
    m3u8Content += '#EXT-X-MEDIA-SEQUENCE:0\n';
    m3u8Content += '#EXT-X-PLAYLIST-TYPE:VOD\n';

    for (let i = 0; i < totalSegments; i++) {
      const isLast = i === totalSegments - 1;
      const segDuration = isLast && duration > 0 ? (duration - i * targetDuration) : targetDuration;
      const formattedDuration = Math.max(0.1, segDuration).toFixed(3);
      const segFileName = `seg_${String(i).padStart(5, '0')}.ts`;

      m3u8Content += `#EXTINF:${formattedDuration},\n`;
      m3u8Content += `${segFileName}\n`;
    }

    m3u8Content += '#EXT-X-ENDLIST\n';

    const mediaPlaylistPath = path.join(session.tempDir, 'media.m3u8');
    fs.writeFileSync(mediaPlaylistPath, m3u8Content, 'utf8');

    // 2. Generate master playlist
    let masterContent = '#EXTM3U\n';
    masterContent += '#EXT-X-VERSION:3\n';
    masterContent += '#EXT-X-INDEPENDENT-SEGMENTS\n';

    // List subtitle tracks in master playlist if any
    if (session.probe.subtitleStreams && session.probe.subtitleStreams.length > 0) {
      session.probe.subtitleStreams.forEach((sub, idx) => {
        const lang = sub.language || 'und';
        const name = sub.title || `Subtitle #${idx + 1}`;
        masterContent += `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${name}",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="${lang}",URI="subtitles/${sub.index}.vtt"\n`;
      });
    }

    const subAttr = session.probe.subtitleStreams?.length > 0 ? ',SUBTITLES="subs"' : '';
    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=5000000${subAttr}\n`;
    masterContent += 'media.m3u8\n';

    const masterPlaylistPath = path.join(session.tempDir, 'master.m3u8');
    fs.writeFileSync(masterPlaylistPath, masterContent, 'utf8');
  }

  /**
   * Ensures that the requested segment exists on disk and is ready for streaming.
   * If not already cached, triggers FFmpeg to generate it.
   * @param {object} session
   * @param {number} segmentIndex
   * @returns {Promise<string>} Path to the ready .ts file
   */
  async ensureSegment(session, segmentIndex) {
    const segFileName = `seg_${String(segmentIndex).padStart(5, '0')}.ts`;
    const segFilePath = path.join(session.tempDir, segFileName);

    // If segment already exists and has size > 0
    if (fs.existsSync(segFilePath)) {
      try {
        const stat = fs.statSync(segFilePath);
        if (stat.size > 0) {
          this._cleanOldSegments(session, segmentIndex);
          return segFilePath;
        }
      } catch {
        // file might be in middle of write, proceed to await
      }
    }

    let workerState = this.activeWorkers.get(session.id);

    // Determine if existing worker can deliver this segment or if we need to seek
    const needNewWorker =
      !workerState ||
      !workerState.worker ||
      segmentIndex < workerState.startSegmentIndex ||
      segmentIndex > workerState.lastObservedSegment + 12;

    if (needNewWorker) {
      if (workerState && workerState.worker) {
        workerState.worker.kill();
      }

      const seekSeconds = segmentIndex * TARGET_SEGMENT_DURATION;
      const primaryAudio = session.probe.audioStreams?.find(s => s.index === session.selectedAudioIndex) || session.probe.audioStreams?.[session.selectedAudioIndex] || session.probe.audioStreams?.[0];
      const audioStreamIndex = primaryAudio ? primaryAudio.index : (typeof session.selectedAudioIndex === 'number' ? session.selectedAudioIndex : null);

      workerState = {
        startSegmentIndex: segmentIndex,
        lastObservedSegment: segmentIndex,
        worker: null
      };
      this.activeWorkers.set(session.id, workerState);

      const worker = FFmpegWorker.startHlsWorker({
        url: session.url,
        tempDir: session.tempDir,
        startSegmentIndex: segmentIndex,
        seekTimeSeconds: seekSeconds,
        audioStreamIndex,
        canCopyVideo: session.probe.canCopyVideo,
        canCopyAudio: session.probe.canCopyAudio,
        headers: session.headers,
        onSegmentGenerated: () => {
          this.emit(`segment_${session.id}`);
        },
        onError: (err) => {
          this.emit(`error_${session.id}`, err);
        }
      });

      workerState.worker = worker;
    }

    // Wait for the segment file to appear and have size > 0
    await this._waitForFile(session.id, segFilePath, 15000);
    this._cleanOldSegments(session, segmentIndex);
    return segFilePath;
  }

  /**
   * Waits for a file to exist with size > 0.
   */
  _waitForFile(sessionId, filePath, timeoutMs) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        if (fs.existsSync(filePath)) {
          try {
            const stat = fs.statSync(filePath);
            if (stat.size > 0) {
              return resolve();
            }
          } catch {
            // Stat failed during write, continue checking
          }
        }

        if (Date.now() - startTime >= timeoutMs) {
          return reject(new Error(`StreamChunkManager: Timeout waiting for segment ${path.basename(filePath)}`));
        }

        setTimeout(check, 80);
      };

      check();
    });
  }

  /**
   * Deletes cached segments that are far behind current playback position to save disk space.
   */
  _cleanOldSegments(session, currentSegmentIndex) {
    try {
      const files = fs.readdirSync(session.tempDir);
      for (const file of files) {
        if (file.startsWith('seg_') && file.endsWith('.ts')) {
          const numStr = file.replace('seg_', '').replace('.ts', '');
          const idx = parseInt(numStr, 10);
          if (!isNaN(idx) && idx < currentSegmentIndex - 40) {
            try {
              fs.unlinkSync(path.join(session.tempDir, file));
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Stops active worker for a session.
   * @param {string} sessionId
   */
  stopWorker(sessionId) {
    const workerState = this.activeWorkers.get(sessionId);
    if (workerState && workerState.worker) {
      workerState.worker.kill();
      this.activeWorkers.delete(sessionId);
    }
  }
}
