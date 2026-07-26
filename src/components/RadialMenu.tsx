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
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ x, y, items, centerItem, onClose }) => {
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
  const sliceGap = 2; // Gap in degrees between slices for aesthetic styling
  
  // Keep menu fully within viewport bounds
  const safeX = Math.max(size/2, Math.min(window.innerWidth - size/2, x));
  const safeY = Math.max(size/2, Math.min(window.innerHeight - size/2, y));

  const sliceAngle = 360 / items.length;
  // Offset so the first item is centered at the top
  const angleOffset = items.length === 3 ? 60 : items.length === 4 ? 45 : items.length === 6 ? 30 : 90;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(3px)',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
      // Context menu on the backdrop should close the menu
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      onClick={onClose}
      onWheel={onClose}
    >
      <div
        style={{
          position: 'absolute',
          left: safeX - center,
          top: safeY - center,
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
              const labelRadius = innerRadius + (outerRadius - innerRadius) / 2;
              const labelPos = polarToCartesian(center, center, labelRadius, midAngle);
              
              const isHovered = hoveredId === item.id && !item.disabled;
              const defaultColor = 'rgba(28, 28, 32, 0.85)';
              const hoverDefaultColor = 'rgba(60, 60, 68, 0.95)';
              
              return (
                <g 
                  key={item.id}
                  onMouseEnter={() => !item.disabled && setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => { 
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
                  style={{ cursor: item.disabled ? 'not-allowed' : 'pointer', opacity: item.disabled ? 0.4 : 1 }}
                >
                  <path
                    d={pathData}
                    fill={item.color && isHovered ? item.color : (isHovered ? hoverDefaultColor : (item.color || defaultColor))}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="1"
                    style={{ transition: 'fill 0.15s ease' }}
                  />
                  
                  <g transform={`translate(${labelPos.x}, ${labelPos.y})`} style={{ pointerEvents: 'none' }}>
                    <foreignObject x="-45" y="-35" width="90" height="70">
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        color: 'white',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                      }}>
                        {item.icon}
                        <span style={{ 
                          fontSize: '11px', 
                          marginTop: '6px', 
                          fontWeight: 600, 
                          textAlign: 'center', 
                          textShadow: '0 2px 4px rgba(0,0,0,0.8)' 
                        }}>
                          {item.label}
                        </span>
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
                onClick={(e) => { 
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
                style={{ cursor: centerItem.disabled ? 'not-allowed' : 'pointer', opacity: centerItem.disabled ? 0.4 : 1 }}
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
