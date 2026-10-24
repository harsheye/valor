import React, { useEffect, useState } from 'react';

// Math helpers for generating pie slices
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * (Math.PI / 180.0);
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

function describeArc(x: number, y: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, outerRadius, endAngle);
  const end = polarToCartesian(x, y, outerRadius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);
  // Support slices > 180 degrees
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", start.x, start.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, end.x, end.y,
    "L", endInner.x, endInner.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    "Z"
  ].join(" ");
}

function describeTextArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const midAngle = startAngle + (endAngle - startAngle) / 2;
  const normalizedMid = (midAngle % 360 + 360) % 360;
  const isBottom = normalizedMid > 90 && normalizedMid < 270;
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  if (isBottom) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    return [
      "M", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(" ");
  } else {
    const start = polarToCartesian(x, y, radius, startAngle);
    const end = polarToCartesian(x, y, radius, endAngle);
    return [
      "M", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
    ].join(" ");
  }
}

export interface RadialMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  color?: string; // Hex or rgba for slice fill
  disabled?: boolean;
}

interface RadialMenuProps {
  x: number;
  y: number;
  items: RadialMenuItem[];
  centerItem?: { icon: React.ReactNode; onClick: () => void; disabled?: boolean };
  onClose: () => void;
  inline?: boolean;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ x, y, items, centerItem, onClose, inline }) => {
  const [mounted, setMounted] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  
  useEffect(() => {
    // Trigger entrance animation
    setMounted(true);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const size = 320;
  const center = size / 2;
  const innerRadius = 45;
  const outerRadius = 125;
  const sliceGap = 0;

  // Keep menu fully within viewport bounds
  const safeX = Math.max(size / 2, Math.min(window.innerWidth - size / 2, x));
  const safeY = Math.max(size / 2, Math.min(window.innerHeight - size / 2, y));

  // Max 4 outer items (1 mid + 4 on outer = 5 total)
  const displayItems = items.slice(0, 4);
  const sliceAngle = 360 / Math.max(1, displayItems.length);
  // 45 deg offset so the 4 slices align symmetrically (North, East, South, West)
  const angleOffset = displayItems.length === 4 ? 45 : displayItems.length === 3 ? 60 : 90;

  return (
    <div 
      style={{
        position: inline ? 'relative' : 'fixed',
        inset: inline ? undefined : 0,
        width: inline ? size : undefined,
        height: inline ? size : undefined,
        zIndex: inline ? 1 : 9999,
        backgroundColor: inline ? 'transparent' : 'rgba(0, 0, 0, 0.65)',
        backdropFilter: inline ? 'none' : 'blur(8px) saturate(140%)',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onContextMenu={(e) => { e.preventDefault(); if (!inline) onClose(); }}
      onClick={() => { if (!inline) onClose(); }}
      onWheel={() => { if (!inline) onClose(); }}
    >
      <style>{`
        @keyframes radialMagicPulse {
          0% { r: 44px; opacity: 0.7; stroke-width: 2px; }
          50% { r: 52px; opacity: 0.25; stroke-width: 1.5px; }
          100% { r: 60px; opacity: 0; stroke-width: 0.5px; }
        }
        @keyframes magicGlowRotate {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
        .magic-pulse-circle {
          animation: radialMagicPulse 2.4s infinite cubic-bezier(0.2, 0.8, 0.4, 1);
          pointer-events: none;
        }
        .radial-slice-path {
          transition: fill 0.2s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.2s, filter 0.2s;
        }
        .radial-slice-path:hover {
          filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.35));
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          left: inline ? 0 : safeX - center,
          top: inline ? 0 : safeY - center,
          width: size,
          height: size,
          transform: mounted ? 'scale(1) rotate(0deg)' : 'scale(0.7) rotate(-10deg)',
          opacity: mounted ? 1 : 0,
          transition: 'all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
          pointerEvents: 'none'
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <filter id="drop-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000" floodOpacity="0.8"/>
            </filter>
            <radialGradient id="center-orb-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2c2d36" />
              <stop offset="85%" stopColor="#111217" />
              <stop offset="100%" stopColor="#08080c" />
            </radialGradient>
            <radialGradient id="center-orb-hover" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#454756" />
              <stop offset="85%" stopColor="#222430" />
              <stop offset="100%" stopColor="#14151b" />
            </radialGradient>
          </defs>
          
          <g filter="url(#drop-shadow)" style={{ pointerEvents: 'auto' }}>
            {displayItems.map((item, i) => {
              const startAngle = i * sliceAngle - angleOffset + (sliceGap / 2);
              const endAngle = (i + 1) * sliceAngle - angleOffset - (sliceGap / 2);
              const pathData = describeArc(center, center, innerRadius, outerRadius, startAngle, endAngle);
              
              // Calculate center of slice for label positioning
              const midAngle = startAngle + ((endAngle - startAngle) / 2);
              const normalizedMid = (midAngle % 360 + 360) % 360;
              const isBottom = normalizedMid > 90 && normalizedMid < 270;

              const iconRadius = innerRadius + (outerRadius - innerRadius) * 0.38;
              const textRadius = innerRadius + (outerRadius - innerRadius) * 0.76;
              
              const iconPos = polarToCartesian(center, center, iconRadius, midAngle);
              const textPathId = `text-path-${item.id}`;
              const textPathData = describeTextArc(center, center, textRadius, startAngle, endAngle);
              
              const isHovered = hoveredId === item.id && !item.disabled;
              const defaultColor = 'rgba(18, 19, 24, 0.92)';
              const hoverDefaultColor = 'rgba(40, 42, 52, 0.96)';
              
              return (
                <g 
                  key={item.id}
                  onMouseEnter={() => !item.disabled && setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onMouseUp={(e) => e.stopPropagation()}
                  onMouseDown={(e) => { 
                    e.stopPropagation(); 
                    if (e.button === 0 && !item.disabled) {
                      item.onClick(); 
                      onClose(); 
                    }
                  }}
                  onContextMenu={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    if (!inline) onClose();
                  }}
                  style={{ 
                    cursor: item.disabled ? 'not-allowed' : 'pointer', 
                    opacity: item.disabled ? 0.4 : 1,
                    pointerEvents: item.disabled ? 'none' : 'auto'
                  }}
                >
                  <path
                    className="radial-slice-path"
                    d={pathData}
                    fill={item.color && isHovered ? item.color : (isHovered ? hoverDefaultColor : (item.color || defaultColor))}
                    stroke={isHovered ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.12)'}
                    strokeWidth={isHovered ? '1.5' : '1'}
                  />
                  
                  {/* Invisible path for curved text */}
                  <path id={textPathId} d={textPathData} fill="none" stroke="none" />
                  
                  {/* Curved Text */}
                  <text 
                    fill={isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.85)'}
                    fontSize="11px" 
                    fontWeight="600"
                    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    letterSpacing="0.03em"
                    textAnchor="middle"
                    style={{
                      pointerEvents: 'none',
                      transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                      transformOrigin: `${center}px ${center}px`,
                      transition: 'transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      textShadow: '0 2px 6px rgba(0,0,0,0.9)'
                    }}
                  >
                    <textPath 
                      href={`#${textPathId}`} 
                      startOffset="50%" 
                      baselineShift={isBottom ? "-3px" : "3px"}
                    >
                      {item.label}
                    </textPath>
                  </text>

                  {/* Icon */}
                  <g transform={`translate(${iconPos.x}, ${iconPos.y})`} style={{ pointerEvents: 'none' }}>
                    <foreignObject x="-20" y="-20" width="40" height="40">
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        color: isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                        transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                      }}>
                        {item.icon}
                      </div>
                    </foreignObject>
                  </g>
                </g>
              );
            })}
            
            {/* Center Action Button (Mid = Pause / Play) */}
            {centerItem && (
              <g 
                onMouseEnter={() => !centerItem.disabled && setHoveredId('center')}
                onMouseLeave={() => setHoveredId(null)}
                onMouseUp={(e) => e.stopPropagation()}
                onMouseDown={(e) => { 
                  e.stopPropagation(); 
                  if (e.button === 0 && !centerItem.disabled) {
                    centerItem.onClick(); 
                    if (!inline) onClose();
                  }
                }}
                onContextMenu={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  if (!inline) onClose();
                }}
                style={{ 
                  cursor: centerItem.disabled ? 'not-allowed' : 'pointer', 
                  opacity: centerItem.disabled ? 0.4 : 1,
                  pointerEvents: centerItem.disabled ? 'none' : 'auto'
                }}
              >
                {/* Magical pulse ring */}
                <circle 
                  className="magic-pulse-circle"
                  cx={center} 
                  cy={center} 
                  r={innerRadius} 
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.5)"
                />

                {/* Main center orb */}
                <circle 
                  cx={center} 
                  cy={center} 
                  r={innerRadius - 3} 
                  fill={hoveredId === 'center' && !centerItem.disabled ? 'url(#center-orb-hover)' : 'url(#center-orb-grad)'}
                  stroke={hoveredId === 'center' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.25)'}
                  strokeWidth="2"
                  style={{ 
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    filter: hoveredId === 'center' ? 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.4))' : 'none'
                  }}
                />
                
                <foreignObject x={center - 25} y={center - 25} width="50" height="50" style={{ pointerEvents: 'none' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    color: '#ffffff',
                    transform: hoveredId === 'center' ? 'scale(1.22)' : 'scale(1)',
                    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}>
                    {centerItem.icon}
                  </div>
                </foreignObject>
              </g>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
};
