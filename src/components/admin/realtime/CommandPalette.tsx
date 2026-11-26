import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Activity, 
  Users, 
  Server, 
  HardDrive, 
  Shield, 
  BarChart3, 
  Radio, 
  Globe, 
  AlertTriangle, 
  Lock, 
  Film, 
  Layers, 
  Wrench, 
  Database,
  ArrowRight
} from 'lucide-react';

interface CommandItem {
  id: string;
  category: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tabId: string) => void;
  devices: any[];
  sessions: any[];
  onTriggerSeed?: () => void;
  onSignOutEverywhere?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  devices,
  sessions,
  onTriggerSeed,
  onSignOutEverywhere
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const commandItems: CommandItem[] = [
    // Tabs Navigation
    { id: 'tab-overview', category: 'Navigation', label: 'Overview Dashboard', sublabel: 'Metrics & health', icon: <Activity size={16} />, action: () => onNavigateTab('overview') },
    { id: 'tab-traffic', category: 'Navigation', label: 'Traffic Feed', sublabel: 'Live stream & requests', icon: <Layers size={16} />, action: () => onNavigateTab('traffic') },
    { id: 'tab-devices', category: 'Navigation', label: 'Visitors & Devices', sublabel: 'Device intelligence', icon: <Users size={16} />, action: () => onNavigateTab('devices') },
    { id: 'tab-sessions', category: 'Navigation', label: 'Open Sessions', sublabel: 'Live streams & message viewer', icon: <Radio size={16} />, action: () => onNavigateTab('sessions') },
    { id: 'tab-webhooks', category: 'Navigation', label: 'Webhooks & Outbound', sublabel: 'Deliveries, retries & endpoints', icon: <Radio size={16} />, action: () => onNavigateTab('webhooks') },
    { id: 'tab-thirdparty', category: 'Navigation', label: '3rd-Party APIs', sublabel: 'Trakt, TMDB, VLR.gg quotas', icon: <Globe size={16} />, action: () => onNavigateTab('thirdparty') },
    { id: 'tab-users', category: 'Navigation', label: 'Registered Accounts', sublabel: 'Profiles & roles', icon: <Shield size={16} />, action: () => onNavigateTab('users') },
    { id: 'tab-alerts', category: 'Navigation', label: 'Alert Rules & Notifications', sublabel: 'Cooldowns & severity', icon: <AlertTriangle size={16} />, action: () => onNavigateTab('alerts') },
    { id: 'tab-security', category: 'Navigation', label: 'Security & Access Control', sublabel: 'Block list & sessions', icon: <Lock size={16} />, action: () => onNavigateTab('security') },
    { id: 'tab-playback', category: 'Navigation', label: 'Playback Quality', sublabel: 'Bitrate, buffering & startup', icon: <Film size={16} />, action: () => onNavigateTab('playback') },
    { id: 'tab-content', category: 'Navigation', label: 'Content Insights', sublabel: 'Top titles & retention cohorts', icon: <BarChart3 size={16} />, action: () => onNavigateTab('content') },
    { id: 'tab-geo', category: 'Navigation', label: 'Geography & Traffic', sublabel: 'Countries & cities', icon: <Globe size={16} />, action: () => onNavigateTab('geo') },
    { id: 'tab-errors', category: 'Navigation', label: 'Error Tracking', sublabel: 'Grouped fingerprints', icon: <AlertTriangle size={16} />, action: () => onNavigateTab('errors') },
    { id: 'tab-infra', category: 'Navigation', label: 'Infrastructure Health', sublabel: 'Postgres & Redis metrics', icon: <Server size={16} />, action: () => onNavigateTab('infra') },
    { id: 'tab-audit', category: 'Navigation', label: 'Audit Log', sublabel: 'Admin actions history', icon: <Shield size={16} />, action: () => onNavigateTab('audit') },
    { id: 'tab-system', category: 'Navigation', label: 'System & Retention', sublabel: 'Maintenance & data policy', icon: <Wrench size={16} />, action: () => onNavigateTab('system') },

    // Quick Actions
    ...(onTriggerSeed ? [{ id: 'act-seed', category: 'Quick Actions', label: '⚡ Seed Realistic Demo Events', sublabel: 'Generate live event wave', icon: <Activity size={16} color="var(--accent, #8CA9EE)" />, action: onTriggerSeed }] : []),
    ...(onSignOutEverywhere ? [{ id: 'act-signout', category: 'Quick Actions', label: 'Sign Out Everywhere', sublabel: 'Revoke all admin sessions', icon: <Lock size={16} color="var(--danger, #EC8F95)" />, action: onSignOutEverywhere }] : [])
  ];

  // Append recent devices and sessions matching query
  if (query.trim()) {
    devices.slice(0, 5).forEach((d: any) => {
      commandItems.push({
        id: `dev-${d.deviceId}`,
        category: 'Devices',
        label: `Device: ${d.device || 'Desktop'} (${d.lastIp || d.deviceId})`,
        sublabel: `${d.city || ''} ${d.country || ''}`,
        icon: <Users size={16} />,
        action: () => onNavigateTab('devices')
      });
    });

    sessions.slice(0, 5).forEach((s: any) => {
      commandItems.push({
        id: `sess-${s.sessionId}`,
        category: 'Live Sessions',
        label: `Stream: ${s.title || s.sessionId}`,
        sublabel: `${s.profileName || 'Viewer'} on ${s.device || 'Screen'}`,
        icon: <Radio size={16} />,
        action: () => onNavigateTab('sessions')
      });
    });
  }

  const filteredItems = commandItems.filter(item => {
    if (!query.trim()) return item.category === 'Navigation' || item.category === 'Quick Actions';
    const q = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      (item.sublabel && item.sublabel.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(filteredItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(filteredItems.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--scrim, rgba(15, 18, 23, 0.75))',
        backdropFilter: 'blur(4px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '580px',
          maxWidth: '92vw',
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInRise 0.2s ease'
        }}
      >
        {/* Search Input Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border, #262D39)',
          background: 'var(--surface-2, #1B212A)'
        }}>
          <Search size={18} color="var(--accent, #8CA9EE)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tabs, devices, sessions, settings (or type a command)…"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-1, #E4E8EE)',
              fontSize: '0.95rem',
              fontFamily: 'inherit'
            }}
          />
          <kbd style={{
            background: 'var(--surface-3, #232B36)',
            border: '1px solid var(--border, #262D39)',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '0.72rem',
            color: 'var(--text-3, #8F99AA)'
          }}>
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '6px' }}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3, #8F99AA)', fontSize: '0.84rem' }}>
              No matching commands or entities found for "{query}"
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--accent-soft, rgba(140, 169, 238, 0.14))' : 'transparent',
                    border: isSelected ? '1px solid var(--accent, #8CA9EE)' : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: isSelected ? 'var(--accent, #8CA9EE)' : 'var(--text-2, #A9B2C0)' }}>
                      {item.icon}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                        {item.label}
                      </span>
                      {item.sublabel && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-3, #8F99AA)' }}>
                          {item.sublabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-3, #8F99AA)',
                      background: 'var(--surface-3, #232B36)',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      {item.category}
                    </span>
                    {isSelected && <ArrowRight size={14} color="var(--accent, #8CA9EE)" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div style={{
          padding: '8px 16px',
          background: 'var(--surface-2, #1B212A)',
          borderTop: '1px solid var(--border, #262D39)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          color: 'var(--text-3, #8F99AA)'
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span><kbd>↑↓</kbd> to navigate</span>
            <span><kbd>↵</kbd> to select</span>
            <span><kbd>ESC</kbd> to close</span>
          </div>
          <span>Valor Command Palette</span>
        </div>
      </div>
    </div>
  );
};
