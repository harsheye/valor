import React from 'react';

export const AdminDashboardSkeleton: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      width: '100%',
      animation: 'pulse 1.5s infinite ease-in-out'
    }}>
      {/* KPI Cards Skeleton */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px'
      }}>
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            style={{
              height: '110px',
              background: 'var(--surface-1, #151A21)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-md, 12px)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ width: '40%', height: '14px', background: 'var(--surface-3, #232B36)', borderRadius: '4px' }} />
            <div style={{ width: '65%', height: '28px', background: 'var(--surface-3, #232B36)', borderRadius: '6px' }} />
            <div style={{ width: '50%', height: '12px', background: 'var(--surface-3, #232B36)', borderRadius: '4px' }} />
          </div>
        ))}
      </div>

      {/* Charts Skeleton */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '20px'
      }}>
        <div style={{
          height: '280px',
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ width: '30%', height: '18px', background: 'var(--surface-3, #232B36)', borderRadius: '4px' }} />
          <div style={{ flex: 1, background: 'var(--surface-2, #1B212A)', borderRadius: '8px' }} />
        </div>

        <div style={{
          height: '280px',
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ width: '35%', height: '18px', background: 'var(--surface-3, #232B36)', borderRadius: '4px' }} />
          <div style={{ flex: 1, background: 'var(--surface-2, #1B212A)', borderRadius: '8px' }} />
        </div>
      </div>

      {/* Table Skeleton */}
      <div style={{
        height: '320px',
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        <div style={{ width: '25%', height: '18px', background: 'var(--surface-3, #232B36)', borderRadius: '4px' }} />
        <div style={{ height: '40px', background: 'var(--surface-2, #1B212A)', borderRadius: '6px' }} />
        {[1, 2, 3, 4].map(r => (
          <div key={r} style={{ height: '32px', background: 'var(--surface-2, #1B212A)', borderRadius: '4px', opacity: 0.7 }} />
        ))}
      </div>
    </div>
  );
};
