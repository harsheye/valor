import React, { useState } from 'react';
import { Radio, Send, Power, Monitor, Laptop, Smartphone, Tablet, Film, Clock, Users, X, Check } from 'lucide-react';

export interface PlaybackSession {
  sessionId: string;
  userId: string;
  profileName: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  country?: string;
  countryCode?: string;
  city?: string;
  title: string;
  positionSeconds: number;
  durationSeconds: number;
  quality: string;
  bitrateKbps: number;
  startupTimeMs: number;
  bufferingRatioPct: number;
  status: 'streaming' | 'idle' | 'paused';
  startedAt: string;
}

interface SessionListProps {
  sessions: (PlaybackSession | any)[];
  onSendMessage: (sessionId: string, message: string) => Promise<void>;
  onTerminateSession: (sessionId: string, reason: string) => Promise<void>;
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  onSendMessage,
  onTerminateSession
}) => {
  const [selectedSessionForMessage, setSelectedSessionForMessage] = useState<PlaybackSession | null>(null);
  const [messageText, setMessageText] = useState('');
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);
  const [terminationReason, setTerminationReason] = useState('Administrative action');
  const [concurrentLimit, setConcurrentLimit] = useState<number>(2);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionForMessage || !messageText.trim()) return;
    await onSendMessage(selectedSessionForMessage.sessionId, messageText.trim());
    setMessageText('');
    setSelectedSessionForMessage(null);
  };

  const handleConfirmTerminate = async () => {
    if (!terminatingSessionId) return;
    await onTerminateSession(terminatingSessionId, terminationReason);
    setTerminatingSessionId(null);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & Concurrent Stream Limiter */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '14px 18px',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Radio size={20} color="var(--accent, #8CA9EE)" className="spin-slow" />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
              Live Open Sessions ({sessions.length} Active Streamers)
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)' }}>
              Real-time playback telemetry, direct in-stream messages, and stream concurrency controls.
            </span>
          </div>
        </div>

        {/* Concurrent Streams Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
          <span>Max Streams / Account:</span>
          <select
            value={concurrentLimit}
            onChange={e => setConcurrentLimit(Number(e.target.value))}
            style={{
              background: 'var(--surface-2, #1B212A)',
              border: '1px solid var(--border, #262D39)',
              color: 'var(--text-1, #E4E8EE)',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.8rem'
            }}
          >
            <option value={1}>1 stream (Strict)</option>
            <option value={2}>2 streams (Standard)</option>
            <option value={4}>4 streams (Family / VIP)</option>
            <option value={999}>Unlimited</option>
          </select>
        </div>
      </div>

      {/* Sessions Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '16px'
      }}>
        {sessions.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            background: 'var(--surface-1, #151A21)',
            border: '1px solid var(--border, #262D39)',
            borderRadius: 'var(--radius-md, 12px)',
            padding: '3rem 1.5rem',
            textAlign: 'center',
            color: 'var(--text-3, #8F99AA)'
          }}>
            <Radio size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <h4 style={{ margin: '0 0 4px', color: 'var(--text-1, #E4E8EE)', fontSize: '0.95rem' }}>No Active Streaming Sessions</h4>
            <p style={{ margin: 0, fontSize: '0.8rem' }}>When users play video streams through Valor, their live sessions and playback telemetry will appear here in real time.</p>
          </div>
        ) : (
          sessions.map(s => {
          const progressPct = s.durationSeconds > 0 ? (s.positionSeconds / s.durationSeconds) * 100 : 0;

          return (
            <div
              key={s.sessionId}
              style={{
                background: 'var(--surface-1, #151A21)',
                border: '1px solid var(--border, #262D39)',
                borderRadius: 'var(--radius-md, 12px)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Film size={18} color="var(--accent, #8CA9EE)" />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-1, #E4E8EE)' }}>
                      {s.title}
                    </h4>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-3, #8F99AA)' }}>
                      {s.profileName} • {s.device} ({s.browser})
                    </span>
                  </div>
                </div>

                <span style={{
                  background: 'rgba(134, 205, 166, 0.15)',
                  color: 'var(--success, #86CDA6)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  {s.quality}
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-3, #8F99AA)', marginBottom: '4px' }}>
                  <span>{formatTime(s.positionSeconds)}</span>
                  <span>{formatTime(s.durationSeconds)} ({progressPct.toFixed(0)}%)</span>
                </div>
                <div style={{ height: '4px', background: 'var(--surface-3, #232B36)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent, #8CA9EE)' }} />
                </div>
              </div>

              {/* Quality & Metrics stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
                background: 'var(--surface-2, #1B212A)',
                padding: '8px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '0.74rem'
              }}>
                <div>
                  <span style={{ color: 'var(--text-3, #8F99AA)', display: 'block' }}>Bitrate</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>{(s.bitrateKbps / 1000).toFixed(1)} Mbps</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-3, #8F99AA)', display: 'block' }}>Startup</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>{s.startupTimeMs} ms</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-3, #8F99AA)', display: 'block' }}>Buffering</span>
                  <span style={{ fontWeight: 600, color: s.bufferingRatioPct > 0.5 ? 'var(--danger, #EC8F95)' : 'var(--text-1, #E4E8EE)' }}>
                    {s.bufferingRatioPct}%
                  </span>
                </div>
              </div>

              {/* Geo & IP */}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3, #8F99AA)' }}>
                IP: <code>{s.ip}</code> {s.city ? `(${s.city}, ${s.country})` : ''}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '6px' }}>
                <button
                  onClick={() => setSelectedSessionForMessage(s)}
                  style={{
                    flex: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: 'var(--surface-2, #1B212A)',
                    color: 'var(--text-1, #E4E8EE)',
                    border: '1px solid var(--border, #262D39)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    padding: '6px',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Send size={13} />
                  <span>Send Message</span>
                </button>

                <button
                  onClick={() => setTerminatingSessionId(s.sessionId)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: 'rgba(236, 143, 149, 0.1)',
                    color: 'var(--danger, #EC8F95)',
                    border: '1px solid var(--danger, #EC8F95)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    padding: '6px 10px',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Power size={13} />
                  <span>End Stream</span>
                </button>
              </div>
            </div>
          );
        }))}
      </div>

      {/* Send In-Stream Message Modal */}
      {selectedSessionForMessage && (
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
          <form
            onSubmit={handleSendMessage}
            style={{
              width: '440px',
              maxWidth: '92vw',
              background: 'var(--surface-1, #151A21)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-md, 12px)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-1, #E4E8EE)', fontSize: '1rem' }}>
                Broadcast Message to Viewer
              </h3>
              <button
                type="button"
                onClick={() => setSelectedSessionForMessage(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              Send an overlay toast message to <strong>{selectedSessionForMessage.profileName}</strong> watching <em>{selectedSessionForMessage.title}</em>.
            </p>

            <textarea
              required
              rows={3}
              placeholder="e.g. Platform update: scheduled stream maintenance in 10 minutes."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              style={{
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-1, #E4E8EE)',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '0.84rem',
                resize: 'none'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSelectedSessionForMessage(null)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-2, #A9B2C0)',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  background: 'var(--accent, #8CA9EE)',
                  border: 'none',
                  color: 'var(--on-accent, #0C1424)',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Send Message
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Termination Modal */}
      {terminatingSessionId && (
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
            width: '420px',
            maxWidth: '92vw',
            background: 'var(--surface-1, #151A21)',
            border: '1px solid var(--danger, #EC8F95)',
            borderRadius: 'var(--radius-md, 12px)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h3 style={{ margin: 0, color: 'var(--danger, #EC8F95)', fontSize: '1rem' }}>
              Terminate Stream Session
            </h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-2, #A9B2C0)' }}>
              Are you sure you want to forcibly disconnect this viewer's stream?
            </p>
            <input
              type="text"
              value={terminationReason}
              onChange={e => setTerminationReason(e.target.value)}
              placeholder="Reason for termination"
              style={{
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-1, #E4E8EE)',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '0.82rem'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setTerminatingSessionId(null)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-2, #A9B2C0)',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTerminate}
                style={{
                  background: 'var(--danger, #EC8F95)',
                  border: 'none',
                  color: '#000',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Terminate Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
