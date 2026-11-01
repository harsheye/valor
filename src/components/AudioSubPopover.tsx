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
  getLangLabel: (lang?: string, fallback?: string, title?: string) => string;
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

  const popoverRef = useRef<HTMLDivElement>(null);

  let baseCols: string[] = [];
  let baseWidth = 0;

  if (effectiveAudioVisible) {
    baseCols.push('minmax(130px, 1fr)');
    baseWidth += 140;
  }
  if (effectiveSubVisible) {
    baseCols.push('minmax(165px, 1fr)');
    baseWidth += 175;
  }
  if (baseCols.length === 0) {
    baseCols.push('minmax(140px, 1fr)');
    baseWidth = 150;
  }

  if (showViewColumn) {
    baseCols.push('minmax(200px, 1.1fr)');
    baseWidth += 210;
  }
  if (showStyleColumn) {
    baseCols.push('minmax(215px, 1.15fr)');
    baseWidth += 225;
  }

  const popoverWidth = Math.max(baseWidth + 24, 260);
  const gridCols = baseCols.join(' ');

  useEffect(() => {
    const handleReposition = () => {
      const el = popoverRef.current;
      if (!el) return;
      el.style.transform = '';
      const rect = el.getBoundingClientRect();
      if (rect.left < 16) {
        const overflow = 16 - rect.left;
        el.style.transform = `translateX(${overflow}px)`;
      }
    };
    handleReposition();
    const timer = setTimeout(handleReposition, 50);
    window.addEventListener('resize', handleReposition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleReposition);
    };
  }, [popoverWidth, showViewColumn, showStyleColumn]);

  return (
    <div 
      ref={popoverRef}
      className="audio-sub-popover audio-sub-popover-center animate-fade-in"
      style={{ 
        width: `${popoverWidth}px`, 
        maxWidth: 'calc(100vw - 32px)',
        overflow: 'visible',
        boxSizing: 'border-box'
      }}
      onWheel={(e) => {
        // Prevent player from intercepting mouse wheel scroll in any popover children
        e.stopPropagation();
      }}
      onMouseEnter={() => {
        if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
      }}
    >
      <div className="popover-cols" style={{ gridTemplateColumns: gridCols, height: '100%' }}>
        {/* Audio Column */}
        {effectiveAudioVisible && (
          <div className="popover-col">
            <div className="popover-col-header">
              <span className="popover-col-title">Audio</span>
            </div>
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
                const label = getLangLabel(s.language, (s as any).title || `Track #${s.index}`, (s as any).title);
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
            </div>
          </div>
        )}

        {/* Subtitles Column */}
        {effectiveSubVisible && (
        <div className="popover-col">
          <div className="popover-col-header">
            <span className="popover-col-title">Sub</span>
            <div className="popover-header-btn-group">
              <button 
                type="button"
                className={`popover-header-toggle-btn ${showViewColumn ? 'active' : ''}`}
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
                title="Toggle Subtitle Transcript view"
              >
                VIEW
              </button>
              <button 
                type="button"
                className={`popover-header-toggle-btn ${showStyleColumn ? 'active' : ''}`}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onUpdateSubSettings({ ...subSettings, showStyleColumn: !showStyleColumn }); 
                }}
                title="Toggle Subtitle Style settings"
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

            {/* OpenSubtitles Cloud Section (Placed 2nd as requested) */}
            {!subFileOnly && (
              <div 
                className="opensub-section-container"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '7px',
                  padding: '0.4rem',
                  margin: '0.2rem 0',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '0.3rem',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  marginBottom: '0.35rem'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.68rem',
                    textTransform: 'uppercase',
                    color: '#f59e0b',
                    fontWeight: 700,
                    letterSpacing: '0.04em'
                  }}>
                    <Globe size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap' }}>OpenSub</span>
                    <span style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: hasApiKey ? '#10b981' : '#f59e0b',
                      boxShadow: hasApiKey ? '0 0 6px rgba(16, 185, 129, 0.6)' : '0 0 6px rgba(245, 158, 11, 0.6)',
                      flexShrink: 0
                    }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <button
                      type="button"
                      title="Search by custom keyword"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowCustomSearch(!showCustomSearch);
                      }}
                      style={{
                        background: showCustomSearch ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: showCustomSearch ? '#f59e0b' : 'rgba(255, 255, 255, 0.7)',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Search size={10} />
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
                        background: showKeyInput ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: showKeyInput ? '#f59e0b' : (hasApiKey ? 'rgba(255, 255, 255, 0.7)' : '#f59e0b'),
                        padding: '2px 4px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Key size={10} />
                    </button>
                  </div>
                </div>

                {/* Inline API Key Drawer */}
                {showKeyInput && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: 'rgba(20, 20, 20, 0.98)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      borderRadius: '6px',
                      padding: '0.4rem',
                      marginBottom: '0.35rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      boxSizing: 'border-box',
                      width: '100%'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 600 }}>API Key</span>
                      <span 
                        onClick={() => setShowKeyInput(false)}
                        style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.4)', cursor: 'pointer', padding: '0 2px' }}
                      >✕</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="password"
                        placeholder="Key..."
                        value={apiKeyVal}
                        onChange={(e) => setApiKeyVal(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: 'rgba(0, 0, 0, 0.6)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '0.7rem',
                          padding: '3px 5px',
                          outline: 'none',
                          boxSizing: 'border-box'
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
                          borderRadius: '4px',
                          padding: '3px 6px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                      >
                        Save
                      </button>
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255, 255, 255, 0.45)', wordBreak: 'break-word', lineHeight: 1.2 }}>
                      Free at <span style={{ color: '#f59e0b', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => window.open('https://www.opensubtitles.com/consumers', '_blank')}>opensubtitles.com</span>
                    </div>
                  </div>
                )}

                {/* Custom Search Query Drawer */}
                {showCustomSearch && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: 'rgba(20, 20, 20, 0.98)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      padding: '0.35rem',
                      marginBottom: '0.35rem',
                      display: 'flex',
                      gap: '4px',
                      boxSizing: 'border-box',
                      width: '100%'
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Title query..."
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
                        minWidth: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '0.7rem',
                        padding: '3px 5px',
                        outline: 'none',
                        boxSizing: 'border-box'
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
                        borderRadius: '4px',
                        padding: '3px 6px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      Go
                    </button>
                  </div>
                )}

                {/* The Main Search OpenSubtitles Button */}
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
                      gap: '5px',
                      padding: '0.38rem 0.45rem',
                      borderRadius: '5px',
                      background: isOpenSubLoading 
                        ? 'rgba(245, 158, 11, 0.15)' 
                        : 'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(234, 88, 12, 0.26) 100%)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      boxShadow: isOpenSubLoading 
                        ? 'none' 
                        : '0 2px 10px rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: isOpenSubLoading ? 'wait' : 'pointer',
                      boxSizing: 'border-box'
                    }}
                  >
                    {isOpenSubLoading ? (
                      <>
                        <RefreshCw size={11} style={{ animation: 'spin-slow 1s linear infinite' }} />
                        <span style={{ whiteSpace: 'nowrap' }}>Searching...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={11} style={{ color: '#fbbf24', flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {hasFetchedOpenSubtitles ? 'Retry Search' : 'Search OpenSub'}
                        </span>
                      </>
                    )}
                  </button>
                ) : null}

                {/* Subtitle Results List */}
                {openSubtitles && openSubtitles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.2rem', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.62rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                        {openSubtitles.length} Found
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
                          fontSize: '0.62rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          padding: 0
                        }}
                      >
                        <RefreshCw size={8} />
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
                            padding: '0.3rem 0.45rem',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                            <span style={{
                              background: 'rgba(245, 158, 11, 0.2)',
                              color: '#f59e0b',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              borderRadius: '3px',
                              padding: '1px 4px',
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              flexShrink: 0
                            }}>
                              {sub.language.toUpperCase()}
                            </span>
                            <span style={{
                              fontSize: '0.72rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '90px'
                            }}>
                              {sub.fileName.replace(/\.(srt|vtt|sub|ass)$/i, '')}
                            </span>
                          </div>

                          <div style={{ flexShrink: 0, marginLeft: '4px' }}>
                            {isDownloadingThis ? (
                              <RefreshCw size={11} style={{ animation: 'spin-slow 1s linear infinite', color: '#f59e0b' }} />
                            ) : isSelected ? (
                              <Check size={12} className="check-icon" style={{ color: '#22c55e' }} />
                            ) : (
                              <Download size={11} style={{ opacity: 0.4 }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Embedded Subtitle Streams */}
            {!subFileOnly && subtitleStreams.map((s) => {
              const active = selectedSubTrack?.streamIndex === s.index;
              const label = getLangLabel(s.language, (s as any).title || `Track #${s.index}`, (s as any).title);
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
            <div className="popover-col-header">
              <span className="popover-col-title">Subtitle View</span>
            </div>
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
            <div className="popover-col-header">
              <span className="popover-col-title">Subtitle Style</span>
              <button 
                type="button"
                className="popover-header-action-btn"
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
            
            <div className="style-customizer-clean">
              {/* 1. Font Family */}
              <div className="style-block">
                <span className="style-block-label">Font</span>
                <CustomSelect 
                  value={subSettings.fontFamily}
                  onChange={(val) => onUpdateSubSettings({ fontFamily: val })}
                  options={fontOptions}
                />
              </div>

              {/* 2. Size Control */}
              <div className="style-block">
                <span className="style-block-label">Size</span>
                <div className="size-control-group">
                  <button 
                    type="button"
                    className="size-step-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentSize = subSettings.customSize || 100;
                      onUpdateSubSettings({ customSize: Math.max(50, currentSize - 10) });
                    }}
                    title="Decrease size"
                  >
                    -
                  </button>
                  <span className="size-step-value">{subSettings.customSize || 100}%</span>
                  <button 
                    type="button"
                    className="size-step-btn"
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

              {/* 3. Color & BG side-by-side */}
              <div className="style-colors-grid">
                {/* Text Color */}
                <div className="style-color-col">
                  <span className="style-block-label">Color</span>
                  <div className="color-swatch-wrapper">
                    <input 
                      type="color" 
                      value={subSettings.customTextColor || '#ffffff'}
                      onChange={(e) => onUpdateSubSettings({ customTextColor: e.target.value })}
                      className="style-color-circle"
                      onClick={(e) => e.stopPropagation()}
                      title="Choose text color"
                    />
                  </div>
                </div>

                {/* Background Color */}
                <div className="style-color-col">
                  <span className="style-block-label">BG</span>
                  <div className="color-swatch-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="color" 
                      value={subSettings.customBgColor && !subSettings.customBgColor.startsWith('rgba') && subSettings.customBgColor !== 'transparent' ? subSettings.customBgColor : '#000000'}
                      onChange={(e) => onUpdateSubSettings({ customBgColor: e.target.value })}
                      className="style-color-circle"
                      disabled={subSettings.customBgColor === 'transparent'}
                      onClick={(e) => e.stopPropagation()}
                      title="Choose background color"
                    />
                    <button 
                      type="button"
                      className={`style-none-circle-btn ${subSettings.customBgColor === 'transparent' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateSubSettings({ 
                          customBgColor: subSettings.customBgColor === 'transparent' ? '#000000' : 'transparent' 
                        });
                      }}
                      title={subSettings.customBgColor === 'transparent' ? "Background is None (transparent) - Click to restore" : "Set background to None (transparent)"}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={subSettings.customBgColor === 'transparent' ? '#ef4444' : 'rgba(255, 255, 255, 0.7)'} strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" strokeWidth="2" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
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
