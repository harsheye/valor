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
  type: 'local' | 'url';
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
  probingError?: string;
  playbackMode?: 'advanced' | 'native';
  lastPlayedDate?: string;
  localFilePath?: string;
}
