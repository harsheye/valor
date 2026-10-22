import React, { useState } from 'react';
import type { VideoItem } from '../types/media';
import type { SubtitleSettings } from './SubtitleOverlay';
import { SimpleRemotePlayer } from './SimpleRemotePlayer';
import { RemoteServerPlayer } from './RemoteServerPlayer';
import { PlaybackModeModal } from './PlaybackModeModal';
import { classifyVideoTitle } from '../utils/libraryClassifier';

export interface VideoPlayerProps {
  video: VideoItem;
  customLoaderUrl?: string;
  customLoaderType?: 'default' | 'image' | 'video' | 'gif';
  spinnerPreset?: string;
  userId?: string;
  profileName?: string;
  videos?: VideoItem[];
  onBack: () => void;
  onUpdateVideo: (updatedVideoOrUpdater: VideoItem | ((prev: VideoItem) => VideoItem), isExiting?: boolean, targetVideoId?: string, forceSave?: boolean) => void;
  hideUIOverlays?: boolean;
  hideVideoName?: boolean;
  toastDuration?: number;
  disableAnimations?: boolean;
  pauseOnFocusChange?: boolean;
  showPlayButton?: boolean;
  showTimeDisplay?: boolean;
  showPlayBar?: boolean;
  showVolumeControl?: boolean;
  showFullscreen?: boolean;
  subSettings: SubtitleSettings;
  onUpdateSubSettings: (settings: Partial<SubtitleSettings>) => void;
  historySaveInterval?: number;
  saveVolume?: boolean;
  ratingThreshold?: number;
  getOverlayDataFromTmdb?: boolean;
  overlayPosition?: 'middle-left' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  overlayShowBackground?: boolean;
  overlayShowRating?: boolean;
  overlayShowOverview?: boolean;
  openSubtitlesApiKey?: string;
  onUpdateSettings?: (settings: Partial<any>) => void;
  allowUiSkipping?: boolean;
  blockSeekingCompletely?: boolean;
  autoSkipIntroOutro?: boolean;
  autoSkipSexScenes?: boolean;
  lockModeActive?: boolean;
  settingsOrder?: string[];
  radialMenuConfig?: any;
  uiHideTimeout?: number;
  onReassociate?: (videoId: string) => Promise<void>;
  isEmbed?: boolean;
  isCinema?: boolean;
  showSubtitleControl?: boolean;
  showBookmarksControl?: boolean;
  showAudioControl?: boolean;
  audioOnly?: boolean;
  subFileOnly?: boolean;
  allowSubUpload?: boolean;
  showCloseButton?: boolean;
}

/**
 * Determines whether a given video can be classified as TV show or Movie media
 * based on filename, title, URL parameters, and video container characteristics.
 */
export function isLikelyTvOrCinema(video: VideoItem, isCinemaProp?: boolean): boolean {
  if (isCinemaProp || (video as any).isCinema === true) return true;

  const rawMode = (video as any).playbackMode;
  if (rawMode === 'server') return true;
  if (rawMode === 'simple') return false;

  const title = (video.title || '').trim();
  const url = (video.url || '').trim();
  const combined = `${title} ${url}`.toLowerCase();

  // 1. Container / Video extension check
  if (/\.(mkv|vob|iso|m2ts|ts)\b/i.test(combined)) {
    return true;
  }

  // 2. Library title classifier: series or movie
  const classified = classifyVideoTitle(title);
  if (classified.type === 'series' || classified.type === 'movie') {
    return true;
  }

  // 3. Common TV show and cinema release patterns
  const tvPatterns = [
    /[.\-_ ]s\d{1,2}[.\-_ ]?e\d{1,2}/i, // S01E01, s1e2, S01.E02
    /\b\d{1,2}x\d{2}\b/i,               // 1x01, 01x02
    /\bseason\s*\d+/i,                  // Season 1
    /\bepisode\s*\d+/i,                 // Episode 1
    /\b(ep|e)\.?\d{1,3}\b/i,            // ep12, E03
    /\b(720p|1080p|2160p|4k|bluray|web-dl|webrip|hdrip|bdrip|hevc|x264|x265|dts|ac3|eac3|truehd|remux)\b/i,
    /\b(19\d\d|20[0-2]\d)\b/             // Year between 1900 and 2029
  ];

  if (tvPatterns.some(p => p.test(combined))) {
    return true;
  }

  return false;
}

export const RemoteVideoPlayer: React.FC<VideoPlayerProps> = (props) => {
  const { video, onBack, onUpdateVideo, isCinema } = props;

  // 1. Determine playback mode
  const [playbackMode, setPlaybackMode] = useState<'simple' | 'server' | null>(() => {
    // Cinema mode override
    if (isCinema || (video as any).isCinema) {
      return 'server';
    }

    const rawMode = (video as any).playbackMode;
    if (rawMode === 'simple' || rawMode === 'server') {
      return rawMode;
    }

    const key = video.id || video.url;
    const savedForVideo = localStorage.getItem(`valor_remote_mode_${key}`);
    if (savedForVideo === 'simple' || savedForVideo === 'server') {
      return savedForVideo;
    }

    // Auto-detection: If filename/title is recognized as TV/Movie media, automatically choose server engine
    if (isLikelyTvOrCinema(video, isCinema)) {
      return 'server';
    }

    // Fallback to global user preference if saved
    const savedDefault = localStorage.getItem('valor_remote_playback_mode_default');
    if (savedDefault === 'simple' || savedDefault === 'server') {
      return savedDefault;
    }

    // Cannot determine: prompt user with picker modal
    return null;
  });

  const [isModalOpen, setIsModalOpen] = useState<boolean>(() => playbackMode === null);

  const handleSelectMode = (mode: 'simple' | 'server', remember: boolean) => {
    const key = video.id || video.url;
    if (remember) {
      localStorage.setItem('valor_remote_playback_mode_default', mode);
    }
    localStorage.setItem(`valor_remote_mode_${key}`, mode);
    setPlaybackMode(mode);
    setIsModalOpen(false);

    onUpdateVideo({
      ...video,
      playbackMode: mode
    } as any, false);
  };

  const handleSwitchMode = (targetMode: 'simple' | 'server') => {
    const key = video.id || video.url;
    localStorage.setItem(`valor_remote_mode_${key}`, targetMode);
    setPlaybackMode(targetMode);
  };

  // If mode cannot be determined, prompt user with the compact mode selection modal
  if (playbackMode === null || isModalOpen) {
    return (
      <div 
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#0a0e17',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        {video.backdropUrl && (
          <img 
            src={video.backdropUrl} 
            alt="Backdrop"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(20px) brightness(0.25)',
              transform: 'scale(1.1)'
            }}
          />
        )}
        <PlaybackModeModal
          isOpen={true}
          videoTitle={video.title || 'Remote Video'}
          currentMode={playbackMode}
          onSelectMode={handleSelectMode}
          onClose={onBack}
        />
      </div>
    );
  }

  // 2. Simple Media: Run simple native HTML5 player
  if (playbackMode === 'simple') {
    return (
      <SimpleRemotePlayer
        {...props}
        onSwitchMode={handleSwitchMode}
      />
    );
  }

  // 3. Movies & TV Shows: Run server-assisted RemoteServerPlayer
  return (
    <RemoteServerPlayer
      {...props}
      onSwitchMode={handleSwitchMode}
    />
  );
};
