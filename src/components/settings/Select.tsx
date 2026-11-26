import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Select<T extends string | number = string>({
  value,
  onChange,
  options,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  className = '',
  style,
}: SelectProps<T>) {
  return (
    <div className={`settings-select-wrapper ${className}`} style={style}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value as T)}
        className="settings-select"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="settings-select-arrow" aria-hidden="true">
        <ChevronDown size={14} />
      </div>
    </div>
  );
}
