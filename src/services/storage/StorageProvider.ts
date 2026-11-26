import type { VideoItem } from '../../types/media';

export interface StorageProvider {
  getSettings(defaultSettings: any): Promise<any>;
  saveSettings(settings: any): Promise<void>;
  getHistory(): Promise<VideoItem[]>;
  saveHistory(history: VideoItem[]): Promise<void>;
  updatePlayback(videoId: string, progress: { currentTime: number; lastPlayedDate?: string }): Promise<void>;
}
