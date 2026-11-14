import React, { useState } from 'react';
import { Globe, RefreshCw, CheckCircle2, AlertTriangle, Key, Clock, Zap } from 'lucide-react';

interface ProviderStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  statusCode?: number;
  latencyMs: number;
  checkedAt: string;
  error?: string;
  quotaRemaining?: string;
  keyRotationDays?: number;
}

interface ThirdPartyMonitorProps {
  providers?: ProviderStatus[];
  onCheckHealth?: () => void;
  isChecking?: boolean;
}

export const ThirdPartyMonitor: React.FC<ThirdPartyMonitorProps> = ({
  providers: customProviders,
  onCheckHealth,
  isChecking = false
}) => {
  const [rotatedKeyName, setRotatedKeyName] = useState<string | null>(null);

  const defaultProviders: ProviderStatus[] = [
    {
      name: 'VLR.gg (Esports Scraper & Matches)',
      status: 'online',
      statusCode: 200,
      latencyMs: 142,
      checkedAt: new Date().toISOString(),
      quotaRemaining: 'Unlimited (Scraper)',
      keyRotationDays: 140
    },
    {
      name: 'Trakt.tv (Scrobbler & Watch History Sync)',
      status: 'online',
      statusCode: 200,
      latencyMs: 88,
      checkedAt: new Date().toISOString(),
      quotaRemaining: '9,840 / 10,000 req/hr',
      keyRotationDays: 24 // Reminder!
    },
    {
      name: 'TheMovieDB (TMDB Metadata & Media Posters)',
      status: 'online',
      statusCode: 200,
      latencyMs: 64,
      checkedAt: new Date().toISOString(),
      quotaRemaining: '38 / 40 req/sec',
      keyRotationDays: 88
    },
    {
      name: 'OpenSubtitles REST API',
      status: 'online',
      statusCode: 200,
      latencyMs: 110,
      checkedAt: new Date().toISOString(),
      quotaRemaining: '4,200 / 5,000 daily downloads',
      keyRotationDays: 18 // Key rotation reminder
    }
  ];

  const displayList = customProviders && customProviders.length > 0 ? customProviders : defaultProviders;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            3rd-Party APIs & Provider Health
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-3, #8F99AA)' }}>
            Real-time ping probes, upstream latency tracking, rate-limit consumption and API key lifecycle management.
          </p>
        </div>

        <button
          onClick={onCheckHealth}
          disabled={isChecking}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--surface-2, #1B212A)',
            border: '1px solid var(--border, #262D39)',
            color: 'var(--text-1, #E4E8EE)',
            padding: '7px 14px',
            borderRadius: 'var(--radius-sm, 8px)',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: isChecking ? 'not-allowed' : 'pointer'
          }}
        >
          <RefreshCw size={14} className={isChecking ? 'spin-slow' : ''} />
          <span>{isChecking ? 'Probing Providers…' : 'Probe Endpoints Now'}</span>
        </button>
      </div>

      {/* Provider Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '16px'
      }}>
        {displayList.map(p => {
          const isOnline = p.status === 'online';
          const isDegraded = p.status === 'degraded';
          const statusCol = isOnline ? 'var(--success, #86CDA6)' : (isDegraded ? 'var(--warning, #E3BD7A)' : 'var(--danger, #EC8F95)');
          const needsRotation = (p.keyRotationDays || 100) < 30;

          return (
            <div
              key={p.name}
              style={{
                background: 'var(--surface-1, #151A21)',
                border: '1px solid var(--border, #262D39)',
                borderRadius: 'var(--radius-md, 12px)',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe size={18} color="var(--accent, #8CA9EE)" />
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-1, #E4E8EE)' }}>
                    {p.name}
                  </h4>
                </div>

                <span style={{
                  color: statusCol,
                  border: `1px solid ${statusCol}`,
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase'
                }}>
                  ● {p.status}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem' }}>
                <div>
                  <span style={{ color: 'var(--text-3, #8F99AA)' }}>Response Latency:</span>
                  <div style={{ fontWeight: 600, color: p.latencyMs > 300 ? 'var(--warning, #E3BD7A)' : 'var(--text-1, #E4E8EE)' }}>
                    {p.latencyMs} ms
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-3, #8F99AA)' }}>Quota Remaining:</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                    {p.quotaRemaining || 'Available'}
                  </div>
                </div>
              </div>

              {/* Key Rotation Reminder */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: needsRotation ? 'rgba(227, 189, 122, 0.1)' : 'var(--surface-2, #1B212A)',
                border: `1px solid ${needsRotation ? 'var(--warning, #E3BD7A)' : 'transparent'}`,
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: needsRotation ? 'var(--warning, #E3BD7A)' : 'var(--text-2, #A9B2C0)' }}>
                  <Key size={13} />
                  <span>
                    {needsRotation ? `API Key expires in ${p.keyRotationDays} days!` : `Key valid (${p.keyRotationDays || 90}d left)`}
                  </span>
                </div>

                {needsRotation && (
                  <button
                    onClick={() => {
                      setRotatedKeyName(p.name);
                      setTimeout(() => setRotatedKeyName(null), 3000);
                    }}
                    style={{
                      background: 'var(--warning, #E3BD7A)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {rotatedKeyName === p.name ? 'Rotated!' : 'Rotate Key'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
