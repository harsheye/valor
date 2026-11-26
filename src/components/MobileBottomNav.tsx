import React from 'react';
import { Home, History, Film, Play } from 'lucide-react';
import './MobileBottomNav.css';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: 'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr' | 'companion') => void;
  setSelectedActor?: (actor: any) => void;
  setSelectedDetailsMedia?: (media: any) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  setSelectedActor,
  setSelectedDetailsMedia,
}) => {
  const navigateTo = (tab: 'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr' | 'companion') => {
    if (setSelectedActor) setSelectedActor(null);
    if (setSelectedDetailsMedia) setSelectedDetailsMedia(null);
    setActiveTab(tab);
  };

  const navItems = [
    { id: 'home' as const, label: 'Select Media', icon: <Home size={22} /> },
    { id: 'history' as const, label: 'History', icon: <History size={22} /> },
    { id: 'library' as const, label: 'Library', icon: <Film size={22} /> },
    { id: 'online' as const, label: 'Stream', icon: <Play size={22} /> },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`mbn-item ${isActive ? 'active' : ''}`}
            onClick={() => navigateTo(item.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="mbn-icon">{item.icon}</div>
            <span className="mbn-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;
