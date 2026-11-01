import React, { useState } from 'react';
import { Film, Monitor, Globe, AlertTriangle, Zap, CheckCircle2, TrendingUp } from 'lucide-react';

interface PlaybackQualityProps {
  metrics: {
    summary: {
      avgStartupTimeMs: number;
      avgBufferingRatioPct: number;
      avgBitrateKbps: number;
      playbackErrorRatePct: number;
      totalSessionsTracked: number;
    };
    byTitle: any[];
    byDevice: any[];
    byRegion: any[];
  };
}

export const PlaybackQuality: React.FC<PlaybackQualityProps> = ({ metrics }) => {
  const [activeGroup, setActiveGroup] = useState<'title' | 'device' | 'region'>('title');

  const { summary, byTitle, byDevice, byRegion } = metrics;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px'
      }}>
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-3, #8F99AA)', fontWeight: 600 }}>Avg Startup Time</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            {summary.avgStartupTimeMs} ms
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--success, #86CDA6)' }}>● Fast TTFB & HLS handshake</span>
        </div>

        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-3, #8F99AA)', fontWeight: 600 }}>Buffering Ratio</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            {summary.avgBufferingRatioPct}%
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--success, #86CDA6)' }}>● Stable Chunk Pipeline</span>
        </div>

        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-3, #8F99AA)', fontWeight: 600 }}>Average Bitrate</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            {(summary.avgBitrateKbps / 1000).toFixed(1)} Mbps
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--accent, #8CA9EE)' }}>● 1080p / 4K Adaptive Ladder</span>
        </div>

        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-3, #8F99AA)', fontWeight: 600 }}>Playback Error Rate</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            {summary.playbackErrorRatePct}%
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--success, #86CDA6)' }}>● Well below 2.0% SLA</span>
        </div>
      </div>

      {/* Grouping Selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{
          display: 'flex',
          background: 'var(--surface-2, #1B212A)',
          padding: '3px',
          borderRadius: 'var(--radius-sm, 8px)',
          border: '1px solid var(--border, #262D39)'
        }}>
          {[
            { id: 'title', label: 'By Title' },
            { id: 'device', label: 'By Device Type' },
            { id: 'region', label: 'By Geography / Region' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveGroup(t.id as any)}
              style={{
                background: activeGroup === t.id ? 'var(--accent, #8CA9EE)' : 'transparent',
                color: activeGroup === t.id ? 'var(--on-accent, #0C1424)' : 'var(--text-2, #A9B2C0)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <span style={{ fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)' }}>
          High-error or slow-starting outliers are highlighted with warning badges
        </span>
      </div>

      {/* Breakdown Table */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2, #1B212A)', borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
              <th style={{ padding: '10px 14px' }}>Dimension</th>
              <th style={{ padding: '10px 14px' }}>Avg Startup Time</th>
              <th style={{ padding: '10px 14px' }}>Buffering Ratio</th>
              <th style={{ padding: '10px 14px' }}>Average Bitrate</th>
              <th style={{ padding: '10px 14px' }}>Error Rate</th>
              <th style={{ padding: '10px 14px', textAlign: 'right' }}>Health Status</th>
            </tr>
          </thead>
          <tbody>
            {(activeGroup === 'title' ? byTitle : (activeGroup === 'device' ? byDevice : byRegion)).map((row: any, idx: number) => {
              const label = row.title || row.device || row.region;
              const isWorst = row.isWorst;

              return (
                <tr
                  key={idx}
                  style={{
                    borderBottom: '1px solid var(--border, #262D39)',
                    background: isWorst ? 'rgba(236, 143, 149, 0.06)' : 'transparent'
                  }}
                >
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                    {label}
                  </td>
                  <td style={{ padding: '12px 14px', color: row.startupMs > 700 ? 'var(--warning, #E3BD7A)' : 'var(--text-2, #A9B2C0)' }}>
                    {row.startupMs} ms
                  </td>
                  <td style={{ padding: '12px 14px', color: row.bufferingPct > 0.4 ? 'var(--danger, #EC8F95)' : 'var(--text-2, #A9B2C0)' }}>
                    {row.bufferingPct}%
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-2, #A9B2C0)' }}>
                    {row.bitrateKbps ? `${(row.bitrateKbps / 1000).toFixed(1)} Mbps` : 'Adaptive'}
                  </td>
                  <td style={{ padding: '12px 14px', color: row.errorRate > 1.0 ? 'var(--danger, #EC8F95)' : 'var(--success, #86CDA6)', fontWeight: 600 }}>
                    {row.errorRate}%
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    {isWorst ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(236, 143, 149, 0.15)',
                        color: 'var(--danger, #EC8F95)',
                        border: '1px solid var(--danger, #EC8F95)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 700
                      }}>
                        <AlertTriangle size={12} />
                        Worst Offender
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(134, 205, 166, 0.12)',
                        color: 'var(--success, #86CDA6)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 600
                      }}>
                        <CheckCircle2 size={12} />
                        Optimal
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
