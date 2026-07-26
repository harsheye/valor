import React, { useEffect, useRef } from 'react';
import { MediaPlayer, MediaPlayerOptions } from '@our-player/sdk';

export interface ValorPlayerProps extends Omit<MediaPlayerOptions, 'container'> {
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (data: { currentTime: number; duration: number }) => void;
  onSeek?: (data: { time: number }) => void;
}

export const ValorPlayer: React.FC<ValorPlayerProps> = ({
  className,
  style,
  onReady,
  onPlay,
  onPause,
  onTimeUpdate,
  onSeek,
  ...options
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<MediaPlayer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const player = new MediaPlayer({
      container: containerRef.current,
      ...options
    });
    
    playerRef.current = player;

    if (onReady) player.on('ready', onReady);
    if (onPlay) player.on('play', onPlay);
    if (onPause) player.on('pause', onPause);
    if (onTimeUpdate) player.on('time_update', onTimeUpdate);
    if (onSeek) player.on('seek', onSeek);

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [options.media]);

  // Update methods if they change, though typically in React it's better handled
  // via refs or effect dependencies. For simplicity, re-bind events isn't strictly necessary here 
  // if they are stable, but we can manage them if needed.

  return (
    <div 
      ref={containerRef} 
      className={className} 
      style={{ width: '100%', height: '100%', ...style }} 
    />
  );
};
