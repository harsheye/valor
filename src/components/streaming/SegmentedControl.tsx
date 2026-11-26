import React from 'react';
import './streaming.css';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  badge?: number | string;
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel = 'Segmented options',
  className = '',
  size = 'md'
}: SegmentedControlProps<T>) {
  const isSm = size === 'sm';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--surface-2)',
        border: '1px solid var(--control-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '2px',
        userSelect: 'none',
        gap: '2px'
      }}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-1)',
              background: isSelected ? 'var(--surface-3)' : 'transparent',
              color: isSelected ? 'var(--text-1)' : 'var(--text-2)',
              border: isSelected ? '1px solid var(--control-border)' : '1px solid transparent',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              padding: isSm ? '4px 10px' : '6px 14px',
              fontSize: isSm ? '0.78rem' : '0.85rem',
              fontWeight: isSelected ? 600 : 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
              whiteSpace: 'nowrap',
              outline: 'none',
              boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
            }}
          >
            <span>{option.label}</span>
            {option.badge !== undefined && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: isSelected ? 'var(--accent-soft)' : 'var(--surface-1)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-3)',
                  marginLeft: '2px'
                }}
              >
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
