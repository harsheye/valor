import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import './streaming.css';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search movies, TV series, anime...',
  debounceMs = 250,
  className = '',
  style,
  autoFocus = false
}) => {
  const [internalValue, setInternalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal value when outer value changes
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // Debounce outer onChange call (250ms debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (internalValue !== value) {
        onChange(internalValue);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [internalValue, debounceMs, onChange, value]);

  // Global "/" keyboard shortcut to focus input, and Escape to clear/blur
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== inputRef.current &&
        !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        if (internalValue) {
          setInternalValue('');
          onChange('');
        } else {
          inputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [internalValue, onChange]);

  const handleClear = () => {
    setInternalValue('');
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        maxWidth: '480px',
        ...style
      }}
    >
      <Search
        size={18}
        style={{
          position: 'absolute',
          left: '14px',
          color: isFocused ? 'var(--accent)' : 'var(--text-3)',
          pointerEvents: 'none',
          transition: 'color 0.15s ease'
        }}
        aria-hidden="true"
      />

      <input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Search media"
        style={{
          width: '100%',
          padding: '10px 42px 10px 42px',
          background: 'var(--surface-2)',
          border: '1px solid var(--control-border)',
          borderRadius: '9999px', /* Pill search input */
          color: 'var(--text-1)',
          fontSize: '0.9rem',
          outline: 'none',
          boxSizing: 'border-box',
          boxShadow: isFocused
            ? '0 0 0 2px var(--focus-ring), 0 0 12px var(--accent-soft)'
            : '0 2px 8px rgba(0,0,0,0.2)',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease'
        }}
      />

      {internalValue ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search query"
          style={{
            position: 'absolute',
            right: '12px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-3)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'color 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <X size={16} />
        </button>
      ) : (
        <span
          style={{
            position: 'absolute',
            right: '12px',
            fontSize: '0.72rem',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--surface-3)',
            color: 'var(--text-3)',
            border: '1px solid var(--border)',
            pointerEvents: 'none'
          }}
          aria-hidden="true"
        >
          /
        </span>
      )}
    </div>
  );
};
