import React, { useRef } from 'react';

export interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  showNoBackground?: boolean;
  onNoBackground?: () => void;
  id?: string;
  'aria-label'?: string;
}

export const ColorField: React.FC<ColorFieldProps> = ({
  value,
  onChange,
  showNoBackground = false,
  onNoBackground,
  id,
  'aria-label': ariaLabel = 'Color',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isTransparent = value === 'transparent' || value === '' || value === 'none';
  const displayHex = isTransparent ? 'NONE' : (value.startsWith('#') ? value.toUpperCase() : `#${value.toUpperCase()}`);
  const nativePickerValue = isTransparent || !value.startsWith('#') ? '#000000' : value;

  return (
    <div className="settings-color-field" id={id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {/* Clickable Swatch Pill */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${ariaLabel}: ${displayHex}. Click to open color picker`}
        onClick={() => {
          if (!isTransparent || !showNoBackground) {
            inputRef.current?.click();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          background: 'var(--surface-2)',
          border: '1px solid var(--control-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0 12px',
          height: '36px',
          cursor: isTransparent && showNoBackground ? 'default' : 'pointer',
          minWidth: '130px',
          boxSizing: 'border-box',
          position: 'relative',
          userSelect: 'none',
        }}
      >
        {/* Color Dot Swatch */}
        <div
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: isTransparent ? 'transparent' : value,
            border: '2px solid var(--border)',
            backgroundImage: isTransparent
              ? 'linear-gradient(45deg, #555 25%, transparent 25%), linear-gradient(-45deg, #555 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #555 75%), linear-gradient(-45deg, transparent 75%, #555 75%)'
              : 'none',
            backgroundSize: '6px 6px',
            backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            flexShrink: 0,
          }}
        />

        {/* Hex Text */}
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: isTransparent ? 'var(--text-3)' : 'var(--text-1)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {displayHex}
        </span>

        {/* Hidden Native Picker */}
        <input
          ref={inputRef}
          type="color"
          value={nativePickerValue}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        />
      </div>

      {/* No Background Button */}
      {showNoBackground && (
        <button
          type="button"
          aria-pressed={isTransparent}
          className="settings-btn-secondary"
          style={{
            height: '36px',
            padding: '0 12px',
            fontSize: '0.8rem',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            background: isTransparent ? 'var(--accent-fill)' : 'var(--surface-2)',
            color: isTransparent ? 'var(--on-accent)' : 'var(--text-2)',
            borderColor: isTransparent ? 'var(--accent-fill)' : 'var(--control-border)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onClick={() => {
            if (onNoBackground) {
              onNoBackground();
            } else {
              onChange(isTransparent ? '#000000' : 'transparent');
            }
          }}
        >
          No background
        </button>
      )}
    </div>
  );
};
