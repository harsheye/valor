import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Globe, 
  MapPin, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Clock, 
  Calendar, 
  Activity, 
  ExternalLink, 
  ShieldAlert, 
  Server, 
  Wifi, 
  FileText,
  Filter,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

interface VisitorDevice {
  deviceId: string;
  firstSeen: string;
  lastSeen: string;
  visitCount: number;
  totalDurationSeconds: number;
  totalRequests: number;
  bytesTransferred: number;
  lastIp: string;
  ips: string[];
  userAgent?: string;
  browser: string;
  os: string;
  device: string;
  userId?: string;
  profileName?: string;
  embedCallsCount: number;
  embedReferers: string[];
  lastPath?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  org?: string;
  lat?: number | string;
  lon?: number | string;
  reverseDns?: string;
  flag?: string;
}

interface TrafficLog {
  id: string | number;
  timestamp: number | string;
  ip: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  bytes: number;
  browser: string;
  os: string;
  device?: string;
  userId?: string;
  deviceId?: string;
  referer?: string;
  isEmbed?: boolean;
}

interface DeviceDetailModalProps {
  device: VisitorDevice | null;
  logs: TrafficLog[];
  loading: boolean;
  onClose: () => void;
  onFilterDeviceLogs: (deviceId: string) => void;
  onBlockIp: (ip: string) => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
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

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('T') ? dateStr : `${dateStr}Z`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
}

