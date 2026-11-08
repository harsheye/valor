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
          width: max-content;
          max-width: 220px;
          background: var(--dropdown-bg, rgba(18, 18, 18, 0.98));
          border: 1px solid var(--dropdown-border, rgba(255, 255, 255, 0.15));
          border-radius: 6px;
          box-shadow: var(--shadow-xl, 0 10px 40px rgba(0,0,0,0.6));
          overflow: hidden;
          animation: dropdown-fade-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes dropdown-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .custom-select-search-wrapper {
          padding: 4px 6px;
          border-bottom: 1px solid var(--dropdown-border);
        }
        .custom-select-search-input {
          width: 100%;
          background: var(--bg-secondary, rgba(0, 0, 0, 0.2));
          border: 1px solid var(--dropdown-border);
          border-radius: 4px;
          color: var(--dropdown-text);
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .custom-select-search-input:focus {
          border-color: var(--accent-color);
        }
        .custom-select-options-list {
          max-height: 180px;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .custom-select-empty {
          padding: 0.5rem;
          color: var(--text-muted);
          font-size: 0.75rem;
          text-align: center;
        }
        .custom-select-option {
          display: flex;
          align-items: center;
          padding: 0.35rem 0.65rem;
          font-size: 0.78rem;
          color: var(--dropdown-text, rgba(255, 255, 255, 0.9));
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
          font-weight: 600;
        }
        .option-check-icon {
          width: 12px;
          height: 12px;
          margin-right: 0.4rem;
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
