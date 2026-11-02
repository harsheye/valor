import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Play, UploadCloud, Film, X, Search, LayoutGrid, List, Calendar, 
  Clock, Trash2, CheckCircle2, RotateCcw, AlertTriangle, ChevronRight,
  TrendingUp, Sparkles, Filter, Check, MoreVertical
} from 'lucide-react';
import type { VideoItem } from '../types/media';
import { CalendarView } from '../components/CalendarView';
import Calendar02 from '../components/creative-tim/blocks/calendar-02';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { smartTitleCase, getTileColors, getFirstAlphanumeric } from '../utils/libraryViewModel';
import { formatRuntime, formatTimecode, formatFullTimecode, parseDurationToSeconds } from '../utils/timeFormat';
import { BookingCalendar } from '../components/BookingCalendar';
import { AppointmentCalendar } from '../components/AppointmentCalendar';

interface HistoryPageProps {
  videos: VideoItem[];
  historyViewMode?: 'list' | 'calendar' | 'grid';
  setHistoryViewMode?: (mode: 'list' | 'calendar') => void;
  settings: any;
  handlePlayVideo: (video: VideoItem) => void;
  handleRemoveVideo: (id: string, e: React.MouseEvent) => void;
  syncVideoToTraktHistory: (video: VideoItem, e: React.MouseEvent) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
  parseDurationToSeconds: (duration: string | number | undefined) => number;
  formatTime: (secs: number | string | undefined) => string;
}

interface CleanDisplayInfo {
  title: string;
  seriesTitle?: string;
  seasonEpisode?: string;
  episodeTitle?: string;
  rawTitle: string;
  isSeries: boolean;
}

function getCleanDisplayTitle(video: VideoItem): CleanDisplayInfo {
  const rawTitle = video.title || 'Untitled';
  const info = classifyVideoTitle(rawTitle);
  if (info.type === 'series' && info.season !== undefined && info.episode !== undefined) {
    const sTitle = smartTitleCase(info.seriesTitle || 'Unknown Series').replace(/\s*\(\d{4}\)$/, '').trim();
    const sStr = String(info.season).padStart(2, '0');
    const eStr = String(info.episode).padStart(2, '0');
    return {
      title: `${sTitle} S${sStr}E${eStr}`,
      seriesTitle: sTitle,
      seasonEpisode: `S${sStr}E${eStr}`,
      episodeTitle: info.episodeTitle ? smartTitleCase(info.episodeTitle) : undefined,
      rawTitle,
      isSeries: true
    };
  }
  const base = smartTitleCase(info.cleanTitle || rawTitle);
  const title = info.year ? `${base} (${info.year})` : base;
  return { title, rawTitle, isSeries: false };
}

interface DateFormattedInfo {
  relative: string;
  full: string;
  groupKey: string;
  groupTitle: string;
  order: number;
}

