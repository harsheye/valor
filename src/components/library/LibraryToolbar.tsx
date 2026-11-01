import React, { useRef, useEffect } from 'react';
import { Search, LayoutGrid, List, X } from 'lucide-react';
import type { SortOption, FilterOption } from '../../utils/libraryViewModel';
import { CustomSelect } from '../CustomSelect';

interface LibraryToolbarProps {
  activeTab: 'movies' | 'series';
  onTabChange: (tab: 'movies' | 'series') => void;
  moviesCount: number;
  seriesCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recently-added', label: 'Recently added' },
  { value: 'recently-played', label: 'Recently played' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'year', label: 'Year (newest)' },
  { value: 'length', label: 'Length (longest)' },
];

export const LibraryToolbar: React.FC<LibraryToolbarProps> = ({
  activeTab,
  onTabChange,
  moviesCount,
  seriesCount,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  filterBy,
  onFilterChange,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global '/' keyboard shortcut to focus search, and 'Escape' to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        if (searchQuery) {
          onSearchChange('');
        } else {
          searchInputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, onSearchChange]);

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 30,
      backgroundColor: 'var(--bg)',
      borderBottom: '1px solid var(--border)',
      paddingBottom: '0.75rem',
      marginBottom: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      width: '100%'
    }}>
      {/* Top Row: Tabs, Search, Sort, Grid/List Segmented Control */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        {/* Left: Movies / Series Tabs */}
        <div 
          role="tablist" 
          aria-label="Library media type"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <button
            role="tab"
            aria-selected={activeTab === 'movies'}
            onClick={() => onTabChange('movies')}
            style={{
              background: activeTab === 'movies' ? 'var(--surface-3)' : 'transparent',
              color: activeTab === 'movies' ? 'var(--text-1)' : 'var(--text-2)',
              border: '1px solid',
              borderColor: activeTab === 'movies' ? 'var(--control-border)' : 'transparent',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 14px',
              fontSize: '0.9rem',
              fontWeight: activeTab === 'movies' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease-out'
            }}
          >
            <span>Movies</span>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '1px 7px',
              borderRadius: '10px',
              background: activeTab === 'movies' ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: activeTab === 'movies' ? 'var(--accent)' : 'var(--text-3)',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {moviesCount}
            </span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'series'}
            onClick={() => onTabChange('series')}
            style={{
              background: activeTab === 'series' ? 'var(--surface-3)' : 'transparent',
              color: activeTab === 'series' ? 'var(--text-1)' : 'var(--text-2)',
              border: '1px solid',
              borderColor: activeTab === 'series' ? 'var(--control-border)' : 'transparent',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 14px',
              fontSize: '0.9rem',
              fontWeight: activeTab === 'series' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease-out'
            }}
          >
            <span>Series</span>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '1px 7px',
              borderRadius: '10px',
              background: activeTab === 'series' ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: activeTab === 'series' ? 'var(--accent)' : 'var(--text-3)',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {seriesCount}
            </span>
          </button>
        </div>

        {/* Right Controls: Search, Sort Dropdown, Grid/List Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            minWidth: '200px',
            maxWidth: '280px'
          }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search library ( / )"
              aria-label="Search library"
              style={{
                width: '100%',
                padding: '6px 28px 6px 32px',
                background: 'var(--surface-1)',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-1)',
                fontSize: '0.85rem',
                outline: 'none',
                minHeight: '36px',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Sort Select */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label htmlFor="library-sort" className="visually-hidden" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}>
              Sort by
            </label>
            <CustomSelect
              value={sortBy}
              onChange={(val) => onSortChange(val as SortOption)}
              options={SORT_OPTIONS}
              hideSearch
              width="155px"
            />
          </div>

          {/* Segmented Grid / List Toggle */}
          <div 
            role="group" 
            aria-label="View mode toggle"
            style={{
              display: 'flex',
              background: 'var(--surface-1)',
              border: '1px solid var(--control-border)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              minHeight: '36px'
            }}
          >
            <button
              type="button"
              aria-pressed={viewMode === 'grid'}
              onClick={() => onViewModeChange('grid')}
              title="Grid view"
              style={{
                background: viewMode === 'grid' ? 'var(--surface-3)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--text-1)' : 'var(--text-3)',
                border: 'none',
                padding: '0 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => onViewModeChange('list')}
              title="List view"
              style={{
                background: viewMode === 'list' ? 'var(--surface-3)' : 'transparent',
                color: viewMode === 'list' ? 'var(--text-1)' : 'var(--text-3)',
                border: 'none',
                padding: '0 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Row: Filter Chips */}
      <div 
        role="group" 
        aria-label="Filter status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap'
        }}
      >
        {(['all', 'in-progress', 'unwatched', 'watched'] as FilterOption[]).map((filter) => {
          const isSelected = filterBy === filter;
          const labelMap: Record<FilterOption, string> = {
            'all': 'All',
            'in-progress': 'In progress',
            'unwatched': 'Unwatched',
            'watched': 'Watched'
          };
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onFilterChange(filter)}
              style={{
                background: isSelected ? 'var(--accent-soft)' : 'var(--surface-1)',
                color: isSelected ? 'var(--accent)' : 'var(--text-2)',
                border: '1px solid',
                borderColor: isSelected ? 'var(--accent)' : 'var(--control-border)',
                borderRadius: '16px',
                padding: '4px 12px',
                fontSize: '0.8rem',
                fontWeight: isSelected ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease-out'
              }}
            >
              {labelMap[filter]}
            </button>
          );
        })}
      </div>
    </div>
  );
};
