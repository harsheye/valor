import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Star, Calendar, Clock, Film, ChevronLeft, ChevronRight, User, LayoutGrid, List, AlignLeft, ListFilter, Info } from 'lucide-react';
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
  const [episodeViewMode, setEpisodeViewMode] = useState<'list' | 'grid'>('list');
  
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

  const matchScore = details.vote_average ? Math.min(99, Math.max(82, Math.round(details.vote_average * 10))) : 96;
  const formattedRuntime = details.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : null;

  return (
    <div className="netflix-page-container animate-fade-in">
      {/* Sticky Top Navigation Bar (Real Page Navigation) */}
      <div className="netflix-page-top-bar">
        <div className="netflix-top-bar-left">
          <button onClick={onClose} className="netflix-back-nav-btn" title="Back to Browse">
            <ChevronLeft size={18} />
            <span>Back</span>
          </button>
          <div className="netflix-breadcrumbs">
            <span className="netflix-breadcrumb-link" onClick={onClose}>Online Stream</span>
            <span className="netflix-breadcrumb-sep">/</span>
            <span className="netflix-breadcrumb-current">{details.title || details.name}</span>
          </div>
        </div>

        <div className="netflix-top-bar-right">
          <span className="netflix-badge-box netflix-pill">
            {isMovie ? 'Movie' : (video.type === 'online_tv' ? 'TV Series' : 'Anime')}
          </span>
        </div>
      </div>

      {/* Netflix Cinematic Billboard Hero Banner */}
      <div className="netflix-hero-container">
        {backdropUrl && (
          <div 
            className="netflix-hero-backdrop"
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
        )}
        <div className="netflix-hero-vignette-vertical" />
        <div className="netflix-hero-vignette-horizontal" />

        <div className="netflix-hero-content">
          <h1 className="netflix-hero-title">{details.title || details.name}</h1>

          <div className="netflix-meta-row">
            <span className="netflix-match-score">{matchScore}% Match</span>
            {releaseYear && <span className="netflix-meta-item">{releaseYear}</span>}
            <span className="netflix-badge-box">16+</span>
            {formattedRuntime && <span className="netflix-meta-item">{formattedRuntime}</span>}
            {!isMovie && (
              <span className="netflix-meta-item">
                {seasons.length > 0 ? `${seasons.filter((s: any) => s.season_number > 0).length} Seasons` : '1 Season'}
              </span>
            )}
            <span className="netflix-badge-box">Ultra HD 4K</span>
            <span className="netflix-badge-box">5.1 Audio</span>
          </div>

          <p className="netflix-hero-overview">
            {details.overview || 'No description available for this catalog entry.'}
          </p>

          <div className="netflix-hero-actions">
            <button 
              className="netflix-btn-play"
              onClick={() => {
                if (isMovie) {
                  onPlay(video);
                } else {
                  const firstEp = episodes[0]?.episodeNumber || 1;
                  onPlay(video, currentSeason, firstEp);
                }
              }}
            >
              <Play size={20} fill="currentColor" />
              <span>{isMovie ? 'Play Movie' : `Play S${currentSeason}:E1`}</span>
            </button>
          </div>

          <div className="netflix-hero-details-row">
            {genresText && (
              <div>
                <strong>Genres: </strong>
                <span>{genresText}</span>
              </div>
            )}
            {cast.length > 0 && (
              <div>
                <strong>Starring: </strong>
                {cast.slice(0, 4).map((c, idx) => (
                  <span key={c.id}>
                    <span 
                      style={{ cursor: 'pointer', color: '#fff', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                      onClick={() => {
                        if (onSelectActor) onSelectActor(c);
                        else setSelectedActor(c);
                      }}
                    >
                      {c.name}
                    </span>
                    {idx < Math.min(cast.length, 4) - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
            {details.original_language && (
              <div>
                <strong>Original Audio: </strong>
                <span>{details.original_language.toUpperCase()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="netflix-page-body">

        {/* Cast Section */}
        {cast.length > 0 && (
          <div className="netflix-section">
            <div className="netflix-section-header">
              <h2 className="netflix-section-title">Cast & Crew</h2>
              <div className="scroll-arrow-controls">
                <button className="arrow-scroll-btn" onClick={() => handleScrollCast('left')} title="Scroll Left">
                  <ChevronLeft size={18} />
                </button>
                <button className="arrow-scroll-btn" onClick={() => handleScrollCast('right')} title="Scroll Right">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="netflix-cast-slider" ref={castScrollRef}>
              {cast.map((actor) => (
                <div 
                  className="netflix-cast-card" 
                  key={actor.id}
                  onClick={() => {
                    if (onSelectActor) {
                      onSelectActor({ id: actor.id, name: actor.name, profilePath: actor.profilePath });
                    } else {
                      setSelectedActor({ id: actor.id, name: actor.name, profilePath: actor.profilePath });
                    }
                  }}
                  title={`View ${actor.name}`}
                >
                  <div className="netflix-cast-photo-wrapper">
                    {actor.profilePath ? (
                      <img src={actor.profilePath} alt={actor.name} className="netflix-cast-photo" loading="lazy" />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)' }}>
                        <User size={36} />
                      </div>
                    )}
                  </div>
                  <div className="netflix-cast-name">{actor.name}</div>
                  <div className="netflix-cast-char">{actor.character}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Episodes Section for TV Shows and Anime */}
        {!isMovie && (
          <div className="netflix-section">
            <div className="netflix-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                <h2 className="netflix-section-title">Episodes</h2>
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
                      width="140px"
                    />
                  </div>
                )}
              </div>

              {/* View Mode Toggle Controls */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.08)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <button
                  title="List View"
                  onClick={() => setEpisodeViewMode('list')}
                  style={{
                    background: episodeViewMode === 'list' ? '#e50914' : 'transparent',
                    border: 'none',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s'
                  }}
                >
                  <List size={16} />
                </button>
                <button
                  title="Grid View"
                  onClick={() => setEpisodeViewMode('grid')}
                  style={{
                    background: episodeViewMode === 'grid' ? '#e50914' : 'transparent',
                    border: 'none',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s'
                  }}
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
            </div>

            {loadingEpisodes ? (
              <EpisodeGridSkeleton count={8} />
            ) : (
              <div>
                {/* Netflix List View (Default authentic Netflix episode style) */}
                {episodeViewMode === 'list' && (
                  <div className="netflix-episodes-list">
                    {episodes.map((ep) => (
                      <div
                        key={ep.episodeNumber}
                        className="netflix-episode-card"
                        onClick={() => onPlay(video, currentSeason, ep.episodeNumber)}
                      >
                        <div className="netflix-ep-num">{ep.episodeNumber}</div>
                        <div className="netflix-ep-thumb-wrapper">
                          {(ep.stillPath || posterUrl) ? (
                            <img src={ep.stillPath || posterUrl} alt={ep.name} className="netflix-ep-thumb" loading="lazy" />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.4)' }}>
                              <Play size={24} />
                            </div>
                          )}
                          <div className="netflix-ep-play-overlay">
                            <Play size={24} fill="#ffffff" />
                          </div>
                        </div>
                        <div className="netflix-ep-info">
                          <div className="netflix-ep-header-row">
                            <h4 className="netflix-ep-title">{ep.name}</h4>
                            <span className="netflix-ep-duration">EP {ep.episodeNumber}</span>
                          </div>
                          <p className="netflix-ep-overview">
                            {ep.overview || 'No overview available for this episode.'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Netflix Grid View */}
                {episodeViewMode === 'grid' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                    {episodes.map((ep) => (
                      <div
                        key={ep.episodeNumber}
                        onClick={() => onPlay(video, currentSeason, ep.episodeNumber)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.borderColor = '#e50914';
                          e.currentTarget.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.6)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative', background: '#1c1c1c' }}>
                          {(ep.stillPath || posterUrl) ? (
                            <img src={ep.stillPath || posterUrl} alt={ep.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.4)' }}>
                              <Play size={28} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)', display: 'flex', alignItems: 'flex-end', padding: '0.75rem' }}>
                            <span style={{ background: '#e50914', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '3px' }}>
                              EP {ep.episodeNumber}
                            </span>
                          </div>
                        </div>
                        <div style={{ padding: '0.9rem 1rem' }}>
                          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.92rem', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ep.name}
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.6)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
                            {ep.overview || 'No overview available.'}
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
          <div className="netflix-section">
            <h2 className="netflix-section-title">More Like This</h2>
            {loadingRecommendations ? (
              <CarouselSkeleton count={7} />
            ) : (
              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '1.25rem',
                  marginTop: '1.25rem'
                }}
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
                    className="os2-card netflix-card"
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="os2-card-poster-wrap">
                      {rec.posterPath ? (
                        <img src={rec.posterPath} alt={rec.title} className="os2-card-poster" loading="lazy" />
                      ) : (
                        <div className="os2-card-poster-placeholder">
                          <span>{rec.title}</span>
                        </div>
                      )}
                      <div className="netflix-card-badge-top">
                        <span className="netflix-n-badge">N</span>
                      </div>
                      <div className="os2-card-hover-overlay">
                        <div className="netflix-card-actions">
                          <button className="netflix-quick-play-btn" title="Play">
                            <Play size={16} fill="#000" />
                          </button>
                          <button className="netflix-quick-icon-btn" title="More Info">
                            <Info size={16} />
                          </button>
                        </div>
                        <div className="netflix-card-meta-line">
                          <span className="netflix-match-pill">96% Match</span>
                          <span className="netflix-card-tag">16+</span>
                          <span className="netflix-card-tag">HD</span>
                        </div>
                      </div>
                    </div>
                    <div className="os2-card-body">
                      <h4 className="os2-card-title">{rec.title}</h4>
                      <div className="os2-card-meta">
                        <span>{rec.year || 'Movie'}</span>
                        <span className="os2-type-pill">{rec.type ? rec.type.toUpperCase() : 'HD'}</span>
                      </div>
                    </div>
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
