export type ChunkState =
  | 'EMPTY'
  | 'RESERVED'
  | 'FETCHING'
  | 'DECODED'
  | 'CACHED'
  | 'QUEUED'
  | 'PLAYING'
  | 'PLAYED'
  | 'EVICTABLE'
  | 'FAILED'
  | 'COOLDOWN'
  | 'REMOVED';

export class ChunkManifest {
  public readonly instanceId = Math.random().toString(36).substring(7);
  private states = new Map<number, ChunkState>();

  private static LEGAL_TRANSITIONS: Record<ChunkState, ChunkState[]> = {
    EMPTY: ['RESERVED', 'FETCHING', 'QUEUED', 'FAILED'],
    RESERVED: ['FETCHING', 'EMPTY', 'FAILED'],
    FETCHING: ['DECODED', 'FAILED', 'EMPTY'],
    DECODED: ['CACHED', 'QUEUED'],
    CACHED: ['QUEUED', 'EVICTABLE', 'EMPTY'],
    QUEUED: ['PLAYING', 'EVICTABLE', 'EMPTY', 'PLAYED', 'CACHED', 'DECODED'],
    PLAYING: ['PLAYED', 'EVICTABLE', 'EMPTY'],
    PLAYED: ['EVICTABLE', 'EMPTY', 'CACHED'],
    EVICTABLE: ['REMOVED', 'EMPTY'],
    FAILED: ['COOLDOWN', 'EMPTY'],
    COOLDOWN: ['EMPTY', 'FETCHING'],
    REMOVED: ['EMPTY']
  };

  getState(chunkKey: number): ChunkState {
    return this.states.get(chunkKey) || 'EMPTY';
  }

  transitionTo(chunkKey: number, nextState: ChunkState): void {
    const currentState = this.getState(chunkKey);
    if (currentState === nextState) return;

    const allowed = ChunkManifest.LEGAL_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(nextState)) {
      console.warn(
        `[ChunkManifest-${this.instanceId}] Invalid chunk state transition: chunk ${chunkKey}s, ${currentState} -> ${nextState}`
      );
    }
    this.states.set(chunkKey, nextState);
  }

  clear(): void {
    this.states.clear();
  }
}
