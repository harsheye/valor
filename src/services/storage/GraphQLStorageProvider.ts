import type { StorageProvider } from './StorageProvider';
import type { VideoItem } from '../../types/media';

export class GraphQLStorageProvider implements StorageProvider {
  private lastSyncTime: number;
  private syncTimeout: any;
  private userId: string;
  private gqlFetch: (query: string, variables?: any) => Promise<any>;

  constructor(
    userId: string,
    gqlFetch: (query: string, variables?: any) => Promise<any>
  ) {
    this.lastSyncTime = 0;
    this.syncTimeout = null;
    this.userId = userId;
    this.gqlFetch = gqlFetch;
  }

  async getSettings(defaultSettings: any): Promise<any> {
    try {
      const pData = await this.gqlFetch(`
        query GetProfileData($userId: String!) {
          profile(userId: $userId) {
            settings
          }
        }
      `, { userId: this.userId });
      
      const serverSettings = pData?.profile?.settings;
      if (serverSettings) {
        return {
          ...defaultSettings,
          ...serverSettings,
          userId: this.userId,
          storageMode: 'file',
          isOnboarded: true
        };
      }
    } catch (err) {
      console.error('Failed to get settings via GraphQL:', err);
    }
    
    // Fallback to local settings
    const settingsKey = `valor_settings_${this.userId}`;
    const localVal = localStorage.getItem(settingsKey);
    if (localVal) {
      try {
        return JSON.parse(localVal);
      } catch {}
    }
    return defaultSettings;
  }

  async saveSettings(settings: any): Promise<void> {
    try {
      await this.gqlFetch(`
        mutation SaveSettings($userId: String!, $settings: SettingsInput!) {
          saveSettings(userId: $userId, settings: $settings) {
            success
          }
        }
      `, { userId: this.userId, settings });
    } catch (err) {
      console.error('Failed to save settings via GraphQL:', err);
    }

    // Mirror to localStorage
    const settingsKey = `valor_settings_${this.userId}`;
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  }

  async getHistory(): Promise<VideoItem[]> {
    try {
      const pData = await this.gqlFetch(`
        query GetProfileData($userId: String!) {
          profile(userId: $userId) {
            history
          }
        }
      `, { userId: this.userId });

      const history = pData?.profile?.history;
      if (Array.isArray(history)) {
        return history.map((v: any) => ({
          ...v,
          audioTracks: v.audioTracks || [],
          subtitleTracks: v.subtitleTracks || []
        }));
      }
    } catch (err) {
      console.error('Failed to get history via GraphQL:', err);
    }
    
    // Fallback to local history
    const videosKey = `valor_videos_${this.userId}`;
    const localVal = localStorage.getItem(videosKey);
    if (localVal) {
      try {
        const parsed = JSON.parse(localVal);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  }

  async saveHistory(history: VideoItem[], forceSync = false): Promise<void> {
    const performSave = async () => {
      const serialized = history.map(v => ({
        id: v.id,
        title: v.title,
        url: v.type === 'url' ? v.url : '',
        type: v.type,
        fileName: v.file ? v.file.name : (v as any).fileName,
        duration: v.duration,
        currentTime: v.currentTime,
        lastPlayedDate: v.lastPlayedDate,
        totalTimeWatched: v.totalTimeWatched,
        rating: v.rating,
        timeToFinish: v.timeToFinish,
        sessions: (v as any).sessions || [],
        localFilePath: v.localFilePath,
        playedDates: v.playedDates || [],
        format: v.format,
        streams: v.streams || [],
        audioTracks: v.audioTracks || [],
        subtitleTracks: v.subtitleTracks || [],
        bookmarks: v.bookmarks || [],
        episode: v.episode,
        season: v.season,
        color: (v as any).color,
        tmdbId: v.tmdbId,
        hasScrobbledTrakt: v.hasScrobbledTrakt
      }));

      const saveHistoryMut = `
        mutation SaveHistory($userId: String!, $history: [HistoryInput!]!) {
          saveHistory(userId: $userId, history: $history) {
            success
          }
        }
      `;

      try {
        await this.gqlFetch(saveHistoryMut, { userId: this.userId, history: serialized });
      } catch (err) {
        console.error('Failed to sync history via GraphQL:', err);
      }
    };

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    if (forceSync) {
      this.lastSyncTime = Date.now();
      await performSave();
    } else {
      const now = Date.now();
      if (now - this.lastSyncTime > 10000) {
        this.lastSyncTime = now;
        await performSave();
      } else {
        this.syncTimeout = setTimeout(async () => {
          this.lastSyncTime = Date.now();
          await performSave();
        }, 10000);
      }
    }
  }

  async updatePlayback(_videoId: string, _progress: { currentTime: number; lastPlayedDate?: string }): Promise<void> {
    // Handled via periodic saveHistory cycles in the UI layer
  }
}
