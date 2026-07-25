import React from 'react';
import { Home, History, Play, Settings } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: 'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr') => void;
  setSelectedActor: (actor: any) => void;
  setSelectedDetailsMedia: (media: any) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  setSelectedActor,
  setSelectedDetailsMedia,
}) => {
  const navigateTo = (tab: 'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr') => {
    setSelectedActor(null);
    setSelectedDetailsMedia(null);
    setActiveTab(tab);
  };

  return (
    <div className="mobile-bottom-nav">
      <button 
        className={`mobile-bottom-nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => navigateTo('home')}
      >
        <Home size={20} />
        <span>Home</span>
      </button>
      <button 
        className={`mobile-bottom-nav-item ${activeTab === 'history' ? 'active' : ''}`}
        onClick={() => navigateTo('history')}
      >
        <History size={20} />
        <span>History</span>
      </button>
      <button 
        className={`mobile-bottom-nav-item ${activeTab === 'online' ? 'active' : ''}`}
        onClick={() => navigateTo('online')}
      >
        <Play size={20} />
        <span>Online</span>
      </button>
      <button 
        className={`mobile-bottom-nav-item ${activeTab === 'library' ? 'active' : ''}`}
        onClick={() => navigateTo('library')}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 2px auto' }}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>Library</span>
      </button>
      <button 
        className={`mobile-bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => navigateTo('settings')}
      >
        <Settings size={20} />
        <span>Settings</span>
      </button>
    </div>
  );
};
