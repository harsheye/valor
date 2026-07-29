import React, { useState, useEffect, useRef } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      // Focus the search input when opened
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const activeOption = options.find(o => o.value === value);

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div 
      className={`custom-select-container ${isOpen ? 'is-open' : ''} ${className}`} 
      ref={containerRef}
      style={width ? { width } : undefined}
    >
      <button 
        type="button"
        className="custom-select-trigger" 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <span className="trigger-label">
          {activeOption ? activeOption.label : placeholder}
        </span>
      </button>
      
      {isOpen && (
        <div className="custom-select-dropdown">
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
        </div>
      )}

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
          justify-content: center;
          background: var(--dropdown-bg);
          border: 1px solid var(--dropdown-border);
          border-radius: 8px;
          color: var(--dropdown-text);
          padding: 0.45rem 0.85rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          width: 100%;
          outline: none;
          white-space: nowrap;
        }
        .custom-select-trigger:hover {
          border-color: var(--accent-glow);
          background: var(--dropdown-hover-bg);
          box-shadow: 0 0 10px var(--accent-glow);
        }
        .trigger-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-right: 0;
          text-align: center;
        }
        .trigger-chevron {
          width: 16px;
          height: 16px;
          opacity: 0.6;
          flex-shrink: 0;
        }
        .custom-select-dropdown {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          min-width: 150px;
          width: max-content;
          max-width: 280px;
          background: var(--dropdown-bg);
          border: 1px solid var(--dropdown-border);
          border-radius: 8px;
          z-index: 99999 !important;
          box-shadow: var(--shadow-xl);
          overflow: hidden;
          animation: dropdown-fade-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes dropdown-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .custom-select-search-wrapper {
          padding: 6px;
          border-bottom: 1px solid var(--dropdown-border);
        }
        .custom-select-search-input {
          width: 100%;
          background: var(--bg-secondary, rgba(0, 0, 0, 0.2));
          border: 1px solid var(--dropdown-border);
          border-radius: 6px;
          color: var(--dropdown-text);
          padding: 0.4rem 0.6rem;
          font-size: 0.82rem;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .custom-select-search-input:focus {
          border-color: var(--accent-color);
        }
        .custom-select-options-list {
          max-height: 220px;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .custom-select-empty {
          padding: 0.75rem;
          color: var(--text-muted);
          font-size: 0.82rem;
          text-align: center;
        }
        .custom-select-option {
          display: flex;
          align-items: center;
          padding: 0.55rem 0.85rem;
          font-size: 0.85rem;
          color: var(--dropdown-text);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .custom-select-option:hover {
          background: var(--dropdown-hover-bg);
        }
        .custom-select-option.selected {
          background: var(--accent-color);
          color: var(--btn-text-color, #ffffff);
          font-weight: 700;
        }
        .option-check-icon {
          width: 14px;
          height: 14px;
          margin-right: 0.5rem;
          opacity: 0;
          flex-shrink: 0;
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
