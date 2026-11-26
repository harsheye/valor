import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

export interface SettingsSearchProps {
  query: string;
  onChange: (query: string) => void;
  placeholder?: string;
}

export const SettingsSearch: React.FC<SettingsSearchProps> = ({
  query,
  onChange,
  placeholder = 'Search settings...',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onChange('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChange]);

  return (
    <div
      role="search"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        maxWidth: '280px',
      }}
    >
      <Search
        size={15}
        style={{
          position: 'absolute',
          left: '14px',
          color: 'var(--text-3)',
          pointerEvents: 'none',
        }}
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search settings"
        style={{
          width: '100%',
          padding: '8px 34px 8px 36px',
          fontSize: '0.825rem',
          fontFamily: 'inherit',
          background: 'var(--surface-2)',
          border: '1px solid var(--control-border)',
          borderRadius: '9999px',
          color: 'var(--text-1)',
          outline: 'none',
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.background = 'var(--surface-3)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--control-border)';
          e.currentTarget.style.background = 'var(--surface-2)';
        }}
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: '10px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-3)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
