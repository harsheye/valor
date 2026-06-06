export class AudioSyncEngine {
  private video: HTMLVideoElement;
  private audio: HTMLAudioElement;
  private intervalId: any = null;
  private isSeeking = false;
  private isSyncingEnabled = true;
  private isVideoWaiting = false;

  constructor(video: HTMLVideoElement, audio: HTMLAudioElement) {
    this.video = video;
    this.audio = audio;
    this.init();
  }

  private init() {
    // Sync initial state
    this.audio.playbackRate = this.video.playbackRate;
    this.audio.currentTime = this.video.currentTime;
    
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

    // Initial play state sync
    if (!this.video.paused) {
      this.audio.play().catch(console.error);
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
    
    this.stopSyncLoop();
    this.audio.pause();
    this.video.muted = false; // Restore video volume
  }

  // Handle playback changes
  private handlePlay = () => {
    if (this.isSyncingEnabled) {
      this.audio.play().catch(console.error);
    }
  };

  private handlePause = () => {
    this.audio.pause();
  };

  private handleSeeking = () => {
    this.isSeeking = true;
    this.isVideoWaiting = false;
    this.audio.currentTime = this.video.currentTime;
  };

  private handleSeeked = () => {
    this.audio.currentTime = this.video.currentTime;
    this.isSeeking = false;
    this.isVideoWaiting = false;
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
      this.audio.play().catch(console.error);
    }
  };

  // Background drift sync loop
  private startSyncLoop() {
    this.stopSyncLoop();
    this.intervalId = setInterval(() => {
      if (this.isSeeking || !this.isSyncingEnabled) return;

      const vTime = this.video.currentTime;
      const aTime = this.audio.currentTime;
      const drift = Math.abs(vTime - aTime);

      // If they drift by more than 80ms, seek audio to video time
      if (drift > 0.08) {
        console.log(`[AudioSync] Drift detected: ${Math.round(drift * 1000)}ms. Syncing audio.`);
        this.audio.currentTime = vTime;
      }

      // Keep play states synchronized
      if (this.video.paused && !this.audio.paused) {
        this.audio.pause();
      } else if (!this.video.paused && this.audio.paused && !this.video.seeking && !this.isVideoWaiting) {
        this.audio.play().catch(console.error);
      }

      // Sync playback rate in case it changed out of events
      if (this.audio.playbackRate !== this.video.playbackRate) {
        this.audio.playbackRate = this.video.playbackRate;
      }
    }, 250); // check 4 times a second
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
      this.audio.currentTime = this.video.currentTime;
      if (!this.video.paused) {
        this.audio.play().catch(console.error);
      }
    }
  }
}
