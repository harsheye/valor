import React, { useState, useEffect, useMemo } from 'react';
import type { VideoItem } from '../types/media';
import { SearchBar } from './streaming/SearchBar';
import { SegmentedControl, type SegmentOption } from './streaming/SegmentedControl';
import { PosterCard, type PosterMediaItem } from './streaming/PosterCard';
import { PosterGridSkeleton } from './streaming/Skeletons';
import { SearchX, RotateCcw, AlertTriangle, Sparkles, History as HistoryIcon, TrendingUp, Play } from 'lucide-react';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { smartTitleCase } from '../utils/libraryViewModel';
import { DEFAULT_TMDB_TOKEN } from '../utils/constants';
import './streaming/streaming.css';

interface OnlineSearchTabProps {
  onSelectMedia: (video: VideoItem) => void;
  onPlayVideo?: (video: VideoItem) => void;
  tmdbApiKey?: string;
  traktAccessToken?: string;
  videos?: VideoItem[];
}

export type MediaFilterType = 'all' | 'series' | 'movies';

interface SearchResult {
  id: string | number;
  title: string;
  posterPath: string;
  year: string;
  type: 'movie' | 'tv' | 'anime';
  overview?: string;
  rating?: number;
  seasonEpisode?: string;
  progressPercent?: number;
  originalVideo?: VideoItem;
}

// Curated high-quality recommendations & trending library
const CURATED_CATALOG: Record<string, SearchResult[]> = {
  crime_mystery: [
    {
      id: 1403,
      title: 'Dexter: New Blood',
      year: '2021',
      type: 'tv',
      rating: 8.1,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/5E122Uevc7caezGvaLKnC8v1pce.jpg',
      overview: 'Set 10 years after Dexter went missing in the eye of Hurricane Laura, he is living under an assumed name.'
    },
    {
      id: 67744,
      title: 'Mindhunter',
      year: '2017',
      type: 'tv',
      rating: 8.6,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/fbKE87mojpIETWepSbD5Qt741d7.jpg',
      overview: 'An agent in the FBI\'s Elite Serial Crime Unit develops profiling techniques to catch serial killers.'
    },
    {
      id: 46648,
      title: 'True Detective',
      year: '2014',
      type: 'tv',
      rating: 8.3,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/cuV2O5cfmtpsdVWng3a29gqHgqm.jpg',
      overview: 'Police investigations unearth the personal and professional secrets of those involved, both within and outside the law.'
    },
    {
      id: 1396,
      title: 'Breaking Bad',
      year: '2008',
      type: 'tv',
      rating: 8.9,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg',
      overview: 'A chemistry teacher diagnosed with terminal lung cancer turns to manufacturing and selling methamphetamine.'
    },
    {
      id: 114479,
      title: 'The Penguin',
      year: '2024',
      type: 'tv',
      rating: 8.5,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/aeUgugpUaYqV02n7vK49uF4462U.jpg',
      overview: 'Follow Oswald "Oz" Cobb as he navigates the corruption and chaos of Gotham City\'s criminal underworld.'
    },
    {
      id: 414906,
      title: 'The Batman',
      year: '2022',
      type: 'movie',
      rating: 7.7,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg',
      overview: 'In his second year of fighting crime, Batman uncovers corruption in Gotham City that connects to his own family.'
    },
    {
      id: 807,
      title: 'Se7en',
      year: '1995',
      type: 'movie',
      rating: 8.4,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/6yoghtyTpznpBik8EngEmJskVUO.jpg',
      overview: 'Two detectives hunt a serial killer who uses the seven deadly sins as his motives.'
    },
    {
      id: 1949,
      title: 'Zodiac',
      year: '2007',
      type: 'movie',
      rating: 7.6,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/6Sj9wDu3YnbQ5MrMlhTk0Jz9Eme.jpg',
      overview: 'A cartoonist becomes obsessed with tracking down the Zodiac Killer in Northern California.'
    }
  ],
  drama_thriller: [
    {
      id: 95403,
      title: 'Severance',
      year: '2022',
      type: 'tv',
      rating: 8.4,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/pPHuE2vlS526GbmNnO9B9n3gZtX.jpg',
      overview: 'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.'
    },
    {
      id: 76331,
      title: 'Succession',
      year: '2018',
      type: 'tv',
      rating: 8.4,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/7udW8a1K0kC0rB68rO1u1hR3k5y.jpg',
      overview: 'The Roy family is known for controlling the biggest media and entertainment company in the world.'
    },
    {
      id: 126308,
      title: 'Shōgun',
      year: '2024',
      type: 'tv',
      rating: 8.5,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/7O4iVfOMQmdCSPxRIiqxdu2NUE1.jpg',
      overview: 'In feudal Japan, Lord Yoshii Toranaga discovers secrets that could tip the scales of power.'
    },
    {
      id: 872585,
      title: 'Oppenheimer',
      year: '2023',
      type: 'movie',
      rating: 8.1,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
      overview: 'The story of J. Robert Oppenheimer\'s role in the development of the atomic bomb during World War II.'
    },
    {
      id: 496243,
      title: 'Parasite',
      year: '2019',
      type: 'movie',
      rating: 8.5,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
      overview: 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.'
    },
    {
      id: 550,
      title: 'Fight Club',
      year: '1999',
      type: 'movie',
      rating: 8.4,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
      overview: 'A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.'
    }
  ],
  trending: [
    {
      id: 93405,
      title: 'Squid Game',
      year: '2024',
      type: 'tv',
      rating: 7.8,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/dDlG1TjAec37nS9eM5rW6W0UuYh.jpg',
      overview: 'Hundreds of cash-strapped players accept a strange invitation to compete in children\'s games.'
    },
    {
      id: 693134,
      title: 'Dune: Part Two',
      year: '2024',
      type: 'movie',
      rating: 8.2,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
      overview: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.'
    },
    {
      id: 114479,
      title: 'The Penguin',
      year: '2024',
      type: 'tv',
      rating: 8.5,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/aeUgugpUaYqV02n7vK49uF4462U.jpg',
      overview: 'Follow Oswald "Oz" Cobb as he navigates the corruption of Gotham City\'s criminal underworld.'
    },
    {
      id: 95403,
      title: 'Severance',
      year: '2022',
      type: 'tv',
      rating: 8.4,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/pPHuE2vlS526GbmNnO9B9n3gZtX.jpg',
      overview: 'Mark leads a team of office workers whose memories have been surgically divided.'
    },
    {
      id: 124364,
      title: 'From',
      year: '2022',
      type: 'tv',
      rating: 8.2,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/uF609aq4q7jwhcHQp284kn8f4n2.jpg',
      overview: 'Unravel the mystery of a nightmarish town in middle America that traps all who enter.'
    },
    {
      id: 157336,
      title: 'Interstellar',
      year: '2014',
      type: 'movie',
      rating: 8.4,
      posterPath: 'https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
      overview: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.'
    }
  ]
};

