import React from 'react';
import { RemoteServerPlayer } from './RemoteServerPlayer';
import type { VideoPlayerProps } from './RemoteServerPlayer';

export { isGenericTitle, extractTitleFromUrl } from './RemoteServerPlayer';
export type { VideoPlayerProps };

export const RemoteVideoPlayer: React.FC<VideoPlayerProps> = (props) => {
  return (
    <RemoteServerPlayer
      {...props}
      spinnerPreset={props.spinnerPreset || 'fire-circle'}
    />
  );
};

export default RemoteVideoPlayer;
