import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { VideoItem } from '../types/media';
import { SearchBar } from './streaming/SearchBar';
import { SegmentedControl, type SegmentOption } from './streaming/SegmentedControl';
import { PosterCard, type PosterMediaItem } from './streaming/PosterCard';
import { PosterGridSkeleton } from './streaming/Skeletons';
import { SearchX, RotateCcw, AlertTriangle } from 'lucide-react';
import './streaming/streaming.css';

interface OnlineSearchTabProps {
  onSelectMedia: (video: VideoItem) => void;
  tmdbApiKey?: string;
  traktAccessToken?: string;
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
}

import { DEFAULT_TMDB_TOKEN } from '../utils/constants';

export const OnlineSearchTab: React.FC<OnlineSearchTabProps> = ({
  onSelectMedia,
  tmdbApiKey
}) => {
  const [query, setQuery] = useState(() => {
    return localStorage.getItem('valor_online_search_query') || '';
  });
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaFilterType>(() => {
    return (localStorage.getItem('valor_online_search_type') as MediaFilterType) || 'all';
  });

  const [results, setResults] = useState<SearchResult[]>([]);
  const [trendingList, setTrendingList] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter options: All / Series / Movies
  const typeOptions: SegmentOption<MediaFilterType>[] = [
    { value: 'all', label: 'All' },
    { value: 'series', label: 'Series' },
    { value: 'movies', label: 'Movies' }
  ];

  // Helper: Fetch trending on initial load so page has rich content
  useEffect(() => {
    let isMounted = true;

    const fetchTrending = async () => {
      setLoading(true);
      try {
        const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
        const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;

        let url = 'https://api.themoviedb.org/3/trending/all/day?language=en-US';
        const headers: HeadersInit = { accept: 'application/json' };
        if (isBearer) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          url += `&api_key=${token}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Trending request failed: ${res.status}`);
        const data = await res.json();

        if (isMounted) {
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
          setTrendingList(mapped);
        }
      } catch (err: any) {
        console.warn('Could not load trending list:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTrending();
    return () => { isMounted = false; };
  }, [tmdbApiKey]);

  // Execute Search query against TMDB multi search
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

  // Trigger search on query change
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

  // Active items: search results if query exists, else trending
  const activeMediaList = query.trim() ? results : trendingList;

  // Filter items by type segmented control: All / Series / Movies
  const filteredItems = useMemo(() => {
    if (mediaTypeFilter === 'movies') {
      return activeMediaList.filter(item => item.type === 'movie');
    }
    if (mediaTypeFilter === 'series') {
      return activeMediaList.filter(item => item.type === 'tv' || (item as any).type === 'series');
    }
    return activeMediaList;
  }, [activeMediaList, mediaTypeFilter]);

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
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
          padding: 'var(--space-4) var(--space-7)',
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
            // Brief skeleton transition feedback
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
      </header>

      {/* Main Content Area */}
      <main
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          padding: 'var(--space-6) var(--space-7)',
          boxSizing: 'border-box'
        }}
      >
        {/* Section Heading */}
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
            {query.trim() ? `Search Results for "${query}"` : 'Trending Now'}
          </h1>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
            {filteredItems.length} {filteredItems.length === 1 ? 'title' : 'titles'}
          </span>
        </div>

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
              color: 'var(--text-1)',
              marginBottom: 'var(--space-5)'
            }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem' }}>{error}</span>
          </div>
        )}

        {/* Loading Skeleton on first load or search/filter change */}
        {loading ? (
          <PosterGridSkeleton count={12} />
        ) : filteredItems.length === 0 ? (
          /* Empty State: Says what went wrong and how to fix it */
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
          /* Responsive Poster Grid (minmax 168px) */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
              gap: 'var(--space-5)',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            {filteredItems.map((item, idx) => (
              <PosterCard
                key={`${item.type}-${item.id}`}
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
      </main>
    </div>
  );
};
