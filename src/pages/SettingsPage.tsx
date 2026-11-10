import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  SettingsNav, 
  type SettingsSectionId,
  SettingsSearch,
  SettingsCard,
  SettingRow,
  Switch,
  Segmented,
  Select,
  ColorField,
  KeyBinder,
  HOTKEY_ACTIONS,
  HudPreview,
  ServiceCard,
  SpinnerPresets,
  Toast,
  DestructiveButton,
  DEFAULT_HUD_ORDER,
} from '../components/settings';
import { 
  User, Plus, RefreshCw, Copy, Check, RotateCcw, 
  RotateCcw as RestoreIcon, ChevronRight, ArrowLeft, Radio,
  Clock, Captions, Volume2, LayoutGrid, Monitor, Cloud, Download, Upload, Trash2, ShieldAlert
} from 'lucide-react';
import { PlayerLoader } from '../components/player/PlayerLoader';
import { sidecarService } from '../services/remote/sidecarService';
import { featureFlagService } from '../services/featureFlags';
import { 
  initiateTraktPkceAuth, 
  generateTraktDeviceCode, 
  pollTraktDeviceToken, 
  fetchTraktUserProfile, 
  testTraktApi 
} from '../services/traktAuth';

export const THEME_OPTIONS = [
  { id: 'auto', name: 'Auto (system)', desc: 'Follows OS mode', bg: '#0F1217', surface: '#1B212A', text: '#E4E8EE', dot: '#8CA9EE' },
  { id: 'midnight-slate', name: 'Midnight Slate', desc: 'Cool, quiet dark (default)', bg: '#0F1217', surface: '#1B212A', text: '#E4E8EE', dot: '#8CA9EE' },
  { id: 'ember-night', name: 'Ember Night', desc: 'Warm, low-blue amber', bg: '#14110F', surface: '#231E1A', text: '#EBE3D8', dot: '#E5A86D' },
  { id: 'forest-mist', name: 'Forest Mist', desc: 'Muted green-grey sage', bg: '#0E1412', surface: '#1A2420', text: '#E0E9E4', dot: '#7CC3A1' },
  { id: 'valor-crimson', name: 'Valor Crimson', desc: 'Softened red brand', bg: '#131114', surface: '#221E24', text: '#E9E4E9', dot: '#E57C86' },
  { id: 'black-ops', name: 'Black-Ops (OLED Black)', desc: 'Pure #000000 OLED black', bg: '#000000', surface: '#000000', text: '#f2f2f2', dot: '#e53950' },
  { id: 'soft-paper', name: 'Soft Paper', desc: 'Warm light paper cream', bg: '#ECE7DD', surface: '#FAF7F0', text: '#25221D', dot: '#3A5CB0' },
  { id: 'dark', name: 'Valor Cyber Dark', desc: 'Modern canvas & coral', bg: '#0B0C10', surface: '#1B1E26', text: '#F2F4F8', dot: '#FF6B7A' },
  { id: 'light', name: 'Studio Light', desc: 'Crisp white & crimson', bg: '#FFFFFF', surface: '#ECEEF3', text: '#12141A', dot: '#C4263A' },
];

export const AUDIO_LANGUAGE_OPTIONS = [
  { value: 'ENG', label: 'English (default)' },
  { value: 'JPN', label: 'Japanese' },
  { value: 'SPA', label: 'Spanish' },
  { value: 'FRE', label: 'French' },
  { value: 'GER', label: 'German' },
  { value: 'HIN', label: 'Hindi' },
  { value: 'KOR', label: 'Korean' },
  { value: 'CHI', label: 'Chinese' },
  { value: 'ITA', label: 'Italian' },
  { value: 'POR', label: 'Portuguese' },
  { value: 'RUS', label: 'Russian' },
];

export const SUBTITLE_LANGUAGE_OPTIONS = [
  { value: 'ENG', label: 'English (default)' },
  { value: 'NONE', label: 'None' },
  { value: 'JPN', label: 'Japanese' },
  { value: 'SPA', label: 'Spanish' },
  { value: 'FRE', label: 'French' },
  { value: 'GER', label: 'German' },
  { value: 'HIN', label: 'Hindi' },
  { value: 'KOR', label: 'Korean' },
  { value: 'CHI', label: 'Chinese' },
  { value: 'ITA', label: 'Italian' },
  { value: 'POR', label: 'Portuguese' },
  { value: 'RUS', label: 'Russian' },
];

