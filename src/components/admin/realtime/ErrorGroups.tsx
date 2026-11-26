import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, X, Clock, Users } from 'lucide-react';

export interface ErrorGroupItem {
  fingerprint: string;
  errorName: string;
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  affectedUsers: number;
  status: 'active' | 'resolved';
  sampleRequest?: {
    method: string;
    url: string;
    clientIp: string;
    userAgent: string;
  };
}

interface ErrorGroupsProps {
  errorGroups: ErrorGroupItem[];
  onResolveError: (fingerprint: string) => Promise<void>;
}

export const ErrorGroups: React.FC<ErrorGroupsProps> = ({
  errorGroups,
  onResolveError
}) => {
  const [selectedError, setSelectedError] = useState<ErrorGroupItem | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
          Real-Time Error Tracking & Fingerprints
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-3, #8F99AA)' }}>
          Exceptions and upstream failure signatures grouped automatically by error fingerprint with sample HTTP context.
        </p>
      </div>

      {/* Error Groups List */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2, #1B212A)', borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
              <th style={{ padding: '10px 14px' }}>Error Fingerprint & Message</th>
              <th style={{ padding: '10px 14px' }}>Occurrences</th>
              <th style={{ padding: '10px 14px' }}>Users Affected</th>
              <th style={{ padding: '10px 14px' }}>Last Seen</th>
              <th style={{ padding: '10px 14px' }}>Status</th>
              <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {errorGroups.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--text-3, #8F99AA)' }}>
                  <CheckCircle2 size={24} color="var(--success, #86CDA6)" style={{ margin: '0 auto 8px', display: 'block' }} />
                  Zero server errors recorded in telemetry.
                </td>
              </tr>
            ) : (
              errorGroups.map(err => {
                const isResolved = err.status === 'resolved';

                return (
                  <tr
                    key={err.fingerprint}
                    style={{
                      borderBottom: '1px solid var(--border, #262D39)',
                      opacity: isResolved ? 0.6 : 1
                    }}
                  >
                    <td style={{ padding: '12px 14px', maxWidth: '360px' }}>
                      <div style={{ fontWeight: 600, color: isResolved ? 'var(--text-2, #A9B2C0)' : 'var(--danger, #EC8F95)' }}>
                        {err.errorName}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-3, #8F99AA)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {err.message}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-1, #E4E8EE)' }}>
                      {err.count}
                    </td>

                    <td style={{ padding: '12px 14px', color: 'var(--text-2, #A9B2C0)' }}>
                      {err.affectedUsers} users
                    </td>

                    <td style={{ padding: '12px 14px', color: 'var(--text-3, #8F99AA)' }}>
                      {new Date(err.lastSeen).toLocaleString()}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        color: isResolved ? 'var(--success, #86CDA6)' : 'var(--danger, #EC8F95)',
                        border: `1px solid ${isResolved ? 'var(--success, #86CDA6)' : 'var(--danger, #EC8F95)'}`,
                        borderRadius: '4px',
                        padding: '1px 6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}>
                        {err.status}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          onClick={() => setSelectedError(err)}
                          style={{
                            background: 'var(--surface-2, #1B212A)',
                            border: '1px solid var(--border, #262D39)',
                            color: 'var(--text-1, #E4E8EE)',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            cursor: 'pointer'
                          }}
                        >
                          Inspect
                        </button>

                        {!isResolved && (
                          <button
                            onClick={() => onResolveError(err.fingerprint)}
                            style={{
                              background: 'var(--success, #86CDA6)',
                              border: 'none',
                              color: '#000',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Inspect Error Drawer / Modal */}
      {selectedError && (
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
            width: '580px',
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
                <h3 style={{ margin: 0, color: 'var(--danger, #EC8F95)' }}>{selectedError.errorName}</h3>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-3, #8F99AA)' }}>
                  Fingerprint: <code>{selectedError.fingerprint}</code>
                </span>
              </div>
              <button
                onClick={() => setSelectedError(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2, #A9B2C0)' }}>Error Message:</span>
              <pre style={{
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                color: 'var(--text-1, #E4E8EE)',
                whiteSpace: 'pre-wrap'
              }}>
                {selectedError.message}
              </pre>
            </div>

            {selectedError.sampleRequest && (
              <div>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2, #A9B2C0)' }}>Sample Request Context:</span>
                <pre style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  color: 'var(--text-2, #A9B2C0)'
                }}>
                  {JSON.stringify(selectedError.sampleRequest, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setSelectedError(null)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-2, #A9B2C0)',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              {selectedError.status !== 'resolved' && (
                <button
                  onClick={async () => {
                    await onResolveError(selectedError.fingerprint);
                    setSelectedError(null);
                  }}
                  style={{
                    background: 'var(--success, #86CDA6)',
                    border: 'none',
                    color: '#000',
                    padding: '7px 16px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Mark Resolved
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
