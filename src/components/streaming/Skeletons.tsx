import React from 'react';
import './streaming.css';

/**
 * Universal Skeletons that mirror final layouts exactly to prevent layout shifts.
 * Uses linear-gradient of --surface-2 to --surface-3 to --surface-2, background-size 300%, 1.4s linear infinite.
 */

export const ShimmerBox: React.FC<{
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  style?: React.CSSProperties;
  className?: string;
}> = ({ width = '100%', height = '100%', borderRadius = 'var(--radius-sm)', style, className = '' }) => (
  <div
    className={`streaming-skeleton-shimmer ${className}`}
    style={{
      width,
      height,
      borderRadius,
      flexShrink: 0,
      ...style
    }}
  />
);

/**
 * 1. Poster Grid Skeleton (12 cards mirroring search results)
 */
export const PosterGridSkeleton: React.FC<{ count?: number }> = ({ count = 12 }) => {
  return (
    <div
      className="online-stream-grid"
      aria-label="Loading content"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            width: '100%'
          }}
        >
          {/* 2:3 aspect ratio poster */}
          <ShimmerBox
            height="auto"
            borderRadius="var(--radius-md)"
            style={{
              aspectRatio: '2/3',
              width: '100%',
              border: '1px solid var(--border)'
            }}
          />
          {/* Title line */}
          <ShimmerBox width="85%" height="18px" borderRadius="var(--radius-sm)" style={{ marginTop: 'var(--space-1)' }} />
          {/* Meta subtitle: year · type · rating */}
          <ShimmerBox width="60%" height="14px" borderRadius="var(--radius-sm)" />
        </div>
      ))}
    </div>
  );
};

/**
 * 2. Title Page Skeleton (Hero + Cast Circles + Episode Rows)
 */
export const TitlePageSkeleton: React.FC = () => {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text-1)',
        position: 'relative',
        overflow: 'hidden'
      }}
      aria-label="Loading title details"
      aria-busy="true"
    >
      {/* Hero Backdrop Shimmer */}
      <div
        className="streaming-skeleton-shimmer"
        style={{
          width: '100%',
          height: '62vh',
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: 0.45
        }}
      />

      {/* Hero Content Area */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: 'var(--space-7) var(--space-7) var(--space-5) var(--space-7)',
          maxWidth: '1440px',
          margin: '0 auto',
          marginTop: '16vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)'
        }}
      >
        {/* Chip row placeholder (match %, age, seasons, 4K, 5.1) */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <ShimmerBox width="90px" height="26px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="45px" height="26px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="80px" height="26px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="45px" height="26px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="50px" height="26px" borderRadius="var(--radius-sm)" />
        </div>

        {/* Display Title */}
        <ShimmerBox width="55%" height="52px" borderRadius="var(--radius-md)" />

        {/* Synopsis (3 lines up to ~52ch) */}
        <div style={{ maxWidth: '52ch', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <ShimmerBox width="100%" height="16px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="92%" height="16px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="70%" height="16px" borderRadius="var(--radius-sm)" />
        </div>

        {/* Buttons row */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <ShimmerBox width="150px" height="46px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="130px" height="46px" borderRadius="var(--radius-sm)" />
        </div>
      </div>

      {/* Cast & Crew Circles Rail Skeleton */}
      <div style={{ maxWidth: '1440px', margin: 'var(--space-6) auto 0 auto', padding: '0 var(--space-7)' }}>
        <ShimmerBox width="140px" height="24px" borderRadius="var(--radius-sm)" style={{ marginBottom: 'var(--space-4)' }} />
        <div style={{ display: 'flex', gap: 'var(--space-5)', overflow: 'hidden' }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', width: '84px' }}>
              <ShimmerBox width="80px" height="80px" borderRadius="50%" />
              <ShimmerBox width="68px" height="13px" borderRadius="var(--radius-sm)" />
              <ShimmerBox width="48px" height="11px" borderRadius="var(--radius-sm)" />
            </div>
          ))}
        </div>
      </div>

      {/* Episodes Rows Skeleton */}
      <div style={{ maxWidth: '1440px', margin: 'var(--space-7) auto', padding: '0 var(--space-7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <ShimmerBox width="110px" height="24px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="130px" height="36px" borderRadius="var(--radius-sm)" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-3)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <ShimmerBox width="28px" height="20px" borderRadius="var(--radius-sm)" />
              <ShimmerBox width="140px" height="78px" borderRadius="var(--radius-sm)" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <ShimmerBox width="40%" height="18px" borderRadius="var(--radius-sm)" />
                <ShimmerBox width="85%" height="14px" borderRadius="var(--radius-sm)" />
                <ShimmerBox width="60%" height="14px" borderRadius="var(--radius-sm)" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 3. Person Sheet Skeleton (Left portrait column + right known for grid)
 */
export const PersonSheetSkeleton: React.FC = () => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(240px, 300px) 1fr',
        gap: 'var(--space-6)',
        padding: 'var(--space-6)',
        boxSizing: 'border-box',
        width: '100%',
        height: '100%'
      }}
      aria-label="Loading person details"
      aria-busy="true"
    >
      {/* Left Column: Portrait & Bio Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <ShimmerBox height="auto" borderRadius="var(--radius-md)" style={{ aspectRatio: '2/3', width: '100%' }} />
        <ShimmerBox width="80%" height="28px" borderRadius="var(--radius-sm)" />
        <ShimmerBox width="45%" height="22px" borderRadius="var(--radius-sm)" />
        <ShimmerBox width="60%" height="16px" borderRadius="var(--radius-sm)" />
        <ShimmerBox width="70%" height="16px" borderRadius="var(--radius-sm)" />
      </div>

      {/* Right Column: Known for + Filter + Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
          <ShimmerBox width="160px" height="28px" borderRadius="var(--radius-sm)" />
          <ShimmerBox width="180px" height="36px" borderRadius="var(--radius-sm)" />
        </div>
        <ShimmerBox width="100%" height="38px" borderRadius="var(--radius-sm)" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <ShimmerBox height="auto" borderRadius="var(--radius-sm)" style={{ aspectRatio: '2/3', width: '100%' }} />
              <ShimmerBox width="90%" height="14px" borderRadius="var(--radius-sm)" />
              <ShimmerBox width="55%" height="12px" borderRadius="var(--radius-sm)" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
