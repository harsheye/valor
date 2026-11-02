import React, { useState, useMemo, useRef, useEffect } from 'react';
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

interface HeatCell {
  date: Date;
  dateKey: string;
  dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  x: number;
  y: number;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface HeatMonth {
  name: string;
  year: number;
  month: number;
  startX: number;
  width: number;
  cells: HeatCell[];
}

interface HistoryRowItem {
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
  // Default to null so all days are shown by default
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ dateKey: string; count: number; x: number; y: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // 1. Calculate the 6 months (last 5 months + 1 current month) with distinct gaps
  const { monthsData, totalWidth, totalSessionsIn6Months } = useMemo(() => {
    const counts: Record<string, number> = {};
    const now = new Date();

    // Start of the 6-month window (1st day of month 5 months ago)
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    windowStart.setHours(0, 0, 0, 0);

    let sessionTotal = 0;
    videos.forEach(v => {
      if (v.lastPlayedDate) {
        try {
          const d = new Date(v.lastPlayedDate);
          if (d >= windowStart) {
            const k = d.toISOString().split('T')[0];
            counts[k] = (counts[k] || 0) + 1;
            sessionTotal++;
          }
        } catch {}
      }
    });

    const monthGap = 16;   // Distinct separation between each month block
    const colPitch = 14;   // 11px square + 3px gap
    let currentX = 32;     // Left offset for Mon/Wed/Fri labels

    const months: HeatMonth[] = [];

    // Iterate through the 6 months: (now.getMonth() - 5) up to current month (now.getMonth() - 0)
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const monthName = monthDate.toLocaleDateString([], { month: 'short' });

      // Number of days in this month
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const monthStartX = currentX;
      let col = 0;
      const cells: HeatCell[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const cellDate = new Date(year, month, day);
        const dayOfWeek = cellDate.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

        if (day > 1 && dayOfWeek === 0) {
          col++;
        }

        const dateKey = cellDate.toISOString().split('T')[0];
        const count = counts[dateKey] || 0;

        let level: 0 | 1 | 2 | 3 | 4 = 0;
        if (count >= 4) level = 4;
        else if (count === 3) level = 3;
        else if (count === 2) level = 2;
        else if (count === 1) level = 1;

        const cellX = monthStartX + col * colPitch;
        const cellY = 22 + dayOfWeek * colPitch;

        cells.push({
          date: cellDate,
          dateKey,
          dayOfWeek,
          x: cellX,
          y: cellY,
          count,
          level
        });
      }

      const monthCols = col + 1;
      const monthWidth = monthCols * colPitch - 3;

      months.push({
        name: monthName,
        year,
        month,
        startX: monthStartX,
        width: monthWidth,
        cells
      });

      // Advance X position with monthGap to keep each month distinctly separated
      currentX += monthWidth + monthGap;
    }

    const totalSvgWidth = currentX + 8;

    return {
      monthsData: months,
      totalWidth: Math.max(560, totalSvgWidth),
      totalSessionsIn6Months: sessionTotal
    };
  }, [videos]);

