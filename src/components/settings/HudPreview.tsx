import React, { useState } from 'react';
import { 
  Layers, Type, Play, Clock, Sliders, Volume2, Maximize, Zap, 
  Coffee, SkipForward, Ban, FastForward, Lock, ChevronUp, ChevronDown, 
  ChevronRight, X, Pin, PinOff 
} from 'lucide-react';
import { Segmented } from './Segmented';

export interface HudControlItem {
  key: string;
  name: string;
  icon: React.ReactNode;
}

export const HUD_ALL_CONTROLS: Record<string, { name: string; icon: React.ReactNode }> = {
  hideUIOverlays: { name: 'UI overlays', icon: <Layers size={14} /> },
  hideVideoName: { name: 'Video name', icon: <Type size={14} /> },
  showPlayButton: { name: 'Play button HUD', icon: <Play size={14} /> },
  showTimeDisplay: { name: 'Time display', icon: <Clock size={14} /> },
  showPlayBar: { name: 'Timeline scrub', icon: <Sliders size={14} /> },
  showVolumeControl: { name: 'Volume control', icon: <Volume2 size={14} /> },
  showFullscreen: { name: 'Fullscreen toggle', icon: <Maximize size={14} /> },
  disableAnimations: { name: 'Disable animations', icon: <Zap size={14} /> },
  pauseOnFocusChange: { name: 'Disable auto-pause', icon: <Coffee size={14} /> },
  allowUiSkipping: { name: 'Skip buttons', icon: <SkipForward size={14} /> },
  blockSeekingCompletely: { name: 'Block seeking', icon: <Ban size={14} /> },
  autoSkipIntroOutro: { name: 'Auto-skip intro/outro', icon: <FastForward size={14} /> },
  lockModeActive: { name: 'Lock controls', icon: <Lock size={14} /> },
};

export const DEFAULT_HUD_ORDER: string[] = [
  'hideUIOverlays',
  'hideVideoName',
  'showPlayButton',
  'showTimeDisplay',
  'showPlayBar',
  'showVolumeControl',
  'showFullscreen',
  'disableAnimations',
  'pauseOnFocusChange',
  'allowUiSkipping',
  'blockSeekingCompletely',
  'autoSkipIntroOutro',
];

export interface HudPreviewProps {
  order: string[];
  onOrderChange: (newOrder: string[]) => void;
  renderMockButton?: (key: string) => React.ReactNode;
}

