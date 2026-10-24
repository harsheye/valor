import React, { useState, useRef, useEffect } from 'react';
import { Check, Sparkles, Search, Download, Globe, Key, RefreshCw } from 'lucide-react';
import type { CustomAudioTrack, CustomSubtitleTrack } from '../types/media';
import type { MediaStream } from '../services/ffmpeg';
import { CustomSelect } from './CustomSelect';
import { trimSubtitleName } from '../utils/embedSubtitleStorage';

const fontOptions = [
  { value: 'sans-serif', label: 'Default' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'outfit', label: 'Outfit' },
  { value: 'cinzel', label: 'Cinzel' },
  { value: 'serif', label: 'Playfair' },
  { value: 'monospace', label: 'Mono' }
];

export interface AudioSubPopoverProps {
  audioStreams: MediaStream[];
  audioTracks: CustomAudioTrack[];
  selectedAudioTrack: CustomAudioTrack | null;
  setSelectedAudioTrack: (track: CustomAudioTrack | null) => void;
  setActiveAudioStreamIndex: (idx: number | null) => void;
  handleSelectEmbeddedAudio: (index: number, codec: string, language?: string) => Promise<void>;
  customAudioInputRef: React.RefObject<HTMLInputElement | null>;
  
  subtitleStreams: MediaStream[];
  subtitleTracks: CustomSubtitleTrack[];
  selectedSubTrack: CustomSubtitleTrack | null;
  setSelectedSubTrack: (track: CustomSubtitleTrack | null) => void;
  setActiveSubStreamIndex: (idx: number | null) => void;
  handleSelectEmbeddedSubtitle: (index: number, codec: string, language?: string) => Promise<void>;
  customSubInputRef: React.RefObject<HTMLInputElement | null>;
  
  currentTime: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  setCurrentTime: (time: number) => void;
  setShowAudioSubMenu: (show: boolean) => void;
  audioSubTimeoutRef: React.RefObject<any>;
  
  // Helpers
  getLangLabel: (lang?: string, fallback?: string) => string;
  formatTime: (secs: number) => string;
  cleanSubtitleText: (text: string) => string;

  subSettings: any;
  onUpdateSubSettings: (settings: any) => void;
  audioBoost: number;
  setAudioBoost: (boost: number) => void;

  openSubtitles?: any[];
  isOpenSubLoading?: boolean;
  onDownloadOpenSubtitle?: (fileId: number, fileName: string, language: string) => Promise<void>;
  hasFetchedOpenSubtitles?: boolean;
  onFetchOpenSubtitles?: (customQuery?: string) => void;

  showAudioControl?: boolean;
  showSubtitleControl?: boolean;
  subFileOnly?: boolean;
  allowSubUpload?: boolean;
}

