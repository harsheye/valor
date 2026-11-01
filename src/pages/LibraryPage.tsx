import React from 'react';
import { LibraryView } from '../components/LibraryView';
import type { VideoItem } from '../types/media';

interface LibraryPageProps {
  videos: VideoItem[];
  onPlayVideo: (video: VideoItem) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
  onNavigateToSelectMedia?: () => void;
  onRemoveVideo?: (id: string, e: React.MouseEvent) => void;
  addToast?: (text: string, type?: 'success' | 'error' | 'warning', action?: any) => void;
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  videos,
  onPlayVideo,
  isInstantlyPlayable,
  onNavigateToSelectMedia,
  onRemoveVideo,
  addToast,
  setVideos
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
    />
  );
};
