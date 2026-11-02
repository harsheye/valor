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
  dayKeyword: string;
  dayDateStr: string;
  dateGroupLabel: string;
  timestamp: number;
  letter: string;
  letterBg: string;
  videoItem: VideoItem;
}

const VIBRANT_TILE_PALETTES = [
  'linear-gradient(135deg, #9a882e 0%, #7b7929 100%)', // olive khaki (The Perfect Lie)
  'linear-gradient(135deg, #9c342e 0%, #7e2b1e 100%)', // brick terracotta (Paper Kingdom)
  'linear-gradient(135deg, #8c2d3a 0%, #6e202a 100%)', // muted wine/crimson
  'linear-gradient(135deg, #2a5f78 0%, #1e4558 100%)', // steel ocean
  'linear-gradient(135deg, #5b427b 0%, #43315a 100%)', // muted royal purple
  'linear-gradient(135deg, #2b6b55 0%, #1d4d3c 100%)', // deep forest emerald
  'linear-gradient(135deg, #9c6c2e 0%, #785220 100%)', // warm amber bronze
  'linear-gradient(135deg, #78354f 0%, #592539 100%)', // plum rose
];

function getVibrantTileGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash << 5) - hash + title.charCodeAt(i);
  return VIBRANT_TILE_PALETTES[Math.abs(hash) % VIBRANT_TILE_PALETTES.length];
}

/* --------------------------------------------------------------------------
   CURATED DEMO DATA (Matching screenshot exactly)
   -------------------------------------------------------------------------- */
