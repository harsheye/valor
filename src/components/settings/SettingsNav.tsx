import React from 'react';
import { 
  Sun, Captions, Pause, Keyboard, LayoutGrid, 
  Database, Link2, Loader2, Zap 
} from 'lucide-react';

export type SettingsSectionId = 
  | 'general'
  | 'subtitles'
  | 'pause-overlay'
  | 'hotkeys'
  | 'player-controls'
  | 'profile-storage'
  | 'connected-services'
  | 'loading-animation'
  | 'local-engine';

export interface NavGroup {
  title?: string;
  items: {
    id: SettingsSectionId;
    name: string;
    hint: string;
    icon: React.ReactNode;
  }[];
}

export const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        id: 'general',
        name: 'General',
        hint: 'Theme, language, display',
        icon: <Sun size={18} />,
      },
    ],
  },
  {
    title: 'Player',
    items: [
      {
        id: 'subtitles',
        name: 'Subtitles',
        hint: 'Font, size and colors',
        icon: <Captions size={18} />,
      },
      {
        id: 'pause-overlay',
        name: 'Pause overlay',
        hint: 'Info shown when paused',
        icon: <Pause size={18} />,
      },
      {
        id: 'hotkeys',
        name: 'Hotkeys',
        hint: 'Keyboard shortcuts',
        icon: <Keyboard size={18} />,
      },
      {
        id: 'player-controls',
        name: 'Player controls',
        hint: 'Order of on-screen buttons',
        icon: <LayoutGrid size={18} />,
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        id: 'profile-storage',
        name: 'Profile & storage',
        hint: 'Where your data is saved',
        icon: <Database size={18} />,
      },
      {
        id: 'connected-services',
        name: 'Connected services',
        hint: 'Trakt, TMDB, subtitles',
        icon: <Link2 size={18} />,
      },
    ],
  },
  {
    title: 'Advanced',
    items: [
      {
        id: 'loading-animation',
        name: 'Loading animation',
        hint: 'What shows while buffering',
        icon: <Loader2 size={18} />,
      },
      {
        id: 'local-engine',
        name: 'Local engine',
        hint: 'Run streams on your machine',
        icon: <Zap size={18} />,
      },
    ],
  },
];

export interface SettingsNavProps {
  activeSection: SettingsSectionId;
  onSelectSection: (section: SettingsSectionId) => void;
}

export const SettingsNav: React.FC<SettingsNavProps> = ({
  activeSection,
  onSelectSection,
}) => {
  return (
    <nav className="settings-sidebar-nav" aria-label="Settings navigation">
      {SETTINGS_NAV_GROUPS.map((group, groupIdx) => (
        <div key={groupIdx} className="settings-nav-group">
          {group.title && (
            <h4 className="settings-nav-group-title">{group.title}</h4>
          )}
          {group.items.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                className={`settings-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectSection(item.id)}
              >
                <span className="settings-nav-icon">{item.icon}</span>
                <span className="settings-nav-text">
                  <span className="settings-nav-name">{item.name}</span>
                  <span className="settings-nav-hint">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
};
