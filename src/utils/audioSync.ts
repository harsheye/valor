export class AudioSyncEngine {
  private video: HTMLVideoElement;
  private audio: HTMLAudioElement;
  private intervalId: any = null;
  private isVideoSeeking = false;
  private isAudioSeeking = false;
  private isSyncingEnabled = true;
  private isVideoWaiting = false;
  private audioStartOffset = 0;
  private pendingReadyAction: (() => void) | null = null;

  get isSeeking() {
    return this.isVideoSeeking || this.isAudioSeeking;
  }

  constructor(video: HTMLVideoElement, audio: HTMLAudioElement, startOffset = 0) {
    this.video = video;
    this.audio = audio;
    this.audioStartOffset = startOffset;
    this.init();
  }

  public setAudioStartOffset(offset: number) {
    this.audioStartOffset = offset;
    this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
  }

  private init() {
    // Sync initial state
    this.audio.playbackRate = this.video.playbackRate;
    this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
    
    // Mute video native audio to only hear the secondary audio
    this.video.muted = true;

    // Bind event listeners
    this.video.addEventListener('play', this.handlePlay);
    this.video.addEventListener('pause', this.handlePause);
    this.video.addEventListener('seeking', this.handleSeeking);
    this.video.addEventListener('seeked', this.handleSeeked);
    this.video.addEventListener('ratechange', this.handleRateChange);
    this.video.addEventListener('waiting', this.handleWaiting);
    this.video.addEventListener('playing', this.handlePlaying);

    this.audio.addEventListener('seeking', this.handleAudioSeeking);
    this.audio.addEventListener('seeked', this.handleAudioSeeked);
    this.audio.addEventListener('loadedmetadata', this.onAudioReady);

    // Initial play state sync
    if (!this.video.paused) {
      this.playAudio();
    } else {
      this.audio.pause();
    }

    // Start background sync loop
    this.startSyncLoop();
  }

  public destroy() {
    this.video.removeEventListener('play', this.handlePlay);
    this.video.removeEventListener('pause', this.handlePause);
    this.video.removeEventListener('seeking', this.handleSeeking);
    this.video.removeEventListener('seeked', this.handleSeeked);
    this.video.removeEventListener('ratechange', this.handleRateChange);
    this.video.removeEventListener('waiting', this.handleWaiting);
    this.video.removeEventListener('playing', this.handlePlaying);
    
    this.audio.removeEventListener('seeking', this.handleAudioSeeking);
    this.audio.removeEventListener('seeked', this.handleAudioSeeked);
    this.audio.removeEventListener('loadedmetadata', this.onAudioReady);
    
    this.stopSyncLoop();
    this.audio.pause();
    this.video.muted = false; // Restore video volume
  }

  // Handle playback changes
  private handlePlay = () => {
    if (this.isSyncingEnabled) {
      this.playAudio();
    }
  };

  private handlePause = () => {
    this.audio.pause();
  };

  private handleSeeking = () => {
    this.isVideoSeeking = true;
    this.isVideoWaiting = false;
    this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
  };

  private handleSeeked = () => {
    this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
    this.isVideoSeeking = false;
    this.isVideoWaiting = false;
  };

  private handleAudioSeeking = () => {
    this.isAudioSeeking = true;
  };

  private handleAudioSeeked = () => {
    this.isAudioSeeking = false;
  };

  private handleRateChange = () => {
    this.audio.playbackRate = this.video.playbackRate;
  };

  private handleWaiting = () => {
    // Video is buffering, pause audio
    this.isVideoWaiting = true;
    this.audio.pause();
  };

  private handlePlaying = () => {
    // Video resumed, resume audio if video is playing
    this.isVideoWaiting = false;
    if (!this.video.paused) {
      this.playAudio();
    }
  };

  private onAudioReady = () => {
    if (this.pendingReadyAction) {
      this.pendingReadyAction();
      this.pendingReadyAction = null;
    }
  };

  private runWhenAudioReady(action: () => void) {
    if (this.audio.readyState >= 1) {
      action();
    } else {
      this.pendingReadyAction = action;
    }
  }

  private syncAudioTime(targetTime: number) {
    this.runWhenAudioReady(() => {
      this.audio.currentTime = targetTime;
    });
  }

  private playAudio() {
    this.runWhenAudioReady(() => {
      this.audio.play().catch((err) => {
        if (err && err.name !== 'AbortError') {
          console.error(err);
        }
      });
    });
  }

  // Background drift sync loop
  private startSyncLoop() {
    this.stopSyncLoop();
    this.intervalId = setInterval(() => {
      if (this.isSeeking || !this.isSyncingEnabled) return;

      const vTime = this.video.currentTime;
      const aTime = this.audio.currentTime;
      const drift = Math.abs(vTime - (aTime + this.audioStartOffset));

      // If they drift by more than 120ms, seek audio to video time
      if (drift > 0.12) {
        console.log(`[AudioSync] Drift detected: ${Math.round(drift * 1000)}ms. Syncing audio.`);
        this.syncAudioTime(Math.max(0, vTime - this.audioStartOffset));
      }

      // Keep play states synchronized
      if (this.video.paused && !this.audio.paused) {
        this.audio.pause();
      } else if (!this.video.paused && this.audio.paused && !this.video.seeking && !this.isSeeking && !this.isVideoWaiting) {
        this.playAudio();
      }

      // Sync playback rate in case it changed out of events
      if (this.audio.playbackRate !== this.video.playbackRate) {
        this.audio.playbackRate = this.video.playbackRate;
      }
    }, 600);
  }

  private stopSyncLoop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Temporarily disable or enable synchronization
   */
  public setSyncEnabled(enabled: boolean) {
    this.isSyncingEnabled = enabled;
    if (!enabled) {
      this.audio.pause();
    } else {
      this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
      if (!this.video.paused) {
        this.playAudio();
      }
    }
  }
}
