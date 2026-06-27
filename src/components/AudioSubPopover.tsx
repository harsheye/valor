import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { CustomAudioTrack, CustomSubtitleTrack } from '../types/media';
import type { MediaStream } from '../services/ffmpeg';

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
            <label className="popover-option" onClick={() => { setSelectedAudioTrack(null); setActiveAudioStreamIndex(null); setShowAudioSubMenu(false); }}>
              <input type="radio" name="audio-lang" checked={selectedAudioTrack === null} readOnly />
              <span>Original</span>
              {selectedAudioTrack === null && <Check size={14} className="check-icon" />}
            </label>

            {/* Scanned/Probed Embedded Tracks */}
            {audioStreams.map((s) => {
              const active = selectedAudioTrack?.streamIndex === s.index;
              const label = getLangLabel(s.language, `Track #${s.index}`);
              return (
                <label key={`embed-aud-${s.index}`} className="popover-option" onClick={() => { handleSelectEmbeddedAudio(s.index, s.codec, s.language); setShowAudioSubMenu(false); }}>
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
                <label key={track.id} className="popover-option" onClick={() => { setSelectedAudioTrack(track); setShowAudioSubMenu(false); }}>
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
            <label className="popover-option" onClick={() => { setSelectedSubTrack(null); setActiveSubStreamIndex(null); setShowAudioSubMenu(false); }}>
              <input type="radio" name="sub-lang" checked={selectedSubTrack === null} readOnly />
              <span>Off</span>
              {selectedSubTrack === null && <Check size={14} className="check-icon" />}
            </label>

            {/* Scanned/Probed Embedded Tracks */}
            {subtitleStreams.map((s) => {
              const active = selectedSubTrack?.streamIndex === s.index;
              const label = getLangLabel(s.language, `Track #${s.index}`);
              return (
                <label key={`embed-sub-${s.index}`} className="popover-option" onClick={() => { handleSelectEmbeddedSubtitle(s.index, s.codec, s.language); setShowAudioSubMenu(false); }}>
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
                <label key={track.id} className="popover-option" onClick={() => { setSelectedSubTrack(track); setShowAudioSubMenu(false); }}>
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
            <h4>Subtitle Style</h4>
            <div className="style-customizer">
              
              {/* Font Size Slider */}
              <div className="style-row">
                <span className="style-label">Size: {subSettings.customSize || 100}%</span>
                <input 
                  type="range" 
                  min="50" 
                  max="250" 
                  step="5"
                  value={subSettings.customSize || 100}
                  onChange={(e) => onUpdateSubSettings({ customSize: parseInt(e.target.value, 10) })}
                  className="style-slider"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Font Family Selection */}
              <div className="style-row">
                <span className="style-label">Font:</span>
                <select 
                  value={subSettings.fontFamily}
                  onChange={(e) => onUpdateSubSettings({ fontFamily: e.target.value as any })}
                  className="style-select"
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="sans-serif">Sans-Serif</option>
                  <option value="serif">Serif</option>
                  <option value="monospace">Monospace</option>
                </select>
              </div>

              {/* Text Color Picker */}
              <div className="style-row">
                <span className="style-label">Text Color:</span>
                <div className="color-palette">
                  {['#ffffff', '#f1c40f', '#00ffff', '#2ecc71', '#ff69b4', '#ff8c00'].map((color) => {
                    const isActive = subSettings.customTextColor === color || (!subSettings.customTextColor && color === '#ffffff');
                    return (
                      <button 
                        key={color} 
                        className={`color-dot ${isActive ? 'active' : ''}`} 
                        style={{ backgroundColor: color }}
                        onClick={(e) => { e.stopPropagation(); onUpdateSubSettings({ customTextColor: color }); }}
                        title={color}
                      />
                    );
                  })}
                  {/* Custom Hex Color Input */}
                  <input 
                    type="color" 
                    value={subSettings.customTextColor || '#ffffff'}
                    onChange={(e) => onUpdateSubSettings({ customTextColor: e.target.value })}
                    className="color-picker-input"
                    onClick={(e) => e.stopPropagation()}
                    title="Custom color"
                  />
                </div>
              </div>

              {/* Background Color Picker */}
              <div className="style-row">
                <span className="style-label">Background:</span>
                <div className="color-palette">
                  {['transparent', 'rgba(0,0,0,0.75)', 'rgba(20,20,20,0.9)', 'rgba(10,20,50,0.75)', 'rgba(128,0,0,0.75)'].map((bgColor) => {
                    const isActive = subSettings.customBgColor === bgColor || (!subSettings.customBgColor && bgColor === 'transparent');
                    const displayColor = bgColor === 'transparent' ? '#222' : bgColor;
                    return (
                      <button 
                        key={bgColor} 
                        className={`color-dot ${isActive ? 'active' : ''} ${bgColor === 'transparent' ? 'transparent-dot' : ''}`} 
                        style={{ backgroundColor: displayColor, border: bgColor === 'transparent' ? '1px dashed #666' : '1px solid rgba(255,255,255,0.1)' }}
                        onClick={(e) => { e.stopPropagation(); onUpdateSubSettings({ customBgColor: bgColor }); }}
                        title={bgColor === 'transparent' ? 'None' : bgColor}
                      />
                    );
                  })}
                  {/* Custom Background Color Input */}
                  <input 
                    type="color" 
                    value={subSettings.customBgColor && !subSettings.customBgColor.startsWith('rgba') ? subSettings.customBgColor : '#000000'}
                    onChange={(e) => onUpdateSubSettings({ customBgColor: e.target.value })}
                    className="color-picker-input"
                    onClick={(e) => e.stopPropagation()}
                    title="Custom background color"
                  />
                </div>
              </div>

              {/* Font Weight/Style toggles */}
              <div className="style-row toggles-row">
                <button 
                  className={`style-toggle-btn ${subSettings.fontStyle === 'bold' ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onUpdateSubSettings({ fontStyle: subSettings.fontStyle === 'bold' ? 'normal' : 'bold' }); }}
                >
                  Bold
                </button>
                <button 
                  className={`style-toggle-btn ${subSettings.fontStyle === 'italic' ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onUpdateSubSettings({ fontStyle: subSettings.fontStyle === 'italic' ? 'normal' : 'italic' }); }}
                >
                  Italic
                </button>
                <button 
                  className="style-reset-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateSubSettings({
                      fontSize: 'medium',
                      color: 'white',
                      backdrop: 'shadow',
                      fontFamily: 'sans-serif',
                      fontStyle: 'normal',
                      customTextColor: '',
                      customBgColor: '',
                      customSize: 100
                    });
                  }}
                >
                  Reset
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};
