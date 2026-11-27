import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Film, Tv, Plus, SearchX, List, Play, Trash2, ArrowLeft, ChevronUp, ChevronDown, Edit3, Clock, X } from 'lucide-react';
import type { VideoItem } from '../types/media';
import type { PlaylistState } from '../hooks/usePlaylist';
import {
  getAllPlaylistsFromStore,
  deletePlaylistFromStore,
  savePlaylistToStore,
  storeFileHandle,
  type StoredPlaylist
} from '../utils/indexedDB';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import {
  buildMovieViewModel,
  buildEpisodeViewModel,
  buildSeriesViewModel,
  sortMediaItems,
  filterMediaItems,
  getCustomRenames,
  setCustomRename,
  type SortOption,
  type FilterOption,
  type BaseMediaViewModel,
  type SeriesViewModel
} from '../utils/libraryViewModel';
import { LibraryToolbar } from './library/LibraryToolbar';
import { MediaPosterCard } from './library/MediaPosterCard';
import { MediaListRow } from './library/MediaListRow';
import { SeriesDetailPage } from './library/SeriesDetailPage';
import { LibraryRenameModal } from './library/LibraryRenameModal';
import '../styles/library.css';

function getHueForPlaylist(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

function getGlyphForPlaylist(name: string): string {
  const match = name.trim().match(/[a-zA-Z0-9]/);
  return match ? match[0].toUpperCase() : 'P';
}

interface LibraryViewProps {
  videos: VideoItem[];
  onPlayVideo: (video: VideoItem) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
  onNavigateToSelectMedia?: () => void;
  onRemoveVideo?: (id: string, e: React.MouseEvent) => void;
  addToast?: (text: string, type?: 'success' | 'error' | 'warning', action?: any) => void;
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onSelectMedia?: (media: any) => void;
  tmdbApiKey?: string;
  playlist?: PlaylistState;
  allPlaylists?: StoredPlaylist[];
  onSwitchPlaylist?: (id: string) => Promise<any> | void;
  onDeletePlaylist?: (id: string) => Promise<void> | void;
  onCreatePlaylist?: (name?: string) => void;
  onPlayIndex?: (index: number) => void;
}

const PREFS_STORAGE_KEY = 'valor_library_prefs';

interface LibraryPreferences {
  activeTab: 'movies' | 'series' | 'playlists';
  viewMode: 'grid' | 'list';
  moviesSort: SortOption;
  seriesSort: SortOption;
  playlistsSort?: SortOption;
  moviesFilter: FilterOption;
  seriesFilter: FilterOption;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  videos,
  onPlayVideo,
  isInstantlyPlayable,
  onNavigateToSelectMedia,
  onRemoveVideo,
  addToast,
  setVideos,
  onSelectMedia,
  tmdbApiKey,
  playlist,
  allPlaylists,
  onSwitchPlaylist,
  onDeletePlaylist,
  onCreatePlaylist,
  onPlayIndex,
}) => {
  // 1. Persistent Library Preferences
  const [prefs, setPrefs] = useState<LibraryPreferences>(() => {
    try {
      const saved = localStorage.getItem(PREFS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      activeTab: 'movies',
      viewMode: 'grid',
      moviesSort: 'recently-added',
      seriesSort: 'recently-added',
      playlistsSort: 'recently-added',
      moviesFilter: 'all',
      seriesFilter: 'all'
    };
  });

  const updatePrefs = useCallback((updater: (prev: LibraryPreferences) => LibraryPreferences) => {
    setPrefs(prev => {
      const next = updater(prev);
      try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // 2. Active Tab & Search States
  const activeTab = prefs.activeTab;
  const viewMode = prefs.viewMode;
  const sortBy = activeTab === 'movies' ? prefs.moviesSort : (activeTab === 'series' ? prefs.seriesSort : (prefs.playlistsSort || 'recently-added'));
  const filterBy = activeTab === 'movies' ? prefs.moviesFilter : (activeTab === 'series' ? prefs.seriesFilter : 'all');

  // Stored playlists management
  const [storedPlaylists, setStoredPlaylists] = useState<StoredPlaylist[]>(allPlaylists || []);
  useEffect(() => {
    let active = true;
    getAllPlaylistsFromStore().then(pls => {
      if (active && pls) setStoredPlaylists(pls);
    }).catch(() => {});
    return () => { active = false; };
  }, [allPlaylists]);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalTitle, setCreateModalTitle] = useState('');

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<{ id: string; currentTitle: string } | null>(null);
  const [renamesVersion, setRenamesVersion] = useState(0);
  const [cacheVersion, setCacheVersion] = useState(0);

  // Listen to series cache and dropped updates to refresh series counts in real time
  useEffect(() => {
    const handleUpdate = () => {
      setCacheVersion(v => v + 1);
    };
    window.addEventListener('valor_series_cache_updated', handleUpdate);
    window.addEventListener('valor_dropped_series_changed', handleUpdate);
    return () => {
      window.removeEventListener('valor_series_cache_updated', handleUpdate);
      window.removeEventListener('valor_dropped_series_changed', handleUpdate);
    };
  }, []);

  // Element refs for keyboard navigation and focus restoration
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const lastFocusedCardIdRef = useRef<string | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search input (~150ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 3. Browser Back & Hash Navigation for Series Detail Page
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#series=')) {
        const seriesId = decodeURIComponent(hash.slice(8));
        setSelectedSeriesId(seriesId);
      } else {
        setSelectedSeriesId(null);
        // Restore focus to card that was opened
        if (lastFocusedCardIdRef.current) {
          const target = cardRefs.current[lastFocusedCardIdRef.current];
          target?.focus();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    // Initial check if opened with hash
    if (window.location.hash.startsWith('#series=')) {
      setSelectedSeriesId(decodeURIComponent(window.location.hash.slice(8)));
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 4. Derive View Models at Render Time
  const customRenames = useMemo(() => {
    return getCustomRenames();
  }, [renamesVersion]);

  // Split into Movies and Series items
  const { movieViewModels, seriesViewModels } = useMemo(() => {
    const moviesList: BaseMediaViewModel[] = [];
    const seriesEpisodesMap: Record<string, VideoItem[]> = {};

    videos.forEach(v => {
      const classified = classifyVideoTitle(v.title);
      if (classified.type === 'series') {
        const sKey = (classified.seriesTitle || 'Unknown Series').toLowerCase().trim();
        if (!seriesEpisodesMap[sKey]) {
          seriesEpisodesMap[sKey] = [];
        }
        seriesEpisodesMap[sKey].push(v);
      } else {
        moviesList.push(buildMovieViewModel(v, customRenames));
      }
    });

    const seriesList: SeriesViewModel[] = Object.entries(seriesEpisodesMap).map(([_, epVideos]) => {
      const epViewModels = epVideos.map(v => buildEpisodeViewModel(v, customRenames));
      const sTitle = epViewModels[0]?.seriesTitle || 'Unknown Series';
      return buildSeriesViewModel(sTitle, epViewModels, customRenames);
    });

    return {
      movieViewModels: moviesList,
      seriesViewModels: seriesList
    };
  }, [videos, customRenames, cacheVersion]);

  // Filter & Sort Movies
  const filteredMovies = useMemo(() => {
    const filtered = filterMediaItems(movieViewModels, filterBy, debouncedQuery);
    return sortMediaItems(filtered, sortBy);
  }, [movieViewModels, filterBy, debouncedQuery, sortBy]);

  // Filter & Sort Series
  const filteredSeries = useMemo(() => {
    const filtered = filterMediaItems(seriesViewModels, filterBy, debouncedQuery);
    return sortMediaItems(filtered, sortBy);
  }, [seriesViewModels, filterBy, debouncedQuery, sortBy]);

  // Currently viewing Series detail (if selected)
  const currentSelectedSeries = useMemo(() => {
    if (!selectedSeriesId) return null;
    return seriesViewModels.find(s => s.id === selectedSeriesId) || null;
  }, [selectedSeriesId, seriesViewModels]);

  // Play series helper: correctly resumes local or online episodes
  const handlePlaySeries = (series: SeriesViewModel) => {
    const ep = series.primaryEpisode;
    if (!ep) return;
    if (ep.file || ep.url || (ep as any).localFilePath) {
      onPlayVideo(ep);
      return;
    }
    if ((ep.type === 'online_tv' || ep.type === 'online_movie' || !ep.url) && onSelectMedia) {
      onSelectMedia(ep);
      return;
    }
    onPlayVideo(ep);
  };

  // Open series handler
  const handleOpenSeries = (series: SeriesViewModel) => {
    lastFocusedCardIdRef.current = series.id;
    setSelectedSeriesId(series.id);
    window.history.pushState({ seriesId: series.id }, '', `#series=${encodeURIComponent(series.id)}`);
  };

  // Back from series handler
  const handleBackFromSeries = () => {
    if (window.location.hash.startsWith('#series=')) {
      window.history.back();
    } else {
      setSelectedSeriesId(null);
      if (lastFocusedCardIdRef.current) {
        cardRefs.current[lastFocusedCardIdRef.current]?.focus();
      }
    }
  };

  // Toggle Watched status for an item
  const handleToggleWatched = (item: BaseMediaViewModel) => {
    if (setVideos) {
      setVideos(prev => prev.map(v => {
        if (v.id === item.id) {
          const isNowWatched = item.status !== 'watched';
          return {
            ...v,
            completed: isNowWatched,
            currentTime: isNowWatched ? (item.durationSec || 1) : 0
          } as any;
        }
        return v;
      }));
    }
    if (addToast) {
      addToast(
        item.status === 'watched' ? 'Marked as unwatched' : 'Marked as watched',
        'success'
      );
    }
  };

  // Remove handler
  const handleRemoveItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemoveVideo) {
      onRemoveVideo(id, e);
    } else if (setVideos) {
      const removed = videos.find(v => v.id === id);
      setVideos(prev => prev.filter(v => v.id !== id));
      if (addToast && removed) {
        addToast('Removed from library', 'success', {
          actionLabel: 'Undo',
          onAction: () => {
            setVideos(prev => [removed, ...prev]);
          }
        });
      }
    }
  };

  // Save rename handler
  const handleSaveRename = (newTitle: string) => {
    if (renameTarget) {
      setCustomRename(renameTarget.id, newTitle);
      setRenamesVersion(v => v + 1);
      if (addToast) {
        addToast(`Renamed to "${newTitle}"`, 'success');
      }
    }
  };

  // Playlists filtering and sorting
  const filteredPlaylists = useMemo(() => {
    let list: StoredPlaylist[] = ((storedPlaylists && storedPlaylists.length > 0) ? storedPlaylists : (allPlaylists || []))
      .filter(p => !((!p.items || p.items.length === 0) && p.name === 'New Playlist'));
    if (playlist && playlist.items && playlist.items.length > 0 && !list.some(p => p.id === playlist.id)) {
      list = [{
        id: playlist.id,
        name: playlist.name,
        version: playlist.version,
        rootHandle: playlist.rootHandle,
        items: playlist.items.map(it => ({
          id: it.id,
          fingerprint: it.fingerprint,
          name: it.name,
          title: it.title,
          fileName: it.fileName,
          size: it.size,
          lastModified: it.lastModified,
          durationSec: it.durationSec,
          duration: it.duration,
          savedTime: it.savedTime,
          isWatched: it.isWatched,
        })),
        currentIndex: playlist.currentIndex,
        repeat: playlist.repeat,
        shuffle: playlist.shuffle,
        trackPrefs: playlist.trackPrefs,
        updatedAt: playlist.updatedAt
      }, ...list];
    }

    if (!debouncedQuery) return list;
    const q = debouncedQuery.toLowerCase();
    return list.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) ||
      p.items.some(it => (it.name && it.name.toLowerCase().includes(q)) || ((it as any).title && (it as any).title.toLowerCase().includes(q)))
    );
  }, [storedPlaylists, allPlaylists, playlist, debouncedQuery]);

  const handlePlayPlaylist = async (pl: StoredPlaylist) => {
    if (onSwitchPlaylist) {
      await onSwitchPlaylist(pl.id);
    } else if (onPlayIndex) {
      onPlayIndex(pl.currentIndex >= 0 ? pl.currentIndex : 0);
    }
  };

  const handleDeletePlaylist = async (plId: string, plName: string) => {
    try {
      if (onDeletePlaylist) {
        await onDeletePlaylist(plId);
      } else {
        await deletePlaylistFromStore(plId);
      }
      setStoredPlaylists(prev => prev.filter(p => p.id !== plId));
      if (selectedPlaylistId === plId) setSelectedPlaylistId(null);
      if (addToast) {
        addToast(`Playlist "${plName}" deleted`, 'success');
      }
    } catch {
      if (addToast) addToast('Failed to delete playlist', 'error');
    }
  };

  const currentSelectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    return filteredPlaylists.find(p => p.id === selectedPlaylistId) || null;
  }, [selectedPlaylistId, filteredPlaylists]);

  const handleCreatePlaylist = async (name: string) => {
    const finalName = name.trim() || 'New Playlist';
    const newId = `pl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newPl: StoredPlaylist = {
      id: newId,
      name: finalName,
      version: 1,
      items: [],
      currentIndex: -1,
      repeat: 'off',
      shuffle: false,
      updatedAt: Date.now()
    };
    try {
      await savePlaylistToStore(newPl);
      setStoredPlaylists(prev => [newPl, ...prev]);
      setSelectedPlaylistId(newId);
      if (onCreatePlaylist) onCreatePlaylist(finalName);
      if (addToast) addToast(`Playlist "${finalName}" created`, 'success');
    } catch {
      if (addToast) addToast('Failed to create playlist', 'error');
    }
  };

  const handleReorderPlaylistItem = async (plId: string, fromIdx: number, toIdx: number) => {
    const pl = storedPlaylists.find(p => p.id === plId) || (playlist?.id === plId ? (playlist as any) : null);
    if (!pl || fromIdx < 0 || toIdx < 0 || fromIdx >= pl.items.length || toIdx >= pl.items.length || fromIdx === toIdx) return;
    const items = [...pl.items];
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);

    const updatedPl: StoredPlaylist = {
      ...pl,
      items,
      updatedAt: Date.now()
    };
    try {
      await savePlaylistToStore(updatedPl);
      setStoredPlaylists(prev => prev.map(p => p.id === plId ? updatedPl : p));
      if (playlist && playlist.id === plId) {
        (playlist as any).items = items;
      }
    } catch {}
  };

  const handleRemovePlaylistItem = async (plId: string, itemIdx: number) => {
    const pl = storedPlaylists.find(p => p.id === plId) || (playlist?.id === plId ? (playlist as any) : null);
    if (!pl || itemIdx < 0 || itemIdx >= pl.items.length) return;
    const remaining = pl.items.filter((_: any, idx: number) => idx !== itemIdx);
    const updatedPl: StoredPlaylist = {
      ...pl,
      items: remaining,
      currentIndex: Math.min(pl.currentIndex, remaining.length - 1),
      updatedAt: Date.now()
    };
    try {
      await savePlaylistToStore(updatedPl);
      setStoredPlaylists(prev => prev.map(p => p.id === plId ? updatedPl : p));
      if (playlist && playlist.id === plId) {
        (playlist as any).items = remaining;
      }
      if (addToast) addToast('Item removed from playlist', 'success');
    } catch {}
  };

  const handlePlayPlaylistItem = async (pl: StoredPlaylist, itemIdx: number) => {
    if (onSwitchPlaylist) {
      await onSwitchPlaylist(pl.id);
      if (onPlayIndex) onPlayIndex(itemIdx);
    } else if (onPlayIndex) {
      onPlayIndex(itemIdx);
    }
  };

  const handlePickFilesForPlaylist = async (targetPlaylistId: string) => {
    const pl = storedPlaylists.find(p => p.id === targetPlaylistId) || (playlist?.id === targetPlaylistId ? (playlist as any) : null);
    if (!pl) return;

    const appendFiles = async (files: File[], handles?: FileSystemFileHandle[]) => {
      if (!files || files.length === 0) return;
      const newItems = [...pl.items];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const h = handles?.[i];
        const fp = `local-${f.name}_${f.size}_${f.lastModified}`;
        if (h) {
          await storeFileHandle(fp, h).catch(() => {});
          await storeFileHandle(`local-${fp}`, h).catch(() => {});
          await storeFileHandle(f.name, h).catch(() => {});
        }
        if (!newItems.some((it: any) => it.id === fp || it.fingerprint === fp || it.fileName === f.name)) {
          newItems.push({
            id: fp,
            fingerprint: fp,
            name: f.name,
            title: f.name.replace(/\.[^/.]+$/, ''),
            fileName: f.name,
            type: 'local',
            file: f
          } as any);
        }
      }
      const updated: StoredPlaylist = {
        ...pl,
        items: newItems,
        updatedAt: Date.now()
      };
      await savePlaylistToStore(updated);
      setStoredPlaylists(prev => prev.map(p => p.id === pl.id ? updated : p));
      if (playlist && playlist.id === pl.id) {
        (playlist as any).items = newItems;
      }
      if (addToast) addToast(`Added ${files.length} track(s) to playlist`, 'success');
    };

    if ('showOpenFilePicker' in window) {
      try {
        const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Video Files',
            accept: {
              'video/*': ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v']
            }
          }]
        });
        if (handles && handles.length > 0) {
          const files = await Promise.all(handles.map(h => h.getFile()));
          await appendFiles(files, handles);
        }
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('showOpenFilePicker failed, falling back to input:', err);
      }
    }

    // Fallback to multiple file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,.mp4,.mkv,.webm,.mov,.avi,.m4v';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      if (input.files && input.files.length > 0) {
        const fileList = Array.from(input.files);
        await appendFiles(fileList);
      }
      input.remove();
    };
    input.click();
  };

  // 5. Keyboard Navigation (Roving tabindex & Arrow navigation in Grid)
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const currentList = activeTab === 'movies' ? filteredMovies : filteredSeries;

  const handleGridKeyDown = (e: React.KeyboardEvent, index: number) => {
    const count = currentList.length;
    if (count === 0) return;

    // Calculate grid columns dynamically
    const container = gridContainerRef.current;
    let cols = 1;
    if (container && viewMode === 'grid') {
      const card = container.firstElementChild as HTMLElement;
      if (card) {
        const cardWidth = card.getBoundingClientRect().width;
        const containerWidth = container.getBoundingClientRect().width;
        cols = Math.max(1, Math.floor(containerWidth / (cardWidth + 16)));
      }
    }

    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (index + 1) % count;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (index - 1 + count) % count;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (viewMode === 'grid') {
        nextIndex = Math.min(count - 1, index + cols);
      } else {
        nextIndex = (index + 1) % count;
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (viewMode === 'grid') {
        nextIndex = Math.max(0, index - cols);
      } else {
        nextIndex = (index - 1 + count) % count;
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = count - 1;
    }

    if (nextIndex !== index) {
      setFocusedIndex(nextIndex);
      const nextItem = currentList[nextIndex];
      if (nextItem) {
        cardRefs.current[nextItem.id]?.focus();
      }
    }
  };

  return (
    <div className="library-page-wrapper">
      {/* Visually Hidden h1 */}
      <h1 className="visually-hidden" style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        border: 0
      }}>
        Library
      </h1>

      {/* Series Detail Page (Replaces master-detail split) */}
      {currentSelectedSeries ? (
        <SeriesDetailPage
          series={currentSelectedSeries}
          onBack={handleBackFromSeries}
          onPlayEpisode={(epVideo) => onPlayVideo(epVideo)}
          onSelectMedia={onSelectMedia}
          tmdbApiKey={tmdbApiKey}
        />
      ) : currentSelectedPlaylist ? (
        /* Playlist Detail Page: Styled like SeriesDetailPage */
        (() => {
          const plHue = getHueForPlaylist(currentSelectedPlaylist.name || 'Playlist');
          const plTileBg = `hsl(${plHue}, 22%, var(--tile-l, 22%))`;
          const plTileGlyphColor = `hsl(${plHue}, 38%, var(--tile-glyph-l, 74%))`;
          const plGlyph = getGlyphForPlaylist(currentSelectedPlaylist.name || 'Playlist');

          return (
            <div className="library-content-container" style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
              {/* Back to All Playlists Link matching SeriesDetailPage */}
              <button
                type="button"
                className="series-back-link"
                onClick={() => setSelectedPlaylistId(null)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-2, rgba(255,255,255,0.7))',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: '1.25rem',
                  padding: 0
                }}
              >
                <ArrowLeft size={16} />
                <span>All playlists</span>
              </button>

              {/* Playlist Hero Header matching SeriesDetailPage */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.5rem',
                padding: '1.25rem 1.5rem',
                backgroundColor: 'var(--surface-1, rgba(255,255,255,0.03))',
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 'var(--radius-md, 12px)',
                flexWrap: 'wrap',
                position: 'relative',
                marginBottom: '1.5rem'
              }}>
                {/* Poster Tile (84x126px, 2:3 ratio) */}
                <div style={{
                  width: '84px',
                  height: '126px',
                  borderRadius: 'var(--radius-sm, 8px)',
                  overflow: 'hidden',
                  backgroundColor: plTileBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  position: 'relative'
                }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 600, color: plTileGlyphColor, fontFamily: 'var(--font-display)' }}>
                    {plGlyph}
                  </span>
                </div>

                {/* Playlist Metadata & Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h2 style={{
                      margin: 0,
                      fontSize: '1.35rem',
                      fontWeight: 700,
                      color: 'var(--text-1, #fff)',
                      lineHeight: 1.2
                    }}>
                      {currentSelectedPlaylist.name || 'Untitled Playlist'}
                    </h2>
                  </div>

                  <div style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-2, rgba(255,255,255,0.7))',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    <span>{currentSelectedPlaylist.items.length} {currentSelectedPlaylist.items.length === 1 ? 'track' : 'tracks'}</span>
                    <span>•</span>
                    <span>Last updated {new Date(currentSelectedPlaylist.updatedAt || Date.now()).toLocaleDateString()}</span>
                  </div>

                  {/* Action Buttons: Play All + Add Media + Delete Playlist */}
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {currentSelectedPlaylist.items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handlePlayPlaylist(currentSelectedPlaylist)}
                        style={{
                          background: 'var(--accent, #e50914)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 'var(--radius-sm, 8px)',
                          padding: '8px 18px',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        <Play size={16} fill="currentColor" stroke="none" />
                        <span>Play All</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handlePickFilesForPlaylist(currentSelectedPlaylist.id)}
                      style={{
                        background: 'var(--surface-2, rgba(255,255,255,0.08))',
                        color: 'var(--text-1, #fff)',
                        border: '1px solid var(--border, rgba(255,255,255,0.15))',
                        borderRadius: 'var(--radius-sm, 8px)',
                        padding: '8px 16px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                      title="Open file picker to add videos to this playlist"
                    >
                      <Plus size={15} />
                      <span>Add Media</span>
                    </button>

                    </div>
                </div>
              </div>

              {/* Tracks Section Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-2, rgba(255,255,255,0.8))' }}>
                  Tracks ({currentSelectedPlaylist.items.length})
                </h3>
                <button
                  type="button"
                  onClick={() => handlePickFilesForPlaylist(currentSelectedPlaylist.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent, #e50914)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Plus size={14} />
                  <span>Add Media</span>
                </button>
              </div>

              {/* Tracks List / Empty State */}
              {currentSelectedPlaylist.items.length === 0 ? (
                <div style={{
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  background: 'var(--surface-1, rgba(255,255,255,0.02))',
                  borderRadius: 'var(--radius-md, 12px)',
                  border: '1px dashed var(--border, rgba(255,255,255,0.12))',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <p style={{ margin: 0, color: 'var(--text-3, rgba(255,255,255,0.6))', fontSize: '0.92rem' }}>
                    This playlist is empty. Add videos using the media picker below.
                  </p>
                  <button
                    type="button"
                    onClick={() => handlePickFilesForPlaylist(currentSelectedPlaylist.id)}
                    style={{
                      background: 'var(--accent, #e50914)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm, 8px)',
                      padding: '9px 18px',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Plus size={15} />
                    <span>Add Media</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {currentSelectedPlaylist.items.map((it, idx) => (
                    <div
                      key={it.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--surface-1, rgba(255,255,255,0.03))',
                        border: '1px solid var(--border, rgba(255,255,255,0.08))',
                        borderRadius: 'var(--radius-sm, 8px)',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                        {/* Track Code Badge matching Series episode badge */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <button
                              type="button"
                              title="Move Up"
                              disabled={idx === 0}
                              onClick={() => handleReorderPlaylistItem(currentSelectedPlaylist.id, idx, idx - 1)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: idx === 0 ? 'rgba(255,255,255,0.12)' : 'var(--text-3, rgba(255,255,255,0.7))',
                                cursor: idx === 0 ? 'default' : 'pointer',
                                padding: 0,
                                display: 'flex'
                              }}
                            >
                              <ChevronUp size={13} />
                            </button>
                            <button
                              type="button"
                              title="Move Down"
                              disabled={idx === currentSelectedPlaylist.items.length - 1}
                              onClick={() => handleReorderPlaylistItem(currentSelectedPlaylist.id, idx, idx + 1)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: idx === currentSelectedPlaylist.items.length - 1 ? 'rgba(255,255,255,0.12)' : 'var(--text-3, rgba(255,255,255,0.7))',
                                cursor: idx === currentSelectedPlaylist.items.length - 1 ? 'default' : 'pointer',
                                padding: 0,
                                display: 'flex'
                              }}
                            >
                              <ChevronDown size={13} />
                            </button>
                          </div>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--text-3, rgba(255,255,255,0.6))',
                            background: 'var(--surface-2, rgba(255,255,255,0.06))',
                            borderRadius: '4px',
                            padding: '3px 6px',
                            minWidth: '28px',
                            textAlign: 'center'
                          }}>
                            #{String(idx + 1).padStart(2, '0')}
                          </span>
                        </div>

                        {/* Track Title and Filename */}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-1, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {(it as any).title || it.name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-3, rgba(255,255,255,0.5))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {it.name}
                          </div>
                        </div>
                      </div>

                      {/* Actions: Play Track & Remove Item */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handlePlayPlaylistItem(currentSelectedPlaylist, idx)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--accent, #e50914)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <Play size={12} fill="currentColor" /> Play
                        </button>
                        <button
                          type="button"
                          title="Remove from playlist"
                          onClick={() => handleRemovePlaylistItem(currentSelectedPlaylist.id, idx)}
                          style={{
                            background: 'transparent',
                            color: 'var(--text-3, rgba(255,255,255,0.5))',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px',
                            display: 'flex'
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        /* Normal Library Browser */
        <div className="library-content-container">
          {/* Sticky Toolbar */}
          <LibraryToolbar
            activeTab={activeTab}
            onTabChange={(tab) => updatePrefs(p => ({ ...p, activeTab: tab }))}
            moviesCount={movieViewModels.length}
            seriesCount={seriesViewModels.length}
            playlistsCount={filteredPlaylists.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={(sort) => {
              if (activeTab === 'movies') updatePrefs(p => ({ ...p, moviesSort: sort }));
              else if (activeTab === 'series') updatePrefs(p => ({ ...p, seriesSort: sort }));
              else updatePrefs(p => ({ ...p, playlistsSort: sort }));
            }}
            viewMode={viewMode}
            onViewModeChange={(mode) => updatePrefs(p => ({ ...p, viewMode: mode }))}
            filterBy={filterBy}
            onFilterChange={(filter) => {
              if (activeTab === 'movies') updatePrefs(p => ({ ...p, moviesFilter: filter }));
              else if (activeTab === 'series') updatePrefs(p => ({ ...p, seriesFilter: filter }));
            }}
          />

          {/* Main Content Area */}
          {activeTab === 'movies' ? (
            /* ================= MOVIES TAB ================= */
            movieViewModels.length === 0 ? (
              /* Empty Movies State */
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem 2rem',
                textAlign: 'center',
                gap: '1rem',
                color: 'var(--text-2)'
              }}>
                <Film size={48} style={{ color: 'var(--text-3)', opacity: 0.6 }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-1)' }}>
                    No movies yet
                  </h3>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: 'var(--text-2)' }}>
                    Add some from Select Media.
                  </p>
                </div>
                {onNavigateToSelectMedia && (
                  <button
                    type="button"
                    onClick={onNavigateToSelectMedia}
                    style={{
                      marginTop: '0.5rem',
                      background: 'var(--ac, var(--accent))',
                      color: 'var(--on, #fff)',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '10px 20px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Add some from Select Media
                  </button>
                )}
              </div>
            ) : filteredMovies.length === 0 ? (
              /* No Search / Filter Matches */
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem 2rem',
                textAlign: 'center',
                gap: '0.75rem',
                color: 'var(--text-2)'
              }}>
                <SearchX size={44} style={{ color: 'var(--text-3)' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-1)' }}>
                  Nothing matches
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)' }}>
                  Try adjusting your search query or status filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    updatePrefs(p => ({ ...p, moviesFilter: 'all' }));
                  }}
                  style={{
                    marginTop: '0.5rem',
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: '1px solid var(--control-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              /* Movies Grid */
              <div
                key="grid-movies"
                ref={gridContainerRef}
                className="library-grid-container"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '16px',
                  width: '100%'
                }}
              >
                {filteredMovies.map((movie, idx) => (
                  <MediaPosterCard
                    key={movie.id}
                    cardRef={(node) => { cardRefs.current[movie.id] = node; }}
                    item={movie}
                    tabIndex={focusedIndex === idx ? 0 : -1}
                    onKeyDown={(e) => handleGridKeyDown(e, idx)}
                    onPlay={() => onPlayVideo(movie.video)}
                    onToggleWatched={() => handleToggleWatched(movie)}
                    onRename={() => setRenameTarget({ id: movie.id, currentTitle: movie.displayTitle })}
                    onRemove={() => handleRemoveItem(movie.id, { stopPropagation: () => {} } as any)}
                  />
                ))}
              </div>
            ) : (
              /* Movies List */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                {filteredMovies.map((movie, idx) => (
                  <MediaListRow
                    key={movie.id}
                    rowRef={(node) => { cardRefs.current[movie.id] = node; }}
                    item={movie}
                    tabIndex={focusedIndex === idx ? 0 : -1}
                    onKeyDown={(e) => handleGridKeyDown(e, idx)}
                    onPlay={() => onPlayVideo(movie.video)}
                    onToggleWatched={() => handleToggleWatched(movie)}
                    onRename={() => setRenameTarget({ id: movie.id, currentTitle: movie.displayTitle })}
                    onRemove={() => handleRemoveItem(movie.id, { stopPropagation: () => {} } as any)}
                  />
                ))}
              </div>
            )
          ) : activeTab === 'series' ? (
            /* ================= SERIES TAB ================= */
            seriesViewModels.length === 0 ? (
              /* Empty Series State */
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem 2rem',
                textAlign: 'center',
                gap: '1rem',
                color: 'var(--text-2)'
              }}>
                <Tv size={48} style={{ color: 'var(--text-3)', opacity: 0.6 }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-1)' }}>
                    No series yet
                  </h3>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: 'var(--text-2)' }}>
                    Files named like Show.S01E01 are grouped here automatically.
                  </p>
                </div>
              </div>
            ) : filteredSeries.length === 0 ? (
              /* No Search / Filter Matches */
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem 2rem',
                textAlign: 'center',
                gap: '0.75rem',
                color: 'var(--text-2)'
              }}>
                <SearchX size={44} style={{ color: 'var(--text-3)' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-1)' }}>
                  Nothing matches
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)' }}>
                  Try adjusting your search query or status filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    updatePrefs(p => ({ ...p, seriesFilter: 'all' }));
                  }}
                  style={{
                    marginTop: '0.5rem',
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: '1px solid var(--control-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              /* Series Grid */
              <div
                key="grid-series"
                ref={gridContainerRef}
                className="library-grid-container"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '16px',
                  width: '100%'
                }}
              >
                {filteredSeries.map((series, idx) => (
                  <MediaPosterCard
                    key={series.id}
                    cardRef={(node) => { cardRefs.current[series.id] = node; }}
                    item={series}
                    tabIndex={focusedIndex === idx ? 0 : -1}
                    onKeyDown={(e) => handleGridKeyDown(e, idx)}
                    onPlay={() => handlePlaySeries(series)}
                    onOpenSeries={() => handleOpenSeries(series)}
                    onToggleWatched={() => {}}
                    onRename={() => setRenameTarget({ id: series.id, currentTitle: series.displayTitle })}
                    onRemove={() => {
                      series.episodes.forEach(ep => {
                        handleRemoveItem(ep.id, { stopPropagation: () => {} } as any);
                      });
                    }}
                  />
                ))}
              </div>
            ) : (
              /* Series List */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                {filteredSeries.map((series, idx) => (
                  <MediaListRow
                    key={series.id}
                    rowRef={(node) => { cardRefs.current[series.id] = node; }}
                    item={series}
                    tabIndex={focusedIndex === idx ? 0 : -1}
                    onKeyDown={(e) => handleGridKeyDown(e, idx)}
                    onPlay={() => handlePlaySeries(series)}
                    onOpenSeries={() => handleOpenSeries(series)}
                    onToggleWatched={() => {}}
                    onRename={() => setRenameTarget({ id: series.id, currentTitle: series.displayTitle })}
                    onRemove={() => {
                      series.episodes.forEach(ep => {
                        handleRemoveItem(ep.id, { stopPropagation: () => {} } as any);
                      });
                    }}
                  />
                ))}
              </div>
            )
          ) : (
            /* ================= PLAYLISTS TAB ================= */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
              {/* Playlists Header Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-2, rgba(255,255,255,0.7))', fontWeight: 600 }}>
                  {filteredPlaylists.length} {filteredPlaylists.length === 1 ? 'Playlist' : 'Playlists'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalTitle('');
                    setIsCreateModalOpen(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--ac, var(--accent))',
                    color: 'var(--on, #fff)',
                    border: 'none',
                    borderRadius: '9px',
                    padding: '7px 14px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={15} />
                  <span>New Playlist</span>
                </button>
              </div>

              {filteredPlaylists.length === 0 ? (
                debouncedQuery ? (
                  /* No search match */
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4rem 2rem',
                    textAlign: 'center',
                    gap: '0.75rem',
                    color: 'var(--text-2)'
                  }}>
                    <SearchX size={44} style={{ color: 'var(--text-3)' }} />
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-1)' }}>
                      No playlists match &quot;{debouncedQuery}&quot;
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{
                        marginTop: '0.5rem',
                        background: 'transparent',
                        color: 'var(--accent)',
                        border: '1px solid var(--control-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 14px',
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  /* Empty Playlists State */
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4rem 2rem',
                    textAlign: 'center',
                    gap: '1rem',
                    color: 'var(--text-2)'
                  }}>
                    <List size={48} style={{ color: 'var(--text-3)', opacity: 0.6 }} />
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-1)' }}>
                        No playlists yet
                      </h3>
                      <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: 'var(--text-2)' }}>
                        Multi-file queues and folder sessions are organized here.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateModalTitle('');
                        setIsCreateModalOpen(true);
                      }}
                      style={{
                        marginTop: '0.5rem',
                        background: 'var(--ac, var(--accent))',
                        color: 'var(--on, #fff)',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '10px 20px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <Plus size={16} />
                      <span>Create New Playlist</span>
                    </button>
                  </div>
                )
              ) : viewMode === 'grid' ? (
                /* Playlists Grid (matching MediaPosterCard 2:3 aspect ratio style) */
                <div
                  key="grid-playlists"
                  className="library-grid-container"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '16px',
                    width: '100%'
                  }}
                >
                  {filteredPlaylists.map((pl) => {
                    const plHue = getHueForPlaylist(pl.name || 'Playlist');
                    const plTileBg = `hsl(${plHue}, 22%, var(--tile-l, 22%))`;
                    const plTileGlyphColor = `hsl(${plHue}, 38%, var(--tile-glyph-l, 74%))`;
                    const plGlyph = getGlyphForPlaylist(pl.name || 'Playlist');

                    return (
                      <div
                        key={pl.id}
                        className="media-card"
                        style={{
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                        onClick={() => setSelectedPlaylistId(pl.id)}
                      >
                        {/* 2:3 Poster Tile matching MediaPosterCard */}
                        <div
                          className="poster-container"
                          style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '2 / 3',
                            borderRadius: 'var(--radius-sm, 8px)',
                            overflow: 'hidden',
                            backgroundColor: plTileBg,
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                          }}
                        >
                          <span
                            style={{
                              fontSize: '3rem',
                              fontWeight: 600,
                              fontFamily: 'var(--font-display)',
                              color: plTileGlyphColor,
                              userSelect: 'none'
                            }}
                          >
                            {plGlyph}
                          </span>

                          {/* Track Count Pill on Top-Left */}
                          <div
                            style={{
                              position: 'absolute',
                              top: '8px',
                              left: '8px',
                              background: 'rgba(21, 26, 33, 0.90)',
                              color: 'var(--text-1)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              backdropFilter: 'blur(4px)',
                              zIndex: 2,
                              pointerEvents: 'none'
                            }}
                          >
                            <List size={10} />
                            <span>{pl.items.length} {pl.items.length === 1 ? 'track' : 'tracks'}</span>
                          </div>

                          {/* Delete Playlist Button */}
                          <button
                            type="button"
                            title="Delete playlist"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePlaylist(pl.id, pl.name);
                            }}
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: 'rgba(21, 26, 33, 0.85)',
                              color: '#f87171',
                              border: '1px solid rgba(248, 113, 113, 0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              zIndex: 3
                            }}
                          >
                            <Trash2 size={13} />
                          </button>

                          {/* Hover Play Button */}
                          <button
                            type="button"
                            title="Play playlist"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayPlaylist(pl);
                            }}
                            style={{
                              position: 'absolute',
                              bottom: '8px',
                              right: '8px',
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--accent, #e50914)',
                              color: '#fff',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                              zIndex: 3
                            }}
                          >
                            <Play size={16} fill="currentColor" style={{ marginLeft: '2px' }} />
                          </button>
                        </div>

                        {/* Title & Metadata below matching MediaPosterCard */}
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              color: 'var(--text-1)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={pl.name || 'Untitled Playlist'}
                          >
                            {pl.name || 'Untitled Playlist'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                            Updated {new Date(pl.updatedAt || Date.now()).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Playlists List */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  {filteredPlaylists.map((pl) => {
                    const plHue = getHueForPlaylist(pl.name || 'Playlist');
                    const plTileBg = `hsl(${plHue}, 22%, var(--tile-l, 22%))`;
                    const plTileGlyphColor = `hsl(${plHue}, 38%, var(--tile-glyph-l, 74%))`;
                    const plGlyph = getGlyphForPlaylist(pl.name || 'Playlist');

                    return (
                      <div
                        key={pl.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--surface-1, rgba(255,255,255,0.03))',
                          border: '1px solid var(--border, rgba(255,255,255,0.08))',
                          borderRadius: '8px',
                          gap: '12px',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedPlaylistId(pl.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <div style={{
                            width: '32px',
                            height: '42px',
                            borderRadius: '4px',
                            backgroundColor: plTileBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: plTileGlyphColor,
                            fontWeight: 700,
                            fontSize: '1rem',
                            flexShrink: 0
                          }}>
                            {plGlyph}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1, #fff)' }}>
                              {pl.name || 'Untitled Playlist'}
                            </span>
                            <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: 'var(--text-3, rgba(255,255,255,0.5))' }}>
                              ({pl.items.length} {pl.items.length === 1 ? 'track' : 'tracks'})
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayPlaylist(pl);
                            }}
                            style={{
                              background: 'var(--accent, #e50914)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Play size={12} fill="currentColor" /> Play
                          </button>
                          <button
                            type="button"
                            title="Delete playlist"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePlaylist(pl.id, pl.name || 'Playlist');
                            }}
                            style={{
                              background: 'transparent',
                              color: 'var(--text-3, rgba(255,255,255,0.5))',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Playlist Modal */}
      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--surface-1, #141724)',
              border: '1px solid var(--border, rgba(255,255,255,0.12))',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-1, #fff)' }}>
                Create New Playlist
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-3, rgba(255,255,255,0.5))', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (createModalTitle.trim()) {
                handleCreatePlaylist(createModalTitle);
                setIsCreateModalOpen(false);
              }
            }}>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-2, rgba(255,255,255,0.7))', marginBottom: '8px' }}>
                Playlist Name
              </label>
              <input
                autoFocus
                type="text"
                value={createModalTitle}
                onChange={(e) => setCreateModalTitle(e.target.value)}
                placeholder="e.g. My Favorites, Sci-Fi Movies"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, rgba(255,255,255,0.15))',
                  background: 'var(--surface-2, rgba(255,255,255,0.06))',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: '20px'
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border, rgba(255,255,255,0.15))',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: 'var(--text-2, rgba(255,255,255,0.8))',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!createModalTitle.trim()}
                  style={{
                    background: 'var(--accent, #e50914)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 18px',
                    color: '#fff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: createModalTitle.trim() ? 'pointer' : 'not-allowed',
                    opacity: createModalTitle.trim() ? 1 : 0.5
                  }}
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      <LibraryRenameModal
        isOpen={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        currentTitle={renameTarget?.currentTitle || ''}
        onSave={handleSaveRename}
      />
    </div>
  );
};
