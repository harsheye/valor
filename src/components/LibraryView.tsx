import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Film, Tv, Plus, SearchX } from 'lucide-react';
import type { VideoItem } from '../types/media';
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

interface LibraryViewProps {
  videos: VideoItem[];
  onPlayVideo: (video: VideoItem) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
  onNavigateToSelectMedia?: () => void;
  onRemoveVideo?: (id: string, e: React.MouseEvent) => void;
  addToast?: (text: string, type?: 'success' | 'error' | 'warning', action?: any) => void;
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
}

const PREFS_STORAGE_KEY = 'valor_library_prefs';

interface LibraryPreferences {
  activeTab: 'movies' | 'series';
  viewMode: 'grid' | 'list';
  moviesSort: SortOption;
  seriesSort: SortOption;
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
  setVideos
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
  const sortBy = activeTab === 'movies' ? prefs.moviesSort : prefs.seriesSort;
  const filterBy = activeTab === 'movies' ? prefs.moviesFilter : prefs.seriesFilter;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<{ id: string; currentTitle: string } | null>(null);
  const [renamesVersion, setRenamesVersion] = useState(0);

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
  }, [videos, customRenames]);

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
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg)',
      color: 'var(--text-1)',
      overflowY: 'auto',
      padding: '1.25rem 2rem 3rem 2rem',
      boxSizing: 'border-box'
    }}>
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
        />
      ) : (
        /* Normal Library Browser */
        <div style={{ width: '100%', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
          {/* Sticky Toolbar */}
          <LibraryToolbar
            activeTab={activeTab}
            onTabChange={(tab) => updatePrefs(p => ({ ...p, activeTab: tab }))}
            moviesCount={movieViewModels.length}
            seriesCount={seriesViewModels.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={(sort) => {
              if (activeTab === 'movies') updatePrefs(p => ({ ...p, moviesSort: sort }));
              else updatePrefs(p => ({ ...p, seriesSort: sort }));
            }}
            viewMode={viewMode}
            onViewModeChange={(mode) => updatePrefs(p => ({ ...p, viewMode: mode }))}
            filterBy={filterBy}
            onFilterChange={(filter) => {
              if (activeTab === 'movies') updatePrefs(p => ({ ...p, moviesFilter: filter }));
              else updatePrefs(p => ({ ...p, seriesFilter: filter }));
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
                    Files you play show up here.
                  </p>
                </div>
                {onNavigateToSelectMedia && (
                  <button
                    type="button"
                    onClick={onNavigateToSelectMedia}
                    style={{
                      marginTop: '0.5rem',
                      background: 'var(--surface-3)',
                      color: 'var(--text-1)',
                      border: '1px solid var(--control-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 18px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Select media
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
                ref={gridContainerRef}
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
          ) : (
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
                ref={gridContainerRef}
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
                    onPlay={() => {
                      if (series.primaryEpisode) onPlayVideo(series.primaryEpisode);
                    }}
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
                    onPlay={() => {
                      if (series.primaryEpisode) onPlayVideo(series.primaryEpisode);
                    }}
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
          )}
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
