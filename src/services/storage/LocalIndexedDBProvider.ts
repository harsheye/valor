import type { StorageProvider } from './StorageProvider';
import type { VideoItem } from '../../types/media';

const DB_NAME = 'valor_local_storage_db';
const STORE_NAME = 'key_value';

export class LocalIndexedDBProvider implements StorageProvider {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        this.migrateFromLocalStorage(db)
          .then(() => resolve(db))
          .catch(() => resolve(db)); // Proceed anyway
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async get(key: string): Promise<any> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result !== undefined ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  }

  private async set(key: string, value: any): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
    const migrationFlag = 'valor_indexeddb_migrated';
    if (localStorage.getItem(migrationFlag)) {
      return;
    }

    console.log('[IndexedDB Migration] Migrating legacy localStorage data to IndexedDB...');
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const keysToMigrate = Object.keys(localStorage).filter(
      key => key.startsWith('valor_') && key !== migrationFlag
    );

    return new Promise<void>((resolve) => {
      let count = keysToMigrate.length;
      if (count === 0) {
        localStorage.setItem(migrationFlag, 'true');
        resolve();
        return;
      }

      let succeeded = 0;
      let failed = 0;

      const checkDone = () => {
        if (succeeded + failed === count) {
          localStorage.setItem(migrationFlag, 'true');
          console.log(`[IndexedDB Migration] Completed: migrated ${succeeded} keys to IndexedDB.`);
          resolve();
        }
      };

      for (const key of keysToMigrate) {
        try {
          const val = localStorage.getItem(key);
          if (val !== null) {
            let parsedVal = val;
            try {
              parsedVal = JSON.parse(val);
            } catch {}
            const req = store.put(parsedVal, key);
            req.onsuccess = () => {
              succeeded++;
              checkDone();
            };
            req.onerror = () => {
              failed++;
              checkDone();
            };
          } else {
            failed++;
            checkDone();
          }
        } catch {
          failed++;
          checkDone();
        }
      }
    });
  }

  private getActiveUserId(): string {
    return localStorage.getItem('valor_active_user_id') || 'local';
  }

  async getSettings(defaultSettings: any): Promise<any> {
    const activeUserId = this.getActiveUserId();
    const settingsKey = activeUserId === 'local' ? 'valor_settings' : `valor_settings_${activeUserId}`;
    
    // First try IndexedDB
    const idbVal = await this.get(settingsKey);
    if (idbVal) return idbVal;

    // Fallback to localStorage if IndexedDB not initialized yet or query failed
    const localVal = localStorage.getItem(settingsKey);
    if (localVal) {
      try {
        return JSON.parse(localVal);
      } catch {}
    }
    return defaultSettings;
  }

  async saveSettings(settings: any): Promise<void> {
    const activeUserId = this.getActiveUserId();
    const settingsKey = activeUserId === 'local' ? 'valor_settings' : `valor_settings_${activeUserId}`;
    await this.set(settingsKey, settings);
    
    // Mirror to localStorage so it is available synchronously on startup
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  }

  async getHistory(): Promise<VideoItem[]> {
    const activeUserId = this.getActiveUserId();
    const videosKey = activeUserId === 'local' ? 'valor_videos' : `valor_videos_${activeUserId}`;
    
    const idbVal = await this.get(videosKey);
    if (Array.isArray(idbVal)) {
      // Auto-purge any bloated File objects from previous versions to reclaim space
      const needsPurge = idbVal.some(v => v.file !== undefined);
      if (needsPurge) {
        console.log('[IndexedDB] Purging bloated File objects from history to reclaim space...');
        const sanitizedHistory = idbVal.map(item => {
          const { file, ...rest } = item;
          return rest as VideoItem;
        });
        await this.set(videosKey, sanitizedHistory);
        return sanitizedHistory;
      }
      return idbVal;
    }

    const localVal = localStorage.getItem(videosKey);
    if (localVal) {
      try {
        const parsed = JSON.parse(localVal);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  }

  async saveHistory(history: VideoItem[]): Promise<void> {
    const activeUserId = this.getActiveUserId();
    const videosKey = activeUserId === 'local' ? 'valor_videos' : `valor_videos_${activeUserId}`;
    
    // Strip the raw 'file' object before saving to prevent IndexedDB from storing massive video blobs
    const sanitizedHistory = history.map(item => {
      const { file, ...rest } = item;
      return rest as VideoItem;
    });
    
    await this.set(videosKey, sanitizedHistory);
  }

  async updatePlayback(videoId: string, progress: { currentTime: number; lastPlayedDate?: string }): Promise<void> {
    const history = await this.getHistory();
    const updated = history.map(item => {
      if (item.id === videoId) {
        return {
          ...item,
          currentTime: progress.currentTime,
          lastPlayedDate: progress.lastPlayedDate || new Date().toISOString()
        };
      }
      return item;
    });
    await this.saveHistory(updated);
  }
}
