import React, { useState } from 'react';
import { 
  Bell, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Clock, 
  Check, 
  SlidersHorizontal 
} from 'lucide-react';

export interface AlertItem {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  status: 'active' | 'acknowledged' | 'snoozed';
  createdAt: string;
  snoozedUntil?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
}

interface NotificationCenterProps {
  alerts: AlertItem[];
  unreadCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onMarkAllAsRead: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  alerts,
  unreadCount,
  isOpen,
  onToggle,
  onAcknowledge,
  onSnooze,
  onMarkAllAsRead
}) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [snoozeMenuOpenId, setSnoozeMenuOpenId] = useState<string | null>(null);

  const filteredAlerts = alerts.filter(a => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger Bell Button */}
      <button
        onClick={onToggle}
        title="Alert Notifications Center"
        aria-label={`Notifications: ${unreadCount} unread`}
        style={{
          position: 'relative',
          background: 'var(--surface-2, #1B212A)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-sm, 8px)',
          padding: '7px 9px',
          color: 'var(--text-1, #E4E8EE)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: 'var(--danger, #EC8F95)',
            color: '#000',
            fontSize: '0.68rem',
            fontWeight: 800,
            borderRadius: '999px',
            padding: '1px 5px',
            minWidth: '16px',
            textAlign: 'center'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Drawer */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '42px',
          right: 0,
          width: '380px',
          maxHeight: '520px',
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInRise 0.2s ease'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border, #262D39)',
            background: 'var(--surface-2, #1B212A)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1, #E4E8EE)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{
                  background: 'var(--accent-soft, rgba(140, 169, 238, 0.14))',
                  color: 'var(--accent, #8CA9EE)',
                  fontSize: '0.72rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontWeight: 600
                }}>
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllAsRead}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent, #8CA9EE)',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={onToggle}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Severity Filters */}
          <div style={{
            display: 'flex',
            gap: '6px',
            padding: '8px 16px',
            borderBottom: '1px solid var(--border, #262D39)',
            background: 'var(--surface-1, #151A21)',
            fontSize: '0.72rem'
          }}>
            {['all', 'critical', 'warning', 'info'].map(s => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                style={{
                  background: filterSeverity === s ? 'var(--accent, #8CA9EE)' : 'var(--surface-2, #1B212A)',
                  color: filterSeverity === s ? 'var(--on-accent, #0C1424)' : 'var(--text-2, #A9B2C0)',
                  border: 'none',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  textTransform: 'capitalize',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Alerts List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
            {filteredAlerts.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3, #8F99AA)', fontSize: '0.82rem' }}>
                <CheckCircle2 size={24} color="var(--success, #86CDA6)" style={{ margin: '0 auto 8px', display: 'block' }} />
                All clear! No active alerts.
              </div>
            ) : (
              filteredAlerts.map(a => {
                const isCritical = a.severity === 'critical';
                const isWarning = a.severity === 'warning';
                const color = isCritical ? 'var(--danger, #EC8F95)' : (isWarning ? 'var(--warning, #E3BD7A)' : 'var(--accent, #8CA9EE)');

                return (
                  <div
                    key={a.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      background: a.status === 'active' ? 'var(--surface-2, #1B212A)' : 'transparent',
                      borderLeft: `3px solid ${color}`,
                      marginBottom: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-1, #E4E8EE)' }}>
                        {a.title}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-3, #8F99AA)' }}>
                        {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-2, #A9B2C0)', lineHeight: 1.35 }}>
                      {a.message}
                    </p>

                    {/* Status & Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        color
                      }}>
                        {a.status}
                      </span>

                      {a.status === 'active' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                          <button
                            onClick={() => onAcknowledge(a.id)}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border, #262D39)',
                              color: 'var(--text-2, #A9B2C0)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            Ack
                          </button>

                          <button
                            onClick={() => setSnoozeMenuOpenId(prev => prev === a.id ? null : a.id)}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border, #262D39)',
                              color: 'var(--text-2, #A9B2C0)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            Snooze
                          </button>

                          {/* Snooze Options Menu */}
                          {snoozeMenuOpenId === a.id && (
                            <div style={{
                              position: 'absolute',
                              bottom: '24px',
                              right: 0,
                              background: 'var(--surface-3, #232B36)',
                              border: '1px solid var(--border, #262D39)',
                              borderRadius: '4px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                              zIndex: 10,
                              display: 'flex',
                              flexDirection: 'column',
                              padding: '4px'
                            }}>
                              {[
                                { label: '15 mins', val: 15 },
                                { label: '1 hour', val: 60 },
                                { label: '24 hours', val: 1440 }
                              ].map(opt => (
                                <button
                                  key={opt.val}
                                  onClick={() => {
                                    onSnooze(a.id, opt.val);
                                    setSnoozeMenuOpenId(null);
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-1, #E4E8EE)',
                                    padding: '4px 8px',
                                    fontSize: '0.7rem',
                                    textAlign: 'left',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
