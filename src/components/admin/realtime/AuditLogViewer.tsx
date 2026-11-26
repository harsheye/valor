import React, { useState } from 'react';
import { Shield, Search, Download, Filter, Eye, X, Clock, Calendar } from 'lucide-react';

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  oldValues?: any;
  newValues?: any;
  ip: string;
  userAgent?: string;
  createdAt: string;
}

interface AuditLogViewerProps {
  logs: AuditLogEntry[];
  onRefresh?: () => void;
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const filteredLogs = logs.filter(l => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      l.actor.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.subjectId.toLowerCase().includes(q) ||
      l.ip.includes(q)
    );
  });

  const handleExport = (format: 'csv' | 'json') => {
    window.open(`/api/admin/audit-logs/export?format=${format}`, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            Administrative Audit Trail
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-3, #8F99AA)' }}>
            Tamper-evident record of all administrative modifications, block actions, settings updates, and logins.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleExport('csv')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface-2, #1B212A)',
              color: 'var(--text-1, #E4E8EE)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-sm, 8px)',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('json')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface-2, #1B212A)',
              color: 'var(--text-1, #E4E8EE)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-sm, 8px)',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Download size={14} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-sm, 8px)',
        padding: '8px 12px',
        maxWidth: '400px'
      }}>
        <Search size={15} color="var(--text-3, #8F99AA)" />
        <input
          type="text"
          placeholder="Filter audit actions, actors, subjects, IPs…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-1, #E4E8EE)',
            fontSize: '0.82rem',
            width: '100%'
          }}
        />
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2, #1B212A)', borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
              <th style={{ padding: '10px 14px' }}>Timestamp</th>
              <th style={{ padding: '10px 14px' }}>Actor</th>
              <th style={{ padding: '10px 14px' }}>Action</th>
              <th style={{ padding: '10px 14px' }}>Subject</th>
              <th style={{ padding: '10px 14px' }}>IP Address</th>
              <th style={{ padding: '10px 14px', textAlign: 'right' }}>Changes</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--text-3, #8F99AA)' }}>
                  No audit log records found.
                </td>
              </tr>
            ) : (
              filteredLogs.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border, #262D39)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-3, #8F99AA)', whiteSpace: 'nowrap' }}>
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--accent, #8CA9EE)' }}>
                    {l.actor}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <code style={{
                      background: 'var(--surface-2, #1B212A)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      color: 'var(--text-1, #E4E8EE)'
                    }}>
                      {l.action}
                    </code>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2, #A9B2C0)' }}>
                    {l.subjectType}: {l.subjectId}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-3, #8F99AA)' }}>
                    <code>{l.ip}</code>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {(l.oldValues || l.newValues) ? (
                      <button
                        onClick={() => setSelectedEntry(l)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border, #262D39)',
                          color: 'var(--text-2, #A9B2C0)',
                          borderRadius: '4px',
                          padding: '2px 8px',
                          fontSize: '0.74rem',
                          cursor: 'pointer'
                        }}
                      >
                        View Diff
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-3, #8F99AA)', fontSize: '0.74rem' }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Diff Inspector Modal */}
      {selectedEntry && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--scrim, rgba(15, 18, 23, 0.75))',
          backdropFilter: 'blur(4px)',
          zIndex: 1500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '640px',
            maxWidth: '92vw',
            background: 'var(--surface-1, #151A21)',
            border: '1px solid var(--border, #262D39)',
            borderRadius: 'var(--radius-md, 12px)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-1, #E4E8EE)' }}>Audit Change Diff</h3>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-3, #8F99AA)' }}>
                  Action: {selectedEntry.action} by {selectedEntry.actor} at {new Date(selectedEntry.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--danger, #EC8F95)' }}>Previous Values:</span>
                <pre style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  color: 'var(--text-2, #A9B2C0)',
                  overflowX: 'auto',
                  maxHeight: '280px'
                }}>
                  {JSON.stringify(selectedEntry.oldValues || { status: 'none' }, null, 2)}
                </pre>
              </div>

              <div>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--success, #86CDA6)' }}>New Values:</span>
                <pre style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  color: 'var(--text-1, #E4E8EE)',
                  overflowX: 'auto',
                  maxHeight: '280px'
                }}>
                  {JSON.stringify(selectedEntry.newValues || { status: 'none' }, null, 2)}
                </pre>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                onClick={() => setSelectedEntry(null)}
                style={{
                  background: 'var(--accent, #8CA9EE)',
                  border: 'none',
                  color: 'var(--on-accent, #0C1424)',
                  padding: '7px 16px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
