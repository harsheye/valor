import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ConnectionState } from './useAdminRealtime';

interface ConnectionStatusProps {
  status: ConnectionState;
  reconnectAttempt: number;
  nextRetrySeconds: number;
  missedEventsApplied: number;
  isCatchingUp: boolean;
  onManualReconnect: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  reconnectAttempt,
  nextRetrySeconds,
  missedEventsApplied,
  isCatchingUp,
  onManualReconnect
}) => {
  const [showAppliedToast, setShowAppliedToast] = useState(false);

  useEffect(() => {
    if (missedEventsApplied > 0 && status === 'live') {
      setShowAppliedToast(true);
      const t = setTimeout(() => setShowAppliedToast(false), 5000);
      return () => clearTimeout(t);
    }
  }, [missedEventsApplied, status]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {/* Catching Up Banner */}
      {isCatchingUp && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(227, 189, 122, 0.15)',
          color: 'var(--warning, #E3BD7A)',
          border: '1px solid var(--warning, #E3BD7A)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm, 6px)',
          fontSize: '0.74rem',
          fontWeight: 600,
          animation: 'pulse 1.5s infinite'
        }}>
          <RefreshCw size={12} className="spin-slow" />
          <span>Catching up…</span>
        </div>
      )}

      {/* Missed Events Replayed Pill */}
      {showAppliedToast && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          background: 'rgba(134, 205, 166, 0.18)',
          color: 'var(--success, #86CDA6)',
          border: '1px solid var(--success, #86CDA6)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm, 6px)',
          fontSize: '0.74rem',
          fontWeight: 600
        }}>
          <CheckCircle2 size={12} />
          <span>Resynced {missedEventsApplied} missed events</span>
        </div>
      )}

      {/* Main Connection Indicator */}
      {status === 'live' && (
        <div
          title="Connected to real-time event bus via SSE"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(134, 205, 166, 0.1)',
            border: '1px solid rgba(134, 205, 166, 0.3)',
            color: 'var(--success, #86CDA6)',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600
          }}
        >
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--success, #86CDA6)',
            boxShadow: '0 0 8px var(--success, #86CDA6)',
            display: 'inline-block'
          }} />
          <span>Live</span>
        </div>
      )}

      {status === 'reconnecting' && (
        <button
          onClick={onManualReconnect}
          title="Click to reconnect immediately"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(227, 189, 122, 0.12)',
            border: '1px solid var(--warning, #E3BD7A)',
            color: 'var(--warning, #E3BD7A)',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={12} className="spin-slow" />
          <span>Reconnecting ({reconnectAttempt}… {nextRetrySeconds}s)</span>
        </button>
      )}

      {status === 'offline' && (
        <button
          onClick={onManualReconnect}
          title="Connection offline. Click to retry connection."
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(236, 143, 149, 0.14)',
            border: '1px solid var(--danger, #EC8F95)',
            color: 'var(--danger, #EC8F95)',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <WifiOff size={12} />
          <span>Offline (Reconnect)</span>
        </button>
      )}
    </div>
  );
};
