import React from 'react';
import { 
  Laptop, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Search, 
  Filter, 
  Clock, 
  Activity, 
  Globe, 
  MapPin, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldAlert, 
  Download, 
  RefreshCw, 
  Radio, 
  ChevronRight,
  TrendingUp,
  Cpu,
  Wifi,
  Eye
} from 'lucide-react';

export interface VisitorDevice {
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
  isMyDevice?: boolean;
}

interface VisitedDevicesTabProps {
  devicesList: VisitorDevice[];
  totalDevicesCount: number;
  totalEmbedCallsCount: number;
  topEmbedReferrers: { referer: string; count: number; last_seen?: string }[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: 'last_seen' | 'visits' | 'duration' | 'requests' | 'bytes' | 'embeds';
  onSortChange: (sort: 'last_seen' | 'visits' | 'duration' | 'requests' | 'bytes' | 'embeds') => void;
  filter: 'all' | 'external_only' | 'my_device' | 'embeds_only' | 'mobile' | 'desktop' | 'tablet';
  onFilterChange: (filter: 'all' | 'external_only' | 'my_device' | 'embeds_only' | 'mobile' | 'desktop' | 'tablet') => void;
  onInspectDevice: (device: VisitorDevice) => void;
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

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('T') ? dateStr : `${dateStr}Z`);
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const VisitedDevicesTab: React.FC<VisitedDevicesTabProps> = ({
  devicesList,
  totalDevicesCount,
  totalEmbedCallsCount,
  topEmbedReferrers,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filter,
  onFilterChange,
  onInspectDevice,
  onFilterDeviceTraffic,
  onBlockIp,
  onRefresh,
  refreshing,
  copiedId,
  onCopy
}) => {
  // Compute summary stats
  const desktopCount = devicesList.filter(d => (d.device || '').toLowerCase() === 'desktop').length;
  const mobileCount = devicesList.filter(d => (d.device || '').toLowerCase() === 'mobile').length;
  const tabletCount = devicesList.filter(d => (d.device || '').toLowerCase() === 'tablet').length;
  const embedDevicesCount = devicesList.filter(d => (d.embedCallsCount || 0) > 0).length;

  const exportCsv = () => {
    if (!devicesList.length) return;
    const headers = [
      'Device ID', 'Last IP', 'Reverse DNS', 'Country', 'City', 'Region', 'ISP',
      'Device Type', 'OS', 'Browser', 'Visit Count', 'Total Duration (s)', 'Total Requests',
      'Embed Calls', 'First Seen', 'Last Seen', 'Last Path'
    ];
    const rows = devicesList.map(d => [
      d.deviceId, d.lastIp, d.reverseDns || '', d.country || '', d.city || '', d.region || '',
      `"${(d.isp || '').replace(/"/g, '""')}"`, d.device, d.os, d.browser, d.visitCount,
      d.totalDurationSeconds, d.totalRequests, d.embedCallsCount, d.firstSeen, d.lastSeen,
      `"${(d.lastPath || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `valor_visitor_devices_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* SaaS Metric Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '0.85rem'
      }}>
        {/* Total Devices */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Unique Visitor Devices
            </span>
            <Laptop size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc', margin: '6px 0 2px' }}>
            {(totalDevicesCount || devicesList.length).toLocaleString()}
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Hardware & network fingerprinted
          </span>
        </div>

        {/* Device Platforms */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Platform Breakdown
            </span>
            <Monitor size={16} color="#4ade80" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '6px 0 2px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              💻 {desktopCount}
            </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              📱 {mobileCount}
            </span>
            {tabletCount > 0 && (
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                📟 {tabletCount}
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Desktop vs Mobile vs Tablets
          </span>
        </div>

        {/* Embed Stream Consumers */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Embed Players & Streams
            </span>
            <Radio size={16} color="#c084fc" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#c084fc', margin: '6px 0 2px' }}>
            {(totalEmbedCallsCount || 0).toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#94a3b8' }}>calls</span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            {embedDevicesCount} devices watching via external embeds
          </span>
        </div>

        {/* Top Active Geography */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Top Location
            </span>
            <Globe size={16} color="#facc15" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0 2px' }}>
            <span style={{ fontSize: '1.5rem' }}>{devicesList[0]?.flag || '🌐'}</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              {devicesList[0]?.country || 'Worldwide'}
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            {devicesList[0]?.city ? `City: ${devicesList[0].city}` : 'Global Visitors'}
          </span>
        </div>
      </div>

      {/* Main SaaS Card with Controls & Directory */}
      <div style={{
        backgroundColor: 'var(--surface, #1e293b)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        borderRadius: '14px',
        overflow: 'hidden'
      }}>
        
        {/* Controls Toolbar */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc' }}>
                Visitor Devices Directory & Intelligence
              </h3>
              <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>
                Real client IP addresses, Reverse DNS hostnames, GeoIP locations, visit frequency, and dwell duration.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={exportCsv}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#cbd5e1',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Export Devices to CSV"
              >
                <Download size={14} />
                Export CSV
              </button>

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

          {/* Search, Filter Pills, and Sort Dropdown */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '280px', minWidth: '220px' }}>
              <input
                type="text"
                placeholder="Search Device ID, IP, Reverse DNS, City..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
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

            {/* Quick Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All Devices (${devicesList.length})` },
                { id: 'external_only', label: `👥 Real Visitors (${devicesList.filter(d => !d.isMyDevice).length})` },
                { id: 'my_device', label: `👤 My Device (${devicesList.filter(d => d.isMyDevice).length})` },
                { id: 'embeds_only', label: '🎬 Embeds Only' },
                { id: 'desktop', label: '💻 Desktop' },
                { id: 'mobile', label: '📱 Mobile' },
                { id: 'tablet', label: '📟 Tablet' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => onFilterChange(f.id as any)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: filter === f.id ? (f.id === 'my_device' ? '#c084fc' : '#38bdf8') : 'rgba(255, 255, 255, 0.1)',
                    backgroundColor: filter === f.id 
                      ? (f.id === 'my_device' ? 'rgba(192, 132, 252, 0.2)' : 'rgba(56, 189, 248, 0.15)') 
                      : 'rgba(255, 255, 255, 0.03)',
                    color: filter === f.id 
                      ? (f.id === 'my_device' ? '#c084fc' : '#38bdf8') 
                      : 'var(--text-muted, #94a3b8)',
                    fontSize: '0.74rem',
                    fontWeight: filter === f.id ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Sort:</span>
              <select
                value={sortBy}
                onChange={e => onSortChange(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  color: '#f8fafc',
                  fontSize: '0.78rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="last_seen">Last Visited (Newest)</option>
                <option value="visits">Most Visits (Frequency)</option>
                <option value="duration">Longest Duration (Time Spent)</option>
                <option value="requests">Most HTTP Requests</option>
                <option value="bytes">Highest Bandwidth</option>
                <option value="embeds">Most Embed Streaming Calls</option>
              </select>
            </div>
          </div>
        </div>

        {/* Devices Directory List */}
        {devicesList.length === 0 ? (
          <div style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Laptop size={44} color="#64748b" />
            <h4 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>
              No Devices Found
            </h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem', maxWidth: '360px' }}>
              {searchQuery ? `No devices matched your search "${searchQuery}". Try adjusting filters.` : 'Visitors and embedded players will automatically register here as they connect.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {devicesList.map((dev, index) => {
              const DeviceIcon = dev.device?.toLowerCase() === 'mobile' 
                ? Smartphone 
                : (dev.device?.toLowerCase() === 'tablet' ? Tablet : Monitor);

              const isRecent = (() => {
                try {
                  const d = new Date(dev.lastSeen.endsWith('Z') || dev.lastSeen.includes('T') ? dev.lastSeen : `${dev.lastSeen}Z`);
                  return (Date.now() - d.getTime()) < 15 * 60 * 1000;
                } catch {
                  return false;
                }
              })();

              return (
                <div
                  key={dev.deviceId || index}
                  style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Top Row: Device Identity & Status */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    {/* Device & Client Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: isRecent ? 'rgba(34, 197, 94, 0.12)' : 'rgba(56, 189, 248, 0.1)',
                        border: isRecent ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(56, 189, 248, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isRecent ? '#4ade80' : '#38bdf8'
                      }}>
                        <DeviceIcon size={18} />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.86rem', fontWeight: 600, color: '#f8fafc' }}>
                            {dev.deviceId}
                          </span>
                          <button
                            onClick={() => onCopy(dev.deviceId, `dev-id-${dev.deviceId}`)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: copiedId === `dev-id-${dev.deviceId}` ? '#4ade80' : '#64748b',
                              padding: 0
                            }}
                            title="Copy Device ID"
                          >
                            {copiedId === `dev-id-${dev.deviceId}` ? <Check size={12} /> : <Copy size={12} />}
                          </button>

                          {dev.isMyDevice ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(192, 132, 252, 0.2)',
                              border: '1px solid rgba(192, 132, 252, 0.45)',
                              color: '#c084fc',
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}>
                              👤 My Device (Admin)
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 7px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(34, 197, 94, 0.1)',
                              border: '1px solid rgba(34, 197, 94, 0.25)',
                              color: '#4ade80',
                              fontSize: '0.7rem',
                              fontWeight: 600
                            }}>
                              🌐 Real Visitor
                            </span>
                          )}

                          <span style={{
                            padding: '1px 7px',
                            borderRadius: '10px',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            backgroundColor: isRecent ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.12)',
                            color: isRecent ? '#4ade80' : '#94a3b8'
                          }}>
                            {isRecent ? '● Active Now' : formatRelativeTime(dev.lastSeen)}
                          </span>

                          {dev.embedCallsCount > 0 && (
                            <span style={{
                              padding: '1px 7px',
                              borderRadius: '10px',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              backgroundColor: 'rgba(168, 85, 247, 0.15)',
                              color: '#c084fc',
                              border: '1px solid rgba(168, 85, 247, 0.25)'
                            }}>
                              🎬 {dev.embedCallsCount} Embed Streams
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px', fontSize: '0.75rem', color: '#94a3b8' }}>
                          <span>{dev.browser} on {dev.os}</span>
                          <span>•</span>
                          <span>{dev.device}</span>
                          {dev.profileName && (
                            <>
                              <span>•</span>
                              <span style={{ color: '#38bdf8' }}>Profile: {dev.profileName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      {/* Visits */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>Visits</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#38bdf8' }}>
                          {dev.visitCount}
                        </div>
                      </div>

                      {/* Total Duration */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>Dwell Time</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#4ade80' }}>
                          {formatDuration(dev.totalDurationSeconds)}
                        </div>
                      </div>

                      {/* Total Requests */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>Requests</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#facc15' }}>
                          {dev.totalRequests.toLocaleString()}
                        </div>
                      </div>

                      {/* Bandwidth */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>Bandwidth</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#cbd5e1' }}>
                          {formatBytes(dev.bytesTransferred)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Network, Reverse IP, and Geolocation Info */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    padding: '10px 14px',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.04)'
                  }}>
                    {/* Real Client IP */}
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                        Real Client IP
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#f8fafc', fontWeight: 600 }}>
                          {dev.lastIp}
                        </span>
                        <button
                          onClick={() => onCopy(dev.lastIp, `ip-${dev.lastIp}`)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: copiedId === `ip-${dev.lastIp}` ? '#4ade80' : '#64748b',
                            padding: 0
                          }}
                          title="Copy IP"
                        >
                          {copiedId === `ip-${dev.lastIp}` ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>

                    {/* Reverse DNS Hostname */}
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                        Reverse DNS / Hostname
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                        <Wifi size={13} color="#a855f7" />
                        <span style={{ fontSize: '0.8rem', color: '#c084fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dev.reverseDns || dev.org}>
                          {dev.reverseDns || dev.org || 'No PTR Record'}
                        </span>
                      </div>
                    </div>

                    {/* Geolocation */}
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                        Location & Country
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontSize: '1rem' }}>{dev.flag || '🌐'}</span>
                        <span style={{ fontSize: '0.8rem', color: '#f1f5f9' }}>
                          {dev.city ? `${dev.city}, ` : ''}{dev.country || 'Unknown'}
                        </span>
                      </div>
                    </div>

                    {/* ISP / Org */}
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                        ISP / Provider
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dev.isp || dev.org}>
                        {dev.isp || dev.org || 'Local Network'}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Embed Referrers, Last Path, and Actions */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                      {dev.lastPath && (
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '0.72rem',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          color: '#94a3b8',
                          maxWidth: '320px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }} title={dev.lastPath}>
                          Path: {dev.lastPath}
                        </span>
                      )}

                      {dev.embedReferers && dev.embedReferers.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ExternalLink size={12} color="#a855f7" />
                          <span style={{
                            fontSize: '0.72rem',
                            color: '#c084fc',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(168, 85, 247, 0.1)',
                            maxWidth: '280px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }} title={dev.embedReferers[0]}>
                            Ref: {dev.embedReferers[0]}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => onInspectDevice(dev)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          backgroundColor: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Eye size={13} />
                        Inspect Device
                      </button>

                      <button
                        onClick={() => onFilterDeviceTraffic(dev.deviceId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          color: '#cbd5e1',
                          fontSize: '0.76rem',
                          cursor: 'pointer'
                        }}
                      >
                        <Filter size={13} />
                        Filter Logs
                      </button>

                      <button
                        onClick={() => onBlockIp(dev.lastIp)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          color: '#f87171',
                          fontSize: '0.76rem',
                          cursor: 'pointer'
                        }}
                        title="Block this IP"
                      >
                        <ShieldAlert size={13} />
                        Block IP
                      </button>
                    </div>
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
