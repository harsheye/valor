export interface RemoteSessionInfo {
  sessionId: string;
  manifestUrl: string;
  mediaPlaylistUrl: string;
  duration: number;
  formatName: string;
  videoStreams: any[];
  audioStreams: any[];
  subtitleStreams: any[];
  canCopyVideo: boolean;
  canCopyAudio: boolean;
}

/**
 * Creates a remote playback session on the backend.
 */
export async function createRemoteSession(url: string, headers?: Record<string, string>, auth?: any): Promise<RemoteSessionInfo> {
  const res = await fetch('/api/remote/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, headers, auth })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errorData.error || `Failed to create remote playback session (${res.status})`);
  }

  return await res.json();
}

/**
 * Switches the active audio track for a remote session.
 */
export async function switchRemoteAudio(sessionId: string, audioStreamIndex: number, currentTimeSeconds = 0): Promise<void> {
  await fetch(`/api/remote/session/${sessionId}/switch-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioStreamIndex, currentTimeSeconds })
  });
}

/**
 * Destroys a remote playback session on the backend.
 */
export function destroyRemoteSession(sessionId: string): void {
  try {
    fetch(`/api/remote/session/${sessionId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
  } catch {
    // ignore
  }
}
