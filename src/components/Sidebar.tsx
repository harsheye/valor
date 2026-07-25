import React from 'react';
import { Home, History, Play, Settings, Film, X } from 'lucide-react';
import type { VideoItem } from '../types/media';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr') => void;
  isSidebarCollapsed: boolean;
  videos: VideoItem[];
  setSelectedActor: (actor: any) => void;
  setSelectedDetailsMedia: (media: any) => void;
  handlePlayVideo: (video: VideoItem) => void;
  handleRemoveVideo: (id: string, e: React.MouseEvent) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isSidebarCollapsed,
  videos,
  setSelectedActor,
  setSelectedDetailsMedia,
  handlePlayVideo,
  handleRemoveVideo,
}) => {
  const navigateTo = (tab: 'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr') => {
    setSelectedActor(null);
    setSelectedDetailsMedia(null);
    setActiveTab(tab);
  };

  return (
    <aside className={`app-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">{isSidebarCollapsed ? 'V' : 'Valor'}</div>
      </div>
      
      <nav className="sidebar-menu">
        <button 
          className={`sidebar-menu-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => navigateTo('home')}
          title="Select Media"
        >
          <Home size={20} />
          <span className="sidebar-menu-text">Select Media</span>
        </button>
        <button 
          className={`sidebar-menu-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => navigateTo('history')}
          title="History"
        >
          <History size={20} />
          <span className="sidebar-menu-text">History ({videos.length})</span>
        </button>
        <button 
          className={`sidebar-menu-item ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => navigateTo('library')}
          title="Library"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span className="sidebar-menu-text">Library</span>
        </button>
        <button 
          className={`sidebar-menu-item ${activeTab === 'online' ? 'active' : ''}`}
          onClick={() => navigateTo('online')}
          title="Online Stream"
        >
          <Play size={20} />
          <span className="sidebar-menu-text">Online Stream</span>
        </button>
      </nav>

      <div className="sidebar-history-section">
        <div className="sidebar-history-title">
          <h3>Recent Playback</h3>
        </div>
        {videos.length === 0 ? (
          <div className="sidebar-empty-history">
            <Film size={24} className="text-muted" />
            <span>No history yet</span>
          </div>
        ) : (
          <div className="sidebar-history-list">
            {videos.map((video) => (
              <div key={`sidebar-${video.id}`} className="sidebar-history-item" onClick={() => handlePlayVideo(video)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {video.posterPath && (
                  <img 
                    src={video.posterPath} 
                    alt="" 
                    crossOrigin="anonymous"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    style={{ width: '20px', height: '30px', borderRadius: '3px', objectFit: 'cover', flexShrink: 0 }} 
                  />
                )}
                <span className="sidebar-history-item-title" title={video.title} style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</span>
                <button 
                  className="sidebar-history-remove-btn" 
                  onClick={(e) => handleRemoveVideo(video.id, e)}
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar Footer - Settings */}
      <div className="sidebar-footer">
        <button 
          className={`sidebar-settings-btn ${activeTab === 'settings' ? 'active' : ''}`} 
          onClick={() => navigateTo('settings')} 
          title="Preferences"
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
