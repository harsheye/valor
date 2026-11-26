export class PlaybackState {
  public activeStreamIndex = -1;
  public playbackRate = 1.0;
  public isPlaying = false;
  public isBuffering = false;
  public volume = 1.0;
  public isMuted = false;

  public reset(): void {
    this.activeStreamIndex = -1;
    this.playbackRate = 1.0;
    this.isPlaying = false;
    this.isBuffering = false;
    this.volume = 1.0;
    this.isMuted = false;
  }
}
