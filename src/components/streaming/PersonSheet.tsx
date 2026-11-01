import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Star, MapPin, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { SegmentedControl } from './SegmentedControl';
import { PosterCard, type PosterMediaItem } from './PosterCard';
import { PersonSheetSkeleton } from './Skeletons';
import './streaming.css';

export interface PersonProfile {
  id: number;
  name: string;
  role?: string;
  profilePath?: string;
  biography?: string;
  birthday?: string | null;
  placeOfBirth?: string | null;
  rating?: number;
  credits: PosterMediaItem[];
}

interface PersonSheetProps {
  isOpen: boolean;
  onClose: () => void;
  person: PersonProfile | null;
  loading?: boolean;
  onSelectMedia: (item: PosterMediaItem) => void;
}

export const PersonSheet: React.FC<PersonSheetProps> = ({
  isOpen,
  onClose,
  person,
  loading = false,
  onSelectMedia
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap / focus management
  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.focus();
    }
  }, [isOpen]);

  // Reset to page 1 whenever search or format filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchFilter, formatFilter]);

  // Filtered credits by live text search and format
  const filteredCredits = useMemo(() => {
    if (!person || !person.credits) return [];

    return person.credits.filter((item) => {
      // 1. Format filter
      if (formatFilter === 'movie' && item.type !== 'movie') return false;
      if (formatFilter === 'tv' && (item.type !== 'tv' && item.type !== 'series')) return false;

      // 2. Search query filter
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesYear = (item.year || '').includes(q);
        return matchesTitle || matchesYear;
      }

      return true;
    });
  }, [person, formatFilter, searchFilter]);

  // Paged response slicing
  const totalPages = Math.max(1, Math.ceil(filteredCredits.length / pageSize));
  const paginatedCredits = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCredits.slice(start, start + pageSize);
  }, [filteredCredits, currentPage, pageSize]);

  if (!isOpen) return null;

  return (
    <>
      {/* Scrim Backdrop (Fades over 300ms) */}
      <div
        className={`person-sheet-scrim ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Right-Side Sheet (Max 860px, slides in over 450ms) */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-sheet-name"
        tabIndex={-1}
        className={`person-sheet-container ${isOpen ? 'open' : ''}`}
      >
        {/* Floating Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close person details"
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'var(--surface-2)',
            border: '1px solid var(--control-border)',
            color: 'var(--text-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-2)'; }}
        >
          <X size={18} />
        </button>

        {loading || !person ? (
          <PersonSheetSkeleton />
        ) : (
          <div
            className="animate-rise"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 280px) 1fr',
              gap: 'var(--space-6)',
              padding: 'var(--space-6)',
              boxSizing: 'border-box',
              minHeight: '100%'
            }}
          >
            {/* Left Column: Portrait, Name, Role chip, Rating, Born, Birthplace */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Portrait (Cover, top anchored, on --surface-2 base) */}
              <div
                style={{
                  width: '100%',
                  aspectRatio: '2/3',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--surface-2)',
                  backgroundImage: person.profilePath ? `url("${person.profilePath}")` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'top center',
                  backgroundRepeat: 'no-repeat',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-3)',
                  fontSize: '2.5rem',
                  fontWeight: 700
                }}
              >
                {!person.profilePath && person.name.charAt(0)}
              </div>

              {/* Name */}
              <h2
                id="person-sheet-name"
                style={{
                  margin: 0,
                  fontSize: '1.45rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-1)',
                  lineHeight: 1.2
                }}
              >
                {person.name}
              </h2>

              {/* Role Chip */}
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    border: '1px solid var(--control-border)'
                  }}
                >
                  {person.role || 'Acting'}
                </span>
              </div>

              {/* Rating */}
              {person.rating !== undefined && person.rating > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', color: 'var(--text-2)' }}>
                  <Star size={16} fill="var(--warning)" color="var(--warning)" />
                  <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                    {person.rating.toFixed(1)}
                  </span>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>Average Rating</span>
                </div>
              )}

              {/* Born & Birthplace */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: '0.82rem', color: 'var(--text-2)' }}>
                {person.birthday && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={14} style={{ color: 'var(--text-3)' }} />
                    <span>Born: {person.birthday}</span>
                  </div>
                )}
                {person.placeOfBirth && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <MapPin size={14} style={{ color: 'var(--text-3)', marginTop: '2px', flexShrink: 0 }} />
                    <span>{person.placeOfBirth}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: "Known for (n)", live text filter, format segmented control, poster grid, paged navigation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
              {/* Header with Title and Format Segmented Control (paddingRight: 48px to prevent overlap with X button) */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                  paddingRight: '48px'
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    color: 'var(--text-1)'
                  }}
                >
                  Known for ({filteredCredits.length})
                </h3>

                <SegmentedControl
                  value={formatFilter}
                  onChange={(val) => setFormatFilter(val as any)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'movie', label: 'Movies' },
                    { value: 'tv', label: 'TV' }
                  ]}
                  size="sm"
                  ariaLabel="Format filter"
                />
              </div>

              {/* Live Text Filter Input */}
              <div style={{ position: 'relative', width: '100%' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-3)',
                    pointerEvents: 'none'
                  }}
                />
                <input
                  type="text"
                  placeholder="Filter known titles..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--control-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-1)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Poster Grid */}
              {filteredCredits.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--space-7) var(--space-4)',
                    textAlign: 'center',
                    color: 'var(--text-3)',
                    fontSize: '0.9rem',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border)'
                  }}
                >
                  No titles match your filter.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
                      gap: 'var(--space-3)',
                      width: '100%'
                    }}
                  >
                    {paginatedCredits.map((credit, idx) => (
                      <PosterCard
                        key={`${credit.id}-${idx}`}
                        item={credit}
                        onClick={() => onSelectMedia(credit)}
                        index={idx}
                      />
                    ))}
                  </div>

                  {/* Paged Response Pagination */}
                  {totalPages > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--space-3)',
                        marginTop: 'var(--space-4)',
                        paddingTop: 'var(--space-3)',
                        borderTop: '1px solid var(--border)'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'var(--surface-2)',
                          color: currentPage === 1 ? 'var(--text-3)' : 'var(--text-1)',
                          border: '1px solid var(--control-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '6px 14px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                          opacity: currentPage === 1 ? 0.45 : 1
                        }}
                      >
                        <ChevronLeft size={14} /> Previous
                      </button>

                      <span
                        style={{
                          fontSize: '0.82rem',
                          color: 'var(--text-2)',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        Page {currentPage} of {totalPages}
                      </span>

                      <button
                        type="button"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'var(--surface-2)',
                          color: currentPage === totalPages ? 'var(--text-3)' : 'var(--text-1)',
                          border: '1px solid var(--control-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '6px 14px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                          opacity: currentPage === totalPages ? 0.45 : 1
                        }}
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