interface SettingsPageProps {
  settingsTab?: string;
  setSettingsTab?: (tab: any) => void;
  uiOverlaySection?: string;
  setUiOverlaySection?: (section: any) => void;
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  handleDefaultLangChange: (field: any, val: any) => void;
  saveSettingsToStorage: (newSettings: any) => void;
  listeningKeyFor?: string | null;
  setListeningKeyFor?: (key: any) => void;
  hoveredHotkey?: string | null;
  setHoveredHotkey?: (key: string | null) => void;
  availableProfiles?: any[];
  handleSwitchProfile?: (profile: any) => void;
  openAuthModal?: (tab: 'login' | 'signup', targetProfile?: any, onSuccess?: (userId: string) => void) => void;
  setDeleteTargetProfile?: (profile: any) => void;
  setRemoveError?: (msg: string) => void;
  setIsRemoveModalOpen?: (open: boolean) => void;
  setNewProfileName?: (name: string) => void;
  setNewProfilePassword?: (pwd: string) => void;
  setCreateProfileError?: (err: string) => void;
  setIsCreateProfileModalOpen?: (open: boolean) => void;
  addToast?: (title: string, type?: 'success' | 'error' | 'warning', message?: string) => void;
  setVideos?: (videos: any) => void;
  previewExpanded?: boolean;
  setPreviewExpanded?: (expanded: boolean) => void;
  renderMockPreviewButton?: (key: string) => React.ReactNode;
  setShowResetConfirm?: (show: boolean) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settingsTab,
  setSettingsTab,
  settings,
  setSettings,
  handleDefaultLangChange,
  saveSettingsToStorage,
  availableProfiles = [],
  handleSwitchProfile,
  openAuthModal,
  setIsRemoveModalOpen,
  setDeleteTargetProfile,
  setIsCreateProfileModalOpen,
  renderMockPreviewButton,
  addToast,
  setVideos,
}) => {
  const resolveSectionId = (tab?: string): SettingsSectionId => {
    switch (tab) {
      case 'subtitle':
      case 'subtitles':
      case 'bookmarks':
        return 'subtitles';
      case 'pauseOverlay':
      case 'pause-overlay':
        return 'pause-overlay';
      case 'hotkeys':
        return 'hotkeys';
      case 'gridOverlay':
      case 'player-controls':
        return 'player-controls';
      case 'storage':
      case 'profile-storage':
        return 'profile-storage';
      case 'api':
      case 'connected-services':
        return 'connected-services';
      case 'loader':
      case 'loading-animation':
        return 'loading-animation';
      case 'companion':
      case 'local-engine':
        return featureFlagService.isFeatureEnabled('localEngine') ? 'local-engine' : 'general';
      case 'general':
      default:
        return 'general';
    }
  };

  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => resolveSectionId(settingsTab));
  // On mobile (<= 768px), start at root menu (null). On desktop (> 768px), start on active section
  const [mobileDetail, setMobileDetail] = useState<SettingsSectionId | null>(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      return null;
    }
    return settingsTab ? resolveSectionId(settingsTab) : null;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('Saved');

  // Sidecar / Local engine state
  const [sidecarStatus, setSidecarStatus] = useState<string>('Offline');
  const [checkingSidecar, setCheckingSidecar] = useState<boolean>(false);
  const [copiedCli, setCopiedCli] = useState<boolean>(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState<boolean>(false);

  // Trakt device code info
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<{ user_code: string; verification_url: string } | null>(null);

  // System Update state (watches branch production)
  const [updateStatus, setUpdateStatus] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [applyingUpdate, setApplyingUpdate] = useState<boolean>(false);

  const fetchUpdateStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/update/status');
      if (res.ok) {
        const data = await res.json();
        setUpdateStatus(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchUpdateStatus();
    const interval = setInterval(fetchUpdateStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchUpdateStatus]);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('/api/system/update/check', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setUpdateStatus(data);
        if (data.updateAvailable) {
          triggerAutosaveToast('New patch available on branch production!');
        } else {
          triggerAutosaveToast('System is up to date.');
        }
      } else {
        triggerAutosaveToast('Failed to check for updates');
      }
    } catch {
      triggerAutosaveToast('Update check failed');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    setApplyingUpdate(true);
    try {
      triggerAutosaveToast('Applying patch and restarting...');
      const res = await fetch('/api/system/update/apply', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setUpdateStatus(data);
        triggerAutosaveToast('Patch applied! Restarting instance...');
      } else {
        triggerAutosaveToast('Failed to apply update');
      }
    } catch {
      triggerAutosaveToast('Error applying update');
    } finally {
      setApplyingUpdate(false);
    }
  };

  useEffect(() => {
    if (settingsTab) {
      const resolved = resolveSectionId(settingsTab);
      setActiveSection(resolved);
      if (typeof window !== 'undefined' && window.innerWidth > 768) {
        setMobileDetail(resolved);
      }
    }
  }, [settingsTab]);

  const handleSelectSection = (sectionId: SettingsSectionId) => {
    setActiveSection(sectionId);
    setMobileDetail(sectionId);
    setSearchQuery('');
    if (setSettingsTab) {
      setSettingsTab(sectionId as any);
    }
  };

  const triggerAutosaveToast = useCallback((msg = 'Saved') => {
    setToastMessage(msg);
    setShowSavedToast(true);
  }, []);

  const updateSetting = useCallback((field: string, val: any) => {
    handleDefaultLangChange(field, val);
    triggerAutosaveToast();
  }, [handleDefaultLangChange, triggerAutosaveToast]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = useCallback(() => {
    try {
      const activeName = settings.profileName || 'Local Profile';
      const k = settings.userId === 'local' ? 'valor_videos' : `valor_videos_${settings.userId}`;
      let localHistory = [];
      try {
        localHistory = JSON.parse(localStorage.getItem(k) || '[]');
      } catch {}

      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        profileName: activeName,
        userId: settings.userId,
        settings,
        localHistory,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `valor_backup_${activeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      triggerAutosaveToast('Backup exported successfully');
    } catch {
      triggerAutosaveToast('Failed to export backup');
    }
  }, [settings, triggerAutosaveToast]);

  const handleImportBackup = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        if (data && data.settings) {
          const mergedSettings = { ...settings, ...data.settings };
          setSettings(mergedSettings);
          saveSettingsToStorage(mergedSettings);
          if (Array.isArray(data.localHistory)) {
            const k = settings.userId === 'local' ? 'valor_videos' : `valor_videos_${settings.userId}`;
            localStorage.setItem(k, JSON.stringify(data.localHistory));
            if (setVideos) setVideos(data.localHistory);
          }
          triggerAutosaveToast('Backup restored successfully!');
        } else {
          triggerAutosaveToast('Invalid backup file structure');
        }
      } catch {
        triggerAutosaveToast('Failed to parse backup JSON');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  }, [settings, setSettings, saveSettingsToStorage, setVideos, triggerAutosaveToast]);

  // Subscribe to Sidecar health
  useEffect(() => {
    const unsub = sidecarService.subscribe((status) => {
      setSidecarStatus(status.isAvailable ? 'Operational' : 'Offline');
    });
    sidecarService.checkHealth().then((ok) => {
      setSidecarStatus(ok ? 'Operational' : 'Offline');
    });
    return () => unsub();
  }, []);

  const handleCheckSidecarStatus = async () => {
    setCheckingSidecar(true);
    const ok = await sidecarService.checkHealth();
    setSidecarStatus(ok ? 'Operational' : 'Offline');
    setCheckingSidecar(false);
    triggerAutosaveToast(ok ? 'Local engine operational' : 'Local engine offline');
  };

  // Trakt Handlers
  const handleConnectTrakt = async () => {
    try {
      await initiateTraktPkceAuth({
        isLoginAction: false,
        redirectUri: settings.traktRedirectUri,
      });
    } catch (e: any) {
      console.error('[Trakt PKCE]', e);
    }
  };

  const handleUseDeviceCode = async () => {
    try {
      const data = await generateTraktDeviceCode();
      setDeviceCodeInfo({
        user_code: data.user_code,
        verification_url: data.verification_url || 'https://auth.trakt.tv/activate',
      });
      triggerAutosaveToast(`Code generated: ${data.user_code}`);

      const intervalSec = Math.max(data.interval || 5, 5);
      const expiryMs = (data.expires_in || 600) * 1000;
      const startTime = Date.now();

      const timer = setInterval(async () => {
        if (Date.now() - startTime > expiryMs) {
          clearInterval(timer);
          setDeviceCodeInfo(null);
          return;
        }
        try {
          const pollRes = await pollTraktDeviceToken(data.device_code);
          if (pollRes.token?.access_token) {
            clearInterval(timer);
            setDeviceCodeInfo(null);
            const token = pollRes.token.access_token;
            updateSetting('traktAccessToken', token);
            if (pollRes.token.refresh_token) {
              updateSetting('traktRefreshToken', pollRes.token.refresh_token);
            }
            const profile = await fetchTraktUserProfile(token);
            if (profile?.username) {
              updateSetting('traktUsername', profile.username);
              if (profile.avatarUrl) updateSetting('traktAvatar', profile.avatarUrl);
            }
            triggerAutosaveToast('Connected to Trakt');
          }
        } catch (e) {
          console.warn('[Trakt Poll]', e);
        }
      }, intervalSec * 1000);
    } catch (err: any) {
      console.error('[Trakt Device Code]', err);
    }
  };

  const handleDisconnectTrakt = () => {
    updateSetting('traktAccessToken', '');
    updateSetting('traktRefreshToken', '');
    updateSetting('traktUsername', '');
    updateSetting('traktAvatar', '');
    triggerAutosaveToast('Trakt disconnected');
  };

  // Reset all settings
  const handleResetAll = () => {
    const defaultSettings = {
      ...settings,
      theme: 'midnight-slate',
      autoSkipIntroOutro: true,
      autoSkipSexScenes: true,
      hideUIOverlays: false,
      hideVideoName: false,
      showPlayButton: true,
      showTimeDisplay: true,
      showPlayBar: true,
      showVolumeControl: true,
      showFullscreen: true,
      disableAnimations: false,
      pauseOnFocusChange: false,
      allowUiSkipping: true,
      blockSeekingCompletely: false,
      getOverlayDataFromTmdb: true,
      overlayPosition: 'middle-left',
      overlayShowBackground: true,
      overlayShowRating: true,
      overlayShowOverview: true,
      saveHistory: true,
      saveTrackPreferences: true,
      saveVolume: true,
      saveSettings: true,
      ratingThreshold: 3,
      storageMode: 'localstorage',
      uiDimmer: 100,
      textScale: 100,
      reduceMotion: 'system',
      defaultAudio: 'ENG',
      defaultSub: 'ENG',
      historyLimit: 10,
      historySaveInterval: 5,
      toastDuration: 4.0,
      uiHideTimeout: 1.5,
      subSettings: {
        fontFamily: 'Inter',
        customSize: 100,
        customTextColor: '#ffffff',
        customBgColor: 'transparent',
      },
      settingsOrder: DEFAULT_HUD_ORDER,
      spinnerPreset: 'fire-circle',
      customLoaderType: 'default',
      customLoaderUrl: '',
    };
    setSettings(defaultSettings);
    saveSettingsToStorage(defaultSettings);
    document.documentElement.setAttribute('data-theme', 'midnight-slate');
    triggerAutosaveToast('All settings reset to defaults');
  };

  const activeProfileName = settings.profileName || 'Local profile';
  const isCloudProfile = settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_');

  // Search filter query
  const isSearching = searchQuery.trim().length > 0;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchesSearch = (...texts: (string | undefined)[]) => {
    if (!isSearching) return true;
    return texts.some((t) => t && t.toLowerCase().includes(normalizedQuery));
  };

  const scrollToAnchor = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className={`settings-workspace ${mobileDetail ? 'mobile-detail-active' : ''}`} role="region" aria-label="Settings Area">
      {/* Mobile Settings View (<= 768px) */}
      <div className="mobile-settings-view">
        {mobileDetail === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--tx, var(--text-1))' }}>
              Settings
            </h1>

            {/* GENERAL */}
            <div className="mobile-settings-group">
              <div className="mobile-settings-group-title">GENERAL</div>
              <button
                type="button"
                className="mobile-settings-row-btn"
                onClick={() => { setMobileDetail('general'); setActiveSection('general'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">General</span>
                  <span className="mobile-settings-row-desc">Language, display, comfort</span>
                </div>
                <ChevronRight size={18} className="mobile-settings-chevron" />
              </button>
            </div>

            {/* PLAYER */}
            <div className="mobile-settings-group">
              <div className="mobile-settings-group-title">PLAYER</div>
              <button
                type="button"
                className="mobile-settings-row-btn"
                onClick={() => { setMobileDetail('subtitles'); setActiveSection('subtitles'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">Subtitles</span>
                  <span className="mobile-settings-row-desc">Default tracks, style</span>
                </div>
                <ChevronRight size={18} className="mobile-settings-chevron" />
              </button>
              <button
                type="button"
                className="mobile-settings-row-btn"
                onClick={() => { setMobileDetail('pause-overlay'); setActiveSection('pause-overlay'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">Pause overlay</span>
                  <span className="mobile-settings-row-desc">Show controls, dim</span>
                </div>
                <ChevronRight size={18} className="mobile-settings-chevron" />
              </button>
              <button
                type="button"
                className="mobile-settings-row-btn"
                onClick={() => { setMobileDetail('player-controls'); setActiveSection('player-controls'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">Player controls</span>
                  <span className="mobile-settings-row-desc">Buttons, seek, speed</span>
                </div>
                <ChevronRight size={18} className="mobile-settings-chevron" />
              </button>
            </div>

            {/* ACCOUNT */}
            <div className="mobile-settings-group">
              <div className="mobile-settings-group-title">ACCOUNT</div>
              <button
                type="button"
                className="mobile-settings-row-btn"
                onClick={() => { setMobileDetail('profile-storage'); setActiveSection('profile-storage'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">Profile & storage</span>
                  <span className="mobile-settings-row-desc">{availableProfiles.length || 1} profile{(availableProfiles.length || 1) > 1 ? 's' : ''} · cached</span>
                </div>
                <ChevronRight size={18} className="mobile-settings-chevron" />
              </button>
              <button
                type="button"
                className="mobile-settings-row-btn"
                onClick={() => { setMobileDetail('connected-services'); setActiveSection('connected-services'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">Connected services</span>
                  <span className="mobile-settings-row-desc">Trakt, TMDB, OpenSubtitles</span>
                </div>
                <ChevronRight size={18} className="mobile-settings-chevron" />
              </button>
            </div>

            {/* ADVANCED */}
            <div className="mobile-settings-group">
              <div className="mobile-settings-group-title">ADVANCED</div>
              <button
                type="button"
                className="mobile-settings-row-btn"
                onClick={() => { setMobileDetail('loading-animation'); setActiveSection('loading-animation'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">Loading animation</span>
                  <span className="mobile-settings-row-desc">What shows while buffering</span>
                </div>
                <ChevronRight size={18} className="mobile-settings-chevron" />
              </button>
            </div>
          </div>
        ) : (
          <div className="mobile-detail-nav-bar">
            <button
              type="button"
              onClick={() => setMobileDetail(null)}
              className="mobile-detail-back-btn"
              aria-label="Back to settings menu"
            >
              <ArrowLeft size={18} />
            </button>
            <h2 className="mobile-detail-title">
              {mobileDetail === 'general' ? 'General' :
               mobileDetail === 'subtitles' ? 'Subtitles' :
               mobileDetail === 'pause-overlay' ? 'Pause overlay' :
               mobileDetail === 'hotkeys' ? 'Hotkeys & Gestures' :
               mobileDetail === 'player-controls' ? 'Player controls' :
               mobileDetail === 'profile-storage' ? 'Profile & storage' :
               mobileDetail === 'connected-services' ? 'Connected services' :
               mobileDetail === 'loading-animation' ? 'Loading animation' : 'Settings'}
            </h2>
          </div>
        )}
      </div>

      <div className="settings-container">
        {/* Top Header Bar */}
        <header className="settings-header-bar">
        <div className="settings-title-group">
          <h1 className="settings-page-title">Settings</h1>
        </div>

        <SettingsSearch
          query={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search settings..."
        />
      </header>

      {/* Main Two-Column Shell */}
      <div className="settings-body-shell">
        {/* Left Sticky Sidebar Nav */}
        <SettingsNav
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
        />

        {/* Scrollable Content Column */}
        <main className="settings-content-area" id="settings-scroll-container">
          <div className="settings-column settings-panel-entrance">

            {/* ─── 1. GENERAL SECTION ─── */}
            {(isSearching || activeSection === 'general') && (
              <>
                {/* General Header with Quick Anchor Navigation Chips */}
                {!isSearching && (
                  <div className="settings-section-header">
                    <h2 className="settings-section-main-title">General</h2>
                    <p className="settings-section-main-desc">Look, language and everyday player behaviour.</p>

                    <div className="settings-anchor-chips">
                      {[
                        { id: 'card-comfort', label: 'Comfort' },
                        { id: 'card-language', label: 'Language' },
                        { id: 'card-history', label: 'History' },
                        { id: 'card-overlays', label: 'Player display' },
                        { id: 'card-behaviour', label: 'Behaviour' },
                        { id: 'card-advanced', label: 'Advanced' },
                        { id: 'card-updates', label: 'Updates' },
                      ].map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          className="settings-anchor-chip"
                          onClick={() => scrollToAnchor(chip.id)}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1.1 Comfort Card */}
                {matchesSearch('comfort', 'brightness', 'text size', 'motion', 'dimmer') && (
                  <div id="card-comfort">
                    <SettingsCard
                      title="Comfort"
                      description="Make long viewing sessions easier on your eyes."
                    >
                      <SettingRow
                        title="Interface brightness"
                        description="Dims the interface. Chrome only."
                        control={
                          <Segmented
                            value={settings.uiDimmer || 100}
                            onChange={(dim) => {
                              updateSetting('uiDimmer', dim);
                              document.documentElement.style.setProperty('--ui-dimmer', (dim / 100).toString());
                            }}
                            options={[
                              { value: 85, label: '85%' },
                              { value: 90, label: '90%' },
                              { value: 95, label: '95%' },
                              { value: 100, label: '100%' },
                            ]}
                          />
                        }
                      />

                      <SettingRow
                        title="Text size"
                        description="Scales text across the app."
                        control={
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-3)' }}>Aa</span>
                            <Segmented
                              value={settings.textScale || 100}
                              onChange={(scale) => {
                                updateSetting('textScale', scale);
                                document.documentElement.style.setProperty('--text-scale', (scale / 100).toString());
                              }}
                              options={[
                                { value: 90, label: '90%' },
                                { value: 100, label: '100%' },
                                { value: 110, label: '110%' },
                                { value: 120, label: '120%' },
                              ]}
                            />
                          </div>
                        }
                      />

                      <SettingRow
                        title="Reduce motion"
                        description="Turns off most animations. “System” follows your device."
                        control={
                          <Segmented
                            value={settings.reduceMotion || 'system'}
                            onChange={(mode) => {
                              updateSetting('reduceMotion', mode);
                              if (mode === 'on') {
                                document.documentElement.setAttribute('data-reduce-motion', 'true');
                              } else {
                                document.documentElement.removeAttribute('data-reduce-motion');
                              }
                            }}
                            options={[
                              { value: 'system', label: 'System' },
                              { value: 'on', label: 'On' },
                              { value: 'off', label: 'Off' },
                            ]}
                          />
                        }
                      />
                    </SettingsCard>
                  </div>
                )}

                {/* 1.3 Language & Calendar Card */}
                {matchesSearch('language', 'calendar', 'audio', 'subtitle', 'default audio') && (
                  <div id="card-language">
                    <SettingsCard
                      title="Language & calendar"
                      description="Configure audio track and subtitle language defaults."
                    >
                      <SettingRow
                        title="Default audio"
                        description="Used when a video has more than one audio track."
                        control={
                          <Select
                            value={settings.defaultAudio || 'ENG'}
                            onChange={(val) => updateSetting('defaultAudio', val)}
                            options={AUDIO_LANGUAGE_OPTIONS}
                          />
                        }
                      />

                      <SettingRow
                        title="Default subtitles"
                        description="Used when a video has subtitles."
                        control={
                          <Select
                            value={settings.defaultSub || 'ENG'}
                            onChange={(val) => updateSetting('defaultSub', val)}
                            options={SUBTITLE_LANGUAGE_OPTIONS}
                          />
                        }
                      />
                    </SettingsCard>
                  </div>
                )}

                {/* 1.4 History Card */}
                {matchesSearch('history', 'place', 'backup', 'duration', 'overlays after') && (
                  <div id="card-history">
                    <SettingsCard
                      title="History"
                      description="Playback tracking, save intervals, and message durations."
                    >
                      <SettingRow
                        title="History limit"
                        description="How many titles to keep in History."
                        control={
                          <Select
                            value={settings.historyLimit || 10}
                            onChange={(val) => updateSetting('historyLimit', val === 'Infinite' ? 'Infinite' : parseInt(String(val), 10))}
                            options={[
                              { value: 5, label: '5 items' },
                              { value: 10, label: '10 items (default)' },
                              { value: 20, label: '20 items' },
                              { value: 50, label: '50 items' },
                              { value: 'Infinite', label: 'Infinite' },
                            ]}
                          />
                        }
                      />

                      <SettingRow
                        title="Save my place"
                        description="How often your position in a video is saved."
                        control={
                          <Select
                            value={settings.historySaveInterval || 5}
                            onChange={(val) => updateSetting('historySaveInterval', parseInt(String(val), 10))}
                            options={[
                              { value: 2, label: 'Every 2 seconds' },
                              { value: 5, label: 'Every 5 seconds (default)' },
                              { value: 10, label: 'Every 10 seconds' },
                              { value: 30, label: 'Every 30 seconds' },
                            ]}
                          />
                        }
                      />

                      <SettingRow
                        title="Watch history backup"
                        description="Bring back the history stored on the server."
                        control={
                          <button
                            type="button"
                            className="settings-btn-secondary"
                            onClick={() => triggerAutosaveToast('History synced from server')}
                          >
                            <RestoreIcon size={14} />
                            <span>Restore from server</span>
                          </button>
                        }
                      />

                      <SettingRow
                        title="Message duration"
                        description="How long pop-up messages stay on screen."
                        control={
                          <Select
                            value={settings.toastDuration || 4.0}
                            onChange={(val) => updateSetting('toastDuration', parseFloat(String(val)))}
                            options={[
                              { value: 2.0, label: '2.0 seconds' },
                              { value: 3.0, label: '3.0 seconds' },
                              { value: 4.0, label: '4.0 seconds (default)' },
                              { value: 5.0, label: '5.0 seconds' },
                              { value: 8.0, label: '8.0 seconds' },
                            ]}
                          />
                        }
                      />

                      <SettingRow
                        title="Hide overlays after"
                        description="How long overlays stay once you stop moving the mouse."
                        control={
                          <Select
                            value={settings.uiHideTimeout || 1.5}
                            onChange={(val) => updateSetting('uiHideTimeout', parseFloat(String(val)))}
                            options={[
                              { value: 1.0, label: '1.0 second' },
                              { value: 1.5, label: '1.5 seconds (default)' },
                              { value: 2.0, label: '2.0 seconds' },
                              { value: 3.0, label: '3.0 seconds' },
                              { value: 0, label: 'Never' },
                            ]}
                          />
                        }
                      />
                    </SettingsCard>
                  </div>
                )}

                {/* 1.5 Overlays Card */}
                {matchesSearch('overlays', 'video title', 'play button', 'time display') && (
                  <div id="card-overlays">
                    <SettingsCard
                      title="Overlays"
                      description="Information layered on top of the video."
                    >
                      <SettingRow
                        title="Video title"
                        description="Show the name of what you're watching."
                        control={
                          <Switch
                            checked={!settings.hideVideoName}
                            onChange={(show) => updateSetting('hideVideoName', !show)}
                            aria-label="Show video title"
                          />
                        }
                      />

                      <SettingRow
                        title="Play button overlay"
                        description="Show a large play button when paused."
                        control={
                          <Switch
                            checked={settings.showPlayButton !== false}
                            onChange={(v) => updateSetting('showPlayButton', v)}
                            aria-label="Show play button overlay"
                          />
                        }
                      />

                      <SettingRow
                        title="Time display"
                        description="Show elapsed and remaining time."
                        control={
                          <Switch
                            checked={settings.showTimeDisplay !== false}
                            onChange={(v) => updateSetting('showTimeDisplay', v)}
                            aria-label="Show time display"
                          />
                        }
                      />
                    </SettingsCard>
                  </div>
                )}

                {/* 1.6 Controls Card */}
                {matchesSearch('controls', 'timeline bar', 'volume', 'fullscreen', 'skip buttons') && (
                  <div id="card-controls">
                    <SettingsCard
                      title="Controls"
                      description="Buttons and bars in the player."
                    >
                      <SettingRow
                        title="Timeline bar"
                        description="Drag to jump to any point."
                        control={
                          <Switch
                            checked={settings.showPlayBar !== false}
                            onChange={(v) => updateSetting('showPlayBar', v)}
                            aria-label="Show timeline scrub bar"
                          />
                        }
                      />

                      <SettingRow
                        title="Volume control"
                        description="Show sound volume control slider."
                        control={
                          <Switch
                            checked={settings.showVolumeControl !== false}
                            onChange={(v) => updateSetting('showVolumeControl', v)}
                            aria-label="Show volume control"
                          />
                        }
                      />

                      <SettingRow
                        title="Fullscreen button"
                        description="Show fullscreen toggle button on screen."
                        control={
                          <Switch
                            checked={settings.showFullscreen !== false}
                            onChange={(v) => updateSetting('showFullscreen', v)}
                            aria-label="Show fullscreen button"
                          />
                        }
                      />

                      <SettingRow
                        title="Skip buttons"
                        description="Show “Skip intro” and similar buttons."
                        control={
                          <Switch
                            checked={settings.allowUiSkipping !== false}
                            onChange={(v) => updateSetting('allowUiSkipping', v)}
                            aria-label="Show skip buttons"
                          />
                        }
                      />
                    </SettingsCard>
                  </div>
                )}

                {/* 1.7 Behaviour Card */}
                {matchesSearch('behaviour', 'animations', 'windows', 'intros', 'sex', 'nudity') && (
                  <div id="card-behaviour">
                    <SettingsCard
                      title="Behaviour"
                      description="How playback reacts while you watch."
                    >
                      <SettingRow
                        title="Animations"
                        description="Smooth transitions in the player."
                        control={
                          <Switch
                            checked={!settings.disableAnimations}
                            onChange={(v) => updateSetting('disableAnimations', !v)}
                            aria-label="Enable animations"
                          />
                        }
                      />

                      <SettingRow
                        title="Pause when I switch windows"
                        description="Pauses if you leave this tab or window."
                        control={
                          <Switch
                            checked={!!settings.pauseOnFocusChange}
                            onChange={(v) => updateSetting('pauseOnFocusChange', v)}
                            aria-label="Pause when window loses focus"
                          />
                        }
                      />

                      <SettingRow
                        title="Auto-skip intros & outros"
                        description="Jumps past marked intro and outro sections."
                        control={
                          <Switch
                            checked={settings.autoSkipIntroOutro !== false}
                            onChange={(v) => updateSetting('autoSkipIntroOutro', v)}
                            aria-label="Auto-skip intros and outros"
                          />
                        }
                      />

                      <SettingRow
                        title="Auto-skip sex & nudity scenes"
                        description="Skips scenes that are marked as containing them."
                        control={
                          <Switch
                            checked={settings.autoSkipSexScenes !== false}
                            onChange={(v) => updateSetting('autoSkipSexScenes', v)}
                            aria-label="Auto-skip sex and nudity scenes"
                          />
                        }
                      />
                    </SettingsCard>
                  </div>
                )}

                {/* 1.8 Advanced Card */}
                {matchesSearch('advanced', 'block seeking', 'disable all overlays', 'lock controls') && (
                  <div id="card-advanced">
                    <SettingsCard
                      title="Advanced"
                      description="Restrictions for kiosks and shared screens. Most people leave these off."
                    >
                      <SettingRow
                        title="Block seeking and skipping"
                        description="Viewers can’t fast-forward or skip ahead."
                        control={
                          <Switch
                            checked={!!settings.blockSeekingCompletely}
                            onChange={(v) => updateSetting('blockSeekingCompletely', v)}
                            aria-label="Block seeking and skipping completely"
                          />
                        }
                      />

                      <div className="desktop-only-setting">
                        <SettingRow
                          title="Disable all overlays"
                          description="Keyboard-only mode with no on-screen overlays."
                          control={
                            <Switch
                              checked={!!settings.hideUIOverlays}
                              onChange={(v) => updateSetting('hideUIOverlays', v)}
                              aria-label="Disable all overlays"
                            />
                          }
                        />
                      </div>

                      <SettingRow
                        title="Lock controls on startup"
                        description="Player controls start locked until you unlock them."
                        control={
                          <Switch
                            checked={!!settings.lockModeActive}
                            onChange={(v) => updateSetting('lockModeActive', v)}
                            aria-label="Lock controls on startup"
                          />
                        }
                      />
                    </SettingsCard>
                  </div>
                )}

                {/* 1.85 Auto-Updates & Patches Card */}
                {matchesSearch('updates', 'update', 'patches', 'patch', 'production', 'github', 'version') && (
                  <div id="card-updates">
                    <SettingsCard
                      title="System Auto-Updates"
                      description="Monitors GitHub for the latest patches on branch production and updates the running instance automatically."
                    >
                      <SettingRow
                        title="Automatic background updates"
                        description="Continuously check GitHub for new production patches every 5 minutes and auto-update."
                        control={
                          <Switch
                            checked={settings.autoUpdateEnabled !== false}
                            onChange={(v) => {
                              updateSetting('autoUpdateEnabled', v);
                            }}
                            aria-label="Automatic background updates"
                          />
                        }
                      />

                      <SettingRow
                        title="Branch & Version"
                        description={
                          updateStatus
                            ? `Tracking origin/${updateStatus.branch || 'production'} (Commit: ${updateStatus.currentCommitShort || 'unknown'})`
                            : 'Tracking origin/production'
                        }
                        control={
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="settings-card-btn"
                              onClick={handleCheckUpdate}
                              disabled={checkingUpdate || applyingUpdate}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '13px'
                              }}
                            >
                              <RefreshCw size={13} className={checkingUpdate ? 'spin-anim' : ''} />
                              {checkingUpdate ? 'Checking GitHub...' : 'Check for patches'}
                            </button>
                            {updateStatus?.updateAvailable && (
                              <button
                                type="button"
                                className="settings-card-btn"
                                onClick={handleApplyUpdate}
                                disabled={applyingUpdate}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  background: '#e53950',
                                  border: 'none',
                                  color: '#fff',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  fontSize: '13px'
                                }}
                              >
                                {applyingUpdate ? 'Updating...' : 'Update & Restart'}
                              </button>
                            )}
                          </div>
                        }
                      />

                      {updateStatus?.lastCheckedAt && (
                        <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div>Last checked GitHub: {new Date(updateStatus.lastCheckedAt).toLocaleTimeString()} ({new Date(updateStatus.lastCheckedAt).toLocaleDateString()})</div>
                          {updateStatus.latestCommitShort && updateStatus.latestCommitShort !== updateStatus.currentCommitShort ? (
                            <div style={{ color: '#ff6b7a', marginTop: '4px', fontWeight: 600 }}>
                              🚀 New patch ready: {updateStatus.latestCommitShort}
                              {updateStatus.latestCommitInfo?.message ? ` — "${updateStatus.latestCommitInfo.message.split('\n')[0]}"` : ''}
                            </div>
                          ) : (
                            <div style={{ color: '#4ade80', marginTop: '4px' }}>
                              ✓ Running instance is up to date with branch production
                            </div>
                          )}
                        </div>
                      )}
                    </SettingsCard>
                  </div>
                )}

                {/* 1.9 Reset Card */}
                {matchesSearch('reset', 'defaults') && (
                  <div id="card-reset">
                    <SettingsCard
                      title="Reset"
                      description="Restore default settings without losing your saved history."
                    >
                      <SettingRow
                        title="Reset all settings"
                        description="Puts every setting back to its default. Your watch history is kept."
                        control={
                          <DestructiveButton
                            label="Reset all settings"
                            confirmLabel="Click again to confirm"
                            onConfirm={handleResetAll}
                            icon={<RotateCcw size={14} />}
                          />
                        }
                      />
                    </SettingsCard>
                  </div>
                )}
              </>
            )}

            {/* ─── 2. SUBTITLES SECTION ─── */}
            {(isSearching ? matchesSearch('subtitles', 'subtitle', 'font', 'stepper', 'color', 'background', 'hex') : activeSection === 'subtitles') && (
              <SettingsCard
                title="Subtitles"
                description="Typography, sizing, colors, and live subtitle preview"
              >
                <SettingRow
                  title="Font family"
                  description="Typeface used for rendering subtitle cues"
                  control={
                    <Select
                      value={settings.subSettings?.fontFamily || 'Inter'}
                      onChange={(val) => {
                        const updated = { ...(settings.subSettings || {}), fontFamily: val };
                        updateSetting('subSettings', updated);
                      }}
                      options={[
                        { value: 'Inter', label: 'Inter' },
                        { value: 'Outfit', label: 'Outfit' },
                        { value: 'sans-serif', label: 'System sans-serif' },
                        { value: 'serif', label: 'Serif' },
                        { value: 'monospace', label: 'Monospace' },
                        { value: 'poppins', label: 'Poppins' },
                        { value: 'montserrat', label: 'Montserrat' },
                        { value: 'cinzel', label: 'Cinzel' },
                      ]}
                    />
                  }
                />

                <SettingRow
                  title="Subtitle size"
                  description="Scale between 50% and 200% of standard subtitle size"
                  control={
                    <div className="settings-stepper">
                      <button
                        type="button"
                        className="settings-stepper-btn"
                        disabled={(settings.subSettings?.customSize || 100) <= 50}
                        onClick={() => {
                          const cur = settings.subSettings?.customSize || 100;
                          const updated = { ...(settings.subSettings || {}), customSize: Math.max(50, cur - 10) };
                          updateSetting('subSettings', updated);
                        }}
                        aria-label="Decrease subtitle size"
                      >
                        −
                      </button>
                      <span className="settings-stepper-value">
                        {settings.subSettings?.customSize || 100}%
                      </span>
                      <button
                        type="button"
                        className="settings-stepper-btn"
                        disabled={(settings.subSettings?.customSize || 100) >= 200}
                        onClick={() => {
                          const cur = settings.subSettings?.customSize || 100;
                          const updated = { ...(settings.subSettings || {}), customSize: Math.min(200, cur + 10) };
                          updateSetting('subSettings', updated);
                        }}
                        aria-label="Increase subtitle size"
                      >
                        +
                      </button>
                    </div>
                  }
                />

                <SettingRow
                  title="Text color"
                  description="Color for subtitle lettering"
                  control={
                    <ColorField
                      value={settings.subSettings?.customTextColor || '#ffffff'}
                      onChange={(hex) => {
                        const updated = { ...(settings.subSettings || {}), customTextColor: hex };
                        updateSetting('subSettings', updated);
                      }}
                      aria-label="Subtitle text color"
                    />
                  }
                />

                <SettingRow
                  title="Background color"
                  description="Backdrop box color behind subtitles or clear background"
                  control={
                    <ColorField
                      value={settings.subSettings?.customBgColor || 'transparent'}
                      onChange={(hex) => {
                        const updated = { ...(settings.subSettings || {}), customBgColor: hex };
                        updateSetting('subSettings', updated);
                      }}
                      showNoBackground
                      onNoBackground={() => {
                        const isTrans = settings.subSettings?.customBgColor === 'transparent';
                        const updated = { ...(settings.subSettings || {}), customBgColor: isTrans ? '#000000' : 'transparent' };
                        updateSetting('subSettings', updated);
                      }}
                      aria-label="Subtitle background color"
                    />
                  }
                />

                {/* Live Subtitle Preview on Video-like Backdrop */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
                    Live subtitle preview
                  </span>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '180px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      background: 'radial-gradient(circle at 50% 40%, #1e2436 0%, #090a10 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.8), 0 4px 16px rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: settings.subSettings?.fontFamily || 'Inter',
                        fontSize: `${Math.min(26, Math.max(14, (settings.subSettings?.customSize || 100) * 0.16))}px`,
                        color: settings.subSettings?.customTextColor || '#ffffff',
                        backgroundColor: settings.subSettings?.customBgColor === 'transparent' ? 'transparent' : (settings.subSettings?.customBgColor || 'rgba(0,0,0,0.75)'),
                        padding: settings.subSettings?.customBgColor === 'transparent' ? '0' : '6px 16px',
                        borderRadius: '6px',
                        fontWeight: 500,
                        textShadow: settings.subSettings?.customBgColor === 'transparent' ? '2px 2px 3px #000, -2px -2px 3px #000, 2px -2px 3px #000, -2px 2px 3px #000' : '0 2px 4px rgba(0,0,0,0.5)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      Valor subtitle preview on video
                    </span>
                  </div>
                </div>
              </SettingsCard>
            )}

            {/* ─── 3. PAUSE OVERLAY SECTION ─── */}
            {(isSearching ? matchesSearch('pause overlay', 'pause', 'overlay', 'dim', 'rating', 'overview', 'position') : activeSection === 'pause-overlay') && (
              <SettingsCard
                title="Pause overlay"
                description="Metadata presentation, corner positioning, and backdrop dimming when playback pauses"
              >
                <SettingRow
                  title="Show overlay when paused"
                  description="Display media details, season/episode numbers, and synopsis during pause"
                  control={
                    <Switch
                      checked={settings.getOverlayDataFromTmdb !== false}
                      onChange={(v) => updateSetting('getOverlayDataFromTmdb', v)}
                      aria-label="Show overlay when paused"
                    />
                  }
                />

                {settings.getOverlayDataFromTmdb !== false && (
                  <>
                    <SettingRow
                      title="Position"
                      description="Screen corner or side position for the pause card"
                      control={
                        <Select
                          value={settings.overlayPosition || 'middle-left'}
                          onChange={(val) => updateSetting('overlayPosition', val)}
                          options={[
                            { value: 'top-left', label: 'Top left' },
                            { value: 'top-right', label: 'Top right' },
                            { value: 'middle-left', label: 'Middle left' },
                            { value: 'bottom-left', label: 'Bottom left' },
                            { value: 'bottom-right', label: 'Bottom right' },
                          ]}
                        />
                      }
                    />

                    <SettingRow
                      title="Dim background"
                      description="Darken the frame beneath the paused overlay for better readability"
                      control={
                        <Switch
                          checked={settings.overlayShowBackground !== false}
                          onChange={(v) => updateSetting('overlayShowBackground', v)}
                          aria-label="Dim background when paused"
                        />
                      }
                    />

                    <SettingRow
                      title="Show rating"
                      description="Display TMDB community score and star badge"
                      control={
                        <Switch
                          checked={settings.overlayShowRating !== false}
                          onChange={(v) => updateSetting('overlayShowRating', v)}
                          aria-label="Show rating on pause overlay"
                        />
                      }
                    />

                    <SettingRow
                      title="Show overview"
                      description="Display episode summary synopsis"
                      control={
                        <Switch
                          checked={settings.overlayShowOverview !== false}
                          onChange={(v) => updateSetting('overlayShowOverview', v)}
                          aria-label="Show overview synopsis"
                        />
                      }
                    />

                    {/* Live Preview: 4 dashed corner targets + middle-left target */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
                        Live preview — Click any target to move overlay
                      </span>

                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          height: '240px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)',
                          background: settings.overlayShowBackground !== false
                            ? 'radial-gradient(circle at center, rgba(30, 36, 50, 0.9) 0%, rgba(10, 12, 16, 0.98) 100%)'
                            : 'radial-gradient(circle at center, #262b3d 0%, #11141c 100%)',
                          overflow: 'hidden',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        }}
                      >
                        {[
                          { id: 'top-left', label: 'Top left', style: { top: '12px', left: '12px' } },
                          { id: 'top-right', label: 'Top right', style: { top: '12px', right: '12px' } },
                          { id: 'middle-left', label: 'Middle left', style: { top: 'calc(50% - 12px)', left: '12px' } },
                          { id: 'bottom-left', label: 'Bottom left', style: { bottom: '12px', left: '12px' } },
                          { id: 'bottom-right', label: 'Bottom right', style: { bottom: '12px', right: '12px' } },
                        ].map((target) => {
                          const isTargetSelected = (settings.overlayPosition || 'middle-left') === target.id;
                          return (
                            <button
                              key={target.id}
                              type="button"
                              aria-label={`Position pause overlay at ${target.label}`}
                              onClick={() => updateSetting('overlayPosition', target.id)}
                              style={{
                                position: 'absolute',
                                ...target.style,
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                border: isTargetSelected ? '2px solid var(--accent)' : '2px dashed var(--control-border)',
                                background: isTargetSelected ? 'var(--accent-soft)' : 'transparent',
                                cursor: 'pointer',
                                zIndex: 10,
                                outline: 'none',
                                transition: 'all 0.2s ease',
                              }}
                            />
                          );
                        })}

                        <div
                          style={{
                            position: 'absolute',
                            ...((() => {
                              const pos = settings.overlayPosition || 'middle-left';
                              if (pos === 'middle-left') return { top: '50%', transform: 'translateY(-50%)', left: '44px' };
                              if (pos === 'top-left') return { top: '24px', left: '44px' };
                              if (pos === 'top-right') return { top: '24px', right: '44px' };
                              if (pos === 'bottom-left') return { bottom: '24px', left: '44px' };
                              return { bottom: '24px', right: '44px' };
                            })()),
                            maxWidth: '46%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            textAlign: (settings.overlayPosition || 'middle-left').includes('right') ? 'right' : 'left',
                            alignItems: (settings.overlayPosition || 'middle-left').includes('right') ? 'flex-end' : 'flex-start',
                            transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                            pointerEvents: 'none',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: '1.05rem',
                              fontWeight: 700,
                              color: 'var(--text-1)',
                              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                            }}
                          >
                            Movie title
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', fontWeight: 500 }}>
                            Season 1 · Episode 4 · 50m
                          </span>
                          {settings.overlayShowOverview !== false && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: '1.3' }}>
                              A brief description of the episode content appears here...
                            </span>
                          )}
                          {settings.overlayShowRating !== false && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 700 }}>
                              ★ 8.5 / 10
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </SettingsCard>
            )}

            {/* ─── 4. HOTKEYS SECTION ─── */}
            {(isSearching ? matchesSearch('hotkeys', 'hotkey', 'shortcuts', 'keyboard', 'play', 'rewind', 'forward', 'fullscreen', 'mute', 'rebind') : activeSection === 'hotkeys') && (
              <div className="desktop-only-setting">
                <SettingsCard
                  title="Hotkeys"
                  description="Customizable keyboard shortcuts for playback and navigation controls"
                >
                  <KeyBinder
                    keybinds={settings.keybinds || {}}
                    onKeybindChange={(actionId, newKey) => {
                      const updatedKeybinds = { ...(settings.keybinds || {}), [actionId]: newKey };
                      updateSetting('keybinds', updatedKeybinds);
                      triggerAutosaveToast('Hotkey updated');
                    }}
                    onResetKeybinds={() => {
                      const defaults: Record<string, string> = {};
                      HOTKEY_ACTIONS.forEach((a) => { defaults[a.id] = a.defaultKey; });
                      updateSetting('keybinds', defaults);
                      triggerAutosaveToast('Hotkeys reset');
                    }}
                    onConflict={(msg) => triggerAutosaveToast(msg)}
                  />
                </SettingsCard>
              </div>
            )}

            {/* ─── 5. PLAYER CONTROLS (FORMERLY GRID OVERLAY) ─── */}
            {(isSearching ? matchesSearch('player controls', 'grid overlay', 'hud', 'pinned', 'ordering', 'reorder') : activeSection === 'player-controls') && (
              <SettingsCard
                title="Player controls"
                description="HUD overlay layout, pinned shortcuts, and control ordering"
              >
                <HudPreview
                  order={settings.settingsOrder || DEFAULT_HUD_ORDER}
                  onOrderChange={(newOrder) => {
                    updateSetting('settingsOrder', newOrder);
                    triggerAutosaveToast('HUD ordering updated');
                  }}
                  renderMockButton={renderMockPreviewButton}
                />
              </SettingsCard>
            )}

            {/* ─── 6. PROFILE & STORAGE SECTION (Redesigned 1:1 to Reference Screenshot) ─── */}
            {(isSearching ? matchesSearch('profile & storage', 'profile', 'storage', 'account', 'saves', 'history', 'volume', 'rating', 'sync') : activeSection === 'profile-storage') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', fontFamily: 'Outfit, sans-serif' }}>
                {/* 1. TOP HERO BANNER: Active Profile & Sync Status */}
                <div
                  style={{
                    background: '#121622',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '24px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '24px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  {/* Left: Avatar, Name, Status Pill, Subtitle, and Primary Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div
                        style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                          flexShrink: 0,
                        }}
                      >
                        <User size={24} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '1.28rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' }}>
                            {activeProfileName}
                          </span>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 500,
                              padding: '2px 10px',
                              borderRadius: '9999px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: 'rgba(255, 255, 255, 0.75)',
                            }}
                          >
                            {isCloudProfile ? 'Cloud synced' : 'This device only'}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                          {isCloudProfile ? 'Syncing across your registered devices.' : 'Your data stays in this browser.'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => openAuthModal && openAuthModal('signup')}
                        style={{
                          background: '#6366f1',
                          border: 'none',
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          padding: '8px 20px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 10px rgba(99, 102, 241, 0.35)',
                          transition: 'background 0.2s, transform 0.1s',
                          minHeight: '38px',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#4f46e5')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#6366f1')}
                      >
                        Create account
                      </button>
                      <button
                        type="button"
                        onClick={() => openAuthModal && openAuthModal('login')}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          padding: '8px 20px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          minHeight: '38px',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                      >
                        Log in to cloud
                      </button>
                    </div>
                  </div>

                  {/* Right: Device / Cloud Visual Connector & Segmented Switch */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Box 1: This device */}
                      <div
                        style={{
                          width: '130px',
                          padding: '14px 16px',
                          borderRadius: '12px',
                          background: settings.storageMode !== 'file' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${settings.storageMode !== 'file' ? '#6366f1' : 'rgba(255, 255, 255, 0.08)'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                          textAlign: 'center',
                          transition: 'all 0.2s',
                        }}
                      >
                        <Monitor size={20} color={settings.storageMode !== 'file' ? '#818cf8' : 'rgba(255, 255, 255, 0.4)'} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ffffff' }}>This device</span>
                        <span style={{ fontSize: '0.7rem', color: settings.storageMode !== 'file' ? '#818cf8' : 'rgba(255, 255, 255, 0.45)' }}>
                          Saving here
                        </span>
                      </div>

                      {/* Dashed connector */}
                      <div
                        style={{
                          width: '30px',
                          borderTop: '1px dashed rgba(255, 255, 255, 0.25)',
                        }}
                      />

                      {/* Box 2: Cloud */}
                      <div
                        style={{
                          width: '130px',
                          padding: '14px 16px',
                          borderRadius: '12px',
                          background: settings.storageMode === 'file' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${settings.storageMode === 'file' ? '#6366f1' : 'rgba(255, 255, 255, 0.08)'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                          textAlign: 'center',
                          transition: 'all 0.2s',
                        }}
                      >
                        <Cloud size={20} color={settings.storageMode === 'file' ? '#818cf8' : 'rgba(255, 255, 255, 0.4)'} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ffffff' }}>Cloud</span>
                        <span style={{ fontSize: '0.7rem', color: isCloudProfile ? '#10b981' : 'rgba(255, 255, 255, 0.45)' }}>
                          {isCloudProfile ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                    </div>

                    {/* Segmented Switch underneath */}
                    <div
                      style={{
                        display: 'flex',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '4px',
                        width: '100%',
                        maxWidth: '302px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => updateSetting('storageMode', 'localstorage')}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '7px',
                          border: 'none',
                          cursor: 'pointer',
                          background: settings.storageMode !== 'file' ? '#1e2638' : 'transparent',
                          color: settings.storageMode !== 'file' ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                          boxShadow: settings.storageMode !== 'file' ? '0 1px 4px rgba(0,0,0,0.5)' : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        Local storage
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isCloudProfile) {
                            openAuthModal && openAuthModal('login');
                          } else {
                            updateSetting('storageMode', 'file');
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '7px',
                          border: 'none',
                          cursor: 'pointer',
                          background: settings.storageMode === 'file' ? '#1e2638' : 'transparent',
                          color: settings.storageMode === 'file' ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                          boxShadow: settings.storageMode === 'file' ? '0 1px 4px rgba(0,0,0,0.5)' : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        Cloud sync
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. MAIN 2-COLUMN LAYOUT: Left (Persistence Toggles) & Right (Profiles / Backup) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
                    gap: '20px',
                    alignItems: 'stretch',
                  }}
                >
                  {/* ── LEFT COLUMN: REMEMBER ACROSS SESSIONS ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: 'rgba(255, 255, 255, 0.45)',
                        textTransform: 'uppercase',
                        marginBottom: '10px',
                      }}
                    >
                      REMEMBER ACROSS SESSIONS
                    </div>

                    {/* 2x2 Grid of persistence cards */}
                    <div
                      style={{
                        flex: 1,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '12px',
                        marginBottom: '12px',
                      }}
                    >
                      {/* Card 1: Playback Position */}
                      <div
                        style={{
                          background: '#121622',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '16px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '110px',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Clock size={18} color="rgba(255, 255, 255, 0.45)" />
                          <Switch
                            checked={settings.saveHistory !== false}
                            onChange={(v) => updateSetting('saveHistory', v)}
                            aria-label="Save playback position"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '12px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>
                            Playback position
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                            Resume exactly where you left off
                          </span>
                        </div>
                      </div>

                      {/* Card 2: Audio & Subtitles */}
                      <div
                        style={{
                          background: '#121622',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '16px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '110px',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Captions size={18} color="rgba(255, 255, 255, 0.45)" />
                          <Switch
                            checked={settings.saveTrackPreferences !== false}
                            onChange={(v) => updateSetting('saveTrackPreferences', v)}
                            aria-label="Save audio and subtitle choices"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '12px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>
                            Audio & subtitles
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                            Keep preferred languages
                          </span>
                        </div>
                      </div>

                      {/* Card 3: Volume & Mute */}
                      <div
                        style={{
                          background: '#121622',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '16px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '110px',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Volume2 size={18} color="rgba(255, 255, 255, 0.45)" />
                          <Switch
                            checked={settings.saveVolume !== false}
                            onChange={(v) => updateSetting('saveVolume', v)}
                            aria-label="Save volume and mute status"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '12px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>
                            Volume & mute
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                            Persist sound levels
                          </span>
                        </div>
                      </div>

                      {/* Card 4: Layout */}
                      <div
                        style={{
                          background: '#121622',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '16px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '110px',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <LayoutGrid size={18} color="rgba(255, 255, 255, 0.45)" />
                          <Switch
                            checked={settings.saveSettings !== false}
                            onChange={(v) => updateSetting('saveSettings', v)}
                            aria-label="Save layout arrangement"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '12px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>
                            Layout
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                            Keep your HUD arrangement
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Ask me to rate card */}
                    <div
                      style={{
                        background: '#121622',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>
                          Ask me to rate
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                          How often to prompt for a rating
                        </span>
                      </div>
                      <Select
                        value={settings.ratingThreshold ?? 3}
                        onChange={(val) => updateSetting('ratingThreshold', parseInt(String(val), 10))}
                        options={[
                          { value: 1, label: 'After rating 1 star' },
                          { value: 2, label: 'After rating 2 stars' },
                          { value: 3, label: 'After rating 3 stars' },
                          { value: 4, label: 'After rating 4 stars' },
                          { value: 5, label: 'After rating 5 stars' },
                          { value: 0, label: 'Never ask' },
                        ]}
                      />
                    </div>
                  </div>

                  {/* ── RIGHT COLUMN: PROFILES & BACKUP ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
                    {/* A. PROFILES SECTION */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          color: 'rgba(255, 255, 255, 0.45)',
                          textTransform: 'uppercase',
                          marginBottom: '10px',
                        }}
                      >
                        PROFILES
                      </div>
                      <div
                        style={{
                          background: '#121622',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          flex: 1,
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {/* Active Profile Item */}
                          <div
                            style={{
                              border: '1px solid rgba(99, 102, 241, 0.4)',
                              background: 'rgba(99, 102, 241, 0.08)',
                              borderRadius: '10px',
                              padding: '10px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                            }}
                          >
                            <div
                              style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                flexShrink: 0,
                              }}
                            >
                              <User size={16} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {activeProfileName}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 500 }}>
                                Active
                              </span>
                            </div>
                          </div>

                          {/* Other available profiles */}
                          {availableProfiles
                            .filter((p) => p.userId !== settings.userId)
                            .map((p) => (
                              <div
                                key={p.userId}
                                onClick={() => handleSwitchProfile && handleSwitchProfile(p)}
                                style={{
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  background: 'rgba(255, 255, 255, 0.02)',
                                  borderRadius: '10px',
                                  padding: '10px 14px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  cursor: 'pointer',
                                  transition: 'background 0.2s',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)')}
                              >
                                <div
                                  style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '50%',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    flexShrink: 0,
                                  }}
                                >
                                  <User size={16} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {p.name || p.username || 'Profile'}
                                  </span>
                                  <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                                    Click to switch
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>

                        {/* + Add profile button */}
                        <button
                          type="button"
                          onClick={() => setIsCreateProfileModalOpen && setIsCreateProfileModalOpen(true)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'background 0.2s',
                            marginTop: '6px',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)')}
                        >
                          <Plus size={14} />
                          <span>Add profile</span>
                        </button>
                      </div>
                    </div>

                    {/* B. BACKUP SECTION */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          color: 'rgba(255, 255, 255, 0.45)',
                          textTransform: 'uppercase',
                          marginBottom: '8px',
                        }}
                      >
                        BACKUP
                      </div>
                      <div
                        style={{
                          background: '#121622',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.4 }}>
                          Local data is lost if browser storage is cleared. Keep a copy.
                        </span>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            type="button"
                            onClick={handleExportBackup}
                            style={{
                              flex: 1,
                              padding: '9px 14px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontWeight: 600,
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                          >
                            <Download size={14} />
                            <span>Export</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              flex: 1,
                              padding: '9px 14px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontWeight: 600,
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                          >
                            <Upload size={14} />
                            <span>Import</span>
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleImportBackup}
                            style={{ display: 'none' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. DANGER ZONE SECTION: Centered in the middle of the width */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: '4px' }}>
                  <div style={{ width: '100%', maxWidth: '540px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: '#ef4444',
                        textTransform: 'uppercase',
                        marginBottom: '8px',
                        textAlign: 'center',
                      }}
                    >
                      DANGER ZONE
                    </div>
                    <div
                      style={{
                        width: '100%',
                        background: '#121622',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '14px',
                        padding: '16px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        gap: '12px',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                      }}
                    >
                      <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.4 }}>
                        Removes this profile and its history from this device.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (setIsRemoveModalOpen) {
                            setDeleteTargetProfile && setDeleteTargetProfile({ userId: settings.userId, name: activeProfileName });
                            setIsRemoveModalOpen(true);
                          } else {
                            triggerAutosaveToast('Profile removed');
                          }
                        }}
                        style={{
                          width: '100%',
                          maxWidth: '280px',
                          padding: '10px 18px',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.28)',
                          borderRadius: '8px',
                          color: '#ef4444',
                          fontWeight: 600,
                          fontSize: '0.84rem',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.16)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)')}
                      >
                        Remove profile
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── 7. CONNECTED SERVICES SECTION ─── */}
            {(isSearching ? matchesSearch('connected services', 'theintrodb', 'trakt', 'opensubtitles', 'tmdb', 'api', 'keys') : activeSection === 'connected-services') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <ServiceCard
                  id="theintrodb"
                  name="TheIntroDB"
                  description="Community database for skipping intro and outro segments automatically"
                  isConnected={true}
                  introDbMode={settings.theIntroDbMode || 'fetch'}
                  onIntroDbModeChange={(mode) => updateSetting('theIntroDbMode', mode)}
                  introDbApiKey={settings.theIntroDbApiKey || ''}
                  onIntroDbApiKeyChange={(k) => updateSetting('theIntroDbApiKey', k)}
                  onTestConnection={async () => {
                    await new Promise((r) => setTimeout(r, 600));
                    return true;
                  }}
                />

                <ServiceCard
                  id="trakt"
                  name="Trakt.tv"
                  description="Scrobble movies and series, sync watch history, and sync bookmarks"
                  isConnected={!!settings.traktAccessToken}
                  onConnectTrakt={handleConnectTrakt}
                  onUseDeviceCode={handleUseDeviceCode}
                  onDisconnectTrakt={handleDisconnectTrakt}
                  traktSyncHistory={settings.traktSyncHistory !== false}
                  onTraktSyncHistoryChange={(v) => updateSetting('traktSyncHistory', v)}
                  traktSyncBookmarks={settings.traktSyncFavorites !== false}
                  onTraktSyncBookmarksChange={(v) => updateSetting('traktSyncFavorites', v)}
                  deviceCodeInfo={deviceCodeInfo}
                  onTestConnection={async () => {
                    if (!settings.traktAccessToken) return false;
                    const res = await testTraktApi(settings.traktAccessToken);
                    return res.ok;
                  }}
                />

                <ServiceCard
                  id="opensubtitles"
                  name="OpenSubtitles"
                  description="Direct multi-language subtitle search and automated downloads"
                  isConnected={!!settings.openSubtitlesApiKey}
                  apiKey={settings.openSubtitlesApiKey || ''}
                  onSaveApiKey={(key) => updateSetting('openSubtitlesApiKey', key)}
                  onDisconnectApiKey={() => updateSetting('openSubtitlesApiKey', '')}
                  onTestConnection={async () => {
                    await new Promise((r) => setTimeout(r, 700));
                    return !!settings.openSubtitlesApiKey;
                  }}
                />

                <ServiceCard
                  id="tmdb"
                  name="TMDB"
                  description="The Movie Database metadata, poster art, synopsis, and community ratings"
                  isConnected={!!settings.tmdbApiKey}
                  apiKey={settings.tmdbApiKey || ''}
                  onSaveApiKey={(key) => updateSetting('tmdbApiKey', key)}
                  onDisconnectApiKey={() => updateSetting('tmdbApiKey', '')}
                  onTestConnection={async () => {
                    await new Promise((r) => setTimeout(r, 700));
                    return !!settings.tmdbApiKey;
                  }}
                />
              </div>
            )}

            {/* ─── 8. LOADING ANIMATION SECTION ─── */}
            {(isSearching ? matchesSearch('loading animation', 'spinner', 'loader', 'preset', 'scale') : activeSection === 'loading-animation') && (
              <SettingsCard
                title="Loading animation"
                description="Select animated buffering spinners, test backdrops, and customize size"
              >
                <SpinnerPresets
                  currentPreset={settings.spinnerPreset || 'fire-circle'}
                  onSelectPreset={(p) => {
                    updateSetting('spinnerPreset', p);
                    updateSetting('customLoaderType', 'default');
                    updateSetting('customLoaderUrl', '');
                    triggerAutosaveToast(`Selected ${p} preset`);
                  }}
                  customLoaderType={settings.customLoaderType || 'default'}
                  customLoaderUrl={settings.customLoaderUrl || ''}
                  onCustomLoaderChange={(type, url) => {
                    updateSetting('customLoaderType', type);
                    updateSetting('customLoaderUrl', url);
                    triggerAutosaveToast('Custom animation updated');
                  }}
                />
              </SettingsCard>
            )}

            {/* ─── 9. LOCAL ENGINE SECTION ─── */}
            {featureFlagService.isFeatureEnabled('localEngine') && (isSearching ? matchesSearch('local engine', 'sidecar', 'service', 'port', 'cache', 'cli', 'command') : activeSection === 'local-engine') && (
              <SettingsCard
                title="Local engine"
                description="High-speed companion service for local demuxing, cache blocks, and hardware acceleration"
                badge={
                  <span className="service-status-pill">
                    {sidecarStatus}
                  </span>
                }
                headerAction={
                  <button
                    type="button"
                    onClick={handleCheckSidecarStatus}
                    disabled={checkingSidecar}
                    className="settings-btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  >
                    <RefreshCw size={12} className={checkingSidecar ? 'animate-spin' : ''} />
                    <span>{checkingSidecar ? 'Checking...' : 'Check status'}</span>
                  </button>
                }
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>
                      Local background service
                    </span>
                    <span style={{ fontSize: '0.775rem', color: 'var(--text-3)' }}>
                      Port 45454 · 2 MB cache blocks
                    </span>
                  </div>

                  <span className="service-status-pill">
                    {sidecarStatus}
                  </span>
                </div>

                <SettingRow
                  title="CLI startup command"
                  description="Run this command in terminal to launch or install the local engine"
                  control={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <code
                        style={{
                          padding: '6px 12px',
                          background: 'var(--surface-3)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                          color: 'var(--text-1)',
                          userSelect: 'all',
                        }}
                      >
                        npx valor-service
                      </code>
                      <button
                        type="button"
                        aria-label="Copy CLI command"
                        className="settings-btn-secondary"
                        style={{ padding: '6px 10px' }}
                        onClick={() => {
                          navigator.clipboard.writeText('npx valor-service');
                          setCopiedCli(true);
                          setTimeout(() => setCopiedCli(false), 2000);
                          triggerAutosaveToast('Command copied');
                        }}
                      >
                        {copiedCli ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedCli ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  }
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  <button
                    type="button"
                    onClick={handleCheckSidecarStatus}
                    className="settings-btn-secondary"
                  >
                    <RefreshCw size={14} />
                    <span>Check status</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInstallGuideModal(true)}
                    className="settings-btn-primary"
                  >
                    <span>Install guide</span>
                  </button>
                </div>
              </SettingsCard>
            )}

            {/* Search No Results State */}
            {isSearching && (
              <div
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-6)',
                  color: 'var(--text-3)',
                  fontSize: '0.85rem',
                }}
              >
                Showing search results for &ldquo;{searchQuery}&rdquo;
              </div>
            )}

          </div>
        </main>
      </div>
    </div>

      {/* Autosave Toast */}
      <Toast
        message={toastMessage}
        visible={showSavedToast}
        onDismiss={() => setShowSavedToast(false)}
      />

      {/* Local Engine Install Guide Modal */}
      {showInstallGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
          onClick={() => setShowInstallGuideModal(false)}
        >
          <div
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-6)',
              maxWidth: '520px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-1)' }}>
              Local engine install guide
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: '1.5' }}>
              The Valor Local Engine runs locally on port 45454 to deliver seamless 2 MB caching, direct media decoding, and high-performance playback.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>
                1. Run in PowerShell or Terminal
              </span>
              <pre
                style={{
                  padding: 'var(--space-3)',
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  color: 'var(--text-1)',
                  margin: 0,
                  overflowX: 'auto',
                }}
              >
                npx valor-service
              </pre>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>
                2. Verify connection
              </span>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-3)' }}>
                Once running, click &ldquo;Check status&rdquo; to confirm the status turns Operational.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="settings-btn-primary"
                onClick={() => setShowInstallGuideModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
