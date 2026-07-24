import { FFmpeg } from '@ffmpeg/ffmpeg';
import { FFmpegManager } from '../ffmpeg/FFmpegManager';
import { DemuxManager } from '../ffmpeg/DemuxManager';
import { PacketReader } from '../packet/PacketReader';
import { BufferManager } from '../buffer/BufferManager';
import { BufferScheduler } from '../scheduler/BufferScheduler';
import { ChunkManifest } from '../scheduler/ChunkManifest';
import { AudioScheduler } from '../scheduler/AudioScheduler';
import { PlaybackQueue } from '../scheduler/PlaybackQueue';
import { PlaybackState } from './PlaybackState';
import { PlaybackSession } from './PlaybackSession';
import { Timeline } from './Timeline';
import { logger } from '../../utils/logger';

const getAudioBoostMultiplier = (boostPercent: number): number => {
  if (boostPercent <= 100) return 1.0;
  if (boostPercent <= 150) {
    return 1.0 + (boostPercent - 100) * 0.04;
  }
  if (boostPercent <= 200) {
    return 3.0 + (boostPercent - 150) * 0.02;
  }
  return 1.0;
};

// Concurrency Worker pool limiter helper
async function runWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: Promise<T>[] = [];
  const executing: Promise<any>[] = [];
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    if (limit <= tasks.length) {
      const e: Promise<any> = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

// A controller owns one FFmpeg.wasm worker. Concurrent ff.exec calls do not
// decode concurrently: they queue inside that worker, inflate the reported
// extraction time, and let audio fall behind the video. Keep requests ordered
// at the scheduler boundary instead.
const FFMPEG_DECODE_CONCURRENCY = 2;
const FFMPEG_WORKER_COUNT = 2;

export class PlaybackController {
  private audioCtx: AudioContext;
  private videoEl: HTMLVideoElement | null = null;
  private packetReader: PacketReader;
  private bufferManager: BufferManager;
  private scheduler: BufferScheduler;
  private ff: FFmpeg | null = null;

  private audioScheduler: AudioScheduler;
  private playbackQueue: PlaybackQueue;
  private fetchingKeys = new Set<number>();
  private reservedTargets = new Set<number>();
  private decodeWorkers: { ff: FFmpeg; manager: FFmpegManager; demux: DemuxManager; reader: PacketReader }[] = [];
  private workerTails = new Map<FFmpeg, Promise<void>>();

  private manifest = new ChunkManifest();
  private listenersBound = false;
  private onBufferingChange: ((buffering: boolean) => void) | null = null;
  private gainNode: GainNode;
  private audioBoost = 100;
  // The first play after initialize must keep the generation that fetched the
  // warm-up chunk. Creating another generation here aborts useful work and can
  // launch the same FFmpeg extraction twice.
  private initializedGeneration: number | null = null;
  private lastSchedulerRunTime = 0;

  public state = new PlaybackState();
  public session = new PlaybackSession();
  public timeline: Timeline;

  constructor(
    private ffmpegMgr: FFmpegManager,
    private demuxMgr: DemuxManager,
    seekMap?: any[]
  ) {
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.packetReader = new PacketReader(this.demuxMgr, this.audioCtx);
    this.bufferManager = new BufferManager(this.packetReader, (buffering) => {
      logger.buffer(`controller=${this.session.instanceId} transport buffering=${buffering}`);
      this.state.isBuffering = buffering;
      if (this.onBufferingChange) {
        this.onBufferingChange(buffering);
      }
    });
    this.scheduler = new BufferScheduler(this.bufferManager.getCache(), this.manifest);
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);

    this.audioScheduler = new AudioScheduler(this.audioCtx, this.gainNode);
    this.playbackQueue = new PlaybackQueue(this.bufferManager.getCache(), this.audioScheduler, this.manifest);
    this.timeline = new Timeline(seekMap);
    
    logger.playback(`controller=${this.session.instanceId} created`);
  }

  get instanceId(): string {
    return this.session.instanceId;
  }

  getBufferManager(): BufferManager {
    return this.bufferManager;
  }

  getFFmpeg(): FFmpeg | null {
    return this.ff;
  }

  getCurrentTime(): number {
    const playhead = this.audioScheduler?.getCurrentPlayhead();
    if (playhead !== null && playhead !== undefined) return playhead;
    return this.videoEl ? this.videoEl.currentTime : 0;
  }

  async initialize(videoEl: HTMLVideoElement, streamIndex: number | null): Promise<void> {
    this.videoEl = videoEl;
    this.videoEl.muted = true; // Mute video element - audio is played via AudioContext
    this.state.activeStreamIndex = typeof streamIndex === 'number' ? streamIndex : -1;
    this.bufferManager.resetFailures();
    
    // 1. Setup new playback generation to initialize abort signals and sessionId correctly
    const generation = this.startNewPlaybackGeneration('initialize');
    logger.playback(`controller=${this.instanceId} initializing audio track ${this.state.activeStreamIndex}`);

    this.ff = await this.ffmpegMgr.load();
    if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) {
      console.log(`[PlaybackController-${this.instanceId}] Init aborted during ffmpeg load.`);
      return;
    }

      await this.demuxMgr.getMountedInputPath(this.ff);
    if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) {
      console.log(`[PlaybackController-${this.instanceId}] Init aborted during demux mount.`);
      return;
    }

    this.decodeWorkers = [{ ff: this.ff, manager: this.ffmpegMgr, demux: this.demuxMgr, reader: this.packetReader }];
    // Each FFmpeg.wasm instance has one execution lane. A second worker gives
    // look-ahead real parallelism instead of queuing commands inside one worker.
    for (let index = 1; index < FFMPEG_WORKER_COUNT; index++) {
      try {
        const manager = this.ffmpegMgr.createSibling();
        const ff = await manager.load();
        const demux = this.demuxMgr.createSibling(manager);
        await demux.getMountedInputPath(ff);
        this.decodeWorkers.push({ ff, manager, demux, reader: new PacketReader(demux, this.audioCtx) });
        logger.scheduler(`decode worker ${index + 1}/${FFMPEG_WORKER_COUNT} ready`);
      } catch (err) {
        logger.warn(`Unable to start extra decode worker; continuing with ${this.decodeWorkers.length}:`, err);
      }
    }

    // Bind event listeners only if we are still active
    if (!this.session.abortController.signal.aborted && generation === this.session.playbackGeneration) {
      this.videoEl.addEventListener('timeupdate', this.onTimeUpdate);
      this.videoEl.addEventListener('play', this.onPlayEvent);
      this.videoEl.addEventListener('pause', this.onPauseEvent);
      this.listenersBound = true;
      logger.playback(`controller=${this.instanceId} video listeners ready`);

      const resumeTime = this.videoEl.currentTime;
      const startChunk = Math.floor(resumeTime / 10) * 10;
      const chunkId = `audio_${this.state.activeStreamIndex}_${startChunk}`;
      logger.playback(`controller=${this.instanceId} ready at ${resumeTime.toFixed(3)}s; first audio ${chunkId}`);

      // Warm only the first playable chunk before play begins. The remaining
      // window starts after playback, avoiding an expensive abandoned 50s fill
      // if the user immediately presses play or seeks.
      logger.buffer(`warm-up: first playable chunk ${startChunk}s for ${resumeTime.toFixed(3)}s`);
      try {
        await this.fillBufferWindow(resumeTime, 'initialize-first-chunk', generation, true, true);
      } catch (err) {
        console.warn(`[PlaybackController-${this.instanceId}] Initial audio warm-up failed:`, err);
        return;
      }
      if (generation !== this.session.playbackGeneration || this.session.abortController.signal.aborted) return;

      this.hydrateManifestFromCache();
      this.initializedGeneration = generation;
      logger.buffer(`warm-up complete; first playable audio is cached`);
    }
  }

  setBufferingCallback(cb: (buffering: boolean) => void): void {
    logger.playback(`controller=${this.instanceId} buffering callback registered`);
    this.onBufferingChange = cb;
    this.bufferManager.setBufferingCallback((bmBuffering) => {
      this.state.isBuffering = bmBuffering;
      if (!this.videoEl) {
        cb(bmBuffering);
        return;
      }
      // Fetching a future chunk must not show the spinner while the currently
      // playing audio is still covered. The old high-water mark check made the
      // spinner pulse throughout normal background prefetching.
      const currentTime = this.videoEl.currentTime;
      const hasPlayableAudio = this.bufferManager.getCache().hasCoverage(currentTime, currentTime + 0.1);
      const needsBuffering = bmBuffering && !hasPlayableAudio;
      cb(needsBuffering);
    });
  }

  private startHeartbeat(): void {
    if (this.session.heartbeatIntervalId) return;
    logger.scheduler(`controller=${this.instanceId} heartbeat started (1s safety net)`);
    this.session.heartbeatIntervalId = setInterval(() => {
      this.runSchedulerCycle('heartbeat');
    }, 1000);
  }

  private getDecodeWorker(target: number) {
    return this.decodeWorkers[Math.floor(target / 10) % this.decodeWorkers.length];
  }

  private enqueueWorkerDecode<T>(worker: { ff: FFmpeg }, work: () => Promise<T>): Promise<T> {
    const tail = this.workerTails.get(worker.ff) || Promise.resolve();
    const next = tail.then(work, work);
    this.workerTails.set(worker.ff, next.then(() => undefined, () => undefined));
    return next;
  }

  private stopHeartbeat(): void {
    if (this.session.heartbeatIntervalId) {
      logger.scheduler(`controller=${this.instanceId} heartbeat stopped`);
      clearInterval(this.session.heartbeatIntervalId);
      this.session.heartbeatIntervalId = null;
    }
  }

  private onTimeUpdate = () => {
    this.runSchedulerCycle('timeupdate');
  };

  private onPlayEvent = () => {
    console.log(`[PlaybackController-${this.instanceId}] Native play event detected.`);
    this.play().catch(console.error);
  };

  private onPauseEvent = () => {
    console.log(`[PlaybackController-${this.instanceId}] Native pause event detected.`);
    this.pause();
  };

  private heartbeatTickCount = 0;

  private startNewPlaybackGeneration(reason: string): number {
    const generation = this.session.startNewGeneration(reason);
    this.initializedGeneration = null;
    this.fetchingKeys.clear();
    this.reservedTargets.clear();
    this.bufferManager.clearActiveFills();
    return generation;
  }

  private resetQueueAndTimeline(): void {
    this.playbackQueue.clear();
    this.manifest.clear();
    this.scheduler.reset();
  }

  beginSeekTransaction(reason = 'external'): number {
    this.session.maintenanceFrozen = true;
    this.stopHeartbeat();
    console.log(`[PlaybackController-${this.instanceId}] Seek transaction started (${reason}).`);
    return this.session.playbackGeneration;
  }

  endSeekTransaction(reason = 'external'): void {
    this.session.maintenanceFrozen = false;
    console.log(`[PlaybackController-${this.instanceId}] Seek transaction ended (${reason}).`);
  }

  private hydrateManifestFromCache(): void {
    for (const packet of this.bufferManager.getCache().getAllPackets()) {
      const chunkKey = Math.floor(packet.startTime / 10) * 10;
      const state = this.manifest.getState(chunkKey);
      if (state === 'EMPTY') {
        this.manifest.transitionTo(chunkKey, 'FETCHING');
        this.manifest.transitionTo(chunkKey, 'DECODED');
      } else if (state === 'FETCHING') {
        this.manifest.transitionTo(chunkKey, 'DECODED');
      }
      if (this.manifest.getState(chunkKey) !== 'CACHED') {
        this.manifest.transitionTo(chunkKey, 'CACHED');
      }
    }
  }

  private runSchedulerCycle(callerName: string): void {
    if (this.session.abortController.signal.aborted) return;
    if (this.session.maintenanceFrozen) return;
    if (!this.videoEl) return;

    const now = Date.now();
    if (callerName === 'timeupdate') {
      if (now - this.lastSchedulerRunTime < 1000) {
        return;
      }
    }
    this.lastSchedulerRunTime = now;

    const currentTime = this.videoEl.currentTime;

    // Evict old cache items and keep manifest state in sync
    const cachedKeysBefore = new Set(this.bufferManager.getCache().getEntries().map(e => e.chunkKey));
    this.bufferManager.getCache().evict(currentTime);
    const cachedKeysAfter = new Set(this.bufferManager.getCache().getEntries().map(e => e.chunkKey));

    for (const key of cachedKeysBefore) {
      if (!cachedKeysAfter.has(key)) {
        const state = this.manifest.getState(key);
        if (state === 'CACHED' || state === 'QUEUED' || state === 'PLAYING' || state === 'PLAYED') {
          this.manifest.transitionTo(key, 'EMPTY');
        }
      }
    }

    if (this.videoEl.paused) return;

    // Drift detection & correction loop
    const audioPlayhead = this.audioScheduler.getCurrentPlayhead();
    if (this.timeline.checkDrift(currentTime, audioPlayhead)) {
      console.warn(`[PlaybackController-${this.instanceId}] Audio-Video sync drift detected: Video=${currentTime.toFixed(3)}s, Audio=${audioPlayhead?.toFixed(3)}s. Re-syncing scheduler...`);
      this.audioScheduler.stopAll();
      this.playbackQueue.clear();
      this.hydrateManifestFromCache();
    }

    // Update queue to schedule cached chunks and prune completed
    this.playbackQueue.update(currentTime, this.state.playbackRate);

    if (callerName === 'heartbeat') {
      this.heartbeatTickCount++;
      if (this.heartbeatTickCount % 20 === 0) {
        const bufferedRanges = this.bufferManager.getCache().getAllPackets()
          .map(p => `${p.startTime}-${p.endTime.toFixed(1)}`).join(', ');
        console.log(`[PlaybackController-${this.instanceId}] Video Time: ${currentTime.toFixed(2)}, AudioContext Time: ${this.audioCtx.currentTime.toFixed(2)}, Queue Size: ${this.playbackQueue.getQueueSize()}, Buffered: [${bufferedRanges || 'none'}]`);
      }
    }

    // Check if buffering is needed
    this.fillBufferWindow(currentTime, callerName).catch(console.error);
  }

  private async fillBufferWindow(
    currentTime: number,
    callerName = 'unknown',
    generation = this.session.playbackGeneration,
    showCurrentBuffering = false,
    currentChunkOnly = false
  ): Promise<void> {
    if (!this.ff) return;
    if (this.state.activeStreamIndex === -1 || this.state.activeStreamIndex === null || typeof this.state.activeStreamIndex !== 'number') return;
    if (generation !== this.session.playbackGeneration) return;
    if (this.session.maintenanceFrozen && callerName !== 'seek' && callerName !== 'playSyncedFromCurrentTime' && callerName !== 'play' && callerName !== 'switchAudioTrack') return;

    const signal = this.session.chunkAbortController.signal;
    const currentChunk = Math.floor(currentTime / 10) * 10;

    // If scheduler says we don't need to buffer, skip
    if (!this.scheduler.shouldBuffer(currentTime)) return;

    const missing = this.scheduler.getMissingTargets(currentTime);
    if (missing.length === 0) return;

    // PROXIMITY SORTING: nearest chunks to current playback time have highest priority
    missing.sort((a, b) => Math.abs(a - currentTime) - Math.abs(b - currentTime));

    const chunkSize = 10;
    const activeSession = this.session.sessionId;
    if (!currentChunkOnly && this.reservedTargets.size > 0) return;
    const targets = (currentChunkOnly ? missing.filter(target => target === currentChunk) : missing)
      .filter((target) => {
        const key = `audio_${this.state.activeStreamIndex}_${target}`;
        const targetHasCoverage = this.bufferManager.getCache().hasCoverage(Math.max(target, currentTime), target + chunkSize);
        const state = this.manifest.getState(target);
        const isCachedState = state === 'CACHED' || state === 'QUEUED' || state === 'PLAYING' || state === 'PLAYED';
        
        return !this.fetchingKeys.has(target)
          && !this.bufferManager.getCache().hasChunk(target)
          && !isCachedState
          && !(targetHasCoverage && this.playbackQueue.hasScheduled(target))
          && !this.bufferManager.isFailedOrInCooldown(key);
      });
    if (targets.length === 0) return;

    // Reserve every target before the first decode begins. Without this, a
    // one-worker decode lane only marks its active item as fetching and every
    // timeupdate keeps rediscovering the queued look-ahead chunks.
    for (const target of targets) {
      this.fetchingKeys.add(target);
      this.reservedTargets.add(target);
      if (this.manifest.getState(target) === 'EMPTY') {
        this.manifest.transitionTo(target, 'RESERVED');
      }
    }
    logger.scheduler(`${callerName}: reserved audio chunks [${targets.join(', ')}]`);

    // One decode lane per FFmpeg.wasm instance. Look-ahead is still preserved
    // by the ordered target list, without creating an internal worker backlog.
    const tasks = targets.map((target) => async () => {
      // Discard immediately if the media session is obsolete
      if (this.session.sessionId !== activeSession || this.session.abortController.signal.aborted) {
        this.fetchingKeys.delete(target);
        this.reservedTargets.delete(target);
        if (this.manifest.getState(target) === 'RESERVED') this.manifest.transitionTo(target, 'EMPTY');
        return;
      }

      const key = `audio_${this.state.activeStreamIndex}_${target}`;
      const targetHasCoverage = this.bufferManager.getCache().hasCoverage(
        Math.max(target, currentTime),
        target + chunkSize
      );
      const targetHasChunk = this.bufferManager.getCache().hasChunk(target);
      
      // Deduplicate if already scheduled/fetching or failed
      if (
        targetHasChunk ||
        (targetHasCoverage && this.playbackQueue.hasScheduled(target)) ||
        this.bufferManager.isFailedOrInCooldown(key)
      ) {
        this.fetchingKeys.delete(target);
        this.reservedTargets.delete(target);
        if (this.manifest.getState(target) === 'RESERVED') this.manifest.transitionTo(target, 'EMPTY');
        return;
      }

      const currentState = this.manifest.getState(target);
      if (!targetHasCoverage && !targetHasChunk && currentState !== 'EMPTY' && currentState !== 'FETCHING') {
        this.manifest.transitionTo(target, 'EMPTY');
      }
      if (this.manifest.getState(target) !== 'FETCHING') {
        this.manifest.transitionTo(target, 'FETCHING');
      }

      try {
        const requestStart = target === currentChunk ? Math.max(currentTime, target) : target;
        const requestDuration = Math.max(0.25, target + chunkSize - requestStart);
        logger.buffer(`chunk ${target}s -> ${requestStart.toFixed(3)}s + ${requestDuration.toFixed(3)}s`);
        const worker = this.getDecodeWorker(target);
        const packet = await this.enqueueWorkerDecode(worker, () => this.bufferManager.getOrFetchPacket(
          worker.ff,
          this.state.activeStreamIndex,
          requestStart,
          requestDuration,
          this.timeline.seekMap,
          signal,
          showCurrentBuffering && target === currentChunk,
          target,
          worker.reader
        ));

        // Discard result if session changed during async await
        if (this.session.sessionId !== activeSession || this.session.abortController.signal.aborted) {
          console.log(`[PlaybackController-${this.instanceId}] Discarding fetched chunk ${target}s due to session ID change.`);
          return;
        }

        // A current chunk can legitimately be short when playback starts inside that chunk.
        if (packet.duration <= 0.05) {
          throw new Error(`Chunk ${target}s is truncated/too short: duration=${packet.duration}s`);
        }

        this.manifest.transitionTo(target, 'DECODED');
        this.manifest.transitionTo(target, 'CACHED');

        // Immediately schedule newly fetched packet if playhead is still relevant and we are not in a seek/maintenance transaction
        if (this.videoEl && !this.videoEl.paused && !this.session.maintenanceFrozen) {
          this.playbackQueue.update(this.videoEl.currentTime, this.state.playbackRate);
        }
      } catch (err: any) {
        console.warn(`[PlaybackController-${this.instanceId}] Buffering chunk ${target} failed: ${err?.message || err}`);
        
        this.manifest.transitionTo(target, 'FAILED');
        this.manifest.transitionTo(target, 'COOLDOWN');

        // Self-healing: Reset to EMPTY after 8 seconds cooldown
        const targetSession = this.session.sessionId;
        setTimeout(() => {
          if (this.session.sessionId === targetSession && this.manifest.getState(target) === 'COOLDOWN') {
            this.manifest.transitionTo(target, 'EMPTY');
          }
        }, 8000);

        this.playbackQueue.clear(); // Safe state cleanup on failure
      } finally {
        this.fetchingKeys.delete(target);
        this.reservedTargets.delete(target);
      }
    });

    await runWithLimit(tasks, FFMPEG_DECODE_CONCURRENCY);
  }

  async play(): Promise<void> {
    if (this.session.abortController.signal.aborted) return;
    if (!this.videoEl) return;
    if (this.session.isTransitioningState) return;
    this.session.isTransitioningState = true;
    this.state.isPlaying = true;

    try {
      console.log(`[PlaybackController-${this.instanceId}] Playback State: PLAYING`);
      // Initialization has already fetched the playhead chunk. Preserve that
      // generation for the first play so its request is not aborted/repeated.
      const generation = this.initializedGeneration === this.session.playbackGeneration
        ? this.session.playbackGeneration
        : this.startNewPlaybackGeneration('play');
      this.initializedGeneration = null;
      await this.audioScheduler.resume();
      if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) return;

      this.bufferManager.resetFailures();
      this.scheduler.reset();
      this.playbackQueue.clear();
      this.manifest.clear();
      this.fetchingKeys.clear();
      
      const currentTime = this.videoEl.currentTime;
      
      // Wait only for the chunk covering the playhead. The rest of the window
      // is fetched after playback begins, so resume is not held hostage by all
      // five warm-up chunks.
      await this.fillBufferWindow(currentTime, 'play-first-chunk', generation, true, true);
      if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) return;

      // 2. Play the video element
      await this.videoEl.play();
      if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) return;

      // 3. Once video element is active, fetch the real playhead and schedule audio
      const syncedTime = this.videoEl.currentTime;
      this.playbackQueue.clear();
      this.hydrateManifestFromCache();
      this.playbackQueue.update(syncedTime, this.state.playbackRate);
      void this.fillBufferWindow(syncedTime, 'play-background', generation);
      
      this.startHeartbeat();
    } finally {
      this.session.isTransitioningState = false;
    }
  }

  async playSyncedFromCurrentTime(): Promise<void> {
    if (this.session.abortController.signal.aborted) return;
    if (!this.videoEl) return;
    if (this.session.isTransitioningState) return;
    this.session.isTransitioningState = true;
    this.state.isPlaying = true;

    try {
      console.log(`[PlaybackController-${this.instanceId}] Playback State: PLAYING_SYNCED`);
      const generation = this.initializedGeneration === this.session.playbackGeneration
        ? this.session.playbackGeneration
        : this.startNewPlaybackGeneration('playSyncedFromCurrentTime');
      this.initializedGeneration = null;
      this.resetQueueAndTimeline();
      this.hydrateManifestFromCache();

      // Resume as soon as the playhead chunk is decoded; continue prefetching
      // the rest of the window in the background.
      await this.fillBufferWindow(this.videoEl.currentTime, 'play-first-chunk', generation, true, true);
      if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) return;

      // 2. Resume context and play
      await this.audioScheduler.resume();
      if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) return;

      await this.videoEl.play();
      if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) return;

      // 3. Once video element is active, schedule matching audio playhead
      const syncedTime = this.videoEl.currentTime;
      this.playbackQueue.clear();
      this.hydrateManifestFromCache();
      this.playbackQueue.update(syncedTime, this.state.playbackRate);
      void this.fillBufferWindow(syncedTime, 'play-background', generation);
      
      this.startHeartbeat();
    } finally {
      this.session.isTransitioningState = false;
    }
  }

  pause(): void {
    if (this.session.abortController.signal.aborted) return;
    if (this.session.isTransitioningState) return;
    this.session.isTransitioningState = true;
    this.state.isPlaying = false;

    try {
      console.log(`[PlaybackController-${this.instanceId}] Playback State: PAUSED`);
      
      // Cancel current playback generation & downloads immediately
      this.startNewPlaybackGeneration('pause');

      if (this.videoEl) {
        this.videoEl.pause();
      }
      this.stopHeartbeat();
      this.playbackQueue.clear();
      this.audioScheduler.stopAll();
      // Keep AudioContext running to avoid browser user-gesture restrictions on resume
      // this.audioScheduler.suspend().catch(console.error);
    } finally {
      this.session.isTransitioningState = false;
    }
  }

  async seek(time: number): Promise<void> {
    if (this.session.abortController.signal.aborted) return;
    if (this.session.isTransitioningState) return;
    this.session.isTransitioningState = true;

    const wasPlaying = this.videoEl ? !this.videoEl.paused : false;
    
    // 1. Transactional initialization: abort previous fetches/processes and freeze heartbeat
    const generation = this.startNewPlaybackGeneration('seek');
    this.beginSeekTransaction('seek');
    
    this.fetchingKeys.clear();
    this.playbackQueue.clear();
    this.manifest.clear();
    this.bufferManager.clear();
    this.bufferManager.resetFailures();
    this.scheduler.reset();
    this.audioScheduler.stopAll();

    try {
      if (this.videoEl) {
        this.videoEl.currentTime = time;
      }

      // 2. Pre-buffer and decode the target audio chunk for the new position
      await this.fillBufferWindow(time, 'seek', generation);
      if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) return;

      // 3. Resume audio contexts and restart playback contiguously
      if (wasPlaying && this.videoEl) {
        await this.videoEl.play();
        if (this.session.abortController.signal.aborted || generation !== this.session.playbackGeneration) return;
        
        const syncedTime = this.videoEl.currentTime;
        this.playbackQueue.clear();
        this.hydrateManifestFromCache();
        this.playbackQueue.update(syncedTime, this.state.playbackRate);
      } else {
        this.hydrateManifestFromCache();
      }
    } finally {
      this.endSeekTransaction('seek');
      this.session.isTransitioningState = false;
    }
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.state.playbackRate = rate;
    if (this.videoEl) {
      this.videoEl.playbackRate = rate;
    }
    this.audioScheduler.updatePlaybackRate(rate);
  }

  setAudioBoost(boost: number): void {
    this.audioBoost = boost;
    this.applyVolumeAndBoost();
  }

  private applyVolumeAndBoost(): void {
    if (this.gainNode) {
      const volume = this.state.volume;
      const isMuted = this.state.isMuted;
      const boostMultiplier = getAudioBoostMultiplier(this.audioBoost);
      this.gainNode.gain.value = isMuted ? 0 : volume * boostMultiplier;
    }
  }

  setVolume(volume: number, isMuted: boolean): void {
    this.state.volume = volume;
    this.state.isMuted = isMuted;
    this.applyVolumeAndBoost();
  }

  async switchAudioTrack(streamIndex: number | null): Promise<void> {
    if (this.session.abortController.signal.aborted) return;
    this.state.activeStreamIndex = typeof streamIndex === 'number' ? streamIndex : -1;
    console.log(`[PlaybackController-${this.instanceId}] switchAudioTrack called. streamIndex=${this.state.activeStreamIndex}`);
    this.fetchingKeys.clear();
    this.playbackQueue.clear();
    this.manifest.clear();
    this.bufferManager.clear();
    this.bufferManager.resetFailures();
    this.scheduler.reset();

    if (this.videoEl) {
      const isPlaying = !this.videoEl.paused;
      const currentTime = this.videoEl.currentTime;
      await this.fillBufferWindow(currentTime, 'switchAudioTrack');
      
      if (isPlaying && this.videoEl) {
        const syncedTime = this.videoEl.currentTime;
        this.playbackQueue.clear();
        this.hydrateManifestFromCache();
        this.playbackQueue.update(syncedTime, this.state.playbackRate);
      } else {
        this.hydrateManifestFromCache();
      }
    }
  }

  async destroy(): Promise<void> {
    console.log(`[PlaybackController-${this.instanceId}] destroy called.`);
    
    // Abort any active fetches, decodes, and scheduler updates immediately by moving generation forward
    this.startNewPlaybackGeneration('destroy');
    this.session.destroy();
    
    this.stopHeartbeat();
    if (this.videoEl && this.listenersBound) {
      this.videoEl.removeEventListener('timeupdate', this.onTimeUpdate);
      this.videoEl.removeEventListener('play', this.onPlayEvent);
      this.videoEl.removeEventListener('pause', this.onPauseEvent);
      this.listenersBound = false;
      console.log(`[PlaybackController-${this.instanceId}] Event listeners removed from video element.`);
    }
    this.fetchingKeys.clear();
    this.playbackQueue.clear();
    this.manifest.clear();
    this.audioScheduler.stopAll();
    
    if (this.audioCtx) {
      await this.audioCtx.close().catch(() => {});
    }
    if (this.ff) {
      await Promise.all(this.decodeWorkers.map(async worker => {
        await worker.demux.cleanup(worker.ff).catch(() => {});
        if (worker.manager !== this.ffmpegMgr) await worker.manager.destroy().catch(() => {});
      }));
    }
    this.bufferManager.clear();
  }
}
