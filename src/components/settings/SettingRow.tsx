import React from 'react';

export interface SettingRowProps {
  title: string;
  description?: string;
  control?: React.ReactNode;
  pinned?: boolean;
  destructive?: boolean;
  className?: string;
  id?: string;
  children?: React.ReactNode;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  title,
  description,
  control,
  pinned = false,
  className = '',
  id,
  children,
}) => {
  return (
    <div
      id={id}
      className={`setting-row ${pinned ? 'pinned' : ''} ${className}`}
    >
      <div className="setting-row-text">
        <span className="setting-row-title">{title}</span>
        {description && <span className="setting-row-desc">{description}</span>}
      </div>
      <div className="setting-row-control">
        {control}
        {children}
      </div>
    </div>
  );
};
