import React, { useState, useEffect } from 'react';
import type { VideoItem } from '../types/media';
import type { SubtitleSettings } from './SubtitleOverlay';
import { SimpleRemotePlayer } from './SimpleRemotePlayer';
import { RemoteServerPlayer, isGenericTitle, extractTitleFromUrl } from './RemoteServerPlayer';
import { PlaybackModeModal } from './PlaybackModeModal';
import { MediaIdentifyModal } from './MediaIdentifyModal';
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
 * Checks whether a video title or string is an unrecognizable / placeholder title.
 */
export function isUnrecognizableTitle(title?: string): boolean {
  if (!title || !title.trim()) return true;
  const clean = title.trim().toLowerCase();

  if (isGenericTitle(clean)) return true;

  // Raw file extensions only (e.g. ".mp4", ".m3u8", ".ts")
  if (/^\.(mp4|mkv|m3u8|ts|avi|mov|webm)$/i.test(clean)) return true;

  // Pure hex hash (md5/sha/hex 16+ chars)
  if (/^[a-f0-9_\-]{16,}$/i.test(clean)) return true;

  // Base64 or token strings without spaces (20+ chars)
  if (/^[a-zA-Z0-9_\-\+=\/]{20,}$/.test(clean) && !/[a-z] [a-z]/i.test(clean)) return true;

  // Pattern like 01079931142ae199_s1_t0.00_d10.00
  if (/^[a-f0-9]{12,}_s\d+_t\d+/i.test(clean)) return true;

  return false;
}

/**
 * Derives a clean recognizable title from video.title, video.fileName, or video.url.
 */
export function getEffectiveTitle(video: VideoItem): string {
  if (video.title && !isUnrecognizableTitle(video.title)) {
    return video.title.trim();
  }
  if (video.fileName && !isUnrecognizableTitle(video.fileName)) {
    return video.fileName.trim();
  }
  if (video.url) {
    const fromUrl = extractTitleFromUrl(video.url);
    if (fromUrl && !isUnrecognizableTitle(fromUrl)) {
      return fromUrl.trim();
    }
  }
  return '';
}

/**
 * Identifies whether a given video is a Cinema / TV media, a User's Personal Video,
 * or Unknown / ambiguous.
 */
