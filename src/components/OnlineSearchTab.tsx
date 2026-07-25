import React, { useState, useEffect, useRef } from 'react';
import { CustomSelect } from './CustomSelect';

const categoryOptions = [
  { value: 'all', label: '🎬 Movies/TV' },
  { value: 'anime', label: '🌸 Anime' }
];
import { Search, Play, History, Clock, X } from 'lucide-react';
import type { VideoItem } from '../types/media';

interface OnlineSearchTabProps {
  onSelectMedia: (video: VideoItem) => void;
  tmdbApiKey?: string;
  traktAccessToken?: string;
}

interface SearchResult {
  id: string | number;
  title: string;
  posterPath: string;
  year: string;
  type: 'movie' | 'tv' | 'anime';
  overview?: string;
  rating?: number;
}

const DEFAULT_TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";

export const OnlineSearchTab: React.FC<OnlineSearchTabProps> = ({ onSelectMedia, tmdbApiKey, traktAccessToken }) => {
  const [query, setQuery] = useState(() => {
    return localStorage.getItem('valor_online_search_query') || '';
  });
  const [category, setCategory] = useState<'all' | 'anime'>(() => {
    return (localStorage.getItem('valor_online_search_category') as any) || 'all';
  });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [isFocused, setIsFocused] = useState(false);
  const [watchedTmdbIds, setWatchedTmdbIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!traktAccessToken) return;

    const fetchTraktWatched = async () => {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${traktAccessToken}`,
          'trakt-api-key': 'f2926f0d87d3e789c50a3c276ab6002f5027dec31089fe75792c2836165c7289',
          'trakt-api-version': '2'
        };

        const [moviesRes, showsRes] = await Promise.all([
          fetch('https://api.trakt.tv/sync/watched/movies', { headers }),
          fetch('https://api.trakt.tv/sync/watched/shows', { headers })
        ]);

        const ids = new Set<number>();

        if (moviesRes.ok) {
          const moviesData = await moviesRes.json();
          moviesData.forEach((item: any) => {
            if (item.movie?.ids?.tmdb) {
              ids.add(Number(item.movie.ids.tmdb));
            }
          });
        }

        if (showsRes.ok) {
          const showsData = await showsRes.json();
          showsData.forEach((item: any) => {
            if (item.show?.ids?.tmdb) {
              ids.add(Number(item.show.ids.tmdb));
            }
          });
        }

        setWatchedTmdbIds(ids);
      } catch (err) {
        console.warn('Failed to fetch watched history from Trakt:', err);
      }
    };

    fetchTraktWatched();
  }, [traktAccessToken]);
  
  const [history, setHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('valor_online_search_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  const addToHistory = (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    const trimmed = searchQuery.trim();
    setHistory(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem('valor_online_search_history', JSON.stringify(updated));
      return updated;
    });
  };

  const fetchTmdbResults = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
      const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;
      
      let url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(searchQuery)}&include_adult=false`;
      let headers: HeadersInit = { 'accept': 'application/json' };
      
      if (isBearer) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        url += `&api_key=${token}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`TMDB Search failed with status: ${res.status}`);
      const data = await res.json();
      
      const mapped: SearchResult[] = (data.results || [])
        .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
        .map((r: any) => {
          const isMovie = r.media_type === 'movie';
          const title = isMovie ? r.title : r.name;
          const date = isMovie ? r.release_date : r.first_air_date;
          const year = date ? date.split('-')[0] : 'N/A';
          const posterPath = r.poster_path 
            ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500${r.poster_path}` 
            : '';
            
          return {
            id: r.id,
            title: title || 'Unknown Title',
            posterPath,
            year,
            type: isMovie ? 'movie' : ('tv' as any),
            overview: r.overview,
            rating: r.vote_average
          };
        });
      setResults(mapped);
      if (mapped.length > 0) {
        addToHistory(searchQuery);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to fetch search results from TMDB.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAniListResults = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const graphqlQuery = `
        query ($search: String) {
          Page (page: 1, perPage: 24) {
            media (search: $search, type: ANIME, sort: POPULARITY_DESC) {
              id
              title {
                english
                romaji
                native
              }
              coverImage {
                extraLarge
                large
              }
              startDate {
                year
              }
              description
              averageScore
              format
            }
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
          variables: { search: searchQuery }
        })
      });

      if (!res.ok) throw new Error(`AniList Search failed with status: ${res.status}`);
      const body = await res.json();
      const mediaList = body.data?.Page?.media || [];
      
      const mapped: SearchResult[] = mediaList.map((m: any) => {
        const title = m.title.english || m.title.romaji || m.title.native || 'Unknown Anime';
        const rawPoster = m.coverImage.extraLarge || m.coverImage.large || '';
        const posterPath = rawPoster ? `https://images.weserv.nl/?url=${encodeURIComponent(rawPoster)}` : '';
        
        return {
          id: m.id,
          title,
          posterPath,
          year: m.startDate.year ? String(m.startDate.year) : 'N/A',
          type: 'anime',
          overview: m.description ? m.description.replace(/<[^>]*>/g, '') : '',
          rating: m.averageScore ? m.averageScore / 10 : undefined
        };
      });
      setResults(mapped);
      if (mapped.length > 0) {
        addToHistory(searchQuery);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to fetch search results from AniList.');
    } finally {
      setLoading(false);
    }
  };

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debounced search trigger
  useEffect(() => {
    localStorage.setItem('valor_online_search_query', query);
    localStorage.setItem('valor_online_search_category', category);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      setImageErrors({});
      if (category === 'all') {
        fetchTmdbResults(query);
      } else {
        fetchAniListResults(query);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, category]);

  const handleCardClick = (res: SearchResult) => {
    const videoItem: VideoItem = {
      id: `${res.type}-${res.id}`,
      title: res.title,
      url: '',
      type: res.type === 'movie' ? 'online_movie' : (res.type === 'tv' ? 'online_tv' : 'online_anime'),
      isRemote: true,
      posterPath: res.posterPath,
      tmdbId: res.type !== 'anime' ? Number(res.id) : undefined,
      anilistId: res.type === 'anime' ? Number(res.id) : undefined,
      audioTracks: [],
      subtitleTracks: []
    };
    onSelectMedia(videoItem);
  };

  const handleImageError = (id: string | number) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };

  return (
    <div className="online-search-container">
      {/* Search Header Row (Dropdown on LEFT "start" next to Search Bar, NO hero title/container card) */}
      <div className="search-bar-row">
        <div className="category-select-wrapper">
          <CustomSelect
            value={category}
            onChange={(val) => {
              setCategory(val);
              setQuery('');
              setResults([]);
            }}
            options={categoryOptions}
            hideSearch={true}
            width="150px"
          />
        </div>

        <div className="search-input-wrapper" ref={searchWrapperRef}>
          <Search className="search-bar-icon" size={20} />
          <input
            type="text"
            className="search-bar-input"
            placeholder={category === 'all' ? "Search Movie or TV Series name..." : "Search Anime (e.g. Naruto, One Piece)..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
          />
          {loading && <div className="search-inline-spinner"></div>}

          {/* Autocomplete Sexier Recent Searches Dropdown inside search input */}
          {isFocused && query.trim() === '' && history.length > 0 && (
            <div className="search-history-dropdown">
              <div className="dropdown-header">
                <span className="header-title-text">
                  <History size={13} style={{ marginRight: '6px' }} />
                  Recent Searches
                </span>
                <button 
                  className="clear-all-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistory([]);
                    localStorage.removeItem('valor_online_search_history');
                  }}
                >
                  Clear All
                </button>
              </div>
              <div className="dropdown-list">
                {history.map((h, i) => (
                  <div 
                    key={i} 
                    className="dropdown-item"
                    onClick={() => {
                      setQuery(h);
                      setIsFocused(false);
                    }}
                  >
                    <div className="item-left">
                      <Clock size={13} className="item-clock-icon" />
                      <span className="item-text">{h}</span>
                    </div>
                    <button 
                      className="delete-item-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistory(prev => {
                          const updated = prev.filter((_, idx) => idx !== i);
                          localStorage.setItem('valor_online_search_history', JSON.stringify(updated));
                          return updated;
                        });
                      }}
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="search-error-alert">
          <span>{error}</span>
        </div>
      )}

      {/* Search Results Grid */}
      <div className="search-results-section">
        {!loading && results.length === 0 && query.trim().length > 0 && (
          <div className="search-no-results">
            <span>No results found for "{query}"</span>
          </div>
        )}

        {loading ? (
          <div className="search-results-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="search-result-card skeleton">
                <div className="card-poster-wrapper skeleton-shimmer" style={{ height: '280px', borderRadius: '12px' }}></div>
                <div className="card-details" style={{ marginTop: '10px' }}>
                  <div className="skeleton-line skeleton-shimmer" style={{ height: '16px', width: '80%', borderRadius: '4px', marginBottom: '8px' }}></div>
                  <div className="skeleton-line skeleton-shimmer" style={{ height: '12px', width: '40%', borderRadius: '4px' }}></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="search-results-grid">
            {results.map((res) => {
              const hasError = imageErrors[res.id] || !res.posterPath;
              const isWatchedOnTrakt = res.type !== 'anime' && watchedTmdbIds.has(Number(res.id));
              
              return (
                <div 
                  key={`${res.type}-${res.id}`} 
                  className="search-result-card"
                  onClick={() => handleCardClick(res)}
                >
                  <div className="card-poster-wrapper">
                    {!hasError ? (
                      <img 
                        src={res.posterPath} 
                        alt={res.title} 
                        className="card-poster-image" 
                        loading="lazy"
                        crossOrigin="anonymous"
                        onError={() => handleImageError(res.id)}
                      />
                    ) : (
                      <div className="card-poster-fallback">
                        <div className="fallback-backdrop"></div>
                        <span className="fallback-title-text">{res.title}</span>
                      </div>
                    )}
                    
                    <div className="card-hover-overlay">
                      <button className="play-overlay-btn">
                        <Play fill="currentColor" size={20} />
                      </button>
                    </div>
                    
                    {res.rating && (
                      <div className="card-rating-badge">
                        ⭐ {res.rating.toFixed(1)}
                      </div>
                    )}

                    {isWatchedOnTrakt && (
                      <div className="card-watched-badge" style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        background: '#8b5cf6',
                        color: 'white',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        zIndex: 10,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        ✓ Watched
                      </div>
                    )}
                  </div>
                  <div className="card-details">
                    <h3 className="card-title" title={res.title}>{res.title}</h3>
                    <div className="card-meta">
                      <span className="card-year">{res.year}</span>
                      <span className={`card-type-tag ${res.type}`}>
                        {res.type === 'movie' ? 'Movie' : (res.type === 'tv' ? 'TV' : 'Anime')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
