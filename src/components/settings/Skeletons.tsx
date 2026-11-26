import React from 'react';

export interface SkeletonsProps {
  rows?: number;
  showPreview?: boolean;
}

export const Skeletons: React.FC<SkeletonsProps> = ({ rows = 4, showPreview = false }) => {
  return (
    <div className="settings-column" aria-busy="true" aria-label="Loading settings">
      {showPreview && (
        <div
          className="settings-skeleton-box"
          style={{ width: '100%', height: '260px', marginBottom: 'var(--space-4)' }}
        />
      )}

      <div className="settings-card" style={{ gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            className="settings-skeleton-box"
            style={{ width: '180px', height: '22px' }}
          />
          <div
            className="settings-skeleton-box"
            style={{ width: '320px', height: '14px', opacity: 0.6 }}
          />
        </div>

        <div className="settings-card-rows">
          {Array.from({ length: rows }).map((_, idx) => (
            <div
              key={idx}
              className="setting-row"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'var(--border)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <div
                  className="settings-skeleton-box"
                  style={{ width: `${120 + (idx % 3) * 40}px`, height: '16px' }}
                />
                <div
                  className="settings-skeleton-box"
                  style={{ width: `${200 + (idx % 2) * 60}px`, height: '12px', opacity: 0.6 }}
                />
              </div>
              <div
                className="settings-skeleton-box"
                style={{ width: '48px', height: '26px', borderRadius: '9999px' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
