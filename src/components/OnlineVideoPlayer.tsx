import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, RotateCw, X, 
  Maximize, Minimize, Volume2, Volume1, VolumeX, Lock,
  Sliders, SkipForward, Ban, Eye, Settings, Bookmark as BookmarkIcon, List, Server, Cpu
} from 'lucide-react';
import type { VideoItem, Bookmark } from '../types/media';
import { BookmarkPanel } from './BookmarkPanel';
import { BookmarkModal } from './BookmarkModal';
import { CustomSelect } from './CustomSelect';
import { logger } from '../utils/logger';
import { classifyVideoTitle } from '../utils/libraryClassifier';

interface OnlineVideoPlayerProps {
  video: VideoItem;
  userId?: string;
  onBack: () => void;
  onUpdateVideo: (updatedVideoOrUpdater: VideoItem | ((prev: VideoItem) => VideoItem), isExiting?: boolean, targetVideoId?: string, forceSave?: boolean) => void;
  hideUIOverlays?: boolean;
  toastDuration?: number;
  disableAnimations?: boolean;
  showPlayButton?: boolean;
  showTimeDisplay?: boolean;
  showPlayBar?: boolean;
  showVolumeControl?: boolean;
  showFullscreen?: boolean;
  historySaveInterval?: number;
  saveVolume?: boolean;
  openSubtitlesApiKey?: string;
  allowUiSkipping?: boolean;
  blockSeekingCompletely?: boolean;
  autoSkipIntroOutro?: boolean;
  autoSkipSexScenes?: boolean;
  lockModeActive?: boolean;
  uiHideTimeout?: number;
  tmdbApiKey?: string;
  profileName?: string;
  customLoaderUrl?: string;
  customLoaderType?: 'default' | 'image' | 'video' | 'gif';
  spinnerPreset?: string;
}

const DEFAULT_TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";

