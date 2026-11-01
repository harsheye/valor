import React, { useState, useMemo } from 'react';
import { Table, BarChart2, Eye, EyeOff } from 'lucide-react';

export interface DataPoint {
  label: string;
  timestamp?: number;
  [seriesKey: string]: any;
}

export interface SeriesConfig {
  key: string;
  label: string;
  colorVar: string; // e.g. 'var(--c1)'
  unit?: string;
}

interface LiveChartProps {
  title: string;
  series: SeriesConfig[];
  data: DataPoint[];
  height?: number;
  rangeOptions?: string[];
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
  showNowMarker?: boolean;
}

export const LiveChart: React.FC<LiveChartProps> = ({
  title,
  series,
  data,
  height = 220,
  rangeOptions = ['Live', '1h', '24h', '7d', '30d'],
  selectedRange = 'Live',
  onRangeChange,
  showNowMarker = true
}) => {
  const [activeSeries, setActiveSeries] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    series.forEach(s => { map[s.key] = true; });
    return map;
  });
  const [showTableFallback, setShowTableFallback] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ point: DataPoint; x: number; y: number } | null>(null);

  const toggleSeries = (key: string) => {
    setActiveSeries(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Compute Scales
  const { maxVal, chartPoints } = useMemo(() => {
    let max = 1;
    data.forEach(d => {
      series.forEach(s => {
        if (activeSeries[s.key]) {
          const val = Number(d[s.key] || 0);
          if (val > max) max = val;
        }
      });
    });
    // Add 10% headroom
    max = Math.ceil(max * 1.15);

    const points = data.map((d, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100;
      return { ...d, _x: x };
    });

    return { maxVal: max, chartPoints: points };
  }, [data, series, activeSeries]);

  // Generate SVG path for a series
  const generatePath = (seriesKey: string) => {
    if (chartPoints.length === 0) return '';
    return chartPoints.map((p, idx) => {
      const val = Number((p as Record<string, any>)[seriesKey] || 0);
      const y = 100 - (val / maxVal) * 100;
      return `${idx === 0 ? 'M' : 'L'} ${p._x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  return (
    <div style={{
      background: 'var(--surface-1, #151A21)',
      border: '1px solid var(--border, #262D39)',
      borderRadius: 'var(--radius-md, 12px)',
      padding: 'var(--space-4, 16px)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      position: 'relative'
    }}>
      {/* Header Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{
            margin: 0,
            fontSize: '0.92rem',
            fontWeight: 600,
            color: 'var(--text-1, #E4E8EE)',
            fontFamily: 'var(--font-display, Outfit)'
          }}>
            {title}
          </h3>
        </div>

        {/* Range Selector & Accessible Fallback Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Accessible Table Fallback Button */}
          <button
            onClick={() => setShowTableFallback(prev => !prev)}
            title="Toggle accessible table view"
            aria-pressed={showTableFallback}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: showTableFallback ? 'var(--accent-soft, rgba(140, 169, 238, 0.14))' : 'var(--surface-2, #1B212A)',
              color: showTableFallback ? 'var(--accent, #8CA9EE)' : 'var(--text-2, #A9B2C0)',
              border: '1px solid var(--border, #262D39)',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm, 6px)',
              fontSize: '0.74rem',
              cursor: 'pointer'
            }}
          >
            {showTableFallback ? <BarChart2 size={13} /> : <Table size={13} />}
            <span>{showTableFallback ? 'Show Chart' : 'Table Fallback'}</span>
          </button>

          {/* Time Ranges */}
          {onRangeChange && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--surface-2, #1B212A)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '2px',
              fontSize: '0.74rem'
            }}>
              {rangeOptions.map(r => (
                <button
                  key={r}
                  onClick={() => onRangeChange(r)}
                  style={{
                    background: selectedRange === r ? 'var(--accent, #8CA9EE)' : 'transparent',
                    color: selectedRange === r ? 'var(--on-accent, #0C1424)' : 'var(--text-2, #A9B2C0)',
                    border: 'none',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Series Visibility Toggles */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        {series.map(s => {
          const isActive = activeSeries[s.key];
          return (
            <button
              key={s.key}
              onClick={() => toggleSeries(s.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                color: isActive ? 'var(--text-1, #E4E8EE)' : 'var(--text-3, #8F99AA)',
                fontSize: '0.76rem',
                cursor: 'pointer',
                opacity: isActive ? 1 : 0.5
              }}
            >
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: s.colorVar
              }} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Accessible Table Fallback View */}
      {showTableFallback ? (
        <div style={{ maxHeight: `${height}px`, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
                <th style={{ padding: '6px', textAlign: 'left' }}>Time / Label</th>
                {series.filter(s => activeSeries[s.key]).map(s => (
                  <th key={s.key} style={{ padding: '6px', textAlign: 'right' }}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border, #262D39)' }}>
                  <td style={{ padding: '6px', color: 'var(--text-1, #E4E8EE)' }}>{d.label}</td>
                  {series.filter(s => activeSeries[s.key]).map(s => (
                    <td key={s.key} style={{ padding: '6px', textAlign: 'right', color: s.colorVar }}>
                      {d[s.key]} {s.unit || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* SVG Interactive Chart */
        <div style={{ position: 'relative', height: `${height}px`, width: '100%' }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
          >
            {/* Grid Lines */}
            <line x1="0" y1="25" x2="100" y2="25" stroke="var(--border, #262D39)" strokeDasharray="2,2" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border, #262D39)" strokeDasharray="2,2" strokeWidth="0.5" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="var(--border, #262D39)" strokeDasharray="2,2" strokeWidth="0.5" />
            <line x1="0" y1="100" x2="100" y2="100" stroke="var(--border, #262D39)" strokeWidth="0.8" />

            {/* Series Paths */}
            {series.map(s => {
              if (!activeSeries[s.key]) return null;
              const pathD = generatePath(s.key);
              return (
                <g key={s.key}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={s.colorVar}
                    strokeWidth="1.8"
                    vectorEffect="non-scaling-stroke"
                    style={{ transition: 'd 0.25s ease' }}
                  />
                </g>
              );
            })}

            {/* "Now" Marker Line on Live Mode */}
            {showNowMarker && (
              <g>
                <line x1="99.5" y1="0" x2="99.5" y2="100" stroke="var(--accent, #8CA9EE)" strokeWidth="1" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
                <circle cx="99.5" cy="10" r="2.5" fill="var(--accent, #8CA9EE)" />
              </g>
            )}
          </svg>

          {/* Interactive Mouse Hover Overlay Points */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            {chartPoints.map((p, i) => (
              <div
                key={i}
                style={{ flex: 1, height: '100%', cursor: 'crosshair' }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredPoint({ point: p, x: rect.left, y: rect.top });
                }}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            ))}
          </div>

          {/* Interactive Tooltip */}
          {hoveredPoint && (
            <div style={{
              position: 'absolute',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--surface-3, #232B36)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '6px 12px',
              pointerEvents: 'none',
              zIndex: 20,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              fontSize: '0.76rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px'
            }}>
              <span style={{ color: 'var(--text-2, #A9B2C0)', fontWeight: 600 }}>{hoveredPoint.point.label}</span>
              {series.filter(s => activeSeries[s.key]).map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: s.colorVar }}>
                  <span>{s.label}:</span>
                  <span style={{ fontWeight: 700 }}>{hoveredPoint.point[s.key]} {s.unit || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
