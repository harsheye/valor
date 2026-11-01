import React from 'react';

export interface SegmentedOption<T extends string | number = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string | number = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  disabled?: boolean;
  name?: string;
  'aria-label'?: string;
}

export function Segmented<T extends string | number = string>({
  value,
  onChange,
  options,
  disabled = false,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % options.length;
      onChange(options[nextIndex].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + options.length) % options.length;
      onChange(options[prevIndex].value);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="settings-segmented"
    >
      {options.map((opt, index) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-pressed={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={disabled}
            className={`settings-segmented-item ${isSelected ? 'active' : ''}`}
            onClick={() => {
              if (!disabled) onChange(opt.value);
            }}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {opt.icon && <span style={{ marginRight: '6px', display: 'inline-flex' }}>{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
