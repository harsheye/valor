import React, { useState, useEffect, useRef } from 'react';
import { Home, History, Film, PlayCircle, Zap, Settings, Play, X, Palette, Check } from 'lucide-react';
import { ValorVIcon } from './ui/ValorVIcon';
import type { VideoItem } from '../types/media';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { smartTitleCase } from '../utils/libraryViewModel';
import { sidecarService } from '../services/remote/sidecarService';
import { featureFlagService } from '../services/featureFlags';
import './streaming/streaming.css';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr' | 'companion') => void;
  isSidebarCollapsed: boolean;
  videos: VideoItem[];
  setSelectedActor: (actor: any) => void;
  setSelectedDetailsMedia: (media: any) => void;
  handlePlayVideo: (video: VideoItem) => void;
  handleRemoveVideo: (id: string, e: React.MouseEvent) => void;
}

const QUICK_THEMES = [
  { id: 'midnight-slate', name: 'Midnight Slate', desc: 'Cool dark slate (default)', bg: '#0F1217', dot: '#8CA9EE' },
  { id: 'ember-night', name: 'Ember Night', desc: 'Warm amber charcoal', bg: '#14110F', dot: '#E5A86D' },
  { id: 'forest-mist', name: 'Forest Mist', desc: 'Muted sage green', bg: '#0E1412', dot: '#7CC3A1' },
  { id: 'valor-crimson', name: 'Valor Crimson', desc: 'Softened red brand', bg: '#131114', dot: '#E57C86' },
  { id: 'black-ops', name: 'Black-Ops OLED', desc: 'True-black OLED (#000000)', bg: '#000000', dot: '#e53950' },
  { id: 'soft-paper', name: 'Soft Paper', desc: 'Warm light paper', bg: '#ECE7DD', dot: '#3A5CB0' },
  { id: 'dark', name: 'Valor Cyber Dark', desc: 'Modern canvas & coral', bg: '#0B0C10', dot: '#FF6B7A' },
  { id: 'light', name: 'Studio Light', desc: 'Crisp white & crimson', bg: '#FFFFFF', dot: '#C4263A' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isSidebarCollapsed,
  videos,
  setSelectedActor,
  setSelectedDetailsMedia,
  handlePlayVideo,
  handleRemoveVideo
}) => {
  const [isSidecarActive, setIsSidecarActive] = useState<boolean>(() => sidecarService.isEnabled());
  const [features, setFeatures] = useState(() => featureFlagService.getFeatures());
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return document.documentElement.getAttribute('data-theme') || 'midnight-slate';
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    if (isThemeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isThemeMenuOpen]);

  const handleSelectTheme = (themeId: string) => {
    let resolved = themeId;
    if (themeId === 'auto') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolved = dark ? 'midnight-slate' : 'soft-paper';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    try {
      const raw = localStorage.getItem('valor_settings');
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.theme = themeId;
      localStorage.setItem('valor_settings', JSON.stringify(parsed));
    } catch {}
    setCurrentTheme(themeId);
    setIsThemeMenuOpen(false);
  };

  const navigateTo = (tab: 'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr' | 'companion') => {
    setSelectedActor(null);
    setSelectedDetailsMedia(null);
    setActiveTab(tab);
  };

  // When collapsed (only in Online streaming/details mode), render the 72px icon rail
  if (isSidebarCollapsed) {
    const collapsedNavItems = [
      { id: 'home' as const, label: 'Discover', icon: <Home size={22} /> },
      { id: 'history' as const, label: videos.length > 0 ? `History (${videos.length})` : 'History', icon: <History size={22} /> },
      { id: 'library' as const, label: 'Library', icon: <Film size={22} /> },
      { 
        id: 'online' as const, 
        label: !features.onlineStream.enabled ? 'Stream (Offline)' : 'Stream', 
        icon: <PlayCircle size={22} color={!features.onlineStream.enabled ? 'var(--text-3)' : undefined} /> 
      },
      ...(features.localEngine.enabled ? [{
        id: 'companion' as const,
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
      <aside
        className="app-sidebar collapsed streaming-nav-rail"
        aria-label="Main application navigation"
      >
        {/* Top Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
          <button
            type="button"
            onClick={() => navigateTo('home')}
            aria-label="Valor Home"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1
            }}
          >
            <ValorVIcon width={24} height={26} />
          </button>
        </div>

        {/* Shrunk Nav Rail Items */}
        <nav className="streaming-nav-group" aria-label="Sections">
          {collapsedNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`streaming-nav-item ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
              >
                {item.icon}
              </button>
            );
          })}
        </nav>

        {/* Bottom Controls: Theme & Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', position: 'relative' }} ref={themeMenuRef}>
          <button
            type="button"
            onClick={() => setIsThemeMenuOpen(prev => !prev)}
            className={`streaming-nav-item ${isThemeMenuOpen ? 'active' : ''}`}
            aria-label="Color themes"
            title="Theme Palette"
          >
            <Palette size={20} />
          </button>

          {isThemeMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '0',
                left: 'calc(100% + 12px)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2)',
                boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minWidth: '200px',
                zIndex: 9999
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', padding: '4px 8px', letterSpacing: '0.5px' }}>
                Color Themes
              </div>
              {QUICK_THEMES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTheme(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: currentTheme === t.id ? 'var(--surface-3)' : 'transparent',
                    border: 'none',
                    color: 'var(--text-1)',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => { if (currentTheme !== t.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={(e) => { if (currentTheme !== t.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: t.bg, border: `2px solid ${t.dot}`, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: currentTheme === t.id ? 600 : 400 }}>{t.name}</span>
                  {currentTheme === t.id && <Check size={14} color="var(--accent)" />}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigateTo('settings')}
            className={`streaming-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </aside>
    );
  }

  // When NOT collapsed (home, history, library, companion, settings): full 280px sidebar
  return (
    <aside className="app-sidebar" aria-label="Main application navigation">
      <div className="sidebar-header">
        <button
          type="button"
          onClick={() => navigateTo('home')}
          aria-label="Valor Home"
          style={{
            background: 'transparent',
            border: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left'
          }}
        >
          <ValorVIcon width={22} height={24} style={{ marginRight: '2px' }} />
          <div className="sidebar-logo">alor</div>
        </button>
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
          <Film size={20} />
          <span className="sidebar-menu-text">Library</span>
        </button>

        <button
          className={`sidebar-menu-item ${activeTab === 'online' ? 'active' : ''}`}
          onClick={() => navigateTo('online')}
          title={!features.onlineStream.enabled ? 'Online Stream (Under Construction)' : 'Online Stream'}
        >
          <Play size={20} color={!features.onlineStream.enabled ? 'var(--text-3)' : undefined} />
          <span className="sidebar-menu-text">Online Stream</span>
          {!features.onlineStream.enabled && (
            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-3)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
              Offline
            </span>
          )}
        </button>

        {features.localEngine.enabled && (
          <button
            className={`sidebar-menu-item ${activeTab === 'companion' ? 'active' : ''}`}
            onClick={() => navigateTo('companion')}
            title="Local Companion Engine"
          >
            <Zap size={20} color={isSidecarActive ? 'var(--success)' : undefined} />
            <span className="sidebar-menu-text">Local Engine</span>
            {isSidecarActive && (
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--success)',
                  boxShadow: '0 0 8px var(--success)',
                  marginLeft: 'auto',
                  flexShrink: 0
                }}
              />
            )}
          </button>
        )}
      </nav>

      <div className="sidebar-history-section">
        <div className="sidebar-history-title">
          <h3>Recent playback</h3>
        </div>
        {videos.length === 0 ? (
          <div className="sidebar-empty-history">
            <Film size={24} className="text-muted" />
            <span>No history yet</span>
          </div>
        ) : (
          <div className="sidebar-history-list">
            {videos.slice(0, 3).map((video) => {
              const info = classifyVideoTitle(video.title);
              let cleaned = info.displayTitle;
              if (info.type === 'series' && info.season !== undefined && info.episode !== undefined) {
                const sTitle = smartTitleCase(info.seriesTitle || 'Unknown Series').replace(/\s*\(\d{4}\)$/, '').trim();
                const sStr = String(info.season).padStart(2, '0');
                const eStr = String(info.episode).padStart(2, '0');
                cleaned = `${sTitle} S${sStr}E${eStr}`;
              } else {
                const base = smartTitleCase(info.cleanTitle || video.title);
                cleaned = info.year ? `${base} (${info.year})` : base;
              }
              return (
                <div
                  key={`sidebar-${video.id}`}
                  className="sidebar-history-item"
                  onClick={() => handlePlayVideo(video)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, width: '100%' }}
                >
                  {video.posterPath && (
                    <img
                      src={video.posterPath}
                      alt=""
                      crossOrigin="anonymous"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      style={{ width: '20px', height: '30px', borderRadius: '3px', objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <span
                    className="sidebar-history-item-title"
                    title={video.title}
                    style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {cleaned}
                  </span>
                  <button
                    className="sidebar-history-remove-btn"
                    onClick={(e) => handleRemoveVideo(video.id, e)}
                    aria-label={`Remove ${cleaned} from history`}
                    title="Remove from history"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sidebar Footer with Theme Picker & Settings */}
      <div className="sidebar-footer" style={{ padding: '0.75rem 0 0 0', display: 'flex', gap: '8px', position: 'relative' }} ref={themeMenuRef}>
        <button
          className="sidebar-settings-btn"
          onClick={() => setIsThemeMenuOpen(prev => !prev)}
          title="Change Color Theme"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <Palette size={16} />
          <span>Theme</span>
        </button>

        {isThemeMenuOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              left: 0,
              width: '100%',
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              zIndex: 9999
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', padding: '4px 8px', letterSpacing: '0.5px' }}>
              Color Themes
            </div>
            {QUICK_THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTheme(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '7px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: currentTheme === t.id ? 'var(--surface-3)' : 'transparent',
                  border: 'none',
                  color: 'var(--text-1)',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => { if (currentTheme !== t.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (currentTheme !== t.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: t.bg, border: `2px solid ${t.dot}`, flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: currentTheme === t.id ? 600 : 400 }}>{t.name}</span>
                {currentTheme === t.id && <Check size={14} color="var(--accent)" />}
              </button>
            ))}
          </div>
        )}

        <button
          className={`sidebar-settings-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => navigateTo('settings')}
          title="Preferences"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
