import React, { useState, useEffect } from 'react';
import type { VideoItem } from '../types/media';
import type { SubtitleSettings } from './SubtitleOverlay';
import { SimpleRemotePlayer } from './SimpleRemotePlayer';
import { RemoteServerPlayer } from './RemoteServerPlayer';
import { PlaybackModeModal } from './PlaybackModeModal';

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
}

export const RemoteVideoPlayer: React.FC<VideoPlayerProps> = (props) => {
  const { video, onBack, onUpdateVideo } = props;

  // 1. Determine playback mode (simple HTML5 vs server remote engine)
  const [playbackMode, setPlaybackMode] = useState<'simple' | 'server' | null>(() => {
    const rawMode = (video as any).playbackMode;
    if (rawMode === 'simple' || rawMode === 'server') {
      return rawMode;
    }
    const key = video.id || video.url;
    const savedForVideo = localStorage.getItem(`valor_remote_mode_${key}`);
    if (savedForVideo === 'simple' || savedForVideo === 'server') {
      return savedForVideo;
    }
    const savedDefault = localStorage.getItem('valor_remote_playback_mode_default');
    if (savedDefault === 'simple' || savedDefault === 'server') {
      return savedDefault;
    }
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

  // If no mode selected yet, prompt user with mode selection modal
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
