/**
 * embedProtocol.ts
 * Defines the standard communication protocol for the Embed Player SDK.
 */

// Commands sent FROM the Host Window TO the Iframe
export type EmbedCommand = 
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STOP' }
  | { type: 'SEEK'; payload: { time: number } }
  | { type: 'SET_VOLUME'; payload: { volume: number } }
  | { type: 'SET_MUTE'; payload: { muted: boolean } }
  | { type: 'SET_SPEED'; payload: { speed: number } }
  | { type: 'SET_FULLSCREEN'; payload: { fullscreen: boolean } }
  | { type: 'LOAD'; payload: { url: string; media?: string; autoPlay?: boolean; currentTime?: number; duration?: number; hlsPlaylist?: any; playbackMode?: string; } }
  | { type: 'UPDATE_CONFIG'; payload: { controls?: Partial<ControlsConfig>; theme?: Partial<ThemeConfig> } }
  | { type: 'DESTROY' };

// Events sent FROM the Iframe TO the Host Window
export type EmbedEvent =
  | { type: 'READY' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'ENDED' }
  | { type: 'TIME_UPDATE'; payload: { currentTime: number; duration: number } }
  | { type: 'BUFFERING'; payload: { isBuffering: boolean } }
  | { type: 'SEEK'; payload: { time: number } }
  | { type: 'SUBTITLE_CHANGE'; payload: { trackId: string | null } }
  | { type: 'AUDIO_CHANGE'; payload: { trackId: string | null } }
  | { type: 'FULLSCREEN_CHANGE'; payload: { isFullscreen: boolean } }
  | { type: 'ERROR'; payload: { message: string; code?: string } };

// Wrappers for secure postMessage validation
export interface EmbedMessageWrapper {
  source: 'valor-embed-host' | 'valor-embed-iframe';
  version: string;
  payload: EmbedCommand | EmbedEvent;
}

// Controls configuration for hiding/showing features
export interface ControlsConfig {
  play: boolean;
  pause: boolean;
  volume: boolean;
  subtitles: boolean;
  fullscreen: boolean;
  speed: boolean;
  settings: boolean;
  nextEpisode: boolean;
  previousEpisode: boolean;
  pip: boolean;
  download: boolean;
  screenshot: boolean;
  chapters: boolean;
}

export const DEFAULT_CONTROLS_CONFIG: ControlsConfig = {
  play: true,
  pause: true,
  volume: true,
  subtitles: true,
  fullscreen: true,
  speed: true,
  settings: true,
  nextEpisode: true,
  previousEpisode: true,
  pip: true,
  download: true,
  screenshot: true,
  chapters: true
};

// Theme configuration for custom branding
export interface ThemeConfig {
  accent?: string;
  background?: string;
  text?: string;
  radius?: number;
  font?: string;
  logoUrl?: string;
  watermarkUrl?: string;
  hideLogo?: boolean;
}
