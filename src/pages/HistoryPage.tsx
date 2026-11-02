import React, { useState, useMemo, useRef } from 'react';
import { 
  Play, 
  X, 
  Search, 
  Check, 
  Film,
  AlertTriangle
} from 'lucide-react';
import type { VideoItem } from '../types/media';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { smartTitleCase, getTileColors, getFirstAlphanumeric } from '../utils/libraryViewModel';
import { formatRuntime, parseDurationToSeconds } from '../utils/timeFormat';
import './HistoryHeatmap.css';

export interface HistoryPageProps {
  videos: VideoItem[];
  historyViewMode?: 'list' | 'calendar' | 'grid';
  setHistoryViewMode?: (mode: 'list' | 'calendar') => void;
  settings?: any;
  handlePlayVideo: (video: VideoItem) => void;
  handleRemoveVideo: (id: string, e: React.MouseEvent) => void;
  syncVideoToTraktHistory: (video: VideoItem, e: React.MouseEvent) => void;
  isInstantlyPlayable?: (video: VideoItem) => boolean;
  parseDurationToSeconds?: (duration: string | number | undefined) => number;
  formatTime?: (secs: number | string | undefined) => string;
}

interface DayCell {
  date: Date;
  dateKey: string;
  dayOfMonth: number;
  dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  weekCol: number;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  isFuture: boolean;
}

interface MonthBlock {
  year: number;
  monthIndex: number;
  name: string;
  numCols: number;
  cells: DayCell[];
}

