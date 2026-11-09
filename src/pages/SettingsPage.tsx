import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  RotateCcw as RestoreIcon, ChevronRight, ArrowLeft, Radio
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
  const [mobileDetail, setMobileDetail] = useState<SettingsSectionId | null>(() => settingsTab ? resolveSectionId(settingsTab) : null);
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
      setMobileDetail(resolved);
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
    <div className="settings-workspace" role="region" aria-label="Settings Area">
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
                  <span className="mobile-settings-row-desc">Theme, language, display</span>
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
                onClick={() => { setMobileDetail('hotkeys'); setActiveSection('hotkeys'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">Hotkeys</span>
                  <span className="mobile-settings-row-desc">Gestures</span>
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
              <button
                type="button"
                className="mobile-settings-row-btn"
                onClick={() => { setMobileDetail('local-engine'); setActiveSection('local-engine'); }}
              >
                <div className="mobile-settings-row-text">
                  <span className="mobile-settings-row-title">Local engine</span>
                  <span className="mobile-settings-row-desc">Run streams on your machine</span>
                </div>
                <ChevronRight size={18} className="mobile-settings-chevron" />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="mobile-detail-header">
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
                 mobileDetail === 'loading-animation' ? 'Loading animation' :
                 mobileDetail === 'local-engine' ? 'Local engine' : 'Settings'}
              </h2>
            </div>

            {/* General detail view special section: scrollable chips + 2-column theme preview */}
            {mobileDetail === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="settings-anchor-chips" style={{ overflowX: 'auto', paddingBottom: '4px' }}>
                  {[
                    { id: 'card-appearance', label: 'Appearance' },
                    { id: 'card-comfort', label: 'Comfort' },
                    { id: 'card-language', label: 'Language' },
                    { id: 'card-history', label: 'History' },
                    { id: 'card-overlays', label: 'Display' },
                    { id: 'card-behaviour', label: 'Shortcuts' },
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

                <div className="mobile-theme-preview-grid">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = settings.theme === theme.id || (!settings.theme && theme.id === 'midnight-slate');
                    return (
                      <div
                        key={theme.id}
                        onClick={() => updateSetting('theme', theme.id)}
                        style={{
                          background: theme.surface,
                          border: isSelected ? '2px solid var(--ac, var(--accent))' : '1px solid var(--ln, var(--border))',
                          borderRadius: '14px',
                          padding: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: theme.text }}>{theme.name}</span>
                          {isSelected && <Check size={14} color="var(--ac, var(--accent))" />}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: theme.bg, border: '1px solid rgba(255,255,255,0.2)' }} />
                          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: theme.dot }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Loading animation detail view: radio list + live preview card */}
            {mobileDetail === 'loading-animation' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { id: 'monogram', label: 'Monogram draw', desc: 'Two crimson strokes tracing the V mark' },
                    { id: 'satin', label: 'Satin sweep', desc: 'VALOR wordmark with slow light pass' },
                    { id: 'letters', label: 'Letter rise', desc: 'VALOR letters focusing in one by one' },
                  ].map((anim) => {
                    const isSelected = (settings.loadingAnimation || 'monogram') === anim.id;
                    return (
                      <div
                        key={anim.id}
                        onClick={() => updateSetting('loadingAnimation', anim.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 16px',
                          background: 'var(--s1, var(--surface-1))',
                          border: isSelected ? '1.5px solid var(--ac, var(--accent))' : '1px solid var(--ln, var(--border))',
                          borderRadius: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tx, var(--text-1))' }}>{anim.label}</span>
                          <span style={{ fontSize: '12px', color: 'var(--mut, var(--text-3))' }}>{anim.desc}</span>
                        </div>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: isSelected ? '6px solid var(--ac, var(--accent))' : '2px solid var(--ln, var(--border))',
                          background: 'transparent',
                          boxSizing: 'border-box'
                        }} />
                      </div>
                    );
                  })}
                </div>

                {/* Live Preview Card */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--mut, var(--text-3))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Live Preview
                  </span>
                  <div
                    style={{
                      height: '180px',
                      position: 'relative',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      border: '1px solid var(--ln, var(--border))',
                      background: '#000'
                    }}
                  >
                    <PlayerLoader
                      visible={true}
                      variant="buffering"
                      animationStyle={settings.loadingAnimation || 'monogram'}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Local engine detail view: 42x24 switch wired to existing engine setting */}
            {mobileDetail === 'local-engine' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    background: 'var(--s1, var(--surface-1))',
                    border: '1px solid var(--ln, var(--border))',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: sidecarStatus === 'Operational' ? '#22c55e' : '#ef4444'
                        }}
                      />
                      <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tx, var(--text-1))' }}>
                        Local Engine ({sidecarStatus})
                      </span>
                    </div>
                    <Switch
                      checked={sidecarStatus === 'Operational'}
                      onChange={() => handleCheckSidecarStatus()}
                    />
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--mut, var(--text-3))', lineHeight: '1.4' }}>
                    Handles MKV, audio tracks and embedded subtitles directly on your machine.
                  </p>
                </div>
              </div>
            )}

            {/* Other sections info/card */}
            {mobileDetail && !['general', 'loading-animation', 'local-engine'].includes(mobileDetail) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ background: 'var(--s1, var(--surface-1))', border: '1px solid var(--ln, var(--border))', borderRadius: '16px', padding: '16px' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--tx, var(--text-1))' }}>
                    {mobileDetail === 'subtitles' ? 'Subtitle Preferences' :
                     mobileDetail === 'pause-overlay' ? 'Pause Overlay Settings' :
                     mobileDetail === 'hotkeys' ? 'Hotkeys & Touch Gestures' :
                     mobileDetail === 'player-controls' ? 'Player Controls' :
                     mobileDetail === 'profile-storage' ? 'Profiles & Storage' :
                     mobileDetail === 'connected-services' ? 'External Services' : 'Section Settings'}
                  </p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--mut, var(--text-3))', lineHeight: '1.4' }}>
                    {mobileDetail === 'subtitles' && 'Default audio and subtitle tracks, sizes, and font styles are saved and applied automatically to all played media.'}
                    {mobileDetail === 'pause-overlay' && 'Controls dim overlay and preview cards when video is paused.'}
                    {mobileDetail === 'hotkeys' && 'Touch tap toggles controls. Double tap left/right seeks 10 seconds.'}
                    {mobileDetail === 'player-controls' && 'Configure scrubber sensitivity, speed cycle steps, and audio boost.'}
                    {mobileDetail === 'profile-storage' && `${availableProfiles.length || 1} active profile. Video playback resume positions are stored locally.`}
                    {mobileDetail === 'connected-services' && 'Trakt scrobbling, TMDB metadata fetching, and OpenSubtitles auto-search status.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Settings View (> 768px) */}
      <div className="desktop-settings-view settings-container">
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
                        { id: 'card-appearance', label: 'Appearance' },
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

                {/* 1.1 Appearance Card with Themes Gallery */}
                {matchesSearch('appearance', 'theme', 'color', 'midnight', 'ember', 'paper', 'black-ops') && (
                  <div id="card-appearance">
                    <SettingsCard
                      title="Appearance"
                      description="Pick a color theme. It applies right away."
                    >
                      <div
                        role="radiogroup"
                        aria-label="Color themes"
                        className="settings-theme-grid"
                      >
                        {THEME_OPTIONS.map((t) => {
                          const currentTheme = settings.theme || 'midnight-slate';
                          const isSelected = currentTheme === t.id;
                          return (
                            <div
                              key={t.id}
                              role="radio"
                              tabIndex={0}
                              aria-checked={isSelected}
                              aria-label={t.name}
                              onClick={() => {
                                updateSetting('theme', t.id);
                                let resolved = t.id;
                                if (t.id === 'auto') {
                                  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                                  resolved = dark ? 'midnight-slate' : 'soft-paper';
                                }
                                document.documentElement.setAttribute('data-theme', resolved);
                                triggerAutosaveToast(`Theme: ${t.name}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === ' ' || e.key === 'Enter') {
                                  e.preventDefault();
                                  updateSetting('theme', t.id);
                                  let resolved = t.id;
                                  if (t.id === 'auto') {
                                    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                                    resolved = dark ? 'midnight-slate' : 'soft-paper';
                                  }
                                  document.documentElement.setAttribute('data-theme', resolved);
                                  triggerAutosaveToast(`Theme: ${t.name}`);
                                }
                              }}
                              className={`settings-theme-card ${isSelected ? 'selected' : ''}`}
                            >
                              {/* Swatch Preview Frame */}
                              <div
                                style={{
                                  height: '48px',
                                  borderRadius: '6px',
                                  background: t.bg,
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  padding: '6px 8px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  boxSizing: 'border-box',
                                  position: 'relative',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ height: '6px', width: '32px', background: t.surface, borderRadius: '3px' }} />
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.dot }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  <div style={{ height: '3px', width: '48px', background: t.text, borderRadius: '2px', opacity: 0.8 }} />
                                  <div style={{ height: '3px', width: '28px', background: t.text, borderRadius: '2px', opacity: 0.4 }} />
                                </div>
                                {isSelected && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      bottom: '5px',
                                      right: '6px',
                                      width: '16px',
                                      height: '16px',
                                      borderRadius: '50%',
                                      background: 'var(--accent)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                    }}
                                  >
                                    <Check size={10} color="var(--on-accent)" strokeWidth={3} />
                                  </div>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-1)' }}>
                                  {t.name}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </SettingsCard>
                  </div>
                )}

                {/* 1.2 Comfort Card */}
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

            {/* ─── 6. PROFILE & STORAGE SECTION ─── */}
            {(isSearching ? matchesSearch('profile & storage', 'profile', 'storage', 'account', 'saves', 'history', 'volume', 'rating', 'sync') : activeSection === 'profile-storage') && (
              <SettingsCard
                title="Profile & storage"
                description="Active profile credentials, save location, and storage persistence switches"
              >
                {/* Active Profile Card */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-4)',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'var(--surface-3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent)',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <User size={22} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)' }}>
                          {activeProfileName}
                        </span>
                        <span className="service-status-pill">
                          {isCloudProfile ? 'Cloud synced' : 'This device only'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                        {isCloudProfile ? `User ID: ${settings.userId}` : 'Local profile stored on this device'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="settings-btn-primary"
                      onClick={() => openAuthModal && openAuthModal('signup')}
                    >
                      Create account
                    </button>
                    <button
                      type="button"
                      className="settings-btn-secondary"
                      onClick={() => openAuthModal && openAuthModal('login')}
                    >
                      Log in to cloud
                    </button>
                    <DestructiveButton
                      label="Remove profile"
                      confirmLabel="Click again to confirm"
                      onConfirm={() => {
                        if (setIsRemoveModalOpen) {
                          setDeleteTargetProfile && setDeleteTargetProfile({ userId: settings.userId, name: activeProfileName });
                          setIsRemoveModalOpen(true);
                        } else {
                          triggerAutosaveToast('Profile removed');
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Saved Profiles Chips with + Add Profile */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
                    Saved profiles
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {availableProfiles.map((p) => {
                      const isCurrent = p.userId === settings.userId;
                      return (
                        <button
                          key={p.userId}
                          type="button"
                          className={`settings-segmented-item ${isCurrent ? 'active' : ''}`}
                          style={{
                            padding: '6px 14px',
                            background: isCurrent ? 'var(--surface-3)' : 'var(--surface-2)',
                            border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                            color: isCurrent ? 'var(--text-1)' : 'var(--text-2)',
                          }}
                          onClick={() => handleSwitchProfile && handleSwitchProfile(p)}
                        >
                          {p.name || 'Profile'}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      className="settings-btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={() => setIsCreateProfileModalOpen && setIsCreateProfileModalOpen(true)}
                    >
                      <Plus size={14} />
                      <span>Add profile</span>
                    </button>
                  </div>
                </div>

                {/* Save Location & Ask Me to Rate */}
                <SettingRow
                  title="Save location"
                  description="Where your settings and watch records are saved"
                  control={
                    <Select
                      value={settings.storageMode || 'localstorage'}
                      onChange={(val) => updateSetting('storageMode', val)}
                      options={[
                        { value: 'localstorage', label: 'Local storage' },
                        { value: 'file', label: 'File system' },
                      ]}
                    />
                  }
                />

                <SettingRow
                  title="Ask me to rate"
                  description="Frequency prompt for submitting ratings"
                  control={
                    <Select
                      value={settings.ratingThreshold || 3}
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
                  }
                />

                <SettingRow
                  title="Playback position & history"
                  description="Remember where you left off across sessions"
                  control={
                    <Switch
                      checked={settings.saveHistory !== false}
                      onChange={(v) => updateSetting('saveHistory', v)}
                      aria-label="Save playback position and history"
                    />
                  }
                />

                <SettingRow
                  title="Audio/subtitle choices"
                  description="Remember your preferred audio and subtitle languages"
                  control={
                    <Switch
                      checked={settings.saveTrackPreferences !== false}
                      onChange={(v) => updateSetting('saveTrackPreferences', v)}
                      aria-label="Save track preferences"
                    />
                  }
                />

                <SettingRow
                  title="Volume & mute"
                  description="Persist sound levels and mute status across media"
                  control={
                    <Switch
                      checked={settings.saveVolume !== false}
                      onChange={(v) => updateSetting('saveVolume', v)}
                      aria-label="Save volume and mute state"
                    />
                  }
                />

                <SettingRow
                  title="Layout preferences"
                  description="Keep your custom HUD and UI arrangements"
                  control={
                    <Switch
                      checked={settings.saveSettings !== false}
                      onChange={(v) => updateSetting('saveSettings', v)}
                      aria-label="Save layout preferences"
                    />
                  }
                />
              </SettingsCard>
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
