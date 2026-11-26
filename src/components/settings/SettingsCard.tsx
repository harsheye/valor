import React from 'react';

export interface SettingsCardProps {
  title?: string;
  description?: string;
  badge?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
  title,
  description,
  badge,
  headerAction,
  children,
  className = '',
  id,
}) => {
  return (
    <section id={id} className={`settings-card ${className}`}>
      {(title || description || headerAction) && (
        <div className="settings-card-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            {title && (
              <h3 className="settings-card-title">
                {title}
                {badge && <span style={{ marginLeft: '8px' }}>{badge}</span>}
              </h3>
            )}
            {headerAction && <div>{headerAction}</div>}
          </div>
          {description && <p className="settings-card-desc">{description}</p>}
        </div>
      )}
      <div className="settings-card-rows">
        {children}
      </div>
    </section>
  );
};