  // 2. Real Watch Log Items (100% from user's playback history)
  const allHistoryItems = useMemo<HistoryRowItem[]>(() => {
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
      const timeStr = !isNaN(d.getTime()) 
        ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) 
        : '';
      
      const durSec = typeof v.duration === 'number' ? v.duration : parseDurationToSeconds(v.duration);
      const curr = v.currentTime || 0;
      const isFinished = !!(v.completed || (durSec > 0 && curr >= durSec - 15));

      return {
        id: v.id || `video-${idx}`,
        title: sTitle,
        seasonEpisode: code,
        resumeText: isFinished ? 'completed' : `resume at ${formatRuntime(curr)}`,
        playedAtTime: timeStr,
        watchedText: `${formatRuntime(curr)} watched`,
        status: isFinished ? 'finished' : 'stopped',
        hasTraktSync: true,
        isSyncedToTrakt: !!(v as any).traktSynced,
        stars: isFinished ? 5 : undefined,
        progressPercent: durSec > 0 ? Math.min(100, Math.round((curr / durSec) * 100)) : 0,
        dateKey,
        dateGroupLabel: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
        letter,
        letterBg: tile.tileBg,
        videoItem: v
      };
    });
  }, [videos]);

  // 3. Top in-progress Continue Watching cards (if any real in-progress items exist)
  const topResumeCards = useMemo(() => {
    const inProgress = allHistoryItems.filter(i => i.status === 'stopped' && (i.videoItem.currentTime || 0) > 2);
    return inProgress.slice(0, 2);
  }, [allHistoryItems]);

  // 4. Filter Watch Log items
  const filteredItems = useMemo(() => {
    return allHistoryItems.filter(item => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const full = `${item.title} ${item.seasonEpisode || ''}`.toLowerCase();
        if (!full.includes(q)) return false;
      }

      // 2. Status pill filter
      if (filterPill === 'stopped' && item.status !== 'stopped') return false;
      if (filterPill === 'finished' && item.status !== 'finished') return false;
      if (filterPill === 'trakt' && item.isSyncedToTrakt) return false;

      // 3. Date selection from heatmap (if user clicked a day)
      if (selectedDateKey && item.dateKey !== selectedDateKey) {
        return false;
      }

      return true;
    });
  }, [allHistoryItems, searchQuery, filterPill, selectedDateKey]);

  // 5. Group filtered items by date for display
  const groupedWatchLog = useMemo(() => {
    const groups: { label: string; dateKey: string; items: HistoryRowItem[]; totalWatchSec: number }[] = [];
    const map = new Map<string, HistoryRowItem[]>();

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

  // Cell fill colors (Graduated crimson tokens)
  const getCellFill = (level: number) => {
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
        return 'rgba(255, 255, 255, 0.05)'; // dark un-watched
    }
  };

  const handleCellClick = (dateKey: string) => {
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
        {/* 1. TOP HEADER (History title, Search input, Clear history)        */}
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
                  aria-label="Clear search query"
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
        {/* 2. TOP RESUME CARDS (Shown only when in-progress videos exist)     */}
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
        {/* 3. GITHUB-STYLE HEATMAP (LAST 5 MONTHS + CURRENT MONTH)           */}
        {/* Each month distinctly separated, guaranteed zero horizontal scroll */}
        {/* ================================================================= */}
        <section className="history-heatmap-card" aria-label="Viewing activity heatmap">
          <div className="history-heatmap-top">
            <div className="history-heatmap-title-area">
              <span className="history-heatmap-sessions-count">
                {totalSessionsIn6Months} session{totalSessionsIn6Months === 1 ? '' : 's'} in the last 6 months
              </span>
              <span className="history-heatmap-subtitle">
                Each square is a day. Click one to see what you watched.
              </span>
            </div>

            {/* Legend */}
            <div className="history-heatmap-legend">
              <span>Less</span>
              <span className="history-legend-square" style={{ background: getCellFill(0) }} />
              <span className="history-legend-square" style={{ background: getCellFill(1) }} />
              <span className="history-legend-square" style={{ background: getCellFill(2) }} />
              <span className="history-legend-square" style={{ background: getCellFill(3) }} />
              <span className="history-legend-square" style={{ background: getCellFill(4) }} />
              <span>More</span>
            </div>
          </div>

          {/* Scalable SVG Heatmap: Separated Month Blocks & Zero Horizontal Scroll */}
          <div className="history-heatmap-svg-wrap">
            <svg
              className="history-heatmap-svg"
              viewBox={`0 0 ${totalWidth} 125`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              {/* Day Labels on Y-Axis */}
              <text x="5" y="44" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Mon</text>
              <text x="5" y="72" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Wed</text>
              <text x="5" y="100" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Fri</text>

              {/* Render each of the 6 distinctly separated Month Blocks */}
              {monthsData.map((m) => {
                const monthCenterX = m.startX + m.width / 2;
                return (
                  <g key={`${m.name}-${m.year}-${m.month}`}>
                    {/* Centered Month Label above each month cluster */}
                    <text
                      x={monthCenterX}
                      y="13"
                      fontSize="9.5"
                      fontWeight="600"
                      fill="var(--text-3)"
                      fontFamily="var(--font-ui)"
                      textAnchor="middle"
                    >
                      {m.name}
                    </text>

                    {/* Days in Month */}
                    {m.cells.map((cell) => {
                      const isSelected = selectedDateKey === cell.dateKey;
                      const fill = getCellFill(cell.level);

                      return (
                        <g key={cell.dateKey}>
                          <rect
                            x={cell.x}
                            y={cell.y}
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

                          {/* Selected Day Outline Ring */}
                          {isSelected && (
                            <rect
                              x={cell.x - 1.5}
                              y={cell.y - 1.5}
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
                );
              })}
            </svg>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 4. WATCH LOG SECTION (Grouped by Date with Filter Pills)          */}
        {/* ================================================================= */}
        <section className="history-watchlog-section" aria-label="Watch log history">
          <div className="history-watchlog-header">
            <h2 className="history-watchlog-title">Watch log</h2>

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
                {videos.length === 0 
                  ? 'No playback history recorded yet.' 
                  : selectedDateKey 
                    ? `No playback sessions recorded for ${selectedDateKey}.`
                    : 'No matching playback sessions found.'}
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem' }}>
                {videos.length === 0 
                  ? 'Play any video or stream to automatically record watch history.' 
                  : selectedDateKey 
                    ? 'Click the selected date square again to view all days.'
                    : 'Try clearing your search query or filter.'}
              </p>
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
                          {item.seasonEpisode && (
                            <span>{item.seasonEpisode}</span>
                          )}
                          {item.playedAtTime && (
                            <span>· {item.playedAtTime}</span>
                          )}
                          <span>· {item.watchedText}</span>

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
