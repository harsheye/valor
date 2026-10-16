import React, { useState, useEffect, useRef } from 'react';
import { X, Terminal, Trash2, Copy, ExternalLink, Check, Mail } from 'lucide-react';

interface ConsoleLog {
  id: string;
  type: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: Date;
}

interface ConsoleOverlayProps {
  onClose: () => void;
}

export const ConsoleOverlay: React.FC<ConsoleOverlayProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 380 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const externalWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    // Intercept console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    const minimizeMessage = (msg: string): string => {
      if (typeof msg !== 'string') return msg;
      if (msg.includes('[FFmpeg Command] ffmpeg')) {
        const match = msg.match(/-ss\s+([^\s]+)\s+-i\s+([^\s]+)\s+-t\s+([^\s]+)\s+-map\s+([^\s]+).*\s+([^\s]+)$/);
        if (match) {
          const [_, ss, input, t, map, output] = match;
          const getBasename = (p: string) => p.split(/[/\\]/).pop() || p;
          return `[FFmpeg Command] ffmpeg -ss ${ss} -i ${getBasename(input)} -t ${t} -map ${map} -> ${getBasename(output)} (minimized)`;
        }
      }
      return msg;
    };

    const addLog = (type: 'log' | 'warn' | 'error' | 'info', args: any[]) => {
      const rawMessage = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      const message = minimizeMessage(rawMessage);

      const newLog = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        message,
        timestamp: new Date()
      };

      setLogs(prev => [...prev, newLog].slice(-500)); // Keep last 500 logs

      // Also send to external window if detached
      if (externalWindowRef.current && !externalWindowRef.current.closed) {
        const doc = externalWindowRef.current.document;
        const container = doc.getElementById('logs-container');
        if (container) {
          const div = doc.createElement('div');
          div.className = `log ${type}`;
          div.innerHTML = `<span class="time">${newLog.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> ${newLog.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}`;
          container.appendChild(div);
          container.scrollTop = container.scrollHeight;
        }
      }
    };

    console.log = (...args) => { addLog('log', args); originalLog.apply(console, args); };
    console.warn = (...args) => { addLog('warn', args); originalWarn.apply(console, args); };
    console.error = (...args) => { addLog('error', args); originalError.apply(console, args); };
    console.info = (...args) => { addLog('info', args); originalInfo.apply(console, args); };

    addLog('info', ['[Developer Console] Attached successfully.']);

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
      if (externalWindowRef.current) {
        externalWindowRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = () => {
    const text = logs.map(l => `[${l.timestamp.toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReportError = () => {
    const errorLogs = logs.filter(l => l.type === 'error' || l.type === 'warn');
    const logsToReport = errorLogs.length > 0 ? errorLogs : logs;
    const formattedLogs = logsToReport
      .map(l => `[${l.timestamp.toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.message}`)
      .join('\n');

    const emailSubject = 'Valor Player Error Report';
    const emailBody = `Hi Developer,\n\nI encountered an issue with Valor. Here are the log details:\n\n${formattedLogs}\n\n---\nSystem Information:\nUser Agent: ${navigator.userAgent}\nPlatform: ${navigator.platform}\nTime: ${new Date().toString()}`;

    window.location.href = `mailto:leetwhitesnake0@proton.me?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  };

  const handleDetach = () => {
    const win = window.open('', 'Developer Console', 'width=600,height=800,left=200,top=200');
    if (win) {
      externalWindowRef.current = win;
      win.document.body.innerHTML = `
        <title>Developer Console</title>
        <style>
          body { background: #0f0f14; color: #fff; font-family: monospace; margin: 0; padding: 0; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; }
          .header { background: rgba(255, 255, 255, 0.05); padding: 8px 12px; display: flex; gap: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); justify-content: flex-end; }
          button { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-family: monospace; font-size: 12px; transition: background 0.2s; }
          button:hover { background: rgba(255, 255, 255, 0.1); }
          #logs-container { flex: 1; overflow-y: auto; padding: 12px; }
          .log { font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; margin-bottom: 4px; word-break: break-all; white-space: pre-wrap; }
          .time { color: rgba(255,255,255,0.3); margin-right: 8px; font-size: 11px; }
          .error { color: #ef4444; }
          .warn { color: #f59e0b; }
          .info { color: #3b82f6; }
          .log { color: #d1d5db; }
        </style>
        <div class="header">
          <button id="copy-btn">Copy</button>
          <button id="clear-btn">Clear</button>
        </div>
        <div id="logs-container">
          ${logs.map(l => `
            <div class="log ${l.type}">
              <span class="time">${l.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> ${l.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </div>
          `).join('')}
        </div>
      `;
      
      const copyBtn = win.document.getElementById('copy-btn');
      if (copyBtn) {
        copyBtn.onclick = () => {
          const text = logs.map(l => `[${l.timestamp.toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.message}`).join('\\n');
          win.navigator.clipboard.writeText(text);
          copyBtn.innerText = 'Copied!';
          setTimeout(() => { copyBtn.innerText = 'Copy'; }, 2000);
        };
      }

      const clearBtn = win.document.getElementById('clear-btn');
      if (clearBtn) {
        clearBtn.onclick = () => {
          setLogs([]);
          const container = win.document.getElementById('logs-container');
          if (container) container.innerHTML = '';
        };
      }
      // Listen for the external window closing to completely unmount
      win.addEventListener('beforeunload', () => {
        onClose();
      });
      // Hide the in-app overlay since it's now detached
      setIsDetached(true);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const [isDetached, setIsDetached] = useState(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y
        });
      }
    };
    const onMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove, { capture: true });
      window.addEventListener('mouseup', onMouseUp, { capture: true });
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove, { capture: true });
      window.removeEventListener('mouseup', onMouseUp, { capture: true });
    };
  }, [isDragging]);

  if (isDetached) {
    return null; // Keep component mounted so interceptors run, but hide in-app UI
  }

  return (
    <div style={{
      position: 'fixed',
      top: `${position.y}px`,
      left: `${position.x}px`,
      width: '450px',
      height: '350px',
      background: 'rgba(15, 15, 20, 0.95)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      fontFamily: 'monospace',
      userSelect: isDragging ? 'none' : 'auto'
    }}
    onClick={e => e.stopPropagation()}
    onContextMenu={e => {
      e.preventDefault();
      e.stopPropagation();
    }}
    onMouseDown={e => e.stopPropagation()}
    onMouseUp={e => e.stopPropagation()}
    >
      <div 
        onMouseDown={onMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(255, 255, 255, 0.05)',
          cursor: isDragging ? 'grabbing' : 'grab',
          borderTopLeftRadius: '12px',
          borderTopRightRadius: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '14px', fontWeight: 600 }}>
          <Terminal size={16} color="#4ade80" />
          Developer Console
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={handleReportError}
            style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              color: '#ef4444', 
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              fontSize: '11px',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
            title="Report errors to developer via email"
          >
            <Mail size={12} />
            <span>Report Error</span>
          </button>
          <button 
            onClick={handleCopy}
            style={{ background: 'transparent', border: 'none', color: copied ? '#4ade80' : 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Copy Logs"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button 
            onClick={() => setLogs([])}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
            title="Clear Console"
          >
            <Trash2 size={14} />
          </button>
          <button 
            onClick={handleDetach}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
            title="Pop out to new window"
          >
            <ExternalLink size={14} />
          </button>
          <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.2)' }} />
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}
      >
        {logs.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: '20px', fontSize: '13px' }}>
            Listening for logs...
          </div>
        )}
        {logs.map(log => {
          let color = '#d1d5db';
          if (log.type === 'error') color = '#ef4444';
          if (log.type === 'warn') color = '#f59e0b';
          if (log.type === 'info') color = '#3b82f6';

          return (
            <div key={log.id} style={{ 
              fontSize: '12px', 
              color, 
              lineHeight: '1.4',
              wordBreak: 'break-all',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              paddingBottom: '4px'
            }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', marginRight: '8px', fontSize: '10px' }}>
                {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              {log.message}
            </div>
          );
        })}
      </div>
    </div>
  );
};
