export class PlaybackSession {
  public sessionId = '';
  public playbackGeneration = 0;
  public chunkAbortController = new AbortController();
  public abortController = new AbortController();
  public heartbeatIntervalId: any = null;
  public maintenanceFrozen = false;
  public isTransitioningState = false;
  public readonly instanceId = Math.random().toString(36).substring(7);

  public startNewGeneration(reason: string): number {
    this.playbackGeneration++;
    this.sessionId = Math.random().toString(36).substring(7);
    this.chunkAbortController.abort();
    this.chunkAbortController = new AbortController();
    return this.playbackGeneration;
  }

  public destroy(): void {
    this.startNewGeneration('destroy');
    this.abortController.abort();
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }
}
