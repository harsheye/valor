import React from 'react';
import './streaming.css';

export interface CastPerson {
  id: number;
  name: string;
  role?: string;
  profilePath?: string;
}

interface CastRailProps {
  cast: CastPerson[];
  onSelectPerson: (person: CastPerson) => void;
  title?: string;
}

export const CastRail: React.FC<CastRailProps> = ({
  cast,
  onSelectPerson,
  title = 'Cast & Crew'
}) => {
  if (!cast || cast.length === 0) return null;

  return (
    <section
      aria-label={title}
      className="streaming-cast-section"
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '0 var(--space-7)',
        boxSizing: 'border-box'
      }}
    >
      <h2
        style={{
          margin: '0 0 var(--space-4) 0',
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--text-1)',
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.01em'
        }}
      >
        {title}
      </h2>

      {/* Horizontal Scroller with 14px padding & negative margin to prevent hover clip */}
      <div className="streaming-horizontal-rail">
        {cast.map((person, idx) => (
          <button
            key={`${person.id}-${idx}`}
            type="button"
            onClick={() => onSelectPerson(person)}
            aria-label={`${person.name}, ${person.role || 'Cast member'}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '92px',
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              outline: 'none',
              textAlign: 'center',
              gap: 'var(--space-2)'
            }}
          >
            {/* Circular Portrait Avatar (Cover, top anchored, on --surface-2 base) */}
            <div
              className="streaming-avatar"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface-2)',
                backgroundImage: person.profilePath ? `url("${person.profilePath}")` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'top center',
                backgroundRepeat: 'no-repeat',
                border: '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-3)',
                fontSize: '1.2rem',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                boxSizing: 'border-box'
              }}
            >
              {!person.profilePath && person.name.charAt(0)}
            </div>

            {/* Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '100%' }}>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  width: '100%'
                }}
              >
                {person.name}
              </span>

              {/* Role */}
              {person.role && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-3)',
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    width: '100%'
                  }}
                >
                  {person.role}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
