import React, { useState, useEffect, useRef } from 'react';
import { Edit3, X } from 'lucide-react';

interface LibraryRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTitle: string;
  onSave: (newTitle: string) => void;
}

export const LibraryRenameModal: React.FC<LibraryRenameModalProps> = ({
  isOpen,
  onClose,
  currentTitle,
  onSave
}) => {
  const [title, setTitle] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(currentTitle);
  }, [currentTitle, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSave(title.trim());
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--scrim)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.5)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Edit3 size={18} color="var(--accent)" />
            <h3 id="rename-modal-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-1)' }}>
              Rename title
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-2)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="rename-input" style={{ fontSize: '0.8rem', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
              Display title
            </label>
            <input
              id="rename-input"
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-1)',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                color: 'var(--text-1)',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: 'var(--accent-fill)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 16px',
                color: 'var(--on-accent)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
