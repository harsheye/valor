import React, { useState } from 'react';
import { Check, Upload } from 'lucide-react';
import { SPINNER_PRESETS, LoadingSpinner, type SpinnerPreset } from '../LoadingSpinner';
import { Segmented } from './Segmented';
import { Switch } from './Switch';
import { SettingRow } from './SettingRow';

export interface SpinnerPresetsProps {
  currentPreset: string;
  onSelectPreset: (preset: SpinnerPreset) => void;
  customLoaderType: string;
  customLoaderUrl: string;
  onCustomLoaderChange: (type: 'default' | 'image' | 'video' | 'gif', url: string) => void;
}

export const SpinnerPresets: React.FC<SpinnerPresetsProps> = ({
  currentPreset,
  onSelectPreset,
  customLoaderType,
  customLoaderUrl,
  onCustomLoaderChange,
}) => {
  const [backdrop, setBackdrop] = useState<'dark' | 'poster' | 'light'>('poster');
  const [spinnerScale, setSpinnerScale] = useState<number>(100);

  const isCustom = customLoaderType !== 'default' && !!customLoaderUrl;

  const handleToggleCustom = (enabled: boolean) => {
    if (!enabled) {
      onCustomLoaderChange('default', '');
    } else {
      onCustomLoaderChange('image', customLoaderUrl || 'https://assets.stickpng.com/images/580b57fcd9996e24bc43c529.png');
    }
  };

  const backdropBackground =
    backdrop === 'dark'
      ? '#0b0c10'
      : backdrop === 'light'
      ? '#ffffff'
      : 'radial-gradient(circle at center, #1b2030 0%, #0d0f17 100%)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Controls: Backdrop segmented, Custom Switch, Size slider */}
      <SettingRow
        title="Preview background"
        description="Test how the spinner looks across light, dark, and media frames"
        control={
          <Segmented
            value={backdrop}
            onChange={(val) => setBackdrop(val as any)}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'poster', label: 'Poster' },
              { value: 'light', label: 'Light' },
            ]}
          />
        }
      />

      <SettingRow
        title="Use custom animation"
        description="Override default animation with a custom image, GIF, or video"
        control={
          <Switch
            checked={isCustom}
            onChange={handleToggleCustom}
            aria-label="Use custom loading animation"
          />
        }
      />

      <SettingRow
        title="Spinner size"
        description="Scale the loading indicator dimensions"
        control={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={spinnerScale}
              onChange={(e) => setSpinnerScale(parseInt(e.target.value, 10))}
              aria-label="Spinner size slider"
              style={{ width: '120px', accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: '40px', color: 'var(--text-1)' }}>
              {spinnerScale}%
            </span>
          </div>
        }
      />

      {/* Live Preview Frame */}
      <div
        style={{
          width: '100%',
          height: '200px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          background: backdropBackground,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          transition: 'background 0.2s ease',
        }}
      >
        <div style={{ transform: `scale(${spinnerScale / 100})`, transformOrigin: 'center center' }}>
          <LoadingSpinner
            preset={currentPreset as any}
            customLoaderType={customLoaderType as any}
            customLoaderUrl={customLoaderUrl}
          />
        </div>

        <span
          style={{
            position: 'absolute',
            bottom: '10px',
            fontSize: '0.7rem',
            color: backdrop === 'light' ? '#666666' : 'rgba(255,255,255,0.4)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {isCustom ? 'Custom animation active' : `Preset: ${currentPreset}`}
        </span>
      </div>

      {/* Custom URL Input if Custom is Enabled */}
      {isCustom && (
        <SettingRow
          title="Custom asset URL"
          description="Direct web link to image, GIF, or MP4"
          control={
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                type="url"
                value={customLoaderUrl}
                onChange={(e) => onCustomLoaderChange('image', e.target.value)}
                placeholder="https://example.com/spinner.gif"
                className="settings-color-hex-input"
                style={{ width: '240px', textTransform: 'none' }}
              />
            </div>
          }
        />
      )}

      {/* Selectable Preset Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-2)' }}>
          Animation presets
        </span>

        <div
          role="radiogroup"
          aria-label="Spinner presets"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {SPINNER_PRESETS.map((preset) => {
            const isSelected = !isCustom && currentPreset === preset.id;

            return (
              <div
                key={preset.id}
                role="radio"
                tabIndex={0}
                aria-checked={isSelected}
                aria-label={preset.name}
                onClick={() => onSelectPreset(preset.id)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    onSelectPreset(preset.id);
                  }
                }}
                style={{
                  background: 'var(--surface-2)',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  position: 'relative',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, background 0.15s ease, transform 0.1s ease',
                }}
              >
                {/* Real Animated Mini Spinner */}
                <div
                  style={{
                    height: '90px',
                    borderRadius: '4px',
                    background: '#0e1017',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ transform: 'scale(0.65)' }}>
                    <LoadingSpinner preset={preset.id} />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>
                    {preset.name}
                  </span>

                  {isSelected && (
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Check size={12} color="var(--on-accent)" strokeWidth={3} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
