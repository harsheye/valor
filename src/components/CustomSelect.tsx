import React, { useState, useEffect, useRef } from 'react';

interface Option {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (value: any) => void;
  options: Option[];
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  onChange, 
  options, 
  className = '' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeOption = options.find(o => o.value === value) || options[0];

  return (
    <div className={`custom-select-container ${className}`} ref={containerRef}>
      <div 
        className="custom-select-trigger" 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <span>{activeOption?.label}</span>
        <span className={`custom-select-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </div>
      {isOpen && (
        <div className="custom-select-options-list">
          {options.map((option) => (
            <div 
              key={option.value}
              className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .custom-select-container {
          position: relative;
          width: 100%;
          min-width: 120px;
          user-select: none;
          text-align: left;
        }
        .custom-select-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #ffffff;
          padding: 0.5rem 0.85rem;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .custom-select-trigger:hover {
          border-color: rgba(255, 255, 255, 0.25);
          background: rgba(0, 0, 0, 0.6);
        }
        .custom-select-arrow {
          font-size: 0.6rem;
          margin-left: 0.5rem;
          transition: transform 0.2s ease;
          opacity: 0.6;
        }
        .custom-select-arrow.open {
          transform: rotate(180deg);
        }
        .custom-select-options-list {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: #0a0a0a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          max-height: 180px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 10px 30px rgba(0,0,0,0.8);
          scrollbar-width: none; /* Invisible scrollbar for Firefox */
        }
        .custom-select-options-list::-webkit-scrollbar {
          display: none; /* Invisible scrollbar for Chrome/Safari/Edge */
        }
        .custom-select-option {
          padding: 0.5rem 0.85rem;
          font-size: 0.88rem;
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
      `}</style>
    </div>
  );
};
