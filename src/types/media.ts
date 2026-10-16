import type { MediaStream } from '../services/ffmpeg';
import type { SubtitleCue } from '../utils/subtitleParser';

export interface CustomAudioTrack {
  id: string;
  name: string;
  url: string;
  isExtracted: boolean;
  streamIndex?: number;
  language?: string;
  codec?: string;
}

export interface CustomSubtitleTrack {
  id: string;
  name: string;
  url: string;
  cues: SubtitleCue[];
  isExtracted: boolean;
  streamIndex?: number;
  language?: string;
  format?: 'srt' | 'vtt' | 'ass';
}

export interface VideoItem {
  id: string;
  title: string;
  url: string;
  type: 'local' | 'url' | 'online_movie' | 'online_tv' | 'online_anime';
  file?: File;
  fileName?: string;
  duration?: string;
  format?: string;
  streams?: MediaStream[];
  audioTracks: CustomAudioTrack[];
  subtitleTracks: CustomSubtitleTrack[];
  isRemote?: boolean;
  containerType?: 'mp4' | 'mkv' | 'ts' | 'hls' | 'unknown';
  seekMap?: { time: number; offset: number }[];
  timecodeScale?: number;
  hlsPlaylist?: any;
  thumbnailUrl?: string;
  currentTime?: number;
  resumeTime?: number;
  probingError?: string;
  playbackMode?: 'advanced' | 'native';
  lastPlayedDate?: string;
  localFilePath?: string;
  playedDates?: string[];
  rating?: number;
  totalTimeWatched?: number;
  timeToFinish?: number;
  bookmarks?: Bookmark[];
  tmdbId?: number;
  anilistId?: number;
  posterPath?: string;
  season?: number;
  episode?: number;
  hasScrobbledTrakt?: boolean;
}

export interface Bookmark {
  id: string;
  time: number;
  endTime?: number;
  label: string;
  isIntro?: boolean;
  isOutro?: boolean;
  skipEnabled?: boolean;
  title?: string;
  description?: string;
  category?: string;
  startTime?: number;
  thumbnail?: string;
  favorite?: boolean;
  createdAt?: string;
  updatedAt?: string;
  episode?: number;
  season?: number;
  color?: string;
  createdBy?: 'theintrodb' | 'manual' | 'system';
  tmdbId?: number;
  userName?: string;
  userTime?: string;
  mediaName?: string;
  userId?: string;
}
