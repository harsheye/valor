/**
 * Shared in-memory cache and in-flight request deduping map for remote ffprobe metadata.
 * Prevents duplicate probe floods across component remounts, state cascades, and multi-player transitions.
 */

export interface CachedProbeData {
  duration?: number;
  format?: string;
  videoStreams?: any[];
  audioStreams?: any[];
  subtitleStreams?: any[];
  allStreams: any[];
  [key: string]: any;
}

export const remoteProbeCache = new Map<string, CachedProbeData>();
export const inFlightRemoteProbes = new Map<string, Promise<boolean>>();

export function clearRemoteProbeCache(): void {
  remoteProbeCache.clear();
  inFlightRemoteProbes.clear();
}
