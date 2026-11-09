import React, { useState, useEffect } from 'react';
import { Zap, Palette, Settings, Check } from 'lucide-react';
import { ValorVIcon } from './ui/ValorVIcon';
import { BottomSheet } from './ui/BottomSheet';
import { sidecarService, type SidecarStatus } from '../services/remote/sidecarService';
import { featureFlagService } from '../services/featureFlags';
import './MobileTopBar.css';

export interface MobileTopBarProps {
  onNavigateSettings: () => void;
  onNavigateHome: () => void;
}

const THEME_OPTIONS = [
  { id: 'auto', name: 'Auto (System)', bg: '#0b0e14', ac: '#9db3f6' },
  { id: 'midnight-slate', name: 'Midnight Slate', bg: '#0b0e14', ac: '#9db3f6' },
  { id: 'ember-night', name: 'Ember Night', bg: '#100c09', ac: '#f59e4b' },
  { id: 'forest-mist', name: 'Forest Mist', bg: '#08100d', ac: '#7fd6a4' },
  { id: 'valor-crimson', name: 'Valor Crimson', bg: '#0f0a0b', ac: '#ff6b78' },
  { id: 'black-ops', name: 'Black-Ops OLED', bg: '#000000', ac: '#ff4d5b' },
  { id: 'soft-paper', name: 'Soft Paper', bg: '#f1ebe0', ac: '#3b5bdb' },
  { id: 'valor-cyber-dark', name: 'Cyber Dark', bg: '#07090d', ac: '#ff5470' },
  { id: 'studio-light', name: 'Studio Light', bg: '#f6f7fa', ac: '#d6283c' },
];

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  onNavigateSettings,
  onNavigateHome,
}) => {
  const [engineStatus, setEngineStatus] = useState<SidecarStatus>(() => sidecarService.getStatus());
  const [engineSheetOpen, setEngineSheetOpen] = useState(false);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return document.documentElement.getAttribute('data-theme') || 'midnight-slate';
  });

  useEffect(() => {
    const unsub = sidecarService.subscribe((status) => {
      setEngineStatus(status);
    });
    return () => unsub();
  }, []);

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
    setThemeSheetOpen(false);
  };

  const isEngineRunning = engineStatus.isAvailable;

  const toggleEngine = async () => {
    if (isEngineRunning) {
      featureFlagService.setFeatureState('localEngine', false, true);
      await sidecarService.checkHealth();
    } else {
      featureFlagService.setFeatureState('localEngine', true, true);
      await sidecarService.checkHealth();
    }
  };

  return (
    <>
      <header className="mobile-top-bar" aria-label="Valor Mobile Navigation">
        {/* Left: V Logo + "Valor" Brand */}
        <button
          type="button"
          className="mtb-brand"
          onClick={onNavigateHome}
          aria-label="Valor Home"
        >
          <ValorVIcon width={24} height={26} />
          <span className="mtb-wordmark">Valor</span>
        </button>

        {/* Right: Three 38x38 Icon Buttons */}
        <div className="mtb-actions">
          {/* 1. Local Engine Button */}
          <button
            type="button"
            className="mtb-icon-btn"
            onClick={() => setEngineSheetOpen(true)}
            aria-label={`Local engine: ${isEngineRunning ? 'Running' : 'Stopped'}`}
            title="Local Engine"
          >
            <Zap size={18} />
            {isEngineRunning && <span className="mtb-engine-dot" aria-hidden="true" />}
          </button>

          {/* 2. Theme Palette Button */}
          <button
            type="button"
            className="mtb-icon-btn"
            onClick={() => setThemeSheetOpen(true)}
            aria-label="Change Color Theme"
            title="Color Theme"
          >
            <Palette size={18} />
          </button>

          {/* 3. Settings Gear Button */}
          <button
            type="button"
            className="mtb-icon-btn"
            onClick={onNavigateSettings}
            aria-label="Open Settings"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Engine Bottom Sheet */}
      <BottomSheet
        isOpen={engineSheetOpen}
        onClose={() => setEngineSheetOpen(false)}
        title="Local Engine"
      >
        <div className="mtb-sheet-body">
          <div className="mtb-engine-status-row">
            <span
              className="mtb-engine-status-bulb"
              style={{ background: isEngineRunning ? '#22c55e' : '#ef4444' }}
            />
            <span className="mtb-engine-status-text">
              {isEngineRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          <p className="mtb-engine-desc">
            Handles MKV, audio tracks and embedded subtitles.
          </p>
          <button
            type="button"
            className={`mtb-engine-toggle-btn ${isEngineRunning ? 'stop' : 'start'}`}
            onClick={toggleEngine}
          >
            {isEngineRunning ? 'Stop Engine' : 'Start Engine'}
          </button>
        </div>
      </BottomSheet>

      {/* Theme Bottom Sheet */}
      <BottomSheet
        isOpen={themeSheetOpen}
        onClose={() => setThemeSheetOpen(false)}
        title="Color Theme"
      >
        <div className="mtb-theme-grid">
          {THEME_OPTIONS.map((t) => {
            const isSelected = currentTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`mtb-theme-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelectTheme(t.id)}
              >
                {/* 44px tall mini preview */}
                <div
                  className="mtb-theme-preview"
                  style={{ background: t.bg }}
                >
                  <span
                    className="mtb-theme-preview-dot"
                    style={{ background: t.ac }}
                  />
                  <div className="mtb-theme-preview-line line-1" />
                  <div className="mtb-theme-preview-line line-2" />
                </div>
                <div className="mtb-theme-label-row">
                  <span className="mtb-theme-name">{t.name}</span>
                  {isSelected && <Check size={14} className="mtb-theme-check" />}
                </div>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
};

export default MobileTopBar;
