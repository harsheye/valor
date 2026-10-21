export interface MediaAuthCredentials {
  username: string;
  password?: string;
}

const STORAGE_PREFIX = 'valor_media_auth_';

export function getHostKey(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.toLowerCase();
  } catch {
    return 'unknown_host';
  }
}

export function getSavedCredentials(urlStr: string): MediaAuthCredentials | null {
  try {
    const host = getHostKey(urlStr);
    const raw = localStorage.getItem(STORAGE_PREFIX + host);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string') {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveCredentials(urlStr: string, creds: MediaAuthCredentials): void {
  try {
    const host = getHostKey(urlStr);
    localStorage.setItem(STORAGE_PREFIX + host, JSON.stringify(creds));
  } catch {
    // ignore
  }
}

export function clearCredentials(urlStr: string): void {
  try {
    const host = getHostKey(urlStr);
    localStorage.removeItem(STORAGE_PREFIX + host);
  } catch {
    // ignore
  }
}