const RAW_DEMO_ITEMS: HistoryDisplayItem[] = [
  {
    id: 'demo-1',
    title: 'The Perfect Lie',
    seasonEpisode: 'S1E2',
    resumeText: 'resume at 1:35',
    playedAtTime: '8:30 pm',
    watchedText: '2m watched',
    status: 'stopped',
    hasTraktSync: false,
    isSyncedToTrakt: false,
    progressPercent: 28,
    dateKey: '2026-11-02',
    dayKeyword: 'Today',
    dayDateStr: '2 Nov 2026',
    dateGroupLabel: '2026-11-02_Today',
    timestamp: new Date('2026-11-02T20:30:00Z').getTime(),
    letter: 'T',
    letterBg: 'linear-gradient(135deg, #9a882e 0%, #7b7929 100%)',
    videoItem: {
      id: 'demo-1',
      title: 'The Perfect Lie S01E02',
      url: 'https://demo.valor.stream/the-perfect-lie-e02.mp4',
      currentTime: 95,
      duration: '360',
      lastPlayedDate: '2026-11-02T20:30:00Z',
      type: 'url',
      audioTracks: [],
      subtitleTracks: []
    }
  },
  {
    id: 'demo-2',
    title: 'Paper Kingdom',
    seasonEpisode: 'S1E6',
    resumeText: 'resume at 40:12',
    playedAtTime: '11:18 pm',
    watchedText: '40m watched',
    status: 'stopped',
    hasTraktSync: false,
    isSyncedToTrakt: false,
    progressPercent: 72,
    dateKey: '2026-11-01',
    dayKeyword: 'Yesterday',
    dayDateStr: '1 Nov 2026',
    dateGroupLabel: '2026-11-01_Yesterday',
    timestamp: new Date('2026-11-01T23:18:00Z').getTime(),
    letter: 'P',
    letterBg: 'linear-gradient(135deg, #9c342e 0%, #7e2b1e 100%)',
    videoItem: {
      id: 'demo-2',
      title: 'Paper Kingdom S01E06',
      url: 'https://demo.valor.stream/paper-kingdom-e06.mp4',
      currentTime: 2412,
      duration: '3300',
      lastPlayedDate: '2026-11-01T23:18:00Z',
      type: 'url',
      audioTracks: [],
      subtitleTracks: []
    }
  },
  {
    id: 'demo-3',
    title: 'The Perfect Lie',
    seasonEpisode: 'S1E1',
    resumeText: 'completed',
    playedAtTime: '8:30 pm',
    watchedText: '1h 6m watched',
    status: 'finished',
    hasTraktSync: true,
    isSyncedToTrakt: false,
    stars: 5,
    progressPercent: 100,
    dateKey: '2026-11-01',
    dayKeyword: 'Yesterday',
    dayDateStr: '1 Nov 2026',
    dateGroupLabel: '2026-11-01_Yesterday',
    timestamp: new Date('2026-11-01T20:30:00Z').getTime(),
    letter: 'T',
    letterBg: 'linear-gradient(135deg, #9a882e 0%, #7b7929 100%)',
    videoItem: {
      id: 'demo-3',
      title: 'The Perfect Lie S01E01',
      url: 'https://demo.valor.stream/the-perfect-lie-e01.mp4',
      currentTime: 3960,
      duration: '3960',
      completed: true,
      lastPlayedDate: '2026-11-01T20:30:00Z',
      type: 'url',
      audioTracks: [],
      subtitleTracks: []
    }
  },
  {
    id: 'demo-4',
    title: 'Paper Kingdom',
    seasonEpisode: 'S2E4',
    resumeText: 'completed',
    playedAtTime: '11:48 pm',
    watchedText: '1h 1m watched',
    status: 'finished',
    hasTraktSync: true,
    isSyncedToTrakt: true,
    stars: 5,
    progressPercent: 100,
    dateKey: '2026-10-31',
    dayKeyword: 'Sat',
    dayDateStr: '31 Oct 2026',
    dateGroupLabel: '2026-10-31_Sat',
    timestamp: new Date('2026-10-31T23:48:00Z').getTime(),
    letter: 'P',
    letterBg: 'linear-gradient(135deg, #9c342e 0%, #7e2b1e 100%)',
    videoItem: {
      id: 'demo-4',
      title: 'Paper Kingdom S02E04',
      url: 'https://demo.valor.stream/paper-kingdom-s02e04.mp4',
      currentTime: 3660,
      duration: '3660',
      completed: true,
      lastPlayedDate: '2026-10-31T23:48:00Z',
      type: 'url',
      audioTracks: [],
      subtitleTracks: []
    }
  },
  {
    id: 'demo-5',
    title: 'Until I Destroyed My Husbands Other Family',
    seasonEpisode: 'S1E1',
    resumeText: 'resume at 2:34',
    playedAtTime: '7:30 pm',
    watchedText: '3m watched',
    status: 'stopped',
    hasTraktSync: false,
    isSyncedToTrakt: false,
    progressPercent: 35,
    dateKey: '2026-10-31',
    dayKeyword: 'Sat',
    dayDateStr: '31 Oct 2026',
    dateGroupLabel: '2026-10-31_Sat',
    timestamp: new Date('2026-10-31T19:30:00Z').getTime(),
    letter: 'U',
    letterBg: 'linear-gradient(135deg, #9c342e 0%, #7e2b1e 100%)',
    videoItem: {
      id: 'demo-5',
      title: 'Until I Destroyed My Husbands Other Family S01E01',
      url: 'https://demo.valor.stream/until-i-destroyed-e01.mp4',
      currentTime: 154,
      duration: '450',
      lastPlayedDate: '2026-10-31T19:30:00Z',
      type: 'url',
      audioTracks: [],
      subtitleTracks: []
    }
  },
  {
    id: 'demo-6',
    title: 'Night Harbor',
    seasonEpisode: 'S1E3',
    resumeText: 'resume at 43:10',
    playedAtTime: '10:04 pm',
    watchedText: '43m watched',
    status: 'stopped',
    hasTraktSync: true,
    isSyncedToTrakt: false,
    progressPercent: 68,
    dateKey: '2026-10-29',
    dayKeyword: 'Thu',
    dayDateStr: '29 Oct 2026',
    dateGroupLabel: '2026-10-29_Thu',
    timestamp: new Date('2026-10-29T22:04:00Z').getTime(),
    letter: 'N',
    letterBg: 'linear-gradient(135deg, #8c2d3a 0%, #6e202a 100%)',
    videoItem: {
      id: 'demo-6',
      title: 'Night Harbor S01E03',
      url: 'https://demo.valor.stream/night-harbor-e03.mp4',
      currentTime: 2590,
      duration: '3800',
      lastPlayedDate: '2026-10-29T22:04:00Z',
      type: 'url',
      audioTracks: [],
      subtitleTracks: []
    }
  }
];

