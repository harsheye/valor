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
   * Check if there is severe, unrecoverable drift between video currentTime and AudioContext playhead.
   * Moderate drift (< 1.2s) is handled smoothly by micro-rate adjustment and video-to-audio sync nudging.
   * Returns true only if drift is > 1.2s (significant enough to require a hard resync).
   */
  public checkDrift(currentTime: number, audioPlayhead: number | null): boolean {
    const drift = this.getDrift(currentTime, audioPlayhead);
    if (drift !== null) {
      return Math.abs(drift) > 1.2;
    }
    return false;
  }
}
