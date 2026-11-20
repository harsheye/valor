import React from 'react';
import { LibraryView } from '../components/LibraryView';
import type { VideoItem } from '../types/media';
import type { PlaylistState } from '../hooks/usePlaylist';
import type { StoredPlaylist } from '../utils/indexedDB';

interface LibraryPageProps {
  videos: VideoItem[];
  onPlayVideo: (video: VideoItem) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
  onNavigateToSelectMedia?: () => void;
  onRemoveVideo?: (id: string, e: React.MouseEvent) => void;
  addToast?: (text: string, type?: 'success' | 'error' | 'warning', action?: any) => void;
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onSelectMedia?: (media: any) => void;
  tmdbApiKey?: string;
  playlist?: PlaylistState;
  allPlaylists?: StoredPlaylist[];
  onSwitchPlaylist?: (id: string) => Promise<any> | void;
  onDeletePlaylist?: (id: string) => Promise<void> | void;
  onCreatePlaylist?: (name?: string) => void;
  onPlayIndex?: (index: number) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  videos,
  onPlayVideo,
  isInstantlyPlayable,
  onNavigateToSelectMedia,
  onRemoveVideo,
  addToast,
  setVideos,
  onSelectMedia,
  tmdbApiKey,
  playlist,
  allPlaylists,
  onSwitchPlaylist,
  onDeletePlaylist,
  onCreatePlaylist,
  onPlayIndex
}) => {
  return (
    <LibraryView 
      videos={videos} 
      onPlayVideo={onPlayVideo} 
      isInstantlyPlayable={isInstantlyPlayable}
      onNavigateToSelectMedia={onNavigateToSelectMedia}
      onRemoveVideo={onRemoveVideo}
      addToast={addToast}
      setVideos={setVideos}
      onSelectMedia={onSelectMedia}
      tmdbApiKey={tmdbApiKey}
      playlist={playlist}
      allPlaylists={allPlaylists}
      onSwitchPlaylist={onSwitchPlaylist}
      onDeletePlaylist={onDeletePlaylist}
      onCreatePlaylist={onCreatePlaylist}
      onPlayIndex={onPlayIndex}
    />
  );
};
