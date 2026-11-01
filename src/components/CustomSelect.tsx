import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Check, ChevronsUpDown } from 'lucide-react';

interface Option {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (value: any) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  hideSearch?: boolean;
  width?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  onChange, 
  options, 
  placeholder = "Select option...",
  className = '',
  hideSearch = false,
  width
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; minWidth: number }>({ top: 0, left: 0, minWidth: 150 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Position the dropdown based on trigger's bounding rect
  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 5,
        left: rect.left,
        minWidth: Math.max(150, rect.width)
      });
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      updatePosition();
      // Focus the search input when opened
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, updatePosition]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!isOpen) return;
    const handleReposition = () => updatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isOpen, updatePosition]);

  const activeOption = options.find(o => o.value === value);

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  // Render the dropdown via portal into document.body
  const dropdownContent = isOpen ? ReactDOM.createPortal(
    <div 
      ref={dropdownRef}
      className="custom-select-dropdown"
      style={{
        position: 'fixed',
        top: `${dropdownPos.top}px`,
        left: `${dropdownPos.left}px`,
        minWidth: `${dropdownPos.minWidth}px`,
        zIndex: 999999
      }}
    >
      {!hideSearch && (
      <div className="custom-select-search-wrapper" onClick={(e) => e.stopPropagation()}>
        <input
          ref={searchInputRef}
          type="text"
          className="custom-select-search-input"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      )}
      <div className="custom-select-options-list">
        {filteredOptions.length === 0 ? (
          <div className="custom-select-empty">No options found.</div>
        ) : (
          filteredOptions.map((option) => {
            const isSelected = option.value === value;
            return (
              <div 
                key={option.value}
                className={`custom-select-option ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <Check className={`option-check-icon ${isSelected ? 'visible' : ''}`} />
                <span className="option-label-text">{option.label}</span>
              </div>
            );
          })
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div 
      className={`custom-select-container ${isOpen ? 'is-open' : ''} ${className}`} 
      ref={containerRef}
      style={width ? { width } : undefined}
    >
      <button 
        type="button"
        ref={triggerRef}
        className="custom-select-trigger" 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <span className="trigger-label">
          {activeOption ? activeOption.label : placeholder}
        </span>
        <ChevronsUpDown size={14} className="trigger-chevron" />
      </button>
      
      {dropdownContent}

      <style>{`
        .custom-select-container {
          position: relative;
          min-width: 120px;
          user-select: none;
          text-align: left;
          z-index: 50;
        }
        .custom-select-container.is-open {
          z-index: 9999 !important;
        }
        .custom-select-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 36px;
          background: var(--surface-1);
          border: 1px solid var(--control-border);
          border-radius: var(--radius-sm);
          color: var(--text-1);
          padding: 0.45rem 0.85rem;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease-out;
          width: 100%;
          outline: none;
          white-space: nowrap;
          box-sizing: border-box;
        }
        .custom-select-trigger:hover {
          background: var(--surface-2);
          border-color: var(--accent);
          box-shadow: none;
        }
        .custom-select-trigger:focus-visible {
          border-color: var(--focus-ring);
          outline: 2px solid var(--focus-ring);
          outline-offset: 1px;
        }
        .trigger-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: left;
          flex: 1;
        }
        .trigger-chevron {
          width: 14px;
          height: 14px;
          color: var(--text-2);
          flex-shrink: 0;
        }
        .custom-select-dropdown {
          width: max-content;
          max-width: 240px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
          overflow: hidden;
          animation: dropdown-fade-in 0.15s ease-out;
        }
        @keyframes dropdown-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .custom-select-search-wrapper {
          padding: 6px 8px;
          border-bottom: 1px solid var(--border);
        }
        .custom-select-search-input {
          width: 100%;
          background: var(--surface-1);
          border: 1px solid var(--control-border);
          border-radius: var(--radius-sm);
          color: var(--text-1);
          padding: 0.35rem 0.5rem;
          font-size: 0.8rem;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .custom-select-search-input:focus {
          border-color: var(--accent);
        }
        .custom-select-options-list {
          max-height: 180px;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .custom-select-empty {
          padding: 0.5rem;
          color: var(--text-3);
          font-size: 0.75rem;
          text-align: center;
        }
        .custom-select-option {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0.45rem 0.75rem;
          font-size: 0.82rem;
          color: var(--text-2);
          cursor: pointer;
          transition: all 0.12s ease-out;
          white-space: nowrap;
        }
        .custom-select-option:hover {
          background: var(--surface-3);
          color: var(--text-1);
        }
        .custom-select-option.selected {
          background: var(--accent-soft);
          color: var(--text-1);
          font-weight: 600;
        }
        .option-check-icon {
          width: 12px;
          height: 12px;
          margin-right: 0.4rem;
          opacity: 0;
          flex-shrink: 0;
          color: var(--accent);
          transition: opacity 0.1s;
        }
        .option-check-icon.visible {
          opacity: 1;
        }
        .option-label-text {
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
};
