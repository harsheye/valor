import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, Sparkles, Search, Download, Key, RefreshCw, Minus, Plus, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import type { CustomAudioTrack, CustomSubtitleTrack } from '../types/media';
import type { MediaStream } from '../services/ffmpeg';
import { CustomSelect } from './CustomSelect';
import { trimSubtitleName } from '../utils/embedSubtitleStorage';
import { isMobileDevice } from '../utils/screenOrientation';
import './AudioSubPopover.css';

const fontOptions = [
  { value: 'sans-serif', label: 'Default' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'outfit', label: 'Outfit' },
  { value: 'cinzel', label: 'Cinzel' },
  { value: 'serif', label: 'Playfair' },
  { value: 'monospace', label: 'Mono' }
];

const PRESET_TEXT_COLORS = ['#ffffff', '#fef08a', '#67e8f9', '#86efac'];
const PRESET_BG_COLORS = ['rgba(0, 0, 0, 0.75)', 'rgba(0, 0, 0, 0.4)', '#1e293b'];

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

  // Mobile segmented tab state (Audio | Subs | Transcript | Style)
  const [mobileTab, setMobileTab] = useState<'audio' | 'subs' | 'transcript' | 'style'>('subs');

  // Device & orientation detection for responsive presentation (mobile portrait/landscape vs desktop popover)
  const [deviceState, setDeviceState] = useState(() => {
    if (typeof window === 'undefined') {
      return { isMobile: false, isLandscape: false, width: 1200, height: 800 };
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const minDim = Math.min(w, h);
    const mobile = isMobileDevice() || minDim <= 600 || h <= 650 || w <= 900;
    const landscape = w > h || h <= 600;
    return { isMobile: mobile, isLandscape: landscape, width: w, height: h };
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const minDim = Math.min(w, h);
      const mobile = isMobileDevice() || minDim <= 600 || h <= 650 || w <= 900;
      const landscape = w > h || h <= 600;
      setDeviceState({ isMobile: mobile, isLandscape: landscape, width: w, height: h });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const isMobile = deviceState.isMobile;
  const isLandscape = deviceState.isLandscape;

  const getPortalTarget = () => {
    if (typeof document === 'undefined') return null;
    return (document.fullscreenElement as HTMLElement) || document.body;
  };

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

  // Unified rightTab state: 'transcript' | 'style', persisted in subSettings (keeps showViewColumn/showStyleColumn working)
  const rightTab: 'transcript' | 'style' = subSettings?.rightTab || (subSettings?.showStyleColumn ? 'style' : 'transcript');

  // Foldable state for desktop Transcript & Style pane
  const [isFolded, setIsFolded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('valor_sub_folded');
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return subSettings?.isFolded ?? false;
  });

  const toggleFold = () => {
    const next = !isFolded;
    setIsFolded(next);
    try {
      localStorage.setItem('valor_sub_folded', JSON.stringify(next));
    } catch {}
    onUpdateSubSettings({ ...subSettings, isFolded: next });
  };

  const setRightTab = (tab: 'transcript' | 'style') => {
    if (tab === 'transcript' && !selectedSubTrack) {
      if (subtitleTracks.length > 0) {
        setSelectedSubTrack(subtitleTracks[subtitleTracks.length - 1]);
      } else if (subtitleStreams.length > 0) {
        handleSelectEmbeddedSubtitle(subtitleStreams[0].index, subtitleStreams[0].codec, subtitleStreams[0].language);
      }
    }
    if (isFolded) {
      setIsFolded(false);
      try {
        localStorage.setItem('valor_sub_folded', JSON.stringify(false));
      } catch {}
    }
    onUpdateSubSettings({ ...subSettings, rightTab: tab, isFolded: false, showStyleColumn: tab === 'style', showViewColumn: tab === 'transcript' });
  };

  void setActiveAudioStreamIndex; // Preserved for parent binding

  // Transcript auto-scrolling
  const transcriptListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if ((rightTab !== 'transcript' && mobileTab !== 'transcript') || !selectedSubTrack) return;
    const activeCueEl = transcriptListRef.current?.querySelector('.asp-cue.active');
    if (activeCueEl) {
      activeCueEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentTime, rightTab, mobileTab, selectedSubTrack]);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Reposition effect: clamp both sides within 16px of window boundaries
  useEffect(() => {
    if (isMobile) return;
    const handleReposition = () => {
      const el = popoverRef.current;
      if (!el) return;
      el.style.transform = '';
      const rect = el.getBoundingClientRect();
      let dx = 0;
      if (rect.left < 16) {
        dx = 16 - rect.left;
      } else if (rect.right > window.innerWidth - 16) {
        dx = window.innerWidth - 16 - rect.right;
      }
      if (dx) {
        el.style.transform = `translateX(${dx}px)`;
      }
    };
    handleReposition();
    const timer = setTimeout(handleReposition, 50);
    window.addEventListener('resize', handleReposition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleReposition);
    };
  }, [rightTab, isMobile, isFolded]);

  const effectiveAudioVisible = showAudioControl !== false;
  const effectiveSubVisible = showSubtitleControl !== false;

  const getLangCode = (lang?: string, fallback = 'UND') => {
    if (!lang) return fallback;
    const clean = lang.trim().slice(0, 3).toUpperCase();
    return clean || fallback;
  };

  // --- CONTENT SECTION RENDERERS ---

  const renderAudioContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div className="asp-section-label">
        <span>Audio</span>
      </div>
      <div className="asp-chips">
        {/* Default / Original Track */}
        <button
          type="button"
          className={`asp-chip ${selectedAudioTrack === null ? 'selected' : ''}`}
          aria-pressed={selectedAudioTrack === null}
          onClick={() => {
            setSelectedAudioTrack(null);
            setActiveAudioStreamIndex(null);
            if (!isMobile && isFolded) setShowAudioSubMenu(false);
          }}
        >
          <span>Original</span>
          {selectedAudioTrack === null && <Check size={13} className="asp-check" />}
        </button>

        {/* Embedded Audio Streams */}
        {audioStreams.map((s) => {
          const active = selectedAudioTrack?.streamIndex === s.index;
          const label = getLangLabel(s.language, (s as any).title || `Track #${s.index}`, (s as any).title);
          return (
            <button
              key={`embed-aud-${s.index}`}
              type="button"
              className={`asp-chip ${active ? 'selected' : ''}`}
              aria-pressed={active}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelectEmbeddedAudio(s.index, s.codec, s.language);
                if (!isMobile && isFolded) setShowAudioSubMenu(false);
              }}
            >
              <span>{label}</span>
              {active && <Check size={13} className="asp-check" />}
            </button>
          );
        })}

        {/* Custom Uploaded Audio Tracks */}
        {audioTracks.map((track) => {
          const active = selectedAudioTrack?.id === track.id;
          return (
            <button
              key={track.id}
              type="button"
              className={`asp-chip ${active ? 'selected' : ''}`}
              aria-pressed={active}
              onClick={() => {
                setSelectedAudioTrack(track);
                if (!isMobile && isFolded) setShowAudioSubMenu(false);
              }}
            >
              <span>{track.name}</span>
              {active && <Check size={13} className="asp-check" />}
            </button>
          );
        })}

        {/* + File Button */}
        <button
          type="button"
          className="asp-chip dashed"
          onClick={() => customAudioInputRef.current?.click()}
        >
          + File
        </button>
      </div>
    </div>
  );

  const renderSubsContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="asp-section-label">
        <span>Subtitles</span>
        {!isMobile && (
          <button
            type="button"
            className={`asp-fold-toggle-btn ${!isFolded ? 'active' : ''}`}
            onClick={toggleFold}
            title={isFolded ? 'Unfold Transcript & Style panel' : 'Fold Transcript & Style panel'}
          >
            {isFolded ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
            <span>{isFolded ? 'Unfold' : 'Fold'}</span>
          </button>
        )}
      </div>
      <div className="asp-sub-list">
        {/* Off Row */}
        <button
          type="button"
          className={`asp-row ${selectedSubTrack === null ? 'selected' : ''}`}
          aria-pressed={selectedSubTrack === null}
          onClick={() => {
            setSelectedSubTrack(null);
            setActiveSubStreamIndex(null);
            if (!isMobile && isFolded) setShowAudioSubMenu(false);
          }}
        >
          <span className="asp-lang-tag">OFF</span>
          <span className="asp-row-name">Off</span>
          {selectedSubTrack === null && <Check size={14} className="asp-check" />}
        </button>

        {/* Embedded Subtitle Streams */}
        {subtitleStreams.map((s) => {
          const active = selectedSubTrack?.streamIndex === s.index;
          const label = getLangLabel(s.language, (s as any).title || `Track #${s.index}`, (s as any).title);
          const langTag = getLangCode(s.language);
          return (
            <button
              key={`embed-sub-${s.index}`}
              type="button"
              className={`asp-row ${active ? 'selected' : ''}`}
              aria-pressed={active}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (active) return;
                handleSelectEmbeddedSubtitle(s.index, s.codec, s.language);
                if (!isMobile && isFolded) setShowAudioSubMenu(false);
              }}
            >
              <span className="asp-lang-tag">{langTag}</span>
              <span className="asp-row-name">{label}</span>
              {active && <Check size={14} className="asp-check" />}
            </button>
          );
        })}

        {/* Custom Uploaded Subtitle Tracks */}
        {subtitleTracks.map((track) => {
          const active = selectedSubTrack?.id === track.id;
          const langTag = getLangCode(track.language, 'CUS');
          return (
            <button
              key={track.id}
              type="button"
              className={`asp-row ${active ? 'selected' : ''}`}
              aria-pressed={active}
              onClick={() => {
                setSelectedSubTrack(track);
                if (!isMobile && isFolded) setShowAudioSubMenu(false);
              }}
            >
              <span className="asp-lang-tag">{langTag}</span>
              <span className="asp-row-name">{trimSubtitleName(track.name)}</span>
              {active && <Check size={14} className="asp-check" />}
            </button>
          );
        })}

        {/* Add Custom Subtitle File */}
        {allowSubUpload && (
          <button
            type="button"
            className="asp-row dashed"
            onClick={() => customSubInputRef.current?.click()}
          >
            + Add subtitle file
          </button>
        )}
      </div>

      {/* OpenSubtitles Slim Card */}
      {!subFileOnly && (
        <div className="asp-os">
          <div className="asp-os-header">
            <div className="asp-os-title-wrap">
              <span className="asp-os-label">OpenSubtitles</span>
              <span className={`asp-os-dot ${hasApiKey ? 'green' : 'amber'}`} title={hasApiKey ? 'API Key Configured' : 'No API Key set'} />
            </div>
            <div className="asp-os-actions">
              <button
                type="button"
                className="asp-os-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCustomSearch(!showCustomSearch);
                }}
                title="Search specific title"
              >
                <Search size={12} />
              </button>
              <button
                type="button"
                className="asp-os-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowKeyInput(!showKeyInput);
                }}
                title="Set OpenSubtitles API Key"
              >
                <Key size={12} />
              </button>
            </div>
          </div>

          {/* API Key Drawer */}
          {showKeyInput && (
            <div className="asp-os-drawer" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="password"
                  placeholder="Paste API Key..."
                  value={apiKeyVal}
                  onChange={(e) => setApiKeyVal(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '11px',
                    padding: '3px 6px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  style={{
                    background: 'var(--asp-amber)',
                    border: 'none',
                    color: '#000',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Custom Search Drawer */}
          {showCustomSearch && (
            <div className="asp-os-drawer" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="Movie / Show title..."
                  value={customSearchText}
                  onChange={(e) => setCustomSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (!hasApiKey) setShowKeyInput(true);
                      else if (onFetchOpenSubtitles) onFetchOpenSubtitles(customSearchText.trim());
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '11px',
                    padding: '3px 6px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!hasApiKey) setShowKeyInput(true);
                    else if (onFetchOpenSubtitles) onFetchOpenSubtitles(customSearchText.trim());
                  }}
                  style={{
                    background: 'rgba(245, 165, 36, 0.25)',
                    border: '1px solid var(--asp-amber)',
                    color: 'var(--asp-amber)',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Go
                </button>
              </div>
            </div>
          )}

          {/* Full-width Search Online button */}
          {!hasFetchedOpenSubtitles || openSubtitles.length === 0 ? (
            <button
              type="button"
              className="asp-os-search-btn"
              disabled={isOpenSubLoading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!hasApiKey) setShowKeyInput(true);
                else if (onFetchOpenSubtitles) onFetchOpenSubtitles(customSearchText.trim() || undefined);
              }}
            >
              {isOpenSubLoading ? (
                <>
                  <RefreshCw size={12} style={{ animation: 'spin-slow 1s linear infinite' }} />
                  <span>Searching…</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  <span>{hasFetchedOpenSubtitles ? 'Retry search' : 'Search online'}</span>
                </>
              )}
            </button>
          ) : null}

          {/* Subtitle Results List */}
          {openSubtitles && openSubtitles.length > 0 && (
            <div className="asp-os-results">
              {openSubtitles.map((sub: any) => {
                const isDownloading = downloadingFileId === sub.fileId;
                const langTag = getLangCode(sub.language);
                return (
                  <div key={sub.fileId} className="asp-os-result-row">
                    <span className="asp-lang-tag" style={{ color: 'var(--asp-amber)' }}>{langTag}</span>
                    <span className="asp-row-name" title={sub.fileName} style={{ fontSize: '11px' }}>
                      {trimSubtitleName(sub.fileName)}
                    </span>
                    <button
                      type="button"
                      className="asp-os-btn"
                      disabled={isDownloading}
                      onClick={() => handleDownload(sub)}
                      title="Download and apply subtitle"
                    >
                      {isDownloading ? (
                        <RefreshCw size={11} style={{ animation: 'spin-slow 1s linear infinite' }} />
                      ) : (
                        <Download size={11} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderTranscriptContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {selectedSubTrack ? (
        <>
          <input
            type="text"
            className="asp-transcript-search"
            placeholder="Search subtitles..."
            value={subSearchQuery}
            onChange={(e) => setSubSearchQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
          <div ref={transcriptListRef} className="asp-cue-list">
            {(selectedSubTrack.cues || []).length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--asp-text-muted)', fontSize: '12px' }}>
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
                    className={`asp-cue ${isActive ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (videoRef.current) {
                        videoRef.current.currentTime = cue.startTime;
                        setCurrentTime(cue.startTime);
                      }
                    }}
                  >
                    <span className="asp-cue-time">{formatTime(cue.startTime)}</span>
                    <span className="asp-cue-text">{cleanSubtitleText(cue.text)}</span>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1.5rem', color: 'var(--asp-text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
          Select a subtitle track to view the interactive transcript.
        </div>
      )}
    </div>
  );

  const renderStyleContent = () => (
    <div className="asp-style">
      {/* Font Field */}
      <div className="asp-field">
        <span className="asp-field-label">Font</span>
        <div style={{ width: '100%', minWidth: 0 }}>
          <CustomSelect
            value={subSettings.fontFamily}
            onChange={(val) => onUpdateSubSettings({ fontFamily: val })}
            options={fontOptions}
            width="100%"
          />
        </div>
      </div>

      {/* Text Color Field */}
      <div className="asp-field">
        <span className="asp-field-label">Text Color</span>
        <div className="asp-swatches">
          {PRESET_TEXT_COLORS.map((color) => {
            const isSelected = (subSettings.customTextColor || '#ffffff').toLowerCase() === color.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                className={`asp-swatch ${isSelected ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => onUpdateSubSettings({ customTextColor: color })}
                title={`Select ${color}`}
              />
            );
          })}
          <input
            type="color"
            className="asp-color-native"
            value={subSettings.customTextColor || '#ffffff'}
            onChange={(e) => onUpdateSubSettings({ customTextColor: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            title="Custom text color"
          />
        </div>
      </div>

      {/* Background Color Field */}
      <div className="asp-field">
        <span className="asp-field-label">Background</span>
        <div className="asp-swatches">
          {/* None / Transparent Swatch */}
          <button
            type="button"
            className={`asp-swatch asp-swatch-none ${subSettings.customBgColor === 'transparent' ? 'selected' : ''}`}
            onClick={() => onUpdateSubSettings({ customBgColor: 'transparent' })}
            title="None (transparent)"
          />
          {PRESET_BG_COLORS.map((color) => {
            const isSelected = subSettings.customBgColor === color;
            return (
              <button
                key={color}
                type="button"
                className={`asp-swatch ${isSelected ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => onUpdateSubSettings({ customBgColor: color })}
                title={`Select ${color}`}
              />
            );
          })}
          <input
            type="color"
            className="asp-color-native"
            value={subSettings.customBgColor && !subSettings.customBgColor.startsWith('rgba') && subSettings.customBgColor !== 'transparent' ? subSettings.customBgColor : '#000000'}
            onChange={(e) => onUpdateSubSettings({ customBgColor: e.target.value })}
            disabled={subSettings.customBgColor === 'transparent'}
            onClick={(e) => e.stopPropagation()}
            title="Custom background color"
          />
        </div>
      </div>

      {/* Size Button Control */}
      <div className="asp-field">
        <div className="asp-field-label">
          <span>Size</span>
        </div>
        <div className="asp-size-row">
          <div className="asp-size-btn-group">
            <button
              type="button"
              className="asp-size-btn"
              onClick={() => {
                const current = subSettings.customSize || 100;
                onUpdateSubSettings({ customSize: Math.max(50, current - 10) });
              }}
              title="Decrease size (-10%)"
            >
              <Minus size={14} />
            </button>
            <span className="asp-size-display">{subSettings.customSize || 100}%</span>
            <button
              type="button"
              className="asp-size-btn"
              onClick={() => {
                const current = subSettings.customSize || 100;
                onUpdateSubSettings({ customSize: Math.min(300, current + 10) });
              }}
              title="Increase size (+10%)"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="asp-size-presets">
            {[75, 100, 125, 150].map((preset) => {
              const isSelected = (subSettings.customSize || 100) === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`asp-size-preset-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => onUpdateSubSettings({ customSize: preset })}
                  title={`Set size to ${preset}%`}
                >
                  {preset}%
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <button
        type="button"
        className="asp-reset-btn"
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
        Reset to Defaults
      </button>
    </div>
  );

  // --- MOBILE RENDER: RESPONSIVE BOTTOM SHEET / LANDSCAPE MODAL ---
  if (isMobile) {
    const sheetContent = (
      <div
        className={`asp-sheet-backdrop ${isLandscape ? 'asp-sheet-backdrop-landscape' : ''}`}
        onClick={() => setShowAudioSubMenu(false)}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Audio and Subtitle Settings"
      >
        <div
          className={`asp-sheet ${isLandscape ? 'asp-sheet-landscape' : ''}`}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {!isLandscape && <div className="asp-sheet-handle" />}
          
          <div className="asp-sheet-nav">
            <div className="asp-sheet-tabs">
              {effectiveAudioVisible && (
                <button
                  type="button"
                  className={`asp-sheet-tab ${mobileTab === 'audio' ? 'active' : ''}`}
                  onClick={() => setMobileTab('audio')}
                >
                  Audio
                </button>
              )}
              {effectiveSubVisible && (
                <button
                  type="button"
                  className={`asp-sheet-tab ${mobileTab === 'subs' ? 'active' : ''}`}
                  onClick={() => setMobileTab('subs')}
                >
                  Subs
                </button>
              )}
              <button
                type="button"
                className={`asp-sheet-tab ${mobileTab === 'transcript' ? 'active' : ''}`}
                onClick={() => setMobileTab('transcript')}
              >
                Transcript
              </button>
              <button
                type="button"
                className={`asp-sheet-tab ${mobileTab === 'style' ? 'active' : ''}`}
                onClick={() => setMobileTab('style')}
              >
                Style
              </button>
            </div>

            <button
              type="button"
              className="asp-sheet-close-btn"
              onClick={() => setShowAudioSubMenu(false)}
              aria-label="Close audio and subtitle menu"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="asp-sheet-body">
            {mobileTab === 'audio' && effectiveAudioVisible && renderAudioContent()}
            {mobileTab === 'subs' && effectiveSubVisible && renderSubsContent()}
            {mobileTab === 'transcript' && renderTranscriptContent()}
            {mobileTab === 'style' && renderStyleContent()}
          </div>
        </div>
      </div>
    );

    const target = getPortalTarget();
    return target ? createPortal(sheetContent, target) : sheetContent;
  }

  // --- DESKTOP RENDER: TWO-COLUMN CLAMPED POPOVER (Section 7) ---
  return (
    <div
      ref={popoverRef}
      className={`asp-pop audio-sub-popover audio-sub-popover-center animate-fade-in ${isFolded ? 'is-folded' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => {
        e.stopPropagation();
      }}
      onMouseEnter={() => {
        if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
      }}
    >
      <div className="asp-grid">
        {/* Left Pane (Audio, Subs, OpenSubtitles) */}
        <div className="asp-left">
          {effectiveAudioVisible && renderAudioContent()}
          {effectiveSubVisible && renderSubsContent()}
        </div>

        {/* Right Pane (Segmented [Transcript | Style]) */}
        {!isFolded && (
          <div className="asp-right">
            <div className="asp-seg-wrap">
              <button
                type="button"
                className="asp-fold-btn"
                onClick={toggleFold}
                title="Fold Transcript & Style panel"
              >
                <PanelRightClose size={14} />
                <span className="asp-fold-btn-text">Fold</span>
              </button>
              <div className="asp-seg">
                <button
                  type="button"
                  className={`asp-seg-btn ${rightTab === 'transcript' ? 'active' : ''}`}
                  onClick={() => setRightTab('transcript')}
                >
                  Transcript
                </button>
                <button
                  type="button"
                  className={`asp-seg-btn ${rightTab === 'style' ? 'active' : ''}`}
                  onClick={() => setRightTab('style')}
                >
                  Style
                </button>
              </div>
            </div>

            {rightTab === 'transcript' && renderTranscriptContent()}
            {rightTab === 'style' && renderStyleContent()}
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioSubPopover;
