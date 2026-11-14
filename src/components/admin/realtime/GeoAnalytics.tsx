import React, { useState } from 'react';
import { Globe, MapPin, Users, HardDrive } from 'lucide-react';

interface GeoAnalyticsProps {
  geoStats: {
    countries: any[];
    cities: any[];
  };
}

export const GeoAnalytics: React.FC<GeoAnalyticsProps> = ({ geoStats }) => {
  const [metricMode, setMetricMode] = useState<'visitors' | 'bandwidth'>('visitors');
  const { countries, cities } = geoStats;

  const maxVal = metricMode === 'visitors'
    ? Math.max(...countries.map(c => c.visitors), 1)
    : Math.max(...countries.map(c => c.bandwidthGb), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header with Mode Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            Geographic Intelligence & Distribution
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-3, #8F99AA)' }}>
            Real-time global distribution of streaming sessions and edge reverse proxy bandwidth.
          </p>
        </div>

        {/* Visitors vs Bandwidth Toggle */}
        <div style={{
          display: 'flex',
          background: 'var(--surface-2, #1B212A)',
          padding: '3px',
          borderRadius: 'var(--radius-sm, 8px)',
          border: '1px solid var(--border, #262D39)'
        }}>
          <button
            onClick={() => setMetricMode('visitors')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: metricMode === 'visitors' ? 'var(--accent, #8CA9EE)' : 'transparent',
              color: metricMode === 'visitors' ? 'var(--on-accent, #0C1424)' : 'var(--text-2, #A9B2C0)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Users size={14} />
            <span>Unique Visitors</span>
          </button>
          <button
            onClick={() => setMetricMode('bandwidth')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: metricMode === 'bandwidth' ? 'var(--accent, #8CA9EE)' : 'transparent',
              color: metricMode === 'bandwidth' ? 'var(--on-accent, #0C1424)' : 'var(--text-2, #A9B2C0)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <HardDrive size={14} />
            <span>Bandwidth (GB)</span>
          </button>
        </div>
      </div>

      {/* Grid: Countries & Cities */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '20px'
      }}>
        {/* Ranked Countries */}
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={18} color="var(--accent, #8CA9EE)" />
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
              Top Origin Countries
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {countries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3, #8F99AA)', fontSize: '0.8rem' }}>
                No external geographic origins recorded yet.
              </div>
            ) : (
              countries.map(c => {
                const val = metricMode === 'visitors' ? c.visitors : c.bandwidthGb;
                const barPct = (val / maxVal) * 100;
                const formatted = metricMode === 'visitors' ? `${c.visitors.toLocaleString()} visitors` : `${c.bandwidthGb.toLocaleString()} GB`;

                return (
                  <div key={c.code} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                        <span style={{ color: 'var(--accent, #8CA9EE)', marginRight: '6px' }}>{c.code}</span>
                        {c.country}
                      </span>
                      <span style={{ color: 'var(--text-2, #A9B2C0)' }}>{formatted} ({c.sharePct}%)</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--surface-3, #232B36)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: 'var(--accent, #8CA9EE)' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top Cities */}
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} color="var(--success, #86CDA6)" />
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
              Top Metropolitan Cities
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {cities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3, #8F99AA)', fontSize: '0.8rem' }}>
                No metropolitan city telemetry recorded yet.
              </div>
            ) : (
              cities.map(c => {
                const formatted = metricMode === 'visitors' ? `${c.visitors.toLocaleString()} visitors` : `${c.bandwidthGb.toLocaleString()} GB`;
                return (
                  <div
                    key={c.city}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--surface-2, #1B212A)',
                      borderRadius: 'var(--radius-sm, 6px)',
                      fontSize: '0.82rem'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>{c.city}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3, #8F99AA)' }}>{c.country}</span>
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>{formatted}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