export const HistoryPage: React.FC<HistoryPageProps> = ({
  videos,
  handlePlayVideo,
  handleRemoveVideo,
  syncVideoToTraktHistory,
}) => {
  // Toggle demo data mode (defaults to true if user has 0 items)
  const [showDemoData, setShowDemoData] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('valor_history_demo');
      if (saved !== null) return saved === 'true';
    } catch {}
    return videos.length === 0;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterPill, setFilterPill] = useState<'all' | 'stopped' | 'finished' | 'trakt'>('all');
  
  // By default, no single day is selected (shows all days by default)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ dateKey: string; count: number; x: number; y: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleDemoData = () => {
    setShowDemoData(prev => {
      const next = !prev;
      try { localStorage.setItem('valor_history_demo', String(next)); } catch {}
      return next;
    });
  };

  // 1. Aggregate sessions by dateKey (YYYY-MM-DD)
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

    if (showDemoData) {
      // Seed pseudo-random clusters matching the user's screenshot (308 sessions)
      let seed = 42;
      const pseudoRand = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      const now = new Date();
      // Generate across ~38 weeks (March to November)
      for (let w = 0; w < 38; w++) {
        for (let d = 0; d < 7; d++) {
          const daysAgo = (37 - w) * 7 + (6 - d);
          const cellDate = new Date(now.getTime() - daysAgo * 86400000);
          const k = cellDate.toISOString().split('T')[0];

          if (pseudoRand() < 0.42) {
            const r = pseudoRand();
            const sessionNum = r < 0.4 ? 1 : r < 0.72 ? 2 : r < 0.9 ? 3 : 4;
            counts[k] = (counts[k] || 0) + sessionNum;
          }
        }
      }

      // Exact values for known screenshot days
      counts['2026-11-02'] = 1;
      counts['2026-11-01'] = 2;
      counts['2026-10-31'] = 2;
      counts['2026-10-29'] = 2;
    }

    return counts;
  }, [videos, showDemoData]);

  // 2. Generate exactly 9 months (March to November)
  const months = useMemo(() => {
    const list: MonthBlock[] = [];
    const now = new Date();

    // 8 previous months down to 0 (current month) = 9 months total (Mar - Nov)
    for (let offset = 8; offset >= 0; offset--) {
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
    let currentX = 32; // Left margin for day labels (Mon, Wed, Fri)
    const colWidth = 14; // 11px cell + 3px gap
    const monthGap = 16; // Separation gap between months

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

  // Total sessions recorded across the period
  const totalSessionsInLastYear = useMemo(() => {
    if (showDemoData) return 308;
    let sum = 0;
    months.forEach(m => {
      m.cells.forEach(c => {
        sum += c.count;
      });
    });
    return sum;
  }, [months, showDemoData]);

  // 3. Format videos for display
  const allHistoryItems = useMemo<HistoryDisplayItem[]>(() => {
    if (showDemoData || videos.length === 0) {
      return RAW_DEMO_ITEMS;
    }

    return videos.map((v, idx) => {
      const rawTitle = v.title || 'Untitled';
      const info = classifyVideoTitle(rawTitle);
      const sTitle = smartTitleCase(info.cleanTitle || rawTitle);
      const code = (info.season !== undefined && info.episode !== undefined)
        ? `S${info.season}E${info.episode}`
        : '';
      const tileBg = getVibrantTileGradient(rawTitle);
      const letter = getFirstAlphanumeric(rawTitle);

      const d = v.lastPlayedDate ? new Date(v.lastPlayedDate) : new Date();
      const dateKey = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
      const timeStr = !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const durSec = typeof v.duration === 'number' 
        ? v.duration 
        : (v.duration ? parseDurationToSeconds(v.duration) : 0);
      const curr = v.currentTime || 0;

      // Auto complete media if within 3-5 minutes (default 240s = 4 min) before time remaining:
      const remainingSec = durSec > 0 ? durSec - curr : Infinity;
      const completionThresholdSec = durSec > 360 ? 240 : (durSec > 120 ? 60 : 15);
      const isFinished = !!(
        v.completed || 
        (durSec > 0 && (remainingSec <= completionThresholdSec || curr >= durSec * 0.92))
      );

      const isToday = !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = !isNaN(d.getTime()) && d.toDateString() === yesterday.toDateString();

      const dayKeyword = isToday
        ? 'Today'
        : isYesterday
        ? 'Yesterday'
        : d.toLocaleDateString([], { weekday: 'short' });

      const dayDateStr = d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
      const dateGroupLabel = `${dateKey}_${dayKeyword}`;

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
        dayKeyword,
        dayDateStr,
        dateGroupLabel,
        timestamp: !isNaN(d.getTime()) ? d.getTime() : 0,
        letter,
        letterBg: tileBg,
        videoItem: v
      };
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [videos, showDemoData]);

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

  // Group items by date for display (exact match to screenshot)
  const groupedWatchLog = useMemo(() => {
    const map = new Map<string, { dayKeyword: string; dayDateStr: string; dateKey: string; items: HistoryDisplayItem[]; totalWatchSec: number }>();

    filteredItems.forEach(item => {
      const key = item.dateKey || 'unknown';
      let grp = map.get(key);
      if (!grp) {
        grp = {
          dayKeyword: item.dayKeyword,
          dayDateStr: item.dayDateStr,
          dateKey: item.dateKey,
          items: [],
          totalWatchSec: 0
        };
        map.set(key, grp);
      }
      grp.items.push(item);
      grp.totalWatchSec += (item.videoItem.currentTime || 0);
    });

    return Array.from(map.values());
  }, [filteredItems]);

  // Top Continue Watching Cards (2 cards side by side)
  const topResumeCards = useMemo(() => {
    if (showDemoData) {
      return [
        RAW_DEMO_ITEMS[0], // The Perfect Lie S1E2 (resume at 1:35)
        RAW_DEMO_ITEMS[4], // Until I Destroyed My Husbands Other Family S1E1 (resume at 2:34)
      ];
    }
    return allHistoryItems
      .filter(i => i.status === 'stopped' && (i.videoItem.currentTime || 0) > 2)
      .slice(0, 2);
  }, [allHistoryItems, showDemoData]);

  // Crimson / Coral Palette (exact match to user screenshot)
  const getCellFill = (level: number, isFuture: boolean) => {
    if (isFuture) return 'rgba(255, 255, 255, 0.02)';
    switch (level) {
      case 1:
        return '#4c1626'; // subtle dark crimson
      case 2:
        return '#8a1c36'; // mid crimson
      case 3:
        return '#d9254c'; // vibrant crimson
      case 4:
        return '#fb7185'; // bright coral pink
      case 0:
      default:
        return '#1a1d26'; // dark empty square
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
            <button
              type="button"
              className={`history-demo-pill ${showDemoData ? 'active' : ''}`}
              onClick={toggleDemoData}
            >
              Demo data
            </button>
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
        {/* 3. GITHUB HEATMAP CARD (EXACT 1:1 REPLICA - ZERO SCROLLING)       */}
        {/* ================================================================= */}
        <section className="history-heatmap-card" aria-label="Contribution and viewing activity heatmap">
          {/* Top Info & Legend */}
          <div className="history-heatmap-top">
            <div className="history-heatmap-title-area">
              <span className="history-heatmap-sessions-count">
                {showDemoData ? '308 sessions in the last year' : `${totalSessionsInLastYear} session${totalSessionsInLastYear === 1 ? '' : 's'} in the last year`}
              </span>
              <span className="history-heatmap-subtitle">
                Each square is a day. Click one to see what you watched.
              </span>
            </div>
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

          {/* Scalable SVG Heatmap: Separated Month Groups & Responsive Fit */}
          <div className="history-heatmap-svg-wrap">
            <svg
              className="history-heatmap-svg"
              viewBox={`0 0 ${totalSvgWidth} 118`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              {/* Day Labels on Y-Axis (Mon, Wed, Fri) */}
              <text x="4" y="41" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Mon</text>
              <text x="4" y="67" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Wed</text>
              <text x="4" y="93" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-ui)">Fri</text>

              {/* Separated Month Groups */}
              {monthLayouts.map((m) => (
                <g key={`${m.name}-${m.year}`}>
                  {/* Centered Month Header */}
                  <text
                    x={m.labelCenterX}
                    y="11"
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="var(--text-3)"
                    fontFamily="var(--font-ui)"
                  >
                    {m.name}
                  </text>

                  {/* Day Cells inside this month */}
                  {m.cells.map((cell) => {
                    const cellX = m.startX + cell.weekCol * 13;
                    const cellY = 20 + cell.dayOfWeek * 13;
                    const isSelected = selectedDateKey === cell.dateKey;
                    const fill = getCellFill(cell.level, cell.isFuture);

                    return (
                      <g key={cell.dateKey}>
                        <rect
                          x={cellX}
                          y={cellY}
                          width="10"
                          height="10"
                          rx="2"
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

                        {/* Active/Selected Ring */}
                        {isSelected && (
                          <rect
                            x={cellX - 1.5}
                            y={cellY - 1.5}
                            width="13"
                            height="13"
                            rx="3"
                            fill="none"
                            stroke="var(--accent, #ff4d6d)"
                            strokeWidth="1.5"
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
              <div key={group.dateKey} className="history-day-group">
                {/* Day Header Row */}
                <div className="history-day-header">
                  <div className="history-day-title">
                    <span className="history-day-keyword">{group.dayKeyword}</span>
                    <span className="history-day-date">{group.dayDateStr}</span>
                  </div>
                  <span className="history-day-meta">
                    {formatRuntime(group.totalWatchSec) || '0m'} · {group.items.length} session{group.items.length === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Day Item Cards */}
                {group.items.map((item) => (
                  <div key={item.id} className="history-item-row">
                    <div className="history-item-left">
                      <div
                        className="history-avatar-tile"
                        style={{ background: item.letterBg }}
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
                            <>
                              <span className="history-badge-finished">✓ Finished</span>
                              <span className="history-stars" aria-label="5 stars">
                                ★★★★★
                              </span>
                            </>
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
                          <Play size={11} fill="white" />
                          <span>Resume</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="history-btn-play"
                            onClick={() => handlePlayVideo(item.videoItem)}
                          >
                            <Play size={11} fill="white" />
                            <span>Play again</span>
                          </button>

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
                        </>
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
