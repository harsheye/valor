import React, { useState } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  Plus, 
  Trash2, 
  Lock, 
  Globe, 
  Laptop, 
  AlertTriangle, 
  Check, 
  X,
  LogOut,
  Users
} from 'lucide-react';

export interface BlockListItem {
  id: string;
  type: 'ip' | 'cidr' | 'device_id' | 'country';
  value: string;
  reason: string;
  expiresAt?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AutoBlockSuggestion {
  ip: string;
  count: number;
  reasons: string[];
  severity: string;
  lastSeen: string;
}

export interface AdminSession {
  id: string;
  username: string;
  role: 'owner' | 'admin' | 'viewer';
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent?: boolean;
}

interface BlockListManagerProps {
  blockList: BlockListItem[];
  suggestions: AutoBlockSuggestion[];
  adminSessions: AdminSession[];
  onBlock: (item: { type: string; value: string; reason: string; durationHours?: number }) => Promise<void>;
  onUnblock: (id: string) => Promise<void>;
  onDismissSuggestion: (ip: string) => Promise<void>;
  onSignOutEverywhere: () => Promise<void>;
}

export const BlockListManager: React.FC<BlockListManagerProps> = ({
  blockList,
  suggestions,
  adminSessions,
  onBlock,
  onUnblock,
  onDismissSuggestion,
  onSignOutEverywhere
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'blocklist' | 'sessions' | 'rules'>('blocklist');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newType, setNewType] = useState<'ip' | 'cidr' | 'device_id' | 'country'>('ip');
  const [newValue, setNewValue] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newDuration, setNewDuration] = useState<number | ''>('');
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [confirmUnblockId, setConfirmUnblockId] = useState<string | null>(null);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) return;
    await onBlock({
      type: newType,
      value: newValue.trim(),
      reason: newReason.trim() || 'Manual administrative action',
      durationHours: newDuration ? Number(newDuration) : undefined
    });
    setNewValue('');
    setNewReason('');
    setNewDuration('');
    setIsAddModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{
          display: 'flex',
          background: 'var(--surface-2, #1B212A)',
          padding: '3px',
          borderRadius: 'var(--radius-sm, 8px)',
          border: '1px solid var(--border, #262D39)'
        }}>
          {[
            { id: 'blocklist', label: 'Security Block List' },
            { id: 'sessions', label: `Active Admin Sessions (${adminSessions.length})` },
            { id: 'rules', label: 'Rate Limiting & 2FA' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              style={{
                background: activeSubTab === tab.id ? 'var(--accent, #8CA9EE)' : 'transparent',
                color: activeSubTab === tab.id ? 'var(--on-accent, #0C1424)' : 'var(--text-2, #A9B2C0)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSubTab === 'blocklist' && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--danger, #EC8F95)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-sm, 8px)',
              padding: '7px 14px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Plus size={15} />
            <span>Block IP / CIDR / Device</span>
          </button>
        )}

        {activeSubTab === 'sessions' && (
          <button
            onClick={() => setConfirmSignOutOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(236, 143, 149, 0.15)',
              border: '1px solid var(--danger, #EC8F95)',
              color: 'var(--danger, #EC8F95)',
              borderRadius: 'var(--radius-sm, 8px)',
              padding: '7px 14px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <LogOut size={15} />
            <span>Sign Out Everywhere</span>
          </button>
        )}
      </div>

      {/* Auto-Block Suggestions Banner */}
      {suggestions.length > 0 && activeSubTab === 'blocklist' && (
        <div style={{
          background: 'rgba(227, 189, 122, 0.1)',
          border: '1px solid var(--warning, #E3BD7A)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning, #E3BD7A)', fontWeight: 700, fontSize: '0.88rem' }}>
            <AlertTriangle size={16} />
            <span>Automated Shield: Suspicious Traffic Detected ({suggestions.length} suggestions)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {suggestions.map(s => (
              <div
                key={s.ip}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface-2, #1B212A)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8rem'
                }}
              >
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--text-1, #E4E8EE)' }}>{s.ip}</span>
                  <span style={{ margin: '0 8px', color: 'var(--text-3, #8F99AA)' }}>•</span>
                  <span style={{ color: 'var(--text-2, #A9B2C0)' }}>{s.reasons.join(', ')} ({s.count} events)</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => onBlock({ type: 'ip', value: s.ip, reason: `Auto-block: ${s.reasons.join(', ')}` })}
                    style={{
                      background: 'var(--danger, #EC8F95)',
                      color: '#000',
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Block IP
                  </button>
                  <button
                    onClick={() => onDismissSuggestion(s.ip)}
                    style={{
                      background: 'transparent',
                      color: 'var(--text-3, #8F99AA)',
                      border: '1px solid var(--border, #262D39)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.74rem',
                      cursor: 'pointer'
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub Tab: Block List */}
      {activeSubTab === 'blocklist' && (
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2, #1B212A)', borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
                <th style={{ padding: '10px 14px' }}>Target Type</th>
                <th style={{ padding: '10px 14px' }}>Target Value</th>
                <th style={{ padding: '10px 14px' }}>Reason</th>
                <th style={{ padding: '10px 14px' }}>Expires</th>
                <th style={{ padding: '10px 14px' }}>Created By</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {blockList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--text-3, #8F99AA)' }}>
                    No entries in block list. All addresses and devices permitted.
                  </td>
                </tr>
              ) : (
                blockList.map(b => (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--border, #262D39)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        background: 'var(--surface-3, #232B36)',
                        color: 'var(--text-2, #A9B2C0)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}>
                        {b.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                      <code>{b.value}</code>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-2, #A9B2C0)' }}>
                      {b.reason}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-3, #8F99AA)' }}>
                      {b.expiresAt ? new Date(b.expiresAt).toLocaleString() : 'Permanent'}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-3, #8F99AA)' }}>
                      {b.createdBy}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      {confirmUnblockId === b.id ? (
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            onClick={() => {
                              onUnblock(b.id);
                              setConfirmUnblockId(null);
                            }}
                            style={{
                              background: 'var(--success, #86CDA6)',
                              color: '#000',
                              border: 'none',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmUnblockId(null)}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border, #262D39)',
                              color: 'var(--text-3, #8F99AA)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmUnblockId(b.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border, #262D39)',
                            color: 'var(--text-2, #A9B2C0)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            cursor: 'pointer'
                          }}
                        >
                          Unblock
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub Tab: Active Admin Sessions */}
      {activeSubTab === 'sessions' && (
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2, #1B212A)', borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
                <th style={{ padding: '10px 14px' }}>Admin User</th>
                <th style={{ padding: '10px 14px' }}>Role</th>
                <th style={{ padding: '10px 14px' }}>IP Address</th>
                <th style={{ padding: '10px 14px' }}>Browser / OS</th>
                <th style={{ padding: '10px 14px' }}>Logged In</th>
                <th style={{ padding: '10px 14px' }}>Current</th>
              </tr>
            </thead>
            <tbody>
              {adminSessions.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border, #262D39)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                    {s.username}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      background: 'var(--accent-soft, rgba(140, 169, 238, 0.14))',
                      color: 'var(--accent, #8CA9EE)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'uppercase'
                    }}>
                      {s.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-2, #A9B2C0)' }}>
                    <code>{s.ip}</code>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-3, #8F99AA)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.userAgent}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-3, #8F99AA)' }}>
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {s.isCurrent ? (
                      <span style={{ color: 'var(--success, #86CDA6)', fontWeight: 700, fontSize: '0.74rem' }}>
                        ● This Session
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-3, #8F99AA)', fontSize: '0.74rem' }}>Other Device</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub Tab: Rate Limiting & 2FA */}
      {activeSubTab === 'rules' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {/* Rate Limiting */}
          <div style={{
            background: 'var(--surface-1, #151A21)',
            border: '1px solid var(--border, #262D39)',
            borderRadius: 'var(--radius-md, 12px)',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
              Per-IP Rate Limiting
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)', lineHeight: 1.4 }}>
              Protects endpoints from scraping and DDoS attacks. IPs exceeding threshold are temporarily rate-limited with HTTP 429.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-1, #E4E8EE)', fontWeight: 600 }}>180 requests / minute</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--success, #86CDA6)', background: 'rgba(134, 205, 166, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>Active</span>
            </div>
          </div>

          {/* 2FA Status */}
          <div style={{
            background: 'var(--surface-1, #151A21)',
            border: '1px solid var(--border, #262D39)',
            borderRadius: 'var(--radius-md, 12px)',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
              Two-Factor Authentication (2FA)
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)', lineHeight: 1.4 }}>
              Requires time-based one-time password (TOTP) from an authenticator app for admin sign-in.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-1, #E4E8EE)', fontWeight: 600 }}>Enforced for Owner & Admins</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--accent, #8CA9EE)', background: 'rgba(140, 169, 238, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>TOTP Enabled</span>
            </div>
          </div>
        </div>
      )}

      {/* Add Block Modal */}
      {isAddModalOpen && (
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
            onSubmit={handleAddSubmit}
            style={{
              width: '460px',
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
              <h3 style={{ margin: 0, color: 'var(--text-1, #E4E8EE)' }}>Add to Block List</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              Target Type:
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as any)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-1, #E4E8EE)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm, 6px)'
                }}
              >
                <option value="ip">Single IP Address</option>
                <option value="cidr">CIDR Subnet Range</option>
                <option value="device_id">Device Fingerprint ID</option>
                <option value="country">Country Code (2-letter ISO)</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              Value:
              <input
                type="text"
                required
                placeholder={newType === 'ip' ? '198.51.100.42' : (newType === 'cidr' ? '203.0.113.0/24' : (newType === 'country' ? 'RU' : 'dev_xyz'))}
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-1, #E4E8EE)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm, 6px)'
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              Reason for Block:
              <input
                type="text"
                required
                placeholder="e.g. Malicious scraper brute-force"
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-1, #E4E8EE)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm, 6px)'
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              Duration (Hours, leave blank for permanent):
              <input
                type="number"
                placeholder="e.g. 24 or leave empty"
                value={newDuration}
                onChange={e => setNewDuration(e.target.value === '' ? '' : Number(e.target.value))}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-1, #E4E8EE)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm, 6px)'
                }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-2, #A9B2C0)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  background: 'var(--danger, #EC8F95)',
                  border: 'none',
                  color: '#000',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 16px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Block Target
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Sign Out Everywhere Modal */}
      {confirmSignOutOpen && (
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
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <h3 style={{ margin: 0, color: 'var(--danger, #EC8F95)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} />
              Confirm Sign Out Everywhere
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2, #A9B2C0)', lineHeight: 1.4 }}>
              This will revoke all active admin access tokens across all devices immediately. You will be required to log in again.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setConfirmSignOutOpen(false)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-2, #A9B2C0)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onSignOutEverywhere();
                  setConfirmSignOutOpen(false);
                }}
                style={{
                  background: 'var(--danger, #EC8F95)',
                  border: 'none',
                  color: '#000',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 16px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Sign Out Everywhere
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
