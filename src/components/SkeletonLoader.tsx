import React from 'react';

export const MediaPageSkeleton: React.FC = () => {
  return (
    <div style={{ width: '100vw', minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--text-primary)', position: 'relative', overflow: 'hidden' }}>
      {/* Hero Backdrop Placeholder */}
      <div className="skeleton-shimmer" style={{ width: '100%', height: '55vh', position: 'absolute', top: 0, left: 0, opacity: 0.3 }} />
      
      <div style={{ position: 'relative', zIndex: 2, padding: '3rem 4rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '3rem', marginTop: '15vh' }}>
        {/* Poster Skeleton */}
        <div className="skeleton-shimmer" style={{ width: '300px', height: '450px', borderRadius: '1.25rem', flexShrink: 0, boxShadow: 'var(--shadow-lg)' }} />
        
        {/* Info Skeleton */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="skeleton-shimmer" style={{ width: '60%', height: '42px', borderRadius: '0.5rem' }} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="skeleton-shimmer" style={{ width: '80px', height: '28px', borderRadius: '1rem' }} />
            <div className="skeleton-shimmer" style={{ width: '60px', height: '28px', borderRadius: '1rem' }} />
            <div className="skeleton-shimmer" style={{ width: '100px', height: '28px', borderRadius: '1rem' }} />
          </div>
          <div className="skeleton-shimmer" style={{ width: '100%', height: '18px', borderRadius: '0.25rem' }} />
          <div className="skeleton-shimmer" style={{ width: '90%', height: '18px', borderRadius: '0.25rem' }} />
          <div className="skeleton-shimmer" style={{ width: '75%', height: '18px', borderRadius: '0.25rem' }} />
          
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <div className="skeleton-shimmer" style={{ width: '140px', height: '48px', borderRadius: '0.75rem' }} />
            <div className="skeleton-shimmer" style={{ width: '140px', height: '48px', borderRadius: '0.75rem' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const EpisodeGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} style={{ background: 'var(--surface)', borderRadius: '1rem', padding: '0.85rem', border: '1px solid var(--border-color)' }}>
          <div className="skeleton-shimmer" style={{ width: '100%', aspectRatio: '16/9', borderRadius: '0.75rem', marginBottom: '0.85rem' }} />
          <div className="skeleton-shimmer" style={{ width: '70%', height: '20px', borderRadius: '0.35rem', marginBottom: '0.5rem' }} />
          <div className="skeleton-shimmer" style={{ width: '40%', height: '14px', borderRadius: '0.25rem' }} />
        </div>
      ))}
    </div>
  );
};

export const CarouselSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div style={{ display: 'flex', gap: '1.25rem', overflowX: 'hidden', padding: '0.5rem 0' }}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} style={{ flexShrink: 0, width: '180px' }}>
          <div className="skeleton-shimmer" style={{ width: '180px', height: '270px', borderRadius: '1rem', marginBottom: '0.75rem' }} />
          <div className="skeleton-shimmer" style={{ width: '85%', height: '16px', borderRadius: '0.25rem', marginBottom: '0.35rem' }} />
          <div className="skeleton-shimmer" style={{ width: '50%', height: '12px', borderRadius: '0.25rem' }} />
        </div>
      ))}
    </div>
  );
};

export const ActorPageSkeleton: React.FC = () => {
  return (
    <div style={{ width: '100vw', minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--text-primary)', padding: '3rem 4rem', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '3.5rem', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="skeleton-shimmer" style={{ width: '320px', height: '480px', borderRadius: '1.25rem' }} />
          <div className="skeleton-shimmer" style={{ width: '70%', height: '32px', borderRadius: '0.5rem' }} />
          <div className="skeleton-shimmer" style={{ width: '40%', height: '20px', borderRadius: '0.35rem' }} />
        </div>
        
        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="skeleton-shimmer" style={{ width: '200px', height: '36px', borderRadius: '0.5rem' }} />
          <div className="skeleton-shimmer" style={{ width: '100%', height: '18px', borderRadius: '0.25rem' }} />
          <div className="skeleton-shimmer" style={{ width: '95%', height: '18px', borderRadius: '0.25rem' }} />
          <div className="skeleton-shimmer" style={{ width: '90%', height: '18px', borderRadius: '0.25rem' }} />
          <div className="skeleton-shimmer" style={{ width: '60%', height: '18px', borderRadius: '0.25rem' }} />
          
          <div className="skeleton-shimmer" style={{ width: '250px', height: '32px', borderRadius: '0.5rem', marginTop: '2rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.25rem' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton-shimmer" style={{ width: '100%', height: '250px', borderRadius: '0.85rem', marginBottom: '0.5rem' }} />
                <div className="skeleton-shimmer" style={{ width: '80%', height: '16px', borderRadius: '0.25rem' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
