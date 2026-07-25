const DB_NAME = 'valor_media_db';
const STORE_NAME = 'file_handles';

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeFileHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  // Prevent storing raw Blob/File objects to avoid bloated databases
  if (handle instanceof Blob || handle instanceof File || (handle && typeof (handle as any).size === 'number')) {
    console.warn('[IndexedDB] Blocked storing raw File/Blob object in file_handles store to save storage.');
    return;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(handle, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getFileHandle(id: string): Promise<FileSystemFileHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function removeFileHandle(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function verifyPermission(fileHandle: any): Promise<boolean> {
  const options = { mode: 'read' as const };
  try {
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true;
    }
  } catch (e) {
    console.error('Permission request failed:', e);
  }
  return false;
}

export async function cleanupFileHandles(activeIds: string[]): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const activeSet = new Set(activeIds);
    
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const key = String(cursor.key);
        
        // Only delete entries for videos that are no longer in the active history list.
        // NEVER delete entries for active videos — even if they contain Blob/File objects.
        if (!activeSet.has(key)) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}
