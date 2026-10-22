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
    EMPTY: ['RESERVED', 'FETCHING'],
    RESERVED: ['FETCHING', 'EMPTY'],
    FETCHING: ['DECODED', 'FAILED'],
    DECODED: ['CACHED'],
    CACHED: ['QUEUED', 'EVICTABLE', 'EMPTY'],
    QUEUED: ['PLAYING', 'EVICTABLE', 'EMPTY', 'PLAYED', 'CACHED'],
    PLAYING: ['PLAYED', 'EVICTABLE', 'EMPTY'],
    PLAYED: ['EVICTABLE', 'EMPTY'],
    EVICTABLE: ['REMOVED', 'EMPTY'],
    FAILED: ['COOLDOWN'],
    COOLDOWN: ['EMPTY'],
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
