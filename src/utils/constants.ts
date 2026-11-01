export const audioOptions = [
  { value: 'Original', label: 'Original' },
  { value: 'ENG', label: 'English (Default)' },
  { value: 'JAP', label: 'Japanese' },
  { value: 'CHN', label: 'Chinese' },
  { value: 'HIN', label: 'Hindi' },
  { value: 'SPA', label: 'Spanish' }
];

export const subOptions = [
  { value: 'Off', label: 'Off' },
  { value: 'ENG', label: 'English (Default)' },
  { value: 'JAP', label: 'Japanese' },
  { value: 'CHN', label: 'Chinese' },
  { value: 'HIN', label: 'Hindi' },
  { value: 'SPA', label: 'Spanish' }
];

export const calendarStyleOptions = [
  { value: 'grid', label: 'Classic Grid' },
  { value: 'list', label: 'Schedule List (Modern)' },
  { value: 'booking', label: 'Hotel Bookings (Resource View)' },
  { value: 'appointment', label: 'Client Appointments (Day View)' }
];

export const limitOptions = [
  { value: 5, label: '5 items' },
  { value: 10, label: '10 items (Default)' },
  { value: 20, label: '20 items' },
  { value: 50, label: '50 items' },
  { value: 'Infinite', label: 'Infinite' }
];

export const intervalOptions = [
  { value: 2, label: 'Every 2 seconds' },
  { value: 5, label: 'Every 5 seconds (Default)' },
  { value: 10, label: 'Every 10 seconds' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every 60 seconds' }
];

export const toastOptions = [
  { value: 0.5, label: '0.5 seconds' },
  { value: 1.0, label: '1.0 second' },
  { value: 2.0, label: '2.0 seconds' },
  { value: 3.0, label: '3.0 seconds' },
  { value: 4.0, label: '4.0 seconds (Default)' },
  { value: 6.0, label: '6.0 seconds' },
  { value: 8.0, label: '8.0 seconds' }
];

export const uiHideTimeoutOptions = [
  { value: 0.5, label: '0.5 seconds' },
  { value: 1, label: '1.0 second' },
  { value: 1.5, label: '1.5 seconds (Default)' },
  { value: 2, label: '2.0 seconds' },
  { value: 2.5, label: '2.5 seconds' },
  { value: 3, label: '3.0 seconds' },
  { value: 4, label: '4.0 seconds' },
  { value: 5, label: '5.0 seconds' }
];

export const fontOptions = [
  { value: 'poppins', label: 'Poppins (Default)' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'outfit', label: 'Outfit' },
  { value: 'cinzel', label: 'Cinzel' },
  { value: 'serif', label: 'Playfair Display' },
  { value: 'monospace', label: 'Roboto Mono' }
];

export const defaultKeybinds = {
  playPause: ' ',
  rewind: 'ArrowLeft',
  forward: 'ArrowRight',
  volumeUp: 'ArrowUp',
  volumeDown: 'ArrowDown',
  mute: 'm',
  toggleFullscreen: 'f',
  togglePiP: 'p',
  toggleCaptions: 'c',
  bookmark: 'b',
  jumpNextBookmark: 'n',
  speedUp: ']',
  slowDown: '[',
  toggleMiniPlayer: 'i',
  bossKey: 'Escape',
  cycleAspect: 'a',
  takeScreenshot: 's'
};

export const defaultSettings = {
  keybinds: defaultKeybinds,
  theme: 'black-ops',
  performancePreset: 'balanced',
  audioNormalization: true,
  enableSmartSeek: true,
  seekDuration: 10,
  autoSkipIntro: false,
  autoSkipOutro: false,
  autoPip: false,
  autoPlayNext: false,
  autoPauseOnTabSwitch: true,
  defaultPlaybackRate: 1.0,
  volumeStep: 5,
  storageMode: 'localstorage',
  enableSubtitles: true,
  preferredSubtitleLanguage: 'eng',
  preferredAudioLanguage: 'eng',
  enableResumePlayback: true,
  hardwareAcceleration: 'on',
  reduceMotion: 'off',
  textSize: 100,
  uiDimmer: 100,
  enableTrakt: false,
  traktToken: null,
  traktRefreshToken: null,
  traktTokenExpiresAt: null,
  traktUsername: null,
  tmdbApiKey: '',
  openSubtitlesApiKey: '',
  openSubtitlesUsername: '',
  openSubtitlesPassword: '',
  theintrodbApiKey: '',
  ratingPromptThreshold: 3,
  traktRatingPrompt: true,
  traktHistorySync: false,
  lastTraktHistorySyncTime: null,
  traktRatingsSync: false,
  lastTraktRatingsSyncTime: null,
  traktWatchlistSync: false,
  lastTraktWatchlistSyncTime: null,
  traktFavoritesSync: false,
  lastTraktFavoritesSyncTime: null,
  traktSyncInterval: 30
};

export const themeOptions = [
  { value: 'midnight-slate', label: 'Midnight Slate' },
  { value: 'soft-paper', label: 'Soft Paper' },
  { value: 'black-ops', label: 'Black Ops' }
];

export const performancePresetOptions = [
  { value: 'high', label: 'High Performance' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'saver', label: 'Battery Saver' }
];

export const storageModeOptions = [
  { value: 'localstorage', label: 'Local Browser Storage' },
  { value: 'file', label: 'Persistent Server Files' }
];

export const ratingThresholdOptions = [
  { value: 1, label: '1 minute remaining' },
  { value: 2, label: '2 minutes remaining' },
  { value: 3, label: '3 minutes remaining (Default)' },
  { value: 5, label: '5 minutes remaining' },
  { value: 10, label: '10 minutes remaining' }
];

export const DEFAULT_TMDB_TOKEN = (import.meta.env.VITE_TMDB_BEARER_TOKEN || import.meta.env.VITE_TMDB_API_KEY || '') as string;
export const TRAKT_CLIENT_ID = (import.meta.env.VITE_TRAKT_CLIENT_ID || 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88') as string;
