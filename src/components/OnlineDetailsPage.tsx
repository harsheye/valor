import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Star, Calendar, Clock, Film, ChevronLeft, ChevronRight, User, LayoutGrid, List, AlignLeft, ListFilter } from 'lucide-react';
import type { VideoItem } from '../types/media';
import { ActorDetailsPage } from './ActorDetailsPage';
import { CustomSelect } from './CustomSelect';
import { MediaPageSkeleton, EpisodeGridSkeleton, CarouselSkeleton } from './SkeletonLoader';

interface OnlineDetailsPageProps {
  video: VideoItem;
  onClose: () => void;
  onPlay: (video: VideoItem, season?: number, episode?: number) => void;
  onSelectMedia?: (video: VideoItem) => void;
  onSelectActor?: (actor: { id: number; name: string; profilePath?: string }) => void;
  tmdbApiKey?: string;
}

interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string;
}

interface EpisodeItem {
  episodeNumber: number;
  name: string;
  overview: string;
  stillPath: string;
}

const DEFAULT_TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";

export const OnlineDetailsPage: React.FC<OnlineDetailsPageProps> = ({
  video,
  onClose,
  onPlay,
  onSelectMedia,
  onSelectActor,
  tmdbApiKey
}) => {
  const [details, setDetails] = useState<any>(null);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [selectedActor, setSelectedActor] = useState<{ id: number; name: string; profilePath?: string } | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [episodeViewMode, setEpisodeViewMode] = useState<'list' | 'grid' | 'detailed' | 'compact'>('grid');
  
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const castScrollRef = useRef<HTMLDivElement>(null);

  const isAnime = video.type === 'online_anime';

  // Fetch Movie / TV Details & Cast (TMDB)
  useEffect(() => {
    if (isAnime) {
      fetchAniListDetails();
      return;
    }

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
        const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;
        const mediaType = video.type === 'online_movie' ? 'movie' : 'tv';
        
        // 1. Fetch Main Details
        let detailsUrl = `https://api.themoviedb.org/3/${mediaType}/${video.tmdbId}?language=en-US`;
        let headers: HeadersInit = { 'accept': 'application/json' };
        if (isBearer) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          detailsUrl += `&api_key=${token}`;
        }

        const detailsRes = await fetch(detailsUrl, { headers });
        if (!detailsRes.ok) throw new Error('Failed to fetch media details');
        const detailsData = await detailsRes.json();
        setDetails(detailsData);

        if (video.type === 'online_tv') {
          setSeasons(detailsData.seasons || []);
          const activeSeason = detailsData.seasons && detailsData.seasons.length > 0 
            ? detailsData.seasons[0].season_number === 0 && detailsData.seasons.length > 1 
              ? detailsData.seasons[1].season_number 
              : detailsData.seasons[0].season_number
            : 1;
          setCurrentSeason(activeSeason);
        }

        // 2. Fetch Credits (Cast)
        let creditsUrl = `https://api.themoviedb.org/3/${mediaType}/${video.tmdbId}/credits?language=en-US`;
        if (!isBearer) creditsUrl += `&api_key=${token}`;
        
        const creditsRes = await fetch(creditsUrl, { headers });
        if (creditsRes.ok) {
          const creditsData = await creditsRes.json();
          const castList: CastMember[] = (creditsData.cast || [])
            .slice(0, 15)
            .map((c: any) => ({
              id: c.id,
              name: c.name,
              character: c.character,
              profilePath: c.profile_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w185${c.profile_path}` : ''
            }));
          setCast(castList);
        }

        // 3. Fetch Recommendations
        let recsUrl = `https://api.themoviedb.org/3/${mediaType}/${video.tmdbId}/recommendations?language=en-US`;
        if (!isBearer) recsUrl += `&api_key=${token}`;
        
        const recsRes = await fetch(recsUrl, { headers });
        if (recsRes.ok) {
          const recsData = await recsRes.json();
          const items = (recsData.results || []).slice(0, 12).map((r: any) => ({
            id: r.id,
            title: r.title || r.name,
            posterPath: r.poster_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w300${r.poster_path}` : '',
            type: mediaType,
            year: r.release_date || r.first_air_date ? (r.release_date || r.first_air_date).split('-')[0] : ''
          }));
          setRecommendations(items);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to fetch details');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [video.id, video.tmdbId, video.type, tmdbApiKey]);

  // Fetch TV Episodes when currentSeason changes
  useEffect(() => {
    if (isAnime || video.type !== 'online_tv' || !video.tmdbId) return;

    const fetchEpisodes = async () => {
      setLoadingEpisodes(true);
      try {
        const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
        const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;
        
        let url = `https://api.themoviedb.org/3/tv/${video.tmdbId}/season/${currentSeason}?language=en-US`;
        let headers: HeadersInit = { 'accept': 'application/json' };
        if (isBearer) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          url += `&api_key=${token}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error('Failed to fetch season episodes');
        const data = await res.json();
        
        const mappedEpisodes: EpisodeItem[] = (data.episodes || []).map((e: any) => ({
          episodeNumber: e.episode_number,
          name: e.name || `Episode ${e.episode_number}`,
          overview: e.overview || 'No description available.',
          stillPath: e.still_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w300${e.still_path}` : ''
        }));
        
        setEpisodes(mappedEpisodes);
      } catch (err) {
        console.error('Error fetching season episodes:', err);
      } finally {
        setLoadingEpisodes(false);
      }
    };

    fetchEpisodes();
  }, [currentSeason, video.tmdbId, video.type, tmdbApiKey]);

  // Fetch Anime details from AniList
  const fetchAniListDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const graphqlQuery = `
        query ($id: Int) {
          Media (id: $id, type: ANIME) {
            id
            title {
              english
              romaji
              native
            }
            bannerImage
            coverImage {
              extraLarge
              large
            }
            description
            averageScore
            seasonYear
            genres
            episodes
            characters (sort: [ROLE, REPUTATION]) {
              edges {
                node {
                  id
                  name {
                    full
                  }
                  image {
                    large
                  }
                }
                role
              }
            }
            recommendations (limit: 12) {
              edges {
                node {
                  mediaRecommendation {
                    id
                    title {
                      english
                      romaji
                    }
                    coverImage {
                      large
                    }
                    startDate {
                      year
                    }
                    type
                  }
                }
              }
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
          variables: { id: video.anilistId }
        })
      });

      if (!res.ok) throw new Error('Failed to fetch Anime details');
      const body = await res.json();
      const media = body.data?.Media;
      
      if (!media) throw new Error('Anime not found');

      setDetails({
        title: media.title.english || media.title.romaji || media.title.native,
        overview: media.description ? media.description.replace(/<[^>]*>/g, '') : '',
        backdrop_path: media.bannerImage || '',
        poster_path: media.coverImage.extraLarge || media.coverImage.large || '',
        vote_average: media.averageScore ? media.averageScore / 10 : null,
        release_date: media.seasonYear ? String(media.seasonYear) : '',
        genres: (media.genres || []).map((g: string) => ({ name: g })),
        episodes_count: media.episodes || 12
      });

      // Map Cast members
      const castList: CastMember[] = (media.characters?.edges || [])
        .slice(0, 15)
        .map((edge: any) => ({
          id: edge.node.id,
          name: edge.node.name.full,
          character: edge.role || 'Character',
          profilePath: edge.node.image?.large || ''
        }));
      setCast(castList);

      // Map Recommendations
      const recsList = (media.recommendations?.edges || [])
        .map((edge: any) => {
          const rec = edge.node?.mediaRecommendation;
          if (!rec) return null;
          return {
            id: rec.id,
            title: rec.title.english || rec.title.romaji || 'Unknown Anime',
            posterPath: rec.coverImage.large ? `https://images.weserv.nl/?url=${encodeURIComponent(rec.coverImage.large)}` : '',
            type: 'anime',
            year: rec.startDate.year ? String(rec.startDate.year) : ''
          };
        })
        .filter(Boolean);
      setRecommendations(recsList);

      // Generate episodes grid for Anime
      const totalEp = media.episodes || 12;
      const animeEps: EpisodeItem[] = Array.from({ length: totalEp }, (_, i) => ({
        episodeNumber: i + 1,
        name: `Episode ${i + 1}`,
        overview: `Watch Episode ${i + 1} of ${media.title.english || media.title.romaji}`,
        stillPath: ''
      }));
      setEpisodes(animeEps);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to fetch AniList details');
    } finally {
      setLoading(false);
    }
  };

  const handleScrollCast = (dir: 'left' | 'right') => {
    if (!castScrollRef.current) return;
    const scrollAmount = 300;
    castScrollRef.current.scrollBy({
      left: dir === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  if (loading) {
    return <MediaPageSkeleton />;
  }

  if (error || !details) {
    return (
      <div className="details-page-error">
        <h2>Failed to load details</h2>
        <p>{error || 'Please check your connection and TMDB settings.'}</p>
        <button onClick={onClose} className="btn-back">Go Back</button>
      </div>
    );
  }

  const isMovie = video.type === 'online_movie';
  const backdropUrl = isAnime 
    ? details.backdrop_path 
    : (details.backdrop_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/original${details.backdrop_path}` : '');
  const posterUrl = isAnime 
    ? details.poster_path 
    : (details.poster_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500${details.poster_path}` : '');
  const genresText = (details.genres || []).map((g: any) => g.name).join(', ');
  const releaseYear = details.release_date ? details.release_date.split('-')[0] : '';
  const voteAverage = details.vote_average ? details.vote_average.toFixed(1) : 'N/A';

  return (
    <div className="media-details-page-container animate-fade-in">
      {/* Blurred Backdrop Cover */}
      {backdropUrl && (
        <div 
          className="media-details-backdrop"
          style={{ backgroundImage: `url(${backdropUrl})` }}
        />
      )}
      <div className="media-details-backdrop-overlay" />

      <button 
        className="details-close-btn" 
        onClick={onClose} 
        title="Back to search"
        style={{ 
          position: 'absolute', 
          top: '1.5rem', 
          right: '1.5rem', 
          zIndex: 100 
        }}
      >
        <X size={24} />
      </button>

      <div className="media-details-content-wrapper">
        {/* Main Banner / Meta section */}
        <div className="media-details-hero-section">
          {/* Poster Box */}
          <div className="media-details-poster-wrapper">
            {posterUrl ? (
              <img src={posterUrl} alt={details.title || details.name} className="media-details-poster" />
            ) : (
              <div className="media-details-poster-fallback">
                <Film size={48} />
                <span>{details.title || details.name}</span>
              </div>
            )}
          </div>

          {/* Metadata Block */}
          <div className="media-details-meta-block">
            <h1 className="media-details-title">{details.title || details.name}</h1>
            
            <div className="media-details-badges">
              {releaseYear && (
                <span className="meta-badge">
                  <Calendar size={13} style={{ marginRight: '4px' }} />
                  {releaseYear}
                </span>
              )}
              {voteAverage !== 'N/A' && (
                <span className="meta-badge rating">
                  <Star size={13} fill="#fbbf24" color="#fbbf24" style={{ marginRight: '4px' }} />
                  {voteAverage}
                </span>
              )}
              {details.runtime && (
                <span className="meta-badge">
                  <Clock size={13} style={{ marginRight: '4px' }} />
                  {details.runtime} min
                </span>
              )}
              <span className="meta-badge type-label">
                {isMovie ? 'Movie' : (video.type === 'online_tv' ? 'TV Show' : 'Anime')}
              </span>
            </div>

            {genresText && (
              <div className="media-details-genres">
                <strong>Genres:</strong> {genresText}
              </div>
            )}

            <p className="media-details-overview">{details.overview || 'No description available for this catalog entry.'}</p>

            {/* Facts bar */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '24px',
              margin: '1.5rem 0',
              padding: '12px 16px',
              background: 'var(--surface, rgba(255, 255, 255, 0.02))',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))',
              borderRadius: '8px'
            }}>
              {details.status && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, rgba(255,255,255,0.4))', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Status</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary, white)', fontWeight: 600 }}>{details.status}</span>
                </div>
              )}
              {details.original_language && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, rgba(255,255,255,0.4))', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Language</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary, white)', fontWeight: 600 }}>{details.original_language.toUpperCase()}</span>
                </div>
              )}
              {isMovie && details.budget > 0 && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, rgba(255,255,255,0.4))', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Budget</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary, white)', fontWeight: 600 }}>${(details.budget / 1000000).toFixed(1)}M</span>
                </div>
              )}
              {isMovie && details.revenue > 0 && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, rgba(255,255,255,0.4))', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Revenue</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary, white)', fontWeight: 600 }}>${(details.revenue / 1000000).toFixed(1)}M</span>
                </div>
              )}
              {!isMovie && details.number_of_seasons && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, rgba(255,255,255,0.4))', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Seasons</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary, white)', fontWeight: 600 }}>{details.number_of_seasons}</span>
                </div>
              )}
              {!isMovie && details.number_of_episodes && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted, rgba(255,255,255,0.4))', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Total Episodes</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary, white)', fontWeight: 600 }}>{details.number_of_episodes}</span>
                </div>
              )}
            </div>

            {/* Play Button for Movie */}
            {isMovie && (
              <button 
                className="media-details-play-btn"
                onClick={() => onPlay(video)}
              >
                <Play size={20} fill="currentColor" />
                <span>Play Movie</span>
              </button>
            )}
          </div>
        </div>

        {/* Cast Section */}
        {cast.length > 0 && (
          <div className="media-details-section">
            <div className="section-header-row">
              <h2>Cast & Characters</h2>
              <div className="scroll-arrow-controls">
                <button className="arrow-scroll-btn" onClick={() => handleScrollCast('left')}>
                  <ChevronLeft size={16} />
                </button>
                <button className="arrow-scroll-btn" onClick={() => handleScrollCast('right')}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="cast-scroll-container" ref={castScrollRef}>
              {cast.map((actor) => (
                <div 
                  className="actor-card-item" 
                  key={actor.id}
                  onClick={() => {
                    if (onSelectActor) {
                      onSelectActor({ id: actor.id, name: actor.name, profilePath: actor.profilePath });
                    } else {
                      setSelectedActor({ id: actor.id, name: actor.name, profilePath: actor.profilePath });
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="actor-profile-image-wrapper">
                    {actor.profilePath ? (
                      <img src={actor.profilePath} alt={actor.name} className="actor-profile-image" />
                    ) : (
                      <div className="actor-profile-fallback">
                        <User size={24} />
                      </div>
                    )}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
                      padding: '8px 10px',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      zIndex: 2
                    }}>
                      {actor.character}
                    </div>
                  </div>
                  <div className="actor-card-details" style={{ padding: '0 4px', textAlign: 'center' }}>
                    <span className="actor-real-name" style={{ color: 'var(--text-muted, rgba(255,255,255,0.7))', fontSize: '0.82rem', fontWeight: 600 }}>{actor.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Episodes Section for TV Shows and Anime */}
        {!isMovie && (
          <div className="media-details-section" style={{ marginTop: '2rem' }}>
            <div className="section-header-row tv-selector-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Episodes</h2>
                
                {video.type === 'online_tv' && seasons.length > 0 && (
                  <div className="season-selector-dropdown-wrapper">
                    <CustomSelect
                      value={currentSeason}
                      onChange={(val) => setCurrentSeason(Number(val))}
                      options={seasons
                        .filter((s: any) => s.season_number > 0)
                        .map((s: any) => ({
                          value: s.season_number,
                          label: `Season ${s.season_number}`
                        }))}
                      hideSearch={true}
                      width="130px"
                    />
                  </div>
                )}
              </div>

              {/* View Mode Toggle Controls (Icon-only buttons in 1 row) */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface, rgba(255, 255, 255, 0.05))', padding: '3px', borderRadius: '0.65rem', border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))' }}>
                <button
                  title="Tiles View"
                  onClick={() => setEpisodeViewMode('grid')}
                  style={{
                    background: episodeViewMode === 'grid' ? 'var(--accent-glow, rgba(139, 92, 246, 0.3))' : 'transparent',
                    border: 'none',
                    color: episodeViewMode === 'grid' ? 'var(--accent-color, #a78bfa)' : 'var(--text-muted, rgba(255,255,255,0.5))',
                    padding: '6px 10px',
                    borderRadius: '0.45rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  title="List View"
                  onClick={() => setEpisodeViewMode('list')}
                  style={{
                    background: episodeViewMode === 'list' ? 'var(--accent-glow, rgba(139, 92, 246, 0.3))' : 'transparent',
                    border: 'none',
                    color: episodeViewMode === 'list' ? 'var(--accent-color, #a78bfa)' : 'var(--text-muted, rgba(255,255,255,0.5))',
                    padding: '6px 10px',
                    borderRadius: '0.45rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <List size={16} />
                </button>
                <button
                  title="Compact View"
                  onClick={() => setEpisodeViewMode('compact')}
                  style={{
                    background: episodeViewMode === 'compact' ? 'var(--accent-glow, rgba(139, 92, 246, 0.3))' : 'transparent',
                    border: 'none',
                    color: episodeViewMode === 'compact' ? 'var(--accent-color, #a78bfa)' : 'var(--text-muted, rgba(255,255,255,0.5))',
                    padding: '6px 10px',
                    borderRadius: '0.45rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <AlignLeft size={16} />
                </button>
              </div>
            </div>

            {loadingEpisodes ? (
              <EpisodeGridSkeleton count={8} />
            ) : (
              <div>
                {/* View Mode 1: Grid Tiles View */}
                {episodeViewMode === 'grid' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                    {episodes.map((ep) => (
                      <div
                        key={ep.episodeNumber}
                        onClick={() => onPlay(video, currentSeason, ep.episodeNumber)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '1rem',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'all 0.25s ease',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative', background: '#121218' }}>
                          {(ep.stillPath || posterUrl) ? (
                            <img src={ep.stillPath || posterUrl} alt={ep.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.4)' }}>
                              <Play size={28} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)', display: 'flex', alignItems: 'flex-end', padding: '0.75rem' }}>
                            <span style={{ background: '#8b5cf6', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                              EP {ep.episodeNumber}
                            </span>
                          </div>
                        </div>
                        <div style={{ padding: '0.85rem 1rem' }}>
                          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ep.name}
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted, rgba(255,255,255,0.5))', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {ep.overview || 'No overview available.'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* View Mode 2: Compact List View */}
                {episodeViewMode === 'list' && (
                  <div className="details-episodes-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {episodes.map((ep) => (
                      <div 
                        className="details-episode-list-item" 
                        key={ep.episodeNumber}
                        onClick={() => onPlay(video, currentSeason, ep.episodeNumber)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '10px 14px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div 
                          style={{
                            width: '70px',
                            height: '40px',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            background: '#121212',
                            flexShrink: 0,
                            position: 'relative'
                          }}
                        >
                          {(ep.stillPath || posterUrl) ? (
                            <img 
                              src={ep.stillPath || posterUrl} 
                              alt={ep.name} 
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted, rgba(255,255,255,0.4))' }}>
                              <Play size={14} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', bottom: '2px', right: '4px', background: 'rgba(0,0,0,0.7)', padding: '1px 3px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, color: 'white' }}>
                            EP {ep.episodeNumber}
                          </div>
                        </div>
                        <div style={{ flexGrow: 1, minWidth: 0 }}>
                          <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary, white)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ep.name}
                          </h4>
                        </div>
                        <Play size={14} color="#8b5cf6" style={{ flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* View Mode 3: Compact / Detailed View */}
                {(episodeViewMode === 'compact' || episodeViewMode === 'detailed') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {episodes.map((ep) => (
                      <div
                        key={ep.episodeNumber}
                        onClick={() => onPlay(video, currentSeason, ep.episodeNumber)}
                        style={{
                          display: 'flex',
                          gap: '1.25rem',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '1rem',
                          padding: '1rem',
                          cursor: 'pointer',
                          transition: 'all 0.25s ease'
                        }}
                      >
                        <div style={{ width: '180px', height: '105px', borderRadius: '0.75rem', overflow: 'hidden', flexShrink: 0, position: 'relative', background: '#121218' }}>
                          {(ep.stillPath || posterUrl) ? (
                            <img src={ep.stillPath || posterUrl} alt={ep.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted, rgba(255,255,255,0.4))' }}>
                              <Play size={24} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', bottom: '6px', left: '6px', background: '#8b5cf6', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                            EP {ep.episodeNumber}
                          </div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                            {ep.name}
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted, rgba(255,255,255,0.6))', lineHeight: 1.5 }}>
                            {ep.overview || 'No overview available for this episode.'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recommendations / More Like This */}
        {recommendations.length > 0 && (
          <div className="media-details-section" style={{ marginTop: '2.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '2rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 1.25rem 0' }}>More Like This</h2>
            {loadingRecommendations ? (
              <CarouselSkeleton count={7} />
            ) : (
              <div 
                style={{
                  display: 'flex',
                  gap: '16px',
                  overflowX: 'auto',
                  paddingBottom: '1rem',
                }}
                className="search-results-section" // reuse the thin scrollbar styling
              >
                {recommendations.map((rec) => (
                  <div 
                    key={rec.id} 
                    onClick={() => {
                      if (onSelectMedia) {
                        onSelectMedia({
                          id: `${rec.type === 'movie' ? 'movie' : (rec.type === 'tv' ? 'tv' : 'anime')}-${rec.id}`,
                          title: rec.title,
                          url: '',
                          type: rec.type === 'movie' ? 'online_movie' : (rec.type === 'tv' ? 'online_tv' : 'online_anime'),
                          isRemote: true,
                          posterPath: rec.posterPath,
                          tmdbId: rec.type !== 'anime' ? Number(rec.id) : undefined,
                          anilistId: rec.type === 'anime' ? Number(rec.id) : undefined,
                          audioTracks: [],
                          subtitleTracks: []
                        });
                      }
                    }}
                    className="media-rec-card"
                    style={{
                      transition: 'transform 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                  >
                    <div className="media-rec-card-image-wrapper">
                      {rec.posterPath ? (
                        <img src={rec.posterPath} alt={rec.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted, rgba(255,255,255,0.4))', fontSize: '0.8rem', padding: '10px', textAlign: 'center' }}>
                          {rec.title}
                        </div>
                      )}
                    </div>
                    <h4 style={{ margin: '8px 0 2px 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.title}>
                      {rec.title}
                    </h4>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, rgba(255,255,255,0.4))' }}>
                      {rec.year}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!onSelectActor && selectedActor && (
        <ActorDetailsPage
          actorId={selectedActor.id}
          actorName={selectedActor.name}
          onClose={() => setSelectedActor(null)}
          onSelectMedia={(clickedMedia) => {
            setSelectedActor(null);
            if (onSelectMedia) {
              onSelectMedia(clickedMedia);
            }
          }}
          tmdbApiKey={tmdbApiKey}
          profilePath={selectedActor.profilePath}
        />
      )}
    </div>
  );
};
