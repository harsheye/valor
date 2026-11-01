import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import type { VideoItem } from '../types/media';
import { Hero } from './streaming/Hero';
import { CastRail, type CastPerson } from './streaming/CastRail';
import { EpisodeList, type EpisodeData } from './streaming/EpisodeRow';
import { Rail } from './streaming/Rail';
import { PersonSheet, type PersonProfile } from './streaming/PersonSheet';
import { TitlePageSkeleton } from './streaming/Skeletons';
import type { PosterMediaItem } from './streaming/PosterCard';
import './streaming/streaming.css';

interface OnlineDetailsPageProps {
  video: VideoItem;
  onClose: () => void;
  onPlay: (video: VideoItem, season?: number, episode?: number) => void;
  onSelectMedia?: (video: VideoItem) => void;
  onSelectActor?: (actor: { id: number; name: string; profilePath?: string }) => void;
  tmdbApiKey?: string;
  videos?: VideoItem[];
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addToast?: (text: string, type?: 'success' | 'error' | 'warning', action?: any) => void;
}

import { DEFAULT_TMDB_TOKEN } from '../utils/constants';

export const OnlineDetailsPage: React.FC<OnlineDetailsPageProps> = ({
  video,
  onClose,
  onPlay,
  onSelectMedia,
  tmdbApiKey,
  videos = [],
  setVideos,
  addToast
}) => {
  const [details, setDetails] = useState<any>(null);
  const [cast, setCast] = useState<CastPerson[]>([]);
  const [seasons, setSeasons] = useState<{ seasonNumber: number; name: string }[]>([]);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [episodes, setEpisodes] = useState<EpisodeData[]>([]);
  const [recommendations, setRecommendations] = useState<PosterMediaItem[]>([]);
  
  // PersonSheet state
  const [activePerson, setActivePerson] = useState<PersonProfile | null>(null);
  const [loadingPerson, setLoadingPerson] = useState(false);
  const [isPersonSheetOpen, setIsPersonSheetOpen] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isAnime = video.type === 'online_anime';

  // 1. Fetch Main Media Details, Cast, and Recommendations (TMDB / AniList)
  useEffect(() => {
    let isMounted = true;

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);

      if (isAnime) {
        await fetchAniListDetails(isMounted);
        return;
      }

      try {
        const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
        const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;
        const mediaType = video.type === 'online_movie' ? 'movie' : 'tv';

        let headers: HeadersInit = { accept: 'application/json' };
        let authParams = '';
        if (isBearer) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          authParams = `&api_key=${token}`;
        }

        // 1. Details
        const detailsUrl = `https://api.themoviedb.org/3/${mediaType}/${video.tmdbId}?language=en-US${authParams}`;
        const detailsRes = await fetch(detailsUrl, { headers });
        if (!detailsRes.ok) throw new Error(`Details fetch failed: ${detailsRes.status}`);
        const detailsData = await detailsRes.json();

        // 2. Cast
        const creditsUrl = `https://api.themoviedb.org/3/${mediaType}/${video.tmdbId}/credits?language=en-US${authParams}`;
        const creditsRes = await fetch(creditsUrl, { headers });
        let castList: CastPerson[] = [];
        if (creditsRes.ok) {
          const creditsData = await creditsRes.json();
          castList = (creditsData.cast || []).slice(0, 16).map((c: any) => ({
            id: c.id,
            name: c.name,
            role: c.character,
            profilePath: c.profile_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined
          }));
        }

        // 3. Recommendations ("More like this")
        const recsUrl = `https://api.themoviedb.org/3/${mediaType}/${video.tmdbId}/recommendations?language=en-US${authParams}`;
        const recsRes = await fetch(recsUrl, { headers });
        let recsList: PosterMediaItem[] = [];
        if (recsRes.ok) {
          const recsData = await recsRes.json();
          recsList = (recsData.results || []).slice(0, 12).map((r: any) => {
            const isMovie = r.media_type === 'movie' || (!r.media_type && mediaType === 'movie');
            return {
              id: r.id,
              title: r.title || r.name || 'Unknown',
              posterPath: r.poster_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w300${r.poster_path}` : undefined,
              year: (r.release_date || r.first_air_date || '').split('-')[0] || '2024',
              type: isMovie ? 'movie' : 'tv',
              rating: r.vote_average
            };
          });
        }

        if (isMounted) {
          setDetails(detailsData);
          setCast(castList);
          setRecommendations(recsList);

          if (video.type === 'online_tv') {
            const sList = (detailsData.seasons || [])
              .filter((s: any) => s.season_number > 0)
              .map((s: any) => ({
                seasonNumber: s.season_number,
                name: s.name || `Season ${s.season_number}`
              }));
            setSeasons(sList);
            const initialSeason = sList.length > 0 ? sList[0].seasonNumber : 1;
            setCurrentSeason(initialSeason);
          }
        }
      } catch (err: any) {
        console.error('Error fetching details:', err);
        if (isMounted) setError(err.message || 'Failed to fetch title details.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDetails();
    return () => { isMounted = false; };
  }, [video.id, video.tmdbId, video.type, tmdbApiKey, isAnime]);

  // 2. Fetch Episodes for selected season
  useEffect(() => {
    if (isAnime || video.type !== 'online_tv' || !video.tmdbId) return;

    let isMounted = true;
    const fetchEpisodes = async () => {
      setLoadingEpisodes(true);
      try {
        const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
        const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;

        let headers: HeadersInit = { accept: 'application/json' };
        let authParams = '';
        if (isBearer) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          authParams = `&api_key=${token}`;
        }

        const url = `https://api.themoviedb.org/3/tv/${video.tmdbId}/season/${currentSeason}?language=en-US${authParams}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error('Failed to fetch season episodes');
        const data = await res.json();

        if (isMounted) {
          const mapped: EpisodeData[] = (data.episodes || []).map((e: any) => {
            // Check if episode was partially watched
            const epMatch = videos.find(v => 
              v.tmdbId === video.tmdbId && v.season === currentSeason && v.episode === e.episode_number
            );
            const progress = epMatch?.currentTime && epMatch.currentTime > 0 ? 0.35 : 0;

            return {
              episodeNumber: e.episode_number,
              name: e.name || `Episode ${e.episode_number}`,
              overview: e.overview || 'No synopsis available.',
              stillPath: e.still_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w300${e.still_path}` : undefined,
              progress
            };
          });
          setEpisodes(mapped);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoadingEpisodes(false);
      }
    };

    fetchEpisodes();
    return () => { isMounted = false; };
  }, [currentSeason, video.tmdbId, video.type, tmdbApiKey, isAnime, videos]);

  // Anime fallback fetcher
  const fetchAniListDetails = async (isMounted: boolean) => {
    try {
      const graphqlQuery = `
        query ($id: Int) {
          Media (id: $id, type: ANIME) {
            id
            title { english romaji native }
            bannerImage
            coverImage { extraLarge large }
            description
            averageScore
            seasonYear
            episodes
            characters (perPage: 12, sort: ROLE) {
              edges {
                role
                node {
                  id
                  name { full }
                  image { medium }
                }
              }
            }
          }
        }
      `;

      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: graphqlQuery, variables: { id: video.anilistId } })
      });

      if (!res.ok) throw new Error('AniList fetch failed');
      const body = await res.json();
      const media = body.data?.Media;

      if (isMounted && media) {
        setDetails({
          title: media.title.english || media.title.romaji || media.title.native,
          overview: media.description ? media.description.replace(/<[^>]*>/g, '') : '',
          backdrop_path: media.bannerImage || '',
          vote_average: media.averageScore ? media.averageScore / 10 : 8.0,
          release_date: media.seasonYear ? String(media.seasonYear) : '2024'
        });

        const cList: CastPerson[] = (media.characters?.edges || []).map((e: any) => ({
          id: e.node.id,
          name: e.node.name.full,
          role: e.role,
          profilePath: e.node.image.medium ? `https://images.weserv.nl/?url=${encodeURIComponent(e.node.image.medium)}` : undefined
        }));
        setCast(cList);

        const epCount = media.episodes || 12;
        const eps: EpisodeData[] = Array.from({ length: epCount }).map((_, i) => ({
          episodeNumber: i + 1,
          name: `Episode ${i + 1}`,
          overview: `Episode ${i + 1} of ${media.title.english || media.title.romaji}`,
          progress: 0
        }));
        setEpisodes(eps);
      }
    } catch (err: any) {
      if (isMounted) setError(err.message || 'Failed to fetch anime details');
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  // 3. Check if current title is in library & whether it is watched
  const titleText = details?.title || details?.name || video.title;
  const rawBackdrop = details?.backdrop_path || video.posterPath;
  const backdropUrl = rawBackdrop
    ? (rawBackdrop.startsWith('http') ? rawBackdrop : `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/original${rawBackdrop}`)
    : undefined;
  const rawPoster = details?.poster_path || video.posterPath;
  const posterUrl = rawPoster
    ? (rawPoster.startsWith('http') ? rawPoster : `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500${rawPoster}`)
    : undefined;

  const currentLibraryItems = useMemo(() => {
    if (!videos || !video) return [];
    return videos.filter(v => 
      (video.tmdbId && v.tmdbId === video.tmdbId) ||
      (v.id && (v.id === video.id || v.id.startsWith(`${video.type}-${video.tmdbId}`)))
    );
  }, [videos, video]);

  const isInLibrary = currentLibraryItems.length > 0;

  // Determine if item has been watched in user's history
  const isWatched = useMemo(() => {
    if (currentLibraryItems.length === 0) return false;
    return currentLibraryItems.some(v => 
      (v as any).completed === true || 
      (v.currentTime !== undefined && v.currentTime > 0)
    );
  }, [currentLibraryItems]);

  // Handle + Library Button Toggle: adds if not present (watched or unwatched), removes if present
  const handleToggleLibrary = () => {
    if (!setVideos) return;

    if (isInLibrary) {
      // Remove from library
      setVideos(prev => prev.filter(v => 
        !((video.tmdbId && v.tmdbId === video.tmdbId) ||
          (v.id && (v.id === video.id || v.id.startsWith(`${video.type}-${video.tmdbId}`))))
      ));
      if (addToast) addToast(`Removed "${titleText}" from Library`, 'warning');
    } else {
      // Add to library: if watched then watched, if not then unwatched
      const isSeries = video.type === 'online_tv';
      const runtimeMinutes = details?.runtime || 120;
      const durationSec = runtimeMinutes * 60;
      const durationStr = `${Math.floor(runtimeMinutes / 60)}:${String(runtimeMinutes % 60).padStart(2, '0')}:00`;

      let newItems: VideoItem[] = [];

      if (!isSeries) {
        // Movie item
        const movieItem: VideoItem = {
          id: `online_movie-${video.tmdbId || video.id}`,
          title: titleText,
          url: '',
          type: 'online_movie',
          isRemote: true,
          posterPath: posterUrl,
          backdropUrl: backdropUrl,
          tmdbId: video.tmdbId,
          duration: durationStr,
          completed: isWatched,
          currentTime: isWatched ? durationSec : 0,
          lastPlayedDate: isWatched ? new Date().toISOString() : undefined,
          audioTracks: [],
          subtitleTracks: []
        };
        newItems = [movieItem];
      } else {
        // Series: if episodes are loaded, create episodes; otherwise create season 1 episode 1
        if (episodes.length > 0) {
          newItems = episodes.map(ep => {
            const sStr = String(currentSeason).padStart(2, '0');
            const eStr = String(ep.episodeNumber).padStart(2, '0');
            return {
              id: `online_tv-${video.tmdbId}-s${currentSeason}e${ep.episodeNumber}`,
              title: `${titleText} S${sStr}E${eStr}`,
              url: '',
              type: 'online_tv',
              isRemote: true,
              posterPath: ep.stillPath || posterUrl,
              backdropUrl: backdropUrl,
              tmdbId: video.tmdbId,
              season: currentSeason,
              episode: ep.episodeNumber,
              duration: '00:45:00',
              completed: isWatched,
              currentTime: isWatched ? 2700 : 0,
              lastPlayedDate: isWatched ? new Date().toISOString() : undefined,
              audioTracks: [],
              subtitleTracks: []
            };
          });
        } else {
          newItems = [{
            id: `online_tv-${video.tmdbId}-s01e01`,
            title: `${titleText} S01E01`,
            url: '',
            type: 'online_tv',
            isRemote: true,
            posterPath: posterUrl,
            backdropUrl: backdropUrl,
            tmdbId: video.tmdbId,
            season: 1,
            episode: 1,
            duration: '00:45:00',
            completed: isWatched,
            currentTime: isWatched ? 2700 : 0,
            lastPlayedDate: isWatched ? new Date().toISOString() : undefined,
            audioTracks: [],
            subtitleTracks: []
          }];
        }
      }

      setVideos(prev => [...newItems, ...prev]);
      if (addToast) {
        addToast(
          `Added "${titleText}" to Library (${isWatched ? 'Watched' : 'Unwatched'})`,
          'success'
        );
      }
    }
  };

  // 4. Open PersonSheet and fetch actor details + combined credits
  const handleSelectPerson = async (person: CastPerson) => {
    setIsPersonSheetOpen(true);
    setLoadingPerson(true);

    try {
      const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
      const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;

      let headers: HeadersInit = { accept: 'application/json' };
      let authParams = '';
      if (isBearer) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        authParams = `&api_key=${token}`;
      }

      // Person profile
      const pUrl = `https://api.themoviedb.org/3/person/${person.id}?language=en-US${authParams}`;
      const pRes = await fetch(pUrl, { headers });
      const pData = pRes.ok ? await pRes.json() : null;

      // Combined credits
      const cUrl = `https://api.themoviedb.org/3/person/${person.id}/combined_credits?language=en-US${authParams}`;
      const cRes = await fetch(cUrl, { headers });
      const cData = cRes.ok ? await cRes.json() : null;

      const creditsMapped: PosterMediaItem[] = (cData?.cast || []).slice(0, 48).map((c: any) => {
        const isMovie = c.media_type === 'movie';
        return {
          id: c.id,
          title: c.title || c.name || 'Unknown',
          posterPath: c.poster_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w300${c.poster_path}` : undefined,
          year: (c.release_date || c.first_air_date || '').split('-')[0] || '2024',
          type: isMovie ? 'movie' : 'tv',
          rating: c.vote_average
        };
      });

      setActivePerson({
        id: person.id,
        name: pData?.name || person.name,
        role: pData?.known_for_department || person.role || 'Acting',
        profilePath: pData?.profile_path ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500${pData.profile_path}` : person.profilePath,
        biography: pData?.biography || '',
        birthday: pData?.birthday || null,
        placeOfBirth: pData?.place_of_birth || null,
        rating: pData?.popularity ? Math.min(10, pData.popularity / 10) : 7.8,
        credits: creditsMapped
      });
    } catch (err) {
      console.error('Error fetching person details:', err);
      setActivePerson({
        id: person.id,
        name: person.name,
        role: person.role,
        profilePath: person.profilePath,
        credits: []
      });
    } finally {
      setLoadingPerson(false);
    }
  };

  if (loading) {
    return <TitlePageSkeleton />;
  }

  const ratingVal = details?.vote_average ? Number(details.vote_average) : 8.2;
  const matchScore = Math.min(99, Math.max(75, Math.round(ratingVal * 10)));
  const isSeries = video.type === 'online_tv';
  const seasonsOrDuration = isSeries
    ? (seasons.length > 0 ? `${seasons.length} ${seasons.length === 1 ? 'Season' : 'Seasons'}` : '1 Season')
    : (details?.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : '2h 05m');

  const playButtonLabel = isSeries ? `Play S${currentSeason} · E1` : 'Play Movie';

  return (
    <div
      ref={containerRef}
      className="online-details-scroll-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        background: 'var(--bg)',
        color: 'var(--text-1)',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box',
        paddingBottom: 'var(--space-8)'
      }}
    >
      {/* Floating Close Button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Back to stream browser"
        style={{
          position: 'fixed',
          top: 'var(--space-4)',
          right: 'var(--space-5)',
          zIndex: 90,
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          background: 'rgba(20, 22, 28, 0.75)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid var(--control-border)',
          color: 'var(--text-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-3)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(20, 22, 28, 0.75)'; }}
      >
        <X size={20} />
      </button>

      {/* 1. Full-Bleed Hero with Scrim Fade & Parallax */}
      <Hero
        title={titleText}
        backdropUrl={backdropUrl}
        synopsis={details?.overview || 'Experience this acclaimed title in stunning picture and spatial audio.'}
        matchScore={matchScore}
        ageRating="16+"
        seasonsOrDuration={seasonsOrDuration}
        quality="4K"
        audioFormat="5.1"
        playButtonLabel={playButtonLabel}
        onPlay={() => {
          if (isSeries) {
            onPlay(video, currentSeason, 1);
          } else {
            onPlay(video);
          }
        }}
        onToggleLibrary={handleToggleLibrary}
        isInLibrary={isInLibrary}
        scrollContainerRef={containerRef}
      />

      {/* Main Content Flow: Cast & Crew -> Episodes -> More Like This */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)', marginTop: 'var(--space-6)' }}>
        {/* 2. Cast & Crew Circular Portraits */}
        {cast.length > 0 && (
          <CastRail
            cast={cast}
            onSelectPerson={handleSelectPerson}
            title="Cast & Crew"
          />
        )}

        {/* 3. Episodes (Season picker & 16:9 thumbnail rows) */}
        {isSeries && episodes.length > 0 && (
          <EpisodeList
            episodes={episodes}
            seasons={seasons}
            currentSeason={currentSeason}
            onSeasonChange={(s) => setCurrentSeason(s)}
            onPlayEpisode={(ep) => onPlay(video, currentSeason, ep.episodeNumber)}
            loading={loadingEpisodes}
          />
        )}

        {/* 4. More Like This Poster Rail */}
        {recommendations.length > 0 && (
          <Rail
            title="More Like This"
            items={recommendations}
            onSelectItem={(rec) => {
              if (onSelectMedia) {
                const item: VideoItem = {
                  id: `${rec.type}-${rec.id}`,
                  title: rec.title,
                  url: '',
                  type: rec.type === 'movie' ? 'online_movie' : 'online_tv',
                  isRemote: true,
                  posterPath: rec.posterPath,
                  tmdbId: Number(rec.id),
                  audioTracks: [],
                  subtitleTracks: []
                };
                onSelectMedia(item);
              }
            }}
          />
        )}
      </div>

      {/* 5. Person Sheet (Right-side sheet modal) */}
      <PersonSheet
        isOpen={isPersonSheetOpen}
        onClose={() => setIsPersonSheetOpen(false)}
        person={activePerson}
        loading={loadingPerson}
        onSelectMedia={(item) => {
          setIsPersonSheetOpen(false);
          if (onSelectMedia) {
            const vItem: VideoItem = {
              id: `${item.type}-${item.id}`,
              title: item.title,
              url: '',
              type: item.type === 'movie' ? 'online_movie' : 'online_tv',
              isRemote: true,
              posterPath: item.posterPath,
              tmdbId: Number(item.id),
              audioTracks: [],
              subtitleTracks: []
            };
            onSelectMedia(vItem);
          }
        }}
      />
    </div>
  );
};