function formatPlayedTime(dateStr?: string): DateFormattedInfo {
  let d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  const now = new Date();
  const timeMs = d.getTime();
  const nowMs = now.getTime();
  const diffHours = (nowMs - timeMs) / (1000 * 60 * 60);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
  const startOfWeek = startOfToday - (6 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let relative = '';
  if (diffHours < 1) {
    const mins = Math.max(1, Math.round((nowMs - timeMs) / (1000 * 60)));
    relative = `${mins}m ago`;
  } else if (diffHours < 24 && timeMs >= startOfToday) {
    relative = `Today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } else if (timeMs >= startOfYesterday) {
    relative = `Yesterday at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } else {
    relative = `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  let groupKey = 'earlier';
  let groupTitle = 'Earlier';
  let order = 5;

  if (timeMs >= startOfToday) {
    groupKey = 'today';
    groupTitle = 'Today';
    order = 1;
  } else if (timeMs >= startOfYesterday) {
    groupKey = 'yesterday';
    groupTitle = 'Yesterday';
    order = 2;
  } else if (timeMs >= startOfWeek) {
    groupKey = 'this_week';
    groupTitle = 'This Week';
    order = 3;
  } else if (timeMs >= startOfMonth) {
    groupKey = 'this_month';
    groupTitle = 'Earlier This Month';
    order = 4;
  } else {
    groupKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    groupTitle = d.toLocaleDateString([], { month: 'long', year: 'numeric' });
    order = 10000 + (nowMs - timeMs) / 1000;
  }

  return {
    relative,
    full: d.toLocaleString(),
    groupKey,
    groupTitle,
    order
  };
}

interface DateGroup {
  key: string;
  title: string;
  order: number;
  items: VideoItem[];
  totalRuntimeSecs: number;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  videos,
  historyViewMode: initialViewMode = 'grid',
  setHistoryViewMode,
  settings,
  handlePlayVideo,
  handleRemoveVideo,
  syncVideoToTraktHistory,
  isInstantlyPlayable,
  parseDurationToSeconds: _parseDurationToSeconds,
  formatTime: _formatTime,
}) => {
  // 1. Persistent UI Preferences
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'calendar'>(() => {
    try {
      const saved = localStorage.getItem('valor_history_view_mode');
      if (saved === 'grid' || saved === 'list' || saved === 'calendar') return saved;
    } catch {}
    return initialViewMode === 'calendar' ? 'calendar' : 'grid';
  });

  const handleSetViewMode = (mode: 'grid' | 'list' | 'calendar') => {
    setViewMode(mode);
    try {
      localStorage.setItem('valor_history_view_mode', mode);
    } catch {}
    if (setHistoryViewMode) {
      setHistoryViewMode(mode === 'calendar' ? 'calendar' : 'list');
    }
  };

  // 2. Filter & Search State
  const [activeTypeTab, setActiveTypeTab] = useState<'all' | 'movies' | 'series'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'in-progress' | 'completed' | 'unwatched'>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'title' | 'progress' | 'duration'>('recent');
  const [groupByDate, setGroupByDate] = useState<boolean>(true);

  // 3. Clear Confirmation Dialog State
  const [clearTarget, setClearTarget] = useState<{ type: 'all' | 'group'; groupKey?: string; title?: string } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global '/' keyboard shortcut to focus search, and 'Escape' to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        if (searchQuery) {
          setSearchQuery('');
        } else {
          searchInputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  // 4. Sorted Master Videos List
  const sortedMasterVideos = useMemo(() => {
    return [...videos].sort((a, b) => {
      const dateA = a.lastPlayedDate ? new Date(a.lastPlayedDate).getTime() : 0;
      const dateB = b.lastPlayedDate ? new Date(b.lastPlayedDate).getTime() : 0;
      return dateB - dateA; // Newest first
    });
  }, [videos]);

  // Counts for tabs
  const { moviesCount, seriesCount } = useMemo(() => {
    let movies = 0;
    let series = 0;
    sortedMasterVideos.forEach(v => {
      const info = classifyVideoTitle(v.title || '');
      if (info.type === 'series') series++;
      else movies++;
    });
    return { moviesCount: movies, seriesCount: series };
  }, [sortedMasterVideos]);

  // 5. In-Progress Hero Selection
  const continueWatchingList = useMemo(() => {
    return sortedMasterVideos.filter(v => {
      if (!v.currentTime || v.currentTime <= 2) return false;
      const durSecs = typeof v.duration === 'number' ? v.duration : parseDurationToSeconds(v.duration);
      return durSecs <= 0 || v.currentTime < durSecs - 15;
    });
  }, [sortedMasterVideos]);

  const primaryContinue = continueWatchingList.length > 0 
    ? continueWatchingList[0] 
    : (sortedMasterVideos.length > 0 ? sortedMasterVideos[0] : null);

  // 6. Filter & Search Application
  const filteredVideos = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
    const startOfWeek = startOfToday - (6 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return sortedMasterVideos.filter(v => {
      const info = classifyVideoTitle(v.title || '');
      const durationSec = typeof v.duration === 'number' ? v.duration : parseDurationToSeconds(v.duration);
      const isCompleted = !!(v.completed || (v as any).timeToFinish || (durationSec > 0 && v.currentTime && v.currentTime >= durationSec - 15));
      const hasProgress = !isCompleted && typeof v.currentTime === 'number' && v.currentTime > 2;

      // Type filter
      if (activeTypeTab === 'movies' && info.type === 'series') return false;
      if (activeTypeTab === 'series' && info.type !== 'series') return false;

      // Status filter
      if (filterStatus === 'in-progress' && !hasProgress) return false;
      if (filterStatus === 'completed' && !isCompleted) return false;
      if (filterStatus === 'unwatched' && (hasProgress || isCompleted)) return false;

      // Date range filter
      if (dateRangeFilter !== 'all') {
        const itemTime = v.lastPlayedDate ? new Date(v.lastPlayedDate).getTime() : 0;
        if (dateRangeFilter === 'today' && itemTime < startOfToday) return false;
        if (dateRangeFilter === 'yesterday' && (itemTime < startOfYesterday || itemTime >= startOfToday)) return false;
        if (dateRangeFilter === 'week' && itemTime < startOfWeek) return false;
        if (dateRangeFilter === 'month' && itemTime < startOfMonth) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const raw = (v.title || '').toLowerCase();
        const clean = (info.cleanTitle || '').toLowerCase();
        const ep = (info.episodeTitle || '').toLowerCase();
        const code = `s${info.season}e${info.episode}`.toLowerCase();
        if (!raw.includes(q) && !clean.includes(q) && !ep.includes(q) && !code.includes(q)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const dateA = a.lastPlayedDate ? new Date(a.lastPlayedDate).getTime() : 0;
      const dateB = b.lastPlayedDate ? new Date(b.lastPlayedDate).getTime() : 0;

      if (sortBy === 'recent') return dateB - dateA;
      if (sortBy === 'oldest') return dateA - dateB;
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'duration') {
        const durA = typeof a.duration === 'number' ? a.duration : parseDurationToSeconds(a.duration);
        const durB = typeof b.duration === 'number' ? b.duration : parseDurationToSeconds(b.duration);
        return durB - durA;
      }
      if (sortBy === 'progress') {
        const durA = typeof a.duration === 'number' ? a.duration : parseDurationToSeconds(a.duration);
        const durB = typeof b.duration === 'number' ? b.duration : parseDurationToSeconds(b.duration);
        const pctA = durA > 0 ? (a.currentTime || 0) / durA : 0;
        const pctB = durB > 0 ? (b.currentTime || 0) / durB : 0;
        return pctB - pctA;
      }
      return 0;
    });
  }, [sortedMasterVideos, activeTypeTab, filterStatus, dateRangeFilter, searchQuery, sortBy]);

  // 7. Grouping by Dates
  const dateGroups = useMemo<DateGroup[]>(() => {
    const map = new Map<string, DateGroup>();

    filteredVideos.forEach(v => {
      const dateInfo = formatPlayedTime(v.lastPlayedDate);
      const key = dateInfo.groupKey;

      if (!map.has(key)) {
        map.set(key, {
          key,
          title: dateInfo.groupTitle,
          order: dateInfo.order,
          items: [],
          totalRuntimeSecs: 0
        });
      }

      const grp = map.get(key)!;
      grp.items.push(v);
      const durSecs = typeof v.duration === 'number' ? v.duration : parseDurationToSeconds(v.duration);
      grp.totalRuntimeSecs += (durSecs > 0 ? durSecs : (v.currentTime || 0));
    });

    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [filteredVideos]);

  // 8. Bulk Clearing Handlers
  const handleExecuteClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!clearTarget) return;

    if (clearTarget.type === 'all') {
      filteredVideos.forEach(v => {
        handleRemoveVideo(v.id, { stopPropagation: () => {} } as any);
      });
    } else if (clearTarget.type === 'group' && clearTarget.groupKey) {
      const targetGroup = dateGroups.find(g => g.key === clearTarget.groupKey);
      if (targetGroup) {
        targetGroup.items.forEach(v => {
          handleRemoveVideo(v.id, { stopPropagation: () => {} } as any);
        });
      }
    }
    setClearTarget(null);
  };

  return (
    <div
      className="history-page-scroll-container"
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        position: 'relative',
        background: 'transparent'
      }}
    >
      <div
        className="history-page-content-wrapper"
        style={{
          maxWidth: '1400px',
          width: '100%',
          margin: '0 auto',
          padding: '1.5rem 2rem 3rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          boxSizing: 'border-box',
          minHeight: '100%'
        }}
      >
        {/* ========================================================================= */}
        {/* HERO BANNER: CONTINUE WATCHING (Matches Home & Library Hero Style)        */}
        {/* ========================================================================= */}
        {primaryContinue && !searchQuery.trim() && dateRangeFilter === 'all' && (
          (() => {
            const primaryClean = getCleanDisplayTitle(primaryContinue);
            const primaryDur = typeof primaryContinue.duration === 'number' 
              ? primaryContinue.duration 
              : parseDurationToSeconds(primaryContinue.duration);
            const isPrimaryInProgress = typeof primaryContinue.currentTime === 'number' && primaryContinue.currentTime > 2;
            const primaryProgressPct = primaryDur > 0 && primaryContinue.currentTime 
              ? Math.min(100, Math.round((primaryContinue.currentTime / primaryDur) * 100)) 
              : 0;
            const isCompleted = !!(primaryContinue.completed || (primaryContinue as any).timeToFinish || (primaryDur > 0 && primaryContinue.currentTime && primaryContinue.currentTime >= primaryDur - 15));
            const remainingSecs = primaryDur > 0 && primaryContinue.currentTime ? Math.max(0, primaryDur - primaryContinue.currentTime) : 0;
            const tile = getTileColors(primaryClean.title);
            const glyph = getFirstAlphanumeric(primaryClean.title);

            return (
              <div
                onClick={() => handlePlayVideo(primaryContinue)}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, rgba(229, 9, 20, 0.16) 0%, rgba(20, 20, 20, 0.6) 100%)',
                  backgroundColor: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md, 12px)',
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  gap: '1.5rem',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s ease, transform 0.2s ease'
                }}
                className="history-hero-banner"
              >
                {/* Accent glow line at top */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'linear-gradient(90deg, var(--accent) 0%, transparent 100%)'
                }} />

                <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: '1.25rem' }}>
                  {/* Poster Thumbnail */}
                  <div style={{
                    width: '64px',
                    height: '92px',
                    borderRadius: 'var(--radius-sm, 8px)',
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: primaryContinue.posterPath ? 'var(--surface-2)' : tile.tileBg,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}>
                    {primaryContinue.posterPath ? (
                      <img
                        src={primaryContinue.posterPath}
                        alt=""
                        crossOrigin="anonymous"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: '1.75rem', fontWeight: 700, color: tile.glyphColor, fontFamily: 'var(--font-display, Outfit)' }}>
                        {glyph}
                      </span>
                    )}
                  </div>

                  {/* Title & Metadata */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        background: 'var(--surface-3)',
                        color: 'var(--text-1)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase'
                      }}>
                        {isCompleted ? 'Watched' : isPrimaryInProgress ? 'Continue Watching' : 'Recent Playback'}
                      </span>

                      {primaryProgressPct > 0 && !isCompleted && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700 }}>
                          {primaryProgressPct}% Watched
                        </span>
                      )}

                      {primaryDur > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>
                          • Total {formatRuntime(primaryDur)}
                        </span>
                      )}

                      {primaryContinue.lastPlayedDate && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                          • {formatPlayedTime(primaryContinue.lastPlayedDate).relative}
                        </span>
                      )}
                    </div>

                    <h2 style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-display, Outfit)',
                      color: 'var(--text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }} title={primaryClean.rawTitle}>
                      {primaryClean.title}
                    </h2>

                    <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-2)' }}>
                      {isCompleted ? (
                        <span>Finished completely • Ready to replay</span>
                      ) : isPrimaryInProgress ? (
                        <span>
                          Resume playback at <strong>{formatTimecode(primaryContinue.currentTime)}</strong>
                          {remainingSecs > 0 && ` (${Math.round(remainingSecs / 60)}m remaining)`}
                        </span>
                      ) : (
                        <span>Ready to play from start</span>
                      )}
                    </p>

                    {/* Progress Bar */}
                    {primaryProgressPct > 0 && !isCompleted && (
                      <div style={{
                        height: '4px',
                        width: '100%',
                        maxWidth: '420px',
                        background: 'var(--surface-3)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                        marginTop: '0.65rem'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${primaryProgressPct}%`,
                          background: 'var(--accent)',
                          borderRadius: '2px'
                        }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Action Button */}
                <button
                  type="button"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--on-accent, #fff)',
                    border: 'none',
                    padding: '0.75rem 1.6rem',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm, 8px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: '0 4px 14px rgba(229, 9, 20, 0.4)',
                    transition: 'transform 0.15s ease, filter 0.15s ease'
                  }}
                >
                  {isInstantlyPlayable(primaryContinue) ? (
                    <>
                      <Play size={15} fill="currentColor" />
                      <span>{isCompleted ? 'Play Again' : isPrimaryInProgress ? 'Resume' : 'Play Now'}</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={15} />
                      <span>Select Media</span>
                    </>
                  )}
                </button>
              </div>
            );
          })()
        )}

        {/* ========================================================================= */}
        {/* TOOLBAR: TABS, FILTERS, SEARCH, SORT & VIEW SWITCHER (Matches Library)   */}
        {/* ========================================================================= */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          width: '100%'
        }}>
          {/* Top Row: Type Tabs (All, Movies, Series), Search Bar, Sort & View Mode */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            {/* Left: Media Type Tabs */}
            <div role="tablist" aria-label="History Media Type" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTypeTab === 'all'}
                onClick={() => setActiveTypeTab('all')}
                style={{
                  background: activeTypeTab === 'all' ? 'var(--surface-3)' : 'transparent',
                  color: activeTypeTab === 'all' ? 'var(--text-1)' : 'var(--text-2)',
                  border: '1px solid',
                  borderColor: activeTypeTab === 'all' ? 'var(--control-border)' : 'transparent',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>All History</span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: activeTypeTab === 'all' ? 'var(--accent)' : 'var(--surface-2)',
                  color: activeTypeTab === 'all' ? '#fff' : 'var(--text-3)'
                }}>
                  {sortedMasterVideos.length}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTypeTab === 'movies'}
                onClick={() => setActiveTypeTab('movies')}
                style={{
                  background: activeTypeTab === 'movies' ? 'var(--surface-3)' : 'transparent',
                  color: activeTypeTab === 'movies' ? 'var(--text-1)' : 'var(--text-2)',
                  border: '1px solid',
                  borderColor: activeTypeTab === 'movies' ? 'var(--control-border)' : 'transparent',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Movies</span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: activeTypeTab === 'movies' ? 'var(--accent)' : 'var(--surface-2)',
                  color: activeTypeTab === 'movies' ? '#fff' : 'var(--text-3)'
                }}>
                  {moviesCount}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTypeTab === 'series'}
                onClick={() => setActiveTypeTab('series')}
                style={{
                  background: activeTypeTab === 'series' ? 'var(--surface-3)' : 'transparent',
                  color: activeTypeTab === 'series' ? 'var(--text-1)' : 'var(--text-2)',
                  border: '1px solid',
                  borderColor: activeTypeTab === 'series' ? 'var(--control-border)' : 'transparent',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Series</span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: activeTypeTab === 'series' ? 'var(--accent)' : 'var(--surface-2)',
                  color: activeTypeTab === 'series' ? '#fff' : 'var(--text-3)'
                }}>
                  {seriesCount}
                </span>
              </button>
            </div>

            {/* Right: Search, Sort, View Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              {/* Search History Input */}
              <div style={{ position: 'relative', width: '240px' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-3)',
                    pointerEvents: 'none'
                  }}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search history ( / )"
                  style={{
                    width: '100%',
                    padding: '6px 28px 6px 30px',
                    fontSize: '0.78rem',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--control-border)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    color: 'var(--text-1)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex'
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Sort Selector */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  background: 'var(--surface-1)',
                  color: 'var(--text-1)',
                  border: '1px solid var(--control-border)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="recent">Recently Played</option>
                <option value="oldest">Oldest Played</option>
                <option value="title">Title A–Z</option>
                <option value="progress">Most Progress (%)</option>
                <option value="duration">Longest Duration</option>
              </select>

              {/* View Mode Segmented Controls: Grid | List | Calendar */}
              <div style={{
                display: 'flex',
                background: 'var(--surface-1)',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm, 6px)',
                padding: '2px'
              }}>
                <button
                  type="button"
                  onClick={() => handleSetViewMode('grid')}
                  title="Grid View (Poster Cards)"
                  aria-pressed={viewMode === 'grid'}
                  style={{
                    background: viewMode === 'grid' ? 'var(--surface-3)' : 'transparent',
                    color: viewMode === 'grid' ? 'var(--text-1)' : 'var(--text-3)',
                    border: 'none',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <LayoutGrid size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => handleSetViewMode('list')}
                  title="List View"
                  aria-pressed={viewMode === 'list'}
                  style={{
                    background: viewMode === 'list' ? 'var(--surface-3)' : 'transparent',
                    color: viewMode === 'list' ? 'var(--text-1)' : 'var(--text-3)',
                    border: 'none',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <List size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => handleSetViewMode('calendar')}
                  title="Calendar View"
                  aria-pressed={viewMode === 'calendar'}
                  style={{
                    background: viewMode === 'calendar' ? 'var(--surface-3)' : 'transparent',
                    color: viewMode === 'calendar' ? 'var(--text-1)' : 'var(--text-3)',
                    border: 'none',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Calendar size={14} />
                </button>
              </div>

              {/* Clear All History Button */}
              {filteredVideos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setClearTarget({ type: 'all', title: 'All History' })}
                  title="Clear matching history"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    padding: '5px 10px',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Trash2 size={13} />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Bottom Row: Sub-Filters (Status Pills, Date Ranges, Group Toggle) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            {/* Left: Status Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              {(['all', 'in-progress', 'completed', 'unwatched'] as const).map(pill => {
                const isActive = filterStatus === pill;
                const label = pill === 'all' ? 'All Status' : pill === 'in-progress' ? 'In Progress' : pill === 'completed' ? 'Watched' : 'Unwatched';
                return (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => setFilterStatus(pill)}
                    style={{
                      background: isActive ? 'var(--accent)' : 'var(--surface-1)',
                      color: isActive ? '#fff' : 'var(--text-2)',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Right: Date Range Selector & Group Switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Date Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} color="var(--text-3)" />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600 }}>Date:</span>
                {(['all', 'today', 'yesterday', 'week', 'month'] as const).map(dt => {
                  const isActive = dateRangeFilter === dt;
                  const label = dt === 'all' ? 'All' : dt === 'today' ? 'Today' : dt === 'yesterday' ? 'Yesterday' : dt === 'week' ? '7 Days' : 'This Month';
                  return (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => setDateRangeFilter(dt)}
                      style={{
                        background: isActive ? 'var(--surface-3)' : 'transparent',
                        color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                        border: '1px solid',
                        borderColor: isActive ? 'var(--control-border)' : 'transparent',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Group by Date Header Toggle */}
              {viewMode !== 'calendar' && (
                <button
                  type="button"
                  onClick={() => setGroupByDate(p => !p)}
                  title="Toggle Date Section Headers"
                  style={{
                    background: groupByDate ? 'var(--surface-3)' : 'transparent',
                    color: groupByDate ? 'var(--text-1)' : 'var(--text-3)',
                    border: '1px solid var(--border)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Calendar size={12} />
                  <span>{groupByDate ? 'Grouped by Date' : 'Flat Feed'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: CALENDAR VIEW (When Calendar mode selected)                       */}
        {/* ========================================================================= */}
        {viewMode === 'calendar' ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {settings.calendarStyle === 'list' && (
              <Calendar02 videos={sortedMasterVideos} onPlayVideo={handlePlayVideo} isInstantlyPlayable={isInstantlyPlayable} />
            )}
            {settings.calendarStyle === 'grid' && (
              <CalendarView videos={sortedMasterVideos} onPlayVideo={handlePlayVideo} />
            )}
            {settings.calendarStyle === 'booking' && (
              <BookingCalendar />
            )}
            {settings.calendarStyle === 'appointment' && (
              <AppointmentCalendar videos={sortedMasterVideos} onPlayVideo={handlePlayVideo} />
            )}
          </div>
        ) : filteredVideos.length === 0 ? (
          /* ======================================================================= */
          /* EMPTY STATE                                                             */
          /* ======================================================================= */
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 12px)',
            padding: '3.5rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            margin: '2rem 0'
          }}>
            <Film size={48} color="var(--text-3)" strokeWidth={1.5} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)' }}>
                {searchQuery || filterStatus !== 'all' || dateRangeFilter !== 'all' 
                  ? 'No matching history items found' 
                  : 'No playback history recorded yet'}
              </h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: 'var(--text-3)', maxWidth: '420px' }}>
                {searchQuery || filterStatus !== 'all' || dateRangeFilter !== 'all'
                  ? 'Try adjusting your search terms, status filters, or date range options above.'
                  : 'Play a local file or start an online stream to begin building your personalized viewing timeline.'}
              </p>
            </div>
            {(searchQuery || filterStatus !== 'all' || dateRangeFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                  setDateRangeFilter('all');
                  setActiveTypeTab('all');
                }}
                style={{
                  background: 'var(--surface-3)',
                  color: 'var(--text-1)',
                  border: '1px solid var(--control-border)',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          /* ======================================================================= */
          /* DATE GROUPED SECTIONS (OR FLAT STREAM)                                 */
          /* ======================================================================= */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
            {(groupByDate ? dateGroups : [{ key: 'all', title: 'All History', order: 0, items: filteredVideos, totalRuntimeSecs: 0 }]).map(group => {
              return (
                <section key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                  {/* Group Header */}
                  {groupByDate && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={16} color="var(--accent)" />
                        <h3 style={{
                          margin: 0,
                          fontSize: '1rem',
                          fontWeight: 700,
                          fontFamily: 'var(--font-display, Outfit)',
                          color: 'var(--text-1)',
                          letterSpacing: '-0.01em'
                        }}>
                          {group.title}
                        </h3>
                        <span style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-3)',
                          background: 'var(--surface-2)',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontWeight: 600
                        }}>
                          {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                        </span>
                        {group.totalRuntimeSecs > 0 && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                            • {formatRuntime(group.totalRuntimeSecs)} total
                          </span>
                        )}
                      </div>

                      {/* Clear Group Button */}
                      <button
                        type="button"
                        onClick={() => setClearTarget({ type: 'group', groupKey: group.key, title: group.title })}
                        title={`Clear history for ${group.title}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-3)',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          transition: 'color 0.15s ease'
                        }}
                      >
                        <Trash2 size={12} />
                        <span>Clear {group.title}</span>
                      </button>
                    </div>
                  )}

                  {/* Group Content: Grid Mode vs List Mode */}
                  {viewMode === 'grid' ? (
                    /* ------------------------------------------------------------- */
                    /* GRID VIEW: POSTER CARDS (Matches Library MediaPosterCard)     */
                    /* ------------------------------------------------------------- */
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: '1.25rem',
                      width: '100%'
                    }}>
                      {group.items.map(video => {
                        const clean = getCleanDisplayTitle(video);
                        const durSec = typeof video.duration === 'number' ? video.duration : parseDurationToSeconds(video.duration);
                        const isCompleted = !!(video.completed || (video as any).timeToFinish || (durSec > 0 && video.currentTime && video.currentTime >= durSec - 15));
                        const hasProgress = !isCompleted && typeof video.currentTime === 'number' && video.currentTime > 2;
                        const progressPct = durSec > 0 && video.currentTime ? Math.min(100, Math.round((video.currentTime / durSec) * 100)) : 0;
                        const playedTimeInfo = formatPlayedTime(video.lastPlayedDate);
                        const tile = getTileColors(clean.title);
                        const glyph = getFirstAlphanumeric(clean.title);

                        return (
                          <div
                            key={video.id}
                            className="history-poster-card"
                            onClick={() => handlePlayVideo(video)}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.55rem',
                              cursor: 'pointer',
                              position: 'relative'
                            }}
                          >
                            {/* Poster Image Container (2:3 Aspect Ratio) */}
                            <div style={{
                              position: 'relative',
                              width: '100%',
                              aspectRatio: '2 / 3',
                              borderRadius: 'var(--radius-sm, 8px)',
                              overflow: 'hidden',
                              backgroundColor: video.posterPath ? 'var(--surface-2)' : tile.tileBg,
                              border: '1px solid var(--border)',
                              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'transform 0.2s ease, border-color 0.2s ease'
                            }}>
                              {video.posterPath ? (
                                <img
                                  src={video.posterPath}
                                  alt=""
                                  loading="lazy"
                                  crossOrigin="anonymous"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{
                                  fontSize: '3.2rem',
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-display, Outfit)',
                                  color: tile.glyphColor,
                                  userSelect: 'none'
                                }}>
                                  {glyph}
                                </span>
                              )}

                              {/* Top Left: Watched / Progress Badge */}
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '8px',
                                zIndex: 2
                              }}>
                                {isCompleted ? (
                                  <span style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 800,
                                    background: 'rgba(21, 26, 33, 0.9)',
                                    color: 'var(--success, #4ade80)',
                                    border: '1px solid rgba(74, 222, 128, 0.3)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}>
                                    <Check size={10} strokeWidth={3} />
                                    <span>Watched</span>
                                  </span>
                                ) : hasProgress ? (
                                  <span style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 800,
                                    background: 'rgba(21, 26, 33, 0.9)',
                                    color: 'var(--accent)',
                                    border: '1px solid var(--accent)',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                  }}>
                                    {progressPct}%
                                  </span>
                                ) : null}
                              </div>

                              {/* Top Right: Remove Quick Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveVideo(video.id, e);
                                }}
                                title="Remove from history"
                                style={{
                                  position: 'absolute',
                                  top: '8px',
                                  right: '8px',
                                  zIndex: 2,
                                  background: 'rgba(0, 0, 0, 0.7)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  color: 'var(--text-2)',
                                  width: '26px',
                                  height: '26px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  opacity: 0.85,
                                  transition: 'opacity 0.15s ease, background 0.15s ease'
                                }}
                              >
                                <X size={13} />
                              </button>

                              {/* Bottom Accent Progress Bar on Poster */}
                              {progressPct > 0 && !isCompleted && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  height: '4px',
                                  background: 'rgba(0, 0, 0, 0.6)',
                                  zIndex: 2
                                }}>
                                  <div style={{
                                    height: '100%',
                                    width: `${progressPct}%`,
                                    background: 'var(--accent)'
                                  }} />
                                </div>
                              )}
                            </div>

                            {/* Card Body Info */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <h4 style={{
                                margin: 0,
                                fontSize: '0.88rem',
                                fontWeight: 700,
                                color: 'var(--text-1)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }} title={clean.rawTitle}>
                                {clean.title}
                              </h4>

                              {clean.episodeTitle && (
                                <span style={{
                                  fontSize: '0.74rem',
                                  color: 'var(--text-2)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {clean.episodeTitle}
                                </span>
                              )}

                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.72rem',
                                color: 'var(--text-3)',
                                marginTop: '2px'
                              }}>
                                <span>{durSec > 0 ? formatRuntime(durSec) : 'Duration N/A'}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <Clock size={11} />
                                  <span>{playedTimeInfo.relative}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ------------------------------------------------------------- */
                    /* LIST VIEW: DETAILED ROWS (Matches Library MediaListRow)       */
                    /* ------------------------------------------------------------- */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
                      {group.items.map(video => {
                        const clean = getCleanDisplayTitle(video);
                        const durSec = typeof video.duration === 'number' ? video.duration : parseDurationToSeconds(video.duration);
                        const isCompleted = !!(video.completed || (video as any).timeToFinish || (durSec > 0 && video.currentTime && video.currentTime >= durSec - 15));
                        const hasProgress = !isCompleted && typeof video.currentTime === 'number' && video.currentTime > 2;
                        const progressPct = durSec > 0 && video.currentTime ? Math.min(100, Math.round((video.currentTime / durSec) * 100)) : 0;
                        const playedTimeInfo = formatPlayedTime(video.lastPlayedDate);
                        const tile = getTileColors(clean.title);
                        const glyph = getFirstAlphanumeric(clean.title);

                        return (
                          <div
                            key={video.id}
                            className="history-list-row"
                            onClick={() => handlePlayVideo(video)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.75rem 1rem',
                              background: 'var(--surface-1)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md, 10px)',
                              cursor: 'pointer',
                              boxSizing: 'border-box',
                              gap: '1rem',
                              transition: 'border-color 0.15s ease, background 0.15s ease'
                            }}
                          >
                            {/* Left: Thumbnail & Details */}
                            <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: '1rem' }}>
                              <div style={{
                                width: '48px',
                                height: '68px',
                                borderRadius: 'var(--radius-sm, 6px)',
                                overflow: 'hidden',
                                flexShrink: 0,
                                background: video.posterPath ? 'var(--surface-2)' : tile.tileBg,
                                border: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative'
                              }}>
                                {video.posterPath ? (
                                  <img
                                    src={video.posterPath}
                                    alt=""
                                    loading="lazy"
                                    crossOrigin="anonymous"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: tile.glyphColor, fontFamily: 'var(--font-display, Outfit)' }}>
                                    {glyph}
                                  </span>
                                )}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                                  <h4 style={{
                                    margin: 0,
                                    fontSize: '0.96rem',
                                    fontWeight: 700,
                                    color: 'var(--text-1)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }} title={clean.rawTitle}>
                                    {clean.title}
                                  </h4>

                                  {isCompleted ? (
                                    <span style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      background: 'rgba(74, 222, 128, 0.12)',
                                      color: 'var(--success, #4ade80)',
                                      padding: '1px 6px',
                                      borderRadius: '4px'
                                    }}>
                                      Watched
                                    </span>
                                  ) : hasProgress ? (
                                    <span style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      background: 'rgba(229, 9, 20, 0.12)',
                                      color: 'var(--accent)',
                                      padding: '1px 6px',
                                      borderRadius: '4px'
                                    }}>
                                      {progressPct}% ({formatTimecode(video.currentTime)})
                                    </span>
                                  ) : null}
                                </div>

                                {clean.episodeTitle && (
                                  <p style={{ margin: '0 0 4px 0', fontSize: '0.78rem', color: 'var(--text-2)' }}>
                                    {clean.episodeTitle}
                                  </p>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.74rem', color: 'var(--text-3)', flexWrap: 'wrap' }}>
                                  <span>Length: {durSec > 0 ? formatRuntime(durSec) : 'Unknown'}</span>
                                  <span>•</span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={11} />
                                    <span>{playedTimeInfo.relative}</span>
                                  </span>
                                  {video.format && (
                                    <>
                                      <span>•</span>
                                      <span style={{ textTransform: 'uppercase' }}>{video.format}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                              <button
                                type="button"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: 'var(--surface-3)',
                                  color: 'var(--text-1)',
                                  border: '1px solid var(--control-border)',
                                  borderRadius: 'var(--radius-sm, 6px)',
                                  padding: '0.45rem 0.9rem',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                {isInstantlyPlayable(video) ? (
                                  <>
                                    <Play size={13} fill="currentColor" />
                                    <span>{hasProgress ? 'Resume' : isCompleted ? 'Replay' : 'Play'}</span>
                                  </>
                                ) : (
                                  <>
                                    <UploadCloud size={13} />
                                    <span>Select File</span>
                                  </>
                                )}
                              </button>

                              {/* Trakt.tv Sync Button */}
                              {(() => {
                                if (!isCompleted && !video.hasScrobbledTrakt) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      syncVideoToTraktHistory(video, e);
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: video.hasScrobbledTrakt ? 'var(--surface-2)' : 'var(--accent-soft)',
                                      color: video.hasScrobbledTrakt ? 'var(--text-3)' : 'var(--accent)',
                                      border: video.hasScrobbledTrakt ? '1px solid var(--border)' : '1px solid var(--accent)',
                                      padding: '0.45rem 0.75rem',
                                      borderRadius: 'var(--radius-sm, 6px)',
                                      fontSize: '0.74rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      opacity: video.hasScrobbledTrakt ? 0.65 : 1
                                    }}
                                    title={video.hasScrobbledTrakt ? "Already synced to Trakt.tv" : "Sync status to Trakt.tv"}
                                    disabled={video.hasScrobbledTrakt}
                                  >
                                    <Film size={12} fill={video.hasScrobbledTrakt ? "currentColor" : "none"} />
                                    <span>Trakt</span>
                                  </button>
                                );
                              })()}

                              {/* Remove Video from History */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveVideo(video.id, e);
                                }}
                                title="Remove from history"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-3)',
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: 'var(--radius-sm, 6px)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'color 0.15s ease, background 0.15s ease'
                                }}
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* ========================================================================= */}
        {/* CLEAR HISTORY CONFIRMATION MODAL                                          */}
        {/* ========================================================================= */}
        {clearTarget && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onClick={() => setClearTarget(null)}
          >
            <div
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md, 12px)',
                padding: '1.75rem',
                width: '420px',
                maxWidth: '90%',
                boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444'
                }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)' }}>
                    Clear {clearTarget.title || 'History'}?
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-3)' }}>
                    This action will remove recorded playback positions and history.
                  </p>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                {clearTarget.type === 'all'
                  ? `Are you sure you want to delete all ${filteredVideos.length} history records? This cannot be undone.`
                  : `Are you sure you want to remove all items under "${clearTarget.title}"?`}
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setClearTarget(null)}
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--text-1)',
                    border: '1px solid var(--control-border)',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteClear}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Yes, Clear Records
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
