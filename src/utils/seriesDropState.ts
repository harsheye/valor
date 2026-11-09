/**
 * seriesDropState.ts
 * Manages persistent "Dropped" state for series in Valor library.
 * When a series is dropped, it means the user will not be watching anymore.
 */

const DROPPED_SERIES_STORAGE_KEY = 'valor_dropped_series';

function getStorageSet(): Set<string> {
  try {
    const raw = localStorage.getItem(DROPPED_SERIES_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveStorageSet(set: Set<string>): void {
  try {
    localStorage.setItem(DROPPED_SERIES_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.error('Failed to save dropped series:', err);
  }
}

export function isSeriesDropped(seriesIdOrTitle: string): boolean {
  if (!seriesIdOrTitle) return false;
  const set = getStorageSet();
  const normalized = seriesIdOrTitle.toLowerCase().trim();
  return set.has(seriesIdOrTitle) || set.has(normalized);
}

export function toggleDropSeries(seriesIdOrTitle: string): boolean {
  if (!seriesIdOrTitle) return false;
  const set = getStorageSet();
  const normalized = seriesIdOrTitle.toLowerCase().trim();
  const currentlyDropped = set.has(seriesIdOrTitle) || set.has(normalized);

  if (currentlyDropped) {
    set.delete(seriesIdOrTitle);
    set.delete(normalized);
  } else {
    set.add(normalized);
  }

  saveStorageSet(set);

  // Notify active listeners across tabs and components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('valor_dropped_series_changed', {
        detail: { seriesIdOrTitle, isDropped: !currentlyDropped }
      })
    );
  }

  return !currentlyDropped;
}
