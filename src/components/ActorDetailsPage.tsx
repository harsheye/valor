import React, { useState, useEffect } from 'react';
import { 
   X, Link as LinkIcon, Calendar, MapPin, Star, Film, Tv, Sparkles, Filter, Search, ArrowUpDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import type { VideoItem } from '../types/media';
import { CustomSelect } from './CustomSelect';
import { ActorPageSkeleton } from './SkeletonLoader';
import { Input } from './ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from './ui/pagination';

const cleanBiography = (rawBio: string | undefined, name: string): string => {
  if (!rawBio) return `We don't have a biography for ${name} yet.`;
  const cleaned = rawBio
    .replace(/From Wikipedia, the free encyclopedia\.?/gi, '')
    .replace(/\[\d+\]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
  return cleaned || `We don't have a biography for ${name} yet.`;
};

// Bulletproof custom SVGs for social media icons
const InstagramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const TwitterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
  </svg>
);

const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
  </svg>
);

const YoutubeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
  </svg>
);

interface ActorDetailsPageProps {
  actorId: number;
  actorName: string;
  onClose: () => void;
  onSelectMedia: (video: VideoItem) => void;
  tmdbApiKey?: string;
  profilePath?: string;
}

interface ActorProfile {
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  popularity: number;
  known_for_department: string;
}

interface ExternalIds {
  instagram_id?: string;
  twitter_id?: string;
  facebook_id?: string;
  youtube_id?: string;
  tiktok_id?: string;
}

