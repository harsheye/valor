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
    this.audio.addEventListener('canplay', this.onAudioReady);

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
    this.audio.removeEventListener('canplay', this.onAudioReady);
    
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

    if (this.isSyncingEnabled && !this.video.paused && !this.video.seeking && !this.isVideoSeeking && !this.isAudioSeeking && !this.isVideoWaiting) {
      this.playAudio();
    }
  };

  private handleAudioSeeking = () => {
    this.isAudioSeeking = true;
    this.audio.pause();
  };

  private handleAudioSeeked = () => {
    this.isAudioSeeking = false;
    if (this.isSyncingEnabled && !this.video.paused && !this.video.seeking && !this.isVideoSeeking && !this.isAudioSeeking && !this.isVideoWaiting) {
      this.playAudio();
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
    // Video resumed, resume audio if video is playing
    this.isVideoWaiting = false;
    if (this.isSyncingEnabled && !this.video.paused) {
      this.playAudio();
    }
  };

  private onAudioReady = () => {
    if (!this.isSyncingEnabled) return;
    if (this.audio.readyState >= 1) {
      if (this.pendingSeekTime !== null) {
        const targetTime = this.pendingSeekTime;
        this.pendingSeekTime = null;
        this.audio.currentTime = targetTime;
      }
      if (this.pendingPlay) {
        this.pendingPlay = false;
        this.audio.play().catch((err) => {
          if (err && err.name !== 'AbortError') {
            console.error(err);
          }
        });
      }
    }
  };

  private syncAudioTime(targetTime: number) {
    if (!this.isSyncingEnabled) return;
    if (this.audio.readyState >= 1) {
      this.pendingSeekTime = null;
      this.audio.currentTime = targetTime;
    } else {
      this.pendingSeekTime = targetTime;
    }
  }

  private playAudio() {
    if (!this.isSyncingEnabled) return;
    if (this.isSeeking || this.video.seeking) return; // Don't play if seeking
    if (this.audio.readyState >= 1) {
      this.pendingPlay = false;
      this.audio.play().catch((err) => {
        if (err && err.name !== 'AbortError') {
          console.error(err);
        }
      });
    } else {
      this.pendingPlay = true;
    }
  }

  // Background drift sync loop
  private startSyncLoop() {
    this.stopSyncLoop();
    this.intervalId = setInterval(() => {
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

      const vTime = this.video.currentTime;
      const aTime = this.audio.currentTime;
      const drift = vTime - (aTime + this.audioStartOffset);
      const absDrift = Math.abs(drift);

      // If they drift by more than 500ms, do a hard seek
      if (absDrift > 0.5) {
        console.log(`[AudioSync] Large drift detected: ${Math.round(drift * 1000)}ms. Hard seeking audio.`);
        this.syncAudioTime(Math.max(0, vTime - this.audioStartOffset));
        this.audio.playbackRate = this.video.playbackRate;
      } 
      // If drift is between 80ms and 500ms, apply dynamic playback rate adjustment to catch up smoothly
      else if (absDrift > 0.08) {
        const correction = drift > 0 ? 1.06 : 0.94;
        this.audio.playbackRate = this.video.playbackRate * correction;
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
        this.playAudio();
      }
    }, 400); // Check slightly more frequently (400ms instead of 600ms) for smoother rate correction
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