export const AudioSubPopover: React.FC<AudioSubPopoverProps> = ({
  audioStreams,
  audioTracks,
  selectedAudioTrack,
  setSelectedAudioTrack,
  setActiveAudioStreamIndex,
  handleSelectEmbeddedAudio,
  customAudioInputRef,
  subtitleStreams,
  subtitleTracks,
  selectedSubTrack,
  setSelectedSubTrack,
  setActiveSubStreamIndex,
  handleSelectEmbeddedSubtitle,
  customSubInputRef,
  currentTime,
  videoRef,
  setCurrentTime,
  setShowAudioSubMenu,
  audioSubTimeoutRef,
  getLangLabel,
  formatTime,
  cleanSubtitleText,
  subSettings,
  onUpdateSubSettings,
  audioBoost,
  setAudioBoost,
  openSubtitles = [],
  isOpenSubLoading = false,
  onDownloadOpenSubtitle,
  hasFetchedOpenSubtitles = false,
  onFetchOpenSubtitles,
  showAudioControl = true,
  showSubtitleControl = true,
  subFileOnly = false,
  allowSubUpload = true
}) => {
  const [subSearchQuery, setSubSearchQuery] = useState('');
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [apiKeyVal, setApiKeyVal] = useState(() => {
    try {
      const saved = localStorage.getItem('valor_settings');
      if (saved) return JSON.parse(saved).openSubtitlesApiKey || '';
    } catch {}
    return '';
  });
  const [showCustomSearch, setShowCustomSearch] = useState(false);
  const [customSearchText, setCustomSearchText] = useState('');

  const hasApiKey = Boolean(apiKeyVal.trim());

  const handleSaveApiKey = () => {
    try {
      const saved = localStorage.getItem('valor_settings');
      const parsed = saved ? JSON.parse(saved) : {};
      parsed.openSubtitlesApiKey = apiKeyVal.trim();
      localStorage.setItem('valor_settings', JSON.stringify(parsed));
      setShowKeyInput(false);
      if (onFetchOpenSubtitles) {
        onFetchOpenSubtitles(customSearchText.trim() || undefined);
      }
    } catch (e) {
      console.error('Failed saving OpenSubtitles API key:', e);
    }
  };

  const handleDownload = async (sub: any) => {
    setDownloadingFileId(sub.fileId);
    try {
      if (onDownloadOpenSubtitle) {
        await onDownloadOpenSubtitle(sub.fileId, sub.fileName, sub.language);
      }
    } finally {
      setDownloadingFileId(null);
    }
  };
  
  // Use subSettings for persistence, defaulting to false
  const showStyleColumn = subSettings?.showStyleColumn ?? false;
  const showViewColumn = subSettings?.showViewColumn ?? false;
  
  void setActiveAudioStreamIndex; // consumed by parent; kept in props for potential future use

  // Ref to transcript cues container for auto-scrolling
  const transcriptListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showViewColumn || !selectedSubTrack) return;
    const activeCueEl = transcriptListRef.current?.querySelector('.transcript-cue-item.active');
    if (activeCueEl) {
      activeCueEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentTime, showViewColumn, selectedSubTrack]);

  // Dynamic layout calculations based on active columns
  const effectiveAudioVisible = showAudioControl !== false;
  const effectiveSubVisible = showSubtitleControl !== false;

  let baseCols: string[] = [];
  let baseWidth = 0;

  if (effectiveAudioVisible) {
    baseCols.push('minmax(210px, 1fr)');
    baseWidth += 230;
  }
  if (effectiveSubVisible) {
    baseCols.push('minmax(210px, 1fr)');
    baseWidth += 230;
  }
  if (baseCols.length === 0) {
    baseCols.push('minmax(210px, 1fr)');
    baseWidth = 230;
  }

  if (showViewColumn) {
    baseCols.push('minmax(270px, 1.2fr)');
    baseWidth += 290;
  }
  if (showStyleColumn) {
    baseCols.push('minmax(300px, 1.3fr)');
    baseWidth += 320;
  }

  const popoverWidth = Math.max(baseWidth + 30, 280);
  const gridCols = baseCols.join(' ');

  return (
    <div 
      className="audio-sub-popover-center animate-fade-in"
      style={{ 
        width: `${popoverWidth}px`, 
        maxWidth: 'calc(100vw - 32px)',
        overflowX: 'auto',
        overflowY: 'hidden',
        boxSizing: 'border-box'
      }}
      onMouseEnter={() => {
        if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
      }}
    >
      <div className="popover-cols" style={{ gridTemplateColumns: gridCols, height: '100%' }}>
        {/* Audio Column */}
        {effectiveAudioVisible && (
          <div className="popover-col">
            <h4 style={{ flexShrink: 0 }}>Audio</h4>
            <div className="popover-options">
              {/* Original / Native Stream Audio (always available) */}
              <label 
                className={`popover-option ${selectedAudioTrack === null ? 'active' : ''}`}
                onClick={() => {
                  setSelectedAudioTrack(null);
                  setActiveAudioStreamIndex(null);
                  setShowAudioSubMenu(false);
                }}
              >
                <input type="radio" name="audio-lang" checked={selectedAudioTrack === null} readOnly />
                <span>Original (Default)</span>
                {selectedAudioTrack === null && <Check size={14} className="check-icon" />}
              </label>

              {/* Scanned/Probed Embedded Tracks */}
              {audioStreams.map((s) => {
                const active = selectedAudioTrack?.streamIndex === s.index;
                const label = getLangLabel(s.language, `Track #${s.index}`);
                return (
                  <label key={`embed-aud-${s.index}`} className={`popover-option ${active ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (active) return; handleSelectEmbeddedAudio(s.index, s.codec, s.language); setShowAudioSubMenu(false); }}>
                    <input type="radio" name="audio-lang" checked={active} readOnly />
                    <span>{label}</span>
                    {active && <Check size={14} className="check-icon" />}
                  </label>
                );
              })}

              {/* Custom Uploaded Tracks */}
              {audioTracks.map((track) => {
                const active = selectedAudioTrack?.id === track.id;
                return (
                  <label key={track.id} className={`popover-option ${active ? 'active' : ''}`} onClick={() => { setSelectedAudioTrack(track); setShowAudioSubMenu(false); }}>
                    <input type="radio" name="audio-lang" checked={active} readOnly />
                    <span>{track.name}</span>
                    {active && <Check size={14} className="check-icon" />}
                  </label>
                );
              })}

              {/* Custom Add Trigger */}
              <label className="popover-option add-custom-btn" onClick={() => { customAudioInputRef.current?.click(); setShowAudioSubMenu(false); }}>
                <span>+ Add Custom File</span>
              </label>

              {/* Audio Boost (Sound Boost) Options */}
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))', paddingTop: '0.75rem' }}>
                <h4 style={{ marginBottom: '0.4rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary, rgba(255, 255, 255, 0.5))' }}>Sound Boost</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label className={`popover-option ${audioBoost === 100 ? 'active' : ''}`} onClick={() => { setAudioBoost(100); setShowAudioSubMenu(false); }}>
                    <input type="radio" name="audio-boost" checked={audioBoost === 100} readOnly />
                    <span>Normal (100%)</span>
                    {audioBoost === 100 && <Check size={14} className="check-icon" />}
                  </label>
                  <label className={`popover-option ${audioBoost === 150 ? 'active' : ''}`} onClick={() => { setAudioBoost(150); setShowAudioSubMenu(false); }}>
                    <input type="radio" name="audio-boost" checked={audioBoost === 150} readOnly />
                    <span>Boost 150%</span>
                    {audioBoost === 150 && <Check size={14} className="check-icon" />}
                  </label>
                  <label className={`popover-option ${audioBoost === 200 ? 'active' : ''}`} onClick={() => { setAudioBoost(200); setShowAudioSubMenu(false); }}>
                    <input type="radio" name="audio-boost" checked={audioBoost === 200} readOnly />
                    <span>Boost 200%</span>
                    {audioBoost === 200 && <Check size={14} className="check-icon" />}
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subtitles Column */}
        {effectiveSubVisible && (
        <div className="popover-col">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', paddingBottom: '0.35rem', marginBottom: '0.6rem', flexShrink: 0 }}>
            <h4 style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}>Sub</h4>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                type="button"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (!showViewColumn && !selectedSubTrack) {
                    if (subtitleTracks.length > 0) {
                      setSelectedSubTrack(subtitleTracks[subtitleTracks.length - 1]);
                    } else if (subtitleStreams.length > 0) {
                      handleSelectEmbeddedSubtitle(subtitleStreams[0].index, subtitleStreams[0].codec, subtitleStreams[0].language);
                    }
                  }
                  onUpdateSubSettings({ ...subSettings, showViewColumn: !showViewColumn }); 
                }}
                style={{
                  background: showViewColumn ? 'var(--accent-glow, rgba(59, 130, 246, 0.15))' : 'var(--border-subtle, rgba(255, 255, 255, 0.08))',
                  border: `1px solid ${showViewColumn ? 'var(--accent-color, rgba(59, 130, 246, 0.3))' : 'var(--border-color, rgba(255, 255, 255, 0.12))'}`,
                  color: showViewColumn ? 'var(--accent-color, #3b82f6)' : 'var(--text-secondary, rgba(255, 255, 255, 0.7))',
                  borderRadius: '4px',
                  padding: '0.15rem 0.4rem',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.15s ease'
                }}
                title="Toggle subtitle transcript viewer"
              >
                VIEW
              </button>
              <button 
                type="button"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onUpdateSubSettings({ ...subSettings, showStyleColumn: !showStyleColumn }); 
                }}
                style={{
                  background: showStyleColumn ? 'var(--accent-glow, rgba(59, 130, 246, 0.15))' : 'var(--border-subtle, rgba(255, 255, 255, 0.08))',
                  border: `1px solid ${showStyleColumn ? 'var(--accent-color, rgba(59, 130, 246, 0.3))' : 'var(--border-color, rgba(255, 255, 255, 0.12))'}`,
                  color: showStyleColumn ? 'var(--accent-color, #3b82f6)' : 'var(--text-secondary, rgba(255, 255, 255, 0.7))',
                  borderRadius: '4px',
                  padding: '0.15rem 0.4rem',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.15s ease'
                }}
                title="Toggle subtitle styling options"
              >
                STYLE
              </button>
            </div>
          </div>
          <div className="popover-options">
            {/* Off */}
            <label className={`popover-option ${selectedSubTrack === null ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedSubTrack(null); setActiveSubStreamIndex(null); if (!showViewColumn && !showStyleColumn) setShowAudioSubMenu(false); }}>
              <input type="radio" name="sub-lang" checked={selectedSubTrack === null} readOnly />
              <span>Off</span>
              {selectedSubTrack === null && <Check size={14} className="check-icon" />}
            </label>

            {/* Scanned/Probed Embedded Tracks */}
            {!subFileOnly && subtitleStreams.map((s) => {
              const active = selectedSubTrack?.streamIndex === s.index;
              const label = getLangLabel(s.language, `Track #${s.index}`);
              return (
                <label key={`embed-sub-${s.index}`} className={`popover-option ${active ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (active) return; handleSelectEmbeddedSubtitle(s.index, s.codec, s.language); if (!showViewColumn && !showStyleColumn) setShowAudioSubMenu(false); }}>
                  <input type="radio" name="sub-lang" checked={active} readOnly style={{ pointerEvents: 'none' }} />
                  <span>{label}</span>
                  {active && <Check size={14} className="check-icon" />}
                </label>
              );
            })}

            {/* Custom Uploaded Tracks */}
            {subtitleTracks.map((track) => {
              const active = selectedSubTrack?.id === track.id;
              return (
                <label key={track.id} className={`popover-option ${active ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (active) return; setSelectedSubTrack(track); if (!showViewColumn && !showStyleColumn) setShowAudioSubMenu(false); }}>
                  <input type="radio" name="sub-lang" checked={active} readOnly style={{ pointerEvents: 'none' }} />
                  <span>{trimSubtitleName(track.name, track.language)}</span>
                  {active && <Check size={14} className="check-icon" />}
                </label>
              );
            })}

            {/* OpenSubtitles Cloud Section */}
            {!subFileOnly && (
            <>
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '0.5rem 0 0.4rem 0' }}></div>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 0.35rem 0.35rem 0.35rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                color: '#f59e0b',
                fontWeight: 700,
                letterSpacing: '0.06em'
              }}>
                <Globe size={12} style={{ color: '#f59e0b' }} />
                <span>OpenSubtitles</span>
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: hasApiKey ? '#10b981' : '#f59e0b',
                  boxShadow: hasApiKey ? '0 0 6px rgba(16, 185, 129, 0.6)' : '0 0 6px rgba(245, 158, 11, 0.6)'
                }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  title="Search by custom keyword"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCustomSearch(!showCustomSearch);
                  }}
                  style={{
                    background: showCustomSearch ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                    border: 'none',
                    color: showCustomSearch ? '#f59e0b' : 'rgba(255, 255, 255, 0.5)',
                    padding: '3px 5px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Search size={11} />
                </button>

                <button
                  type="button"
                  title={hasApiKey ? "Edit OpenSubtitles API Key" : "Enter OpenSubtitles API Key"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowKeyInput(!showKeyInput);
                  }}
                  style={{
                    background: showKeyInput ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                    border: 'none',
                    color: showKeyInput ? '#f59e0b' : (hasApiKey ? 'rgba(255, 255, 255, 0.4)' : '#f59e0b'),
                    padding: '3px 5px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Key size={11} />
                </button>
              </div>
            </div>

            {/* Inline API Key Drawer */}
            {showKeyInput && (
              <div style={{
                background: 'rgba(20, 20, 20, 0.95)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '0.55rem',
                marginBottom: '0.45rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.8)', fontWeight: 600 }}>
                  OpenSubtitles API Key
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="password"
                    placeholder="Enter API Key..."
                    value={apiKeyVal}
                    onChange={(e) => setApiKeyVal(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '5px',
                      color: '#fff',
                      fontSize: '0.75rem',
                      padding: '4px 8px',
                      outline: 'none'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveApiKey();
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    style={{
                      background: '#f59e0b',
                      color: '#000',
                      border: 'none',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Save
                  </button>
                </div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                  Free key at <span style={{ color: '#f59e0b', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => window.open('https://www.opensubtitles.com/consumers', '_blank')}>opensubtitles.com</span>
                </div>
              </div>
            )}

            {/* Custom Search Query Drawer */}
            {showCustomSearch && (
              <div style={{
                background: 'rgba(25, 25, 25, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '0.45rem',
                marginBottom: '0.45rem',
                display: 'flex',
                gap: '6px'
              }}>
                <input
                  type="text"
                  placeholder="Custom movie or show query..."
                  value={customSearchText}
                  onChange={(e) => setCustomSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (!hasApiKey) {
                        setShowKeyInput(true);
                      } else if (onFetchOpenSubtitles) {
                        onFetchOpenSubtitles(customSearchText.trim());
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '5px',
                    color: '#fff',
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!hasApiKey) {
                      setShowKeyInput(true);
                    } else if (onFetchOpenSubtitles) {
                      onFetchOpenSubtitles(customSearchText.trim());
                    }
                  }}
                  style={{
                    background: 'rgba(245, 158, 11, 0.25)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    color: '#f59e0b',
                    borderRadius: '5px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Search size={11} />
                  <span>Go</span>
                </button>
              </div>
            )}

            {/* The Main Sexy Button */}
            {!hasFetchedOpenSubtitles || openSubtitles.length === 0 ? (
              <button
                type="button"
                className="opensub-sexy-btn"
                disabled={isOpenSubLoading}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!hasApiKey) {
                    setShowKeyInput(true);
                  } else if (onFetchOpenSubtitles) {
                    onFetchOpenSubtitles(customSearchText.trim() || undefined);
                  }
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '8px',
                  background: isOpenSubLoading 
                    ? 'rgba(245, 158, 11, 0.15)' 
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(234, 88, 12, 0.3) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  boxShadow: isOpenSubLoading 
                    ? 'none' 
                    : '0 4px 14px rgba(245, 158, 11, 0.18)',
                  color: '#fbbf24',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: isOpenSubLoading ? 'wait' : 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {isOpenSubLoading ? (
                  <>
                    <RefreshCw size={13} style={{ animation: 'spin-slow 1s linear infinite' }} />
                    <span>Searching OpenSubtitles...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} style={{ color: '#fbbf24' }} />
                    <span>{hasFetchedOpenSubtitles ? 'Retry OpenSubtitles Search' : 'Search OpenSubtitles'}</span>
                  </>
                )}
              </button>
            ) : null}

            {/* Subtitle Results List */}
            {openSubtitles && openSubtitles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '0.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.3rem', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                    {openSubtitles.length} Subtitle{openSubtitles.length > 1 ? 's' : ''} Found
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onFetchOpenSubtitles) {
                        onFetchOpenSubtitles(customSearchText.trim() || undefined);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#f59e0b',
                      fontSize: '0.65rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: 0
                    }}
                  >
                    <RefreshCw size={9} />
                    <span>Refresh</span>
                  </button>
                </div>
                {openSubtitles.map((sub) => {
                  const isSelected = selectedSubTrack?.id === `opensub-${sub.fileId}`;
                  const isDownloadingThis = downloadingFileId === sub.fileId;
                  return (
                    <div
                      key={sub.id}
                      className={`popover-option ${isSelected ? 'active' : ''}`}
                      onClick={() => handleDownload(sub)}
                      title={sub.fileName}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.55rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden' }}>
                        <span style={{
                          background: 'rgba(245, 158, 11, 0.2)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          borderRadius: '4px',
                          padding: '1px 5px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          flexShrink: 0
                        }}>
                          {sub.language.toUpperCase()}
                        </span>
                        <span style={{
                          fontSize: '0.76rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '180px'
                        }}>
                          {sub.fileName.replace(/\.(srt|vtt|sub|ass)$/i, '')}
                        </span>
                      </div>

                      <div style={{ flexShrink: 0, marginLeft: '6px' }}>
                        {isDownloadingThis ? (
                          <RefreshCw size={12} style={{ animation: 'spin-slow 1s linear infinite', color: '#f59e0b' }} />
                        ) : isSelected ? (
                          <Check size={13} className="check-icon" style={{ color: '#22c55e' }} />
                        ) : (
                          <Download size={12} style={{ opacity: 0.4 }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>
            )}

            {/* Custom Add Trigger */}
            {allowSubUpload !== false && (
              <label className="popover-option add-custom-btn" onClick={() => { customSubInputRef.current?.click(); setShowAudioSubMenu(false); }}>
                <span>+ Add Custom File</span>
              </label>
            )}
          </div>
        </div>
        )}

        {/* Subtitle Cue Transcript Column */}
        {showViewColumn && (
          <div className="popover-col popover-transcript-col">
            <h4 style={{ flexShrink: 0 }}>Subtitle View</h4>
            {selectedSubTrack ? (
              <>
                <div className="transcript-search-box" style={{ flexShrink: 0 }}>
                  <input 
                    type="text" 
                    placeholder="Search subtitles..." 
                    value={subSearchQuery}
                    onChange={(e) => setSubSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="transcript-search-input"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div ref={transcriptListRef} className="transcript-cues-list">
                  {(selectedSubTrack.cues || []).length === 0 ? (
                    <div style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--text-secondary, rgba(255,255,255,0.5))', fontSize: '0.8rem' }}>
                      No cues found in this track.
                    </div>
                  ) : (
                    (selectedSubTrack.cues || []).map((cue, originalIdx) => {
                      const isMatched = cleanSubtitleText(cue.text).toLowerCase().includes(subSearchQuery.toLowerCase());
                      if (!isMatched) return null;
                      
                      const isActive = currentTime >= cue.startTime && currentTime <= cue.endTime;
                      return (
                        <div 
                          key={cue.id || originalIdx} 
                          id={`cue-item-${originalIdx}`}
                          className={`transcript-cue-item ${isActive ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (videoRef.current) {
                              videoRef.current.currentTime = cue.startTime;
                              setCurrentTime(cue.startTime);
                            }
                          }}
                        >
                          <span className="cue-time">{formatTime(cue.startTime)}</span>
                          <span className="cue-text">{cleanSubtitleText(cue.text)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary, rgba(255,255,255,0.6))', fontSize: '0.8rem', lineHeight: '1.5' }}>
                Select a subtitle track on the left to view the interactive transcript.
              </div>
            )}
          </div>
        )}
        
        {/* Subtitle Style Customization Column */}
        {showStyleColumn && (
          <div className="popover-col popover-style-col">
            <div className="style-header-row" style={{ flexShrink: 0 }}>
              <h4>Subtitle Style</h4>
              <button 
                className="style-reset-btn-header"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateSubSettings({
                    fontSize: 'medium',
                    color: 'white',
                    backdrop: 'shadow',
                    fontFamily: 'poppins',
                    fontStyle: 'normal',
                    customTextColor: '',
                    customBgColor: '',
                    customSize: 100
                  });
                }}
                title="Reset styles to defaults"
              >
                Reset
              </button>
            </div>
            
            <div className="style-customizer">
              {/* Font and Size in 1 Row */}
              <div className="style-font-size-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) auto', gap: '0.85rem', alignItems: 'flex-end', boxSizing: 'border-box' }}>
                <div className="style-row" style={{ minWidth: 0, overflow: 'visible' }}>
                  <span className="style-label" style={{ display: 'block', minWidth: 'fit-content', whiteSpace: 'nowrap', overflow: 'visible', paddingLeft: '1px' }}>Font</span>
                  <CustomSelect 
                    value={subSettings.fontFamily}
                    onChange={(val) => onUpdateSubSettings({ fontFamily: val })}
                    options={fontOptions}
                  />
                </div>

                <div className="style-row" style={{ minWidth: 0, overflow: 'visible' }}>
                  <span className="style-label" style={{ display: 'block', minWidth: 'fit-content', whiteSpace: 'nowrap', overflow: 'visible' }}>Size</span>
                  <div className="size-btn-group">
                    <button 
                      className="size-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentSize = subSettings.customSize || 100;
                        onUpdateSubSettings({ customSize: Math.max(50, currentSize - 10) });
                      }}
                      title="Decrease size"
                    >
                      -
                    </button>
                    <span className="size-value-display">{subSettings.customSize || 100}%</span>
                    <button 
                      className="size-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentSize = subSettings.customSize || 100;
                        onUpdateSubSettings({ customSize: Math.min(300, currentSize + 10) });
                      }}
                      title="Increase size"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Text Color & Background on 1 Line */}
              <div className="style-colors-row" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1rem', alignItems: 'flex-end', boxSizing: 'border-box' }}>
                <div className="color-picker-item" style={{ minWidth: 0, overflow: 'visible' }}>
                  <span className="style-label" style={{ display: 'block', minWidth: 'fit-content', whiteSpace: 'nowrap', overflow: 'visible', paddingLeft: '1px' }}>Text</span>
                  <div className="picker-wrapper">
                    <input 
                      type="color" 
                      value={subSettings.customTextColor || '#ffffff'}
                      onChange={(e) => onUpdateSubSettings({ customTextColor: e.target.value })}
                      className="color-picker-input-premium"
                      onClick={(e) => e.stopPropagation()}
                      title="Choose text color"
                    />
                  </div>
                </div>
                
                <div className="color-picker-item bg-picker-item" style={{ minWidth: 0, overflow: 'visible' }}>
                  <span className="style-label" style={{ display: 'block', minWidth: 'fit-content', whiteSpace: 'nowrap', overflow: 'visible' }}>Background</span>
                  <div className="picker-wrapper">
                    <input 
                      type="color" 
                      value={subSettings.customBgColor && !subSettings.customBgColor.startsWith('rgba') && subSettings.customBgColor !== 'transparent' ? subSettings.customBgColor : '#000000'}
                      onChange={(e) => onUpdateSubSettings({ customBgColor: e.target.value })}
                      className="color-picker-input-premium"
                      disabled={subSettings.customBgColor === 'transparent'}
                      onClick={(e) => e.stopPropagation()}
                      title="Choose background color"
                    />
                    <button 
                      className={`bg-clear-btn ${subSettings.customBgColor === 'transparent' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateSubSettings({ 
                          customBgColor: subSettings.customBgColor === 'transparent' ? '#000000' : 'transparent' 
                        });
                      }}
                      title="Toggle transparent background"
                    >
                      None
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};
