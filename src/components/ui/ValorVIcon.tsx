import React from 'react';

interface ValorVIconProps {
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ValorVIcon: React.FC<ValorVIconProps> = ({
  width = 24,
  height = 24,
  className = '',
  style
}) => (
  <svg
    viewBox="0 0 100 100"
    width={width}
    height={height}
    className={className}
    style={{
      width,
      height,
      minWidth: width,
      minHeight: height,
      flexShrink: 0,
      display: 'inline-block',
      verticalAlign: 'middle',
      filter: 'drop-shadow(0 0 6px rgba(255, 70, 85, 0.4))',
      ...style
    }}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Valor"
  >
    <defs>
      <linearGradient id="valorVGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ff4655" />
        <stop offset="55%" stopColor="#e01e37" />
        <stop offset="100%" stopColor="#8a0014" />
      </linearGradient>
      <linearGradient id="valorVRightGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ff6b7a" />
        <stop offset="100%" stopColor="#e01e37" />
      </linearGradient>
    </defs>
    {/* Left dynamic angled blade */}
    <polygon
      points="0,15 36,15 68,85 32,85"
      fill="url(#valorVGrad)"
    />
    {/* Right detached floating blade */}
    <polygon
      points="100,15 64,15 78,45"
      fill="url(#valorVRightGrad)"
    />
  </svg>
);

export default ValorVIcon;
