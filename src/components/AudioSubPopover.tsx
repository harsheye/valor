import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { CustomAudioTrack, CustomSubtitleTrack } from '../types/media';
import type { MediaStream } from '../services/ffmpeg';
import { CustomSelect } from './CustomSelect';

const fontOptions = [
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
  onFetchOpenSubtitles?: () => void;
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
  onFetchOpenSubtitles
}) => {
  const [subSearchQuery, setSubSearchQuery] = useState('');
  
  // Use subSettings for persistence, defaulting to false
  const showStyleColumn = subSettings?.showStyleColumn ?? false;
  const showViewColumn = subSettings?.showViewColumn ?? false;
  
  void setActiveAudioStreamIndex; // consumed by parent; kept in props for potential future use

  // Dynamic layout calculations based on active columns
  let popoverWidth = 460;
  let gridCols = "1fr 1fr";
  if (selectedSubTrack) {
    if (showViewColumn && showStyleColumn) {
      popoverWidth = 960;
      gridCols = "1fr 1fr 1.3fr 1.1fr";
    } else if (showViewColumn) {
      popoverWidth = 740;
      gridCols = "1fr 1fr 1.3fr";
    } else if (showStyleColumn) {
      popoverWidth = 700;
      gridCols = "1fr 1fr 1.1fr";
    }
  }

  return (
    <div 
      className="audio-sub-popover-center animate-fade-in"
      style={{ width: `${popoverWidth}px` }}
      onMouseEnter={() => {
        if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
      }}
    >
      <div className="popover-cols" style={{ gridTemplateColumns: gridCols }}>
        {/* Audio Column */}
        <div className="popover-col">
          <h4>Audio</h4>
          <div className="popover-options">
            {/* When no embedded streams are found yet, show a disabled Original placeholder */}
            {audioStreams.length === 0 && (
              <label className={`popover-option ${selectedAudioTrack === null ? 'active' : ''}`}>
                <input type="radio" name="audio-lang" checked={selectedAudioTrack === null} readOnly />
                <span>Default</span>
                {selectedAudioTrack === null && <Check size={14} className="check-icon" />}
              </label>
            )}

            {/* Scanned/Probed Embedded Tracks */}
            {audioStreams.map((s) => {
              const active = selectedAudioTrack?.streamIndex === s.index;
              const label = getLangLabel(s.language, `Track #${s.index}`);
              return (
                <label key={`embed-aud-${s.index}`} className={`popover-option ${active ? 'active' : ''}`} onClick={() => { handleSelectEmbeddedAudio(s.index, s.codec, s.language); setShowAudioSubMenu(false); }}>
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

        {/* Subtitles Column */}
        <div className="popover-col">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', paddingBottom: '0.35rem', marginBottom: '0.6rem' }}>
            <h4 style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}>Sub</h4>
            {selectedSubTrack && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
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
                >
                  VIEW
                </button>
                <button 
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
                >
                  STYLE
                </button>
              </div>
            )}
          </div>
          <div className="popover-options">
            {/* Off */}
            <label className={`popover-option ${selectedSubTrack === null ? 'active' : ''}`} onClick={() => { setSelectedSubTrack(null); setActiveSubStreamIndex(null); setShowAudioSubMenu(false); }}>
              <input type="radio" name="sub-lang" checked={selectedSubTrack === null} readOnly />
              <span>Off</span>
              {selectedSubTrack === null && <Check size={14} className="check-icon" />}
            </label>

            {/* Scanned/Probed Embedded Tracks */}
            {subtitleStreams.map((s) => {
              const active = selectedSubTrack?.streamIndex === s.index;
              const label = getLangLabel(s.language, `Track #${s.index}`);
              return (
                <label key={`embed-sub-${s.index}`} className={`popover-option ${active ? 'active' : ''}`} onClick={() => { handleSelectEmbeddedSubtitle(s.index, s.codec, s.language); setShowAudioSubMenu(false); }}>
                  <input type="radio" name="sub-lang" checked={active} readOnly />
                  <span>{label}</span>
                  {active && <Check size={14} className="check-icon" />}
                </label>
              );
            })}

            {/* Custom Uploaded Tracks */}
            {subtitleTracks.map((track) => {
              const active = selectedSubTrack?.id === track.id;
              return (
                <label key={track.id} className={`popover-option ${active ? 'active' : ''}`} onClick={() => { setSelectedSubTrack(track); setShowAudioSubMenu(false); }}>
                  <input type="radio" name="sub-lang" checked={active} readOnly />
                  <span>{track.name}</span>
                  {active && <Check size={14} className="check-icon" />}
                </label>
              );
            })}

            {/* OpenSubtitles section — inline inside popover-options */}
            <div style={{ borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', margin: '0.3rem 0', opacity: 0.6 }}></div>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted, rgba(255, 255, 255, 0.35))', letterSpacing: '0.05em', paddingLeft: '0.4rem', marginBottom: '0.2rem' }}>
              OpenSubtitles {isOpenSubLoading && '...'}
            </div>
            
            {!hasFetchedOpenSubtitles && !isOpenSubLoading ? (
              <label 
                className="popover-option" 
                style={{ color: 'var(--accent-color, #38bdf8)', cursor: 'pointer' }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onFetchOpenSubtitles) onFetchOpenSubtitles();
                }}
              >
                <span>🔍 Search OpenSubtitles</span>
              </label>
            ) : (
              <>
                {isOpenSubLoading && (!openSubtitles || openSubtitles.length === 0) && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, rgba(255, 255, 255, 0.4))', paddingLeft: '0.4rem' }}>
                    Searching...
                  </div>
                )}
                {!isOpenSubLoading && (!openSubtitles || openSubtitles.length === 0) && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, rgba(255, 255, 255, 0.4))', paddingLeft: '0.4rem' }}>
                    No subtitles found
                  </div>
                )}
                {openSubtitles && openSubtitles.length > 0 && openSubtitles.map((sub) => {
                  const isSelected = selectedSubTrack?.id === `opensub-${sub.fileId}`;
                  return (
                    <label 
                      key={sub.id} 
                      className={`popover-option ${isSelected ? 'active' : ''}`} 
                      onClick={() => {
                        if (onDownloadOpenSubtitle) {
                          onDownloadOpenSubtitle(sub.fileId, sub.fileName, sub.language);
                        }
                      }}
                      title={sub.fileName}
                    >
                      <input type="radio" name="sub-lang" checked={isSelected} readOnly />
                      <span>{sub.language.toUpperCase()} ({sub.fileName.substring(0, 15)}...)</span>
                      {isSelected && <Check size={12} className="check-icon" />}
                    </label>
                  );
                })}
              </>
            )}

            {/* Custom Add Trigger */}
            <label className="popover-option add-custom-btn" onClick={() => { customSubInputRef.current?.click(); setShowAudioSubMenu(false); }}>
              <span>+ Add Custom File</span>
            </label>
          </div>
        </div>

        {/* Subtitle Cue Transcript Column */}
        {selectedSubTrack && showViewColumn && (
          <div className="popover-col popover-transcript-col">
            <h4>Subtitle View</h4>
            <div className="transcript-search-box">
              <input 
                type="text" 
                placeholder="Search subtitles..." 
                value={subSearchQuery}
                onChange={(e) => setSubSearchQuery(e.target.value)}
                className="transcript-search-input"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="transcript-cues-list">
              {(selectedSubTrack.cues || []).map((cue, originalIdx) => {
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
              })}
            </div>
          </div>
        )}
        
        {/* Subtitle Style Customization Column */}
        {selectedSubTrack && showStyleColumn && (
          <div className="popover-col popover-style-col">
            <div className="style-header-row">
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
              <div className="style-font-size-row">
                <div className="style-row">
                  <span className="style-label">Font</span>
                  <CustomSelect 
                    value={subSettings.fontFamily}
                    onChange={(val) => onUpdateSubSettings({ fontFamily: val })}
                    options={fontOptions}
                  />
                </div>

                <div className="style-row">
                  <span className="style-label">Size</span>
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
              <div className="style-colors-row">
                <div className="color-picker-item">
                  <span className="style-label">Text</span>
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
                
                <div className="color-picker-item bg-picker-item">
                  <span className="style-label">Background</span>
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
