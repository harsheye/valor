import type { Bookmark } from '../types/media';

/**
 * Checks whether a bookmark represents an Intro / Recap / Preview segment.
 */
export function isIntroBookmark(bm: any): boolean {
  if (!bm) return false;
  if (bm.isIntro) return true;
  const category = (bm.category || '').toLowerCase();
  if (category === 'intro' || category === 'preview' || category === 'recap') return true;
  const label = (bm.label || bm.title || '').trim().toLowerCase();
  if (label === 'intro' || label === 'opening' || label.startsWith('intro') || label.includes('recap') || label.includes('preview')) return true;
  return false;
}

/**
 * Checks whether a bookmark represents an Outro / Credits segment.
 */
export function isOutroBookmark(bm: any): boolean {
  if (!bm) return false;
  if (bm.isOutro) return true;
  const category = (bm.category || '').toLowerCase();
  if (category === 'outro' || category === 'credits') return true;
  const label = (bm.label || bm.title || '').trim().toLowerCase();
  if (label === 'outro' || label === 'credits' || label === 'credits / outro' || label.startsWith('outro') || label.startsWith('credits')) return true;
  return false;
}

/**
 * Checks whether two bookmarks represent the exact same event / timestamp / segment.
 */
export function areBookmarksEquivalent(b1: any, b2: any): boolean {
  if (!b1 || !b2) return false;

  // 1. Exact ID match
  if (b1.id && b2.id && b1.id === b2.id) {
    return true;
  }

  const t1 = Number(b1.time ?? b1.startTime ?? 0);
  const t2 = Number(b2.time ?? b2.startTime ?? 0);
  const timeDiff = Math.abs(t1 - t2);

  const b1Intro = isIntroBookmark(b1);
  const b2Intro = isIntroBookmark(b2);
  const b1Outro = isOutroBookmark(b1);
  const b2Outro = isOutroBookmark(b2);

  // 2. Both represent Intro segments within 3.5s of each other
  if (b1Intro && b2Intro && timeDiff <= 3.5) {
    return true;
  }

  // 3. Both represent Outro/Credits segments within 3.5s of each other
  if (b1Outro && b2Outro && timeDiff <= 3.5) {
    return true;
  }

  // 4. End times alignment for duration segments
  const end1 = b1.endTime !== undefined && b1.endTime !== null ? Number(b1.endTime) : undefined;
  const end2 = b2.endTime !== undefined && b2.endTime !== null ? Number(b2.endTime) : undefined;
  if (end1 !== undefined && end2 !== undefined) {
    const endTimeDiff = Math.abs(end1 - end2);
    if (timeDiff <= 2.5 && endTimeDiff <= 3.5) {
      return true;
    }
  }

  // 5. Close timestamp match (< 1.5s) with matching or default label/category
  if (timeDiff <= 1.5) {
    const l1 = (b1.label || b1.title || '').trim().toLowerCase();
    const l2 = (b2.label || b2.title || '').trim().toLowerCase();
    const isGeneric1 = !l1 || l1 === 'bookmark' || l1 === 'untitled bookmark';
    const isGeneric2 = !l2 || l2 === 'bookmark' || l2 === 'untitled bookmark';

    if (isGeneric1 || isGeneric2 || l1 === l2) {
      return true;
    }

    const c1 = (b1.category || '').trim().toLowerCase();
    const c2 = (b2.category || '').trim().toLowerCase();
    if (c1 && c2 && c1 === c2) {
      return true;
    }
  }

  return false;
}

/**
 * Merges two equivalent bookmarks, preserving richer metadata and user preferences.
 */
export function combineBookmarks<T extends Record<string, any>>(existing: T, incoming: T): T {
  const isIntro = Boolean(isIntroBookmark(existing) || isIntroBookmark(incoming));
  const isOutro = Boolean(isOutroBookmark(existing) || isOutroBookmark(incoming));
  const favorite = Boolean(existing.favorite || incoming.favorite);
  const skipEnabled = incoming.skipEnabled !== undefined ? Boolean(incoming.skipEnabled) : (existing.skipEnabled !== undefined ? Boolean(existing.skipEnabled) : true);

  const endTime = incoming.endTime !== undefined && incoming.endTime !== null 
    ? incoming.endTime 
    : existing.endTime;

  const startTime = incoming.startTime !== undefined && incoming.startTime !== null
    ? incoming.startTime
    : existing.startTime;

  // Use the earlier start time if they differ slightly
  const t1 = Number(existing.time ?? existing.startTime ?? 0);
  const t2 = Number(incoming.time ?? incoming.startTime ?? 0);
  const chosenTime = (!isNaN(t1) && !isNaN(t2) && t1 > 0 && t2 > 0) ? Math.min(t1, t2) : (t1 || t2 || 0);

  // Prefer meaningful label over default generic "Bookmark"
  const l1 = (existing.label || existing.title || '').trim();
  const l2 = (incoming.label || incoming.title || '').trim();
  let label = l1;
  if (!label || label.toLowerCase() === 'bookmark' || label.toLowerCase() === 'untitled bookmark') {
    label = l2 || label || 'Bookmark';
  }

  let title = (existing.title || incoming.title || label).trim();
  if (isIntro && (!title || title.toLowerCase() === 'bookmark')) title = 'Intro';
  if (isOutro && (!title || title.toLowerCase() === 'bookmark')) title = 'Credits / Outro';

  const category = (isIntro ? 'Intro' : (isOutro ? 'Outro' : (existing.category || incoming.category || 'Custom')));
  const createdBy = (incoming.createdBy === 'theintrodb' || incoming.createdBy === 'tidb') 
    ? incoming.createdBy 
    : (existing.createdBy || incoming.createdBy || 'manual');

  // Keep existing ID if it already exists, or incoming
  const id = existing.id || incoming.id || `bm_${chosenTime}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    ...incoming,
    ...existing,
    id,
    time: chosenTime,
    startTime: startTime ?? chosenTime,
    endTime,
    isIntro,
    isOutro,
    skipEnabled,
    favorite,
    label,
    title,
    category,
    createdBy
  };
}

/**
 * Deduplicates a list of bookmarks by removing or combining duplicate entries.
 */
export function deduplicateBookmarks<T extends Record<string, any>>(list: T[]): T[] {
  if (!Array.isArray(list) || list.length === 0) return [];

  const deduped: T[] = [];
  for (const item of list) {
    if (!item) continue;
    const existingIndex = deduped.findIndex(b => areBookmarksEquivalent(b, item));
    if (existingIndex >= 0) {
      deduped[existingIndex] = combineBookmarks(deduped[existingIndex], item);
    } else {
      deduped.push({ ...item });
    }
  }

  return deduped.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
}

/**
 * Merges two bookmark lists and returns a clean, deduplicated, time-sorted list.
 */
export function mergeBookmarksList<T extends Record<string, any>>(b1?: T[], b2?: T[]): T[] {
  return deduplicateBookmarks([...(b1 || []), ...(b2 || [])]);
}
