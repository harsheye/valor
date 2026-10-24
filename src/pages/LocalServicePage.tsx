import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Terminal, 
  Check, 
  Copy, 
  RefreshCw, 
  ShieldCheck, 
  Server, 
  Cpu, 
  Wifi, 
  HardDrive, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { sidecarService, type SidecarStatus } from '../services/remote/sidecarService';

interface LocalServicePageProps {
  onClose?: () => void;
}

export const LocalServicePage: React.FC<LocalServicePageProps> = ({ onClose }) => {
  const [status, setStatus] = useState<SidecarStatus>(sidecarService.getStatus());
  const [activeOs, setActiveOs] = useState<'windows' | 'mac' | 'node'>('windows');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheClearMessage, setCacheClearMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = sidecarService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    sidecarService.checkHealth();
    return () => unsub();
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:80';

  const commands = {
    windowsPowerShell: `irm ${origin}/api/sidecar/install.ps1 | iex`,
    macBash: `curl -fsSL ${origin}/api/sidecar/install.sh | bash`,
    nodeDirect: `curl -fsSL ${origin}/api/sidecar/valor-service.mjs -o valor-service.mjs && node valor-service.mjs`,
    windowsBat: `${origin}/api/sidecar/run.bat`
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleTestConnection = async () => {
    await sidecarService.checkHealth();
  };

  const handleClearCache = async () => {
    if (!status.isAvailable) return;
    setIsClearingCache(true);
    setCacheClearMessage(null);
    try {
      const res = await fetch(`http://127.0.0.1:${status.port}/api/sidecar/clear-cache`, { method: 'POST' });
      if (res.ok) {
        setCacheClearMessage('Cache flushed successfully!');
        await sidecarService.checkHealth();
      } else {
        setCacheClearMessage('Failed to flush cache');
      }
    } catch {
      setCacheClearMessage('Could not connect to service');
    } finally {
      setIsClearingCache(false);
      setTimeout(() => setCacheClearMessage(null), 3000);
    }
  };

  return (
    <div className="local-service-page-container" style={{
      maxWidth: '1080px',
      margin: '0 auto',
      padding: '24px 20px 60px 20px',
      color: '#e2e8f0',
      minHeight: '100%',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)'
          }}>
            <Zap size={26} color="#34d399" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
              Valor Local Companion Engine
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#94a3b8' }}>
              Zero-server-load high-performance local playback daemon
            </p>
          </div>
        </div>

        {onClose && (
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Back to Player
          </button>
        )}
      </div>

      {/* Live Status Card */}
      <div style={{
        background: status.isAvailable 
          ? 'linear-gradient(135deg, rgba(6, 78, 59, 0.45), rgba(15, 23, 42, 0.85))'
          : 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))',
        border: `1px solid ${status.isAvailable ? 'rgba(16, 185, 129, 0.4)' : 'rgba(148, 163, 184, 0.2)'}`,
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '32px',
        boxShadow: status.isAvailable ? '0 10px 30px -10px rgba(16, 185, 129, 0.3)' : '0 10px 25px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: status.isAvailable ? '#10b981' : '#64748b',
              boxShadow: status.isAvailable ? '0 0 12px #10b981' : 'none'
            }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f8fafc' }}>
                  {status.isAvailable ? 'Companion Engine Active' : 'Companion Engine Offline'}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '20px',
                  backgroundColor: status.isAvailable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                  color: status.isAvailable ? '#34d399' : '#94a3b8',
                  border: `1px solid ${status.isAvailable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`
                }}>
                  {status.isAvailable ? 'Port 45454' : 'Fallback to Central Server'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: status.isAvailable ? '#a7f3d0' : '#94a3b8' }}>
                {status.isAvailable 
                  ? 'Your video streams and chunk cache are being downloaded directly by your machine. Central server load: 0%.'
                  : 'Streams are currently relaying through the central Valor server. Install the companion below to unthrottle playback.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleTestConnection}
              disabled={status.checking}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '8px 14px',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw size={14} className={status.checking ? 'animate-spin' : ''} />
              {status.checking ? 'Checking...' : 'Check Connection'}
            </button>

            {status.isAvailable && (
              <button
                onClick={handleClearCache}
                disabled={isClearingCache}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <HardDrive size={14} />
                {isClearingCache ? 'Flushing...' : 'Flush Cache'}
              </button>
            )}
          </div>
        </div>

        {cacheClearMessage && (
          <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#34d399' }}>
            ✓ {cacheClearMessage}
          </div>
        )}

        {/* Live Metrics Grid if available */}
        {status.isAvailable && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 16px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Latency</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#34d399', marginTop: '4px' }}>
                {status.latencyMs ?? 1} ms
              </div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 16px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Memory Cache</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#38bdf8', marginTop: '4px' }}>
                {status.cacheBlocks ?? 0} blocks ({status.cacheSizeBytes ? (status.cacheSizeBytes / (1024 * 1024)).toFixed(1) : 0} MB)
              </div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 16px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Engine Version</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', marginTop: '4px' }}>
                v{status.version || '1.0.0'}
              </div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 16px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Service Status</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#4ade80', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={18} /> Active
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Installation Instructions */}
      <div style={{
        backgroundColor: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '16px',
        padding: '28px',
        marginBottom: '36px'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 6px 0', color: '#f8fafc' }}>
            Install or Run in 5 Seconds
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>
            Run the 1-click command for your operating system. It downloads the standalone daemon and launches it immediately.
          </p>
        </div>

        {/* OS Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #374151', paddingBottom: '12px', marginBottom: '20px' }}>
          <button
            onClick={() => setActiveOs('windows')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: activeOs === 'windows' ? '#2563eb' : 'transparent',
              color: activeOs === 'windows' ? '#fff' : '#94a3b8',
              border: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Windows (PowerShell)
          </button>
          <button
            onClick={() => setActiveOs('mac')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: activeOs === 'mac' ? '#2563eb' : 'transparent',
              color: activeOs === 'mac' ? '#fff' : '#94a3b8',
              border: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            macOS / Linux (Terminal)
          </button>
          <button
            onClick={() => setActiveOs('node')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: activeOs === 'node' ? '#2563eb' : 'transparent',
              color: activeOs === 'node' ? '#fff' : '#94a3b8',
              border: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Manual / Node.js
          </button>
        </div>

        {/* Tab 1: Windows */}
        {activeOs === 'windows' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Option 1: One-Click PowerShell Command (Recommended)
              </div>
              <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Press <kbd style={{ background: '#374151', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>Win + X</kbd>, select <b>Terminal</b> or <b>PowerShell</b>, and paste:
              </p>
              
              <div style={{
                position: 'relative',
                backgroundColor: '#030712',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px 50px 16px 18px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.9rem',
                color: '#38bdf8',
                wordBreak: 'break-all'
              }}>
                {commands.windowsPowerShell}
                <button
                  onClick={() => copyToClipboard(commands.windowsPowerShell, 'win-ps')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: copiedKey === 'win-ps' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    transition: 'all 0.2s'
                  }}
                  title="Copy command"
                >
                  {copiedKey === 'win-ps' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'win-ps' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #1f2937' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Option 2: Download Direct Launcher Batch File
              </div>
              <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                If you prefer downloading a runnable file, save and double-click <code>run.bat</code>:
              </p>
              <a
                href={`${origin}/api/sidecar/run.bat`}
                download="run.bat"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  color: '#60a5fa',
                  fontSize: '0.85rem',
                  textDecoration: 'none',
                  fontWeight: 500
                }}
              >
                <Terminal size={14} /> Download run.bat
              </a>
            </div>
          </div>
        )}

        {/* Tab 2: Mac / Linux */}
        {activeOs === 'mac' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                One-Click Bash Command
              </div>
              <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Open your terminal and paste the following command:
              </p>

              <div style={{
                position: 'relative',
                backgroundColor: '#030712',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px 50px 16px 18px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.9rem',
                color: '#34d399',
                wordBreak: 'break-all'
              }}>
                {commands.macBash}
                <button
                  onClick={() => copyToClipboard(commands.macBash, 'mac-bash')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: copiedKey === 'mac-bash' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    transition: 'all 0.2s'
                  }}
                  title="Copy command"
                >
                  {copiedKey === 'mac-bash' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'mac-bash' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Node direct */}
        {activeOs === 'node' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Direct Node.js Command (Zero Dependencies)
              </div>
              <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Requires Node.js 18+. Does NOT require npm or any packages installed:
              </p>

              <div style={{
                position: 'relative',
                backgroundColor: '#030712',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px 50px 16px 18px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.85rem',
                color: '#fbbf24',
                wordBreak: 'break-all'
              }}>
                {commands.nodeDirect}
                <button
                  onClick={() => copyToClipboard(commands.nodeDirect, 'node-direct')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: copiedKey === 'node-direct' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    transition: 'all 0.2s'
                  }}
                  title="Copy command"
                >
                  {copiedKey === 'node-direct' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'node-direct' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Feature / Architecture Comparison */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
        gap: '20px',
        marginBottom: '36px'
      }}>
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Server size={22} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc' }}>
              Server Relay Mode (Default)
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 16px 0' }}>
            When the companion is not running, the central server downloads all high-bitrate media blocks, stores them in temporary RAM, and forwards them to your browser.
          </p>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.825rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li>May cause buffering during high server traffic</li>
            <li>Limited by central server egress bandwidth</li>
            <li>Increases server hosting costs & CPU usage</li>
          </ul>
        </div>

        <div style={{
          backgroundColor: '#111827',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '14px',
          padding: '24px',
          background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.05), #111827)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Zap size={22} color="#10b981" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#34d399' }}>
              Companion Engine Mode (Supercharged)
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 16px 0' }}>
            Your device directly connects to the media provider, caches 2MB chunk blocks in local memory, and streams straight into the player with zero intermediaries.
          </p>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.825rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li><b style={{ color: '#34d399' }}>0% Server Load</b>: The central server bandwidth usage is zero.</li>
            <li><b style={{ color: '#34d399' }}>Instant Seek</b>: 2MB sliding chunk cache gives instant timeline jumps.</li>
            <li><b style={{ color: '#34d399' }}>Local Subtitles</b>: Extracts embedded WebVTT subtitles directly on your CPU.</li>
          </ul>
        </div>
      </div>

      {/* Security & FAQ */}
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '14px',
        padding: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <ShieldCheck size={22} color="#38bdf8" />
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc' }}>
            Privacy, Security & FAQ
          </h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
              Is the companion safe to run?
            </div>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              Yes. The companion is 100% open-source and zero-dependency. It binds exclusively to <code>127.0.0.1</code> (localhost), so nobody on your network or the internet can access it.
            </p>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
              What happens if I close the companion window?
            </div>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              Valor will automatically detect that the service is offline and seamlessly route your playback back through the central server without interrupting your video.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
