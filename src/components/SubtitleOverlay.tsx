import React from 'react';
import type { SubtitleCue } from '../utils/subtitleParser';

export interface SubtitleSettings {
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  color: 'white' | 'yellow' | 'cyan' | 'green';
  backdrop: 'none' | 'shadow' | 'opaque';
  fontFamily: 'sans-serif' | 'serif' | 'monospace';
  fontStyle: 'normal' | 'italic' | 'bold';
}

interface SubtitleOverlayProps {
  cues: SubtitleCue[];
  currentTime: number;
  settings: SubtitleSettings;
  controlsVisible: boolean;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  cues,
  currentTime,
  settings,
  controlsVisible,
}) => {
  // Find the active cue for the current playback time
  const activeCue = cues.find(
    (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime
  );

  if (!activeCue) return null;

  // Format newlines into line breaks
  const formattedText = activeCue.text.split('\n').map((line, index) => (
    <React.Fragment key={index}>
      {line}
      {index < activeCue.text.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));

  const fontStyleStyles: React.CSSProperties = {
    fontFamily: settings.fontFamily === 'monospace' ? 'Courier New, monospace' : settings.fontFamily === 'serif' ? 'Georgia, serif' : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: settings.fontStyle === 'bold' ? 700 : 500,
    fontStyle: settings.fontStyle === 'italic' ? 'italic' : 'normal',
  };

  return (
    <div className={`subtitle-overlay-container ${controlsVisible ? 'controls-showing' : ''}`}>
      <div 
        className={`subtitle-text font-${settings.fontSize} color-${settings.color} backdrop-${settings.backdrop}`}
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
