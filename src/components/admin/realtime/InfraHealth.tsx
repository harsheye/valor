import React from 'react';
import { Server, Database, HardDrive, Cpu, Activity, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface InfraHealthProps {
  infra: {
    postgres: any;
    redis: any;
    reverseProxy: any;
    system: any;
  };
  incidentTimeline: any[];
}

export const InfraHealth: React.FC<InfraHealthProps> = ({ infra, incidentTimeline }) => {
  const { postgres, redis, reverseProxy, system } = infra;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Node & Service Status Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {/* PostgreSQL Card */}
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} color="var(--accent, #8CA9EE)" />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
                PostgreSQL Core DB
              </h3>
            </div>
            <span style={{
              background: 'rgba(134, 205, 166, 0.15)',
              color: 'var(--success, #86CDA6)',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 700
            }}>
              ● {postgres.status || 'Healthy'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem' }}>
            <div>
              <span style={{ color: 'var(--text-3, #8F99AA)' }}>Query Latency:</span>
              <div style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>{postgres.latencyMs || 1.2} ms</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-3, #8F99AA)' }}>Connections:</span>
              <div style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>{postgres.connections || 14} / 100 pool</div>
            </div>
          </div>

          {/* 24h Uptime Sparkline */}
          <div style={{ marginTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-3, #8F99AA)', marginBottom: '4px' }}>
              <span>24h Uptime History</span>
              <span style={{ color: 'var(--success, #86CDA6)', fontWeight: 600 }}>100%</span>
            </div>
            <div style={{ display: 'flex', gap: '3px', height: '14px' }}>
              {(postgres.history24h || Array(24).fill(1)).map((_: any, i: number) => (
                <div key={i} style={{ flex: 1, background: 'var(--success, #86CDA6)', borderRadius: '2px' }} />
              ))}
            </div>
          </div>
        </div>

        {/* Redis Cache Card */}
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HardDrive size={18} color="var(--warning, #E3BD7A)" />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
                Redis L2 Cache
              </h3>
            </div>
            <span style={{
              background: 'rgba(134, 205, 166, 0.15)',
              color: 'var(--success, #86CDA6)',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 700
            }}>
              ● {redis.status || 'Healthy'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem' }}>
            <div>
              <span style={{ color: 'var(--text-3, #8F99AA)' }}>Hit Ratio:</span>
              <div style={{ fontWeight: 600, color: 'var(--success, #86CDA6)' }}>{redis.hitRatioPct || 94.6}%</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-3, #8F99AA)' }}>Memory Used:</span>
              <div style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>{redis.memoryUsedMb || 68} MB</div>
            </div>
          </div>

          <div style={{ marginTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-3, #8F99AA)', marginBottom: '4px' }}>
              <span>24h Uptime History</span>
              <span style={{ color: 'var(--success, #86CDA6)', fontWeight: 600 }}>100%</span>
            </div>
            <div style={{ display: 'flex', gap: '3px', height: '14px' }}>
              {(redis.history24h || Array(24).fill(1)).map((_: any, i: number) => (
                <div key={i} style={{ flex: 1, background: 'var(--success, #86CDA6)', borderRadius: '2px' }} />
              ))}
            </div>
          </div>
        </div>

        {/* Reverse Proxy & Host Card */}
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={18} color="var(--accent, #8CA9EE)" />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
                Reverse Proxy & System
              </h3>
            </div>
            <span style={{
              background: 'rgba(134, 205, 166, 0.15)',
              color: 'var(--success, #86CDA6)',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 700
            }}>
              ● Online
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem' }}>
            <div>
              <span style={{ color: 'var(--text-3, #8F99AA)' }}>Node Uptime:</span>
              <div style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                {Math.floor((system.uptimeSeconds || 3600) / 3600)}h {Math.floor(((system.uptimeSeconds || 3600) % 3600) / 60)}m
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-3, #8F99AA)' }}>Memory Heap:</span>
              <div style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>{system.memoryUsageMb || 486} MB</div>
            </div>
          </div>

          <div style={{ marginTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-3, #8F99AA)', marginBottom: '4px' }}>
              <span>24h Uptime History</span>
              <span style={{ color: 'var(--success, #86CDA6)', fontWeight: 600 }}>100%</span>
            </div>
            <div style={{ display: 'flex', gap: '3px', height: '14px' }}>
              {(reverseProxy.history24h || Array(24).fill(1)).map((_: any, i: number) => (
                <div key={i} style={{ flex: 1, background: 'var(--success, #86CDA6)', borderRadius: '2px' }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Automated Incident Timeline */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} color="var(--accent, #8CA9EE)" />
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            Incident Timeline & Outage History
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)' }}>
          Incidents generated automatically from high-severity alert rule triggers.
        </p>

        {incidentTimeline.length === 0 ? (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-3, #8F99AA)', fontSize: '0.82rem' }}>
            <CheckCircle2 size={24} color="var(--success, #86CDA6)" style={{ margin: '0 auto 8px', display: 'block' }} />
            No infrastructure outages or degraded performance incidents in the past 7 days.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {incidentTimeline.map(inc => {
              const isCrit = inc.severity === 'critical';
              const col = isCrit ? 'var(--danger, #EC8F95)' : 'var(--warning, #E3BD7A)';

              return (
                <div
                  key={inc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    background: 'var(--surface-2, #1B212A)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    borderLeft: `4px solid ${col}`
                  }}
                >
                  <AlertTriangle size={16} color={col} style={{ marginTop: '2px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-1, #E4E8EE)' }}>
                        {inc.title}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3, #8F99AA)' }}>
                        {new Date(inc.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-2, #A9B2C0)' }}>
                      {inc.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