export const OnlineSearchTab: React.FC<OnlineSearchTabProps> = ({
  onSelectMedia,
  onPlayVideo,
  tmdbApiKey,
  videos = []
}) => {
  const [query, setQuery] = useState(() => {
    return localStorage.getItem('valor_online_search_query') || '';
  });
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaFilterType>(() => {
    return (localStorage.getItem('valor_online_search_type') as MediaFilterType) || 'all';
  });

  const [results, setResults] = useState<SearchResult[]>([]);
  const [trendingList, setTrendingList] = useState<SearchResult[]>(CURATED_CATALOG.trending);
  const [recommendedList, setRecommendedList] = useState<SearchResult[]>(CURATED_CATALOG.crime_mystery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter options: All / Series / Movies
  const typeOptions: SegmentOption<MediaFilterType>[] = [
    { value: 'all', label: 'All' },
    { value: 'series', label: 'Series' },
    { value: 'movies', label: 'Movies' }
  ];

  // 1. Extract History Items & Detect User's Favorite Genres
  const { historyMediaItems, topGenreLabel, recentHistoryNames } = useMemo(() => {
    const genreScore: Record<string, number> = {
      crime_mystery: 0,
      drama_thriller: 0
    };
    const titlesList: string[] = [];

    const mappedHistory: SearchResult[] = videos
      .filter(v => v.title)
      .slice(0, 8)
      .map(v => {
        const info = classifyVideoTitle(v.title);
        const isSeries = info.type === 'series';
        const cleanName = smartTitleCase(info.seriesTitle || info.cleanTitle || v.title);
        titlesList.push(cleanName);

        const lower = cleanName.toLowerCase();
        if (/dexter|kidnap|crime|killer|detective|murder|police|fbi|sherlock|underworld|gangster|investigation/i.test(lower)) {
          genreScore.crime_mystery += 3;
        } else {
          genreScore.drama_thriller += 2;
        }

        const seasonEpisode = isSeries && info.season !== undefined && info.episode !== undefined
          ? `S${String(info.season).padStart(2, '0')}E${String(info.episode).padStart(2, '0')}`
          : undefined;

        const durationSec = typeof v.duration === 'string' ? parseFloat(v.duration) : (typeof (v as any).duration === 'number' ? (v as any).duration : 0);
        const currentSec = typeof v.currentTime === 'number' ? v.currentTime : 0;
        const progressPercent = durationSec > 0
          ? Math.min(100, Math.round((currentSec / durationSec) * 100))
          : 0;

        return {
          id: v.id || `${cleanName}-${currentSec}`,
          title: isSeries && seasonEpisode ? `${cleanName} - ${seasonEpisode}` : cleanName,
          posterPath: (v as any).posterPath || (v as any).thumbnailUrl || '',
          year: info.year ? String(info.year) : '2024',
          type: isSeries ? 'tv' : 'movie',
          seasonEpisode,
          progressPercent,
          originalVideo: v
        };
      });

    const isCrime = genreScore.crime_mystery >= genreScore.drama_thriller;
    const topGenre = isCrime ? 'Crime & Mystery' : 'Drama & Thriller';

    return {
      historyMediaItems: mappedHistory,
      topGenreLabel: topGenre,
      recentHistoryNames: Array.from(new Set(titlesList)).slice(0, 2).join(' & ')
    };
  }, [videos]);

  // 2. Fetch TMDB Trending & Dynamic Recommendations (with curated fallback)
  useEffect(() => {
    let isMounted = true;

    const fetchDiscoveryData = async () => {
      const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
      const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;

      // Select fallback genre list
      const baseRecommendations = topGenreLabel === 'Crime & Mystery' 
        ? CURATED_CATALOG.crime_mystery 
        : CURATED_CATALOG.drama_thriller;
      setRecommendedList(baseRecommendations);

      if (!token) {
        setTrendingList(CURATED_CATALOG.trending);
        return;
      }

      try {
        let url = 'https://api.themoviedb.org/3/trending/all/day?language=en-US';
        const headers: HeadersInit = { accept: 'application/json' };
        if (isBearer) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          url += `&api_key=${token}`;
        }

        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.results && data.results.length > 0) {
            const mapped: SearchResult[] = data.results
              .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
              .map((r: any) => {
                const isMovie = r.media_type === 'movie';
                const title = isMovie ? r.title : r.name;
                const date = isMovie ? r.release_date : r.first_air_date;
                const year = date ? date.split('-')[0] : '2024';
                const posterPath = r.poster_path
                  ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500${r.poster_path}`
                  : '';

                return {
                  id: r.id,
                  title: title || 'Unknown Title',
                  posterPath,
                  year,
                  type: isMovie ? 'movie' : 'tv',
                  overview: r.overview,
                  rating: r.vote_average
                };
              });
            setTrendingList(mapped);
          }
        }
      } catch (err: any) {
        console.warn('Using curated fallback discovery catalog:', err);
      }
    };

    fetchDiscoveryData();
    return () => { isMounted = false; };
  }, [tmdbApiKey, topGenreLabel]);

  // 3. Execute Search Query against TMDB
  const executeSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
      const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;

      let url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(searchQuery)}&include_adult=false`;
      const headers: HeadersInit = { accept: 'application/json' };

      if (isBearer) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        url += `&api_key=${token}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Search failed with status: ${res.status}`);
      const data = await res.json();

      const mapped: SearchResult[] = (data.results || [])
        .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
        .map((r: any) => {
          const isMovie = r.media_type === 'movie';
          const title = isMovie ? r.title : r.name;
          const date = isMovie ? r.release_date : r.first_air_date;
          const year = date ? date.split('-')[0] : '2024';
          const posterPath = r.poster_path
            ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500${r.poster_path}`
            : '';

          return {
            id: r.id,
            title: title || 'Unknown Title',
            posterPath,
            year,
            type: isMovie ? 'movie' : 'tv',
            overview: r.overview,
            rating: r.vote_average
          };
        });

      setResults(mapped);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to fetch search results from TMDB.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('valor_online_search_query', query);
    localStorage.setItem('valor_online_search_type', mediaTypeFilter);

    if (query.trim()) {
      executeSearch(query);
    } else {
      setResults([]);
      setLoading(false);
    }
  }, [query]);

  // Handle card selection
  const handleCardClick = (res: SearchResult) => {
    if (res.originalVideo && onPlayVideo) {
      onPlayVideo(res.originalVideo);
      return;
    }

    const videoItem: VideoItem = {
      id: `${res.type}-${res.id}`,
      title: res.title,
      url: '',
      type: res.type === 'movie' ? 'online_movie' : 'online_tv',
      isRemote: true,
      posterPath: res.posterPath,
      tmdbId: Number(res.id),
      audioTracks: [],
      subtitleTracks: []
    };
    onSelectMedia(videoItem);
  };

  // Filter helper for mediaTypeFilter: All / Series / Movies
  const filterByMediaType = (items: SearchResult[]) => {
    if (mediaTypeFilter === 'movies') {
      return items.filter(i => i.type === 'movie');
    }
    if (mediaTypeFilter === 'series') {
      return items.filter(i => i.type === 'tv' || (i as any).type === 'series');
    }
    return items;
  };

  const filteredSearchResults = useMemo(() => {
    return filterByMediaType(results);
  }, [results, mediaTypeFilter]);

  const filteredHistory = useMemo(() => {
    return filterByMediaType(historyMediaItems);
  }, [historyMediaItems, mediaTypeFilter]);

  const filteredRecommended = useMemo(() => {
    return filterByMediaType(recommendedList);
  }, [recommendedList, mediaTypeFilter]);

  const filteredTrending = useMemo(() => {
    return filterByMediaType(trendingList);
  }, [trendingList, mediaTypeFilter]);

  const isSearchActive = query.trim().length > 0;

  return (
    <div
      className="online-search-scroll-container"
      style={{
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        background: 'var(--bg)',
        color: 'var(--text-1)',
        padding: '0 0 var(--space-8) 0',
        boxSizing: 'border-box'
      }}
    >
      {/* Sticky Top Bar with Segmented Control & Pill Search Input */}
      <header
        className="online-search-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
          padding: 'var(--space-4) var(--page-padding-x, var(--space-7))',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 'var(--page-max-width, 1400px)',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)'
          }}
        >
          {/* Left: Type Segmented Control (All / Series / Movies) */}
          <SegmentedControl<MediaFilterType>
            options={typeOptions}
            value={mediaTypeFilter}
            onChange={(val) => {
              setMediaTypeFilter(val);
              setLoading(true);
              setTimeout(() => setLoading(false), 80);
            }}
            ariaLabel="Filter media type"
          />

          {/* Right: Pill Search Input with "/" shortcut & 250ms debounce */}
          <SearchBar
            value={query}
            onChange={(q) => setQuery(q)}
            placeholder="Search movies, TV series, anime..."
            debounceMs={250}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main
        className="online-search-content"
        style={{
          width: '100%',
          maxWidth: 'var(--page-max-width, 1400px)',
          margin: '0 auto',
          padding: 'var(--space-6) var(--page-padding-x, var(--space-7))',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-7)'
        }}
      >
        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'color-mix(in srgb, var(--danger) 15%, var(--surface-1))',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-1)'
            }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem' }}>{error}</span>
          </div>
        )}

        {/* ================================================================= */}
        {/* 1. SEARCH RESULTS VIEW (when user types a query)                   */}
        {/* ================================================================= */}
        {isSearchActive ? (
          <div>
            <div style={{ marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-1)'
                }}
              >
                Search Results for "{query}"
              </h1>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {filteredSearchResults.length} {filteredSearchResults.length === 1 ? 'title' : 'titles'}
              </span>
            </div>

            {loading ? (
              <PosterGridSkeleton count={12} />
            ) : filteredSearchResults.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: 'var(--space-8) var(--space-4)',
                  maxWidth: '480px',
                  margin: 'var(--space-6) auto',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                    marginBottom: 'var(--space-3)',
                    border: '1px solid var(--control-border)'
                  }}
                >
                  <SearchX size={28} />
                </div>

                <h2
                  style={{
                    margin: '0 0 var(--space-2) 0',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: 'var(--text-1)',
                    fontFamily: 'var(--font-display)'
                  }}
                >
                  No results found for "{query}"
                </h2>

                <p
                  style={{
                    margin: '0 0 var(--space-5) 0',
                    fontSize: '0.88rem',
                    lineHeight: 1.5,
                    color: 'var(--text-2)'
                  }}
                >
                  We couldn't find any matches. How to fix it:
                  <br />
                  • Check for spelling errors or typos.
                  <br />
                  • Try broader search keywords.
                  {mediaTypeFilter !== 'all' && (
                    <>
                      <br />
                      • Currently filtering by <strong>{mediaTypeFilter}</strong>. Switch to <strong>All</strong>.
                    </>
                  )}
                </p>

                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  {mediaTypeFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setMediaTypeFilter('all')}
                      style={{
                        background: 'var(--surface-2)',
                        color: 'var(--text-1)',
                        border: '1px solid var(--control-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 16px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Show All Formats
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'var(--accent-fill)',
                      color: 'var(--on-accent)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 16px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={14} /> Clear Search
                  </button>
                </div>
              </div>
            ) : (
              <div className="online-stream-grid">
                {filteredSearchResults.map((item, idx) => (
                  <PosterCard
                    key={`search-${item.type}-${item.id}`}
                    item={{
                      id: item.id,
                      title: item.title,
                      posterPath: item.posterPath,
                      year: item.year,
                      type: item.type,
                      rating: item.rating
                    }}
                    onClick={() => handleCardClick(item)}
                    index={idx}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ================================================================= */
          /* 2. DISCOVERY HOME VIEW (History + Recommendations + Trending)     */
          /* ================================================================= */
          <>
            {/* Section A: FROM YOUR HISTORY / CONTINUE WATCHING */}
            {filteredHistory.length > 0 && (
              <section aria-label="From Your History">
                <div style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <HistoryIcon size={16} />
                    </div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                        color: 'var(--text-1)'
                      }}
                    >
                      From Your History
                    </h2>
                  </div>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {filteredHistory.length} {filteredHistory.length === 1 ? 'title' : 'titles'}
                  </span>
                </div>

                <div className="online-stream-grid">
                  {filteredHistory.map((item, idx) => (
                    <PosterCard
                      key={`hist-${item.id}`}
                      item={{
                        id: item.id,
                        title: item.title,
                        posterPath: item.posterPath,
                        year: item.year,
                        type: item.type,
                        quality: item.seasonEpisode || 'History',
                        progressPercent: item.progressPercent
                      }}
                      onClick={() => handleCardClick(item)}
                      index={idx}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section B: RECOMMENDED FOR YOU (Based on favorite genres/history) */}
            <section aria-label="Recommended For You">
              <div style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: 'rgba(168, 85, 247, 0.15)',
                      color: '#a855f7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                        color: 'var(--text-1)'
                      }}
                    >
                      Recommended For You
                    </h2>
                  </div>
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-2)'
                  }}
                >
                  <span>{recentHistoryNames ? `Based on ${recentHistoryNames} · ${topGenreLabel}` : `Top in ${topGenreLabel}`}</span>
                </div>
              </div>

              <div className="online-stream-grid">
                {filteredRecommended.map((item, idx) => (
                  <PosterCard
                    key={`rec-${item.type}-${item.id}`}
                    item={{
                      id: item.id,
                      title: item.title,
                      posterPath: item.posterPath,
                      year: item.year,
                      type: item.type,
                      rating: item.rating
                    }}
                    onClick={() => handleCardClick(item)}
                    index={idx}
                  />
                ))}
              </div>
            </section>

            {/* Section C: TRENDING NOW */}
            <section aria-label="Trending Now">
              <div style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <TrendingUp size={16} />
                  </div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-display)',
                      color: 'var(--text-1)'
                    }}
                  >
                    Trending Now
                  </h2>
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  {filteredTrending.length} {filteredTrending.length === 1 ? 'title' : 'titles'}
                </span>
              </div>

              <div className="online-stream-grid">
                {filteredTrending.map((item, idx) => (
                  <PosterCard
                    key={`trend-${item.type}-${item.id}`}
                    item={{
                      id: item.id,
                      title: item.title,
                      posterPath: item.posterPath,
                      year: item.year,
                      type: item.type,
                      rating: item.rating
                    }}
                    onClick={() => handleCardClick(item)}
                    index={idx}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
