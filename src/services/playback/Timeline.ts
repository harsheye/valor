export class Timeline {
  constructor(public seekMap?: any[]) {}

  /**
   * Calculate signed drift between video currentTime and AudioContext playhead
   * Positive value means video is ahead of audio; negative means audio is ahead of video.
   */
  public getDrift(currentTime: number, audioPlayhead: number | null): number | null {
    if (audioPlayhead !== null && !isNaN(audioPlayhead)) {
      return currentTime - audioPlayhead;
    }
    return null;
  }

  /**
   * Check if there is significant drift between video currentTime and AudioContext playhead
   * Returns true if drift is > 100ms (significant enough to require a hard resync)
   */
  public checkDrift(currentTime: number, audioPlayhead: number | null): boolean {
    const drift = this.getDrift(currentTime, audioPlayhead);
    if (drift !== null) {
      return Math.abs(drift) > 0.10;
    }
    return false;
  }
}
