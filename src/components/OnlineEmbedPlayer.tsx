import React, { useState, useEffect, useRef } from 'react';
import { X, Server, Bookmark, List, Play } from 'lucide-react';
import type { VideoItem } from '../types/media';

interface OnlineEmbedPlayerProps {
  video: VideoItem;
  onClose: () => void;
  onUpdateProgress: (video: VideoItem, currentTime: number, duration: number) => void;
  onAddBookmark: (video: VideoItem, currentTime: number) => void;
  tmdbApiKey?: string;
}

const DEFAULT_TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";

export const OnlineEmbedPlayer: React.FC<OnlineEmbedPlayerProps> = ({
  video,
  onClose,
  onUpdateProgress,
  onAddBookmark,
  tmdbApiKey
}) => {
  const [server, setServer] = useState<'videasy' | 'vidking'>('videasy');
  const [currentTime, setCurrentTime] = useState(video.currentTime || 0);
  const [duration, setDuration] = useState(0);
  
  // TV / Anime Series States
  const [currentSeason, setCurrentSeason] = useState(video.season || 1);
  const [currentEpisode, setCurrentEpisode] = useState(video.episode || 1);
  const [tvMetadata, setTvMetadata] = useState<{ seasonsCount: number; episodesPerSeason: { [seasonNum: number]: number } } | null>(null);
  const [animeEpisodesCount, setAnimeEpisodesCount] = useState<number | null>(null);
  const [showEpisodeSelector, setShowEpisodeSelector] = useState(false);

  const durationRef = useRef(0);
  const currentTimeRef = useRef(video.currentTime || 0);

  // Sync refs to use in event listeners
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Fetch TV Metadata (TMDB)
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
          if (s.season_number > 0) { // Exclude specials/season 0
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
  }, [video.id, video.tmdbId, video.type, tmdbApiKey]);

  // Fetch Anime Metadata (AniList)
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
        const total = body.data?.Media?.episodes || 12;
        setAnimeEpisodesCount(total);
      } catch (err) {
        console.error('Error fetching Anime details:', err);
        setAnimeEpisodesCount(12);
      }
    };

    fetchAnimeData();
  }, [video.id, video.anilistId, video.type]);

  // Listen to postMessage player events
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
          }
          if (typeof pDur === 'number' && pDur > 0) {
            setDuration(pDur);
          }

          if (playerEvent === 'timeupdate' || playerEvent === 'pause' || playerEvent === 'ended') {
            const updatedVideo: VideoItem = {
              ...video,
              currentTime: pTime,
              season: video.type === 'online_tv' ? currentSeason : undefined,
              episode: video.type !== 'online_movie' ? currentEpisode : undefined
            };
            onUpdateProgress(updatedVideo, pTime, pDur || durationRef.current);
          }
        }
      } catch (err) {
        // Safe to ignore non-JSON or unrelated messages
      }
    };

    window.addEventListener('message', handlePlayerMessage);
    return () => {
      window.removeEventListener('message', handlePlayerMessage);
    };
  }, [video, currentSeason, currentEpisode, onUpdateProgress]);

  // Construct Player URL
  const getEmbedUrl = () => {
    const id = video.type === 'online_anime' ? video.anilistId : video.tmdbId;
    const startProgress = video.currentTime && Math.floor(video.currentTime) > 10 ? `?progress=${Math.floor(video.currentTime)}` : '';
    
    if (server === 'videasy') {
      const colorParam = startProgress ? '&color=8B5CF6' : '?color=8B5CF6';
      
      if (video.type === 'online_movie') {
        return `https://player.videasy.net/movie/${id}${startProgress}${colorParam}`;
      } else if (video.type === 'online_tv') {
        return `https://player.videasy.net/tv/${id}/${currentSeason}/${currentEpisode}${startProgress}${colorParam}&nextEpisode=true&episodeSelector=true`;
      } else { // online_anime
        return `https://player.videasy.net/anime/${id}/${currentEpisode}${startProgress}${colorParam}`;
      }
    } else { // vidking
      const colorParam = startProgress ? '&color=e50914' : '?color=e50914';
      
      if (video.type === 'online_movie') {
        return `https://www.vidking.net/embed/movie/${id}${startProgress}${colorParam}&autoPlay=true`;
      } else { // online_tv
        return `https://www.vidking.net/embed/tv/${id}/${currentSeason}/${currentEpisode}${startProgress}${colorParam}&nextEpisode=true&episodeSelector=true`;
      }
    }
  };

  const handleEpisodeChange = (epNum: number) => {
    setCurrentEpisode(epNum);
    setCurrentTime(0);
    setShowEpisodeSelector(false);
  };

  const handleSeasonChange = (sNum: number) => {
    setCurrentSeason(sNum);
    setCurrentEpisode(1);
    setCurrentTime(0);
  };

  const currentEpisodesCount = video.type === 'online_tv' 
    ? (tvMetadata?.episodesPerSeason[currentSeason] || 10) 
    : (animeEpisodesCount || 12);

  const isAnime = video.type === 'online_anime';

  return (
    <div className="online-player-overlay">
      {/* Top Header Bar Overlay - ONLY X Close Button */}
      <header className="online-player-header" style={{ background: 'transparent', justifyContent: 'flex-end', padding: '16px 20px', zIndex: 100 }}>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
          {/* Close Player X Button */}
          <button 
            className="header-close-btn" 
            onClick={onClose} 
            title="Exit Player"
            style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Iframe Player Wrapper */}
      <main className="online-player-iframe-wrapper">
        <iframe
          key={getEmbedUrl()}
          src={getEmbedUrl()}
          className="online-player-iframe"
          allowFullScreen
          frameBorder="0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          {...{ credentialless: "true" }}
        ></iframe>
      </main>

      {/* Slide-out Custom Episode Selector Panel */}
      {showEpisodeSelector && (
        <div className="episode-selector-panel glassmorphism">
          <div className="panel-header">
            <h3>Episode Selector</h3>
            <button onClick={() => setShowEpisodeSelector(false)} className="panel-close-btn">
              <X size={18} />
            </button>
          </div>

          {/* Season Selector (TV only) */}
          {video.type === 'online_tv' && tvMetadata && (
            <div className="panel-season-select-wrapper">
              <label>Season</label>
              <select 
                value={currentSeason}
                onChange={(e) => handleSeasonChange(Number(e.target.value))}
                className="panel-season-dropdown"
              >
                {Array.from({ length: tvMetadata.seasonsCount }, (_, i) => i + 1).map((sNum) => (
                  <option key={`s-${sNum}`} value={sNum}>Season {sNum}</option>
                ))}
              </select>
            </div>
          )}

          {/* Episode Grid */}
          <div className="panel-episode-grid-section">
            <label>Episodes</label>
            <div className="panel-episodes-grid">
              {Array.from({ length: currentEpisodesCount }, (_, i) => i + 1).map((epNum) => (
                <button
                  key={`ep-${epNum}`}
                  className={`episode-grid-btn ${currentEpisode === epNum ? 'active' : ''}`}
                  onClick={() => handleEpisodeChange(epNum)}
                >
                  <Play size={10} className="ep-play-icon" />
                  {epNum}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
