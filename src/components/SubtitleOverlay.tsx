import React from 'react';
import type { SubtitleCue } from '../utils/subtitleParser';

export interface SubtitleSettings {
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  color: 'white' | 'yellow' | 'cyan' | 'green';
  backdrop: 'none' | 'shadow' | 'opaque';
  fontFamily: 'sans-serif' | 'serif' | 'monospace' | 'poppins' | 'montserrat' | 'outfit' | 'cinzel';
  fontStyle: 'normal' | 'italic' | 'bold';
  customTextColor?: string;
  customBgColor?: string;
  customSize?: number;
  showViewColumn?: boolean;
  showStyleColumn?: boolean;
}

interface SubtitleOverlayProps {
  cues: SubtitleCue[];
  currentTime: number;
  settings: SubtitleSettings;
  controlsVisible: boolean;
  menuVisible?: boolean;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  cues,
  currentTime,
  settings,
  controlsVisible,
  menuVisible = false,
}) => {
  // Find all active cues for the current playback time, filtering out empty/whitespace ones
  const activeCues = cues.filter(
    (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime && cue.text && cue.text.trim() !== ''
  );

  // Deduplicate overlapping cues with the same text to prevent collision
  const uniqueActiveCues = Array.from(new Map(activeCues.map(c => [c.text.trim(), c])).values());

  // Format newlines into line breaks for each active cue, wrapped in individual block elements
  const formattedText = uniqueActiveCues.length > 0 ? uniqueActiveCues.map((cue, cueIdx) => (
    <div key={cue.id || cueIdx} className="subtitle-line-group" style={{ marginTop: cueIdx > 0 ? '0.5rem' : 0 }}>
      {cue.text.split('\n').map((line, lineIdx) => (
        <React.Fragment key={lineIdx}>
          {line}
          {lineIdx < cue.text.split('\n').length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  )) : null;

  let selectedFont = '"Poppins", system-ui, sans-serif';
  if (settings.fontFamily === 'poppins') selectedFont = '"Poppins", system-ui, sans-serif';
  else if (settings.fontFamily === 'montserrat') selectedFont = '"Montserrat", sans-serif';
  else if (settings.fontFamily === 'outfit') selectedFont = '"Outfit", sans-serif';
  else if (settings.fontFamily === 'cinzel') selectedFont = '"Cinzel", serif';
  else if (settings.fontFamily === 'serif') selectedFont = '"Playfair Display", Georgia, serif';
  else if (settings.fontFamily === 'monospace') selectedFont = '"Roboto Mono", Courier New, monospace';
  else if (settings.fontFamily === 'sans-serif') selectedFont = '"Poppins", system-ui, sans-serif';

  const fontStyleStyles: React.CSSProperties = {
    fontFamily: selectedFont,
    fontWeight: settings.fontStyle === 'bold' ? 700 : 500,
    fontStyle: settings.fontStyle === 'italic' ? 'italic' : 'normal',
  };

  if (settings.customTextColor) {
    fontStyleStyles.color = settings.customTextColor;
  }
  if (settings.customBgColor) {
    fontStyleStyles.backgroundColor = settings.customBgColor;
    if (settings.customBgColor !== 'transparent') {
      fontStyleStyles.padding = '0.45rem 1.2rem';
      fontStyleStyles.borderRadius = '6px';
      fontStyleStyles.boxShadow = '0 8px 20px rgba(0,0,0,0.4)';
      fontStyleStyles.border = '1px solid rgba(255,255,255,0.06)';
    } else {
      fontStyleStyles.textShadow = '0px 2px 4px rgba(0,0,0,0.9), -1px -1px 0px rgba(0,0,0,0.9), 1px -1px 0px rgba(0,0,0,0.9), -1px 1px 0px rgba(0,0,0,0.9), 1px 1px 0px rgba(0,0,0,0.9)';
    }
  }
  if (settings.customSize && settings.customSize > 0) {
    fontStyleStyles.fontSize = `${(settings.customSize / 100) * 1.65}rem`;
  }

  const isCustomColor = !!settings.customTextColor;
  const isCustomBg = !!settings.customBgColor;
  const isCustomSize = !!settings.customSize && settings.customSize > 0;

  return (
    <div 
      className={`subtitle-overlay-container ${menuVisible ? 'menu-showing' : (controlsVisible ? 'controls-showing' : '')}`}
      style={menuVisible ? { top: '10%', bottom: 'auto' } : undefined}
    >
      <div 
        className={`subtitle-text ${isCustomSize ? '' : `font-${settings.fontSize}`} ${isCustomColor ? '' : `color-${settings.color}`} ${isCustomBg ? '' : `backdrop-${settings.backdrop}`}`}
        style={fontStyleStyles}
      >
        {formattedText}
      </div>

      <style>{`
        .subtitle-overlay-container {
          position: absolute;
          bottom: 12%;
          left: 8%;
          right: 8%;
          display: flex;
          justify-content: center;
          align-items: center;
          pointer-events: none;
          z-index: 10;
          text-align: center;
          user-select: none;
          transition: bottom 0.25s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .subtitle-overlay-container.controls-showing {
          bottom: 22%;
        }
        .subtitle-overlay-container.menu-showing {
          bottom: 75%;
        }
        .subtitle-text {
          line-height: 1.4;
          max-width: 80%;
          transition: all 0.15s ease;
        }
        
        /* Font Sizes */
        .font-small {
          font-size: 1.2rem;
        }
        .font-medium {
          font-size: 1.65rem;
        }
        .font-large {
          font-size: 2.2rem;
        }
        .font-extra-large {
          font-size: 2.8rem;
        }
        
        @media (max-width: 768px) {
          .font-small { font-size: 0.9rem; }
          .font-medium { font-size: 1.15rem; }
          .font-large { font-size: 1.45rem; }
          .font-extra-large { font-size: 1.8rem; }
        }

        /* Colors */
        .color-white {
          color: #ffffff;
        }
        .color-yellow {
          color: #f1c40f;
        }
        .color-cyan {
          color: #00ffff;
        }
        .color-green {
          color: #2ecc71;
        }

        /* Backdrops */
        .backdrop-shadow {
          text-shadow: 
            -1.5px -1.5px 0 #000,  
             1.5px -1.5px 0 #000,
            -1.5px  1.5px 0 #000,
             1.5px  1.5px 0 #000,
             0px 2px 5px rgba(0,0,0,0.9);
        }
        .backdrop-opaque {
          background-color: rgba(0, 0, 0, 0.75);
          padding: 0.45rem 1.2rem;
          border-radius: 6px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.06);
          text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        }
        .backdrop-none {
          text-shadow: 0 1px 3px rgba(0,0,0,0.6);
        }
      `}</style>
    </div>
  );
};