export const DeviceDetailModal: React.FC<DeviceDetailModalProps> = ({
  device,
  logs,
  loading,
  onClose,
  onFilterDeviceLogs,
  onBlockIp,
  onCopy,
  copiedId
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'logs' | 'referrers'>('profile');

  if (!device) return null;

  const isRecent = (() => {
    try {
      const d = new Date(device.lastSeen.endsWith('Z') || device.lastSeen.includes('T') ? device.lastSeen : `${device.lastSeen}Z`);
      return (Date.now() - d.getTime()) < 15 * 60 * 1000;
    } catch {
      return false;
    }
  })();

  const DeviceIcon = device.device?.toLowerCase() === 'mobile' 
    ? Smartphone 
    : (device.device?.toLowerCase() === 'tablet' ? Tablet : Monitor);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }} onClick={onClose}>
      <div 
        style={{
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}>
              <DeviceIcon size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc' }}>
                  Device Intelligence Dossier
                </h3>
                <span style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 600,
                  backgroundColor: isRecent ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                  color: isRecent ? '#4ade80' : '#94a3b8',
                  border: isRecent ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(148, 163, 184, 0.3)'
                }}>
                  {isRecent ? '● Active Now' : 'Offline'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#94a3b8' }}>
                  {device.deviceId}
                </span>
                <button
                  onClick={() => onCopy(device.deviceId, `modal-id-${device.deviceId}`)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: copiedId === `modal-id-${device.deviceId}` ? '#4ade80' : '#64748b',
                    padding: 0
                  }}
                  title="Copy Device ID"
                >
                  {copiedId === `modal-id-${device.deviceId}` ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Subtabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          padding: '0 1.5rem'
        }}>
          {[
            { id: 'profile', label: 'Device Profile & GeoIP' },
            { id: 'logs', label: `Recent Request Logs (${logs.length})` },
            { id: 'referrers', label: `Embed Referrers (${device.embedReferers?.length || 0})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeSubTab === tab.id ? '2px solid #38bdf8' : '2px solid transparent',
                color: activeSubTab === tab.id ? '#38bdf8' : '#94a3b8',
                fontSize: '0.82rem',
                fontWeight: activeSubTab === tab.id ? 600 : 500,
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {activeSubTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Geolocation & Reverse DNS Card */}
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '12px',
                padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                  <Globe size={18} color="#38bdf8" />
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9' }}>
                    Network & Geolocation Intelligence
                  </h4>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem'
                }}>
                  {/* Real IP */}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Real Client IP
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#f8fafc', fontWeight: 600 }}>
                        {device.lastIp || '127.0.0.1'}
                      </span>
                      <button
                        onClick={() => onCopy(device.lastIp, `modal-ip-${device.lastIp}`)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === `modal-ip-${device.lastIp}` ? '#4ade80' : '#64748b', padding: 0 }}
                      >
                        {copiedId === `modal-ip-${device.lastIp}` ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* Reverse IP / Hostname */}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Reverse DNS / Hostname
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      <Wifi size={13} color="#a855f7" />
                      <span style={{ fontSize: '0.84rem', color: '#c084fc', wordBreak: 'break-all' }}>
                        {device.reverseDns || device.org || 'No PTR Record'}
                      </span>
                    </div>
                  </div>

                  {/* Location & Flag */}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Location
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{device.flag || '🌐'}</span>
                      <span style={{ fontSize: '0.86rem', color: '#f1f5f9' }}>
                        {device.city ? `${device.city}, ` : ''}{device.region ? `${device.region}, ` : ''}{device.country || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  {/* ISP & ASN */}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      ISP / Network Organization
                    </span>
                    <div style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '3px' }}>
                      {device.isp || device.org || 'Local Network'}
                    </div>
                  </div>
                </div>

                {/* Historical IPs */}
                {device.ips && device.ips.length > 1 && (
                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      All Recorded IP Addresses for this Device ({device.ips.length})
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      {device.ips.map((ip, i) => (
                        <span key={i} style={{
                          fontFamily: 'monospace',
                          fontSize: '0.74rem',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          color: '#cbd5e1'
                        }}>
                          {ip}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Engagement & Visit Statistics */}
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '12px',
                padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                  <Activity size={18} color="#22c55e" />
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9' }}>
                    Engagement & Lifetime Telemetry
                  </h4>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem'
                }}>
                  {/* Visit Count */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Visit Count</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
                      {device.visitCount} visits
                    </div>
                  </div>

                  {/* Total Duration */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Total Dwell Time</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4ade80', marginTop: '2px' }}>
                      {formatDuration(device.totalDurationSeconds)}
                    </div>
                  </div>

                  {/* Total Requests */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>HTTP Requests</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#facc15', marginTop: '2px' }}>
                      {device.totalRequests.toLocaleString()}
                    </div>
                  </div>

                  {/* Embed Calls */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Embed Video Calls</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#c084fc', marginTop: '2px' }}>
                      {device.embedCallsCount} streams
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1rem',
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>First Visited</span>
                    <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '2px' }}>
                      {formatDate(device.firstSeen)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Last Visited</span>
                    <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '2px' }}>
                      {formatDate(device.lastSeen)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Data Transferred</span>
                    <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '2px' }}>
                      {formatBytes(device.bytesTransferred)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Client & Browser Environment */}
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '12px',
                padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                  <Server size={18} color="#f59e0b" />
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9' }}>
                    Hardware & Browser Environment
                  </h4>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '0.75rem' }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    color: '#38bdf8',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}>
                    {device.browser}
                  </span>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    border: '1px solid rgba(168, 85, 247, 0.25)',
                    color: '#c084fc',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}>
                    {device.os}
                  </span>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    color: '#4ade80',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}>
                    {device.device}
                  </span>
                </div>

                {device.userAgent && (
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Raw User-Agent</span>
                    <div style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.35)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '0.72rem',
                      color: '#94a3b8',
                      marginTop: '4px',
                      wordBreak: 'break-all'
                    }}>
                      {device.userAgent}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {activeSubTab === 'logs' && (
            <div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  Loading recent device logs...
                </div>
              ) : logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No recent request logs recorded for this device.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{
                        color: '#64748b',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        textTransform: 'uppercase',
                        fontSize: '0.7rem'
                      }}>
                        <th style={{ padding: '8px 10px' }}>Time</th>
                        <th style={{ padding: '8px 10px' }}>Status</th>
                        <th style={{ padding: '8px 10px' }}>Method</th>
                        <th style={{ padding: '8px 10px' }}>Path</th>
                        <th style={{ padding: '8px 10px' }}>Latency</th>
                        <th style={{ padding: '8px 10px' }}>Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log, idx) => (
                        <tr key={idx} style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
                        }}>
                          <td style={{ padding: '8px 10px', color: '#94a3b8' }}>
                            {formatDate(typeof log.timestamp === 'number' ? new Date(log.timestamp).toISOString() : log.timestamp)}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              backgroundColor: log.statusCode < 300 ? 'rgba(34, 197, 94, 0.15)' : (log.statusCode < 400 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                              color: log.statusCode < 300 ? '#4ade80' : (log.statusCode < 400 ? '#60a5fa' : '#f87171')
                            }}>
                              {log.statusCode}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#f8fafc' }}>
                            {log.method}
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#cbd5e1', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.path}>
                            {log.path}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#94a3b8' }}>
                            {log.latencyMs}ms
                          </td>
                          <td style={{ padding: '8px 10px', color: '#94a3b8' }}>
                            {formatBytes(log.bytes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'referrers' && (
            <div>
              {(!device.embedReferers || device.embedReferers.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No external embed referrers recorded for this device. (Direct platform viewer)
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {device.embedReferers.map((ref, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.06)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <ExternalLink size={14} color="#38bdf8" />
                        <span style={{ fontSize: '0.8rem', color: '#f1f5f9', wordBreak: 'break-all' }}>
                          {ref}
                        </span>
                      </div>
                      <a 
                        href={ref} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{
                          fontSize: '0.74rem',
                          color: '#38bdf8',
                          textDecoration: 'none',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(56, 189, 248, 0.1)',
                          flexShrink: 0
                        }}
                      >
                        Open Site
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div style={{
          padding: '1rem 1.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <button
            onClick={() => onBlockIp(device.lastIp)}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#f87171',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ShieldAlert size={15} />
            Block Client IP
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                onFilterDeviceLogs(device.deviceId);
                onClose();
              }}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Filter size={15} />
              Filter in Traffic Feed
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: '#f1f5f9',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
