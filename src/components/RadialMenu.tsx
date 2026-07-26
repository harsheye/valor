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
  icon: React.ReactNode;
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
  const sliceGap = 0; // Removed gap for a complete pie chart
  
  // Keep menu fully within viewport bounds
  const safeX = Math.max(size/2, Math.min(window.innerWidth - size/2, x));
  const safeY = Math.max(size/2, Math.min(window.innerHeight - size/2, y));

  const sliceAngle = 360 / items.length;
  // Offset so the first item is centered at the top
  const angleOffset = items.length === 3 ? 60 : items.length === 4 ? 45 : items.length === 6 ? 30 : 90;

  return (
    <div 
      style={{
        position: inline ? 'relative' : 'fixed',
        inset: inline ? undefined : 0,
        width: inline ? size : undefined,
        height: inline ? size : undefined,
        zIndex: inline ? 1 : 9999,
        backgroundColor: inline ? 'transparent' : 'rgba(0, 0, 0, 0.5)',
        backdropFilter: inline ? 'none' : 'blur(3px)',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
      // Context menu on the backdrop should close the menu
      onContextMenu={(e) => { e.preventDefault(); if (!inline) onClose(); }}
      onClick={() => { if (!inline) onClose(); }}
      onWheel={() => { if (!inline) onClose(); }}
    >
      <div
        style={{
          position: 'absolute',
          left: inline ? 0 : safeX - center,
          top: inline ? 0 : safeY - center,
          width: size,
          height: size,
          transform: mounted ? 'scale(1)' : 'scale(0.8)',
          opacity: mounted ? 1 : 0,
          transition: 'all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          pointerEvents: 'none' // wrapper passes through pointer events to SVG paths
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000" floodOpacity="0.6"/>
            </filter>
          </defs>
          
          <g filter="url(#drop-shadow)" style={{ pointerEvents: 'auto' }}>
            {items.map((item, i) => {
              const startAngle = i * sliceAngle - angleOffset + (sliceGap / 2);
              const endAngle = (i + 1) * sliceAngle - angleOffset - (sliceGap / 2);
              const pathData = describeArc(center, center, innerRadius, outerRadius, startAngle, endAngle);
              
              // Calculate center of slice for label positioning
              const midAngle = startAngle + ((endAngle - startAngle) / 2);
              const normalizedMid = (midAngle % 360 + 360) % 360;
              const isBottom = normalizedMid > 90 && normalizedMid < 270;

              const iconRadius = innerRadius + (outerRadius - innerRadius) * 0.35;
              const textRadius = innerRadius + (outerRadius - innerRadius) * 0.75;
              
              const iconPos = polarToCartesian(center, center, iconRadius, midAngle);
              const textPathId = `text-path-${item.id}`;
              const textPathData = describeTextArc(center, center, textRadius, startAngle, endAngle);
              
              const isHovered = hoveredId === item.id && !item.disabled;
              const defaultColor = 'rgba(28, 28, 32, 0.85)';
              const hoverDefaultColor = 'rgba(60, 60, 68, 0.95)';
              
              return (
                <g 
                  key={item.id}
                  onMouseEnter={() => !item.disabled && setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onMouseUp={(e) => e.stopPropagation()}
                  onMouseDown={(e) => { 
                    e.stopPropagation(); 
                    if (!item.disabled) {
                      item.onClick(); 
                      onClose(); 
                    }
                  }}
                  onContextMenu={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    if (!item.disabled) {
                      item.onClick(); 
                      onClose(); 
                    }
                  }}
                  style={{ 
                    cursor: item.disabled ? 'not-allowed' : 'pointer', 
                    opacity: item.disabled ? 0.4 : 1,
                    pointerEvents: item.disabled ? 'none' : 'auto'
                  }}
                >
                  <path
                    d={pathData}
                    fill={item.color && isHovered ? item.color : (isHovered ? hoverDefaultColor : (item.color || defaultColor))}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="1"
                    style={{ transition: 'fill 0.15s ease' }}
                  />
                  
                  {/* Invisible path for curved text */}
                  <path id={textPathId} d={textPathData} fill="none" stroke="none" />
                  
                  {/* Curved Text */}
                  <text 
                    fill="white" 
                    fontSize="11px" 
                    fontWeight="600"
                    fontFamily="Inter, system-ui, sans-serif"
                    textAnchor="middle"
                    style={{
                      pointerEvents: 'none',
                      transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                      transformOrigin: `${center}px ${center}px`,
                      transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                    }}
                  >
                    <textPath 
                      href={`#${textPathId}`} 
                      startOffset="50%" 
                      baselineShift={isBottom ? "-2px" : "2px"}
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
                        color: 'white',
                        transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                      }}>
                        {item.icon}
                      </div>
                    </foreignObject>
                  </g>
                </g>
              );
            })}
            
            {/* Center Action Button */}
            {centerItem && (
              <g 
                onMouseEnter={() => !centerItem.disabled && setHoveredId('center')}
                onMouseLeave={() => setHoveredId(null)}
                onMouseUp={(e) => e.stopPropagation()}
                onMouseDown={(e) => { 
                  e.stopPropagation(); 
                  if (!centerItem.disabled) {
                    centerItem.onClick(); 
                    onClose();
                  } 
                }}
                onContextMenu={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  if (!centerItem.disabled) {
                    centerItem.onClick(); 
                    onClose(); 
                  }
                }}
                style={{ 
                  cursor: centerItem.disabled ? 'not-allowed' : 'pointer', 
                  opacity: centerItem.disabled ? 0.4 : 1,
                  pointerEvents: centerItem.disabled ? 'none' : 'auto'
                }}
              >
                <circle 
                  cx={center} 
                  cy={center} 
                  r={innerRadius - 4} 
                  fill={hoveredId === 'center' && !centerItem.disabled ? 'rgba(60, 60, 68, 0.95)' : 'rgba(20, 20, 24, 0.95)'}
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth="2"
                  style={{ transition: 'fill 0.15s ease' }}
                />
                <foreignObject x={center - 25} y={center - 25} width="50" height="50" style={{ pointerEvents: 'none' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    color: 'white',
                    transform: hoveredId === 'center' ? 'scale(1.2)' : 'scale(1)',
                    transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
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