interface HistoryDisplayItem {
  id: string;
  title: string;
  seasonEpisode?: string;
  resumeText: string;
  playedAtTime: string;
  watchedText: string;
  status: 'stopped' | 'finished';
  hasTraktSync: boolean;
  isSyncedToTrakt: boolean;
  stars?: number;
  progressPercent: number;
  dateKey: string;
  dateGroupLabel: string;
  timestamp: number;
  letter: string;
  letterBg: string;
  videoItem: VideoItem;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  videos,
  handlePlayVideo,
  handleRemoveVideo,
  syncVideoToTraktHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPill, setFilterPill] = useState<'all' | 'stopped' | 'finished' | 'trakt'>('all');
  
  // By default, no single day is selected (shows all days by default)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ dateKey: string; count: number; x: number; y: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // 1. Aggregate real user sessions by dateKey (YYYY-MM-DD)
  const sessionCountsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    videos.forEach(v => {
      if (v.lastPlayedDate) {
        try {
          const k = new Date(v.lastPlayedDate).toISOString().split('T')[0];
          counts[k] = (counts[k] || 0) + 1;
        } catch {}
      }
    });
    return counts;
  }, [videos]);

  // 2. Generate exactly the last 5 months + 1 current month (6 months total), each separated
  const months = useMemo(() => {
    const list: MonthBlock[] = [];
    const now = new Date();

    // 5 previous months down to 0 (current month)
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const name = d.toLocaleDateString([], { month: 'short' });

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const totalDays = lastDay.getDate();
      const startDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

      const cells: DayCell[] = [];
      for (let day = 1; day <= totalDays; day++) {
        const cellDate = new Date(year, month, day);
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = cellDate.getDay();
        const weekCol = Math.floor((day - 1 + startDayOfWeek) / 7);
        const count = sessionCountsByDate[dateKey] || 0;

        let level: 0 | 1 | 2 | 3 | 4 = 0;
        if (count >= 4) level = 4;
        else if (count === 3) level = 3;
        else if (count === 2) level = 2;
        else if (count === 1) level = 1;

        cells.push({
          date: cellDate,
          dateKey,
          dayOfMonth: day,
          dayOfWeek,
          weekCol,
          count,
          level,
          isFuture: cellDate > now
        });
      }

      const numCols = Math.ceil((totalDays + startDayOfWeek) / 7);
      list.push({
        year,
        monthIndex: month,
        name,
        numCols,
        cells
      });
    }

    return list;
  }, [sessionCountsByDate]);

  // Calculate layout coordinates for each separated month block
  const { monthLayouts, totalSvgWidth } = useMemo(() => {
    let currentX = 36; // Initial left margin for day labels (Mon, Wed, Fri)
    const colWidth = 14; // 11px cell + 3px gap
    const monthGap = 18; // Distinct visible separation gap between months

    const layouts = months.map(m => {
      const startX = currentX;
      const monthWidth = m.numCols * colWidth;
      const labelCenterX = startX + monthWidth / 2 - 1.5;
      currentX += monthWidth + monthGap;
      return {
        ...m,
        startX,
        monthWidth,
        labelCenterX
      };
    });

    return {
      monthLayouts: layouts,
      totalSvgWidth: currentX + 6
    };
  }, [months]);

  // Total sessions recorded across the 6-month period
  const totalSessionsInLast6Months = useMemo(() => {
    let sum = 0;
    months.forEach(m => {
      m.cells.forEach(c => {
        sum += c.count;
      });
    });
    return sum;
  }, [months]);

  // 3. Format real videos for display
  const allHistoryItems = useMemo<HistoryDisplayItem[]>(() => {
    return videos.map((v, idx) => {
      const rawTitle = v.title || 'Untitled';
      const info = classifyVideoTitle(rawTitle);
      const sTitle = smartTitleCase(info.cleanTitle || rawTitle);
      const code = (info.season !== undefined && info.episode !== undefined)
        ? `S${info.season}E${info.episode}`
        : '';
      const tile = getTileColors(rawTitle);
      const letter = getFirstAlphanumeric(rawTitle);

      const d = v.lastPlayedDate ? new Date(v.lastPlayedDate) : new Date();
      const dateKey = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
      const timeStr = !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const durSec = typeof v.duration === 'number' 
        ? v.duration 
        : (v.duration ? parseDurationToSeconds(v.duration) : 0);
      const curr = v.currentTime || 0;
      const isFinished = !!(v.completed || (durSec > 0 && curr >= durSec - 15));

      const isToday = !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = !isNaN(d.getTime()) && d.toDateString() === yesterday.toDateString();

      const dateGroupLabel = isToday
        ? `Today · ${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
        : isYesterday
        ? `Yesterday · ${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
        : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

      return {
        id: v.id || `video-${idx}`,
        title: sTitle,
        seasonEpisode: code,
        resumeText: isFinished ? 'completed' : `resume at ${formatRuntime(curr)}`,
        playedAtTime: timeStr,
        watchedText: `${formatRuntime(curr)} watched`,
        status: (isFinished ? 'finished' : 'stopped') as 'stopped' | 'finished',
        hasTraktSync: true,
        isSyncedToTrakt: !!(v as any).traktSynced,
        stars: isFinished ? 5 : undefined,
        progressPercent: durSec > 0 ? Math.min(100, Math.round((curr / durSec) * 100)) : 40,
        dateKey,
        dateGroupLabel,
        timestamp: !isNaN(d.getTime()) ? d.getTime() : 0,
        letter,
        letterBg: tile.tileBg,
        videoItem: v
      };
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [videos]);

  // 4. Filter Watch Log (by search, pill filter, and optional heatmap day selection)
  const filteredItems = useMemo(() => {
    return allHistoryItems.filter(item => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const full = `${item.title} ${item.seasonEpisode || ''}`.toLowerCase();
        if (!full.includes(q)) return false;
      }

      // 2. Pill Filter
      if (filterPill === 'stopped' && item.status !== 'stopped') return false;
      if (filterPill === 'finished' && item.status !== 'finished') return false;
      if (filterPill === 'trakt' && item.isSyncedToTrakt) return false;

      // 3. Optional Day Selection from Heatmap
      if (selectedDateKey && item.dateKey !== selectedDateKey) {
        return false;
      }

      return true;
    });
  }, [allHistoryItems, searchQuery, filterPill, selectedDateKey]);

  // Group items by date for display
  const groupedWatchLog = useMemo(() => {
    const groups: { label: string; dateKey: string; items: HistoryDisplayItem[]; totalWatchSec: number }[] = [];
    const map = new Map<string, HistoryDisplayItem[]>();

    filteredItems.forEach(item => {
      const arr = map.get(item.dateGroupLabel) || [];
      arr.push(item);
      map.set(item.dateGroupLabel, arr);
    });

    map.forEach((items, label) => {
      let totalWatchSec = 0;
      items.forEach(i => {
        totalWatchSec += (i.videoItem.currentTime || 0);
      });
      groups.push({
        label,
        dateKey: items[0].dateKey,
        items,
        totalWatchSec
      });
    });

    return groups;
  }, [filteredItems]);

  // Top Continue Watching Cards (Top 2 in-progress items from real data)
  const topResumeCards = useMemo(() => {
    return allHistoryItems
      .filter(i => i.status === 'stopped' && (i.videoItem.currentTime || 0) > 2)
      .slice(0, 2);
  }, [allHistoryItems]);

  // Cell Level Color Map (Token-friendly / Crimson OLED palette)
  const getCellFill = (level: number, isFuture: boolean) => {
    if (isFuture) return 'rgba(255, 255, 255, 0.02)';
    switch (level) {
      case 1:
        return '#4c1d24'; // subtle crimson
      case 2:
        return '#881337'; // mid dark red
      case 3:
        return '#be123c'; // vibrant crimson
      case 4:
        return '#f43f5e'; // bright highlight red
      case 0:
      default:
        return 'rgba(255, 255, 255, 0.05)'; // un-watched
    }
  };

  const handleCellClick = (dateKey: string) => {
    // Clicking a day filters by that day; clicking it again toggles back to all days
    setSelectedDateKey(prev => (prev === dateKey ? null : dateKey));
  };

  const handleClearHistory = () => {
    setIsClearModalOpen(true);
  };

  const executeClear = () => {
    videos.forEach(v => {
      if (v.id) handleRemoveVideo(v.id, {} as any);
    });
    setIsClearModalOpen(false);
  };

  return (
    <div className="history-heatmap-container" role="main" aria-label="Watch history and activity heatmap">
      <div className="history-heatmap-wrapper">
        {/* ================================================================= */}
        {/* 1. TOP HEADER (History title, Search input, Clear button)          */}
        {/* ================================================================= */}
        <header className="history-header">
          <div className="history-header-left">
            <h1 className="history-title">History</h1>
          </div>

          <div className="history-header-right">
            <div className="history-search-box">
              <Search size={14} color="var(--text-3)" />
              <input
                ref={searchInputRef}
                type="text"
                className="history-search-input"
                placeholder="Search history"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {videos.length > 0 && (
              <button
                type="button"
                className="history-clear-btn"
                onClick={handleClearHistory}
              >
                Clear history
              </button>
            )}
          </div>
        </header>

        {/* ================================================================= */}
        {/* 2. TOP RESUME CARDS (2 SIDE BY SIDE - If In-Progress items exist) */}
        {/* ================================================================= */}
        {topResumeCards.length > 0 && (
          <section className="history-resume-grid" aria-label="Continue Watching">
            {topResumeCards.map((card) => (
              <div key={card.id} className="history-resume-card">
                <div className="history-resume-left">
                  <div
                    className="history-avatar-tile"
                    style={{ background: card.letterBg }}
                  >
                    {card.letter}
                  </div>
                  <div className="history-resume-info">
                    <h3 className="history-resume-title">{card.title}</h3>
                    <p className="history-resume-sub">
                      {card.seasonEpisode ? `${card.seasonEpisode} · ` : ''}{card.resumeText}
                    </p>
                    <div className="history-progress-track">
                      <div
                        className="history-progress-fill"
                        style={{ width: `${card.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="history-resume-btn"
                  onClick={() => handlePlayVideo(card.videoItem)}
                >
                  <Play size={12} fill="currentColor" />
                  <span>Resume</span>
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ================================================================= */}
        {/* 3. GITHUB-STYLE HEATMAP (LAST 5 MONTHS + CURRENT MONTH SEPARATED) */}
        {/* ================================================================= */}
        <section className="history-heatmap-card" aria-label="Contribution and viewing activity heatmap">
          <div className="history-heatmap-top">
            <div className="history-heatmap-title-area">
              <span className="history-heatmap-sessions-count">
                {totalSessionsInLast6Months} session{totalSessionsInLast6Months === 1 ? '' : 's'} in the last 6 months
              </span>
              <span className="history-heatmap-subtitle">
                Each square is a day. Click one to see what you watched.
              </span>
            </div>

            {/* Legend */}
            <div className="history-heatmap-legend">
              <span>Less</span>
              <span className="history-legend-square" style={{ background: getCellFill(0, false) }} />
              <span className="history-legend-square" style={{ background: getCellFill(1, false) }} />
              <span className="history-legend-square" style={{ background: getCellFill(2, false) }} />
              <span className="history-legend-square" style={{ background: getCellFill(3, false) }} />
              <span className="history-legend-square" style={{ background: getCellFill(4, false) }} />
              <span>More</span>
            </div>
          </div>

          {/* Scalable SVG Heatmap: Separated Month Groups & Zero Horizontal Scroll */}
          <div className="history-heatmap-svg-wrap">
            <svg
              className="history-heatmap-svg"
              viewBox={`0 0 ${totalSvgWidth} 124`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              {/* Day Labels on Y-Axis */}
              <text x="6" y="40" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Mon</text>
              <text x="6" y="68" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Wed</text>
              <text x="6" y="96" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Fri</text>

              {/* Separated Month Groups */}
              {monthLayouts.map((m) => (
                <g key={`${m.name}-${m.year}`}>
                  {/* Centered Month Header */}
                  <text
                    x={m.labelCenterX}
                    y="12"
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="var(--text-3)"
                    fontFamily="var(--font-ui)"
                  >
                    {m.name}
                  </text>

                  {/* Day Cells inside this month */}
                  {m.cells.map((cell) => {
                    const cellX = m.startX + cell.weekCol * 14;
                    const cellY = 22 + cell.dayOfWeek * 14;
                    const isSelected = selectedDateKey === cell.dateKey;
                    const fill = getCellFill(cell.level, cell.isFuture);

                    return (
                      <g key={cell.dateKey}>
                        <rect
                          x={cellX}
                          y={cellY}
                          width="11"
                          height="11"
                          rx="2.5"
                          fill={fill}
                          className="history-heat-cell"
                          onClick={() => handleCellClick(cell.dateKey)}
                          onMouseEnter={(e) => {
                            const rect = (e.target as SVGRectElement).getBoundingClientRect();
                            setHoveredCell({
                              dateKey: cell.dateKey,
                              count: cell.count,
                              x: rect.left + rect.width / 2,
                              y: rect.top - 8
                            });
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          <title>{`${cell.count} session${cell.count === 1 ? '' : 's'} on ${cell.dateKey}`}</title>
                        </rect>

                        {/* Active/Selected Ring (Pink/crimson outline matching screenshot) */}
                        {isSelected && (
                          <rect
                            x={cellX - 1.5}
                            y={cellY - 1.5}
                            width="14"
                            height="14"
                            rx="3.5"
                            fill="none"
                            stroke="#ff4d6d"
                            strokeWidth="2"
                            pointerEvents="none"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 4. WATCH LOG SECTION (Grouped by Date with Filter Pills)          */}
        {/* ================================================================= */}
        <section className="history-watchlog-section" aria-label="Watch log history">
          <div className="history-watchlog-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 className="history-watchlog-title">Watch log</h2>
              {selectedDateKey && (
                <button
                  type="button"
                  onClick={() => setSelectedDateKey(null)}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--accent)',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Clear day filter to show all days"
                >
                  <span>{selectedDateKey}</span>
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="history-filter-pills" role="tablist">
              <button
                type="button"
                className={`history-filter-pill ${filterPill === 'all' ? 'active' : ''}`}
                onClick={() => setFilterPill('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`history-filter-pill ${filterPill === 'stopped' ? 'active' : ''}`}
                onClick={() => setFilterPill('stopped')}
              >
                Stopped early
              </button>
              <button
                type="button"
                className={`history-filter-pill ${filterPill === 'finished' ? 'active' : ''}`}
                onClick={() => setFilterPill('finished')}
              >
                Finished
              </button>
              <button
                type="button"
                className={`history-filter-pill ${filterPill === 'trakt' ? 'active' : ''}`}
                onClick={() => setFilterPill('trakt')}
              >
                Needs Trakt sync
              </button>
            </div>
          </div>

          {/* Grouped Day Rows */}
          {groupedWatchLog.length === 0 ? (
            <div className="history-empty-state">
              <Film size={36} color="var(--text-3)" />
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-1)' }}>
                {selectedDateKey ? `No sessions recorded for ${selectedDateKey}` : 'No playback history recorded yet'}
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem' }}>
                {selectedDateKey ? 'Click the day again or select another day to view records.' : 'Play any media in Valor to begin recording your watch history.'}
              </p>
              {selectedDateKey && (
                <button
                  type="button"
                  className="history-filter-pill active"
                  style={{ marginTop: '8px' }}
                  onClick={() => setSelectedDateKey(null)}
                >
                  View all days
                </button>
              )}
            </div>
          ) : (
            groupedWatchLog.map((group) => (
              <div key={group.label} className="history-day-group">
                {/* Day Header Row */}
                <div className="history-day-header">
                  <span className="history-day-title">{group.label}</span>
                  <span className="history-day-meta">
                    {formatRuntime(group.totalWatchSec)} · {group.items.length} session{group.items.length === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Day Item Cards */}
                {group.items.map((item) => (
                  <div key={item.id} className="history-item-row">
                    <div className="history-item-left">
                      <div
                        className="history-avatar-tile"
                        style={{ background: item.letterBg, width: '40px', height: '40px', minWidth: '40px', fontSize: '1.1rem' }}
                      >
                        {item.letter}
                      </div>

                      <div className="history-item-info">
                        <h4 className="history-item-title">{item.title}</h4>
                        <div className="history-item-meta-row">
                          <span>
                            {item.seasonEpisode ? `${item.seasonEpisode} · ` : ''}{item.playedAtTime}
                          </span>
                          <span>{item.watchedText}</span>

                          {item.status === 'stopped' ? (
                            <span className="history-badge-stopped">Stopped early</span>
                          ) : (
                            <span className="history-badge-finished">✓ Finished</span>
                          )}

                          {item.stars && (
                            <span className="history-stars" aria-label={`${item.stars} stars`}>
                              {'★'.repeat(item.stars)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Actions */}
                    <div className="history-item-actions">
                      {item.status === 'stopped' ? (
                        <button
                          type="button"
                          className="history-btn-resume"
                          onClick={() => handlePlayVideo(item.videoItem)}
                        >
                          <Play size={11} fill="currentColor" />
                          <span>Resume</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="history-btn-play"
                          onClick={() => handlePlayVideo(item.videoItem)}
                        >
                          <Play size={11} fill="currentColor" />
                          <span>Play again</span>
                        </button>
                      )}

                      {item.hasTraktSync && (
                        item.isSyncedToTrakt ? (
                          <span className="history-btn-trakt-synced">
                            <Check size={12} strokeWidth={2.5} />
                            <span>Trakt</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="history-btn-trakt-sync"
                            onClick={(e) => syncVideoToTraktHistory(item.videoItem, e)}
                          >
                            Sync to Trakt
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        className="history-btn-remove"
                        onClick={(e) => handleRemoveVideo(item.videoItem.id || item.id, e)}
                        title="Remove from history"
                        aria-label="Remove from history"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </section>
      </div>

      {/* Floating Hover Tooltip for SVG Heatmap Cells */}
      {hoveredCell && (
        <div
          style={{
            position: 'fixed',
            left: hoveredCell.x,
            top: hoveredCell.y,
            transform: 'translate(-50%, -100%)',
            background: 'var(--surface-3, #232B36)',
            color: 'var(--text-1, #E4E8EE)',
            border: '1px solid var(--control-border, #6C778A)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '0.72rem',
            fontWeight: 600,
            pointerEvents: 'none',
            zIndex: 9999,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
          }}
        >
          {hoveredCell.count} session{hoveredCell.count === 1 ? '' : 's'} on {hoveredCell.dateKey}
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {isClearModalOpen && (
        <div className="history-modal-backdrop" onClick={() => setIsClearModalOpen(false)}>
          <div className="history-modal-box" onClick={(e) => e.stopPropagation()}>
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
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)' }}>
                Clear All History?
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
              Are you sure you want to delete all recorded playback history? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="history-filter-pill"
                onClick={() => setIsClearModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="history-clear-btn"
                onClick={executeClear}
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
