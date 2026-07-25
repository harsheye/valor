import React from 'react';
import { LibraryView } from '../components/LibraryView';
import type { VideoItem } from '../types/media';

interface LibraryPageProps {
  videos: VideoItem[];
  onPlayVideo: (video: VideoItem) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  videos,
  onPlayVideo,
  isInstantlyPlayable,
}) => {
  return (
    <LibraryView 
      videos={videos} 
      onPlayVideo={onPlayVideo} 
      isInstantlyPlayable={isInstantlyPlayable}
    />
  );
};
