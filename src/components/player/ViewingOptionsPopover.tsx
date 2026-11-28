import React, { useState } from 'react';
import { MonitorPlay, Play, List, Info, X } from 'lucide-react';
import {
  useVideoColorSettings,
  DEFAULT_VIDEO_COLOR_SETTINGS,
  VIDEO_COLOR_PRESETS,
  type ToneMappingMode,
  type PictureFitMode,
} from './ToneMappingFilters';
import type { Bookmark } from '../../types/media';
import './ViewingOptionsPopover.css';

export interface ViewingOptionsPopoverProps {
  title: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  toneMappingMode: ToneMappingMode;
  onChangeToneMapping: (mode: ToneMappingMode) => void;
  bookmarks?: Bookmark[];
  onSeek?: (time: number) => void;
  duration?: number;
  formatTime?: (secs: number) => string;
  onClose: () => void;
}

type ViewingTab = 'video' | 'playback' | 'chapters' | 'info';

export const ViewingOptionsPopover: React.FC<ViewingOptionsPopoverProps> = ({
  title,
  videoRef,
  playbackRate,
  onChangePlaybackRate,
  toneMappingMode,
  onChangeToneMapping,
  bookmarks = [],
  onSeek,
  duration = 0,
  formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  },
  onClose,
}) => {
  const [tab, setTab] = useState<ViewingTab>('video');
  const [color, updateColor] = useVideoColorSettings();
  const [isLoop, setIsLoop] = useState<boolean>(() => Boolean(videoRef.current?.loop));

  const handleReset = () => {
    if (tab === 'video') {
      updateColor({ ...DEFAULT_VIDEO_COLOR_SETTINGS });
    } else if (tab === 'playback') {
      onChangePlaybackRate(1);
      onChangeToneMapping('off');
      if (videoRef.current) videoRef.current.loop = false;
      setIsLoop(false);
    }
  };

  const sliderTrackBg = (val: number) => {
    const pct = ((val + 100) / 200) * 100;
    return `linear-gradient(to right, var(--accent, #eb8c34) 0%, var(--accent, #eb8c34) ${pct}%, rgba(255,255,255,0.18) ${pct}%, rgba(255,255,255,0.18) 100%)`;
  };

  const renderSlider = (label: string, key: 'brightness' | 'contrast' | 'saturation' | 'gamma' | 'hue') => {
    const val = color[key] ?? 0;
    return (
      <div className="vop-slider-item" key={key}>
        <div className="vop-slider-head">
          <span>{label}</span>
          <span className="vop-slider-num">{val}</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={val}
          className="vop-range"
          style={{ background: sliderTrackBg(val) }}
          onChange={(e) => updateColor({ preset: 'custom', [key]: Number(e.target.value) })}
        />
      </div>
    );
  };

  const videoEl = videoRef.current;
  const resolution = videoEl && videoEl.videoWidth ? `${videoEl.videoWidth} × ${videoEl.videoHeight}` : 'Auto';

  return (
    <div
      className="vop-panel"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="vop-header">
        <div style={{ minWidth: 0 }}>
          <div className="vop-title">Viewing options</div>
          <div className="vop-subtitle">Tweak how &apos;{title || 'Current media'}&apos; looks</div>
        </div>
        <div className="vop-header-actions">
          {(tab === 'video' || tab === 'playback') && (
            <button type="button" className="vop-reset-btn" onClick={handleReset}>
              Reset
            </button>
          )}
          <button type="button" className="vop-close-btn" onClick={onClose} aria-label="Close viewing options">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* 4 Tabs */}
      <div className="vop-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'video'} className={`vop-tab ${tab === 'video' ? 'active' : ''}`} onClick={() => setTab('video')}>
          <MonitorPlay size={14} />
          <span>Video</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'playback'} className={`vop-tab ${tab === 'playback' ? 'active' : ''}`} onClick={() => setTab('playback')}>
          <Play size={13} />
          <span>Playback</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'chapters'} className={`vop-tab ${tab === 'chapters' ? 'active' : ''}`} onClick={() => setTab('chapters')}>
          <List size={14} />
          <span>Chapters</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'info'} className={`vop-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
          <Info size={14} />
          <span>Info</span>
        </button>
      </div>

      {/* Body */}
      <div className="vop-body">
        {tab === 'video' && (
          <>
            <div>
              <div className="vop-section-label">Preset</div>
              <div className="vop-presets">
                {VIDEO_COLOR_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`vop-chip ${color.preset === p.id ? 'active' : ''}`}
                    onClick={() => updateColor({ preset: p.id, ...p.values })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="vop-sliders-grid">
              {renderSlider('Brightness', 'brightness')}
              {renderSlider('Contrast', 'contrast')}
              {renderSlider('Saturation', 'saturation')}
              {renderSlider('Gamma', 'gamma')}
              {renderSlider('Hue', 'hue')}
            </div>

            <div>
              <div className="vop-section-label">Picture fit</div>
              <div className="vop-fit-seg">
                {([
                  ['fit', 'Fit'],
                  ['fill', 'Fill'],
                  ['100', '100%'],
                  ['150', '150%'],
                  ['stretch', 'Stretch'],
                ] as Array<[PictureFitMode, string]>).map(([mode, lbl]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`vop-fit-btn ${color.pictureFit === mode ? 'active' : ''}`}
                    onClick={() => updateColor({ pictureFit: mode })}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'playback' && (
          <>
            <div>
              <div className="vop-section-label">Playback speed</div>
              <div className="vop-presets">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    className={`vop-chip ${Math.abs(playbackRate - spd) < 0.05 ? 'active' : ''}`}
                    onClick={() => onChangePlaybackRate(spd)}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="vop-section-label">HDR Tone Mapping</div>
              <div className="vop-presets">
                {(['off', 'aces', 'vibrant', 'reinhard'] as ToneMappingMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`vop-chip ${toneMappingMode === m ? 'active' : ''}`}
                    onClick={() => onChangeToneMapping(m)}
                  >
                    {m === 'off' ? 'Off' : m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="vop-info-row" style={{ borderBottom: 'none' }}>
              <span className="vop-info-key">Loop playback</span>
              <button
                type="button"
                className={`vop-chip ${isLoop ? 'active' : ''}`}
                onClick={() => {
                  const next = !isLoop;
                  setIsLoop(next);
                  if (videoRef.current) videoRef.current.loop = next;
                }}
              >
                {isLoop ? 'On' : 'Off'}
              </button>
            </div>
          </>
        )}

        {tab === 'chapters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {bookmarks.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-2, #a39b93)', fontSize: '12.5px' }}>
                No chapters or bookmarks for this video.
              </div>
            ) : (
              bookmarks.map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  className="vop-chapter-row"
                  onClick={() => {
                    if (onSeek) onSeek(bm.time);
                    else if (videoRef.current) videoRef.current.currentTime = bm.time;
                  }}
                >
                  <span>{bm.label || 'Bookmark'}</span>
                  <span style={{ color: 'var(--accent, #eb8c34)', fontFamily: 'monospace' }}>{formatTime(bm.time)}</span>
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'info' && (
          <div>
            <div className="vop-info-row">
              <span className="vop-info-key">Title</span>
              <span className="vop-info-val">{title || 'Current media'}</span>
            </div>
            <div className="vop-info-row">
              <span className="vop-info-key">Resolution</span>
              <span className="vop-info-val">{resolution}</span>
            </div>
            <div className="vop-info-row">
              <span className="vop-info-key">Duration</span>
              <span className="vop-info-val">{duration > 0 ? formatTime(duration) : 'Unknown'}</span>
            </div>
            <div className="vop-info-row">
              <span className="vop-info-key">Speed</span>
              <span className="vop-info-val">{playbackRate.toFixed(2)}×</span>
            </div>
            <div className="vop-info-row" style={{ borderBottom: 'none' }}>
              <span className="vop-info-key">Picture fit</span>
              <span className="vop-info-val" style={{ textTransform: 'uppercase' }}>{color.pictureFit}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewingOptionsPopover;
