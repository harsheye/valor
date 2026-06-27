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
  onUpdateSubSettings
}) => {
  const [subSearchQuery, setSubSearchQuery] = useState('');

  return (
    <div 
      className={`audio-sub-popover-center animate-fade-in ${selectedSubTrack ? 'has-transcript' : ''}`}
      onMouseEnter={() => {
        if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
      }}
    >
      <div className="popover-cols">
        {/* Audio Column */}
        <div className="popover-col">
          <h4>Audio</h4>
          <div className="popover-options">
            {/* Default Original Audio if streams are available, or default selector */}
            <label className={`popover-option ${selectedAudioTrack === null ? 'active' : ''}`} onClick={() => { setSelectedAudioTrack(null); setActiveAudioStreamIndex(null); setShowAudioSubMenu(false); }}>
              <input type="radio" name="audio-lang" checked={selectedAudioTrack === null} readOnly />
              <span>Original</span>
              {selectedAudioTrack === null && <Check size={14} className="check-icon" />}
            </label>

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
          </div>
        </div>

        {/* Subtitles Column */}
        <div className="popover-col">
          <h4>Subtitles</h4>
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

            {/* Custom Add Trigger */}
            <label className="popover-option add-custom-btn" onClick={() => { customSubInputRef.current?.click(); setShowAudioSubMenu(false); }}>
              <span>+ Add Custom File</span>
            </label>
          </div>
        </div>

        {/* Subtitle Cue Transcript Column */}
        {selectedSubTrack && (
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
        {selectedSubTrack && (
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
