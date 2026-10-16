export class AudioSyncEngine {
  private video: HTMLVideoElement;
  private audio: HTMLAudioElement;
  private intervalId: any = null;
  private isVideoSeeking = false;
  private isAudioSeeking = false;
  private isSyncingEnabled = true;
  private isVideoWaiting = false;
  private audioStartOffset = 0;
  private pendingSeekTime: number | null = null;
  private pendingPlay = false;
  private isAudioReady = false; // Track if audio has loaded enough to seek/play

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
    // Pause audio immediately on init to prevent any playback from time 0
    this.audio.pause();
    this.isAudioReady = this.audio.readyState >= 2;

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
    this.audio.addEventListener('loadedmetadata', this.onAudioLoaded);
    this.audio.addEventListener('canplay', this.onAudioCanPlay);

    // Initial play state sync — only if audio is already loaded
    if (!this.video.paused && this.isAudioReady) {
      this.safePlayAudio();
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
    this.audio.removeEventListener('loadedmetadata', this.onAudioLoaded);
    this.audio.removeEventListener('canplay', this.onAudioCanPlay);
    
    this.stopSyncLoop();
    this.audio.pause();
    this.video.muted = false; // Restore video volume
  }

  // Handle playback changes
  private handlePlay = () => {
    if (this.isSyncingEnabled) {
      this.safePlayAudio();
    }
  };

  private handlePause = () => {
    this.pendingPlay = false;
    this.audio.pause();
  };

  private handleSeeking = () => {
    this.isVideoSeeking = true;
    this.isVideoWaiting = false;
    this.pendingPlay = false;
    this.audio.pause();
    if (this.isSyncingEnabled) {
      this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
    }
  };

  private handleSeeked = () => {
    if (this.isSyncingEnabled) {
      this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
    }
    this.isVideoSeeking = false;
    this.isVideoWaiting = false;

    // Small delay to let audio buffer catch up before resuming playback
    if (this.isSyncingEnabled && !this.video.paused) {
      setTimeout(() => {
        if (!this.video.paused && !this.video.seeking && !this.isSeeking && !this.isVideoWaiting) {
          this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
          this.safePlayAudio();
        }
      }, 50);
    }
  };

  private handleAudioSeeking = () => {
    this.isAudioSeeking = true;
  };

  private handleAudioSeeked = () => {
    this.isAudioSeeking = false;
    if (this.isSyncingEnabled && !this.video.paused && !this.video.seeking && !this.isVideoSeeking && !this.isAudioSeeking && !this.isVideoWaiting) {
      this.safePlayAudio();
    }
  };

  private handleRateChange = () => {
    if (this.isSyncingEnabled) {
      this.audio.playbackRate = this.video.playbackRate;
    }
  };

  private handleWaiting = () => {
    // Video is buffering, pause audio
    this.isVideoWaiting = true;
    this.pendingPlay = false;
    this.audio.pause();
  };

  private handlePlaying = () => {
    // Video resumed, re-sync time and resume audio
    this.isVideoWaiting = false;
    if (this.isSyncingEnabled && !this.video.paused) {
      this.syncAudioTime(Math.max(0, this.video.currentTime - this.audioStartOffset));
      this.audio.playbackRate = this.video.playbackRate;
      this.safePlayAudio();
    }
  };

  private onAudioLoaded = () => {
    if (!this.isSyncingEnabled) return;
    // Audio metadata loaded — we can now seek
    if (this.pendingSeekTime !== null) {
      const targetTime = this.pendingSeekTime;
      this.pendingSeekTime = null;
      this.audio.currentTime = targetTime;
    }
  };

  private onAudioCanPlay = () => {
    if (!this.isSyncingEnabled) return;
    this.isAudioReady = true;
    
    // Ensure time is correct before allowing any playback
    const targetTime = Math.max(0, this.video.currentTime - this.audioStartOffset);
    const drift = Math.abs(this.audio.currentTime - targetTime);
    if (drift > 0.15) {
      this.audio.currentTime = targetTime;
    }

    if (this.pendingPlay) {
      this.pendingPlay = false;
      if (!this.video.paused) {
        this.safePlayAudio();
      }
    }
  };

  private syncAudioTime(targetTime: number) {
    if (!this.isSyncingEnabled) return;

    // Guard: If the video is playing/positioned before the start of this audio chunk, pause and keep audio at 0
    const vTime = this.video.currentTime;
    if (vTime < this.audioStartOffset - 0.5) {
      targetTime = 0;
      this.audio.pause();
    }

    if (this.audio.readyState >= 1) {
      this.pendingSeekTime = null;
      this.audio.currentTime = targetTime;
    } else {
      this.pendingSeekTime = targetTime;
    }
  }

  /**
   * Safe play: always verify currentTime is correct before calling play().
   * This prevents the "blast from time 0" issue.
   */
  private safePlayAudio() {
    if (!this.isSyncingEnabled) return;
    // Guard: If the video is playing/positioned before the start of this audio chunk, keep audio paused
    if (this.video.currentTime < this.audioStartOffset - 0.5) {
      this.audio.pause();
      return;
    }
    if (this.isSeeking || this.video.seeking) return;
    
    if (this.audio.readyState >= 2) {
      this.pendingPlay = false;
      // CRITICAL: Always verify time is correct before playing
      const targetTime = Math.max(0, this.video.currentTime - this.audioStartOffset);
      const drift = Math.abs(this.audio.currentTime - targetTime);
      if (drift > 0.15) {
        // Set time and wait for seeked event to trigger play
        this.audio.currentTime = targetTime;
        // The handleAudioSeeked handler will resume playback
        return;
      }
      this.audio.playbackRate = this.video.playbackRate;
      this.audio.play().catch((err) => {
        if (err && err.name !== 'AbortError') {
          console.error(err);
        }
      });
    } else {
      // Audio not ready yet — mark pending, will be handled by onAudioCanPlay
      this.pendingPlay = true;
    }
  }

  // Background drift sync loop
  private startSyncLoop() {
    this.stopSyncLoop();
    this.intervalId = setInterval(() => {
      const vTime = this.video.currentTime;

      // Guard: If the video is playing/positioned before the start of this audio chunk, pause audio and return
      if (vTime < this.audioStartOffset - 0.5) {
        if (!this.audio.paused) {
          this.audio.pause();
        }
        if (this.audio.currentTime !== 0) {
          this.audio.currentTime = 0;
        }
        return;
      }

      if (
        this.isSeeking || 
        !this.isSyncingEnabled || 
        !this.audio || 
        !this.video || 
        this.audio.readyState < 2 || 
        this.audio.seeking || 
        this.video.seeking
      ) {
        return;
      }

      const aTime = this.audio.currentTime;
      const drift = vTime - (aTime + this.audioStartOffset);
      const absDrift = Math.abs(drift);

      // If they drift by more than 300ms, do a hard seek
      if (absDrift > 0.3) {
        console.log(`[AudioSync] Large drift detected: ${Math.round(drift * 1000)}ms. Hard seeking audio.`);
        this.syncAudioTime(Math.max(0, vTime - this.audioStartOffset));
        this.audio.playbackRate = this.video.playbackRate;
      } 
      // If drift is between 50ms and 300ms, apply dynamic playback rate adjustment to catch up smoothly
      else if (absDrift > 0.05) {
        const correctionFactor = 1 + Math.min(0.1, absDrift * 0.2) * (drift > 0 ? 1 : -1);
        this.audio.playbackRate = this.video.playbackRate * correctionFactor;
      } 
      // Otherwise, they are well in sync, restore matching playback rate
      else {
        if (this.audio.playbackRate !== this.video.playbackRate) {
          this.audio.playbackRate = this.video.playbackRate;
        }
      }

      // Keep play states synchronized
      if (this.video.paused && !this.audio.paused) {
        this.audio.pause();
      } else if (!this.video.paused && this.audio.paused && !this.video.seeking && !this.isSeeking && !this.isVideoWaiting) {
        this.safePlayAudio();
      }
    }, 200);
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
        this.safePlayAudio();
      }
    }
  }
}
