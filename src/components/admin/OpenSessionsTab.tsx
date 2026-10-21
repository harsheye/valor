import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  Radio, 
  Play, 
  Pause, 
  Clock, 
  Globe, 
  MapPin, 
  Copy, 
  Check, 
  Power, 
  ShieldAlert, 
  Laptop, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Filter, 
  RefreshCw, 
  ExternalLink,
  Wifi,
  Eye,
  Film
} from 'lucide-react';

export interface ActiveUser {
  sessionId: string;
  deviceId?: string;
  ip: string;
  browser: string;
  os: string;
  device: string;
  userId: string;
  profileName: string;
  currentPath: string;
  durationSeconds: number;
  bytesTransferred: number;
  totalRequests: number;
  status: 'online' | 'idle' | 'streaming';
  lastSeen?: string;
  firstSeen?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  reverseDns?: string;
  flag?: string;
  isMyDevice?: boolean;
}

interface OpenSessionsTabProps {
  sessions: ActiveUser[];
  onTerminateSession: (sessionId: string) => Promise<void>;
  onFilterSessionLogs: (sessionId: string) => void;
  onFilterDeviceTraffic: (deviceId: string) => void;
  onBlockIp: (ip: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

function formatBytes(bytes: number): string {
  const b = Math.max(0, bytes || 0);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return `${m}m ${remSec}s`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}h ${remMin}m`;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Just now';
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('T') ? dateStr : `${dateStr}Z`);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  } catch {
    return 'Active';
  }
}

export const OpenSessionsTab: React.FC<OpenSessionsTabProps> = ({
  sessions,
  onTerminateSession,
  onFilterSessionLogs,
  onFilterDeviceTraffic,
  onBlockIp,
  onRefresh,
  refreshing,
  copiedId,
  onCopy
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sessionFilter, setSessionFilter] = useState<'all' | 'external_only' | 'my_session' | 'streaming'>('all');
  const [terminatingId, setTerminatingId] = useState<string | null>(null);

  const filteredSessions = sessions.filter(s => {
    if (sessionFilter === 'external_only' && s.isMyDevice) return false;
    if (sessionFilter === 'my_session' && !s.isMyDevice) return false;
    if (sessionFilter === 'streaming') {
      const isStr = s.status === 'streaming' || (s.currentPath && (s.currentPath.includes('/stream') || s.currentPath.includes('/video') || s.currentPath.includes('/embed') || s.currentPath.includes('/api/proxy')));
      if (!isStr) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.sessionId || '').toLowerCase().includes(q) ||
      (s.deviceId || '').toLowerCase().includes(q) ||
      (s.ip || '').toLowerCase().includes(q) ||
      (s.reverseDns || '').toLowerCase().includes(q) ||
      (s.country || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.currentPath || '').toLowerCase().includes(q) ||
      (s.profileName || '').toLowerCase().includes(q) ||
      (s.browser || '').toLowerCase().includes(q)
    );
  });

  const streamingCount = sessions.filter(s => 
    s.status === 'streaming' || 
    (s.currentPath && (s.currentPath.includes('/stream') || s.currentPath.includes('/video') || s.currentPath.includes('/embed') || s.currentPath.includes('/api/proxy')))
  ).length;

  const handleKill = async (sId: string) => {
    if (!window.confirm('Terminate this active session immediately? The client will be disconnected.')) return;
    setTerminatingId(sId);
    try {
      await onTerminateSession(sId);
    } finally {
      setTerminatingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Live Metric Ribbon */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '0.85rem'
      }}>
        {/* Active Open Sessions */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Live Open Sessions
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              color: '#4ade80',
              fontSize: '0.68rem',
              fontWeight: 700
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
              LIVE
            </span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc', margin: '6px 0 2px' }}>
            {sessions.length} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#94a3b8' }}>connections</span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Real-time active client sockets & viewers
          </span>
        </div>

        {/* Streaming Now */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Streaming Media Now
            </span>
            <Film size={16} color="#c084fc" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#c084fc', margin: '6px 0 2px' }}>
            {streamingCount} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#94a3b8' }}>active streams</span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Playing video chunks or embed players
          </span>
        </div>

        {/* Avg Session Duration */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Average Session Time
            </span>
            <Clock size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8', margin: '6px 0 2px' }}>
            {sessions.length ? formatDuration(Math.round(sessions.reduce((a, b) => a + (b.durationSeconds || 0), 0) / sessions.length)) : '0s'}
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Current connected session length
          </span>
        </div>

        {/* Active Countries */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Connected Countries
            </span>
            <Globe size={16} color="#facc15" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#facc15', margin: '6px 0 2px' }}>
            {new Set(sessions.map(s => s.country || 'Unknown')).size} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#94a3b8' }}>regions</span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Global distribution of live users
          </span>
        </div>
      </div>

      {/* Main SaaS Sessions Card */}
      <div style={{
        backgroundColor: 'var(--surface, #1e293b)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        borderRadius: '14px',
        overflow: 'hidden'
      }}>
        
        {/* Card Header & Controls */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc' }}>
              Real-Time Connected Sessions & Streaming Monitor
            </h3>
            <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>
              Inspect live visitors, current streaming URLs, geographic origin, IP intelligence, and revoke rogue sessions.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Session Type Filters */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All Sessions (${sessions.length})` },
                { id: 'external_only', label: `👥 Real Visitors (${sessions.filter(s => !s.isMyDevice).length})` },
                { id: 'my_session', label: `👤 My Sessions (${sessions.filter(s => s.isMyDevice).length})` },
                { id: 'streaming', label: `🎬 Streaming (${streamingCount})` },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setSessionFilter(f.id as any)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: sessionFilter === f.id ? (f.id === 'my_session' ? '#c084fc' : '#38bdf8') : 'rgba(255, 255, 255, 0.1)',
                    backgroundColor: sessionFilter === f.id 
                      ? (f.id === 'my_session' ? 'rgba(192, 132, 252, 0.2)' : 'rgba(56, 189, 248, 0.15)') 
                      : 'rgba(255, 255, 255, 0.03)',
                    color: sessionFilter === f.id 
                      ? (f.id === 'my_session' ? '#c084fc' : '#38bdf8') 
                      : '#94a3b8',
                    fontSize: '0.74rem',
                    fontWeight: sessionFilter === f.id ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', width: '220px' }}>
              <input
                type="text"
                placeholder="Search user, IP, path..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  color: '#f8fafc',
                  fontSize: '0.8rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>

