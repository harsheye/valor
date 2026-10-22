import React from 'react';
import { Pause } from 'lucide-react';

export interface MediaDetails {
  title: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  releaseDate?: string;
  overview?: string;
  imageUrl?: string;
  logoUrl?: string;
  rating?: number;
}

export interface PauseDetailsOverlayProps {
  visible: boolean;
  mediaDetails: MediaDetails | null;
  videoTitle?: string;
  duration?: number;
  overlayPosition?: string;
  overlayShowBackground?: boolean;
  overlayShowRating?: boolean;
  overlayShowOverview?: boolean;
  videoLayout?: { top: number; left: number; width: number; height: number };
  onLogoError?: () => void;
}

export const PauseDetailsOverlay: React.FC<PauseDetailsOverlayProps> = ({
  visible,
  mediaDetails,
  videoTitle,
  duration = 0,
  overlayPosition = 'middle-left',
  overlayShowBackground = true,
  overlayShowRating = true,
  overlayShowOverview = true,
  videoLayout = { top: 0, left: 0, width: 0, height: 0 },
  onLogoError
}) => {
  if (!visible || !mediaDetails) return null;

  const formatRuntime = (secs: number) => {
    if (!secs || isNaN(secs)) return '1h 45m';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const isLeft = overlayPosition === 'middle-left' || overlayPosition.includes('left');

  return (
    <>
      {overlayShowBackground && (
        <div 
          className="animate-netflix-scrim"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            background: isLeft
              ? 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.74) 28%, rgba(0,0,0,0.32) 58%, transparent 78%)'
              : 'linear-gradient(to left, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.74) 28%, rgba(0,0,0,0.32) 58%, transparent 78%)',
            zIndex: 45,
            pointerEvents: 'none'
          }}
        />
      )}
      <div 
        className={`paused-metadata-overlay ${overlayPosition === 'middle-left' ? 'animate-netflix-slide-in' : 'animate-metadata-slide-in'}`}
        style={{
          position: 'absolute',
          ...(overlayPosition === 'middle-left' && {
            top: '50%',
            transform: 'translateY(-50%)',
            left: videoLayout.left > 0 ? `${videoLayout.left + 54}px` : '4.5%',
          }),
          ...(overlayPosition === 'bottom-left' && {
            bottom: '140px',
            left: videoLayout.left > 0 ? `${videoLayout.left + 24}px` : '2.5%',
          }),
          ...(overlayPosition === 'bottom-right' && {
            bottom: '140px',
            right: videoLayout.left > 0 ? `${videoLayout.left + 24}px` : '2.5%',
          }),
          ...(overlayPosition === 'top-left' && {
            top: videoLayout.top > 0 ? `${videoLayout.top + 60}px` : '5%',
            left: videoLayout.left > 0 ? `${videoLayout.left + 24}px` : '2.5%',
          }),
          ...(overlayPosition === 'top-right' && {
            top: videoLayout.top > 0 ? `${videoLayout.top + 60}px` : '5%',
            right: videoLayout.left > 0 ? `${videoLayout.left + 24}px` : '2.5%',
          }),
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: videoLayout.width > 0 ? `${Math.min(videoLayout.width * 0.44, 520)}px` : '42%',
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.95), 0 0 20px rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
          fontFamily: "'Inter', sans-serif",
          alignItems: overlayPosition.includes('right') ? 'flex-end' : 'flex-start',
          textAlign: overlayPosition.includes('right') ? 'right' : 'left'
        }}
      >
        {/* Netflix Header Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ 
            background: 'var(--accent-color, #e50914)', 
            color: '#ffffff', 
            fontSize: '0.68rem', 
            fontWeight: 900, 
            letterSpacing: '1.5px', 
            padding: '2px 7px', 
            borderRadius: '3px',
            fontFamily: "'Outfit', 'Inter', sans-serif"
          }}>
            VALOR
          </span>
          <span style={{ 
            color: 'rgba(255, 255, 255, 0.7)', 
            fontSize: '0.72rem', 
            fontWeight: 700, 
            letterSpacing: '2px', 
            textTransform: 'uppercase' 
          }}>
            {mediaDetails.episodeTitle || mediaDetails.season ? 'SERIES' : 'FILM'}
          </span>
        </div>

        {/* Title / Logo */}
        {mediaDetails.logoUrl ? (
          <img 
            src={mediaDetails.logoUrl} 
            alt={mediaDetails.title}
            crossOrigin="anonymous"
            onError={onLogoError}
            style={{
              maxHeight: '85px',
              maxWidth: '350px',
              width: 'auto',
              objectFit: 'contain',
              alignSelf: overlayPosition.includes('right') ? 'flex-end' : 'flex-start',
              marginBottom: '4px',
              filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.85))'
            }}
          />
        ) : (
          <h2 style={{ 
            margin: 0, 
            fontSize: 'clamp(2.2rem, 3.8vw, 3.2rem)', 
            fontWeight: 800, 
            color: 'var(--text-primary, #fff)',
            fontFamily: "'Outfit', 'Inter', sans-serif",
            letterSpacing: '-0.025em',
            lineHeight: '1.1',
            textShadow: '0 3px 14px rgba(0, 0, 0, 0.95)'
          }}>
            {mediaDetails.title}
          </h2>
        )}

        {/* Metadata Badges Row */}
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap',
          alignItems: 'center', 
          gap: '10px',
          fontSize: '0.92rem', 
          color: 'rgba(255, 255, 255, 0.85)',
          fontWeight: 600,
          margin: '2px 0',
          fontFamily: "'Inter', sans-serif"
        }}>
          {overlayShowRating && (
            <span style={{ color: '#46d369', fontWeight: 800 }}>
              {mediaDetails.rating ? `${Math.round(mediaDetails.rating * 10)}% Match` : '98% Match'}
            </span>
          )}
          {mediaDetails.releaseDate && (
            <span style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
              {new Date(mediaDetails.releaseDate).getFullYear()}
            </span>
          )}
          <span style={{ 
            border: '1px solid rgba(255, 255, 255, 0.45)', 
            padding: '1px 6px', 
            borderRadius: '3px', 
            fontSize: '0.72rem', 
            fontWeight: 700, 
            color: 'rgba(255, 255, 255, 0.9)',
            letterSpacing: '0.5px'
          }}>
            TV-MA
          </span>
          {mediaDetails.season ? (
            <span>Season {mediaDetails.season}</span>
          ) : (
            <span>{formatRuntime(duration)}</span>
          )}
          <span style={{ 
            border: '1px solid rgba(255, 255, 255, 0.35)', 
            padding: '1px 5px', 
            borderRadius: '2px', 
            fontSize: '0.68rem', 
            fontWeight: 800, 
            color: 'rgba(255, 255, 255, 0.8)' 
          }}>
            HD
          </span>
          <span style={{ 
            border: '1px solid rgba(255, 255, 255, 0.35)', 
            padding: '1px 5px', 
            borderRadius: '2px', 
            fontSize: '0.68rem', 
            fontWeight: 800, 
            color: 'rgba(255, 255, 255, 0.8)' 
          }}>
            5.1
          </span>
        </div>

        {/* Episode Title (if series) */}
        {mediaDetails.episodeTitle && (
          <h3 style={{ 
            margin: '2px 0 0 0', 
            fontSize: '1.18rem', 
            fontWeight: 700, 
            color: 'var(--text-primary, #fff)',
            fontFamily: "'Inter', sans-serif",
            textShadow: '0 2px 8px rgba(0,0,0,0.9)'
          }}>
            {mediaDetails.season && mediaDetails.episode ? `S${mediaDetails.season}:E${mediaDetails.episode} ` : ''}
            "{mediaDetails.episodeTitle}"
          </h3>
        )}

        {/* Overview / Plot */}
        {overlayShowOverview && (mediaDetails.overview || videoTitle) && (
          <p style={{ 
            margin: '2px 0 0 0', 
            fontSize: 'clamp(0.9rem, 1.05vw, 0.98rem)', 
            color: 'rgba(255, 255, 255, 0.85)', 
            lineHeight: '1.55',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '520px',
            fontFamily: "'Inter', sans-serif",
            textShadow: '0 1px 6px rgba(0,0,0,0.9)'
          }}>
            {mediaDetails.overview || videoTitle}
          </p>
        )}

        {/* Paused Tag */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '4px',
          padding: '3px 8px',
          borderRadius: '4px',
          background: 'rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '1px',
          color: 'rgba(255, 255, 255, 0.7)'
        }}>
          <Pause size={12} fill="currentColor" />
          PAUSED
        </div>
      </div>
    </>
  );
};
