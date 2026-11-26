import * as React from "react";

export const DropdownMenu: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { open, setOpen } as any);
        }
        return child;
      })}
    </div>
  );
};

export const DropdownMenuTrigger: React.FC<{ asChild?: boolean; open?: boolean; setOpen?: (open: boolean) => void; children?: React.ReactNode }> = ({ asChild, open, setOpen, children }) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: (e: any) => {
        e.stopPropagation();
        if (setOpen) setOpen(!open);
      }
    } as any);
  }
  return (
    <button type="button" onClick={() => setOpen && setOpen(!open)}>
      {children}
    </button>
  );
};

export const DropdownMenuContent: React.FC<{ align?: string; className?: string; open?: boolean; setOpen?: (open: boolean) => void; children?: React.ReactNode }> = ({ align, className, open, setOpen, children }) => {
  if (!open) return null;
  return (
    <>
      <div 
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} 
        onClick={() => setOpen && setOpen(false)} 
      />
      <div 
        className={className} 
        style={{ 
          position: "absolute", 
          right: align === "end" ? 0 : "auto", 
          left: align === "end" ? "auto" : 0, 
          top: "100%", 
          marginTop: "4px", 
          zIndex: 1000,
          background: "#1c1c1c",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "6px",
          padding: "4px",
          minWidth: "140px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
        }}
      >
        {React.Children.map(children, child => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child, { setOpen } as any);
          }
          return child;
        })}
      </div>
    </>
  );
};

export const DropdownMenuItem: React.FC<{ onClick?: (e: any) => void; setOpen?: (open: boolean) => void; children?: React.ReactNode }> = ({ onClick, setOpen, children }) => {
  return (
    <div 
      className="dropdown-item"
      onClick={(e) => {
        if (onClick) onClick(e);
        if (setOpen) setOpen(false);
      }}
      style={{ 
        width: "100%", 
        textAlign: "left", 
        background: "transparent", 
        border: "none", 
        color: "#fff", 
        padding: "6px 12px", 
        fontSize: "0.8rem", 
        cursor: "pointer", 
        display: "flex", 
        alignItems: "center", 
        gap: "8px", 
        borderRadius: "4px" 
      }}
    >
      {children}
    </div>
  );
};