            <button
              onClick={onRefresh}
              disabled={refreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                color: '#38bdf8',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Sessions Table */}
        {filteredSessions.length === 0 ? (
          <div style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Users size={44} color="#64748b" />
            <h4 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>
              No Active Open Sessions
            </h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem', maxWidth: '360px' }}>
              {searchQuery ? `No sessions match "${searchQuery}".` : 'When users open the app or watch via embedded players, their active sessions appear here in real-time.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  color: '#64748b',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>Session / Device ID</th>
                  <th style={{ padding: '10px 14px' }}>User / Profile</th>
                  <th style={{ padding: '10px 14px' }}>Real IP & Hostname</th>
                  <th style={{ padding: '10px 14px' }}>Location</th>
                  <th style={{ padding: '10px 14px' }}>Current Streaming URL</th>
                  <th style={{ padding: '10px 14px' }}>Duration</th>
                  <th style={{ padding: '10px 14px' }}>Requests</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((user) => {
                  const isTerminating = terminatingId === user.sessionId;
                  const isStreaming = user.status === 'streaming' || 
                    (user.currentPath && (user.currentPath.includes('/stream') || user.currentPath.includes('/video') || user.currentPath.includes('/embed') || user.currentPath.includes('/api/proxy')));

                  return (
                    <tr 
                      key={user.sessionId}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Status */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          backgroundColor: isStreaming ? 'rgba(168, 85, 247, 0.15)' : (user.status === 'idle' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)'),
                          color: isStreaming ? '#c084fc' : (user.status === 'idle' ? '#facc15' : '#4ade80'),
                          border: `1px solid ${isStreaming ? 'rgba(168, 85, 247, 0.3)' : (user.status === 'idle' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(34, 197, 94, 0.3)')}`
                        }}>
                          {isStreaming ? (
                            <>
                              <Play size={10} fill="#c084fc" />
                              STREAMING
                            </>
                          ) : (
                            <>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: user.status === 'idle' ? '#facc15' : '#22c55e' }} />
                              {user.status === 'idle' ? 'IDLE' : 'ONLINE'}
                            </>
                          )}
                        </span>
                      </td>

                      {/* Session / Device Fingerprint */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#f8fafc', fontWeight: 600 }}>
                              {user.sessionId.slice(0, 16)}...
                            </span>
                            <button
                              onClick={() => onCopy(user.sessionId, `sess-${user.sessionId}`)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === `sess-${user.sessionId}` ? '#4ade80' : '#64748b', padding: 0 }}
                              title="Copy Session ID"
                            >
                              {copiedId === `sess-${user.sessionId}` ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </div>
                          {user.deviceId && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Device:</span>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#94a3b8' }}>
                                {user.deviceId.slice(0, 14)}...
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* User / Profile */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
                            {user.profileName || 'Guest Viewer'}
                          </span>
                          {user.isMyDevice ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(192, 132, 252, 0.2)',
                              border: '1px solid rgba(192, 132, 252, 0.45)',
                              color: '#c084fc',
                              fontSize: '0.66rem',
                              fontWeight: 700
                            }}>
                              👤 You (Admin)
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(34, 197, 94, 0.1)',
                              border: '1px solid rgba(34, 197, 94, 0.25)',
                              color: '#4ade80',
                              fontSize: '0.66rem',
                              fontWeight: 600
                            }}>
                              🌐 Visitor
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          {user.browser} on {user.os}
                        </div>
                      </td>

                      {/* Real IP & Hostname */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#f8fafc', fontWeight: 600 }}>
                            {user.ip}
                          </span>
                          <button
                            onClick={() => onCopy(user.ip, `ip-sess-${user.ip}`)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === `ip-sess-${user.ip}` ? '#4ade80' : '#64748b', padding: 0 }}
                          >
                            {copiedId === `ip-sess-${user.ip}` ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#c084fc', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user.reverseDns}>
                          {user.reverseDns || 'No PTR Host'}
                        </div>
                      </td>

                      {/* Location */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '1rem' }}>{user.flag || '🌐'}</span>
                          <span style={{ fontSize: '0.8rem', color: '#f1f5f9' }}>
                            {user.city ? `${user.city}, ` : ''}{user.country || 'Unknown'}
                          </span>
                        </div>
                      </td>

                      {/* Current Path */}
                      <td style={{ padding: '12px 14px', maxWidth: '240px' }}>
                        <div style={{
                          fontFamily: 'monospace',
                          fontSize: '0.74rem',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: isStreaming ? 'rgba(168, 85, 247, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                          color: isStreaming ? '#c084fc' : '#cbd5e1',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }} title={user.currentPath}>
                          {user.currentPath || '/'}
                        </div>
                      </td>

                      {/* Duration */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#4ade80' }}>
                          {formatDuration(user.durationSeconds)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          Active {formatRelativeTime(user.lastSeen)}
                        </div>
                      </td>

                      {/* Requests */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#facc15' }}>
                          {user.totalRequests}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          {formatBytes(user.bytesTransferred)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            onClick={() => onFilterSessionLogs(user.sessionId)}
                            style={{
                              padding: '5px 9px',
                              borderRadius: '6px',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              backgroundColor: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              fontSize: '0.72rem',
                              cursor: 'pointer'
                            }}
                            title="Inspect live logs for this session"
                          >
                            <Filter size={12} />
                          </button>

                          <button
                            onClick={() => onBlockIp(user.ip)}
                            style={{
                              padding: '5px 9px',
                              borderRadius: '6px',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              backgroundColor: 'rgba(239, 68, 68, 0.08)',
                              color: '#f87171',
                              fontSize: '0.72rem',
                              cursor: 'pointer'
                            }}
                            title="Block this IP"
                          >
                            <ShieldAlert size={12} />
                          </button>

                          <button
                            onClick={() => handleKill(user.sessionId)}
                            disabled={isTerminating}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              color: '#f87171',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: isTerminating ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="Terminate this session"
                          >
                            <Power size={12} />
                            {isTerminating ? 'Killing...' : 'Kill'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};