export function identifyMediaClassification(
  video: VideoItem,
  isCinemaProp?: boolean
): 'cinema' | 'personal' | 'unknown' {
  // 1. Explicit cinema indicators
  if (isCinemaProp || (video as any).isCinema === true) return 'cinema';

  // 2. Resolved database IDs imply cinema media (TMDB, Trakt, IMDB, AniList)
  if (video.tmdbId || video.traktId || video.imdbId || video.anilistId) {
    return 'cinema';
  }

  const effectiveTitle = getEffectiveTitle(video);
  const rawTitle = (video.title || '').trim();
  const url = (video.url || '').trim();
  const combined = `${effectiveTitle} ${rawTitle} ${url}`.toLowerCase();

  // 3. Cinema containers (MKV, VOB, ISO, M2TS are movie/tv containers)
  if (/\.(mkv|vob|iso|m2ts)\b/i.test(combined)) {
    return 'cinema';
  }

  // 4. Cinema / TV show URL paths or queries
  if (/(?:[\/?&#]|^)(?:movies|tv|series|shows|cinema|anime|episodes)[\/?&#]/i.test(url)) {
    return 'cinema';
  }

  // 5. Cinema & TV Show release naming patterns
  const cinemaPatterns = [
    /[.\-_ ]s\d{1,2}[.\-_ ]?e\d{1,2}/i, // S01E01, s1e2, S01.E02
    /\b\d{1,2}x\d{2}\b/i,               // 1x01, 01x02
    /\bseason\s*\d+/i,                  // Season 1
    /\bepisode\s*\d+/i,                 // Episode 1
    /\b(ep|e)\.?\d{1,3}\b/i,            // ep12, E03
    /\b(720p|1080p|2160p|4k|bluray|web-dl|webrip|hdrip|bdrip|hevc|x264|x265|dts|ac3|eac3|truehd|remux)\b/i
  ];

  if (cinemaPatterns.some(p => p.test(combined))) {
    return 'cinema';
  }

  // 6. Title classifier check
  if (effectiveTitle) {
    const classified = classifyVideoTitle(effectiveTitle);
    if (classified.type === 'series') return 'cinema';
    if (classified.type === 'movie' && /\b(19\d\d|20[0-2]\d)\b/.test(effectiveTitle)) {
      return 'cinema';
    }
  }

  // 7. Check for Personal Video patterns (camera files, screen recordings, meetings, clips)
  const personalPatterns = [
    /\b(img|vid|mov|dsc|pxl|mvi|gopr|dji|cvr)[_\-\d]/i, // Camera/Phone naming: IMG_1234, VID_20240101
    /\b(screen[-_ ]?rec|screencast|zoom[-_ ]|teams[-_ ]|webcam|home[-_ ]video|vacation|family|whatsapp|recording|selfie|vlog)\b/i
  ];

  if (personalPatterns.some(p => p.test(combined))) {
    return 'personal';
  }

  // 8. If title is completely unrecognizable or ambiguous, we cannot identify
  return 'unknown';
}

export const RemoteVideoPlayer: React.FC<VideoPlayerProps> = (props) => {
  const { video, onBack, onUpdateVideo, isCinema } = props;

  const [currentVideo, setCurrentVideo] = useState<VideoItem>(video);

  useEffect(() => {
    setCurrentVideo(video);
  }, [video]);

  const effectiveTitle = getEffectiveTitle(currentVideo);
  const isNameUnrecognizable = !effectiveTitle;
  const classification = identifyMediaClassification(currentVideo, isCinema);

  // Play remote media via server rendering and packet forwarding directly
  const [playbackMode, setPlaybackMode] = useState<'simple' | 'server'>('server');

  // Player selector modal open state (closed - bypassed for direct playback)
  const [isSelectorOpen, setIsSelectorOpen] = useState<boolean>(false);

  // Name prompt modal open state
  const [isNameModalOpen, setIsNameModalOpen] = useState<boolean>(false);
  const [pendingMode, setPendingMode] = useState<'simple' | 'server'>('server');

  const handleSelectMode = (mode: 'simple' | 'server', remember: boolean) => {
    const key = currentVideo.id || currentVideo.url;
    if (remember) {
      localStorage.setItem('valor_remote_playback_mode_default', mode);
    }
    localStorage.setItem(`valor_remote_mode_${key}`, mode);

    setIsSelectorOpen(false);

    // If media name was unrecognizable:
    // First we asked him to choose the player, now ask the name!
    if (isNameUnrecognizable) {
      setPendingMode(mode);
      setIsNameModalOpen(true);
      return;
    }

    // Media name was already recognizable, proceed directly to player!
    setPlaybackMode(mode);
    onUpdateVideo({
      ...currentVideo,
      playbackMode: mode
    } as any, false);
  };

  const handleSwitchMode = (targetMode: 'simple' | 'server') => {
    const key = currentVideo.id || currentVideo.url;
    localStorage.setItem(`valor_remote_mode_${key}`, targetMode);
    setPlaybackMode(targetMode);
  };

  const handleNameSubmitted = (enteredTitle: string, isTv: boolean, season: number, episode: number) => {
    setIsNameModalOpen(false);
    const clean = enteredTitle.trim();

    const updated: VideoItem = {
      ...currentVideo,
      playbackMode: pendingMode,
      ...(clean ? { title: clean } : {}),
      ...(isTv && season ? { season } : {}),
      ...(isTv && episode ? { episode } : {})
    };

    setCurrentVideo(updated);
    onUpdateVideo(updated, false);

    // Proceed directly to the player!
    setPlaybackMode(pendingMode);
  };

  const handleNameModalClose = () => {
    // If skipped or cancelled, proceed to player with pending mode
    setIsNameModalOpen(false);
    setPlaybackMode(pendingMode);
  };

  // Step 1: If player mode selector is active (unable to identify cinema vs personal)
  if (isSelectorOpen && playbackMode === null) {
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
        {currentVideo.backdropUrl && (
          <img 
            src={currentVideo.backdropUrl} 
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
          videoTitle={currentVideo.title || 'Remote Video'}
          currentMode={playbackMode}
          onSelectMode={handleSelectMode}
          onClose={onBack}
        />
      </div>
    );
  }

  // Step 2: If media name was unrecognizable, prompt for the name with "Enter" button
  if (isNameModalOpen) {
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
        <MediaIdentifyModal
          isOpen={true}
          videoTitle=""
          duration={parseFloat(currentVideo.duration || '0') || 0}
          onClose={handleNameModalClose}
          onSubmitName={handleNameSubmitted}
          isTvHint={pendingMode === 'server'}
          submitLabel="Enter"
          onApplyBookmarks={(bookmarks, mediaInfo) => {
            const updatedVideo: VideoItem = {
              ...currentVideo,
              ...(mediaInfo.title ? { title: mediaInfo.title } : {}),
              ...(mediaInfo.tmdbId ? { tmdbId: mediaInfo.tmdbId } : {}),
              ...(mediaInfo.imdbId ? { imdbId: mediaInfo.imdbId } : {}),
              ...(mediaInfo.season ? { season: mediaInfo.season } : {}),
              ...(mediaInfo.episode ? { episode: mediaInfo.episode } : {}),
              ...(mediaInfo.imageUrl ? { posterUrl: mediaInfo.imageUrl } : {}),
              ...(mediaInfo.rating ? { rating: mediaInfo.rating } : {}),
              ...(bookmarks && bookmarks.length > 0 ? { bookmarks } : {})
            };
            setCurrentVideo(updatedVideo);
            onUpdateVideo(updatedVideo, false);
          }}
        />
      </div>
    );
  }

  // Step 3: Run the selected player engine
  if (playbackMode === 'simple') {
    return (
      <SimpleRemotePlayer
        {...props}
        video={currentVideo}
        onSwitchMode={handleSwitchMode}
      />
    );
  }

  return (
    <RemoteServerPlayer
      {...props}
      video={currentVideo}
      onSwitchMode={handleSwitchMode}
    />
  );
};
