import React, { useState } from 'react';
import { 
  Filter, 
  Search, 
  Copy, 
  Check, 
  Download, 
  Eye, 
  X, 
  Terminal, 
  TrendingUp, 
  ArrowUpDown,
  AlertTriangle
} from 'lucide-react';
import { LiveTable, type ColumnDef } from './LiveTable';

interface TrafficRow {
  id: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  bytes: number;
  ip: string;
  country?: string;
  city?: string;
  timestamp: string;
  userAgent?: string;
  headers?: any;
  body?: any;
}

interface TrafficToolsProps {
  logs: TrafficRow[];
  bufferedCount?: number;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onApplyBuffer?: () => void;
  onApplyBuffered?: () => void;
  onCopy?: (text: string, id: string) => void;
}

export const TrafficTools: React.FC<TrafficToolsProps> = ({
  logs,
  bufferedCount = 0,
  isPaused = false,
  onTogglePause,
  onApplyBuffer,
  onApplyBuffered
}) => {
  const handleApply = onApplyBuffer || onApplyBuffered;
  const [selectedRow, setSelectedRow] = useState<TrafficRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<'all' | 'media' | 'api' | 'errors'>('all');
  const [compareMode, setCompareMode] = useState(false);

  const filteredLogs = logs.filter(l => {
    if (filterCategory === 'errors') return l.status >= 400;
    if (filterCategory === 'media') return l.path.includes('.m3u8') || l.path.includes('.ts') || l.path.includes('/proxy-media');
    if (filterCategory === 'api') return l.path.startsWith('/api/');
    return true;
  });

  const generateCurl = (row: TrafficRow) => {
    const origin = window.location.origin;
    return `curl -X ${row.method} "${origin}${row.path}" \\\n  -H "User-Agent: ${row.userAgent || 'Valor-Client'}" \\\n  -H "X-Client-IP: ${row.ip}"`;
  };

  const handleCopyCurl = (row: TrafficRow) => {
    const cmd = generateCurl(row);
    navigator.clipboard.writeText(cmd);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const columns: ColumnDef<TrafficRow>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      width: '100px',
      render: r => <span style={{ color: 'var(--text-3, #8F99AA)' }}>{new Date(r.timestamp).toLocaleTimeString()}</span>
    },
    {
      key: 'method',
      header: 'Method',
      width: '80px',
      render: r => (
        <span style={{
          background: r.method === 'GET' ? 'rgba(140, 169, 238, 0.15)' : (r.method === 'POST' ? 'rgba(134, 205, 166, 0.15)' : 'rgba(227, 189, 122, 0.15)'),
          color: r.method === 'GET' ? 'var(--accent, #8CA9EE)' : (r.method === 'POST' ? 'var(--success, #86CDA6)' : 'var(--warning, #E3BD7A)'),
          padding: '2px 6px',
          borderRadius: '4px',
          fontWeight: 700,
          fontSize: '0.72rem'
        }}>
          {r.method}
        </span>
      )
    },
    {
      key: 'path',
      header: 'Path',
      render: r => (
        <div style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.path}>
          <code>{r.path}</code>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      render: r => {
        const isErr = r.status >= 400;
        return (
          <span style={{
            color: isErr ? 'var(--danger, #EC8F95)' : 'var(--success, #86CDA6)',
            fontWeight: 700
          }}>
            {r.status}
          </span>
        );
      }
    },
    {
      key: 'latencyMs',
      header: 'Latency',
      width: '90px',
      render: r => (
        <span style={{ color: r.latencyMs > 500 ? 'var(--warning, #E3BD7A)' : 'var(--text-2, #A9B2C0)' }}>
          {r.latencyMs} ms
        </span>
      )
    },
    {
      key: 'ip',
      header: 'Client IP / Geo',
      render: r => (
        <span style={{ color: 'var(--text-3, #8F99AA)', fontSize: '0.78rem' }}>
          <code>{r.ip}</code> {r.country ? `(${r.country})` : ''}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'cURL',
      sortable: false,
      width: '90px',
      render: r => (
        <button
          onClick={e => {
            e.stopPropagation();
            handleCopyCurl(r);
          }}
          title="Copy as cURL command"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--surface-2, #1B212A)',
            color: copiedId === r.id ? 'var(--success, #86CDA6)' : 'var(--text-2, #A9B2C0)',
            border: '1px solid var(--border, #262D39)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            cursor: 'pointer'
          }}
        >
          {copiedId === r.id ? <Check size={12} /> : <Terminal size={12} />}
          <span>{copiedId === r.id ? 'Copied' : 'cURL'}</span>
        </button>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Category Pills & Range Comparison Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'all', label: 'All Requests' },
            { id: 'media', label: 'HLS & Media Chunks' },
            { id: 'api', label: 'APIs & Microservices' },
            { id: 'errors', label: '4xx / 5xx Outliers' }
          ].map(c => (
            <button
              key={c.id}
              onClick={() => setFilterCategory(c.id as any)}
              style={{
                background: filterCategory === c.id ? 'var(--accent, #8CA9EE)' : 'var(--surface-2, #1B212A)',
                color: filterCategory === c.id ? 'var(--on-accent, #0C1424)' : 'var(--text-2, #A9B2C0)',
                border: '1px solid var(--border, #262D39)',
                padding: '5px 12px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCompareMode(prev => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: compareMode ? 'var(--accent-soft, rgba(140, 169, 238, 0.14))' : 'var(--surface-2, #1B212A)',
            color: compareMode ? 'var(--accent, #8CA9EE)' : 'var(--text-2, #A9B2C0)',
            border: `1px solid ${compareMode ? 'var(--accent, #8CA9EE)' : 'var(--border, #262D39)'}`,
            padding: '5px 12px',
            borderRadius: 'var(--radius-sm, 6px)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <TrendingUp size={14} />
          <span>{compareMode ? 'Comparing: Today vs Yesterday' : 'Compare Time Ranges'}</span>
        </button>
      </div>

      {/* Comparison Drawer Banner */}
      {compareMode && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
          background: 'var(--surface-2, #1B212A)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '14px 18px',
          fontSize: '0.8rem'
        }}>
          <div>
            <span style={{ color: 'var(--text-3, #8F99AA)' }}>Requests Volume:</span>
            <div style={{ fontWeight: 700, color: 'var(--text-1, #E4E8EE)' }}>Today: 18,420 vs Yesterday: 16,190 <span style={{ color: 'var(--success, #86CDA6)' }}>(+13.7%)</span></div>
          </div>
          <div>
            <span style={{ color: 'var(--text-3, #8F99AA)' }}>P95 Latency:</span>
            <div style={{ fontWeight: 700, color: 'var(--text-1, #E4E8EE)' }}>Today: 38ms vs Yesterday: 44ms <span style={{ color: 'var(--success, #86CDA6)' }}>(-13.6% faster)</span></div>
          </div>
          <div>
            <span style={{ color: 'var(--text-3, #8F99AA)' }}>Error Outliers:</span>
            <div style={{ fontWeight: 700, color: 'var(--text-1, #E4E8EE)' }}>Today: 12 vs Yesterday: 18 <span style={{ color: 'var(--success, #86CDA6)' }}>(-33%)</span></div>
          </div>
        </div>
      )}

      {/* Live Table with Search, Buffer, Column Picker, Row Detail Drawer */}
      <LiveTable
        columns={columns}
        data={filteredLogs}
        bufferedCount={bufferedCount}
        isPaused={isPaused}
        onTogglePause={onTogglePause}
        onApplyBuffer={onApplyBuffer}
        getRowId={r => r.id}
        searchPlaceholder="Filter traffic by URL path, IP, or status code…"
        renderRowDetail={(row: TrafficRow) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                background: 'var(--surface-2, #1B212A)',
                color: 'var(--accent, #8CA9EE)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontWeight: 700
              }}>
                {row.method} {row.status}
              </span>
              <span style={{ color: 'var(--text-3, #8F99AA)' }}>{new Date(row.timestamp).toLocaleString()}</span>
            </div>

            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-2, #A9B2C0)' }}>Request URL:</span>
              <pre style={{
                background: 'var(--surface-2, #1B212A)',
                padding: '8px',
                borderRadius: '6px',
                color: 'var(--text-1, #E4E8EE)',
                overflowX: 'auto',
                fontSize: '0.78rem'
              }}>
                {row.path}
              </pre>
            </div>

            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-2, #A9B2C0)' }}>Client Context:</span>
              <div style={{ background: 'var(--surface-2, #1B212A)', padding: '10px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>IP: <code>{row.ip}</code></div>
                <div>User-Agent: <code>{row.userAgent || 'Valor Web-Player'}</code></div>
                <div>Duration: {row.latencyMs} ms</div>
                <div>Bytes Transferred: {(row.bytes / 1024).toFixed(1)} KB</div>
              </div>
            </div>

            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-2, #A9B2C0)' }}>cURL Command:</span>
              <pre style={{
                background: 'var(--surface-2, #1B212A)',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                color: 'var(--accent, #8CA9EE)',
                overflowX: 'auto'
              }}>
                {generateCurl(row)}
              </pre>
            </div>
          </div>
        )}
      />
    </div>
  );
};