export const HudPreview: React.FC<HudPreviewProps> = ({
  order = DEFAULT_HUD_ORDER,
  onOrderChange,
  renderMockButton,
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const currentOrder = order.length > 0 ? order : DEFAULT_HUD_ORDER;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    onOrderChange(newOrder);
  };

  const handleTogglePin = (key: string, currentIndex: number) => {
    const isPinned = currentIndex < 5;
    const newOrder = [...currentOrder];
    const [item] = newOrder.splice(currentIndex, 1);

    if (isPinned) {
      // Unpin: move to index 5 (first unpinned slot)
      newOrder.splice(5, 0, item);
    } else {
      // Pin: move to index 0 (top pinned slot)
      newOrder.splice(0, 0, item);
    }
    onOrderChange(newOrder);
  };

  const renderIconItem = (key: string) => {
    if (renderMockButton) {
      return renderMockButton(key);
    }
    const info = HUD_ALL_CONTROLS[key];
    return (
      <div
        key={key}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          height: '28px',
          fontSize: '0.75rem',
          background: 'rgba(0, 122, 255, 0.15)',
          border: '1px solid rgba(0, 122, 255, 0.3)',
          color: '#007aff',
        }}
      >
        {info?.icon || <Layers size={14} />}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%' }}>
      {/* Pinned Sticky HUD Preview on Top */}
      <div className="hud-preview-pinned-container">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-2)',
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>
            Real-time HUD preview
          </span>
          <Segmented
            value={expanded ? 'expanded' : 'collapsed'}
            onChange={(val) => setExpanded(val === 'expanded')}
            options={[
              { value: 'collapsed', label: 'Collapsed (3×2 combo)' },
              { value: 'expanded', label: 'Expanded (4×4 combo)' },
            ]}
          />
        </div>

        {/* Video Player Frame with untouched mock HUD overlay */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '260px',
            background: 'radial-gradient(circle, #2a2a2a 0%, #111111 100%)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {/* Top Left Labels */}
          <div
            style={{
              position: 'absolute',
              left: '1.25rem',
              top: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.35)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              VIDEO PLAYER PREVIEW
            </span>
            <span
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: 'rgba(255, 255, 255, 0.85)',
              }}
            >
              Mock Episode 01
            </span>
          </div>

          {/* Volume button at bottom left */}
          <div
            className="mock-volume-pill"
            style={{
              position: 'absolute',
              left: '1.25rem',
              bottom: '1.25rem',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(20, 20, 20, 0.8)',
              padding: '4px 8px',
              borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Volume2 size={14} color="#ffffff" />
            <div
              style={{
                width: '40px',
                height: '4px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '2px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '80%',
                  height: '100%',
                  background: 'var(--accent)',
                  borderRadius: '2px',
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: '#ffffff', fontWeight: 600 }}>80</span>
          </div>

          {/* Untouched UI Settings Card at Top Right */}
          <div
            style={{
              background: 'rgba(18, 18, 18, 0.96)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRight: 'none',
              borderRadius: '16px 0 0 16px',
              padding: '1rem',
              width: !expanded ? '110px' : '200px',
              height: '200px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
              transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#888888', fontWeight: 600 }}>UI Settings</span>
              <X size={12} style={{ color: '#666666' }} />
            </div>

            {/* Grid of buttons */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: !expanded ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: '0.4rem',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {!expanded ? (
                <>
                  {currentOrder.slice(0, 5).map((key) => renderIconItem(key))}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'rgba(255, 255, 255, 0.8)',
                      borderRadius: '6px',
                      padding: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      height: '28px',
                    }}
                  >
                    <ChevronRight size={14} />
                  </div>
                </>
              ) : (
                <>
                  {currentOrder.slice(0, 16).map((key) => renderIconItem(key))}
                  {Array.from({ length: Math.max(0, 16 - currentOrder.length) }).map((_, i) => (
                    <div
                      key={`dashed-${i}`}
                      style={{
                        border: '1px dashed rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        height: '28px',
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ordered List of the Controls Below */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-3)' }}>
            Order & pinned controls
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
            Top 5 are displayed in collapsed HUD
          </span>
        </div>

        {currentOrder.map((key, index) => {
          const info = HUD_ALL_CONTROLS[key] || { name: key, icon: <Layers size={14} /> };
          const isPinned = index < 5;

          return (
            <div
              key={key}
              draggable
              onDragStart={(e) => {
                setDraggedIndex(index);
                e.dataTransfer.setData('text/plain', index.toString());
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const fromIndex = draggedIndex ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (fromIndex !== null && !isNaN(fromIndex) && fromIndex !== index) {
                  const newOrder = [...currentOrder];
                  const [moved] = newOrder.splice(fromIndex, 1);
                  newOrder.splice(index, 0, moved);
                  onOrderChange(newOrder);
                }
                setDraggedIndex(null);
              }}
              className={`setting-row ${isPinned ? 'pinned' : ''}`}
              style={{
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              {/* Left Side: Number, Icon, Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    width: '20px',
                    color: isPinned ? 'var(--accent)' : 'var(--text-3)',
                    textAlign: 'center',
                  }}
                >
                  {index + 1}
                </span>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    background: isPinned ? 'var(--accent-soft)' : 'var(--surface-3)',
                    color: isPinned ? 'var(--accent)' : 'var(--text-1)',
                  }}
                >
                  {info.icon}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>
                    {info.name}
                  </span>
                  {isPinned && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>
                      Pinned to collapsed view
                    </span>
                  )}
                </div>
              </div>

              {/* Right Side: Pin Toggle & Reorder Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  aria-label={isPinned ? `Unpin ${info.name}` : `Pin ${info.name}`}
                  className="settings-btn-secondary"
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    background: isPinned ? 'var(--accent-soft)' : 'var(--surface-2)',
                    borderColor: isPinned ? 'var(--accent)' : 'var(--control-border)',
                    color: isPinned ? 'var(--accent)' : 'var(--text-2)',
                  }}
                  onClick={() => handleTogglePin(key, index)}
                >
                  {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
                  <span>{isPinned ? 'Pinned' : 'Pin'}</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Move ${info.name} up`}
                    className="settings-stepper-btn"
                    onClick={() => handleMove(index, 'up')}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === currentOrder.length - 1}
                    aria-label={`Move ${info.name} down`}
                    className="settings-stepper-btn"
                    onClick={() => handleMove(index, 'down')}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
