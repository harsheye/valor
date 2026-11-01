import React, { useState, useEffect } from 'react';
import { Compass, History, Film, PlayCircle, Zap } from 'lucide-react';
import { sidecarService } from '../../services/remote/sidecarService';
import { featureFlagService } from '../../services/featureFlags';
import './streaming.css';

export type NavTab = 'home' | 'history' | 'library' | 'online' | 'companion' | 'settings';

interface NavProps {
  activeTab: string;
  onNavigate: (tab: NavTab) => void;
  historyCount?: number;
}

export const Nav: React.FC<NavProps> = ({
  activeTab,
  onNavigate,
  historyCount = 0
}) => {
  const [isSidecarActive, setIsSidecarActive] = useState<boolean>(() => sidecarService.isEnabled());
  const [features, setFeatures] = useState(() => featureFlagService.getFeatures());

  useEffect(() => {
    const unsub = sidecarService.subscribe((status) => {
      setIsSidecarActive(status.isAvailable);
    });
    const unsubFeat = featureFlagService.subscribe(() => {
      setFeatures({ ...featureFlagService.getFeatures() });
    });
    return () => {
      unsub();
      unsubFeat();
    };
  }, []);

  const navItems = [
    {
      id: 'home' as NavTab,
      label: 'Discover',
      icon: <Compass size={22} />
    },
    {
      id: 'history' as NavTab,
      label: historyCount > 0 ? `History (${historyCount})` : 'History',
      icon: <History size={22} />
    },
    {
      id: 'library' as NavTab,
      label: 'Library',
      icon: <Film size={22} />
    },
    {
      id: 'online' as NavTab,
      label: 'Stream',
      icon: <PlayCircle size={22} />
    },
    ...(features.localEngine.enabled ? [{
      id: 'companion' as NavTab,
      label: 'Local Engine',
      icon: (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={22} color={isSidecarActive ? 'var(--success)' : undefined} />
          {isSidecarActive && (
            <span
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--success)',
                boxShadow: '0 0 6px var(--success)'
              }}
            />
          )}
        </div>
      )
    }] : [])
  ];

  return (
    <nav
      className="streaming-nav-rail"
      aria-label="Main application navigation"
    >
      {/* Top Brand Logo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Valor Home"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--accent)',
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: '1.4rem',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1
          }}
        >
          V
        </button>
      </div>

      {/* Main Navigation Items */}
      <div className="streaming-nav-group">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`streaming-nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
