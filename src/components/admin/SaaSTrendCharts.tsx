import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Globe, 
  Monitor, 
  Smartphone, 
  Tablet, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  Radio, 
  Cpu, 
  Calendar 
} from 'lucide-react';

interface ActivityItem {
  label: string;
  sublabel?: string;
  date?: string;
  hour?: string;
  requests: number;
  bytes: number;
  activeUsers: number;
  thirdPartyRequests?: number;
}

interface BreakdownItem {
  name: string;
  count: number;
  percentage: number;
}

interface SaaSTrendChartsProps {
  activityData: ActivityItem[];
  timeframe: string;
  browserBreakdown: BreakdownItem[];
  osBreakdown: BreakdownItem[];
  deviceBreakdown: BreakdownItem[];
  devicesList: any[];
  trafficLogs: any[];
}

export const SaaSTrendCharts: React.FC<SaaSTrendChartsProps> = ({
  activityData,
  timeframe,
  browserBreakdown,
  osBreakdown,
  deviceBreakdown,
  devicesList,
  trafficLogs
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Compute Country Distribution from devicesList
  const countryMap: Record<string, { count: number; flag: string; countryCode: string }> = {};
  devicesList.forEach(dev => {
    const c = dev.country || 'Unknown';
    if (!countryMap[c]) {
      countryMap[c] = { count: 0, flag: dev.flag || '🌐', countryCode: dev.countryCode || 'UN' };
    }
    countryMap[c].count++;
  });

  const totalDevs = devicesList.length || 1;
  const topCountries = Object.entries(countryMap)
    .map(([country, data]) => ({
      country,
      flag: data.flag,
      count: data.count,
      percentage: Math.round((data.count / totalDevs) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Compute HTTP Status Distribution
  const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  trafficLogs.forEach(log => {
    const code = log.statusCode || 200;
    if (code >= 200 && code < 300) statusCounts['2xx']++;
    else if (code >= 300 && code < 400) statusCounts['3xx']++;
    else if (code >= 400 && code < 500) statusCounts['4xx']++;
    else if (code >= 500) statusCounts['5xx']++;
  });
  const totalLogs = trafficLogs.length || 1;

  // Chart Dimensions & Calculations
  const chartHeight = 220;
  const chartWidth = 800;
  const paddingX = 40;
  const paddingY = 25;

  const dataPoints = activityData && activityData.length > 0 ? activityData : [
    { label: '00:00', requests: 0, activeUsers: 0, bytes: 0 },
    { label: '06:00', requests: 5, activeUsers: 1, bytes: 120 },
    { label: '12:00', requests: 18, activeUsers: 3, bytes: 450 },
    { label: '18:00', requests: 12, activeUsers: 2, bytes: 310 },
    { label: '23:00', requests: 4, activeUsers: 1, bytes: 90 }
  ];

  const maxRequests = Math.max(...dataPoints.map(d => d.requests || 0), 10);
  const maxVisitors = Math.max(...dataPoints.map(d => d.activeUsers || 0), 2);

  const getX = (index: number) => {
    if (dataPoints.length <= 1) return paddingX;
    return paddingX + (index / (dataPoints.length - 1)) * (chartWidth - paddingX * 2);
  };

  const getYRequests = (val: number) => {
    const usableH = chartHeight - paddingY * 2;
    return (chartHeight - paddingY) - ((val || 0) / maxRequests) * usableH;
  };

  const getYVisitors = (val: number) => {
    const usableH = chartHeight - paddingY * 2;
    return (chartHeight - paddingY) - ((val || 0) / maxVisitors) * usableH;
  };

  // Build SVG path
  const requestsPoints = dataPoints.map((d, i) => `${getX(i)},${getYRequests(d.requests)}`).join(' ');
  const visitorsPoints = dataPoints.map((d, i) => `${getX(i)},${getYVisitors(d.activeUsers)}`).join(' ');

  const requestsArea = `${getX(0)},${chartHeight - paddingY} ` + requestsPoints + ` ${getX(dataPoints.length - 1)},${chartHeight - paddingY}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* 1. Main Interactive Traffic Area Chart */}
      <div style={{
        backgroundColor: 'var(--surface, #1e293b)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        borderRadius: '14px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="#38bdf8" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
                Traffic Volume & Active Visitor Velocity
              </h3>
            </div>
            <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: '0.76rem' }}>
              Interactive multi-series telemetry stream ({timeframe === 'day' ? 'Hourly Activity' : 'Daily Trend'}).
            </p>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#38bdf8' }} />
              <span style={{ fontSize: '0.76rem', color: '#cbd5e1', fontWeight: 500 }}>HTTP Requests</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#4ade80' }} />
              <span style={{ fontSize: '0.76rem', color: '#cbd5e1', fontWeight: 500 }}>Visitors</span>
            </div>
          </div>
        </div>

        {/* SVG Chart Canvas */}
        <div style={{ position: 'relative', width: '100%', height: `${chartHeight}px` }}>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="requestsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = (chartHeight - paddingY) - pct * (chartHeight - paddingY * 2);
              return (
                <line
                  key={i}
                  x1={paddingX}
                  y1={y}
                  x2={chartWidth - paddingX}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Area Fill */}
            <polygon points={requestsArea} fill="url(#requestsGrad)" />

            {/* Requests Line */}
            <polyline
              points={requestsPoints}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Visitors Line */}
            <polyline
              points={visitorsPoints}
              fill="none"
              stroke="#4ade80"
              strokeWidth="2"
              strokeDasharray="4 2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data Points & Hover Targets */}
            {dataPoints.map((d, i) => {
              const x = getX(i);
              const y = getYRequests(d.requests);
              const isHovered = hoveredIndex === i;

              return (
                <g key={i}>
                  {/* Invisible broad hover rect */}
                  <rect
                    x={x - (chartWidth / dataPoints.length) / 2}
                    y={0}
                    width={chartWidth / dataPoints.length}
                    height={chartHeight}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    style={{ cursor: 'pointer' }}
                  />

                  {/* Circle dot on curve */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 5 : 3}
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth="2"
                    style={{ transition: 'r 0.15s ease' }}
                  />

                  {/* Vertical hover indicator bar */}
                  {isHovered && (
                    <line
                      x1={x}
                      y1={paddingY}
                      x2={x}
                      y2={chartHeight - paddingY}
                      stroke="rgba(56, 189, 248, 0.4)"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                  )}
                </g>
              );
            })}

            {/* X-Axis Labels */}
            {dataPoints.map((d, i) => {
              // Only render every Nth label to prevent overlap
              const step = Math.max(1, Math.floor(dataPoints.length / 8));
              if (i % step !== 0 && i !== dataPoints.length - 1) return null;
              const x = getX(i);
              return (
                <text
                  key={i}
                  x={x}
                  y={chartHeight - 6}
                  fill="#64748b"
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {d.label}
                </text>
              );
            })}
          </svg>

          {/* Interactive Floating Tooltip */}
          {hoveredIndex !== null && dataPoints[hoveredIndex] && (
            <div style={{
              position: 'absolute',
              top: '10px',
              left: `${Math.min(Math.max(10, (hoveredIndex / (dataPoints.length - 1)) * 90), 80)}%`,
              backgroundColor: '#0f172a',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'none',
              zIndex: 10,
              fontSize: '0.74rem'
            }}>
              <div style={{ color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                {dataPoints[hoveredIndex].sublabel ? `${dataPoints[hoveredIndex].sublabel} • ` : ''}
                {dataPoints[hoveredIndex].label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                  {dataPoints[hoveredIndex].requests} requests
                </span>
                <span style={{ color: '#64748b' }}>•</span>
                <span style={{ color: '#4ade80', fontWeight: 700 }}>
                  {dataPoints[hoveredIndex].activeUsers} visitors
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Three-Column SaaS Breakdown Widgets */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.25rem'
      }}>
        
        {/* Top Geographies & Countries */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '14px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} color="#38bdf8" />
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc' }}>
              Top Visitor Geographies
            </h4>
          </div>

          {topCountries.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
              Geographic telemetry recording...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topCountries.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{c.flag}</span>
                      <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{c.country}</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                      {c.count} ({c.percentage}%)
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{
                    width: '100%',
                    height: '5px',
                    borderRadius: '3px',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${c.percentage}%`,
                      height: '100%',
                      backgroundColor: i === 0 ? '#38bdf8' : (i === 1 ? '#4ade80' : '#a855f7'),
                      borderRadius: '3px'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Platform & Device Distribution */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '14px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Monitor size={16} color="#4ade80" />
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc' }}>
              Device Platforms & Browsers
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(deviceBreakdown && deviceBreakdown.length > 0 ? deviceBreakdown : [
              { name: 'Desktop', count: 9, percentage: 100 }
            ]).map((d, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                  <span style={{ color: '#f1f5f9' }}>{d.name}</span>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                    {d.count} ({d.percentage}%)
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '5px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${d.percentage}%`,
                    height: '100%',
                    backgroundColor: '#4ade80',
                    borderRadius: '3px'
                  }} />
                </div>
              </div>
            ))}

            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '8px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                Top Browsers
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(browserBreakdown || []).slice(0, 4).map((b, i) => (
                  <span key={i} style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    fontSize: '0.74rem',
                    color: '#cbd5e1'
                  }}>
                    {b.name}: {b.percentage}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* HTTP Status Code Distribution */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '14px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="#facc15" />
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc' }}>
              Response Health & Status Codes
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: '2xx Success', count: statusCounts['2xx'], color: '#4ade80', pct: Math.round((statusCounts['2xx'] / totalLogs) * 100) },
              { label: '3xx Redirect', count: statusCounts['3xx'], color: '#60a5fa', pct: Math.round((statusCounts['3xx'] / totalLogs) * 100) },
              { label: '4xx Client Error', count: statusCounts['4xx'], color: '#f59e0b', pct: Math.round((statusCounts['4xx'] / totalLogs) * 100) },
              { label: '5xx Server Error', count: statusCounts['5xx'], color: '#f87171', pct: Math.round((statusCounts['5xx'] / totalLogs) * 100) },
            ].map((st, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: st.color }} />
                    <span style={{ color: '#f1f5f9' }}>{st.label}</span>
                  </div>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                    {st.count} ({st.pct}%)
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '5px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${st.pct}%`,
                    height: '100%',
                    backgroundColor: st.color,
                    borderRadius: '3px'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