export const OnlineVideoPlayer: React.FC<OnlineVideoPlayerProps> = ({
  video,
  userId,
  profileName = 'Local Profile',
  onBack,
  onUpdateVideo,
  hideUIOverlays = false,
  toastDuration = 3000,
  disableAnimations = false,
  showPlayButton = true,
  showTimeDisplay = true,
  showPlayBar = true,
  showVolumeControl = true,
  showFullscreen = true,
  historySaveInterval = 10,
  saveVolume = true,
  allowUiSkipping = true,
  blockSeekingCompletely = false,
  autoSkipIntroOutro = true,
  autoSkipSexScenes = true,
  lockModeActive = false,
  uiHideTimeout = 3000,
  tmdbApiKey,
  customLoaderUrl,
  customLoaderType = 'default',
  spinnerPreset = 'fire-circle'
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(video.currentTime || 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('valor_player_volume');
    return saved ? Number(saved) : 1.0;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Streaming servers & details
  const [server, setServer] = useState<'videasy' | 'vidking'>('videasy');
  const [currentSeason, setCurrentSeason] = useState(video.season || 1);
  const [currentEpisode, setCurrentEpisode] = useState(video.episode || 1);
  const [tvMetadata, setTvMetadata] = useState<{ seasonsCount: number; episodesPerSeason: { [seasonNum: number]: number } } | null>(null);
  const [animeEpisodesCount, setAnimeEpisodesCount] = useState<number | null>(null);

  // Overlays / Popups
  const [showControls, setShowControls] = useState(true);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showBookmarksPopover, setShowBookmarksPopover] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | undefined>(undefined);
  const [markingStartTime, setMarkingStartTime] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  
  // Native control mode (pointer events auto)
  const [interactWithNative, setInteractWithNative] = useState(false);

  // Bookmarks local state
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  // Compute active bookmark for interactive Skip button overlay
  const activeBookmarkForSkip = useMemo(() => {
    return bookmarks.find(bm => {
      if (!bm.endTime || bm.endTime <= bm.time) return false;
      return currentTime >= bm.time && currentTime < bm.endTime;
    });
  }, [bookmarks, currentTime]);

  // Toast / Alerts
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any | null>(null);

  // Refs
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const controlsTimeoutRef = useRef<any | null>(null);
  const bookmarksTimeoutRef = useRef<any | null>(null);
  const lastSaveTimeRef = useRef(video.currentTime || 0);
  const lastSkipTimeRef = useRef<number>(0);

  const isAnime = video.type === 'online_anime';

  // Trigger Toast Notification
  const addToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, toastDuration);
  }, [toastDuration]);

  // postMessage Command Dispatcher
  const sendIframeCommand = useCallback((action: 'play' | 'pause' | 'seek', value?: number) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    
    // Multiple API schemas for Videasy & Vidking
    const payloads = [
      { type: action, value },
      { method: action, value },
      { command: action, value },
      { type: 'PLAYER_COMMAND', command: action, value },
      { event: 'command', func: action, value },
      { event: 'command', func: `${action}Video`, value },
      { event: action, value },
      { action, value },
      { type: 'media', action, value }
    ];
    
    payloads.forEach(p => {
      try { iframe.contentWindow?.postMessage(JSON.stringify(p), '*'); } catch (e) {}
      try { iframe.contentWindow?.postMessage(p, '*'); } catch (e) {}
    });
  }, []);

  // Fetch Bookmarks from GraphQL API and TiDB (with LocalStorage fallback)
  const fetchBookmarks = useCallback(async () => {
    let serverBms: any[] = [];
    let tidbBms: any[] = [];

    const resolvedTmdbId = video.tmdbId;
    const seriesInfo = classifyVideoTitle(video.title);
    const isTV = video.type === 'online_tv' || seriesInfo.type === 'series';
    const season = video.season || seriesInfo.season || 1;
    const episode = video.episode || seriesInfo.episode || 1;

    // 1. Fetch from our server
    if (resolvedTmdbId) {
      try {
        const queryStr = `
          query GetVideoBookmarks($tmdbId: Int!, $season: Int, $episode: Int) {
            videoBookmarks(tmdbId: $tmdbId, season: $season, episode: $episode) {
              id
              time
              endTime
              label
              isIntro
              isOutro
              skipEnabled
              title
              description
              category
              thumbnail
              favorite
              createdAt
              updatedAt
              userName
              userTime
              mediaName
              tmdbId
              episode
              season
              color
              userId
              createdBy
            }
          }
        `;
        const response = await fetch('http://127.0.0.1:50001/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: queryStr,
            variables: { 
              tmdbId: resolvedTmdbId,
              season: isTV ? season : null,
              episode: isTV ? episode : null
            }
          })
        });
        const result = await response.json();
        if (result.data && Array.isArray(result.data.videoBookmarks)) {
          serverBms = result.data.videoBookmarks.map((bm: any) => ({
            ...bm,
            isIntro: !!bm.isIntro,
            isOutro: !!bm.isOutro,
            skipEnabled: !!bm.skipEnabled,
            favorite: !!bm.favorite
          }));
        }
      } catch (err) {
        console.warn('Failed to load bookmarks from our server:', err);
      }
    } else {
      // Fallback query by videoId if tmdbId is not present
      try {
        const activeUserId = userId || 'local';
        const queryStr = `
          query GetBookmarks($userId: String!, $videoId: String!) {
            bookmarks(userId: $userId, videoId: $videoId) {
              id time endTime label isIntro isOutro skipEnabled title description category thumbnail favorite createdBy
            }
          }
        `;
        const response = await fetch('http://127.0.0.1:50001/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: queryStr,
            variables: { userId: activeUserId, videoId: video.id }
          })
        });
        const result = await response.json();
        if (result.data && Array.isArray(result.data.bookmarks)) {
          serverBms = result.data.bookmarks;
        }
      } catch (err) {
        console.warn('Failed to load fallback bookmarks from our server:', err);
      }
    }

    // 2. Fetch from TiDB (TheIntroDB)
    if (resolvedTmdbId && duration > 0) {
      try {
        const durationMs = Math.round(duration * 1000);
        let introDbUrl = `https://api.theintrodb.org/v3/media?tmdb_id=${resolvedTmdbId}`;
        if (isTV) {
          introDbUrl += `&season=${season}&episode=${episode}`;
        }
        introDbUrl += `&duration_ms=${durationMs}`;

        const savedSettings = localStorage.getItem('valor_settings');
        let apiKey = "";
        if (savedSettings) {
          try {
            apiKey = JSON.parse(savedSettings).theIntroDbApiKey || "";
          } catch {}
        }

        const headers: Record<string, string> = { 'accept': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const introDbRes = await fetch(introDbUrl, { headers });
        if (introDbRes.ok) {
          const introDbData = await introDbRes.json();
          const msToSec = (ms: number | null | undefined) => ms ? Math.round(ms / 1000) : 0;

          if (introDbData.intro && Array.isArray(introDbData.intro)) {
            introDbData.intro.forEach((item: any, idx: number) => {
              tidbBms.push({
                id: `api-intro-${idx}`,
                time: msToSec(item.start_ms),
                endTime: msToSec(item.end_ms),
                label: 'Intro',
                isIntro: true,
                isOutro: false,
                skipEnabled: true,
                createdBy: 'theintrodb'
              });
            });
          }

          if (introDbData.recap && Array.isArray(introDbData.recap)) {
            introDbData.recap.forEach((item: any, idx: number) => {
              tidbBms.push({
                id: `api-recap-${idx}`,
                time: msToSec(item.start_ms),
                endTime: msToSec(item.end_ms),
                label: 'Recap',
                isIntro: true,
                isOutro: false,
                skipEnabled: true,
                createdBy: 'theintrodb'
              });
            });
          }

          if (introDbData.credits && Array.isArray(introDbData.credits)) {
            introDbData.credits.forEach((item: any, idx: number) => {
              tidbBms.push({
                id: `api-credits-${idx}`,
                time: msToSec(item.start_ms),
                endTime: msToSec(item.end_ms),
                label: 'Credits/Outro',
                isIntro: false,
                isOutro: true,
                skipEnabled: true,
                createdBy: 'theintrodb'
              });
            });
          }
        }
      } catch (err) {
        console.warn('[TheIntroDB Sync] Failed to fetch from TheIntroDB:', err);
      }
    }

    // Merge bookmarks (local storage fallback, server bookmarks, and tidb bookmarks)
    let localBms: any[] = [];
    try {
      const activeUserId = userId || 'local';
      const key = `valor_bookmarks_${activeUserId}_${video.id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        localBms = JSON.parse(saved);
      }
    } catch {}

    const mergeBookmarks = (existing: any[], newBms: any[]) => {
      const map = new Map<string, any>();
      existing.forEach(bm => map.set(bm.id, bm));
      newBms.forEach(bm => map.set(bm.id, bm));
      return Array.from(map.values()).sort((a, b) => a.time - b.time);
    };

    const initialBms = video.bookmarks || localBms;
    const merged = mergeBookmarks(mergeBookmarks(initialBms, serverBms), tidbBms);
    setBookmarks(merged);
  }, [video.id, video.tmdbId, video.title, video.type, video.season, video.episode, video.bookmarks, userId, duration]);

  // Sync Bookmarks to Server & Local Storage
  const saveBookmarksToServer = useCallback(async (updatedBookmarks: Bookmark[]) => {
    // 1. Save to local storage
    try {
      const activeUserId = userId || 'local';
      const key = `valor_bookmarks_${activeUserId}_${video.id}`;
      localStorage.setItem(key, JSON.stringify(updatedBookmarks));
    } catch (err) {}

    // 2. Send GraphQL mutation to server (SQLite / TiDB)
    try {
      const activeUserId = userId || 'local';
      const resolvedTmdbId = video.tmdbId;
      if (!resolvedTmdbId) {
        console.warn('Skipping bookmarks server sync: tmdbId is missing');
        return;
      }
      
      const seriesInfo = classifyVideoTitle(video.title);
      const isTV = video.type === 'online_tv' || seriesInfo.type === 'series';
      const season = video.season || seriesInfo.season || 1;
      const episode = video.episode || seriesInfo.episode || 1;

      // Filter only bookmarks created by the current user
      const userBookmarks = updatedBookmarks.filter(bm => {
        return !bm.createdBy || bm.createdBy === 'manual' || bm.userId === activeUserId || bm.userName === profileName;
      });

      const mutation = `
        mutation SaveBookmarks($userId: String!, $videoId: String!, $tmdbId: Int!, $season: Int, $episode: Int, $bookmarks: [BookmarkInput!]!) {
          saveBookmarks(userId: $userId, videoId: $videoId, tmdbId: $tmdbId, season: $season, episode: $episode, bookmarks: $bookmarks) {
            success
            count
          }
        }
      `;
      
      const serialized = userBookmarks.map(bm => ({
        id: bm.id,
        time: bm.time,
        endTime: bm.endTime !== undefined ? bm.endTime : null,
        label: bm.label || '',
        isIntro: bm.isIntro || false,
        isOutro: bm.isOutro || false,
        skipEnabled: bm.skipEnabled || false,
        title: bm.title || '',
        description: bm.description || '',
        category: bm.category || 'Custom',
        thumbnail: bm.thumbnail || '',
        favorite: bm.favorite || false,
        createdAt: bm.createdAt || new Date().toISOString(),
        updatedAt: bm.updatedAt || new Date().toISOString(),
        userName: bm.userName || profileName || 'Local Profile',
        userTime: bm.userTime || new Date().toISOString(),
        mediaName: bm.mediaName || video.title || ''
      }));

      await fetch('http://127.0.0.1:50001/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: { 
            userId: activeUserId, 
            videoId: video.id, 
            tmdbId: resolvedTmdbId,
            season: isTV ? season : null,
            episode: isTV ? episode : null,
            bookmarks: serialized 
          }
        })
      });
    } catch (err) {
      console.warn('Failed to sync bookmarks to server:', err);
    }
  }, [video.id, video.tmdbId, video.title, video.type, video.season, video.episode, userId, profileName]);

  // Load TV metadata (TMDB)
  useEffect(() => {
    if (video.type !== 'online_tv' || !video.tmdbId) return;

    const fetchTvData = async () => {
      try {
        const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
        const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;
        let url = `https://api.themoviedb.org/3/tv/${video.tmdbId}?language=en-US`;
        let headers: HeadersInit = { 'accept': 'application/json' };
        
        if (isBearer) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          url += `&api_key=${token}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error('Failed to fetch TV details');
        const data = await res.json();
        
        const episodesMap: { [key: number]: number } = {};
        (data.seasons || []).forEach((s: any) => {
          if (s.season_number > 0) {
            episodesMap[s.season_number] = s.episode_count;
          }
        });

        setTvMetadata({
          seasonsCount: data.number_of_seasons || Object.keys(episodesMap).length,
          episodesPerSeason: episodesMap
        });
      } catch (err) {
        console.error('Error fetching TV details:', err);
      }
    };

    fetchTvData();
  }, [video.tmdbId, video.type, tmdbApiKey]);

  // Fetch Anime details (AniList)
  useEffect(() => {
    if (video.type !== 'online_anime' || !video.anilistId) return;

    const fetchAnimeData = async () => {
      try {
        const graphqlQuery = `
          query ($id: Int) {
            Media (id: $id, type: ANIME) {
              episodes
            }
          }
        `;
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            query: graphqlQuery,
            variables: { id: video.anilistId }
          })
        });

        if (!res.ok) throw new Error('Failed to fetch Anime details');
        const body = await res.json();
        setAnimeEpisodesCount(body.data?.Media?.episodes || 12);
      } catch (err) {
        console.error('Error fetching Anime details:', err);
        setAnimeEpisodesCount(12);
      }
    };

    fetchAnimeData();
  }, [video.anilistId, video.type]);

  // Load initial bookmarks
  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  // Auto-hide controls handler
  const handleMouseMove = () => {
    if (isLocked) return;
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    
    if (isPlaying && !interactWithNative) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, uiHideTimeout);
    }
  };

  // Keyboard Hotkeys listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked || showAddDialog || showSettingsPanel) return;

      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      // Ignore browser/system shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekDelta(10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekDelta(-10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (interactWithNative) {
            setInteractWithNative(false);
            addToast("Returned to Premium controls");
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, isPlaying, volume, isMuted, showAddDialog, showSettingsPanel, interactWithNative, sendIframeCommand]);

  // Listen to postMessage player events from iframe
  useEffect(() => {
    const handlePlayerMessage = (e: MessageEvent) => {
      try {
        let parsed = e.data;
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }

        if (parsed && parsed.type === 'PLAYER_EVENT') {
          const { event: playerEvent, currentTime: pTime, duration: pDur } = parsed.data;

          if (typeof pTime === 'number') {
            setCurrentTime(pTime);
            
            // Check for Auto-Skip bookmarks (Intro & Outro / Sex & Nudity)
            checkAutoSkip(pTime);

            // Periodic Save Progress to Server / storage
            if (Math.abs(pTime - lastSaveTimeRef.current) >= historySaveInterval) {
              lastSaveTimeRef.current = pTime;
              const updated: VideoItem = {
                ...video,
                currentTime: pTime,
                duration: formatTime(pDur || duration),
                season: video.type === 'online_tv' ? currentSeason : undefined,
                episode: video.type !== 'online_movie' ? currentEpisode : undefined
              };
              onUpdateVideo(updated);
            }
          }

          if (typeof pDur === 'number' && pDur > 0) {
            setDuration(pDur);
          }

          if (playerEvent === 'play') {
            setIsPlaying(true);
          } else if (playerEvent === 'pause') {
            setIsPlaying(false);
          } else if (playerEvent === 'ended') {
            setIsPlaying(false);
            handleVideoEnded();
          }
        }
      } catch (err) {}
    };

    window.addEventListener('message', handlePlayerMessage);
    return () => window.removeEventListener('message', handlePlayerMessage);
  }, [video, duration, currentSeason, currentEpisode, historySaveInterval, onUpdateVideo]);

  // Construct URL for streaming server iframe
  const getEmbedUrl = () => {
    const id = video.type === 'online_anime' ? video.anilistId : video.tmdbId;
    const startProgress = video.currentTime && Math.floor(video.currentTime) > 10 ? `?progress=${Math.floor(video.currentTime)}` : '';
    
    if (server === 'videasy') {
      const colorParam = startProgress ? '&color=8B5CF6' : '?color=8B5CF6';
      if (video.type === 'online_movie') {
        return `https://player.videasy.net/movie/${id}${startProgress}${colorParam}`;
      } else if (video.type === 'online_tv') {
        return `https://player.videasy.net/tv/${id}/${currentSeason}/${currentEpisode}${startProgress}${colorParam}&nextEpisode=true&episodeSelector=true`;
      } else {
        return `https://player.videasy.net/anime/${id}/${currentEpisode}${startProgress}${colorParam}`;
      }
    } else {
      const colorParam = startProgress ? '&color=e50914' : '?color=e50914';
      if (video.type === 'online_movie') {
        return `https://www.vidking.net/embed/movie/${id}${startProgress}${colorParam}&autoPlay=true`;
      } else {
        return `https://www.vidking.net/embed/tv/${id}/${currentSeason}/${currentEpisode}${startProgress}${colorParam}&nextEpisode=true&episodeSelector=true`;
      }
    }
  };

  // Skip auto-marked scenes
  const checkAutoSkip = (time: number) => {
    // Prevent double trigger within 3 seconds
    if (Date.now() - lastSkipTimeRef.current < 3000) return;

    const matched = bookmarks.find(bm => {
      if (!bm.endTime || bm.endTime <= bm.time) return false;
      const inside = time >= bm.time && time < bm.endTime;
      if (!inside) return false;

      // Filter by user preference toggles
      const isIntroOutro = bm.isIntro || bm.isOutro || bm.category === 'Intro' || bm.category === 'Outro';
      const isSexScene = bm.category === 'Sex' || bm.category === 'Nudity';

      if (isIntroOutro && autoSkipIntroOutro) return true;
      if (isSexScene && autoSkipSexScenes) return true;
      if (bm.skipEnabled && !isIntroOutro && !isSexScene) return true;

      return false;
    });

    if (matched && matched.endTime) {
      lastSkipTimeRef.current = Date.now();
      addToast(`Auto-Skipping Scene: ${matched.title || matched.category}`);
      sendIframeCommand('seek', matched.endTime);
      setCurrentTime(matched.endTime);
    }
  };

  // Playback control functions
  const togglePlay = () => {
    if (isLocked) return;
    if (isPlaying) {
      sendIframeCommand('pause');
      setIsPlaying(false);
    } else {
      sendIframeCommand('play');
      setIsPlaying(true);
    }
  };

  const seekDelta = (secs: number) => {
    if (isLocked || blockSeekingCompletely) return;
    const target = Math.max(0, Math.min(duration, currentTime + secs));
    sendIframeCommand('seek', target);
    setCurrentTime(target);
    addToast(secs > 0 ? `+${secs}s` : `${secs}s`);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked || blockSeekingCompletely) return;
    const target = Number(e.target.value);
    sendIframeCommand('seek', target);
    setCurrentTime(target);
  };

  const adjustVolume = (delta: number) => {
    if (isLocked) return;
    const val = Math.max(0, Math.min(1.0, volume + delta));
    setVolume(val);
    localStorage.setItem('valor_player_volume', String(val));
    setIsMuted(val === 0);
    
    // Note: Cross-origin iframe limitations might prevent volume modification 
    // inside the iframe directly, but we show visual status inside our custom control
    addToast(`Volume: ${Math.round(val * 100)}%`);
  };

  const toggleMute = () => {
    if (isLocked) return;
    setIsMuted(prev => {
      const next = !prev;
      addToast(next ? "Muted" : `Volume: ${Math.round(volume * 100)}%`);
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (isLocked) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  // Autoplay next episode logic
  const handleVideoEnded = () => {
    const totalEps = video.type === 'online_tv' 
      ? (tvMetadata?.episodesPerSeason[currentSeason] || 10) 
      : (animeEpisodesCount || 12);
      
    if (currentEpisode < totalEps) {
      addToast(`Autoplay: Starting Episode ${currentEpisode + 1}...`);
      setTimeout(() => {
        setCurrentEpisode(currentEpisode + 1);
        setCurrentTime(0);
        setIsPlaying(true);
      }, 3000);
    } else if (video.type === 'online_tv' && tvMetadata && currentSeason < tvMetadata.seasonsCount) {
      addToast(`Autoplay: Starting Season ${currentSeason + 1} Episode 1...`);
      setTimeout(() => {
        setCurrentSeason(currentSeason + 1);
        setCurrentEpisode(1);
        setCurrentTime(0);
        setIsPlaying(true);
      }, 3000);
    } else {
      addToast("Series finished!");
    }
  };

  // Helper formatting clock
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Add / Edit Bookmarks handlers
  const handleSaveBookmark = (bmData: Partial<Bookmark>) => {
    let nextBookmarks = [...bookmarks];
    if (bmData.id) {
      // Edit mode
      nextBookmarks = nextBookmarks.map(b => b.id === bmData.id ? { ...b, ...bmData } as Bookmark : b);
      addToast("Bookmark Updated");
    } else {
      // Create mode
      const newBm: Bookmark = {
        id: `bm-${Date.now()}`,
        time: bmData.time ?? currentTime,
        endTime: bmData.endTime,
        label: bmData.label || bmData.title || 'Scene Mark',
        isIntro: bmData.category === 'Intro',
        isOutro: bmData.category === 'Outro',
        skipEnabled: bmData.skipEnabled || false,
        title: bmData.title || '',
        description: bmData.description || '',
        category: bmData.category || 'Custom',
        thumbnail: bmData.thumbnail || '',
        favorite: bmData.favorite || false,
        createdBy: 'manual'
      };
      nextBookmarks.push(newBm);
      addToast("Bookmark Saved");
    }
    setBookmarks(nextBookmarks);
    saveBookmarksToServer(nextBookmarks);
    setMarkingStartTime(null);
  };

  const handleDeleteBookmark = (bmId: string) => {
    const next = bookmarks.filter(b => b.id !== bmId);
    setBookmarks(next);
    saveBookmarksToServer(next);
    addToast("Bookmark Deleted");
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (showSettingsPanel || showAddDialog || interactWithNative) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('.player-quick-settings-panel')) return;

    if (e.deltaY < 0) {
      adjustVolume(0.1);
    } else if (e.deltaY > 0) {
      adjustVolume(-0.1);
    }
  };

  return (
    <div 
      ref={playerContainerRef}
      className={`local-player-container ${isLocked ? 'is-locked' : ''}`}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onMouseLeave={() => !interactWithNative && isPlaying && setShowControls(false)}
      style={{ background: 'black', fontFamily: 'Outfit, sans-serif' }}
    >
      {/* Standalone Source Selector Dropdown (Unnested) */}
      <div style={{ position: 'fixed', top: '20px', right: '70px', zIndex: 2200, pointerEvents: 'auto' }}>
        <CustomSelect
          value={server}
          onChange={(val) => setServer(val as 'videasy' | 'vidking')}
          options={[
            { value: 'videasy', label: 'Source 1' },
            { value: 'vidking', label: 'Source 2' }
          ]}
          hideSearch={true}
          width="130px"
        />
      </div>

      {/* Standalone Exit Button (Unnested) */}
      <button 
        onClick={onBack}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 2200,
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: 'rgba(10, 10, 15, 0.85)',
          backdropFilter: 'blur(15px)',
          WebkitBackdropFilter: 'blur(15px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: 'rgba(255, 255, 255, 0.85)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          transition: 'all 0.2s ease',
          pointerEvents: 'auto'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#fff';
          e.currentTarget.style.background = '#e50914';
          e.currentTarget.style.borderColor = '#e50914';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)';
          e.currentTarget.style.background = 'rgba(10, 10, 15, 0.85)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
        }}
        title="Exit Player"
      >
        <X size={18} />
      </button>

      <style>{`
        .local-player-container {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          background: #000;
          z-index: 2000;
          overflow: hidden;
          user-select: none;
        }
        .online-iframe-wrapper {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 5;
          pointer-events: auto !important;
        }
        .online-native-hud {
          position: absolute;
          top: 75px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(229, 9, 20, 0.95);
          border: 1px solid #ff4a4a;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.5);
          animation: slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .online-native-hud button {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 3px 10px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 700;
          font-size: 11px;
          transition: background 0.2s;
        }
        .online-native-hud button:hover {
          background: rgba(255,255,255,0.35);
        }
        .control-btn-native {
          background: rgba(255,255,255,0.05) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          color: #a78bfa !important;
        }
        .control-btn-native:hover {
          background: rgba(167, 139, 250, 0.15) !important;
          border-color: #c084fc !important;
          color: #c084fc !important;
        }

        /* Custom UI Overlays Styling */
        .player-ui-overlay-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 10;
          background: transparent !important;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          opacity: 1 !important;
          pointer-events: none !important;
        }
        .player-ui-overlay-layer.visible {
          opacity: 1 !important;
          pointer-events: none !important;
        }

        .top-bar-overlay {
          height: 80px;
          background: transparent !important;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          width: 100%;
          box-sizing: border-box;
          pointer-events: auto;
        }
        .back-btn {
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
          transition: transform 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-radius: 50%;
        }
        .back-btn:hover {
          background: rgba(255,255,255,0.1);
          transform: scale(1.08);
        }
        .player-title-info h2 {
          margin: 0;
          font-size: 1.25rem;
          color: white;
          font-weight: 700;
        }
        .player-title-info span {
          font-size: 0.85rem;
          color: #a78bfa;
          font-weight: 600;
          margin-top: 4px;
          display: block;
        }
        .source-indicator-badge {
          background: rgba(139, 92, 246, 0.2);
          border: 1px solid #8b5cf6;
          color: #c084fc;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
        }

        .center-hud-clicker {
          flex-grow: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .lock-hud-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: #ff0914;
          background: rgba(0,0,0,0.7);
          padding: 20px 40px;
          border-radius: 16px;
          border: 1px solid rgba(255,9,20,0.3);
          backdrop-filter: blur(10px);
        }
        .lock-hud-indicator span {
          font-weight: 700;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .pause-synopsis-overlay {
          position: absolute;
          left: 2rem;
          bottom: 120px;
          max-width: 450px;
          z-index: 12;
          pointer-events: none;
        }
        .synopsis-box {
          background: rgba(10, 10, 15, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 1.5rem;
          border-radius: 16px;
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
          pointer-events: auto;
        }
        .synopsis-tag {
          background: #ff0914;
          color: white;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 4px;
          letter-spacing: 0.5px;
        }
        .synopsis-box h3 {
          margin: 10px 0 6px 0;
          color: white;
          font-size: 1.35rem;
        }
        .synopsis-box p {
          margin: 0;
          color: rgba(255, 255, 255, 0.55);
          font-size: 0.85rem;
          line-height: 1.5;
        }

        .bottom-bar-overlay {
          background: transparent !important;
          padding: 1.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          width: 100%;
          box-sizing: border-box;
          pointer-events: auto;
        }
        .scrub-container-premium {
          position: relative;
          width: 100%;
          height: 16px;
          display: flex;
          align-items: center;
          cursor: pointer;
        }
        .scrub-bar-premium {
          position: absolute;
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.2);
          border-radius: 2px;
          outline: none;
          -webkit-appearance: none;
          z-index: 10;
          cursor: pointer;
        }
        .scrub-bar-premium::-webkit-slider-runnable-track {
          background: transparent;
        }
        .scrub-bar-premium::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          transform: scale(0);
          opacity: 0;
          transition: transform 0.15s, opacity 0.15s;
        }
        .scrub-container-premium:hover .scrub-bar-premium::-webkit-slider-thumb,
        .scrub-bar-premium:active::-webkit-slider-thumb {
          transform: scale(1.3);
          opacity: 1;
        }
        .scrub-track-progress {
          position: absolute;
          height: 4px;
          background: #8b5cf6;
          border-radius: 2px 0 0 2px;
          z-index: 8;
          pointer-events: none;
        }
        .timeline-bookmark-range {
          position: absolute;
          height: 4px;
          background: rgba(229, 9, 20, 0.6);
          z-index: 9;
          pointer-events: none;
        }
        .timeline-bookmark-dot {
          position: absolute;
          width: 6px;
          height: 6px;
          background: #fbbf24;
          border-radius: 50%;
          transform: translate(-3px, -1px);
          z-index: 9;
          pointer-events: none;
        }
        .timeline-bookmark-range.nudity, .timeline-bookmark-dot.nudity { background: #ec4899; }
        .timeline-bookmark-range.sex, .timeline-bookmark-dot.sex { background: #a855f7; }
        .timeline-bookmark-range.gore, .timeline-bookmark-dot.gore { background: #ef4444; }
        .timeline-bookmark-range.intro, .timeline-bookmark-dot.intro { background: #3b82f6; }
        .timeline-bookmark-range.outro, .timeline-bookmark-dot.outro { background: #10b981; }

        .bottom-control-buttons-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }
        .bottom-controls-left-group, .bottom-controls-right-group {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }
        .control-btn {
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-radius: 50%;
          transition: background 0.2s, transform 0.15s;
        }
        .control-btn:hover {
          background: rgba(255,255,255,0.1);
          transform: scale(1.08);
        }
        .control-btn.active {
          color: #8b5cf6;
        }
        .volume-slider-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .volume-slider-bar {
          width: 80px;
          height: 4px;
          background: rgba(255,255,255,0.2);
          border-radius: 2px;
          outline: none;
          -webkit-appearance: none;
          cursor: pointer;
        }
        .volume-slider-bar::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
        }
        .time-display-odometer {
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(255,255,255,0.7);
          font-size: 0.85rem;
          font-family: monospace;
        }
        .time-display-odometer .divider {
          color: rgba(255,255,255,0.3);
        }

        .popover-wrapper {
          position: relative;
        }
        .player-toast-notification {
          position: absolute;
          bottom: 120px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(139, 92, 246, 0.95);
          border: 1px solid #a78bfa;
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          z-index: 1000;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
      `}</style>

      {/* Direct Interactive Streaming HUD */}
      {interactWithNative && (
        <div className="online-native-hud">
          <Cpu size={14} className="animate-pulse" />
          <span>Interacting with native streaming controls. controls overlays temporarily hidden.</span>
          <button onClick={() => setInteractWithNative(false)}>ESC to Return</button>
        </div>
      )}

      {/* Main Stream Iframe */}
      <div className={`online-iframe-wrapper ${interactWithNative ? 'native-active' : ''}`}>
        <iframe
          ref={iframeRef}
          key={getEmbedUrl()}
          src={getEmbedUrl()}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allowFullScreen
          allow="autoplay; encrypted-media"
          {...{ credentialless: "true" }}
        />
      </div>

      {/* Custom CONTROL OVERLAY OVER THE IFRAME */}
      {!interactWithNative && (
        <div 
          className={`player-ui-overlay-layer ${showControls ? 'visible' : ''}`}
          style={{ zIndex: 10, background: 'transparent', pointerEvents: 'none' }}
        >
          {/* Top Bar controls - Only X Close Button */}
          <div className="top-bar-overlay" style={{ background: 'transparent', justifyContent: 'space-between', padding: '16px 20px', pointerEvents: 'none' }}>
            <button
              onClick={() => setIsLocked(!isLocked)}
              className={`control-btn ${isLocked ? 'active' : ''}`}
              style={{ pointerEvents: 'auto', background: isLocked ? 'rgba(229, 9, 20, 0.2)' : 'rgba(0,0,0,0.6)', border: `1px solid ${isLocked ? '#e50914' : 'rgba(255,255,255,0.15)'}`, borderRadius: '8px', padding: '8px', color: isLocked ? '#e50914' : '#fff' }}
            >
              <Lock size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto', pointerEvents: 'auto' }}>
              {/* Close Button X */}
              <button 
                className="back-btn" 
                onClick={onBack} 
                title="Exit Player"
                style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Toast notifications */}
          {toastMessage && (
            <div className="player-toast-notification" style={{ pointerEvents: 'auto' }}>
              {toastMessage}
            </div>
          )}

          {/* Interactive Skip Section Overlay Button */}
          {activeBookmarkForSkip && (
            <div 
              style={{
                position: 'absolute',
                bottom: '80px',
                right: '24px',
                zIndex: 25,
                pointerEvents: 'auto'
              }}
            >
              <button
                onClick={() => {
                  if (activeBookmarkForSkip.endTime) {
                    sendIframeCommand('seek', activeBookmarkForSkip.endTime);
                    setCurrentTime(activeBookmarkForSkip.endTime);
                    addToast(`Skipped ${activeBookmarkForSkip.category || 'Section'}`);
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '10px',
                  color: '#fff',
                  padding: '10px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 8px 25px rgba(109, 40, 217, 0.5)'
                }}
              >
                <SkipForward size={16} />
                <span>Skip {activeBookmarkForSkip.category || 'Section'}</span>
              </button>
            </div>
          )}

          {/* Bottom Controls Overlay (Strictly pointerEvents none on wrapper!) */}
          <div className="bottom-bar-overlay" style={{ background: 'transparent', padding: '16px 20px', pointerEvents: 'none' }}>
            {/* Timeline Progress Tracker with Bookmarks */}
            <div className="scrub-container-premium" style={{ cursor: 'default', marginBottom: '10px', pointerEvents: 'auto' }}>
              {/* Visual Track Background */}
              <div 
                className="scrub-track-bg" 
                style={{ 
                  position: 'absolute', 
                  width: '100%', 
                  height: '4px', 
                  background: 'rgba(255,255,255,0.2)', 
                  borderRadius: '2px',
                  zIndex: 7
                }} 
              />
              
              {/* Visual Progress Bar Overlay */}
              <div 
                className="scrub-track-progress" 
                style={{ 
                  width: `${(currentTime / (duration || 1)) * 100}%`,
                  height: '4px',
                  background: '#8b5cf6',
                  borderRadius: '2px',
                  position: 'absolute',
                  zIndex: 8
                }} 
              />

              {/* Render bookmarks on timeline */}
              {bookmarks.map((bm) => {
                const pct = (bm.time / (duration || 1)) * 100;
                const isRange = bm.endTime !== undefined && bm.endTime > bm.time;
                
                if (isRange && bm.endTime) {
                  const endPct = (bm.endTime / (duration || 1)) * 100;
                  const width = endPct - pct;
                  return (
                    <div 
                      key={bm.id}
                      className={`timeline-bookmark-range ${bm.category?.toLowerCase() || ''}`}
                      style={{ left: `${pct}%`, width: `${width}%` }}
                      title={`${bm.category}: ${bm.title || bm.label}`}
                    />
                  );
                }
                return (
                  <div 
                    key={bm.id}
                    className={`timeline-bookmark-dot ${bm.category?.toLowerCase() || ''}`}
                    style={{ left: `${pct}%` }}
                    title={`${bm.category}: ${bm.title || bm.label}`}
                  />
                );
              })}
            </div>

            {/* Bottom Control Buttons Row - Strictly pointerEvents none on row wrapper! */}
            <div className="bottom-control-buttons-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '6px', pointerEvents: 'none' }}>
              <div className="popover-wrapper" style={{ position: 'relative', pointerEvents: 'auto' }}>
                <button 
                  className={`control-btn ${showBookmarksPopover ? 'active' : ''}`}
                  onClick={() => setShowBookmarksPopover(prev => !prev)}
                  title="Bookmarks Panel"
                  style={{
                    background: 'rgba(12, 12, 18, 0.85)',
                    border: '1.5px solid rgba(255, 255, 255, 0.4)',
                    borderRadius: '12px',
                    color: '#fff',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(139, 92, 246, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <BookmarkIcon size={22} />
                </button>

                {showBookmarksPopover && (
                  <BookmarkPanel 
                    bookmarks={bookmarks}
                    onJump={(time) => {
                      sendIframeCommand('seek', time);
                      setCurrentTime(time);
                      setShowBookmarksPopover(false);
                    }}
                    onEdit={(bm) => {
                      setEditingBookmark(bm);
                      setShowAddDialog(true);
                      setShowBookmarksPopover(false);
                    }}
                    onDelete={handleDeleteBookmark}
                    onAdd={() => {
                      setEditingBookmark(undefined);
                      setShowAddDialog(true);
                      setShowBookmarksPopover(false);
                    }}
                    onClose={() => setShowBookmarksPopover(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bookmark Modal */}
      {showAddDialog && (
        <BookmarkModal 
          initialTime={markingStartTime !== null ? markingStartTime : Math.round(currentTime)}
          initialEndTime={markingStartTime !== null ? Math.round(currentTime) : undefined}
          initialBookmark={editingBookmark}
          videoElement={null}
          videoTitle={video.title}
          onSave={handleSaveBookmark}
          onClose={() => {
            setShowAddDialog(false);
            setMarkingStartTime(null);
          }}
        />
      )}
    </div>
  );
};
