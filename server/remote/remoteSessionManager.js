import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MediaProbeService } from './mediaProbeService.js';
import { StreamChunkManager } from './streamChunkManager.js';
import { FFmpegWorker } from './ffmpegWorker.js';

export class RemoteSessionManager {
  /**
   * @param {string} baseDataDir - Usually path.join(appDir, '.valor_data')
   */
  constructor(baseDataDir) {
    this.sessionsDir = path.join(baseDataDir, 'hls_sessions');
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    this.sessions = new Map(); // sessionId -> session
    this.chunkManager = new StreamChunkManager();

    // Inactivity cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions(30 * 60 * 1000);
    }, 5 * 60 * 1000);
  }

  /**
   * Creates a new remote playback session.
   * @param {object} params
   * @param {string} params.url
   * @param {object} [params.headers]
   * @param {object} [params.auth]
   * @param {number} [params.selectedAudioIndex=0]
   * @returns {Promise<object>} Session summary for frontend
   */
  async createSession({ url, headers = {}, auth, selectedAudioIndex = 0 }) {
    // 1. Probe the remote media
    const probe = await MediaProbeService.probe(url, { headers, auth });

    // 2. Generate unique sessionId & create session directory
    const sessionId = crypto.randomBytes(8).toString('hex');
    const tempDir = path.join(this.sessionsDir, sessionId);
    fs.mkdirSync(tempDir, { recursive: true });

    let effectiveUrl = url;
    if (auth && auth.username && auth.password) {
      try {
        const u = new URL(url);
        u.username = encodeURIComponent(auth.username);
        u.password = encodeURIComponent(auth.password);
        effectiveUrl = u.toString();
      } catch {}
    }

    const session = {
      id: sessionId,
      url: effectiveUrl,
      headers: probe.headers || headers,
      auth,
      probe,
      tempDir,
      selectedAudioIndex,
      createdAt: Date.now(),
      lastAccessedAt: Date.now()
    };

    this.sessions.set(sessionId, session);

    // 3. Generate HLS playlists (master.m3u8 and media.m3u8)
    this.chunkManager.generatePlaylists(session);

    return {
      sessionId,
      manifestUrl: `/api/remote/session/${sessionId}/master.m3u8`,
      mediaPlaylistUrl: `/api/remote/session/${sessionId}/media.m3u8`,
      duration: probe.duration,
      formatName: probe.formatName,
      videoStreams: probe.videoStreams,
      audioStreams: probe.audioStreams,
      subtitleStreams: probe.subtitleStreams,
      canCopyVideo: probe.canCopyVideo,
      canCopyAudio: probe.canCopyAudio
    };
  }

  /**
   * Gets an existing session by ID, updating lastAccessedAt.
   * @param {string} sessionId
   * @returns {object|null}
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessedAt = Date.now();
      return session;
    }
    return null;
  }

  /**
   * Switches active audio track for a session.
   * @param {string} sessionId
   * @param {number} audioStreamIndex
   * @param {number} currentTimeSeconds
   */
  switchAudioTrack(sessionId, audioStreamIndex, currentTimeSeconds = 0) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    session.selectedAudioIndex = audioStreamIndex;
    this.chunkManager.stopWorker(sessionId);

    // If currentTimeSeconds > 0, warm up the new segment
    const segmentIndex = Math.floor(currentTimeSeconds / 4);
    this.chunkManager.ensureSegment(session, segmentIndex).catch(() => {});
  }

  /**
   * Extracts or retrieves WebVTT subtitle track.
   * @param {string} sessionId
   * @param {number} subtitleStreamIndex
   * @returns {Promise<string>} Path to .vtt file
   */
  async getSubtitleVtt(sessionId, subtitleStreamIndex) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const vttFileName = `sub_${subtitleStreamIndex}.vtt`;
    const vttFilePath = path.join(session.tempDir, vttFileName);

    return await FFmpegWorker.extractSubtitleToVtt({
      url: session.url,
      outputPath: vttFilePath,
      subtitleStreamIndex,
      headers: session.headers
    });
  }

  /**
   * Destroys a session, kills processes, and cleans up files.
   * @param {string} sessionId
   */
  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.chunkManager.stopWorker(sessionId);

    try {
      if (fs.existsSync(session.tempDir)) {
        fs.rmSync(session.tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Cleans up inactive sessions older than maxIdleMs.
   */
  cleanupInactiveSessions(maxIdleMs = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt > maxIdleMs) {
        this.destroySession(id);
      }
    }
  }

  /**
   * Destroys all active sessions on server shutdown.
   */
  destroyAll() {
    clearInterval(this.cleanupTimer);
    for (const id of this.sessions.keys()) {
      this.destroySession(id);
    }
  }
}
