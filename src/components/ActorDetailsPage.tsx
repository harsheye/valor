import React, { useState, useEffect } from 'react';
import type { VideoItem } from '../types/media';
import { PersonSheet, type PersonProfile } from './streaming/PersonSheet';
import type { PosterMediaItem } from './streaming/PosterCard';
import './streaming/streaming.css';

interface ActorDetailsPageProps {
  actorId: number;
  actorName: string;
  onClose: () => void;
  onSelectMedia: (video: VideoItem) => void;
  tmdbApiKey?: string;
  profilePath?: string;
}

const DEFAULT_TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";

export const ActorDetailsPage: React.FC<ActorDetailsPageProps> = ({
  actorId,
  actorName,
  onClose,
  onSelectMedia,
  tmdbApiKey,
  profilePath
}) => {
  const [person, setPerson] = useState<PersonProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchActorData = async () => {
      setLoading(true);

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

        const detailsUrl = `https://api.themoviedb.org/3/person/${actorId}?language=en-US${authParams}`;
        const creditsUrl = `https://api.themoviedb.org/3/person/${actorId}/combined_credits?language=en-US${authParams}`;

        const [detailsRes, creditsRes] = await Promise.all([
          fetch(detailsUrl, { headers }),
          fetch(creditsUrl, { headers })
        ]);

        const detailsData = detailsRes.ok ? await detailsRes.json() : null;
        const creditsData = creditsRes.ok ? await creditsRes.json() : null;

        const creditsMapped: PosterMediaItem[] = (creditsData?.cast || []).slice(0, 36).map((c: any) => {
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

        if (isMounted) {
          setPerson({
            id: actorId,
            name: detailsData?.name || actorName,
            role: detailsData?.known_for_department || 'Acting',
            profilePath: detailsData?.profile_path
              ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w500${detailsData.profile_path}`
              : profilePath,
            biography: detailsData?.biography || '',
            birthday: detailsData?.birthday || null,
            placeOfBirth: detailsData?.place_of_birth || null,
            rating: detailsData?.popularity ? Math.min(10, detailsData.popularity / 10) : 7.8,
            credits: creditsMapped
          });
        }
      } catch (err) {
        console.error('Failed to fetch actor data:', err);
        if (isMounted) {
          setPerson({
            id: actorId,
            name: actorName,
            profilePath,
            credits: []
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchActorData();
    return () => { isMounted = false; };
  }, [actorId, actorName, tmdbApiKey, profilePath]);

  return (
    <PersonSheet
      isOpen={true}
      onClose={onClose}
      person={person}
      loading={loading}
      onSelectMedia={(item) => {
        onClose();
        const videoItem: VideoItem = {
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
        onSelectMedia(videoItem);
      }}
    />
  );
};
