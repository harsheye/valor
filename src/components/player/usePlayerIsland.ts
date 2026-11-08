export type PlayerIslandNotification =
  | { type: 'volume'; value: number; muted: boolean; boost?: number }
  | { type: 'audio'; language?: string; channels?: string; codec?: string; index?: number; title?: string }
  | { type: 'subtitle'; language: string | null; title?: string }
  | { type: 'speed'; value: number }
  | { type: 'seek'; delta: number; time: number; duration: number }
  | { type: 'bookmark'; time: number; count: number }
  | { type: 'cast'; device: string; onStop?: () => void };

export interface IslandAudioTrack {
  index: number;
  label: string;
  language?: string;
  channels?: string;
  codec?: string;
}

export interface IslandSubtitleTrack {
  index: number; // -1 for off
  label: string;
  language?: string | null;
}

export interface PlayerIslandTracksState {
  audioTracks?: IslandAudioTrack[];
  subtitleTracks?: IslandSubtitleTrack[];
  selectedAudioIndex?: number;
  selectedSubtitleIndex?: number; // -1 for off
  onSelectAudio?: (index: number) => void;
  onSelectSubtitle?: (index: number) => void;
}

type Listener = (notification: PlayerIslandNotification | null) => void;
type TracksListener = (tracks: PlayerIslandTracksState) => void;

class PlayerIslandStore {
  private current: PlayerIslandNotification | null = null;
  private listeners: Set<Listener> = new Set();
  private tracks: PlayerIslandTracksState = {};
  private tracksListeners: Set<TracksListener> = new Set();

  getNotification(): PlayerIslandNotification | null {
    return this.current;
  }

  getTracks(): PlayerIslandTracksState {
    return this.tracks;
  }

  notify(notification: PlayerIslandNotification): void {
    this.current = notification;
    this.listeners.forEach((fn) => fn(this.current));
  }

  dismiss(): void {
    this.current = null;
    this.listeners.forEach((fn) => fn(null));
  }

  setTracks(tracks: Partial<PlayerIslandTracksState>): void {
    this.tracks = { ...this.tracks, ...tracks };
    this.tracksListeners.forEach((fn) => fn(this.tracks));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeTracks(listener: TracksListener): () => void {
    this.tracksListeners.add(listener);
    return () => this.tracksListeners.delete(listener);
  }
}

export const playerIslandStore = new PlayerIslandStore();

import { useState, useEffect, useCallback, useMemo } from 'react';

export function usePlayerIsland() {
  const [notification, setNotification] = useState<PlayerIslandNotification | null>(() =>
    playerIslandStore.getNotification()
  );

  useEffect(() => {
    return playerIslandStore.subscribe((next) => {
      setNotification(next);
    });
  }, []);

  const notify = useCallback((notif: PlayerIslandNotification) => {
    playerIslandStore.notify(notif);
  }, []);

  const dismiss = useCallback(() => {
    playerIslandStore.dismiss();
  }, []);

  const setTracks = useCallback((tracks: Partial<PlayerIslandTracksState>) => {
    playerIslandStore.setTracks(tracks);
  }, []);

  return useMemo(
    () => ({
      notification,
      notify,
      dismiss,
      setTracks,
    }),
    [notification, notify, dismiss, setTracks]
  );
}
