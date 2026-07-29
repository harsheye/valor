import React from 'react';
import { CustomSelect } from '../components/CustomSelect';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { ApiSettingsView } from '../components/ApiSettingsView';
import { SpinnerSettingsView } from '../components/SpinnerSettingsView';
import { RadialMenu } from '../components/RadialMenu';
import { 
  RotateCcw, UserPlus, LogOut, Trash2, Volume2, X, ChevronRight, ChevronLeft,
  Terminal, MessageSquare, Maximize, Bookmark, FastForward, Unlock, Play
} from 'lucide-react';
import { 
  audioOptions, subOptions, calendarStyleOptions, limitOptions, 
  intervalOptions, toastOptions, uiHideTimeoutOptions, fontOptions, 
  storageModeOptions, ratingThresholdOptions 
} from '../utils/constants';

interface SettingsPageProps {
  settingsTab: 'general' | 'hotkeys' | 'subtitle' | 'bookmarks' | 'storage' | 'api' | 'loader' | 'gridOverlay' | 'radialMenu';
  setSettingsTab: (tab: 'general' | 'hotkeys' | 'subtitle' | 'bookmarks' | 'storage' | 'api' | 'loader' | 'gridOverlay' | 'radialMenu') => void;
  uiOverlaySection: 'gridOverlay' | 'pauseOverlay';
  setUiOverlaySection: (section: 'gridOverlay' | 'pauseOverlay') => void;
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  handleDefaultLangChange: (field: any, val: any) => void;
  saveSettingsToStorage: (newSettings: any) => void;
  listeningKeyFor: string | null;
  setListeningKeyFor: (key: any) => void;
  hoveredHotkey: string | null;
  setHoveredHotkey: (key: string | null) => void;
  availableProfiles: any[];
  handleSwitchProfile: (profile: any) => void;
  openAuthModal: (tab: 'login' | 'signup', targetProfile?: any, onSuccess?: (userId: string) => void) => void;
  setDeleteTargetProfile: (profile: any) => void;
  setRemoveError: (msg: string) => void;
  setIsRemoveModalOpen: (open: boolean) => void;
  setNewProfileName: (name: string) => void;
  setNewProfilePassword: (pwd: string) => void;
  setCreateProfileError: (err: string) => void;
  setIsCreateProfileModalOpen: (open: boolean) => void;
  addToast: (title: string, type?: 'success' | 'error' | 'warning', message?: string) => void;
  setVideos: (videos: any) => void;
  previewExpanded: boolean;
  setPreviewExpanded: (expanded: boolean) => void;
  renderMockPreviewButton: (key: string) => React.ReactNode;
  setShowResetConfirm: (show: boolean) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settingsTab,
  setSettingsTab,
  uiOverlaySection,
  setUiOverlaySection,
  settings,
  setSettings,
  handleDefaultLangChange,
  saveSettingsToStorage,
  listeningKeyFor,
  setListeningKeyFor,
  hoveredHotkey,
  setHoveredHotkey,
  availableProfiles,
  handleSwitchProfile,
  openAuthModal,
  setDeleteTargetProfile,
  setRemoveError,
  setIsRemoveModalOpen,
  setNewProfileName,
  setNewProfilePassword,
  setCreateProfileError,
  setIsCreateProfileModalOpen,
  addToast,
  setVideos,
  previewExpanded,
  setPreviewExpanded,
  renderMockPreviewButton,
  setShowResetConfirm,
}) => {
  const isMonochrome = settings.theme === 'black-and-white' || settings.theme === 'oled';

  return (
    <div className="workspace-panel-wrapper">
      <div className="glass-panel workspace-panel settings-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        {/* Inner Tab Navigation */}
        <div className="settings-tab-nav">
          <button 
            className={`settings-nav-btn ${settingsTab === 'general' ? 'active' : ''}`}
            onClick={() => setSettingsTab('general')}
          >
            General
          </button>
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <CustomSelect
              value={
                settingsTab === 'subtitle' ? 'subtitle' : 
                settingsTab === 'hotkeys' ? 'hotkeys' : 
                uiOverlaySection
              }
              onChange={(val) => {
                if (val === 'hotkeys') {
                  setSettingsTab('hotkeys');
                } else if (val === 'subtitle') {
                  setSettingsTab('subtitle');
                } else {
                  setSettingsTab('gridOverlay');
                  setUiOverlaySection(val as any);
                }
              }}
              options={[
                { value: 'subtitle', label: 'Subtitles & Bookmarks' },
                { value: 'hotkeys', label: 'Hotkeys' },
                { value: 'gridOverlay', label: 'Grid Overlay' },
                { value: 'pauseOverlay', label: 'Pause Overlay' }
              ]}
              hideSearch
              width="max-content"
              className={`settings-nav-select ${
                settingsTab === 'gridOverlay' || 
                settingsTab === 'hotkeys' || 
                settingsTab === 'subtitle' ? 'active' : ''
              }`}
            />
          </div>
          <button 
            className={`settings-nav-btn ${settingsTab === 'storage' ? 'active' : ''}`}
            onClick={() => setSettingsTab('storage')}
          >
            Storage & Saves
          </button>
          <button 
            className={`settings-nav-btn ${settingsTab === 'api' ? 'active' : ''}`}
            onClick={() => setSettingsTab('api')}
          >
            API Settings
          </button>
          <button 
            className={`settings-nav-btn ${settingsTab === 'loader' ? 'active' : ''}`}
            onClick={() => setSettingsTab('loader')}
          >
            Spinner
          </button>
          <button 
            className={`settings-nav-btn ${settingsTab === 'radialMenu' ? 'active' : ''}`}
            onClick={() => setSettingsTab('radialMenu')}
          >
            Radial Menu
          </button>
        </div>

        <div className="settings-page-content-wrapper">
          
          {/* General Section */}
          {settingsTab === 'general' && (
            <div className="settings-tab-content animate-fade-in">
              <div className="settings-page-grid">
                <div className="settings-grid-col">

                  <div className="settings-section">
                    <h3>Visual Theme Engine</h3>
                    <p className="settings-section-desc">Select your preferred color theme for the entire application.</p>
                    <div className="pref-row">
                      <span className="pref-label">Application Theme</span>
                      <CustomSelect 
                        value={settings.theme || 'dark'} 
                        onChange={(val) => handleDefaultLangChange('theme' as any, val)}
                        options={[
                          { value: 'dark', label: '🍿 Cinematic Dark (Default)' },
                          { value: 'black-and-white', label: '🏁 Monochrome Noir' },
                          { value: 'light', label: '🧪 Custom Teal' },
                          { value: 'garden', label: '🏡 Cozy Garden' },
                          { value: 'black', label: '🖤 OLED Black' },
                          { value: 'luxury', label: '👑 Luxury Gold' },
                          { value: 'dim', label: '🌑 Dim Slate' },
                          { value: 'abyss', label: '🌌 Deep Abyss' },
                          { value: 'aqua', label: '🌊 Aqua Ocean' },
                          { value: 'valentine', label: '💖 Sweet Valentine' }
                        ]}
                      />
                    </div>
                  </div>

                  <div className="settings-section">
                    <h3>Preferred Languages</h3>
                    <p className="settings-section-desc">Default selections when loading a new video file.</p>
                    <div className="pref-row">
                      <span className="pref-label">Default Audio</span>
                      <CustomSelect 
                        value={settings.defaultAudio} 
                        onChange={(val) => handleDefaultLangChange('defaultAudio', val)}
                        options={audioOptions}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Default Subtitles</span>
                      <CustomSelect 
                        value={settings.defaultSub} 
                        onChange={(val) => handleDefaultLangChange('defaultSub', val)}
                        options={subOptions}
                      />
                    </div>
                  </div>

                  <div className="settings-section">
                    <h3>Calendar Preferences</h3>
                    <p className="settings-section-desc">Choose between the interactive month grid or the schedule list.</p>
                    <div className="pref-row">
                      <span className="pref-label">Calendar Layout Style</span>
                      <CustomSelect 
                        value={settings.calendarStyle} 
                        onChange={(val) => handleDefaultLangChange('calendarStyle', val)}
                        options={calendarStyleOptions}
                      />
                    </div>
                  </div>

                  <div className="settings-section">
                    <h3>History & Toast Preferences</h3>
                    <p className="settings-section-desc">Configure library limits and playback auto-save frequency.</p>
                    <div className="pref-row">
                      <span className="pref-label">History Limit</span>
                      <CustomSelect 
                        value={settings.historyLimit} 
                        onChange={(val) => handleDefaultLangChange('historyLimit', val)}
                        options={limitOptions}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">History Position Auto-Save Interval</span>
                      <CustomSelect 
                        value={settings.historySaveInterval || 5} 
                        onChange={(val) => handleDefaultLangChange('historySaveInterval', val)}
                        options={intervalOptions}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label" style={{ opacity: 0.8 }}>Watch History Backup</span>
                      <button 
                        className="btn-primary" 
                        style={{ 
                          padding: '8px 16px', 
                          fontSize: '0.85rem', 
                          background: isMonochrome ? '#ffffff' : '#e50914', 
                          color: isMonochrome ? '#000000' : '#fff', 
                          border: 'none', 
                          borderRadius: '4px', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 500
                        }}
                        onClick={async () => {
                          try {
                            const res = await fetch(`http://127.0.0.1:50001/api/history`);
                            if (!res.ok) throw new Error('Failed to fetch history backup');
                            const fileHistory = await res.json();
                            if (Array.isArray(fileHistory)) {
                              const restored = fileHistory.map((v: any) => ({
                                ...v,
                                audioTracks: v.audioTracks || [],
                                subtitleTracks: v.subtitleTracks || []
                              }));
                              setVideos(restored);
                              addToast("History restored successfully from server backup", "success");
                            } else {
                              addToast("No valid history backup found on server", "warning");
                            }
                          } catch (e: any) {
                            addToast(`Failed to restore history: ${e.message}`, "error");
                          }
                        }}
                      >
                        <RotateCcw size={14} />
                        <span>Restore Watch History from Server</span>
                      </button>
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Toast Duration (Seconds)</span>
                      <CustomSelect 
                        value={settings.toastDuration} 
                        onChange={(val) => handleDefaultLangChange('toastDuration', val)}
                        options={toastOptions}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">UI Overlays Auto-Hide Timeout</span>
                      <CustomSelect 
                        value={settings.uiHideTimeout || 1.5} 
                        onChange={(val) => handleDefaultLangChange('uiHideTimeout', val)}
                        options={uiHideTimeoutOptions}
                      />
                    </div>
                  </div>
                </div>

                <div className="settings-grid-col">
                  <div className="settings-section">
                    <h3>Player Display & Controls</h3>
                    <p className="settings-section-desc">Toggle display components visible on the video screen.</p>
                    <div className="pref-row">
                      <span className="pref-label">Disable All Overlays (Keyboard Only Mode)</span>
                      <ToggleSwitch 
                        checked={settings.hideUIOverlays} 
                        onChange={(checked) => handleDefaultLangChange('hideUIOverlays', checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Disable Video Name Display</span>
                      <ToggleSwitch 
                        checked={settings.hideVideoName} 
                        onChange={(checked) => handleDefaultLangChange('hideVideoName', checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Disable Play Button Overlay</span>
                      <ToggleSwitch 
                        checked={!settings.showPlayButton} 
                        onChange={(checked) => handleDefaultLangChange('showPlayButton', !checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Disable Time Display</span>
                      <ToggleSwitch 
                        checked={!settings.showTimeDisplay} 
                        onChange={(checked) => handleDefaultLangChange('showTimeDisplay', !checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Disable Timeline Scrub Bar</span>
                      <ToggleSwitch 
                        checked={!settings.showPlayBar} 
                        onChange={(checked) => handleDefaultLangChange('showPlayBar', !checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Disable Volume Control</span>
                      <ToggleSwitch 
                        checked={!settings.showVolumeControl} 
                        onChange={(checked) => handleDefaultLangChange('showVolumeControl', !checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Disable Fullscreen Toggle Button</span>
                      <ToggleSwitch 
                        checked={!settings.showFullscreen} 
                        onChange={(checked) => handleDefaultLangChange('showFullscreen', !checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Disable Floating & Hover Animations</span>
                      <ToggleSwitch 
                        checked={settings.disableAnimations} 
                        onChange={(checked) => handleDefaultLangChange('disableAnimations', checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Disable Focus Loss Auto-Pause</span>
                      <ToggleSwitch 
                        checked={!settings.pauseOnFocusChange} 
                        onChange={(checked) => handleDefaultLangChange('pauseOnFocusChange', !checked)}
                      />
                    </div>
                    <div className="pref-row" style={{ opacity: settings.blockSeekingCompletely ? 0.5 : 1 }}>
                      <span className="pref-label">Show Skip Buttons in Player UI</span>
                      <ToggleSwitch 
                        checked={settings.allowUiSkipping}
                        disabled={settings.blockSeekingCompletely}
                        onChange={(checked) => handleDefaultLangChange('allowUiSkipping', checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label" style={{ color: '#ff4444' }}>Block Seeking / Skipping Completely</span>
                      <ToggleSwitch 
                        checked={settings.blockSeekingCompletely}
                        onChange={(checked) => {
                          setSettings((prev: any) => {
                            const updated = {
                              ...prev,
                              blockSeekingCompletely: checked,
                              allowUiSkipping: checked ? false : prev.allowUiSkipping
                            };
                            saveSettingsToStorage(updated);
                            return updated;
                          });
                        }}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Auto-Skip Intros & Outros</span>
                      <ToggleSwitch 
                        checked={settings.autoSkipIntroOutro}
                        onChange={(checked) => handleDefaultLangChange('autoSkipIntroOutro', checked)}
                      />
                    </div>
                    <div className="pref-row">
                      <span className="pref-label">Lock Mode Active (Lock Controls on Startup)</span>
                      <ToggleSwitch 
                        checked={settings.lockModeActive}
                        onChange={(checked) => handleDefaultLangChange('lockModeActive', checked)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hotkeys Section */}
          {settingsTab === 'hotkeys' && (
            <div className="settings-tab-content animate-fade-in">
              <div className="settings-page-grid">
                
                {/* Left Column: Key Customization */}
                <div className="settings-grid-col">
                  <div className="settings-section" style={{ margin: 0 }}>
                    <h3>Keyboard Customization</h3>
                    <p className="settings-section-desc">Click on a key box and press any key to rebind it. Hover over a setting to highlight it in the player map.</p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {Object.entries(settings.keybinds).map(([key, value]) => {
                        const labelMap: Record<string, string> = {
                          playPause: 'Play / Pause',
                          rewind: 'Rewind 10s',
                          forward: 'Forward 10s',
                          fullscreen: 'Toggle Fullscreen',
                          exit: 'Exit Player / Back',
                          nextSubtitle: 'Cycle Subtitles',
                          nextAudio: 'Cycle Audio',
                          lockControls: 'Toggle Lock Controls',
                          openSettings: 'Toggle UI settings modal',
                          addBookmark: 'Create Bookmark',
                          toggleMute: 'Toggle Mute / Unmute',
                          audioBoost: 'Cycle Audio Boost',
                          frameStep: 'Step Frame Forward',
                          screenshot: 'Take Video Screenshot'
                        };
                        return (
                          <div 
                            className="keybind-row-hoverable" 
                            key={key}
                            onMouseEnter={() => setHoveredHotkey(key)}
                            onMouseLeave={() => setHoveredHotkey(null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.5rem 0.85rem',
                              margin: 0,
                              minHeight: '42px',
                              boxSizing: 'border-box',
                              borderRadius: '8px',
                              background: hoveredHotkey === key ? 'var(--accent-glow)' : 'var(--surface)',
                              border: hoveredHotkey === key ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                              boxShadow: 'var(--shadow-sm)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span className="keybind-label" style={{ fontSize: '0.85rem', color: hoveredHotkey === key ? 'var(--accent-color)' : 'var(--text-primary)', fontWeight: 600 }}>
                              {labelMap[key] || key}
                            </span>
                            <button 
                              className={`keybind-capture-btn ${listeningKeyFor === key ? 'listening' : ''}`}
                              onClick={() => setListeningKeyFor(key as any)}
                              style={{
                                background: listeningKeyFor === key ? 'var(--accent-color)' : 'var(--card-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: listeningKeyFor === key ? '#fff' : 'var(--text-primary)',
                                padding: '5px 12px',
                                fontSize: '0.78rem',
                                minWidth: '70px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                outline: 'none',
                                fontWeight: 600
                              }}
                            >
                              {listeningKeyFor === key ? 'Press key...' : (value as string) === ' ' ? 'Space' : (value as string)}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column: Player Interface HUD Diagram */}
                <div className="settings-grid-col" style={{ position: 'sticky', top: 0, height: 'fit-content' }}>
                  <div className="settings-section" style={{ width: '100%', margin: 0 }}>
                    <h3>Player Shortcut Map</h3>
                    <p className="settings-section-desc">Interactive representation of active player commands. Rebind keys on the left to see changes here.</p>
                    
                    {/* Simulated Player Screen with Pointers */}
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      height: '350px',
                      background: 'radial-gradient(circle at center, #1b2030 0%, #0d0f17 100%)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '1rem',
                      boxSizing: 'border-box'
                    }}>
                      {/* Top Overlay Area */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          background: hoveredHotkey === 'exit' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                          border: hoveredHotkey === 'exit' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          boxShadow: hoveredHotkey === 'exit' ? '0 0 10px rgba(229,9,20,0.4)' : 'none',
                          transition: 'all 0.2s ease'
                        }}>
                          <span style={{ fontSize: '0.65rem', color: '#888', fontWeight: 600 }}>Exit</span>
                          <kbd style={{ background: '#333', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>
                            {settings.keybinds.exit === 'Escape' ? 'Esc' : settings.keybinds.exit}
                          </kbd>
                        </div>

                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          background: hoveredHotkey === 'lockControls' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                          border: hoveredHotkey === 'lockControls' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          boxShadow: hoveredHotkey === 'lockControls' ? '0 0 10px rgba(229,9,20,0.4)' : 'none',
                          transition: 'all 0.2s ease'
                        }}>
                          <span style={{ fontSize: '0.65rem', color: '#888', fontWeight: 600 }}>Lock Mode</span>
                          <kbd style={{ background: '#333', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>
                            {settings.keybinds.lockControls === ' ' ? 'Space' : settings.keybinds.lockControls.toUpperCase()}
                          </kbd>
                        </div>
                      </div>

                      {/* Center Play & Seek Controls Diagram */}
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.25rem', margin: 'auto 0' }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.2rem',
                          background: hoveredHotkey === 'rewind' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                          border: hoveredHotkey === 'rewind' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          boxShadow: hoveredHotkey === 'rewind' ? '0 0 10px rgba(229,9,20,0.4)' : 'none',
                          transition: 'all 0.2s ease'
                        }}>
                          <span style={{ fontSize: '0.6rem', color: '#888', fontWeight: 600 }}>Rewind 10s</span>
                          <kbd style={{ background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                            {settings.keybinds.rewind === 'ArrowLeft' ? '←' : settings.keybinds.rewind}
                          </kbd>
                        </div>

                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.2rem',
                          background: hoveredHotkey === 'playPause' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                          border: hoveredHotkey === 'playPause' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          boxShadow: hoveredHotkey === 'playPause' ? '0 0 12px rgba(229,9,20,0.4)' : 'none',
                          transition: 'all 0.2s ease'
                        }}>
                          <span style={{ fontSize: '0.65rem', color: '#aaa', fontWeight: 600 }}>Play / Pause</span>
                          <kbd style={{ background: '#222', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {settings.keybinds.playPause === ' ' ? 'Space' : settings.keybinds.playPause}
                          </kbd>
                        </div>

                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.2rem',
                          background: hoveredHotkey === 'forward' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                          border: hoveredHotkey === 'forward' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          boxShadow: hoveredHotkey === 'forward' ? '0 0 10px rgba(229,9,20,0.4)' : 'none',
                          transition: 'all 0.2s ease'
                        }}>
                          <span style={{ fontSize: '0.6rem', color: '#888', fontWeight: 600 }}>Forward 10s</span>
                          <kbd style={{ background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                            {settings.keybinds.forward === 'ArrowRight' ? '→' : settings.keybinds.forward}
                          </kbd>
                        </div>
                      </div>

                      {/* Floating Sidebar overlay representation for UI settings */}
                      <div style={{
                        position: 'absolute',
                        right: '0.5rem',
                        top: '25%',
                        bottom: '25%',
                        width: '50px',
                        background: hoveredHotkey === 'openSettings' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                        border: hoveredHotkey === 'openSettings' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px 0 0 6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem',
                        boxShadow: hoveredHotkey === 'openSettings' ? '-5px 0 10px rgba(229,9,20,0.3)' : 'none',
                        transition: 'all 0.2s ease'
                      }}>
                        <span style={{ fontSize: '0.55rem', color: '#666', fontWeight: 600, textAlign: 'center', writingMode: 'vertical-lr', textTransform: 'uppercase' }}>Settings</span>
                        <kbd style={{ background: '#333', color: '#fff', padding: '1px 4px', borderRadius: '3px', fontSize: '0.55rem', fontWeight: 700 }}>
                          {settings.keybinds.openSettings === 'Delete' ? 'Del' : settings.keybinds.openSettings.toUpperCase()}
                        </kbd>
                      </div>

                      {/* Bottom Seekbar Line */}
                      <div style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        marginTop: 'auto'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0 0.5rem'
                        }}>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              background: hoveredHotkey === 'toggleMute' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.02)',
                              border: hoveredHotkey === 'toggleMute' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              transition: 'all 0.15s ease'
                            }}>
                              <span style={{ fontSize: '0.55rem', color: '#666' }}>Mute</span>
                              <kbd style={{ background: '#333', color: '#fff', fontSize: '0.55rem', padding: '1px 3px', borderRadius: '2px' }}>{settings.keybinds.toggleMute.toUpperCase()}</kbd>
                            </div>
                            
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              background: hoveredHotkey === 'audioBoost' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.02)',
                              border: hoveredHotkey === 'audioBoost' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              transition: 'all 0.15s ease'
                            }}>
                              <span style={{ fontSize: '0.55rem', color: '#666' }}>Boost</span>
                              <kbd style={{ background: '#333', color: '#fff', fontSize: '0.55rem', padding: '1px 3px', borderRadius: '2px' }}>{settings.keybinds.audioBoost.toUpperCase()}</kbd>
                            </div>
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            background: hoveredHotkey === 'screenshot' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.02)',
                            border: hoveredHotkey === 'screenshot' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            transition: 'all 0.15s ease'
                          }}>
                            <span style={{ fontSize: '0.55rem', color: '#666' }}>Capture</span>
                            <kbd style={{ background: '#333', color: '#fff', fontSize: '0.55rem', padding: '1px 3px', borderRadius: '2px' }}>{(settings.keybinds.screenshot || 's').toUpperCase()}</kbd>
                          </div>
                        </div>

                        <div style={{
                          height: '4px',
                          width: '100%',
                          borderRadius: '2px',
                          position: 'relative',
                          background: hoveredHotkey === 'frameStep' ? 'rgba(229, 9, 20, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                          border: hoveredHotkey === 'frameStep' ? '1px solid #e50914' : 'none',
                          transition: 'all 0.15s ease'
                        }}>
                          <div style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '35%', background: '#e50914', borderRadius: '2px' }}></div>
                          {hoveredHotkey === 'frameStep' && (
                            <div style={{
                              position: 'absolute',
                              bottom: '8px',
                              left: '35%',
                              transform: 'translateX(-50%)',
                              background: '#222',
                              border: '1px solid #e50914',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              fontSize: '0.55rem',
                              color: '#fff',
                              whiteSpace: 'nowrap'
                            }}>
                              Frame Step: <kbd style={{ background: '#333', padding: '1px 3px', borderRadius: '2px' }}>{settings.keybinds.frameStep.toUpperCase()}</kbd>
                            </div>
                          )}
                        </div>

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.6rem',
                          color: 'rgba(255,255,255,0.5)'
                        }}>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <div style={{
                              background: hoveredHotkey === 'nextAudio' ? 'rgba(229, 9, 20, 0.25)' : 'transparent',
                              border: hoveredHotkey === 'nextAudio' ? '1px solid #e50914' : '1px solid transparent',
                              borderRadius: '4px',
                              padding: '1px 5px',
                              transition: 'all 0.15s ease'
                            }}>
                              Audio: <kbd>{settings.keybinds.nextAudio.toUpperCase()}</kbd>
                            </div>
                            
                            <div style={{
                              background: hoveredHotkey === 'nextSubtitle' ? 'rgba(229, 9, 20, 0.25)' : 'transparent',
                              border: hoveredHotkey === 'nextSubtitle' ? '1px solid #e50914' : '1px solid transparent',
                              borderRadius: '4px',
                              padding: '1px 5px',
                              transition: 'all 0.15s ease'
                            }}>
                              Subs: <kbd>{settings.keybinds.nextSubtitle.toUpperCase()}</kbd>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <div style={{
                              background: hoveredHotkey === 'addBookmark' ? 'rgba(229, 9, 20, 0.25)' : 'transparent',
                              border: hoveredHotkey === 'addBookmark' ? '1px solid #e50914' : '1px solid transparent',
                              borderRadius: '4px',
                              padding: '1px 5px',
                              transition: 'all 0.15s ease'
                            }}>
                              Bookmark: <kbd>{settings.keybinds.addBookmark.toUpperCase()}</kbd>
                            </div>

                            <div style={{
                              background: hoveredHotkey === 'fullscreen' ? 'rgba(229, 9, 20, 0.25)' : 'transparent',
                              border: hoveredHotkey === 'fullscreen' ? '1px solid #e50914' : '1px solid transparent',
                              borderRadius: '4px',
                              padding: '1px 5px',
                              transition: 'all 0.15s ease'
                            }}>
                              FS: <kbd>{settings.keybinds.fullscreen.toUpperCase()}</kbd>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Subtitle Style & Bookmarks Combined 2-Column Section */}
          {(settingsTab === 'subtitle' || settingsTab === 'bookmarks') && (
            <div className="settings-tab-content animate-fade-in">
              <div className="settings-page-grid">
                
                {/* Column 1: Subtitle Style */}
                <div className="settings-grid-col">
                  <div className="settings-section">
                    <h3>Default Subtitle Style</h3>
                    <p className="settings-section-desc">Appearance defaults applied to all media tracks.</p>
                    
                    <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1.25rem', width: '100%', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span className="pref-label">Font Family</span>
                        <CustomSelect 
                          value={settings.subSettings.fontFamily}
                          onChange={(val) => {
                            const updatedSub = { ...settings.subSettings, fontFamily: val };
                            handleDefaultLangChange('subSettings', updatedSub);
                          }}
                          options={fontOptions}
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span className="pref-label">Font Size</span>
                        <div className="sexy-size-control-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px', height: '36px', width: '100%', boxSizing: 'border-box' }}>
                          <button 
                            type="button"
                            onClick={() => {
                              const currentSize = settings.subSettings.customSize || 100;
                              const updatedSub = { ...settings.subSettings, customSize: Math.max(50, currentSize - 10) };
                              handleDefaultLangChange('subSettings', updatedSub);
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: 'none',
                              background: 'var(--card-bg)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-hover-bg)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card-bg)'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '45px', textAlign: 'center', color: 'var(--text-primary)', flex: 1 }}>
                            {settings.subSettings.customSize || 100}%
                          </span>
                          
                          <button 
                            type="button"
                            onClick={() => {
                              const currentSize = settings.subSettings.customSize || 100;
                              const updatedSub = { ...settings.subSettings, customSize: Math.min(300, currentSize + 10) };
                              handleDefaultLangChange('subSettings', updatedSub);
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: 'none',
                              background: 'var(--card-bg)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-hover-bg)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card-bg)'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="style-colors-row style-colors-row-page" style={{ display: 'flex', gap: '1.25rem', marginBottom: '1.25rem', width: '100%', flexWrap: 'wrap' }}>
                      <div className="color-picker-item" style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span className="pref-label">Text Color</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.4rem 0.6rem', height: '36px', width: '100%', boxSizing: 'border-box', position: 'relative', cursor: 'pointer' }} onClick={() => document.getElementById('textColorInput')?.click()}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: settings.subSettings.customTextColor || '#ffffff', border: '2px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', fontFamily: 'monospace', flex: 1 }}>
                            {settings.subSettings.customTextColor || '#ffffff'}
                          </span>
                          <input 
                            id="textColorInput"
                            type="color" 
                            value={settings.subSettings.customTextColor || '#ffffff'}
                            onChange={(e) => {
                              const updatedSub = { ...settings.subSettings, customTextColor: e.target.value };
                              handleDefaultLangChange('subSettings', updatedSub);
                            }}
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none', padding: 0 }}
                          />
                        </div>
                      </div>
                      
                      <div className="color-picker-item bg-picker-item" style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span className="pref-label">Background Color</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.4rem 0.6rem', height: '36px', flex: 1, boxSizing: 'border-box', position: 'relative', cursor: settings.subSettings.customBgColor === 'transparent' ? 'not-allowed' : 'pointer' }} onClick={() => { if (settings.subSettings.customBgColor !== 'transparent') document.getElementById('bgColorInput')?.click(); }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: settings.subSettings.customBgColor === 'transparent' ? 'transparent' : settings.subSettings.customBgColor || '#000000', border: '2px solid var(--border-color)', backgroundImage: settings.subSettings.customBgColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none', backgroundSize: '8px 8px', backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: settings.subSettings.customBgColor === 'transparent' ? 'var(--text-muted)' : 'var(--text-primary)', textTransform: 'uppercase', fontFamily: 'monospace', flex: 1 }}>
                              {settings.subSettings.customBgColor === 'transparent' ? 'NONE' : settings.subSettings.customBgColor || '#000000'}
                            </span>
                            <input 
                              id="bgColorInput"
                              type="color" 
                              value={settings.subSettings.customBgColor && !settings.subSettings.customBgColor.startsWith('rgba') && settings.subSettings.customBgColor !== 'transparent' ? settings.subSettings.customBgColor : '#000000'}
                              onChange={(e) => {
                                const updatedSub = { ...settings.subSettings, customBgColor: e.target.value };
                                handleDefaultLangChange('subSettings', updatedSub);
                              }}
                              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none', padding: 0 }}
                              disabled={settings.subSettings.customBgColor === 'transparent'}
                            />
                          </div>
                          <button 
                            className={`bg-clear-btn ${settings.subSettings.customBgColor === 'transparent' ? 'active' : ''}`}
                            onClick={() => {
                              const updatedSub = { 
                                ...settings.subSettings, 
                                customBgColor: settings.subSettings.customBgColor === 'transparent' ? '#000000' : 'transparent' 
                              };
                              handleDefaultLangChange('subSettings', updatedSub);
                            }}
                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', cursor: 'pointer', background: settings.subSettings.customBgColor === 'transparent' ? '#3b82f6' : 'var(--surface)', border: '1px solid var(--border-color)', color: settings.subSettings.customBgColor === 'transparent' ? '#fff' : 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            None
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Live Subtitle Style Preview */}
                    <div className="preview-video-frame" style={{ marginTop: '1rem' }}>
                      <span 
                        className="sub-preview-card"
                        style={{
                          fontFamily: settings.subSettings.fontFamily === 'serif' ? 'Playfair Display, serif' : settings.subSettings.fontFamily === 'monospace' ? 'Roboto Mono, monospace' : settings.subSettings.fontFamily === 'outfit' ? 'Outfit, sans-serif' : settings.subSettings.fontFamily === 'cinzel' ? 'Cinzel, serif' : settings.subSettings.fontFamily === 'montserrat' ? 'Montserrat, sans-serif' : 'Poppins, sans-serif',
                          fontSize: `${Math.min(24, Math.max(12, (settings.subSettings.customSize || 100) * 0.15))}px`,
                          color: settings.subSettings.customTextColor || '#ffffff',
                          backgroundColor: settings.subSettings.customBgColor === 'transparent' ? 'transparent' : settings.subSettings.customBgColor || 'rgba(0,0,0,0.75)',
                          padding: settings.subSettings.customBgColor === 'transparent' ? '0' : '0.4rem 0.8rem',
                          borderRadius: '6px',
                          textShadow: settings.subSettings.customBgColor === 'transparent' ? '1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000' : 'none',
                          display: 'inline-block',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        Valor Subtitle Preview
                      </span>
                    </div>
                  </div>
                </div>

                {/* Column 2: Bookmarks & Auto-Skip */}
                <div className="settings-grid-col">
                  <div className="settings-section">
                    <h3>Bookmarks & Auto-Skip</h3>
                    <p className="settings-section-desc">Choose which marked segments are automatically skipped during playback.</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      <div className="pref-row" style={{ margin: 0 }}>
                        <span className="pref-label" style={{ flex: 1 }}>
                          Auto-Skip Intro & Outro Sections
                        </span>
                        <div style={{ flexShrink: 0 }}>
                          <ToggleSwitch 
                            checked={settings.autoSkipIntroOutro} 
                            onChange={(checked) => handleDefaultLangChange('autoSkipIntroOutro', checked)}
                          />
                        </div>
                      </div>

                      <div className="pref-row" style={{ margin: 0 }}>
                        <span className="pref-label" style={{ flex: 1 }}>
                          Auto-Skip Sex & Nudity Scenes
                        </span>
                        <div style={{ flexShrink: 0 }}>
                          <ToggleSwitch 
                            checked={settings.autoSkipSexScenes} 
                            onChange={(checked) => handleDefaultLangChange('autoSkipSexScenes', checked)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
          {settingsTab === 'storage' && (
            <div className="settings-tab-content animate-fade-in">
              <div className="settings-page-grid">
                
                {/* Left Column: Profile Management */}
                <div className="settings-grid-col">
                  <div className="settings-section" style={{ margin: 0 }}>
                    <h3>Active User Profile</h3>
                    <p className="settings-section-desc">Manage your profile storage and server synchronization.</p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      
                      {/* Active Profile Banner Card */}
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px', 
                        background: (settings.userId && settings.userId !== 'local') 
                          ? 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(37,99,235,0.06) 100%)' 
                          : 'var(--surface)', 
                        padding: '1.25rem', 
                        borderRadius: '10px', 
                        border: (settings.userId && settings.userId !== 'local') 
                          ? '1px solid rgba(59,130,246,0.25)' 
                          : '1px solid var(--border-color)' 
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div style={{ 
                            width: '48px', 
                            height: '48px', 
                            borderRadius: '50%', 
                            background: (settings.userId && settings.userId !== 'local') ? '#3b82f6' : 'var(--card-bg)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '1.4rem', 
                            fontWeight: 'bold',
                            color: (settings.userId && settings.userId !== 'local') ? '#fff' : 'var(--text-primary)',
                            boxShadow: 'var(--shadow-sm)',
                            border: '1px solid var(--border-color)'
                          }}>
                            {availableProfiles.find(p => p.userId === settings.userId) 
                               ? (availableProfiles.find(p => p.userId === settings.userId)?.name?.[0] || 'U').toUpperCase() 
                               : (settings.profileName?.[0] || 'L').toUpperCase()}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {availableProfiles.find(p => p.userId === settings.userId) 
                                  ? (availableProfiles.find(p => p.userId === settings.userId)?.name || 'Profile') 
                                  : (settings.profileName || 'Local Browser Saves')}
                              </span>
                              <span style={{ 
                                fontSize: '0.68rem', 
                                padding: '2px 8px', 
                                borderRadius: '4px', 
                                background: (settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_')) ? 'rgba(46,204,113,0.18)' : 'rgba(239,68,68,0.15)', 
                                color: (settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_')) ? '#2ecc71' : '#ef4444', 
                                fontWeight: 'bold',
                                letterSpacing: '0.5px'
                              }}>
                                {(settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_')) ? 'SYNCING ACTIVE' : 'LOCAL SAVE ONLY'}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {availableProfiles.find(p => p.userId === settings.userId) 
                                ? `User ID: ${settings.userId} ${availableProfiles.find(p => p.userId === settings.userId)?.username ? `• Username: ${availableProfiles.find(p => p.userId === settings.userId).username}` : '• Local Storage Profile'}` 
                                : 'Playback data is saved locally inside your browser storage.'}
                            </span>
                          </div>
                        </div>

                        <div className="profile-button-management" style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.75rem',
                          width: '100%',
                          marginTop: '1rem',
                          borderTop: '1px solid var(--border-subtle)',
                          paddingTop: '1.25rem'
                        }}>
                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '280px' }}>
                            {(!settings.userId || settings.userId === 'local' || settings.userId.startsWith('local_')) ? (
                              <button
                                type="button"
                                onClick={() => openAuthModal('signup')}
                                className="btn btn-primary"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 20px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  background: isMonochrome ? '#ffffff' : '#e50914',
                                  color: isMonochrome ? '#000000' : '#fff',
                                  border: 'none',
                                  transition: 'background 0.2s',
                                  fontFamily: 'Outfit, sans-serif'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = isMonochrome ? '#e5e5e5' : '#ff0914'}
                                onMouseLeave={e => e.currentTarget.style.background = isMonochrome ? '#ffffff' : '#e50914'}
                              >
                                <UserPlus size={14} />
                                <span>Create Server Profile & Sync</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm('Are you sure you want to logout? Your watch history and settings will remain on the server, and you will switch back to local browser storage.')) {
                                    localStorage.setItem('valor_active_user_id', 'local');
                                    setSettings((prev: any) => ({
                                      ...prev,
                                      userId: 'local',
                                      storageMode: 'localstorage'
                                    }));
                                    const savedVideos = localStorage.getItem('valor_videos');
                                    if (savedVideos) {
                                      try { setVideos(JSON.parse(savedVideos)); } catch {}
                                    }
                                    addToast('Logged out of server profile successfully', 'success');
                                  }
                                }}
                                className="btn"
                                style={{
                                  background: 'var(--surface)',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-secondary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 20px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  fontFamily: 'Outfit, sans-serif'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover-bg)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                              >
                                <LogOut size={14} />
                                <span>Logout</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                const curProfile = availableProfiles.find(p => p.userId === settings.userId) || {
                                  userId: settings.userId || 'local',
                                  name: settings.profileName || 'Local Browser Saves',
                                  storageMode: 'localstorage'
                                };
                                setDeleteTargetProfile(curProfile);
                                setRemoveError('');
                                setIsRemoveModalOpen(true);
                              }}
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontFamily: 'Outfit, sans-serif'
                              }}
                            >
                              <Trash2 size={14} />
                              <span>Remove Profile</span>
                            </button>
                          </div>
                        </div>

                      </div>

                      {/* Profile Switcher Grid */}
                      <div className="settings-section" style={{ margin: 0 }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>Saved Profiles on this Device</h4>
                        
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                          gap: '0.75rem',
                          width: '100%'
                        }}>
                          {availableProfiles.map((p) => {
                            const isActive = p.userId === settings.userId;
                            const isServer = p.userId && !p.userId.startsWith('local_') && p.userId !== 'local';
                            const themeColor = isServer ? '#3b82f6' : '#2ecc71';
                            const themeBg = isServer ? 'rgba(59,130,246,0.08)' : 'rgba(46,204,113,0.08)';
                            const themeDotBg = isServer ? '#3b82f6' : '#2ecc71';

                            return (
                              <div
                                key={p.userId}
                                onClick={() => handleSwitchProfile(p)}
                                style={{
                                  position: 'relative',
                                  background: isActive ? themeBg : 'var(--surface)',
                                  border: isActive ? `1.5px solid ${themeColor}` : '1px solid var(--border-color)',
                                  padding: '12px 10px',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  transition: 'all 0.2s ease',
                                  boxShadow: isActive ? `0 0 8px ${themeBg}` : 'none'
                                }}
                              >
                                {availableProfiles.length > 1 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteTargetProfile(p);
                                      setRemoveError('');
                                      setIsRemoveModalOpen(true);
                                    }}
                                    style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      border: 'none',
                                      borderRadius: '4px',
                                      width: '18px',
                                      height: '18px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      fontSize: '0.65rem',
                                      zIndex: 10,
                                      padding: 0
                                    }}
                                    title="Remove from Switcher"
                                  >
                                    ❌
                                  </button>
                                )}

                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: isActive ? themeColor : themeDotBg,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 'bold',
                                  fontSize: '0.9rem',
                                  color: '#fff',
                                  border: `1px solid ${themeColor}`
                                }}>
                                  {(p.name?.[0] || 'U').toUpperCase()}
                                </div>
                                <span style={{ fontSize: '0.72rem', fontWeight: isActive ? 600 : 400, color: 'var(--text-primary)', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {p.name} {p.hasPassword ? '🔒' : ''}
                                </span>
                              </div>
                            );
                          })}

                          {/* Add Profile Tile */}
                          <div
                            onClick={() => {
                              setNewProfileName('');
                              setNewProfilePassword('');
                              setCreateProfileError('');
                              setIsCreateProfileModalOpen(true);
                            }}
                            style={{
                              background: 'var(--surface)',
                              border: '1px dashed var(--border-color)',
                              padding: '12px 10px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              transition: 'all 0.2s ease',
                              height: '78px',
                              boxSizing: 'border-box'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-hover-bg)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)'; }}
                          >
                            <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>+</div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Add Profile</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Storage Metrics & Data Persistence */}
                <div className="settings-grid-col">
                  <div className="settings-section" style={{ margin: 0 }}>
                    <h3>Storage Location & Advanced Metrics</h3>
                    <p className="settings-section-desc">Configure where your data is stored and playback rating threshold parameters.</p>
                    
                    <div className="pref-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <span className="pref-label">Storage Location</span>
                      <CustomSelect 
                        value={settings.storageMode || 'localstorage'}
                        onChange={(val) => handleDefaultLangChange('storageMode', val)}
                        options={storageModeOptions}
                      />
                    </div>

                    <div className="pref-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <span className="pref-label">Rating Prompt Threshold</span>
                      <CustomSelect 
                        value={settings.ratingThreshold || 3}
                        onChange={(val) => handleDefaultLangChange('ratingThreshold', val)}
                        options={ratingThresholdOptions}
                      />
                    </div>
                  </div>

                  <div className="settings-section" style={{ margin: 0 }}>
                    <h3>Data Persistence Preferences</h3>
                    <p className="settings-section-desc">Toggle what data is saved in your active storage location.</p>
                    
                    <div className="pref-row">
                      <span className="pref-label">Save Playback Position & History</span>
                      <ToggleSwitch 
                        checked={settings.saveHistory} 
                        onChange={(checked) => handleDefaultLangChange('saveHistory', checked)}
                      />
                    </div>

                    <div className="pref-row">
                      <span className="pref-label">Save Audio/Subtitle Track Preferences</span>
                      <ToggleSwitch 
                        checked={settings.saveTrackPreferences} 
                        onChange={(checked) => handleDefaultLangChange('saveTrackPreferences', checked)}
                      />
                    </div>

                    <div className="pref-row">
                      <span className="pref-label">Save Player Volume & Mute States</span>
                      <ToggleSwitch 
                        checked={settings.saveVolume} 
                        onChange={(checked) => handleDefaultLangChange('saveVolume', checked)}
                      />
                    </div>

                    <div className="pref-row">
                      <span className="pref-label">Save UI Customization Preferences</span>
                      <ToggleSwitch 
                        checked={settings.saveSettings} 
                        onChange={(checked) => handleDefaultLangChange('saveSettings', checked)}
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* API Settings Section */}
          {settingsTab === 'api' && (
            <div className="settings-tab-content animate-fade-in" style={{ width: '100%' }}>
              <ApiSettingsView 
                settings={settings}
                handleDefaultLangChange={handleDefaultLangChange}
                addToast={addToast}
              />
            </div>
          )}

          {/* Spinner / Loading Animation Tab */}
          {settingsTab === 'loader' && (
            <div className="settings-tab-content animate-fade-in" style={{ width: '100%' }}>
              <SpinnerSettingsView
                settings={settings}
                setSettings={setSettings}
                saveSettingsToStorage={saveSettingsToStorage}
                handleDefaultLangChange={handleDefaultLangChange}
                addToast={addToast}
              />
            </div>
          )}

          {/* Radial Menu Config Tab */}
          {settingsTab === 'radialMenu' && (() => {
            const config = settings.radialMenuConfig || {};
            const rItems = [];
            if (config.console) rItems.push({ id: 'stats', label: 'Console', icon: <Terminal size={24} />, onClick: () => {} });
            if (config.audioSubs) rItems.push({ id: 'audio', label: 'Audio/Subs', icon: <MessageSquare size={24} />, onClick: () => {} });
            if (config.fullscreen) rItems.push({ id: 'fullscreen', label: 'Fullscreen', icon: <Maximize size={24} />, onClick: () => {} });
            if (config.bookmark) rItems.push({ id: 'bookmark', label: 'Bookmark', icon: <Bookmark size={24} />, onClick: () => {} });
            if (config.mute) rItems.push({ id: 'mute', label: 'Mute', icon: <Volume2 size={24} />, onClick: () => {} });
            if (config.speed) rItems.push({ id: 'speed', label: '1.0x Speed', icon: <FastForward size={24} />, onClick: () => {} });
            if (config.pip) rItems.push({ id: 'pip', label: 'PiP', icon: <Maximize size={24} />, onClick: () => {} });
            if (config.loop) rItems.push({ id: 'loop', label: 'Loop', icon: <RotateCcw size={24} />, onClick: () => {} });
            if (config.unlock) rItems.push({ id: 'unlock', label: 'Unlock UI', icon: <Unlock size={24} />, onClick: () => {} });

            return (
              <div className="settings-tab-content animate-fade-in" style={{ padding: '0 24px', display: 'flex', gap: '32px', height: '100%' }}>
                
                {/* Left side: Interactive Preview */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
                  <h3 style={{ position: 'absolute', top: 16, left: 16, margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Live Preview</h3>
                  {rItems.length > 0 ? (
                    <div style={{ width: 320, height: 320 }}>
                      <RadialMenu 
                        x={0} y={0} 
                        items={rItems} 
                        centerItem={{ icon: <Play size={24} fill="white" />, onClick: () => {} }} 
                        onClose={() => {}} 
                        inline 
                      />
                    </div>
                  ) : (
                    <div style={{ color: 'rgba(255,255,255,0.3)' }}>Enable items to see preview</div>
                  )}
                </div>

                {/* Right side: Toggles */}
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                  <div className="settings-section" style={{ margin: 0 }}>
                    <h3>Radial Menu Features</h3>
                    <p className="settings-section-desc">Toggle features inside the right-click menu. Changes will reflect in the live preview.</p>
                    
                    <div className="settings-section-content" style={{ marginTop: '24px' }}>
                      {[
                        { key: 'console', title: 'Developer Console' },
                        { key: 'audioSubs', title: 'Audio & Subtitles' },
                        { key: 'fullscreen', title: 'Fullscreen Toggle' },
                        { key: 'unlock', title: 'Unlock UI Feature' },
                        { key: 'bookmark', title: 'Quick Bookmark' },
                        { key: 'mute', title: 'Mute/Unmute' },
                        { key: 'speed', title: 'Playback Speed' },
                        { key: 'pip', title: 'Picture-in-Picture' },
                        { key: 'loop', title: 'Loop Video' },
                      ].map(({ key, title }) => {
                        const value = config[key] ?? false;
                        return (
                          <div className="pref-row" key={key}>
                            <span className="pref-label">{title}</span>
                            <ToggleSwitch 
                              checked={Boolean(value)}
                              onChange={() => {
                                const newConfig = { ...config, [key]: !value };
                                handleDefaultLangChange('radialMenuConfig', newConfig);
                                saveSettingsToStorage({ ...settings, radialMenuConfig: newConfig });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            );
          })()}

          {/* Settings Grid Overlay Section */}
          {settingsTab === 'gridOverlay' && (
            <div className="settings-tab-content animate-fade-in">
              
              {/* Grid Overlay Sub-section */}
              {uiOverlaySection === 'gridOverlay' && (
                <div className="settings-page-grid">
                  
                  {/* Left Column: Drag & Drop List */}
                  <div className="settings-grid-col">
                    <div className="settings-section" style={{ margin: 0 }}>
                      <h3>Settings Grid Ordering</h3>
                      <p className="settings-section-desc">Drag and drop settings to change their order in the player's UI settings grid. Pinned items will be displayed in the collapsed view.</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(settings.settingsOrder || [
                          'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                          'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                        ]).map((key: string, index: number) => {
                          const labelMap: Record<string, string> = {
                            hideUIOverlays: 'UI Overlays',
                            hideVideoName: 'Video Name',
                            showPlayButton: 'Play Button HUD',
                            showTimeDisplay: 'Time Display',
                            showPlayBar: 'Timeline Scrub',
                            showVolumeControl: 'Volume Control',
                            showFullscreen: 'Fullscreen Toggle',
                            disableAnimations: 'Disable Animations',
                            pauseOnFocusChange: 'Disable Auto-Pause',
                            allowUiSkipping: 'Skip Buttons',
                            blockSeekingCompletely: 'Block Seeking',
                            autoSkipIntroOutro: 'Auto-Skip Intro/Outro',
                            lockModeActive: 'Lock Controls'
                          };
                          return (
                            <div
                              key={key}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', index.toString());
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
                                const currentOrder = settings.settingsOrder || [
                                  'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                                  'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                                ];
                                const newOrder = [...currentOrder];
                                const [movedItem] = newOrder.splice(sourceIndex, 1);
                                newOrder.splice(index, 0, movedItem);
                                handleDefaultLangChange('settingsOrder', newOrder);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: index < 5 ? 'var(--accent-glow)' : 'var(--surface)',
                                border: index < 5 ? '1px dashed var(--accent-color)' : '1px solid var(--border-color)',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                cursor: 'grab',
                                fontSize: '0.85rem',
                                color: 'var(--text-primary)',
                                userSelect: 'none',
                                boxShadow: 'var(--shadow-sm)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>{index + 1}</span>
                                <span>{labelMap[key] || key}</span>
                              </div>
                              {index < 5 ? (
                                <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 600, background: 'var(--accent-glow)', padding: '1px 6px', borderRadius: '3px' }}>
                                  Pinned
                                </span>
                              ) : index === 5 ? (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, background: 'var(--surface)', padding: '1px 6px', borderRadius: '3px' }}>
                                  Grid Action
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Player Style Preview */}
                  <div className="settings-grid-col" style={{ position: 'sticky', top: 0, height: 'fit-content' }}>
                    <div className="settings-section" style={{ width: '100%' }}>
                      <h3>Real-time HUD Preview</h3>
                      <p className="settings-section-desc">See how the overlay settings card looks on screen. Toggle collapsed/expanded view below.</p>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <button
                          className={`btn`}
                          onClick={() => setPreviewExpanded(false)}
                          style={{
                            padding: '0.4rem 1rem',
                            fontSize: '0.8rem',
                            background: !previewExpanded ? (isMonochrome ? '#ffffff' : '#e50914') : 'rgba(255,255,255,0.08)',
                            color: !previewExpanded ? (isMonochrome ? '#000000' : '#fff') : '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          Collapsed (3x2 Combo)
                        </button>
                        <button
                          className={`btn`}
                          onClick={() => setPreviewExpanded(true)}
                          style={{
                            padding: '0.4rem 1rem',
                            fontSize: '0.8rem',
                            background: previewExpanded ? (isMonochrome ? '#ffffff' : '#e50914') : 'rgba(255,255,255,0.08)',
                            color: previewExpanded ? (isMonochrome ? '#000000' : '#fff') : '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          Expanded (4x4 Combo)
                        </button>
                      </div>

                      {/* Simulated Video Frame */}
                      <div style={{
                        position: 'relative',
                        width: '100%',
                        height: '260px',
                        background: 'radial-gradient(circle, #2a2a2a 0%, #111 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end'
                      }}>
                        <div style={{ position: 'absolute', left: '1.25rem', top: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Video Player Preview</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Mock Episode 01</span>
                        </div>

                        {/* Mock Volume Pill at the bottom-left corner */}
                        <div className="mock-volume-pill" style={{ position: 'absolute', left: '1.25rem', bottom: '1.25rem', zIndex: 10 }}>
                          <div className="mock-volume-btn">
                            <Volume2 size={16} />
                          </div>
                          <div className="mock-volume-slider-container">
                            <div className="mock-volume-track">
                              <div className="mock-volume-thumb"></div>
                            </div>
                          </div>
                          <span className="mock-volume-percent">80</span>
                        </div>

                        {/* Mock Settings Overlay Card clinged to right edge */}
                        <div style={{
                          background: 'rgba(18, 18, 18, 0.96)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRight: 'none',
                          borderRadius: '16px 0 0 16px',
                          padding: '1rem',
                          width: !previewExpanded ? '110px' : '200px',
                          height: '200px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
                          transition: 'all 0.3s ease',
                          boxSizing: 'border-box'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: '#888', fontWeight: 600 }}>UI Settings</span>
                            <X size={12} style={{ color: '#555', cursor: 'default' }} />
                          </div>

                          {/* Grid representation */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: !previewExpanded ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                            gap: '0.4rem',
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}>
                            {!previewExpanded ? (
                              <>
                                {(settings.settingsOrder || [
                                  'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                                  'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                                ]).slice(0, 5).map((key: string) => renderMockPreviewButton(key))}
                                
                                <div style={{
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  color: 'rgba(255, 255, 255, 0.8)',
                                  borderRadius: '6px',
                                  padding: '5px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  height: '28px'
                                }}>
                                  <ChevronRight size={14} />
                                </div>
                              </>
                            ) : (
                              <>
                                {(settings.settingsOrder || [
                                  'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                                  'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                                ]).map((key: string) => renderMockPreviewButton(key))}

                                <div style={{
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  color: 'rgba(255, 255, 255, 0.8)',
                                  borderRadius: '6px',
                                  padding: '5px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  height: '28px'
                                }}>
                                  <ChevronLeft size={14} />
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Pause Overlay Sub-section */}
              {uiOverlaySection === 'pauseOverlay' && (
                <div className="settings-page-grid animate-fade-in">
                  {/* Left Column: Settings List */}
                  <div className="settings-grid-col">
                    <div className="settings-section" style={{ margin: 0 }}>
                      <h3>Pause Overlay</h3>
                      <p className="settings-section-desc">Customize the metadata overlay shown when the video is paused.</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        
                        {/* Enable Toggle */}
                        <div className="pref-row" style={{ margin: 0 }}>
                          <span className="pref-label">Enable Pause Overlay</span>
                          <ToggleSwitch 
                            checked={settings.getOverlayDataFromTmdb !== false} 
                            onChange={(checked) => handleDefaultLangChange('getOverlayDataFromTmdb', checked)}
                          />
                        </div>

                        {settings.getOverlayDataFromTmdb !== false && (
                          <>
                            {/* Position Select */}
                            <div className="pref-row animate-fade-in" style={{ margin: 0 }}>
                              <span className="pref-label">Overlay Position</span>
                              <CustomSelect 
                                value={settings.overlayPosition || 'bottom-left'}
                                onChange={(val) => handleDefaultLangChange('overlayPosition', val)}
                                options={[
                                  { value: 'bottom-left', label: 'Bottom Left' },
                                  { value: 'bottom-right', label: 'Bottom Right' },
                                  { value: 'top-left', label: 'Top Left' },
                                  { value: 'top-right', label: 'Top Right' }
                                ]}
                              />
                            </div>

                            {/* Show Background Gradient */}
                            <div className="pref-row animate-fade-in" style={{ margin: 0 }}>
                              <span className="pref-label">Background Gradient</span>
                              <ToggleSwitch 
                                checked={settings.overlayShowBackground !== false} 
                                onChange={(checked) => handleDefaultLangChange('overlayShowBackground', checked)}
                              />
                            </div>

                            {/* Show Rating */}
                            <div className="pref-row animate-fade-in" style={{ margin: 0 }}>
                              <span className="pref-label">Show Rating</span>
                              <ToggleSwitch 
                                checked={settings.overlayShowRating !== false} 
                                onChange={(checked) => handleDefaultLangChange('overlayShowRating', checked)}
                              />
                            </div>

                            {/* Show Overview */}
                            <div className="pref-row animate-fade-in" style={{ margin: 0 }}>
                              <span className="pref-label">Show Overview</span>
                              <ToggleSwitch 
                                checked={settings.overlayShowOverview !== false} 
                                onChange={(checked) => handleDefaultLangChange('overlayShowOverview', checked)}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Visual Drag-Drop Preview */}
                  {settings.getOverlayDataFromTmdb !== false && (
                    <div className="settings-grid-col" style={{ position: 'sticky', top: 0, height: 'fit-content' }}>
                      <div className="settings-section" style={{ width: '100%', margin: 0 }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                          Preview — Click a corner to position
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 1rem 0' }}>
                          Click any corner of the video frame below to move the overlay.
                        </p>

                        {/* Mock Video Frame */}
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          height: '280px',
                          background: 'radial-gradient(circle at 30% 40%, #2a2a3a 0%, #0f0f15 100%)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = (e.clientX - rect.left) / rect.width;
                          const y = (e.clientY - rect.top) / rect.height;
                          const isLeft = x < 0.5;
                          const isTop = y < 0.5;
                          const newPos = `${isTop ? 'top' : 'bottom'}-${isLeft ? 'left' : 'right'}`;
                          handleDefaultLangChange('overlayPosition', newPos);
                        }}
                        >
                          {/* Position corner hint dots */}
                          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => {
                            const isSel = (settings.overlayPosition || 'bottom-left') === pos;
                            return (
                              <div 
                                key={pos}
                                style={{
                                  position: 'absolute',
                                  ...(pos.includes('top') ? { top: '10px' } : { bottom: '10px' }),
                                  ...(pos.includes('left') ? { left: '10px' } : { right: '10px' }),
                                  width: '16px',
                                  height: '16px',
                                  borderRadius: '50%',
                                  border: isSel ? (isMonochrome ? '2px solid #ffffff' : '2px solid #e50914') : '2px dashed rgba(255,255,255,0.3)',
                                  background: isSel ? (isMonochrome ? 'rgba(255, 255, 255, 0.4)' : 'rgba(229, 9, 20, 0.4)') : 'transparent',
                                  zIndex: 20,
                                  transition: 'all 0.2s ease',
                                  boxShadow: isSel ? (isMonochrome ? '0 0 10px rgba(255, 255, 255, 0.6)' : '0 0 10px rgba(229, 9, 20, 0.6)') : 'none'
                                }}
                              />
                            );
                          })}

                          {/* Mock Overlay Card */}
                          <div style={{
                            position: 'absolute',
                            ...((() => {
                              const pos = settings.overlayPosition || 'bottom-left';
                              return {
                                ...(pos.includes('top') ? { top: '20px' } : { bottom: '20px' }),
                                ...(pos.includes('left') ? { left: '20px' } : { right: '20px' }),
                              };
                            })()),
                            maxWidth: '45%',
                            textAlign: (settings.overlayPosition || 'bottom-left').includes('right') ? 'right' as const : 'left' as const,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            alignItems: (settings.overlayPosition || 'bottom-left').includes('right') ? 'flex-end' : 'flex-start',
                            transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                            pointerEvents: 'none'
                          }}>
                            <div style={{
                              fontSize: '1.1rem',
                              fontWeight: 800,
                              color: '#fff',
                              textShadow: '0 2px 6px rgba(0,0,0,0.8)',
                              fontFamily: "'Outfit', 'Inter', sans-serif",
                              letterSpacing: '-0.02em'
                            }}>
                              Movie Title
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                              Season 1 · Episode 4 · 50m
                            </div>
                            {settings.overlayShowOverview !== false && (
                              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', lineHeight: '1.4', maxWidth: '200px' }}>
                                A brief description of the episode content appears here...
                              </div>
                            )}
                            {settings.overlayShowRating !== false && (
                              <div style={{ fontSize: '0.6rem', color: '#fbbf24', fontWeight: 600 }}>
                                ★ 8.5 / 10
                              </div>
                            )}
                          </div>

                          {/* Video watermark text */}
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.08)', letterSpacing: '2px', textTransform: 'uppercase', pointerEvents: 'none', zIndex: 0 }}>
                            VIDEO PREVIEW
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>

        {/* External Footer Bar for Reset Action */}
        <div className="settings-page-footer">
          <button className="btn-dark-reset" onClick={() => setShowResetConfirm(true)}>
            <RotateCcw size={14} />
            <span>Reset All Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
