import React from 'react';

interface ValorVIconProps {
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ValorVIcon: React.FC<ValorVIconProps> = ({
  width = 24,
  height = 26,
  className = '',
  style
}) => (
  <img
    src="/favicon.svg"
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
      ...style
    }}
    alt="Valor V"
  />
);

export default ValorVIcon;
