import React, { useState, useRef } from 'react';
import { 
  LoadingSpinner, 
  SPINNER_PRESETS, 
  SpinnerThumbnail 
} from './LoadingSpinner';
import type { SpinnerPreset } from './LoadingSpinner';
import { 
  Play, Pause, Upload, Sliders, Check, Sparkles, Monitor, Trash2, Link as LinkIcon 
} from 'lucide-react';

interface SpinnerSettingsViewProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  saveSettingsToStorage: (settings: any) => void;
  handleDefaultLangChange: (field: any, val: any) => void;
  addToast: (text: string, type?: 'success' | 'error' | 'warning') => void;
}

export const SpinnerSettingsView: React.FC<SpinnerSettingsViewProps> = ({
  settings,
  setSettings,
  saveSettingsToStorage,
  addToast
}) => {
  const [backdropMode, setBackdropMode] = useState<'dark' | 'poster' | 'light'>('poster');
  const [isTestBuffering, setIsTestBuffering] = useState<boolean>(true);
  const [previewScale, setPreviewScale] = useState<number>(1);
  const [urlInput, setUrlInput] = useState<string>('');
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectPreset = (presetId: SpinnerPreset) => {
    setSettings((prev: any) => {
      const updated = {
        ...prev,
        spinnerPreset: presetId,
        customLoaderType: 'default' as const,
        customLoaderUrl: ''
      };
      saveSettingsToStorage(updated);
      return updated;
    });
    addToast(`Selected ${SPINNER_PRESETS.find(p => p.id === presetId)?.name || presetId} preset!`, 'success');
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      addToast('Invalid file format. Please upload an image, GIF, or MP4 video.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const loaderType = isVideo ? 'video' : 'image';
      setSettings((prev: any) => {
        const updated = { ...prev, customLoaderUrl: dataUrl, customLoaderType: loaderType };
        saveSettingsToStorage(updated);
        return updated;
      });
      addToast(`Custom ${loaderType.toUpperCase()} spinner applied!`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) {
      addToast('Please enter a valid media URL', 'warning');
      return;
    }
    const isVideo = urlInput.endsWith('.mp4') || urlInput.endsWith('.webm');
    const loaderType = isVideo ? 'video' : 'image';
    setSettings((prev: any) => {
      const updated = { ...prev, customLoaderUrl: urlInput.trim(), customLoaderType: loaderType };
      saveSettingsToStorage(updated);
      return updated;
    });
    addToast(`Applied external custom spinner from URL`, 'success');
    setShowUrlInput(false);
  };

  const handleResetToDefault = () => {
    setSettings((prev: any) => {
      const updated = { ...prev, customLoaderUrl: '', customLoaderType: 'default' as const, spinnerPreset: 'fire-circle' };
      saveSettingsToStorage(updated);
      return updated;
    });
    setUrlInput('');
    addToast('Reset to default Fire Circle preset', 'success');
  };

  const isCustomActive = settings.customLoaderType !== 'default' && settings.customLoaderUrl;

  return (
    <div className="spinner-settings-container animate-fade-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* ─── 2-Column Layout: Left = Sticky Preview, Right = Settings ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        alignItems: 'start'
      }} className="spinner-grid-layout">

        {/* ═══ LEFT COLUMN: Sticky Live Preview ═══ */}
        <div style={{
          position: 'sticky',
          top: '0',
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '0.85rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem'
        }}>
          
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Monitor size={15} style={{ color: 'var(--accent-color)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Live Preview</span>
            </div>
            <div className="segmented-control" style={{ width: 'auto' }}>
              {(['dark', 'poster', 'light'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setBackdropMode(mode)}
                  className={`segmented-button ${backdropMode === mode ? 'active' : ''}`}
                  style={{ padding: '0.2rem 0.55rem', fontSize: '0.68rem', textTransform: 'capitalize' }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Player Canvas */}
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16/9',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            background: backdropMode === 'dark'
              ? '#0d0d0d'
              : backdropMode === 'light'
                ? '#f0f3f6'
                : 'linear-gradient(135deg, #1a0826 0%, #0a1128 50%, #1c0505 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.3s ease'
          }}>
            {/* Poster overlay */}
            {backdropMode === 'poster' && (
              <>
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(229,9,20,0.15) 0%, transparent 60%), linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.85) 100%)',
                  zIndex: 0
                }} />
                <div style={{ position: 'absolute', top: '8px', left: '10px', zIndex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ background: '#e50914', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>4K</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Dune: Part Two</span>
                </div>
                <div style={{
                  position: 'absolute', bottom: '6px', left: '8px', right: '8px',
                  padding: '4px 8px',
                  background: 'rgba(15,15,15,0.75)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: '5px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Play size={10} fill="#fff" color="#fff" />
                    <div style={{ height: '2px', width: '80px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', position: 'relative' }}>
                      <div style={{ height: '100%', width: '35%', background: '#e50914', borderRadius: '2px' }} />
                    </div>
                    <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>00:42 / 02:46</span>
                  </div>
                  <span style={{ fontSize: '0.58rem', color: '#22c55e', fontWeight: 700 }}>BUFFERING</span>
                </div>
              </>
            )}

            {/* Spinner */}
            <div style={{
              transform: `scale(${previewScale})`,
              transition: 'transform 0.2s ease',
              zIndex: 2,
              opacity: isTestBuffering ? 1 : 0.12,
              filter: isTestBuffering ? 'none' : 'grayscale(1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <LoadingSpinner
                customLoaderUrl={settings.customLoaderUrl}
                customLoaderType={settings.customLoaderType}
                preset={settings.spinnerPreset as SpinnerPreset}
              />
            </div>
          </div>

          {/* Control strip */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface)',
            padding: '0.4rem 0.65rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            gap: '0.5rem'
          }}>
            <button
              onClick={() => setIsTestBuffering(!isTestBuffering)}
              style={{
                background: isTestBuffering ? 'rgba(34,197,94,0.12)' : 'var(--card-bg)',
                border: isTestBuffering ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border-color)',
                color: isTestBuffering ? '#22c55e' : 'var(--text-secondary)',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                transition: 'all 0.2s'
              }}
            >
              {isTestBuffering ? <Pause size={11} /> : <Play size={11} />}
              <span>{isTestBuffering ? 'Active' : 'Paused'}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sliders size={11} style={{ color: 'var(--text-muted)' }} />
              <input
                type="range" min="0.7" max="1.5" step="0.1"
                value={previewScale}
                onChange={(e) => setPreviewScale(parseFloat(e.target.value))}
                style={{ width: '60px', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.68rem', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace', width: '26px' }}>
                {Math.round(previewScale * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: Presets + Custom Upload ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Built-in Presets ── */}
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '0.85rem',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Sparkles size={14} style={{ color: 'var(--accent-color)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Presets</span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.6rem'
            }}>
              {SPINNER_PRESETS.map((p) => {
                const isActive = !isCustomActive && settings.spinnerPreset === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPreset(p.id)}
                    title={p.name}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      aspectRatio: '1',
                      background: 'var(--surface)',
                      border: isActive ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isActive ? '0 0 12px var(--accent-glow)' : 'none',
                      overflow: 'hidden',
                      padding: '8px'
                    }}
                  >
                    {isActive && (
                      <div style={{
                        position: 'absolute', top: '6px', right: '6px', zIndex: 2,
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'var(--accent-color)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                      }}>
                        <Check size={11} strokeWidth={3} />
                      </div>
                    )}
                    <SpinnerThumbnail preset={p.id} size={140} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Custom External Loader ── */}
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '0.85rem',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.1rem 0', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Upload size={14} style={{ color: '#f59e0b' }} />
                  Custom Media Upload
                </h4>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Upload GIF, WebP, SVG or MP4 video.
                </p>
              </div>
              {isCustomActive && (
                <button
                  onClick={handleResetToDefault}
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#ef4444',
                    padding: '0.28rem 0.55rem',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444'; }}
                >
                  <Trash2 size={11} />
                  <span>Remove</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/mp4"
              style={{ display: 'none' }}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }}
            />

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files?.[0]; if (file) handleFileUpload(file); }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: isDragging
                  ? '2px dashed var(--accent-color)'
                  : isCustomActive
                    ? '1.5px solid rgba(34,197,94,0.35)'
                    : '1.5px dashed var(--border-color)',
                background: isDragging
                  ? 'var(--accent-glow)'
                  : isCustomActive
                    ? 'rgba(34,197,94,0.04)'
                    : 'var(--surface)',
                borderRadius: '10px',
                padding: '1rem 0.75rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginBottom: '0.6rem'
              }}
            >
              <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>
                {isCustomActive ? '✨' : '📂'}
              </div>
              <h5 style={{ margin: '0 0 0.15rem 0', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {isCustomActive ? 'Custom Loader Active' : 'Drop Media File Here'}
              </h5>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                GIF, WebP, SVG, PNG, JPG or MP4
              </p>
              <span style={{
                display: 'inline-block',
                padding: '0.3rem 0.75rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                borderRadius: '6px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}>
                {isCustomActive ? 'Replace File' : 'Browse'}
              </span>
            </div>

            {/* URL import */}
            {!showUrlInput ? (
              <button
                onClick={() => setShowUrlInput(true)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--accent-color)',
                  fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.3rem', padding: 0
                }}
              >
                <LinkIcon size={11} />
                <span>Import from URL...</span>
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={urlInput}
                  placeholder="https://example.com/loader.gif"
                  onChange={(e) => setUrlInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    padding: '0.35rem 0.55rem',
                    fontSize: '0.75rem',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleApplyUrl}
                  style={{
                    background: 'var(--accent-color)', border: 'none', color: '#fff',
                    padding: '0.35rem 0.65rem', borderRadius: '6px',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
                <button
                  onClick={() => setShowUrlInput(false)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
