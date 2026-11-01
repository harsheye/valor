import React, { useState } from 'react';
import { Wrench, Megaphone, Plus, Trash2, Clock, Check, X, ShieldAlert } from 'lucide-react';

interface MaintenanceConfig {
  enabled: boolean;
  message: string;
  estimatedEndTime?: string | null;
  updatedAt: string;
  updatedBy: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  audience: 'all' | 'guests' | 'logged_in';
  dismissible: 'once' | 'daily' | 'never';
  startsAt: string;
  expiresAt: string;
  enabled: boolean;
}

interface MaintenanceBroadcastProps {
  maintenance: MaintenanceConfig;
  announcements: Announcement[];
  onUpdateMaintenance: (config: Partial<MaintenanceConfig>) => Promise<void>;
  onSaveAnnouncement: (ann: Partial<Announcement>) => Promise<void>;
  onDeleteAnnouncement: (id: string) => Promise<void>;
}

export const MaintenanceBroadcast: React.FC<MaintenanceBroadcastProps> = ({
  maintenance,
  announcements,
  onUpdateMaintenance,
  onSaveAnnouncement,
  onDeleteAnnouncement
}) => {
  const [mEnabled, setMEnabled] = useState(maintenance.enabled);
  const [mMessage, setMMessage] = useState(maintenance.message);
  const [mEta, setMEta] = useState(maintenance.estimatedEndTime || '');
  const [isSavingM, setIsSavingM] = useState(false);

  const [isAddAnnModalOpen, setIsAddAnnModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annMsg, setAnnMsg] = useState('');
  const [annAudience, setAnnAudience] = useState<'all' | 'guests' | 'logged_in'>('all');
  const [annDismiss, setAnnDismiss] = useState<'once' | 'daily' | 'never'>('daily');

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingM(true);
    try {
      await onUpdateMaintenance({
        enabled: mEnabled,
        message: mMessage,
        estimatedEndTime: mEta || null
      });
    } finally {
      setIsSavingM(false);
    }
  };

  const handleSaveNewAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMsg.trim()) return;
    await onSaveAnnouncement({
      title: annTitle.trim(),
      message: annMsg.trim(),
      audience: annAudience,
      dismissible: annDismiss,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      enabled: true
    });
    setAnnTitle('');
    setAnnMsg('');
    setIsAddAnnModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Maintenance Mode Panel */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wrench size={20} color={mEnabled ? 'var(--warning, #E3BD7A)' : 'var(--accent, #8CA9EE)'} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
                Platform Maintenance Mode
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)' }}>
                When active, non-admin visitors see a maintenance screen with custom message and ETA countdown.
              </span>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={mEnabled}
              onChange={e => setMEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--warning, #E3BD7A)' }}
            />
            <span style={{
              fontWeight: 700,
              fontSize: '0.84rem',
              color: mEnabled ? 'var(--warning, #E3BD7A)' : 'var(--text-3, #8F99AA)'
            }}>
              {mEnabled ? 'MAINTENANCE ACTIVE' : 'Platform Online'}
            </span>
          </label>
        </div>

        <form onSubmit={handleSaveMaintenance} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
            Maintenance Screen Message:
            <textarea
              rows={2}
              value={mMessage}
              onChange={e => setMMessage(e.target.value)}
              style={{
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-1, #E4E8EE)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.84rem',
                resize: 'none'
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)', maxWidth: '280px' }}>
            Estimated Completion Time (Optional):
            <input
              type="datetime-local"
              value={mEta}
              onChange={e => setMEta(e.target.value)}
              style={{
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-1, #E4E8EE)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem'
              }}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={isSavingM}
              style={{
                background: 'var(--accent, #8CA9EE)',
                color: 'var(--on-accent, #0C1424)',
                border: 'none',
                padding: '7px 18px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {isSavingM ? 'Saving…' : 'Save Maintenance Settings'}
            </button>
          </div>
        </form>
      </div>

      {/* Broadcast Announcements Panel */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Megaphone size={20} color="var(--accent, #8CA9EE)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
                Announcement Banners
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)' }}>
                Top-of-screen announcement banners targeted by audience with dismissal persistence rules.
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsAddAnnModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface-2, #1B212A)',
              color: 'var(--text-1, #E4E8EE)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-sm, 8px)',
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            <span>New Announcement</span>
          </button>
        </div>

        {/* Announcements List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {announcements.map(a => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                borderRadius: 'var(--radius-sm, 6px)',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-1, #E4E8EE)' }}>
                    {a.title}
                  </span>
                  <span style={{
                    fontSize: '0.68rem',
                    color: 'var(--accent, #8CA9EE)',
                    background: 'var(--accent-soft, rgba(140, 169, 238, 0.14))',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    fontWeight: 600
                  }}>
                    {a.audience}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-3, #8F99AA)' }}>
                    Dismissal: {a.dismissible}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-2, #A9B2C0)' }}>
                  {a.message}
                </p>
              </div>

              <button
                onClick={() => onDeleteAnnouncement(a.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--danger, #EC8F95)', cursor: 'pointer' }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add Announcement Modal */}
      {isAddAnnModalOpen && (
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
            onSubmit={handleSaveNewAnnouncement}
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
              <h3 style={{ margin: 0, color: 'var(--text-1, #E4E8EE)' }}>Create Announcement Banner</h3>
              <button
                type="button"
                onClick={() => setIsAddAnnModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              Banner Title:
              <input
                type="text"
                required
                placeholder="e.g. Scheduled Streaming Maintenance"
                value={annTitle}
                onChange={e => setAnnTitle(e.target.value)}
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
              Message Content:
              <textarea
                required
                rows={2}
                placeholder="e.g. New season releases will be streaming starting this Friday!"
                value={annMsg}
                onChange={e => setAnnMsg(e.target.value)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-1, #E4E8EE)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  resize: 'none'
                }}
              />
            </label>

            <div style={{ display: 'flex', gap: '10px' }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
                Target Audience:
                <select
                  value={annAudience}
                  onChange={e => setAnnAudience(e.target.value as any)}
                  style={{
                    background: 'var(--surface-2, #1B212A)',
                    border: '1px solid var(--border, #262D39)',
                    color: 'var(--text-1, #E4E8EE)',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm, 6px)'
                  }}
                >
                  <option value="all">All Visitors & Viewers</option>
                  <option value="guests">Guests Only</option>
                  <option value="logged_in">Logged In Accounts</option>
                </select>
              </label>

              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
                Dismissal Rule:
                <select
                  value={annDismiss}
                  onChange={e => setAnnDismiss(e.target.value as any)}
                  style={{
                    background: 'var(--surface-2, #1B212A)',
                    border: '1px solid var(--border, #262D39)',
                    color: 'var(--text-1, #E4E8EE)',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm, 6px)'
                  }}
                >
                  <option value="daily">Dismissible for 24 Hours</option>
                  <option value="once">Dismiss Permanently</option>
                  <option value="never">Non-Dismissible</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsAddAnnModalOpen(false)}
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
                Publish Banner
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