interface CreditItem {
  id: number;
  media_type: 'movie' | 'tv';
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  character?: string;
  popularity: number;
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
  const [profile, setProfile] = useState<ActorProfile | null>(null);
  const [externalIds, setExternalIds] = useState<ExternalIds | null>(null);
  const [credits, setCredits] = useState<CreditItem[]>([]);
  const [filteredCredits, setFilteredCredits] = useState<CreditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'year_desc' | 'year_asc' | 'popularity_desc' | 'rating_desc'>('year_desc');
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, yearFilter, sortOrder]);

  useEffect(() => {
    const fetchActorData = async () => {
      setLoading(true);
      setError(null);
      
      let tmdbFailed = false;
      try {
        const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
        const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;
        let headers: HeadersInit = { 'accept': 'application/json' };
        
        let authParams = '';
        if (isBearer) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          authParams = `&api_key=${token}`;
        }

        const detailsUrl = `https://api.themoviedb.org/3/person/${actorId}?language=en-US${isBearer ? '' : authParams}`;
        const externalIdsUrl = `https://api.themoviedb.org/3/person/${actorId}/external_ids?language=en-US${isBearer ? '' : authParams}`;
        const creditsUrl = `https://api.themoviedb.org/3/person/${actorId}/combined_credits?language=en-US${isBearer ? '' : authParams}`;

        // Fetch details
        const detailsRes = await fetch(detailsUrl, { headers });
        if (!detailsRes.ok) {
          console.warn('TMDB details fetch failed with status:', detailsRes.status);
          
          if (token !== DEFAULT_TMDB_TOKEN) {
            console.log('Attempting TMDB details fetch with system fallback token...');
            const fallbackHeaders = {
              'accept': 'application/json',
              'Authorization': `Bearer ${DEFAULT_TMDB_TOKEN}`
            };
            const fallbackDetailsUrl = `https://api.themoviedb.org/3/person/${actorId}?language=en-US`;
            const retryRes = await fetch(fallbackDetailsUrl, { headers: fallbackHeaders });
            
            if (retryRes.ok) {
              const detailsData = await retryRes.json();
              setProfile(detailsData);
              
              // Fetch socials using fallback token
              const fallbackSocialUrl = `https://api.themoviedb.org/3/person/${actorId}/external_ids?language=en-US`;
              const retrySocial = await fetch(fallbackSocialUrl, { headers: fallbackHeaders });
              if (retrySocial.ok) {
                setExternalIds(await retrySocial.json());
              }
              
              // Fetch credits using fallback token
              const fallbackCreditsUrl = `https://api.themoviedb.org/3/person/${actorId}/combined_credits?language=en-US`;
              const retryCredits = await fetch(fallbackCreditsUrl, { headers: fallbackHeaders });
              if (retryCredits.ok) {
                const creditsData = await retryCredits.json();
                const castList: CreditItem[] = (creditsData.cast || [])
                  .map((c: any) => ({
                    id: c.id,
                    media_type: c.media_type,
                    title: c.title,
                    name: c.name,
                    poster_path: c.poster_path,
                    release_date: c.release_date,
                    first_air_date: c.first_air_date,
                    vote_average: c.vote_average || 0,
                    character: c.character,
                    popularity: c.popularity || 0
                  }));
                setCredits(castList);
              }
              tmdbFailed = false;
            } else {
              tmdbFailed = true;
            }
          } else {
            tmdbFailed = true;
          }
        } else {
          const detailsData = await detailsRes.json();
          setProfile(detailsData);

          // Fetch Social IDs
          const socialRes = await fetch(externalIdsUrl, { headers });
          if (socialRes.ok) {
            const socialData = await socialRes.json();
            setExternalIds(socialData);
          }

          // Fetch Credits
          const creditsRes = await fetch(creditsUrl, { headers });
          if (creditsRes.ok) {
            const creditsData = await creditsRes.json();
            const castList: CreditItem[] = (creditsData.cast || [])
              .map((c: any) => ({
                id: c.id,
                media_type: c.media_type,
                title: c.title,
                name: c.name,
                poster_path: c.poster_path,
                release_date: c.release_date,
                first_air_date: c.first_air_date,
                vote_average: c.vote_average || 0,
                character: c.character,
                popularity: c.popularity || 0
              }));
            setCredits(castList);
          }
        }
      } catch (err) {
        console.warn('Error during TMDB fetch; attempting Trakt fallback:', err);
        tmdbFailed = true;
      }

      // Trakt Fallback if TMDB failed
      if (tmdbFailed) {
        try {
          console.log('Fetching actor data from Trakt fallback...');
          const traktHeaders = {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': 'f2926f0d87d3e789c50a3c276ab6002f5027dec31089fe75792c2836165c7289'
          };

          // 1. Search person by TMDB ID on Trakt
          const searchRes = await fetch(`https://api.trakt.tv/search/tmdb/${actorId}?type=person`, { headers: traktHeaders });
          if (!searchRes.ok) throw new Error(`Trakt search failed with status ${searchRes.status}`);
          
          const searchData = await searchRes.json();
          if (!searchData || searchData.length === 0 || !searchData[0].person) {
            throw new Error('Actor not found on Trakt');
          }

          const person = searchData[0].person;
          const traktSlug = person.ids.slug;

          // 2. Fetch full Trakt person details
          const detailRes = await fetch(`https://api.trakt.tv/people/${traktSlug}?extended=full`, { headers: traktHeaders });
          if (!detailRes.ok) throw new Error(`Trakt details fetch failed with status ${detailRes.status}`);
          const detailData = await detailRes.json();

          setProfile({
            name: detailData.name || actorName,
            biography: detailData.biography || '',
            birthday: detailData.birthday || null,
            deathday: detailData.deathday || null,
            place_of_birth: detailData.birthplace || null,
            profile_path: profilePath || null, // Reuse parent details page image url!
            popularity: 100,
            known_for_department: 'Acting'
          });

          // 3. Fetch movies credit from Trakt
          let combined: CreditItem[] = [];
          const moviesRes = await fetch(`https://api.trakt.tv/people/${traktSlug}/movies?extended=full`, { headers: traktHeaders });
          if (moviesRes.ok) {
            const moviesData = await moviesRes.json();
            const movieCast = (moviesData.cast || []).map((m: any) => ({
              id: m.movie.ids.tmdb || m.movie.ids.trakt,
              media_type: 'movie' as const,
              title: m.movie.title,
              poster_path: null,
              release_date: m.movie.year ? `${m.movie.year}-01-01` : '',
              vote_average: m.movie.rating || 0,
              character: m.character,
              popularity: m.movie.votes || 0
            }));
            combined = [...combined, ...movieCast];
          }

          // 4. Fetch TV shows credit from Trakt
          const showsRes = await fetch(`https://api.trakt.tv/people/${traktSlug}/shows?extended=full`, { headers: traktHeaders });
          if (showsRes.ok) {
            const showsData = await showsRes.json();
            const showCast = (showsData.cast || []).map((s: any) => ({
              id: s.show.ids.tmdb || s.show.ids.trakt,
              media_type: 'tv' as const,
              name: s.show.title,
              poster_path: null,
              first_air_date: s.show.year ? `${s.show.year}-01-01` : '',
              vote_average: s.show.rating || 0,
              character: s.character,
              popularity: s.show.votes || 0
            }));
            combined = [...combined, ...showCast];
          }

          setCredits(combined);
        } catch (traktErr: any) {
          console.error('Trakt fallback failed:', traktErr);
          setError('Failed to load profile from both TMDB and Trakt.');
        }
      }
      setLoading(false);
    };

    fetchActorData();
  }, [actorId, tmdbApiKey]);

  // Apply filters and sorting
  useEffect(() => {
    let result = [...credits];

    // Filter by Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => {
        const title = (c.title || c.name || '').toLowerCase();
        const character = (c.character || '').toLowerCase();
        return title.includes(q) || character.includes(q);
      });
    }

    // Filter by Category
    if (categoryFilter !== 'all') {
      result = result.filter(c => c.media_type === categoryFilter);
    }

    // Filter by Year
    if (yearFilter !== 'all') {
      result = result.filter(c => {
        const dateStr = c.release_date || c.first_air_date;
        if (!dateStr) return false;
        return dateStr.startsWith(yearFilter);
      });
    }

    // Sorting
    result.sort((a, b) => {
      const dateA = a.release_date || a.first_air_date || '';
      const dateB = b.release_date || b.first_air_date || '';

      if (sortOrder === 'year_desc') {
        return dateB.localeCompare(dateA);
      } else if (sortOrder === 'year_asc') {
        return dateA.localeCompare(dateB);
      } else if (sortOrder === 'rating_desc') {
        return b.vote_average - a.vote_average;
      } else {
        // default: popularity_desc
        return b.popularity - a.popularity;
      }
    });

    setFilteredCredits(result);
  }, [credits, searchQuery, categoryFilter, yearFilter, sortOrder]);

  // Extract unique years from credits to populate filter dropdown
  const uniqueYears = Array.from(
    new Set(
      credits
        .map(c => {
          const dateStr = c.release_date || c.first_air_date;
          return dateStr ? dateStr.substring(0, 4) : null;
        })
        .filter((y): y is string => y !== null)
    )
  ).sort((a, b) => b.localeCompare(a));

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredCredits.length / itemsPerPage);
  const paginatedCredits = filteredCredits.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxVisible = 3;
    let start = Math.max(1, currentPage - 1);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pageNumbers.push(
        <PaginationItem key={1}>
          <PaginationLink onClick={() => handlePageChange(1)}>
            1
          </PaginationLink>
        </PaginationItem>
      );
      if (start > 2) {
        pageNumbers.push(<PaginationEllipsis key="ellipsis-start" />);
      }
    }

    for (let i = start; i <= end; i++) {
      pageNumbers.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => handlePageChange(i)}
            isActive={currentPage === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        pageNumbers.push(<PaginationEllipsis key="ellipsis-end" />);
      }
      pageNumbers.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => handlePageChange(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return pageNumbers;
  };

  if (loading) {
    return <ActorPageSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="actor-page-container error-view" style={{ padding: '4rem', textAlign: 'center' }}>
        <h2>Error Loading Profile</h2>
        <p>{error || 'Unable to retrieve data.'}</p>
        <button onClick={onClose} className="btn-back">Close</button>
      </div>
    );
  }

  const profileImageUrl = profile.profile_path
    ? (profile.profile_path.startsWith('http') ? profile.profile_path : `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/h632${profile.profile_path}`)
    : '';

  return (
    <div className="media-details-page-container actor-page-container animate-fade-in" style={{ minHeight: '100vh' }}>
      {/* Ambient Blurred Profile Cover Backdrop */}
      {profileImageUrl && (
        <div 
          className="media-details-backdrop"
          style={{ backgroundImage: `url(${profileImageUrl})` }}
        />
      )}
      <div className="media-details-backdrop-overlay" />

      {/* Translucent Glass Close Button */}
      <button 
        className="details-close-btn" 
        onClick={onClose} 
        title="Close Profile"
        style={{ 
          position: 'absolute', 
          top: '1.25rem', 
          right: '1.25rem', 
          zIndex: 2000
        }}
      >
        <X size={20} />
      </button>

      <div className="media-details-content-wrapper actor-details-container">
        <div className="actor-layout-grid">
          
          {/* Left Column: Portrait & Info */}
          <div className="actor-left-col">
            <div className="media-details-poster-wrapper actor-portrait-card">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt={profile.name} className="actor-profile-image media-details-poster" />
              ) : (
                <div className="media-details-poster-fallback">
                  <Sparkles size={48} />
                </div>
              )}
            </div>

            <div className="actor-quick-meta" style={{ alignItems: 'center', textAlign: 'center', width: '100%' }}>
              <h1 className="media-details-title" style={{ fontSize: '1.8rem', margin: '0 0 0.6rem 0', textAlign: 'center' }}>{profile.name}</h1>
              
              <div className="media-details-badges" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
                {profile.known_for_department && (
                  <span className="meta-badge type-label">{profile.known_for_department}</span>
                )}
                {profile.popularity > 0 && (
                  <span className="meta-badge rating">
                    <Star size={13} fill="#fbbf24" color="#fbbf24" style={{ marginRight: '4px' }} />
                    <span>{profile.popularity.toFixed(1)}</span>
                  </span>
                )}
              </div>

              {/* Social Links */}
              {externalIds && (
                <div className="actor-socials">
                  {externalIds.instagram_id && (
                    <a 
                      href={`https://instagram.com/${externalIds.instagram_id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      title="Instagram"
                    >
                      <InstagramIcon />
                    </a>
                  )}
                  {externalIds.twitter_id && (
                    <a 
                      href={`https://twitter.com/${externalIds.twitter_id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      title="Twitter"
                    >
                      <TwitterIcon />
                    </a>
                  )}
                  {externalIds.facebook_id && (
                    <a 
                      href={`https://facebook.com/${externalIds.facebook_id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      title="Facebook"
                    >
                      <FacebookIcon />
                    </a>
                  )}
                  {externalIds.youtube_id && (
                    <a 
                      href={`https://youtube.com/channel/${externalIds.youtube_id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      title="Youtube"
                    >
                      <YoutubeIcon />
                    </a>
                  )}
                  {profile.profile_path && (
                    <a 
                      href={`https://www.themoviedb.org/person/${actorId}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      title="TMDB Profile"
                    >
                      <LinkIcon size={20} />
                    </a>
                  )}
                </div>
              )}

              {/* Fact Sheets */}
              <div className="actor-facts-list">
                {profile.birthday && (
                  <div className="actor-fact-item">
                    <Calendar size={16} />
                    <div>
                      <span className="fact-label">Born</span>
                      <span className="fact-val">{profile.birthday}</span>
                    </div>
                  </div>
                )}
                {profile.place_of_birth && (
                  <div className="actor-fact-item">
                    <MapPin size={16} />
                    <div>
                      <span className="fact-label">Birthplace</span>
                      <span className="fact-val">{profile.place_of_birth}</span>
                    </div>
                  </div>
                )}
                <div className="actor-fact-item">
                  <Star size={16} />
                  <div>
                    <span className="fact-label">Popularity Score</span>
                    <span className="fact-val">{profile.popularity.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Biography */}
              <div className="actor-bio-section">
                <h3 className="section-title">Biography</h3>
                <p className={`actor-biography-text ${!isBioExpanded ? 'clamped' : ''}`}>
                  {cleanBiography(profile.biography, profile.name)}
                </p>
                {profile.biography && profile.biography.length > 160 && (
                  <button 
                    className="bio-show-more-btn"
                    onClick={() => setIsBioExpanded(!isBioExpanded)}
                  >
                    {isBioExpanded ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Filmography */}
          <div className="actor-right-col">
            
            {/* Filmography Filter Controls */}
            <div className="actor-credits-section">
              <div className="credits-header-row">
                <h3 className="section-title">Known For ({filteredCredits.length})</h3>
                
                <div className="credits-filter-actions">
                  {/* Search Bar */}
                  <div className="filter-search-wrapper">
                    <Search size={16} className="search-icon" />
                    <input 
                      type="text" 
                      placeholder="Search movie or role..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* 3 Dropdowns Squeezed into 1 Single Row */}
                  <div className="credits-dropdowns-row">
                    <CustomSelect
                      value={categoryFilter}
                      onChange={(val) => setCategoryFilter(val as any)}
                      options={[
                        { value: 'all', label: 'Formats' },
                        { value: 'movie', label: 'Movies' },
                        { value: 'tv', label: 'TV' }
                      ]}
                      hideSearch={true}
                    />

                    <CustomSelect
                      value={yearFilter}
                      onChange={(val) => setYearFilter(val)}
                      options={[
                        { value: 'all', label: 'Years' },
                        ...uniqueYears.map(y => ({ value: y, label: y }))
                      ]}
                      hideSearch={uniqueYears.length < 8}
                    />

                    <CustomSelect
                      value={sortOrder}
                      onChange={(val) => setSortOrder(val as any)}
                      options={[
                        { value: 'popularity_desc', label: 'Popularity' },
                        { value: 'year_desc', label: 'Newest' },
                        { value: 'year_asc', label: 'Oldest' },
                        { value: 'rating_desc', label: 'Rating' }
                      ]}
                      hideSearch={true}
                    />
                  </div>
                </div>
              </div>

              {/* Credits Grid */}
              {filteredCredits.length > 0 ? (
                <>
                  <div className="actor-credits-grid">
                    {paginatedCredits.map(c => {
                      const posterUrl = c.poster_path
                        ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w185${c.poster_path}`
                        : '';
                      const titleStr = c.title || c.name || 'Untitled';
                      const dateStr = c.release_date || c.first_air_date || '';
                      const yearStr = dateStr ? dateStr.substring(0, 4) : 'N/A';

                      return (
                        <div 
                          key={`${c.media_type}-${c.id}`} 
                          className="actor-credit-card"
                          onClick={() => {
                            onSelectMedia({
                              id: `online-${c.media_type}-${c.id}`,
                              tmdbId: String(c.id),
                              type: c.media_type === 'movie' ? 'online_movie' : 'online_tv',
                              title: titleStr,
                              backdrop_path: '',
                              poster_path: c.poster_path ? `https://image.tmdb.org/t/p/w500${c.poster_path}` : ''
                            } as any);
                          }}
                        >
                          <div className="credit-card-poster">
                            {posterUrl ? (
                              <img src={posterUrl} alt={titleStr} loading="lazy" />
                            ) : (
                              <div className="credit-card-poster-fallback">
                                {c.media_type === 'movie' ? <Film size={28} /> : <Tv size={28} />}
                              </div>
                            )}
                            
                            {/* Overlay Rating Badge (Top Left) */}
                            {c.vote_average > 0 && (
                              <div className="card-rating-badge" style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 5 }}>
                                <Star size={10} fill="#f59e0b" stroke="#f59e0b" />
                                <span>{c.vote_average.toFixed(1)}</span>
                              </div>
                            )}

                            {/* Overlay Year Badge (Top Right) */}
                            {yearStr && yearStr !== 'N/A' && (
                              <div className="card-year-badge" style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                background: 'rgba(0, 0, 0, 0.85)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.68rem',
                                fontWeight: '800',
                                color: '#fff',
                                textTransform: 'uppercase',
                                zIndex: 5
                              }}>
                                {yearStr}
                              </div>
                            )}
                          </div>

                          <div className="credit-card-info" style={{ padding: '0.5rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <h4 className="credit-card-title" style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={titleStr}>
                              {titleStr}
                            </h4>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {yearStr !== 'N/A' ? yearStr : ''}
                              </span>
                              <span style={{ 
                                fontSize: '0.62rem', 
                                fontWeight: 800, 
                                textTransform: 'uppercase', 
                                padding: '1px 5px', 
                                borderRadius: '3px', 
                                background: c.media_type === 'movie' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)', 
                                color: c.media_type === 'movie' ? '#22c55e' : '#3b82f6',
                                border: c.media_type === 'movie' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
                              }}>
                                {c.media_type === 'movie' ? 'MOVIE' : 'TV'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="pagination-container" style={{ borderTop: '1px solid var(--border-color)', width: '100%' }}>
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationLink
                              onClick={() => handlePageChange(currentPage - 1)}
                              disabled={currentPage === 1}
                              size="icon"
                              aria-label="Go to previous page"
                            >
                              <ChevronLeft className="size-4" />
                            </PaginationLink>
                          </PaginationItem>
                          
                          {renderPageNumbers()}
                          
                          <PaginationItem>
                            <PaginationLink
                              onClick={() => handlePageChange(currentPage + 1)}
                              disabled={currentPage === totalPages}
                              size="icon"
                              aria-label="Go to next page"
                            >
                              <ChevronRight className="size-4" />
                            </PaginationLink>
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              ) : (
                <div className="no-credits-found">
                  <p>No matching movies or shows found for this filter combination.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
