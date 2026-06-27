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
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  onChange, 
  options, 
  placeholder = "Select option...",
  className = '' 
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
    <div className={`custom-select-container ${className}`} ref={containerRef}>
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
        <ChevronsUpDown className="trigger-chevron" />
      </button>
      
      {isOpen && (
        <div className="custom-select-dropdown">
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
          width: 250px; /* Standardize length for all dropdowns to be consistent */
          user-select: none;
          text-align: left;
        }
        .custom-select-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(10, 10, 10, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #ffffff;
          padding: 0.55rem 0.85rem;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          width: 100%;
          outline: none;
        }
        .custom-select-trigger:hover {
          border-color: rgba(255, 255, 255, 0.25);
          background: rgba(20, 20, 20, 0.85);
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.05);
        }
        .trigger-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-right: 0.5rem;
        }
        .trigger-chevron {
          width: 16px;
          height: 16px;
          opacity: 0.5;
          flex-shrink: 0;
        }
        .custom-select-dropdown {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          right: 0;
          background: #0d0d0d;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          z-index: 1000;
          box-shadow: 0 12px 36px rgba(0,0,0,0.9);
          overflow: hidden;
          animation: dropdown-fade-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes dropdown-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .custom-select-search-wrapper {
          padding: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .custom-select-search-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #ffffff;
          padding: 0.4rem 0.6rem;
          font-size: 0.82rem;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .custom-select-search-input:focus {
          border-color: rgba(59, 130, 246, 0.5);
        }
        .custom-select-options-list {
          max-height: 180px;
          overflow-y: auto;
          scrollbar-width: none; /* Invisible scrollbar for Firefox */
        }
        .custom-select-options-list::-webkit-scrollbar {
          display: none; /* Invisible scrollbar for Chrome/Safari/Edge */
        }
        .custom-select-empty {
          padding: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.82rem;
          text-align: center;
        }
        .custom-select-option {
          display: flex;
          align-items: center;
          padding: 0.5rem 0.85rem;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .custom-select-option:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }
        .custom-select-option.selected {
          background: #3b82f6;
          color: #ffffff;
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
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
};
